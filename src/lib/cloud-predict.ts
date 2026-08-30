"use client";

import { listRecords } from "./ai-client";

type Row = Record<string, unknown>;
const DAY = 86400000;
const s = (row: Row, key: string) => String(row[key] ?? "");
const n = (row: Row, key: string) => Number(row[key] ?? 0);
const time = (row: Row, key: string) => Date.parse(s(row, key)) || 0;

export interface CloudPredictionData {
  hotspots: { district: string; recent: number; baselineMonthly: number; trend: "rising" | "stable" | "cooling"; ratio: number; confidence: number; reasoning: string }[];
  repeat: { id: number; name: string; home_district: string; risk_score: number; fir_count: number; days_since_last: number | null; district_count: number; probability: number; factors: string[]; evidence: string[] }[];
  escalations: { id: number; name: string; detail: string; confidence: number; evidence: string[] }[];
  types: { crime_type: string; recent: number; baselineMonthly: number; ratio: number; trend: "rising" | "stable" | "cooling" }[];
  model: "explainable-baseline" | "zia-automl";
  automlAuditIds?: string[];
}

export async function fetchCloudPredictions(): Promise<CloudPredictionData> {
  const [firs, criminals, links] = await Promise.all([
    listRecords("Firs", 5000), listRecords("Criminals", 5000), listRecords("FirCriminals", 5000),
  ]);
  const validTimes = firs.map((row) => time(row, "occurred_at")).filter(Boolean);
  const anchor = validTimes.length ? Math.max(...validTimes) : Date.now();
  const firById = new Map(firs.map((row) => [n(row, "id"), row]));
  const linksByCriminal = new Map<number, Row[]>();
  for (const link of links) {
    const id = n(link, "criminal_id");
    const list = linksByCriminal.get(id) || [];
    list.push(link); linksByCriminal.set(id, list);
  }

  const momentum = (field: "district" | "crime_type") => {
    const groups = new Map<string, { recent: number; baseline: number }>();
    for (const fir of firs) {
      const key = s(fir, field) || "Unknown";
      const occurred = time(fir, "occurred_at");
      const group = groups.get(key) || { recent: 0, baseline: 0 };
      if (occurred >= anchor - 60 * DAY) group.recent += 1;
      else if (occurred >= anchor - 300 * DAY) group.baseline += 1;
      groups.set(key, group);
    }
    return [...groups.entries()].filter(([, value]) => value.recent || value.baseline).map(([key, value]) => {
      const baselineMonthly = value.baseline / 8;
      const ratio = baselineMonthly ? value.recent / 2 / baselineMonthly : value.recent ? 2 : 1;
      const trend = (ratio >= 1.25 ? "rising" : ratio <= 0.75 ? "cooling" : "stable") as "rising" | "stable" | "cooling";
      return { key, recent: value.recent, baselineMonthly: Math.round(baselineMonthly * 10) / 10, ratio: Math.round(ratio * 100) / 100, trend, sample: value.recent + value.baseline };
    }).sort((a, b) => b.ratio - a.ratio);
  };
  const districtMomentum = momentum("district");
  const typeMomentum = momentum("crime_type");
  const hotspots = districtMomentum.map((item) => ({
    district: item.key, recent: item.recent, baselineMonthly: item.baselineMonthly, trend: item.trend, ratio: item.ratio,
    confidence: Math.round(Math.min(0.9, 0.45 + item.sample / 120) * 100) / 100,
    reasoning: `${item.recent} FIRs in the latest 60 days vs a baseline of ~${item.baselineMonthly.toFixed(1)}/month over the prior 8 months (ratio ${item.ratio.toFixed(2)}).`,
  }));
  const types = typeMomentum.map((item) => ({ crime_type: item.key, recent: item.recent, baselineMonthly: item.baselineMonthly, ratio: item.ratio, trend: item.trend }));

  const repeat = criminals.flatMap((criminal) => {
    const id = n(criminal, "id");
    const linkedFirs = (linksByCriminal.get(id) || []).map((link) => firById.get(n(link, "fir_id"))).filter(Boolean) as Row[];
    if (linkedFirs.length < 2) return [];
    const last = Math.max(...linkedFirs.map((fir) => time(fir, "occurred_at")));
    const daysSince = last ? Math.max(0, Math.floor((anchor - last) / DAY)) : null;
    const districts = new Set(linkedFirs.map((fir) => s(fir, "district")).filter(Boolean)).size;
    const factors = [`${linkedFirs.length} prior FIRs on record`];
    let probability = 0.08 + Math.min(linkedFirs.length, 6) * 0.11;
    if (daysSince != null && daysSince < 120) { probability += 0.2; factors.push(`active recently (last incident ${daysSince}d ago)`); }
    else if (daysSince != null && daysSince < 300) { probability += 0.1; factors.push(`last incident ${daysSince}d ago`); }
    if (districts > 1) { probability += 0.07; factors.push(`operates across ${districts} districts`); }
    const risk = n(criminal, "risk_score"); probability += risk / 500; factors.push(`risk score ${risk}/100`);
    return [{
      id, name: s(criminal, "name"), home_district: s(criminal, "home_district"), risk_score: risk,
      fir_count: linkedFirs.length, days_since_last: daysSince, district_count: districts,
      probability: Math.min(0.96, Math.round(probability * 100) / 100), factors,
      evidence: linkedFirs.sort((a, b) => time(b, "occurred_at") - time(a, "occurred_at")).slice(0, 4).map((fir) => s(fir, "fir_number")),
    }];
  }).sort((a, b) => b.probability - a.probability).slice(0, 12);

  const severityRank: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  const severity = (value: string) => severityRank[value.toLowerCase()] || 1;
  const escalations = criminals.flatMap((criminal) => {
    const id = n(criminal, "id");
    const linked = (linksByCriminal.get(id) || []).map((link) => firById.get(n(link, "fir_id"))).filter(Boolean) as Row[];
    const early = linked.filter((fir) => time(fir, "occurred_at") < anchor - 180 * DAY);
    const late = linked.filter((fir) => time(fir, "occurred_at") >= anchor - 180 * DAY);
    if (!early.length || !late.length) return [];
    const earlyAvg = early.reduce((sum, fir) => sum + severity(s(fir, "severity")), 0) / early.length;
    const lateAvg = late.reduce((sum, fir) => sum + severity(s(fir, "severity")), 0) / late.length;
    if (lateAvg <= earlyAvg) return [];
    return [{
      id, name: s(criminal, "name"),
      detail: `Offense severity trending upward: recent incidents average ${lateAvg.toFixed(1)} vs ${earlyAvg.toFixed(1)} earlier (1=low to 4=critical) across ${linked.length} FIRs.`,
      confidence: Math.min(0.85, 0.5 + linked.length * 0.06),
      evidence: [...linked].sort((a, b) => time(b, "occurred_at") - time(a, "occurred_at")).slice(0, 4).map((fir) => `${s(fir, "fir_number")} (${s(fir, "severity")})`),
    }];
  }).slice(0, 8);
  return { hotspots, repeat, escalations, types, model: "explainable-baseline" };
}
