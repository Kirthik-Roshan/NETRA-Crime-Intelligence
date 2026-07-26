import { all } from "./db";
import { audit, newRequestId } from "./audit";
import { catalystConfigured, quickmlChat, quickmlRag, LLM_MODEL } from "./catalyst";
import { semanticSearch, similarFirs } from "./embeddings";
import { entityLookup, looksLikeLookup } from "./lookup";
import type { AiInsight, SessionUser } from "./types";

/* ────────────────────────────────────────────────────────────
   Reference vocab for intent + entity extraction (fast path).
   English + Kannada (ಕನ್ನಡ) + common transliterations.
   Kannada district stems are written WITHOUT the final vowel
   sign so inflected forms also match (ಮೈಸೂರು / ಮೈಸೂರಿನಲ್ಲಿ).
   ──────────────────────────────────────────────────────────── */
const DISTRICTS = [
  "Bengaluru Urban", "Mysuru", "Dakshina Kannada", "Hubballi-Dharwad", "Belagavi",
  "Kalaburagi", "Ballari", "Vijayapura", "Shivamogga", "Tumakuru", "Udupi", "Mandya",
];
const DISTRICT_ALIASES: Record<string, string> = {
  bengaluru: "Bengaluru Urban", bangalore: "Bengaluru Urban", blr: "Bengaluru Urban",
  mysuru: "Mysuru", mysore: "Mysuru", mangaluru: "Dakshina Kannada", mangalore: "Dakshina Kannada",
  hubballi: "Hubballi-Dharwad", hubli: "Hubballi-Dharwad", dharwad: "Hubballi-Dharwad",
  belagavi: "Belagavi", belgaum: "Belagavi", kalaburagi: "Kalaburagi", gulbarga: "Kalaburagi",
  ballari: "Ballari", bellary: "Ballari", vijayapura: "Vijayapura", bijapur: "Vijayapura",
  shivamogga: "Shivamogga", shimoga: "Shivamogga", tumakuru: "Tumakuru", tumkur: "Tumakuru",
  udupi: "Udupi", mandya: "Mandya",
  // Kannada stems
  "ಬೆಂಗಳೂರ": "Bengaluru Urban", "ಮೈಸೂರ": "Mysuru", "ಮಂಗಳೂರ": "Dakshina Kannada",
  "ಹುಬ್ಬಳ್ಳಿ": "Hubballi-Dharwad", "ಧಾರವಾಡ": "Hubballi-Dharwad", "ಬೆಳಗಾವ": "Belagavi",
  "ಕಲಬುರಗ": "Kalaburagi", "ಬಳ್ಳಾರಿ": "Ballari", "ವಿಜಯಪುರ": "Vijayapura",
  "ಶಿವಮೊಗ್ಗ": "Shivamogga", "ತುಮಕೂರ": "Tumakuru", "ಉಡುಪಿ": "Udupi", "ಮಂಡ್ಯ": "Mandya",
};
const CRIME_TYPES = [
  "Burglary", "House Theft", "Chain Snatching", "Vehicle Theft", "Robbery", "Dacoity",
  "Murder", "Attempt to Murder", "Assault", "Cheating & Fraud", "Cybercrime",
  "Drug Trafficking", "Kidnapping", "Extortion", "Rioting", "Counterfeiting",
];
// Order matters: multi-word / more specific aliases first.
const CRIME_ALIASES: Record<string, string> = {
  "ವಾಹನ ಕಳ್ಳತನ": "Vehicle Theft", "ಸರಗಳ್ಳತನ": "Chain Snatching", "ಮನೆ ಕಳ್ಳತನ": "House Theft",
  "vehicle theft": "Vehicle Theft", "chain snatch": "Chain Snatching", "fake currency": "Counterfeiting",
  "break in": "Burglary", burglary: "Burglary", snatching: "Chain Snatching",
  motorcycle: "Vehicle Theft", bike: "Vehicle Theft", car: "Vehicle Theft", stolen: "Vehicle Theft",
  robbery: "Robbery", dacoity: "Dacoity", murder: "Murder", homicide: "Murder",
  assault: "Assault", fraud: "Cheating & Fraud", cheating: "Cheating & Fraud",
  cyber: "Cybercrime", online: "Cybercrime", upi: "Cybercrime",
  drug: "Drug Trafficking", ndps: "Drug Trafficking", narcotic: "Drug Trafficking",
  kidnap: "Kidnapping", extortion: "Extortion", riot: "Rioting", counterfeit: "Counterfeiting",
  theft: "House Theft",
  // Kannada
  "ಕೊಲೆ": "Murder", "ದರೋಡೆ": "Robbery", "ವಂಚನೆ": "Cheating & Fraud", "ಸೈಬರ್": "Cybercrime",
  "ಮಾದಕ": "Drug Trafficking", "ಅಪಹರಣ": "Kidnapping", "ಹಲ್ಲೆ": "Assault", "ಸುಲಿಗೆ": "Extortion",
  "ಗಲಭೆ": "Rioting", "ಕಳ್ಳತನ": "House Theft",
};

