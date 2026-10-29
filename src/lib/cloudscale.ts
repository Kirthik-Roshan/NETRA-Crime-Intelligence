"use client";
/**
 * Cloud Scale data layer for the operational pages.
 *
 * Every page reads through the Catalyst Function (`records` mode → Data Store).
 * Core records are read from virtual investigator views generated from the 28
 * official KSP tables. No legacy operational snapshot is used as a fallback.
 *
 * Field mapping accepts both the read-model names and their official-schema
 * equivalents so the UI remains resilient while displaying the KSP records.
 */
import { listRecordBundle, listRecords } from "./ai-client";
import type { CaseRow } from "@/components/cases/CasesList";
import type { CrimRow } from "@/components/criminals/CriminalsList";
import type { FirPoint, DistrictAgg } from "@/components/maps/CrimeMap";

type Row = Record<string, unknown>;
const str = (r: Row, ...k: string[]) => { for (const x of k) if (r[x] != null) return String(r[x]); return ""; };
const num = (r: Row, ...k: string[]) => { for (const x of k) if (r[x] != null) { const n = Number(r[x]); if (!Number.isNaN(n)) return n; } return 0; };

async function records(table: string, max: number, refresh = false): Promise<Row[]> {
  return listRecords(table, max, refresh);
}

export async function fetchCases(refresh = false): Promise<CaseRow[]> {
  const rows = await records("Cases", 1000, refresh);
  return rows.map((r, i) => ({
    id: num(r, "id", "ROWID") || i + 1,
    case_number: str(r, "case_number", "CaseNo", "CrimeNo"),
    title: str(r, "title", "Title", "BriefFacts"),
    status: str(r, "status", "CaseStatus") || "registered",
    priority: str(r, "case_priority", "priority", "Priority") || "medium",
    district: str(r, "district", "District"),
    updated_at: str(r, "updated_at", "CREATEDTIME", "MODIFIEDTIME"),
    crime_type: str(r, "crime_type", "CrimeType", "CrimeHeadName"),
    officer: str(r, "officer", "Officer", "IO"),
  }));
}

export async function fetchCriminals(refresh = false): Promise<CrimRow[]> {
  const rows = await records("Criminals", 1000, refresh);
  return rows.map((r, i) => ({
    id: num(r, "id", "ROWID") || i + 1,
    name: str(r, "name", "Name", "AccusedName"),
    aliases: str(r, "aliases", "Aliases"),
    age: num(r, "age", "Age"),
    gender: str(r, "gender", "Gender") || "M",
    status: str(r, "status", "Status") || "no_arrest_record",
    risk_score: num(r, "risk_score", "RiskScore"),
    crime_category: str(r, "crime_category", "CrimeCategory"),
    home_district: str(r, "home_district", "HomeDistrict", "District"),
    fir_count: num(r, "fir_count", "FirCount"),
    arrest_count: num(r, "arrest_count", "ArrestCount"),
  })) as CrimRow[];
}

export async function fetchFirs(refresh = false): Promise<Row[]> {
  return records("Firs", 1000, refresh);
}

