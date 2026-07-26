import "server-only";
import { all } from "./db";

/**
 * NETRA Predictive Intelligence — deterministic, explainable models.
 *
 * Every prediction returns a confidence score, the factors behind it,
 * and the records it was derived from (the brief's Explainable-AI rule:
 * no black-box decisions). In production these same signals can feed
 * Catalyst Zia AutoML / QuickML models without changing the UI.
 */

const DAY = 86400000;

export interface HotspotForecast {
  district: string;
  recent: number;        // FIRs in the last 60 days
  baselineMonthly: number;
  trend: "rising" | "stable" | "cooling";
  ratio: number;         // recent monthly rate vs baseline
  confidence: number;
  reasoning: string;
}

export function hotspotForecasts(): HotspotForecast[] {
  const since60 = new Date(Date.now() - 60 * DAY).toISOString();
  const since300 = new Date(Date.now() - 300 * DAY).toISOString();

  const recent = new Map(
    all<{ district: string; n: number }>(
      "SELECT district, COUNT(*) n FROM firs WHERE occurred_at >= ? GROUP BY district",
      [since60]
    ).map((r) => [r.district, r.n])
  );
  const baseline = all<{ district: string; n: number }>(
    "SELECT district, COUNT(*) n FROM firs WHERE occurred_at >= ? AND occurred_at < ? GROUP BY district",
    [since300, since60]
  );

  const out: HotspotForecast[] = [];
  for (const b of baseline) {
    const rec = recent.get(b.district) || 0;
    const recMonthly = rec / 2;              // 60 days ≈ 2 months
    const baseMonthly = b.n / 8;             // 240 days ≈ 8 months
    const ratio = baseMonthly > 0 ? recMonthly / baseMonthly : rec > 0 ? 2 : 1;
    const trend = ratio >= 1.25 ? "rising" : ratio <= 0.75 ? "cooling" : "stable";
    // Confidence grows with sample size, capped — small samples stay humble.
    const confidence = Math.min(0.9, 0.45 + (rec + b.n) / 120);
    out.push({
      district: b.district,
      recent: rec,
      baselineMonthly: Math.round(baseMonthly * 10) / 10,
      trend,
      ratio: Math.round(ratio * 100) / 100,
      confidence: Math.round(confidence * 100) / 100,
      reasoning: `${rec} FIRs in the last 60 days vs a baseline of ~${(baseMonthly).toFixed(1)}/month over the prior 8 months (ratio ${ratio.toFixed(2)}).`,
    });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

export interface RepeatOffenderPrediction {
  id: number;
  name: string;
  home_district: string;
  risk_score: number;
  fir_count: number;
  days_since_last: number | null;
  probability: number;   // 0..1 — likelihood of reoffending
  factors: string[];
  evidence: string[];    // CrimeNos used
}

export function repeatOffenderPredictions(limit = 15): RepeatOffenderPrediction[] {
  const rows = all<{
    id: number; name: string; home_district: string; risk_score: number;
    fir_count: number; districts: number; last_seen: string | null;
  }>(
    `SELECT c.id, c.name, c.home_district, c.risk_score,
            COUNT(fc.fir_id) AS fir_count,
            COUNT(DISTINCT f.district) AS districts,
            MAX(f.occurred_at) AS last_seen
     FROM criminals c
     JOIN fir_criminals fc ON fc.criminal_id = c.id
     JOIN firs f ON f.id = fc.fir_id
     GROUP BY c.id HAVING fir_count >= 2
     ORDER BY fir_count DESC, c.risk_score DESC LIMIT ?`,
    [limit]
  );

  return rows.map((r) => {
    const daysSince = r.last_seen ? Math.floor((Date.now() - new Date(r.last_seen).getTime()) / DAY) : null;
    const factors: string[] = [];
    let p = 0.08;
    p += Math.min(r.fir_count, 6) * 0.11;
    factors.push(`${r.fir_count} prior FIRs on record`);
    if (daysSince != null && daysSince < 120) { p += 0.2; factors.push(`active recently (last incident ${daysSince}d ago)`); }
    else if (daysSince != null && daysSince < 300) { p += 0.1; factors.push(`last incident ${daysSince}d ago`); }
    if (r.districts > 1) { p += 0.07; factors.push(`operates across ${r.districts} districts`); }
    p += r.risk_score / 500;
    factors.push(`AI risk score ${r.risk_score}/100`);
    p = Math.min(0.96, Math.round(p * 100) / 100);

    const evidence = all<{ fir_number: string }>(
      `SELECT f.fir_number FROM firs f JOIN fir_criminals fc ON fc.fir_id=f.id WHERE fc.criminal_id=? ORDER BY f.occurred_at DESC LIMIT 4`,
      [r.id]
    ).map((x) => x.fir_number);

    return {
      id: r.id, name: r.name, home_district: r.home_district, risk_score: r.risk_score,
      fir_count: r.fir_count, days_since_last: daysSince, probability: p, factors, evidence,
    };
  }).sort((a, b) => b.probability - a.probability);
}

export interface EscalationWarning {
  id: number;
  name: string;
  detail: string;
  confidence: number;
  evidence: string[];
}

/** Criminals whose recent offenses are more severe than their earlier ones. */
export function escalationWarnings(limit = 8): EscalationWarning[] {
  const rows = all<{ id: number; name: string; early: number; late: number; n: number }>(
    `SELECT c.id, c.name,
       AVG(CASE WHEN f.occurred_at <  ? THEN sevRank(f.severity) END) AS early,
       AVG(CASE WHEN f.occurred_at >= ? THEN sevRank(f.severity) END) AS late,
       COUNT(*) AS n
     FROM criminals c
     JOIN fir_criminals fc ON fc.criminal_id=c.id
     JOIN firs f ON f.id=fc.fir_id
     GROUP BY c.id HAVING n >= 2 AND early IS NOT NULL AND late IS NOT NULL AND late > early
     ORDER BY (late-early) DESC LIMIT ?`
      .replace(/sevRank\(f\.severity\)/g, "CASE f.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END"),
    [new Date(Date.now() - 180 * DAY).toISOString(), new Date(Date.now() - 180 * DAY).toISOString(), limit]
  );

  return rows.map((r) => {
    const evidence = all<{ fir_number: string; severity: string }>(
      `SELECT f.fir_number, f.severity FROM firs f JOIN fir_criminals fc ON fc.fir_id=f.id WHERE fc.criminal_id=? ORDER BY f.occurred_at DESC LIMIT 4`,
      [r.id]
    );
    return {
      id: r.id,
      name: r.name,
      detail: `Offense severity trending upward: recent incidents average ${r.late.toFixed(1)} vs ${r.early.toFixed(1)} earlier (1=low … 4=critical) across ${r.n} FIRs.`,
      confidence: Math.min(0.85, 0.5 + r.n * 0.06),
      evidence: evidence.map((e) => `${e.fir_number} (${e.severity})`),
    };
  });
}

export interface CrimeTypeForecast {
  crime_type: string;
  recent: number;
  baselineMonthly: number;
  ratio: number;
  trend: "rising" | "stable" | "cooling";
}

export function crimeTypeForecasts(): CrimeTypeForecast[] {
  const since60 = new Date(Date.now() - 60 * DAY).toISOString();
  const since300 = new Date(Date.now() - 300 * DAY).toISOString();
  const recent = new Map(
    all<{ t: string; n: number }>("SELECT crime_type t, COUNT(*) n FROM firs WHERE occurred_at >= ? GROUP BY t", [since60]).map((r) => [r.t, r.n])
  );
  const base = all<{ t: string; n: number }>(
    "SELECT crime_type t, COUNT(*) n FROM firs WHERE occurred_at >= ? AND occurred_at < ? GROUP BY t",
    [since300, since60]
  );
  return base
    .map((b) => {
      const rec = recent.get(b.t) || 0;
      const ratio = b.n > 0 ? rec / 2 / (b.n / 8) : rec > 0 ? 2 : 1;
      return {
        crime_type: b.t,
        recent: rec,
        baselineMonthly: Math.round((b.n / 8) * 10) / 10,
        ratio: Math.round(ratio * 100) / 100,
        trend: (ratio >= 1.25 ? "rising" : ratio <= 0.75 ? "cooling" : "stable") as CrimeTypeForecast["trend"],
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}