interface Entities {
  district?: string;
  crimeType?: string;
  months?: number;
}

// Match a keyword: ASCII aliases match on token boundaries (so "upi" does not
// fire inside "udupi", "car" not inside "cardamom"); Kannada — which has no
// ASCII word boundaries — falls back to substring containment.
function hasKeyword(q: string, k: string): boolean {
  if (/^[\x20-\x7F]+$/.test(k)) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`, "i").test(q);
  }
  return q.includes(k);
}

// Districts present in the DB (incl. any imported via the admin CSV importer),
// cached briefly so freshly-imported districts become conversational without a
// DB hit on every query.
let _dbDistricts: { at: number; names: string[] } | null = null;
function dbDistricts(): string[] {
  const now = _dbDistricts?.at ?? 0;
  // 30s TTL; extract() runs server-side so Date.now() is available here.
  if (_dbDistricts && Date.now() - now < 30000) return _dbDistricts.names;
  try {
    const rows = all<{ DistrictName: string }>("SELECT DistrictName FROM District WHERE Active=1");
    _dbDistricts = { at: Date.now(), names: rows.map((r) => r.DistrictName).filter(Boolean) };
  } catch {
    _dbDistricts = { at: Date.now(), names: [] };
  }
  return _dbDistricts.names;
}

function extract(qRaw: string): Entities {
  const q = qRaw.toLowerCase();
  const e: Entities = {};
  for (const [k, v] of Object.entries(DISTRICT_ALIASES)) if (hasKeyword(q, k)) { e.district = v; break; }
  if (!e.district) for (const d of DISTRICTS) if (hasKeyword(q, d.toLowerCase())) { e.district = d; break; }
  // Fall back to any district in the DB (covers imported districts).
  if (!e.district) for (const d of dbDistricts()) if (!DISTRICTS.includes(d) && hasKeyword(q, d.toLowerCase())) { e.district = d; break; }
  for (const [k, v] of Object.entries(CRIME_ALIASES)) if (hasKeyword(q, k)) { e.crimeType = v; break; }
  if (!e.crimeType) for (const c of CRIME_TYPES) if (hasKeyword(q, c.toLowerCase())) { e.crimeType = c; break; }
  const m = q.match(/(\d+)\s*(month|months|week|weeks|day|days|year|years|ತಿಂಗಳ|ವರ್ಷ)/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2];
    e.months = unit.startsWith("year") || unit.startsWith("ವರ್ಷ") ? n * 12
      : unit.startsWith("week") ? Math.max(1, Math.round(n / 4))
      : unit.startsWith("day") ? Math.max(1, Math.round(n / 30))
      : n;
  } else if (/last six months|ಆರು ತಿಂಗಳ/.test(q)) e.months = 6;
  return e;
}

/* ── Conversation memory: inherit missing entities from earlier turns
     when the new query reads like a follow-up.  ─────────────────── */
const FOLLOWUP_RE = /(what about|how about|\band\b|also|there|those|these|same|more|compare|ಅಲ್ಲಿ|ಅದೇ|ಮತ್ತು)/i;

function mergeContext(query: string, cur: Entities, history: string[]): { merged: Entities; notes: string[] } {
  const notes: string[] = [];
  const isFollowUp = FOLLOWUP_RE.test(query) || query.trim().split(/\s+/).length <= 5;
  if (!history.length || !isFollowUp) return { merged: cur, notes };
  const hist: Entities = {};
  for (const h of history) {
    const e = extract(h); // oldest → newest, newer wins
    if (e.district) hist.district = e.district;
    if (e.crimeType) hist.crimeType = e.crimeType;
    if (e.months) hist.months = e.months;
  }
  const merged = { ...cur };
  if (!merged.district && hist.district) { merged.district = hist.district; notes.push(`district: ${hist.district} (carried from earlier in this conversation)`); }
  if (!merged.crimeType && hist.crimeType) { merged.crimeType = hist.crimeType; notes.push(`crime type: ${hist.crimeType} (carried from earlier in this conversation)`); }
  if (!merged.months && hist.months) { merged.months = hist.months; notes.push(`time window: last ${hist.months} months (carried forward)`); }
  return { merged, notes };
}

function sinceIso(months: number): string {
  return new Date(Date.now() - months * 30 * 86400000).toISOString();
}

/* ────────────────────────────────────────────────────────────
   Template library — reliable, fast, no LLM required.
   ──────────────────────────────────────────────────────────── */
interface TemplateResult {
  sql: string;
  params: unknown[];
  answer: (rows: Record<string, unknown>[]) => string;
  chart?: AiInsight["chart"];
  evidenceKey?: string;
  reasoning: string;
}

function matchTemplate(q: string, e: Entities): TemplateResult | null {
  const s = q.toLowerCase();

  // Summarize a specific FIR / CrimeNo
  if (/summar|ಸಾರಾಂಶ/.test(s) && /fir|case|crime|ಪ್ರಕರಣ/.test(s)) {
    const num = s.match(/(\d{4,})/)?.[1];
    if (num) {
      return {
        sql: `SELECT fir_number, crime_type, district, ipc_sections, status, severity, modus, occurred_at, description FROM firs WHERE id = ? OR fir_number LIKE ? LIMIT 1`,
        params: [Number(num), `%${num}%`],
        reasoning: "Direct FIR lookup by CaseMaster ID / CrimeNo, then structured summary of the official record.",
        answer: (r) =>
          r.length
            ? `FIR ${r[0].fir_number}: a ${String(r[0].crime_type).toLowerCase()} case in ${r[0].district} (${r[0].ipc_sections}), currently ${String(r[0].status).replace(/_/g, " ")}. Severity ${r[0].severity}. Modus operandi: ${String(r[0].modus).replace(/_/g, " ")}.`
            : `No FIR found matching "${num}".`,
      };
    }
  }

  // Repeat offenders
  if (/repeat offend|repeat crimin|habitual|reoffend|ಪುನರಾವರ್ತಿತ/.test(s)) {
    const where = e.district ? "WHERE f.district = ?" : "";
    return {
      sql: `SELECT c.id, c.name, c.home_district, c.risk_score, COUNT(fc.fir_id) AS fir_count
            FROM criminals c JOIN fir_criminals fc ON fc.criminal_id = c.id
            JOIN firs f ON f.id = fc.fir_id ${where}
            GROUP BY c.id HAVING fir_count > 1 ORDER BY fir_count DESC, c.risk_score DESC LIMIT 25`,
      params: e.district ? [e.district] : [],
      evidenceKey: "name",
      reasoning: `Resolved Accused records to criminal profiles, grouped FIR involvement per person${e.district ? ` within ${e.district}` : ""}, flagged those in more than one FIR.`,
      answer: (r) => `Found ${r.length} repeat offender${r.length === 1 ? "" : "s"}${e.district ? ` in ${e.district}` : ""}. Top: ${r.slice(0, 3).map((x) => `${x.name} (${x.fir_count} FIRs)`).join(", ") || "none"}.`,
      chart: { kind: "bar", x: "name", y: "fir_count" },
    };
  }

  // Suspects across multiple districts
  if (/multiple district|across district|inter.?district|several district/.test(s)) {
    return {
      sql: `SELECT c.name, c.risk_score, COUNT(DISTINCT f.district) AS districts
            FROM criminals c JOIN fir_criminals fc ON fc.criminal_id = c.id
            JOIN firs f ON f.id = fc.fir_id
            GROUP BY c.id HAVING districts > 1 ORDER BY districts DESC, c.risk_score DESC LIMIT 25`,
      params: [],
      evidenceKey: "name",
      reasoning: "Counted distinct FIR districts per resolved criminal profile to surface cross-jurisdictional actors.",
      answer: (r) => `${r.length} suspects appear across multiple districts. ${r[0] ? `${r[0].name} spans ${r[0].districts} districts.` : ""}`,
      chart: { kind: "bar", x: "name", y: "districts" },
    };
  }

  // High-risk criminals
  if (/high.?risk|most dangerous|dangerous|top crimin|risky|ಅಪಾಯಕಾರಿ/.test(s)) {
    return {
      sql: `SELECT name, risk_score, crime_category, status, home_district FROM criminals ORDER BY risk_score DESC LIMIT 20`,
      params: [],
      evidenceKey: "name",
      reasoning: "Ranked criminal profiles by AI-computed risk score (offense history, spread, recency).",
      answer: (r) => `Highest-risk individuals: ${r.slice(0, 3).map((x) => `${x.name} (${x.risk_score})`).join(", ")}.`,
      chart: { kind: "bar", x: "name", y: "risk_score" },
    };
  }

  // Police-station workload (official Unit + CaseMaster tables directly)
  if (/police station|station.*(most|register|load)|which unit/.test(s)) {
    return {
      sql: `SELECT u.UnitName AS station, d.DistrictName AS district, COUNT(*) AS cases
            FROM CaseMaster cm JOIN Unit u ON u.UnitID = cm.PoliceStationID
            LEFT JOIN District d ON d.DistrictID = u.DistrictID
            GROUP BY u.UnitID ORDER BY cases DESC LIMIT 15`,
      params: [],
      evidenceKey: "station",
      reasoning: "Aggregated CaseMaster records per police station (official Unit table) to rank registration workload.",
      answer: (r) => `Busiest station: ${r[0]?.station} (${r[0]?.cases} FIRs). ${r[1] ? `Then ${r[1].station}.` : ""}`,
      chart: { kind: "bar", x: "station", y: "cases" },
    };
  }

  // Socio-demographic insight (official ComplainantDetails lookups)
  if (/occupation|socio|demograph|complainant/.test(s)) {
    return {
      sql: `SELECT COALESCE(o.OccupationName,'Not Stated') AS occupation, COUNT(*) AS complainants
            FROM ComplainantDetails cd LEFT JOIN OccupationMaster o ON o.OccupationID = cd.OccupationID
            GROUP BY occupation ORDER BY complainants DESC`,
      params: [],
      evidenceKey: "occupation",
      reasoning: "Grouped official ComplainantDetails by OccupationMaster lookup — socio-demographic distribution of who reports crime.",
      answer: (r) => `Most frequent complainant occupation: ${r[0]?.occupation} (${r[0]?.complainants} complaints), followed by ${r[1]?.occupation ?? "—"}.`,
      chart: { kind: "bar", x: "occupation", y: "complainants" },
    };
  }

  // Crime trend over time
  if (/trend|over time|by month|monthly|timeline of|ಪ್ರವೃತ್ತಿ/.test(s)) {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (e.crimeType) { conds.push("crime_type = ?"); params.push(e.crimeType); }
    if (e.district) { conds.push("district = ?"); params.push(e.district); }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    return {
      sql: `SELECT substr(occurred_at,1,7) AS month, COUNT(*) AS cases FROM firs ${where} GROUP BY month ORDER BY month`,
      params,
      reasoning: "Aggregated FIRs by calendar month (IncidentFromDate) to reveal the temporal trend.",
      answer: (r) => `Monthly ${e.crimeType || "crime"} trend${e.district ? ` in ${e.district}` : ""} across ${r.length} months. Peak: ${r.reduce((a, b) => ((b.cases as number) > (a.cases as number) ? b : a), r[0] || {}).month || "n/a"}.`,
      chart: { kind: "line", x: "month", y: "cases" },
    };
  }

  // Hotspots / district ranking
  if (/hotspot|which district|top district|district.*(most|high)|most crime|ಹಾಟ್‌ಸ್ಪಾಟ್/.test(s)) {
    return {
      sql: `SELECT district, COUNT(*) AS cases FROM firs ${e.crimeType ? "WHERE crime_type = ?" : ""} GROUP BY district ORDER BY cases DESC LIMIT 15`,
      params: e.crimeType ? [e.crimeType] : [],
      evidenceKey: "district",
      reasoning: "Counted FIRs per district to rank geographic concentration (hotspots).",
      answer: (r) => `Top hotspot${e.crimeType ? ` for ${e.crimeType}` : ""}: ${r[0]?.district} (${r[0]?.cases} cases). ${r[1] ? `Followed by ${r[1].district}.` : ""}`,
      chart: { kind: "bar", x: "district", y: "cases" },
    };
  }

  // Gangs / organized crime
  if (/gang|organi[sz]ed|organi[sz]ation|syndicate|network of|ಗ್ಯಾಂಗ್/.test(s)) {
    return {
      sql: `SELECT o.name, o.type, o.district, COUNT(om.criminal_id) AS members
            FROM organizations o LEFT JOIN org_members om ON om.org_id = o.id
            GROUP BY o.id ORDER BY members DESC`,
      params: [],
      evidenceKey: "name",
      reasoning: "Enumerated known organized groups and member counts from the intelligence network graph.",
      answer: (r) => `${r.length} organized groups tracked. Largest: ${r[0]?.name} (${r[0]?.members} members, ${r[0]?.district}).`,
      chart: { kind: "bar", x: "name", y: "members" },
    };
  }

  // Arrests / surrenders
  if (/arrest|surrender|ಬಂಧನ/.test(s)) {
    return {
      sql: `SELECT c.name, a.arrested_at, a.district, a.arrest_type FROM arrests a
            JOIN criminals c ON c.id = a.criminal_id ${e.district ? "WHERE a.district = ?" : ""}
            ORDER BY a.arrested_at DESC LIMIT 40`,
      params: e.district ? [e.district] : [],
      evidenceKey: "name",
      reasoning: "Retrieved official ArrestSurrender records joined to resolved criminal identities.",
      answer: (r) => `${r.length} recent arrest/surrender events${e.district ? ` in ${e.district}` : ""} returned (${r.filter((x) => x.arrest_type === "surrender").length} surrenders).`,
    };
  }

  // Chargesheets
  if (/chargesheet|charge sheet|final report/.test(s)) {
    return {
      sql: `SELECT cm.CrimeNo AS fir_number, cs.csdate, CASE cs.cstype WHEN 'A' THEN 'Chargesheet' WHEN 'B' THEN 'False Case' ELSE 'Undetected' END AS final_report
            FROM ChargesheetDetails cs JOIN CaseMaster cm ON cm.CaseMasterID = cs.CaseMasterID
            ORDER BY cs.csdate DESC LIMIT 40`,
      params: [],
      evidenceKey: "fir_number",
      reasoning: "Read official ChargesheetDetails (final report type A/B/C) joined to CaseMaster.",
      answer: (r) => `${r.length} chargesheet records. ${r.filter((x) => x.final_report === "Chargesheet").length} filed as chargesheets (type A).`,
    };
  }

  // Open / active cases
  if (/open case|active case|pending case|recent case|ongoing|under investigation/.test(s)) {
    return {
      sql: `SELECT case_number, title, status, priority, district, updated_at FROM cases
            WHERE status IN ('registered','under_investigation') ${e.district ? "AND district = ?" : ""}
            ORDER BY (priority='critical') DESC, updated_at DESC LIMIT 40`,
      params: e.district ? [e.district] : [],
      evidenceKey: "case_number",
      reasoning: "Filtered the live caseload (Registered / Under Investigation), prioritizing critical cases.",
      answer: (r) => `${r.length} active cases${e.district ? ` in ${e.district}` : ""}. ${r.filter((x) => x.priority === "critical").length} are critical.`,
    };
  }

  // Count questions
  if (/(how many|number of|count of|total|ಎಷ್ಟು)/.test(s) && (e.crimeType || e.district)) {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (e.crimeType) { conds.push("crime_type = ?"); params.push(e.crimeType); }
    if (e.district) { conds.push("district = ?"); params.push(e.district); }
    if (e.months) { conds.push("occurred_at >= ?"); params.push(sinceIso(e.months)); }
    return {
      sql: `SELECT COUNT(*) AS total FROM firs WHERE ${conds.join(" AND ")}`,
      params,
      reasoning: "Counted matching FIRs with the extracted filters.",
      answer: (r) => `${r[0]?.total ?? 0} ${e.crimeType || "crime"} FIRs${e.district ? ` in ${e.district}` : ""}${e.months ? ` in the last ${e.months} months` : ""}.`,
    };
  }

  // Crime type (+ district/time) listing — the most common investigator query
  if (e.crimeType || e.district) {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (e.crimeType) { conds.push("crime_type = ?"); params.push(e.crimeType); }
    if (e.district) { conds.push("district = ?"); params.push(e.district); }
    if (e.months) { conds.push("occurred_at >= ?"); params.push(sinceIso(e.months)); }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    return {
      sql: `SELECT fir_number, crime_type, district, severity, status, modus, occurred_at FROM firs ${where} ORDER BY occurred_at DESC LIMIT 50`,
      params,
      evidenceKey: "fir_number",
      reasoning: `Filtered FIRs by ${[e.crimeType && "crime type", e.district && "district", e.months && "time window"].filter(Boolean).join(", ")}.`,
      answer: (r) => `${r.length} ${e.crimeType || ""} FIRs${e.district ? ` in ${e.district}` : ""}${e.months ? ` (last ${e.months} months)` : ""}. Most recent: ${r[0]?.fir_number || "none"}.`,
    };
  }

  return null;
}

/* ────────────────────────────────────────────────────────────
   SQL safety validation — SELECT-only, whitelisted tables.
   Official KSP tables + compatibility views + intel layer.
   ──────────────────────────────────────────────────────────── */
const SAFE_TABLES = new Set([
  // official KSP FIR schema
  "casemaster", "complainantdetails", "actsectionassociation", "victim", "accused",
  "arrestsurrender", "inv_arrestsurrenderaccused", "chargesheetdetails", "inv_occurancetime",
  "act", "section", "crimeheadactsection", "crimehead", "crimesubhead", "castemaster",
  "religionmaster", "occupationmaster", "casestatusmaster", "court", "district", "state",
  "unit", "unittype", "rank", "designation", "employee", "casecategory", "gravityoffence",
  // compatibility views
  "firs", "cases", "criminals", "fir_criminals", "arrests", "victims", "complainants",
  "police_stations", "evidence", "phones", "vehicles", "addresses", "weapons",
  "organizations", "org_members", "relationships",
  // intel layer
  "intel_criminals", "intel_accused_link", "intel_case_enrichment", "intel_evidence",
  "intel_phones", "intel_vehicles", "intel_addresses", "intel_weapons",
  "intel_organizations", "intel_org_members", "intel_relationships",
]);
const BLOCKED = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex)\b/i;
// Sensitive tables that must never be reachable via the LLM path, even though
// some (users, audit_logs) exist in the database.
const DENY_TABLES = new Set(["users", "audit_logs", "sqlite_master", "sqlite_sequence"]);

export function validateSql(sqlRaw: string): { ok: boolean; sql?: string; error?: string } {
  let sql = sqlRaw.trim().replace(/```sql|```/gi, "").trim();
  sql = sql.replace(/;+\s*$/, "").trim(); // drop trailing semicolon(s)
  if (!/^select\b/i.test(sql)) return { ok: false, error: "Only SELECT queries are permitted." };
  if (sql.includes(";")) return { ok: false, error: "Multiple statements are not permitted." };
  // Quoted / bracketed identifiers (\"users\", `users`, [users]) can smuggle a
  // non-whitelisted table past the name check — our schema needs none, so ban them.
  if (/["`[\]]/.test(sql)) return { ok: false, error: "Quoted identifiers are not permitted." };
  if (BLOCKED.test(sql.replace(/^select/i, ""))) return { ok: false, error: "Blocked keyword detected." };
  const tables = [...sql.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)/gi)].map((m) => m[1].toLowerCase());
  for (const t of tables) {
    if (DENY_TABLES.has(t) || !SAFE_TABLES.has(t)) return { ok: false, error: `Table not permitted: ${t}` };
  }
  if (!/\blimit\b/i.test(sql)) sql += " LIMIT 50";
  return { ok: true, sql };
}

