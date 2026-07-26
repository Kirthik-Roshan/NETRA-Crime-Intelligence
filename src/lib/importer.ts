import "server-only";
import { getDb } from "./db";

/**
 * Real-data CSV importer → official KSP CaseMaster schema.
 *
 * Lets an administrator load actual SCRB extracts instead of only the
 * seeded demo data. Resolves district / police-station / crime-type by
 * name (creating lookup rows when absent), generates a structured CrimeNo
 * when one isn't supplied, and inserts child Accused / Victim /
 * Complainant rows. In a Catalyst deployment this same mapping feeds the
 * Data Store bulk-import API.
 *
 * Expected columns (header row, case-insensitive; extras ignored):
 *   crime_no, crime_type, district, police_station, registered_date,
 *   incident_date, latitude, longitude, status, gravity, brief_facts,
 *   accused_names, victim_names, complainant_name
 * (semicolon-separated lists for accused_names / victim_names)
 */

export const IMPORT_COLUMNS = [
  "crime_no", "crime_type", "district", "police_station", "registered_date",
  "incident_date", "latitude", "longitude", "status", "gravity", "brief_facts",
  "accused_names", "victim_names", "complainant_name",
] as const;

export const CSV_TEMPLATE =
  IMPORT_COLUMNS.join(",") +
  "\n" +
  [
    "104430001202600045", "Burglary", "Bengaluru Urban", "Bengaluru Urban City PS",
    "2026-06-14", "2026-06-13", "12.9716", "77.5946", "Under Investigation",
    "Non-Heinous", "Night break-in at residential premises; lock broken",
    "Ravi Kumar; Suresh Naik", "Anita Rao", "Anita Rao",
  ]
    .map((v) => (v.includes(",") ? `"${v}"` : v))
    .join(",");

// ── Minimal RFC-4180-ish CSV parser (quotes, embedded commas/newlines) ──
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const STATUS_ID: Record<string, number> = {
  registered: 1, "under investigation": 2, "charge sheeted": 3, chargesheeted: 3, closed: 4,
};

export interface ImportResult {
  inserted: number;
  skipped: number;
  errors: { row: number; message: string }[];
  createdDistricts: string[];
  createdStations: string[];
  createdCrimeTypes: string[];
}

