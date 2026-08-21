"use client";
/**
 * Cloud Scale data layer — the ONLY data source for the app pages.
 *
 * Every page reads through the Catalyst Function (`records` mode → Data Store).
 * Nothing here touches the old baked SQLite snapshot. When a table is empty or
 * not provisioned, fetchers return [] and pages render their empty states.
 *
 * Data Store column names are owned by whoever loads the tables, so mapping is
 * defensive (tries several field names). Adjust the keys here to match the
 * actual columns once the schema is fixed.
 *
 * ponytail: stats are computed client-side over the first ≤200 rows the
 * `records` mode returns. Fine while data is small/empty; add ZCQL COUNT/GROUP
 * modes to the Function when the dataset outgrows a single page.
 */
import { listRecords } from "./ai-client";
import type { CaseRow } from "@/components/cases/CasesList";
import type { CrimRow } from "@/components/criminals/CriminalsList";
import type { FirPoint, DistrictAgg } from "@/components/maps/CrimeMap";

type Row = Record<string, unknown>;
const str = (r: Row, ...k: string[]) => { for (const x of k) if (r[x] != null) return String(r[x]); return ""; };
const num = (r: Row, ...k: string[]) => { for (const x of k) if (r[x] != null) { const n = Number(r[x]); if (!Number.isNaN(n)) return n; } return 0; };

export async function fetchCases(): Promise<CaseRow[]> {
  const rows = await listRecords("Cases", 200);
  return rows.map((r, i) => ({
    id: num(r, "ROWID", "id") || i + 1,
    case_number: str(r, "case_number", "CaseNo", "CrimeNo"),
    title: str(r, "title", "Title", "BriefFacts"),
    status: str(r, "status", "CaseStatus") || "registered",
    priority: str(r, "priority", "Priority") || "medium",
    district: str(r, "district", "District"),
    updated_at: str(r, "updated_at", "CREATEDTIME", "MODIFIEDTIME"),
    crime_type: str(r, "crime_type", "CrimeType", "CrimeHeadName"),
    officer: str(r, "officer", "Officer", "IO"),
  }));
}

export async function fetchCriminals(): Promise<CrimRow[]> {
  const rows = await listRecords("Criminals", 200);
  return rows.map((r, i) => ({
    id: num(r, "ROWID", "id") || i + 1,
    name: str(r, "name", "Name", "AccusedName"),
    aliases: str(r, "aliases", "Aliases"),
    age: num(r, "age", "Age"),
    gender: str(r, "gender", "Gender") || "M",
    status: str(r, "status", "Status") || "at_large",
    risk_score: num(r, "risk_score", "RiskScore"),
    crime_category: str(r, "crime_category", "CrimeCategory"),
    home_district: str(r, "home_district", "HomeDistrict", "District"),
    fir_count: num(r, "fir_count", "FirCount"),
    arrest_count: num(r, "arrest_count", "ArrestCount"),
  })) as CrimRow[];
}

export async function fetchFirs(): Promise<Row[]> {
  return listRecords("Firs", 200);
}

export function toGeoPoints(firs: Row[]): FirPoint[] {
  return firs
    .map((r, i) => ({
      id: num(r, "ROWID", "id") || i + 1,
      fir_number: str(r, "fir_number", "CrimeNo", "CaseNo"),
      crime_type: str(r, "crime_type", "CrimeType", "CrimeHeadName"),
      district: str(r, "district", "District"),
      severity: str(r, "severity", "Severity") || "medium",
      lat: num(r, "lat", "latitude", "Latitude"),
      lng: num(r, "lng", "longitude", "Longitude"),
    }))
    .filter((p) => p.lat && p.lng);
}

export interface MapsData {
  points: FirPoint[];
  districts: DistrictAgg[];
  crimeTypes: string[];
  hotspots: { district: string; cases: number }[];
}