// Schema hint given to the LLM — the OFFICIAL KSP tables plus the
// investigator-friendly views (which are usually simpler to query).
const SCHEMA_HINT = `Official KSP tables:
CaseMaster(CaseMasterID,CrimeNo,CaseNo,CrimeRegisteredDate,PolicePersonID,PoliceStationID,CaseCategoryID,GravityOffenceID,CrimeMajorHeadID,CrimeMinorHeadID,CaseStatusID,CourtID,IncidentFromDate,IncidentToDate,InfoReceivedPSDate,latitude,longitude,BriefFacts)
Accused(AccusedMasterID,CaseMasterID,AccusedName,AgeYear,GenderID,PersonID) Victim(VictimMasterID,CaseMasterID,VictimName,AgeYear,GenderID)
ComplainantDetails(ComplainantID,CaseMasterID,ComplainantName,AgeYear,OccupationID,ReligionID,CasteID,GenderID)
ArrestSurrender(ArrestSurrenderID,CaseMasterID,ArrestSurrenderTypeID,ArrestSurrenderDate,ArrestSurrenderDistrictId,PoliceStationID,IOID,AccusedMasterID)
ChargesheetDetails(CSID,CaseMasterID,csdate,cstype) ActSectionAssociation(CaseMasterID,ActID,SectionID)
Unit(UnitID,UnitName,DistrictID) District(DistrictID,DistrictName) Employee(EmployeeID,FirstName,UnitID,RankID)
CrimeHead(CrimeHeadID,CrimeGroupName) CrimeSubHead(CrimeSubHeadID,CrimeHeadID,CrimeHeadName)
Simpler views: firs(id,fir_number,crime_type,district,severity,status,modus,occurred_at,lat,lng)
cases(id,case_number,title,status,priority,district,officer,updated_at) criminals(id,name,risk_score,status,home_district,crime_category)
fir_criminals(fir_id,criminal_id,role) arrests(criminal_id,fir_id,arrested_at,district,arrest_type)
organizations(id,name,type,district) org_members(org_id,criminal_id,role) relationships(source_type,source_id,target_type,target_id,rel_type,confidence)
Districts: 'Bengaluru Urban','Mysuru','Dakshina Kannada','Hubballi-Dharwad','Belagavi','Kalaburagi','Ballari','Vijayapura','Shivamogga','Tumakuru','Udupi','Mandya'.
Crime types (CrimeSubHead / firs.crime_type): 'Burglary','House Theft','Chain Snatching','Vehicle Theft','Robbery','Dacoity','Murder','Attempt to Murder','Assault','Cheating & Fraud','Cybercrime','Drug Trafficking','Kidnapping','Extortion','Rioting','Counterfeiting'.`;