export function importCsv(text: string): ImportResult {
  const db = getDb();
  const rows = parseCsv(text);
  const result: ImportResult = { inserted: 0, skipped: 0, errors: [], createdDistricts: [], createdStations: [], createdCrimeTypes: [] };
  if (rows.length < 2) {
    result.errors.push({ row: 0, message: "CSV has no data rows." });
    return result;
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  // ── lookup resolvers (create-on-miss) ──
  const districtId = (name: string): number | null => {
    if (!name) return null;
    const found = db.prepare("SELECT DistrictID id FROM District WHERE lower(DistrictName)=lower(?)").get(name) as { id: number } | undefined;
    if (found) return found.id;
    const nextId = ((db.prepare("SELECT COALESCE(MAX(DistrictID),400) m FROM District").get() as { m: number }).m) + 1;
    db.prepare("INSERT INTO District (DistrictID, DistrictName, StateID) VALUES (?,?,1)").run(nextId, name);
    result.createdDistricts.push(name);
    return nextId;
  };
  const stationId = (name: string, distId: number | null): number | null => {
    if (!name) return null;
    const found = db.prepare("SELECT UnitID id FROM Unit WHERE lower(UnitName)=lower(?)").get(name) as { id: number } | undefined;
    if (found) return found.id;
    const nextId = ((db.prepare("SELECT COALESCE(MAX(UnitID),0) m FROM Unit").get() as { m: number }).m) + 1;
    db.prepare("INSERT INTO Unit (UnitID, UnitName, TypeID, StateID, DistrictID) VALUES (?,?,1,1,?)").run(nextId, name, distId);
    result.createdStations.push(name);
    return nextId;
  };
  const subHeadId = (name: string): number | null => {
    if (!name) return null;
    const found = db.prepare("SELECT CrimeSubHeadID id FROM CrimeSubHead WHERE lower(CrimeHeadName)=lower(?)").get(name) as { id: number } | undefined;
    if (found) return found.id;
    const nextId = ((db.prepare("SELECT COALESCE(MAX(CrimeSubHeadID),0) m FROM CrimeSubHead").get() as { m: number }).m) + 1;
    // Attach to a generic "Imported" major head (id 99), created once.
    db.prepare("INSERT OR IGNORE INTO CrimeHead (CrimeHeadID, CrimeGroupName) VALUES (99,'Imported / Uncategorized')").run();
    db.prepare("INSERT INTO CrimeSubHead (CrimeSubHeadID, CrimeHeadID, CrimeHeadName, SeqID) VALUES (?,99,?,?)").run(nextId, name, nextId);
    result.createdCrimeTypes.push(name);
    return nextId;
  };

  const insCase = db.prepare(
    `INSERT INTO CaseMaster (CrimeNo, CaseNo, CrimeRegisteredDate, PoliceStationID, CaseCategoryID, GravityOffenceID,
       CrimeMinorHeadID, CaseStatusID, IncidentFromDate, InfoReceivedPSDate, latitude, longitude, BriefFacts)
     VALUES (?,?,?,?,1,?,?,?,?,?,?,?,?)`
  );
  const insEnrich = db.prepare("INSERT OR REPLACE INTO intel_case_enrichment (CaseMasterID, modus, severity, priority, ai_summary, updated_at) VALUES (?,?,?,?,?,?)");
  const insAccused = db.prepare("INSERT INTO Accused (CaseMasterID, AccusedName, PersonID) VALUES (?,?,?)");
  const insVictim = db.prepare("INSERT INTO Victim (CaseMasterID, VictimName) VALUES (?,?)");
  const insCompl = db.prepare("INSERT INTO ComplainantDetails (CaseMasterID, ComplainantName) VALUES (?,?)");

  const tx = db.transaction(() => {
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const val = (name: string) => { const i = idx(name); return i >= 0 && i < cells.length ? cells[i].trim() : ""; };
      try {
        const crimeType = val("crime_type");
        if (!crimeType && !val("crime_no")) { result.skipped++; continue; }
        const dName = val("district");
        const dId = districtId(dName);
        const psId = stationId(val("police_station"), dId);
        const subId = subHeadId(crimeType);
        const regDate = val("registered_date") || new Date().toISOString().slice(0, 10);
        const year = (regDate.match(/(\d{4})/)?.[1]) || "2026";
        const catCode = 1; // FIR
        const crimeNo = val("crime_no") ||
          `${catCode}${String(dId ?? 0).padStart(4, "0")}${String(psId ?? 0).padStart(4, "0")}${year}${String(result.inserted + 1).padStart(5, "0")}`;
        const caseNo = `${year}${String(result.inserted + 1).padStart(5, "0")}`;
        const gravity = /heinous/i.test(val("gravity")) && !/non/i.test(val("gravity")) ? 1 : 2;
        const statusId = STATUS_ID[val("status").toLowerCase()] ?? 1;
        const lat = parseFloat(val("latitude")) || null;
        const lng = parseFloat(val("longitude")) || null;

        const info = insCase.run(
          crimeNo, caseNo, regDate, psId, gravity, subId, statusId,
          val("incident_date") || regDate, regDate, lat, lng, val("brief_facts") || null
        );
        const caseId = Number(info.lastInsertRowid);
        insEnrich.run(caseId, "imported", gravity === 1 ? "high" : "medium", gravity === 1 ? "high" : "medium", val("brief_facts") || `Imported ${crimeType} record`, regDate);

        val("accused_names").split(";").map((x) => x.trim()).filter(Boolean).forEach((name, i) => insAccused.run(caseId, name, `A${i + 1}`));
        val("victim_names").split(";").map((x) => x.trim()).filter(Boolean).forEach((name) => insVictim.run(caseId, name));
        if (val("complainant_name")) insCompl.run(caseId, val("complainant_name"));

        result.inserted++;
      } catch (e) {
        result.errors.push({ row: r + 1, message: e instanceof Error ? e.message : String(e) });
      }
    }
  });
  tx();
  return result;
}