/** Geo points + district aggregates + crime types, all from Cloud Scale. */
export async function fetchMaps(): Promise<MapsData> {
  const points = toGeoPoints(await fetchFirs());
  const byDist = new Map<string, { n: number; lat: number; lng: number; types: Map<string, number> }>();
  const crimeTypes = new Set<string>();
  for (const p of points) {
    crimeTypes.add(p.crime_type);
    const cur = byDist.get(p.district) || { n: 0, lat: 0, lng: 0, types: new Map() };
    cur.n += 1; cur.lat += p.lat; cur.lng += p.lng;
    cur.types.set(p.crime_type, (cur.types.get(p.crime_type) || 0) + 1);
    byDist.set(p.district, cur);
  }
  const districts: DistrictAgg[] = [...byDist.entries()].map(([district, v]) => ({
    district, cases: v.n, lat: v.lat / v.n, lng: v.lng / v.n,
    top_crime: [...v.types.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "",
  }));
  const hotspots = districts.map((d) => ({ district: d.district, cases: d.cases })).sort((a, b) => b.cases - a.cases);
  return { points, districts, crimeTypes: [...crimeTypes].filter(Boolean).sort(), hotspots };
}

export interface HeatWindow { key: string; label: string; count: number; delta: number }
export interface Velocity { open: number; active: number; closed: number; escalated: number; avgClosureDays: number }
export interface Confidence { dataQuality: number; caseLinkage: number; patternSignal: number; extractionReadiness: number; overall: number }

export interface DashboardData {
  stats: { activeCases: number; critical: number; totalFirs: number; atLarge: number; arrests30: number; solveRate: number };
  trend: { month: string; cases: number }[];
  byType: { crime_type: string; count: number }[];
  hotspots: { district: string; cases: number }[];
  geo: FirPoint[];
  heat: HeatWindow[];
  velocity: Velocity;
  confidence: Confidence;
}

const firTime = (f: Row): number => { const t = Date.parse(str(f, "occurred_at", "IncidentFromDate", "CREATEDTIME")); return Number.isNaN(t) ? 0 : t; };

/** Trailing-window FIR counts anchored to the newest FIR, each vs the previous equal window. */
function crimeHeatEvolution(firs: Row[]): HeatWindow[] {
  const windows = [
    { key: "24h", label: "24 hours", days: 1 },
    { key: "7d", label: "7 days", days: 7 },
    { key: "30d", label: "30 days", days: 30 },
    { key: "6mo", label: "6 months", days: 182 },
  ];
  const times = firs.map(firTime).filter(Boolean);
  if (!times.length) return windows.map((w) => ({ key: w.key, label: w.label, count: 0, delta: 0 }));
  const anchor = Math.max(...times);
  return windows.map((w) => {
    const span = w.days * 86400000;
    const cur = times.filter((t) => t >= anchor - span && t <= anchor).length;
    const prev = times.filter((t) => t >= anchor - 2 * span && t < anchor - span).length;
    const delta = prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);
    return { key: w.key, label: w.label, count: cur, delta };
  });
}

/** Case throughput from status/priority. avgClosureDays is 0 until Data Store carries closure timestamps. */
function investigationVelocity(cases: CaseRow[]): Velocity {
  const openS = (s: string) => s === "registered" || s === "under_investigation";
  return {
    open: cases.filter((c) => openS(c.status)).length,
    active: cases.filter((c) => c.status === "under_investigation").length,
    closed: cases.filter((c) => c.status === "closed" || c.status === "charge_sheeted").length,
    escalated: cases.filter((c) => c.priority === "critical" && openS(c.status)).length,
    avgClosureDays: 0,
  };
}

/** Honest record-completeness/linkage signals over the FIR rows — not a fabricated model score. */
function intelligenceConfidence(firs: Row[]): Confidence {
  const n = firs.length;
  if (!n) return { dataQuality: 0, caseLinkage: 0, patternSignal: 0, extractionReadiness: 0, overall: 0 };
  const has = (f: Row, ...k: string[]) => str(f, ...k).trim() !== "";
  const frac = (p: (f: Row) => boolean) => firs.filter(p).length / n;
  const dataQuality = frac((f) => has(f, "description", "Description", "BriefFacts") && num(f, "lat", "latitude", "Latitude") !== 0);
  const caseLinkage = frac((f) => has(f, "case_number", "CaseNo", "CrimeNo"));
  const patternSignal = frac((f) => has(f, "modus", "ModusOperandi", "crime_type", "CrimeType"));
  const extractionReadiness = frac((f) => has(f, "ipc_sections", "IPCSections", "sections") && has(f, "description", "Description", "BriefFacts"));
  return { dataQuality, caseLinkage, patternSignal, extractionReadiness, overall: (dataQuality + caseLinkage + patternSignal + extractionReadiness) / 4 };
}

/** Pull the base tables and derive the dashboard stats client-side. */
export async function fetchDashboard(): Promise<DashboardData> {
  const [firs, cases, criminals] = await Promise.all([fetchFirs(), fetchCases(), fetchCriminals()]);
  const active = cases.filter((c) => c.status === "registered" || c.status === "under_investigation");
  const solved = cases.filter((c) => c.status === "charge_sheeted" || c.status === "closed");
  const byMonth = new Map<string, number>();
  const byType = new Map<string, number>();
  const byDist = new Map<string, number>();
  for (const f of firs) {
    const month = str(f, "occurred_at", "IncidentFromDate", "CREATEDTIME").slice(0, 7);
    if (month) byMonth.set(month, (byMonth.get(month) || 0) + 1);
    const ct = str(f, "crime_type", "CrimeType", "CrimeHeadName") || "Unknown";
    byType.set(ct, (byType.get(ct) || 0) + 1);
    const d = str(f, "district", "District");
    if (d) byDist.set(d, (byDist.get(d) || 0) + 1);
  }
  return {
    stats: {
      activeCases: active.length,
      critical: active.filter((c) => c.priority === "critical").length,
      totalFirs: firs.length,
      atLarge: criminals.filter((c) => c.status === "at_large").length,
      arrests30: 0,
      solveRate: cases.length ? Math.round((solved.length / cases.length) * 100) : 0,
    },
    trend: [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, cases]) => ({ month, cases })),
    byType: [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([crime_type, count]) => ({ crime_type, count })),
    hotspots: [...byDist.entries()].sort((a, b) => b[1] - a[1]).map(([district, cases]) => ({ district, cases })),
    geo: toGeoPoints(firs),
    heat: crimeHeatEvolution(firs),
    velocity: investigationVelocity(cases),
    confidence: intelligenceConfidence(firs),
  };
}