/* ────────────────────────────────────────────────────────────
   Main entry — the intelligence pipeline.
   ──────────────────────────────────────────────────────────── */
export async function answerQuery(query: string, user?: SessionUser | null, history: string[] = []): Promise<AiInsight> {
  const started = Date.now();
  const request_id = newRequestId();
  const { merged: entities, notes: contextNotes } = mergeContext(query, extract(query), history);

  // 0) Whole-DB entity dossier — "search phone 98…", a CrimeNo, a plate, or a name.
  if (looksLikeLookup(query)) {
    const d = entityLookup(query);
    if (d?.matched) {
      const insight = buildInsight({
        answer: d.answer,
        sql: undefined,
        rows: d.rows,
        chart: null,
        source: "lookup",
        confidence: 0.9,
        reasoning: `Direct database lookup (${d.kind}) — matched a record across the whole database and assembled its linked dossier (FIRs, phones, vehicles, arrests, associates).`,
        evidence: d.evidence,
        alternatives: ["Show this person's network graph", "Which suspects appear across multiple districts?", "Repeat offenders"],
        context: contextNotes,
        request_id,
        started,
        model: "db-lookup",
      });
      logAi(user, query, insight);
      return insight;
    }
  }

  // 0.5) Semantic-similarity fast-path — "find similar cases / same modus operandi"
  const sem = trySemantic(query);
  if (sem) {
    const insight = buildInsight({
      answer: sem.answer,
      sql: undefined,
      rows: sem.rows,
      chart: null,
      source: "semantic",
      confidence: sem.rows.length ? 0.82 : 0.4,
      reasoning: "Semantic vector search (TF-IDF cosine over crime type, modus operandi and brief facts). Backed by Catalyst QuickML embeddings in production.",
      evidence: sem.rows.slice(0, 5).map((r) => String(r.fir_number)),
      alternatives: altsFor(entities),
      context: contextNotes,
      request_id,
      started,
      model: "tfidf-embeddings",
    });
    logAi(user, query, insight);
    return insight;
  }

  // 1) Template fast-path
  const tpl = matchTemplate(query, entities);
  if (tpl) {
    let rows: Record<string, unknown>[] = [];
    try {
      rows = all(tpl.sql, tpl.params);
    } catch {
      rows = [];
    }
    const insight = buildInsight({
      answer: tpl.answer(rows),
      sql: tpl.sql.replace(/\s+/g, " ").trim(),
      rows,
      chart: tpl.chart ?? null,
      source: "template-sql",
      confidence: rows.length ? 0.92 : 0.6,
      reasoning: tpl.reasoning,
      evidence: pickEvidence(rows, tpl.evidenceKey),
      alternatives: altsFor(entities),
      context: contextNotes,
      request_id,
      started,
      model: "rule-engine",
    });
    logAi(user, query, insight);
    return insight;
  }

  // 2) LLM path — Catalyst QuickML (production). Hybrid: local retrieval builds
  //    the SQL/context, QuickML generates + phrases. No external LLM is used.
  if (catalystConfigured()) {
    const gen = await quickmlChat(
      `${SCHEMA_HINT}\n\nWrite ONE SQLite SELECT query (no explanation, no markdown) that answers:\n"${query}"${contextNotes.length ? `\nConversation context: ${contextNotes.join("; ")}` : ""}\nReturn only SQL.`,
      { system: "You are a careful crime-analytics SQL generator for the Karnataka State Police FIR database. Output a single safe SELECT query for SQLite.", temperature: 0.1 }
    );
    if (gen) {
      const v = validateSql(gen);
      if (v.ok && v.sql) {
        let rows: Record<string, unknown>[] = [];
        let execErr = false;
        try {
          rows = all(v.sql, []);
        } catch {
          execErr = true;
        }
        if (!execErr) {
          const narr = await quickmlChat(
            `Question: ${query}\nSQL: ${v.sql}\nResult rows (JSON, truncated): ${JSON.stringify(rows.slice(0, 8))}\n\nWrite a 1-2 sentence investigative answer for a police officer. Be concrete.`,
            { temperature: 0.3 }
          );
          const insight = buildInsight({
            answer: narr || `Query returned ${rows.length} matching records.`,
            sql: v.sql,
            rows,
            chart: inferChart(rows),
            source: "llm",
            confidence: rows.length ? 0.78 : 0.5,
            reasoning: "QuickML-generated SQL over the official KSP schema (Catalyst Data Store), validated (SELECT-only, whitelisted tables), executed, then summarized by QuickML.",
            evidence: pickEvidence(rows),
            alternatives: altsFor(entities),
            context: contextNotes,
            request_id,
            started,
            model: LLM_MODEL,
          });
          logAi(user, query, insight);
          return insight;
        }
      }
    }

    // 2b) Free-form RAG — Catalyst QuickML RAG over the Knowledge Base.
    const rag = await quickmlRag(query);
    if (rag) {
      const insight = buildInsight({
        answer: rag.answer,
        sql: undefined,
        rows: [],
        chart: null,
        source: "llm",
        confidence: 0.7,
        reasoning: "Answered by Catalyst QuickML RAG over the crime-intelligence Knowledge Base.",
        evidence: [],
        alternatives: altsFor(entities),
        context: contextNotes,
        request_id,
        started,
        model: `${LLM_MODEL} · RAG`,
      });
      logAi(user, query, insight);
      return insight;
    }
  }

  // 3) Demo-engine fallback — keyword search, always works offline
  const like = `%${query.replace(/[^\p{L}\p{N} ]/gu, "").split(" ")[0] || ""}%`;
  let rows: Record<string, unknown>[] = [];
  try {
    rows = all(
      `SELECT fir_number, crime_type, district, severity, status, occurred_at FROM firs
       WHERE crime_type LIKE ? OR district LIKE ? OR description LIKE ? ORDER BY occurred_at DESC LIMIT 25`,
      [like, like, like]
    );
  } catch {
    rows = [];
  }
  const insight = buildInsight({
    answer:
      rows.length > 0
        ? `I couldn't map that to a precise query, so here are ${rows.length} records related to your terms. Try naming a crime type (e.g. burglary / ಕಳ್ಳತನ), a district (e.g. Mysuru / ಮೈಸೂರು), or ask for "repeat offenders" or "hotspots".`
        : `No direct matches. Try: "Show burglary cases in Mysuru", "Which suspects appear across multiple districts?", or "ಮೈಸೂರಿನಲ್ಲಿ ಕಳ್ಳತನ ಪ್ರಕರಣಗಳು".`,
    sql: undefined,
    rows,
    chart: null,
    source: "demo-engine",
    confidence: rows.length ? 0.55 : 0.3,
    reasoning: "No template matched and no local LLM was reachable; performed a keyword fallback search over FIRs.",
    evidence: pickEvidence(rows, "fir_number"),
    alternatives: [
      "Show repeat offenders in Bengaluru Urban",
      "Which police stations register the most FIRs?",
      "Complainant occupation distribution",
    ],
    context: contextNotes,
    request_id,
    started,
    model: "fallback",
  });
  logAi(user, query, insight);
  return insight;
}