export function toGeoPoints(firs: Row[]): FirPoint[] {
  return firs
    .map((r, i) => ({
      id: num(r, "id", "ROWID") || i + 1,
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

export interface IntelligenceDimensions {
  victimGender: { label: string; count: number }[];
  victimAgeBands: { label: string; count: number }[];
  complainantGender: { label: string; count: number }[];
  complainantAgeBands: { label: string; count: number }[];
  complainantOccupations: { label: string; count: number }[];
  complainantReligions: { label: string; count: number }[];
  complainantCastes: { label: string; count: number }[];
  incidentSettings: { label: string; count: number }[];
  vulnerability: { minors: number; seniors: number; policePersonnel: number };
  coverage: { label: string; status: "available" | "proxy" | "not-supplied"; source: string }[];
  entities: { victims: number; complainants: number; relationships: number; stations: number };
}

export async function fetchIntelligenceDimensions(): Promise<IntelligenceDimensions> {
  const bundle = await listRecordBundle(["Victims", "Complainants", "Relationships", "PoliceStations", "Firs"], true);
  const victims = bundle.Victims || [];
  const complainants = bundle.Complainants || [];
  const relationships = bundle.Relationships || [];
  const stations = bundle.PoliceStations || [];
  const firs = bundle.Firs || [];
  const group = (rows: Row[], keys: string[], fallback: string) => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const value = str(row, ...keys).trim() || fallback;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  };
  const ageBand = (age: number) => age <= 0 ? "Not stated"
    : age < 18 ? "Under 18"
      : age < 25 ? "18-24"
        : age < 35 ? "25-34"
          : age < 45 ? "35-44"
            : age < 60 ? "45-59" : "60+";
  const withAgeBands = (rows: Row[]) => rows.map((row) => ({ age_band: ageBand(num(row, "age", "AgeYear")) }));
  const settingRows = firs.map((row) => {
    const narrative = `${str(row, "location")} ${str(row, "description")}`.toLowerCase();
    const setting = /\b(rural|village)\b/.test(narrative) ? "Rural narrative"
      : /\b(urban|city|metro)\b/.test(narrative) ? "Urban narrative"
        : "Not classified";
    return { setting };
  });
  return {
    victimGender: group(victims, ["gender", "Gender"], "Not stated"),
    victimAgeBands: group(withAgeBands(victims), ["age_band"], "Not stated"),
    complainantGender: group(complainants, ["gender", "Gender"], "Not stated"),
    complainantAgeBands: group(withAgeBands(complainants), ["age_band"], "Not stated"),
    complainantOccupations: group(complainants, ["occupation", "Occupation"], "Not stated"),
    complainantReligions: group(complainants, ["religion", "Religion"], "Not stated"),
    complainantCastes: group(complainants, ["caste", "Caste"], "Not stated"),
    incidentSettings: group(settingRows, ["setting"], "Not classified"),
    vulnerability: {
      minors: victims.filter((row) => { const age = num(row, "age", "AgeYear"); return age > 0 && age < 18; }).length,
      seniors: victims.filter((row) => num(row, "age", "AgeYear") >= 60).length,
      policePersonnel: victims.filter((row) => ["1", "true"].includes(str(row, "police_personnel", "VictimPolice").toLowerCase())).length,
    },
    coverage: [
      { label: "Age and gender", status: "available", source: "Victim, ComplainantDetails" },
      { label: "Occupation, religion and caste", status: "available", source: "Organizer lookup tables" },
      { label: "Urban or rural setting", status: "proxy", source: "Case narrative wording" },
      { label: "Education, migration and income", status: "not-supplied", source: "Not present in the 28-table schema" },
      { label: "Financial accounts and transactions", status: "not-supplied", source: "Requires an approved source extension" },
      { label: "Public-event calendar", status: "not-supplied", source: "Required for event attribution" },
    ],
    entities: { victims: victims.length, complainants: complainants.length, relationships: relationships.length, stations: stations.length },
  };
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
export async function fetchDashboard(refresh = true): Promise<DashboardData> {
  const bundle = await listRecordBundle(["Firs", "Cases", "Criminals", "Arrests"], refresh);
  const firs = bundle.Firs || [];
  const cases = (bundle.Cases || []).map((r, i) => ({
    id: num(r, "id", "ROWID") || i + 1,
    case_number: str(r, "case_number", "CaseNo", "CrimeNo"),
    title: str(r, "title", "Title", "BriefFacts"),
    status: str(r, "status", "CaseStatus") || "registered",
    priority: str(r, "case_priority", "priority", "Priority") || "medium",
    district: str(r, "district", "District"),
    updated_at: str(r, "updated_at", "CREATEDTIME", "MODIFIEDTIME"),
    crime_type: str(r, "crime_type", "CrimeType", "CrimeHeadName"),
    officer: str(r, "officer", "Officer", "IO"),
  })) as CaseRow[];
  const criminals = (bundle.Criminals || []).map((r, i) => ({
    id: num(r, "id", "ROWID") || i + 1,
    name: str(r, "name", "Name", "AccusedName"),
    aliases: str(r, "aliases", "Aliases"),
    age: num(r, "age", "Age"),
    gender: str(r, "gender", "Gender") || "M",
    status: str(r, "status", "Status") || "no_arrest_record",
    risk_score: num(r, "risk_score", "RiskScore"),
    crime_category: str(r, "crime_category", "CrimeCategory"),
    home_district: str(r, "home_district", "HomeDistrict", "District"),
    fir_count: num(r, "fir_count", "FirCount"),
    arrest_count: num(r, "arrest_count", "ArrestCount"),
  })) as CrimRow[];
  const arrests = bundle.Arrests || [];
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
      atLarge: criminals.filter((c) => c.status === "no_arrest_record").length,
      arrests30: (() => {
        const dates = arrests.map((row) => Date.parse(str(row, "arrested_at", "ArrestedAt", "CREATEDTIME"))).filter((value) => !Number.isNaN(value));
        if (!dates.length) return 0;
        const anchor = Math.max(...dates);
        return dates.filter((value) => value >= anchor - 30 * 86400000).length;
      })(),
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