/* ── helpers ─────────────────────────────────────────────── */
// Semantic-similarity intent: "similar cases", "same modus operandi", "cases like FIR …".
function trySemantic(query: string): { answer: string; rows: Record<string, unknown>[] } | null {
  const s = query.toLowerCase();
  if (!/(similar|resembl|same modus|same m\.?o\.?|matching pattern|cases like|like fir|comparable)/.test(s)) return null;
  const num = s.match(/\d{5,}/)?.[0];
  let rows: Record<string, unknown>[];
  let basis: string;
  if (num) {
    const fir = all<{ id: number; fir_number: string }>(
      "SELECT id, fir_number FROM firs WHERE id=? OR fir_number LIKE ? LIMIT 1",
      [Number(num), `%${num}%`]
    )[0];
    if (!fir) return null;
    rows = similarFirs(fir.id, 10) as unknown as Record<string, unknown>[];
    basis = `FIR ${fir.fir_number}`;
  } else {
    rows = semanticSearch(query, 10) as unknown as Record<string, unknown>[];
    basis = "your description";
  }
  const answer = rows.length
    ? `Found ${rows.length} FIRs semantically similar to ${basis}. Closest: ${rows.slice(0, 3).map((r) => `${r.fir_number} (${Math.round(Number(r.score) * 100)}%)`).join(", ")}.`
    : `No semantically similar FIRs found for ${basis}. Try naming a crime type or modus operandi.`;
  return { answer, rows };
}

function pickEvidence(rows: Record<string, unknown>[], key?: string): string[] {
  if (!rows.length) return [];
  const k = key || Object.keys(rows[0])[0];
  return rows.slice(0, 5).map((r) => String(r[k])).filter(Boolean);
}
function altsFor(e: Entities): string[] {
  const out: string[] = [];
  if (e.crimeType) out.push(`Trend of ${e.crimeType} over time`);
  if (e.district) out.push(`Repeat offenders in ${e.district}`);
  out.push("Which police stations register the most FIRs?");
  return out.slice(0, 3);
}
function inferChart(rows: Record<string, unknown>[]): AiInsight["chart"] {
  if (rows.length < 2) return null;
  const keys = Object.keys(rows[0]);
  const numKey = keys.find((k) => typeof rows[0][k] === "number");
  const strKey = keys.find((k) => typeof rows[0][k] === "string");
  if (numKey && strKey && rows.length <= 25) return { kind: "bar", x: strKey, y: numKey };
  return null;
}
function buildInsight(p: {
  answer: string; sql?: string; rows: Record<string, unknown>[]; chart: AiInsight["chart"];
  source: AiInsight["explain"]["source"]; confidence: number; reasoning: string;
  evidence: string[]; alternatives: string[]; context: string[]; request_id: string; started: number; model: string;
}): AiInsight {
  return {
    answer: p.answer,
    sql: p.sql,
    columns: p.rows.length ? Object.keys(p.rows[0]) : [],
    rows: p.rows,
    chart: p.chart,
    explain: {
      confidence: p.confidence,
      reasoning: p.reasoning,
      records_used: p.rows.length,
      evidence: p.evidence,
      alternatives: p.alternatives,
      context_used: p.context.length ? p.context : undefined,
      source: p.source,
      audit_id: p.request_id,
      processing_ms: Date.now() - p.started,
      ai_model: p.model,
    },
  };
}
function logAi(user: SessionUser | null | undefined, query: string, insight: AiInsight) {
  audit({
    user,
    action: "AI_QUERY",
    entity: "query",
    request_id: insight.explain.audit_id,
    ai_model: insight.explain.ai_model,
    processing_ms: insight.explain.processing_ms,
    detail: query.slice(0, 200),
  });
}
