// ============================================================
// NETRA — deterministic Karnataka crime-data seeder.
//
// Populates the OFFICIAL KSP "Police FIR System" schema (exactly
// as specified in the ER Diagram PDF) plus NETRA's intel_* AI
// enrichment layer. Standalone: `node scripts/seed.mjs`
// (auto-invoked by the app on first run). Reproducible via a
// seeded PRNG.
// ============================================================
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync, existsSync, rmSync, readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA_DIR = join(ROOT, "data");
const DB_PATH = join(DATA_DIR, "netra.db");
const SCHEMA_PATH = join(ROOT, "src", "lib", "schema.sql");

// ── Seeded PRNG (mulberry32) for reproducible data ──────────
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260718);
const rint = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pickN = (arr, n) => {
  const c = [...arr];
  const out = [];
  while (out.length < n && c.length) out.push(c.splice(Math.floor(rand() * c.length), 1)[0]);
  return out;
};
const chance = (p) => rand() < p;

export function hashPassword(pw) {
  return createHash("sha256").update(`${pw}::netra-static-salt`).digest("hex");
}

// ── Reference data ──────────────────────────────────────────
// DistrictIDs are 3-digit so they pad to the 4-digit block in CrimeNo.
const DISTRICTS = [
  { id: 401, name: "Bengaluru Urban", lat: 12.9716, lng: 77.5946 },
  { id: 402, name: "Mysuru", lat: 12.2958, lng: 76.6394 },
  { id: 403, name: "Dakshina Kannada", lat: 12.9141, lng: 74.856 },
  { id: 404, name: "Hubballi-Dharwad", lat: 15.3647, lng: 75.124 },
  { id: 405, name: "Belagavi", lat: 15.8497, lng: 74.4977 },
  { id: 406, name: "Kalaburagi", lat: 17.3297, lng: 76.8343 },
  { id: 407, name: "Ballari", lat: 15.1394, lng: 76.9214 },
  { id: 408, name: "Vijayapura", lat: 16.8302, lng: 75.71 },
  { id: 409, name: "Shivamogga", lat: 13.9299, lng: 75.5681 },
  { id: 410, name: "Tumakuru", lat: 13.3379, lng: 77.1173 },
  { id: 411, name: "Udupi", lat: 13.3409, lng: 74.7421 },
  { id: 412, name: "Mandya", lat: 12.5223, lng: 76.8954 },
];

// Crime heads (major) → sub-heads (minor). SubHead names are what
// investigators know as "crime type". Sections map via act/section.
const CRIME_HEADS = [
  { id: 1, group: "Crimes Against Body" },
  { id: 2, group: "Crimes Against Property" },
  { id: 3, group: "Economic Offences" },
  { id: 4, group: "Cyber Crime" },
  { id: 5, group: "Crimes Against Public Order" },
  { id: 6, group: "Narcotics & Contraband" },
];

const SUB_HEADS = [
  { id: 1, head: 2, name: "Burglary", sev: "medium", sections: [["IPC", "454"], ["IPC", "457"]], modus: ["night_break_in", "lock_breaking", "cctv_blindspot"] },
  { id: 2, head: 2, name: "House Theft", sev: "medium", sections: [["IPC", "380"]], modus: ["lock_breaking", "insider_info"] },
  { id: 3, head: 2, name: "Chain Snatching", sev: "medium", sections: [["IPC", "379"], ["IPC", "356"]], modus: ["two_wheeler_getaway", "crowded_market"] },
  { id: 4, head: 2, name: "Vehicle Theft", sev: "medium", sections: [["IPC", "379"]], modus: ["vehicle_lifting", "duplicate_key"] },
  { id: 5, head: 2, name: "Robbery", sev: "high", sections: [["IPC", "392"]], modus: ["armed_robbery", "two_wheeler_getaway"] },
  { id: 6, head: 2, name: "Dacoity", sev: "critical", sections: [["IPC", "395"]], modus: ["armed_robbery", "gang_operation"] },
  { id: 7, head: 1, name: "Murder", sev: "critical", sections: [["IPC", "302"]], modus: ["premeditated", "personal_enmity"] },
  { id: 8, head: 1, name: "Attempt to Murder", sev: "high", sections: [["IPC", "307"]], modus: ["personal_enmity", "gang_rivalry"] },
  { id: 9, head: 1, name: "Assault", sev: "medium", sections: [["IPC", "324"], ["IPC", "326"]], modus: ["street_fight", "personal_enmity"] },
  { id: 10, head: 3, name: "Cheating & Fraud", sev: "medium", sections: [["IPC", "420"]], modus: ["impersonation", "fake_investment"] },
  { id: 11, head: 4, name: "Cybercrime", sev: "medium", sections: [["ITACT", "66C"], ["ITACT", "66D"]], modus: ["fake_upi_link", "otp_fraud", "impersonation"] },
  { id: 12, head: 6, name: "Drug Trafficking", sev: "high", sections: [["NDPS", "20"], ["NDPS", "22"]], modus: ["drug_courier", "hostel_supply"] },
  { id: 13, head: 1, name: "Kidnapping", sev: "high", sections: [["IPC", "363"], ["IPC", "365"]], modus: ["ransom", "personal_enmity"] },
  { id: 14, head: 5, name: "Extortion", sev: "high", sections: [["IPC", "384"]], modus: ["threat_call", "gang_operation"] },
  { id: 15, head: 5, name: "Rioting", sev: "medium", sections: [["IPC", "147"], ["IPC", "148"]], modus: ["mob", "communal"] },
  { id: 16, head: 3, name: "Counterfeiting", sev: "high", sections: [["IPC", "489A"]], modus: ["fake_currency", "syndicate"] },
];

const ACTS = [
  ["IPC", "Indian Penal Code, 1860"],
  ["ITACT", "Information Technology Act, 2000"],
  ["NDPS", "Narcotic Drugs and Psychotropic Substances Act, 1985"],
  ["KPACT", "Karnataka Police Act, 1963"],
];
const SECTION_NAMES = {
  "302": "Murder", "307": "Attempt to murder", "324": "Voluntarily causing hurt by dangerous weapons",
  "326": "Grievous hurt by dangerous weapons", "356": "Assault in attempt to commit theft", "363": "Kidnapping",
  "365": "Kidnapping with intent to confine", "379": "Theft", "380": "Theft in dwelling house",
  "384": "Extortion", "392": "Robbery", "395": "Dacoity", "420": "Cheating", "454": "Lurking house-trespass",
  "457": "Lurking house-trespass by night", "489A": "Counterfeiting currency", "147": "Rioting",
  "148": "Rioting armed with deadly weapon", "66C": "Identity theft", "66D": "Cheating by personation using computer",
  "20": "Contravention involving cannabis", "22": "Contravention involving psychotropic substances",
};

const RANKS = [
  [1, "DGP", 1], [2, "IGP", 2], [3, "SP", 3], [4, "DSP", 4], [5, "Inspector", 5],
  [6, "PSI", 6], [7, "ASI", 7], [8, "Head Constable", 8], [9, "Constable", 9],
];
const DESIGNATIONS = [
  [1, "Station House Officer (SHO)", 1], [2, "Investigating Officer", 2], [3, "Station Writer", 3],
  [4, "Beat Officer", 4], [5, "Crime Analyst", 5], [6, "Administrator", 6],
];
const CASE_CATEGORIES = [[1, "FIR"], [3, "UDR"], [4, "PAR"], [8, "Zero FIR"]];
const CASE_STATUSES = [[1, "Registered"], [2, "Under Investigation"], [3, "Charge Sheeted"], [4, "Closed"]];
const RELIGIONS = ["Hindu", "Muslim", "Christian", "Jain", "Sikh", "Others"];
const OCCUPATIONS = ["Farmer", "Government Employee", "Private Employee", "Business", "Student", "Homemaker", "Driver", "Daily Wage Worker", "Retired", "Unemployed"];
const CASTES = ["General", "OBC", "SC", "ST", "Not Stated"];

const MALE = ["Suresh", "Ramesh", "Manjunath", "Prakash", "Ravi", "Kumar", "Shivaraj", "Basavaraj", "Naveen", "Kiran", "Mahesh", "Ganesh", "Vinay", "Santosh", "Anil", "Praveen", "Nagaraj", "Lokesh", "Umesh", "Yashwanth", "Harish", "Girish", "Darshan", "Chetan", "Imran", "Riyaz", "Abdul", "Faizal", "Sunil", "Deepak"];
const FEMALE = ["Lakshmi", "Geetha", "Divya", "Ananya", "Pooja", "Kavya", "Roopa", "Sowmya", "Meena", "Shruthi", "Vidya", "Rekha", "Nisha", "Asha", "Bhavya"];
const SURNAMES = ["Gowda", "Reddy", "Shetty", "Naik", "Patil", "Hegde", "Rao", "Kumar", "Achar", "Bhat", "Kulkarni", "Desai", "Murthy", "Poojary", "Shastri", "Nayak", "Rai", "Hebbar"];
const NICKS = ["Chaku", "Bullet", "Dodda", "Silent", "Anna", "Tiger", "Chinna", "Kaali", "Money", "Circuit", "Rowdy", "Bombat"];
const CARRIERS = ["Airtel", "Jio", "Vi", "BSNL"];
const VEHICLE_MAKES = [
  { make: "Hero", model: "Splendor", type: "motorcycle" },
  { make: "Bajaj", model: "Pulsar", type: "motorcycle" },
  { make: "Honda", model: "Activa", type: "scooter" },
  { make: "TVS", model: "Apache", type: "motorcycle" },
  { make: "Maruti", model: "Swift", type: "car" },
  { make: "Hyundai", model: "i20", type: "car" },
  { make: "Bajaj", model: "RE Auto", type: "auto" },
  { make: "Tata", model: "Ace", type: "truck" },
];
const GANGS = [
  { name: "Shivajinagar Crew", type: "gang", district: "Bengaluru Urban" },
  { name: "KR Market Syndicate", type: "syndicate", district: "Bengaluru Urban" },
  { name: "Malnad Vehicle Ring", type: "network", district: "Shivamogga" },
  { name: "Coastal Smugglers", type: "syndicate", district: "Dakshina Kannada" },
  { name: "Hubli Chain Gang", type: "gang", district: "Hubballi-Dharwad" },
  { name: "Electronic City Cyber Ring", type: "network", district: "Bengaluru Urban" },
];
const CRIME_CATEGORIES = ["Property Crime", "Violent Crime", "Cyber Crime", "Narcotics", "Organized Crime", "Financial Crime"];

// Date helpers — spread FIRs across ~18 months ending 2026-07-15.
const END = new Date("2026-07-15T00:00:00Z").getTime();
const DAY = 86400000;
const dateDaysAgo = (d) => new Date(END - d * DAY).toISOString();
const fullName = (gender) => `${gender === "F" ? pick(FEMALE) : pick(MALE)} ${pick(SURNAMES)}`;
const jitter = (base, spread = 0.18) => base + (rand() - 0.5) * spread;
const genderId = (g) => (g === "F" ? 2 : g === "T" ? 3 : 1);

// ── Build ───────────────────────────────────────────────────
export function seedInto(db) {
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  const tx = db.transaction(() => {
    /* ═══ PART 1 · Official lookup/master tables ═══ */
    db.prepare("INSERT INTO State (StateID, StateName, NationalityID) VALUES (1,'Karnataka',1),(2,'Maharashtra',1),(3,'Tamil Nadu',1)").run();

    const insDistrict = db.prepare("INSERT INTO District (DistrictID, DistrictName, StateID) VALUES (?,?,1)");
    for (const d of DISTRICTS) insDistrict.run(d.id, d.name);

    db.prepare("INSERT INTO UnitType (UnitTypeID, UnitTypeName, CityDistState, Hierarchy) VALUES (1,'Police Station','City',5),(2,'Circle Office','District',4),(3,'District Headquarters','District',3)").run();

    // Units — 2 police stations per district (UnitID 1..24 → 4-digit block in CrimeNo)
    const insUnit = db.prepare("INSERT INTO Unit (UnitID, UnitName, TypeID, ParentUnit, NationalityID, StateID, DistrictID) VALUES (?,?,1,NULL,1,1,?)");
    const units = [];
    let unitId = 0;
    for (const d of DISTRICTS) {
      for (const suffix of ["City PS", "Rural PS"]) {
        unitId += 1;
        insUnit.run(unitId, `${d.name} ${suffix}`, d.id);
        units.push({ id: unitId, district: d });
      }
    }

    const insRank = db.prepare("INSERT INTO Rank (RankID, RankName, Hierarchy) VALUES (?,?,?)");
    for (const r of RANKS) insRank.run(...r);
    const insDesig = db.prepare("INSERT INTO Designation (DesignationID, DesignationName, SortOrder) VALUES (?,?,?)");
    for (const d of DESIGNATIONS) insDesig.run(...d);

    // Employees — 3 per station
    const insEmp = db.prepare(
      `INSERT INTO Employee (DistrictID, UnitID, RankID, DesignationID, KGID, FirstName, EmployeeDOB, GenderID, BloodGroupID, PhysicallyChallenged, AppointmentDate)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    );
    const employeesByUnit = new Map();
    let kgid = 210000;
    for (const u of units) {
      const list = [];
      for (const [rankId, desigId] of [[5, 1], [6, 2], [8, 4]]) {
        const g = chance(0.85) ? "M" : "F";
        kgid += rint(3, 9);
        const info = insEmp.run(
          u.district.id, u.id, rankId, desigId, `KGID${kgid}`, fullName(g),
          dateDaysAgo(rint(9000, 18000)), genderId(g), rint(1, 8), chance(0.03) ? 1 : 0, dateDaysAgo(rint(1500, 9000))
        );
        list.push(Number(info.lastInsertRowid));
      }
      employeesByUnit.set(u.id, list);
    }

    const insCat = db.prepare("INSERT INTO CaseCategory (CaseCategoryID, LookupValue) VALUES (?,?)");
    for (const c of CASE_CATEGORIES) insCat.run(...c);
    db.prepare("INSERT INTO GravityOffence (GravityOffenceID, LookupValue) VALUES (1,'Heinous'),(2,'Non-Heinous')").run();

    const insHead = db.prepare("INSERT INTO CrimeHead (CrimeHeadID, CrimeGroupName) VALUES (?,?)");
    for (const h of CRIME_HEADS) insHead.run(h.id, h.group);
    const insSub = db.prepare("INSERT INTO CrimeSubHead (CrimeSubHeadID, CrimeHeadID, CrimeHeadName, SeqID) VALUES (?,?,?,?)");
    SUB_HEADS.forEach((s, i) => insSub.run(s.id, s.head, s.name, i + 1));

    const insAct = db.prepare("INSERT INTO Act (ActCode, ActName) VALUES (?,?)");
    for (const a of ACTS) insAct.run(...a);
    const insSection = db.prepare("INSERT OR IGNORE INTO Section (SectionCode, ActCode, SectionName) VALUES (?,?,?)");
    const insHeadActSec = db.prepare("INSERT INTO CrimeHeadActSection (CrimeHeadID, ActCode, SectionCode) VALUES (?,?,?)");
    for (const s of SUB_HEADS) {
      for (const [act, sec] of s.sections) {
        insSection.run(sec, act, SECTION_NAMES[sec] || "");
        insHeadActSec.run(s.head, act, sec);
      }
    }

    const insStatus = db.prepare("INSERT INTO CaseStatusMaster (CaseStatusID, CaseStatusName) VALUES (?,?)");
    for (const s of CASE_STATUSES) insStatus.run(...s);
    RELIGIONS.forEach((r, i) => db.prepare("INSERT INTO ReligionMaster (ReligionID, ReligionName) VALUES (?,?)").run(i + 1, r));
    OCCUPATIONS.forEach((o, i) => db.prepare("INSERT INTO OccupationMaster (OccupationID, OccupationName) VALUES (?,?)").run(i + 1, o));
    CASTES.forEach((c, i) => db.prepare("INSERT INTO CasteMaster (caste_master_id, caste_master_name) VALUES (?,?)").run(i + 1, c));

    const insCourt = db.prepare("INSERT INTO Court (CourtID, CourtName, DistrictID, StateID) VALUES (?,?,?,1)");
    DISTRICTS.forEach((d, i) => insCourt.run(i + 1, `${d.name} District & Sessions Court`, d.id));

    /* ═══ Platform users (linked to Employees) ═══ */
    const insUser = db.prepare(
      "INSERT INTO users (username, password_hash, full_name, role, rank, employee_id, station_id, created_at) VALUES (?,?,?,?,?,?,?,?)"
    );
    const pw = hashPassword("police123");
    const userRows = [
      ["admin", "System Administrator", "administrator", "System"],
      ["dcp.mysuru", "Vikram Rathore", "senior_officer", "DCP"],
      ["io.bengaluru", "Anjali Deshpande", "investigation_officer", "Police Inspector"],
      ["analyst.scrb", "Rohan Bhat", "analyst", "SCRB Analyst"],
      ["desk.hubli", "Sana Fernandes", "readonly", "Head Constable"],
    ].map(([u, name, role, rank], i) => {
      const unit = units[i % units.length];
      const empId = employeesByUnit.get(unit.id)[0];
      const info = insUser.run(u, pw, name, role, rank, empId, unit.id, dateDaysAgo(400 - i * 10));
      return { id: Number(info.lastInsertRowid), role };
    });

    /* ═══ PART 2 · Resolved criminal profiles (entity resolution) ═══ */
    const insCrim = db.prepare(
      `INSERT INTO intel_criminals (name, aliases, gender, age, status, risk_score, crime_category, known_locations, home_district, first_seen, photo_seed, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    const criminals = [];
    for (let i = 0; i < 70; i++) {
      const gender = chance(0.9) ? "M" : "F";
      const name = fullName(gender);
      const aliases = chance(0.55) ? [`${name.split(" ")[0]} "${pick(NICKS)}"`] : [];
      const home = pick(DISTRICTS).name;
      const locs = pickN(DISTRICTS.map((d) => d.name), rint(1, 3));
      if (!locs.includes(home)) locs.push(home);
      const age = rint(19, 58);
      const info = insCrim.run(
        name, JSON.stringify(aliases), gender, age,
        pick(["at_large", "at_large", "arrested", "on_bail", "convicted"]),
        rint(20, 98), pick(CRIME_CATEGORIES), JSON.stringify(locs), home,
        dateDaysAgo(rint(200, 1200)), `c${i}-${Math.floor(rand() * 100000)}`,
        chance(0.4) ? "History of repeat offenses across districts. Profile auto-resolved from Accused records." : null
      );
      criminals.push({ id: Number(info.lastInsertRowid), name, gender, age, home, locs });
    }

    /* ═══ CaseMaster + child records (official) ═══ */
    const insCase = db.prepare(
      `INSERT INTO CaseMaster (CrimeNo, CaseNo, CrimeRegisteredDate, PolicePersonID, PoliceStationID, CaseCategoryID, GravityOffenceID,
        CrimeMajorHeadID, CrimeMinorHeadID, CaseStatusID, CourtID, IncidentFromDate, IncidentToDate, InfoReceivedPSDate, latitude, longitude, BriefFacts)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    const insOcc = db.prepare("INSERT INTO Inv_OccuranceTime (CaseMasterID, PlaceOfOccurance, OccuranceFrom, OccuranceTo) VALUES (?,?,?,?)");
    const insAsa = db.prepare("INSERT INTO ActSectionAssociation (CaseMasterID, ActID, SectionID, ActOrderID, SectionOrderID) VALUES (?,?,?,?,?)");
    const insCompl = db.prepare("INSERT INTO ComplainantDetails (CaseMasterID, ComplainantName, AgeYear, OccupationID, ReligionID, CasteID, GenderID) VALUES (?,?,?,?,?,?,?)");
    const insVictim = db.prepare("INSERT INTO Victim (CaseMasterID, VictimName, AgeYear, GenderID, VictimPolice) VALUES (?,?,?,?,?)");
    const insAccused = db.prepare("INSERT INTO Accused (CaseMasterID, AccusedName, AgeYear, GenderID, PersonID) VALUES (?,?,?,?,?)");
    const insLink = db.prepare("INSERT INTO intel_accused_link (AccusedMasterID, criminal_id) VALUES (?,?)");
    const insEnrich = db.prepare("INSERT INTO intel_case_enrichment (CaseMasterID, modus, severity, priority, ai_summary, updated_at) VALUES (?,?,?,?,?,?)");
    const insEvd = db.prepare("INSERT INTO intel_evidence (fir_id, type, description, collected_at, storage_ref) VALUES (?,?,?,?,?)");
    const insRel = db.prepare("INSERT INTO intel_relationships (source_type, source_id, target_type, target_id, rel_type, confidence, frequency, note) VALUES (?,?,?,?,?,?,?,?)");
    const insArrest = db.prepare(
      `INSERT INTO ArrestSurrender (CaseMasterID, ArrestSurrenderTypeID, ArrestSurrenderDate, ArrestSurrenderStateId, ArrestSurrenderDistrictId,
        PoliceStationID, IOID, CourtID, AccusedMasterID, IsAccused, IsComplainantAccused) VALUES (?,?,?,1,?,?,?,?,?,1,0)`
    );
    const insArrJunction = db.prepare("INSERT INTO inv_arrestsurrenderaccused (ArrestSurrenderID, AccusedMasterID) VALUES (?,?)");
    const insCs = db.prepare("INSERT INTO ChargesheetDetails (CaseMasterID, csdate, cstype, PolicePersonID) VALUES (?,?,?,?)");

    const serials = new Map(); // per (unit, category, year) running serial
    const cases = [];

    // Property crimes dominate real FIR volumes — weight the distribution.
    const WEIGHTS = { Burglary: 4, "House Theft": 3, "Chain Snatching": 3, "Vehicle Theft": 4, Robbery: 2, Cybercrime: 3, "Cheating & Fraud": 3, Assault: 2 };
    const weightedSubs = SUB_HEADS.flatMap((s) => Array(WEIGHTS[s.name] || 1).fill(s));

    for (let i = 0; i < 500; i++) {
      const sub = pick(weightedSubs);
      const unit = pick(units);
      const d = unit.district;
      // Bias toward recent months so trends, hotspots and forecasts are lively.
      const daysAgo = chance(0.55) ? rint(1, 180) : rint(181, 540);
      const occurred = dateDaysAgo(daysAgo);
      const reported = dateDaysAgo(Math.max(0, daysAgo - rint(0, 3)));
      const year = new Date(reported).getUTCFullYear();
      const catId = chance(0.9) ? 1 : pick([3, 8]); // mostly FIR, some UDR / Zero FIR

      // CrimeNo: 1-digit category + 4-digit district + 4-digit unit + 4-digit year + 5-digit serial
      const key = `${unit.id}|${catId}|${year}`;
      const serial = (serials.get(key) || 0) + 1;
      serials.set(key, serial);
      const crimeNo = `${catId}${String(d.id).padStart(4, "0")}${String(unit.id).padStart(4, "0")}${year}${String(serial).padStart(5, "0")}`;
      const caseNo = `${year}${String(serial).padStart(5, "0")}`;

      const heinous = sub.sev === "critical" || sub.sev === "high";
      const statusId = pick([1, 2, 2, 2, 3, 3, 4]); // Registered / UI / CS / Closed
      const courtId = statusId >= 3 ? DISTRICTS.findIndex((x) => x.id === d.id) + 1 : null;
      const officer = pick(employeesByUnit.get(unit.id));
      const modus = pick(sub.modus);
      const brief = `${sub.name} reported under ${unit.id % 2 ? "city" : "rural"} limits of ${d.name}. Modus operandi: ${modus.replace(/_/g, " ")}.`;

      const info = insCase.run(
        crimeNo, caseNo, reported, officer, unit.id, catId, heinous ? 1 : 2,
        sub.head, sub.id, statusId, courtId,
        occurred, dateDaysAgo(Math.max(0, daysAgo - 1)), reported,
        jitter(d.lat), jitter(d.lng), brief
      );
      const caseId = Number(info.lastInsertRowid);
      cases.push({ id: caseId, sub, district: d, unit, occurred, daysAgo, statusId, officer });

      insOcc.run(caseId, `${pick(["Market Rd", "Bus Stand", "Layout", "NH-Bypass", "Old Town"])}, ${d.name}`, occurred, dateDaysAgo(Math.max(0, daysAgo - 1)));

      // Act-Section associations
      sub.sections.forEach(([act, sec], idx) => insAsa.run(caseId, act, sec, idx + 1, idx + 1));

      // Complainants (with socio-demographic lookups)
      const nCompl = chance(0.85) ? rint(1, 2) : 0;
      for (let cN = 0; cN < nCompl; cN++) {
        const g = chance(0.6) ? "M" : "F";
        insCompl.run(caseId, fullName(g), rint(18, 70), rint(1, OCCUPATIONS.length), rint(1, RELIGIONS.length), rint(1, CASTES.length), genderId(g));
      }
      // Victims
      for (let v = 0; v < (chance(0.8) ? rint(1, 2) : 0); v++) {
        const g = chance(0.5) ? "M" : "F";
        insVictim.run(caseId, fullName(g), rint(18, 70), genderId(g), chance(0.03) ? "1" : "0");
      }
      // Accused — resolved to intel criminal profiles (entity resolution)
      const localCrims = criminals.filter((c) => c.locs.includes(d.name));
      const pool = localCrims.length ? localCrims : criminals;
      const picked = pickN(pool, chance(0.75) ? rint(1, 3) : 0);
      picked.forEach((c, idx) => {
        const aInfo = insAccused.run(caseId, c.name, c.age, genderId(c.gender), `A${idx + 1}`);
        const accusedId = Number(aInfo.lastInsertRowid);
        insLink.run(accusedId, c.id);
        insRel.run("criminal", c.id, "fir", caseId, "involved_in", 0.9, 1, null);
        (c.accusedRows ||= []).push({ accusedId, caseId, unit, district: d, daysAgo });
      });

      // Enrichment (AI layer)
      const priority = sub.sev === "critical" ? "critical" : sub.sev === "high" ? "high" : pick(["low", "medium", "medium"]);
      insEnrich.run(
        caseId, modus, sub.sev, priority,
        `Investigation into ${sub.name.toLowerCase()} in ${d.name}. Modus operandi ${modus.replace(/_/g, " ")}. AI has linked this record to related incidents in the region.`,
        dateDaysAgo(rint(0, 60))
      );
      // Evidence (intel layer — evidence metadata)
      for (let e = 0; e < rint(0, 3); e++) {
        const et = pick(["physical", "digital", "forensic", "document", "cctv"]);
        insEvd.run(caseId, et, `${et} evidence collected at scene`, occurred, `EVD-${caseId}-${e}`);
      }
      // Chargesheet for CS/Closed cases
      if (statusId >= 3) {
        insCs.run(caseId, dateDaysAgo(Math.max(0, daysAgo - rint(20, 90))), statusId === 4 && chance(0.3) ? pick(["B", "C"]) : "A", officer);
      }
    }

    // Arrests / surrenders (~40% of accused links) + junction rows
    for (const c of criminals) {
      for (const row of c.accusedRows || []) {
        if (!chance(0.4)) continue;
        const arrDaysAgo = Math.max(0, row.daysAgo - rint(2, 45));
        const io = pick(employeesByUnit.get(row.unit.id));
        const courtId = DISTRICTS.findIndex((x) => x.id === row.district.id) + 1;
        const info = insArrest.run(
          row.caseId, chance(0.85) ? 1 : 2, dateDaysAgo(arrDaysAgo),
          row.district.id, row.unit.id, io, chance(0.7) ? courtId : null, row.accusedId
        );
        insArrJunction.run(Number(info.lastInsertRowid), row.accusedId);
      }
    }

    /* ═══ intel_* entity web (phones, vehicles, addresses, orgs, graph) ═══ */
    const insPhone = db.prepare("INSERT INTO intel_phones (number, carrier, owner_criminal_id) VALUES (?,?,?)");
    const insVehicle = db.prepare("INSERT INTO intel_vehicles (plate, make, model, color, type, owner_criminal_id) VALUES (?,?,?,?,?,?)");
    const insAddr = db.prepare("INSERT INTO intel_addresses (criminal_id, type, line, district, lat, lng) VALUES (?,?,?,?,?,?)");
    const insWeapon = db.prepare("INSERT INTO intel_weapons (criminal_id, fir_id, type, description) VALUES (?,?,?,?)");
    const colors = ["Black", "White", "Silver", "Red", "Blue", "Grey"];

    for (const c of criminals) {
      for (let p = 0; p < rint(1, 2); p++) {
        const info = insPhone.run(`+91 9${rint(100000000, 999999999)}`, pick(CARRIERS), c.id);
        insRel.run("criminal", c.id, "phone", Number(info.lastInsertRowid), "uses_phone", 0.95, rint(1, 40), null);
      }
      if (chance(0.55)) {
        const vm = pick(VEHICLE_MAKES);
        const plate = `KA-${pick(["01", "02", "03", "09", "20", "25"])}-${pick(["AB", "CJ", "MK", "HG", "NR"])}-${rint(1000, 9999)}`;
        const info = insVehicle.run(plate, vm.make, vm.model, pick(colors), vm.type, c.id);
        insRel.run("criminal", c.id, "vehicle", Number(info.lastInsertRowid), "uses_vehicle", 0.85, rint(1, 20), null);
      }
      const dObj = DISTRICTS.find((x) => x.name === c.home) || pick(DISTRICTS);
      const aInfo = insAddr.run(c.id, "residence", `${rint(1, 200)}, ${pick(["Cross", "Main", "Layout"])} Rd, ${c.home}`, c.home, jitter(dObj.lat), jitter(dObj.lng));
      insRel.run("criminal", c.id, "address", Number(aInfo.lastInsertRowid), "resides", 0.9, null, null);
      if (chance(0.3)) {
        const hd = pick(DISTRICTS);
        const hInfo = insAddr.run(c.id, "hideout", `Suspected hideout near ${hd.name}`, hd.name, jitter(hd.lat), jitter(hd.lng));
        insRel.run("criminal", c.id, "address", Number(hInfo.lastInsertRowid), "resides", 0.5, null, "suspected hideout");
      }
      const risk = db.prepare("SELECT risk_score FROM intel_criminals WHERE id=?").get(c.id).risk_score;
      if (risk > 70 && chance(0.5)) insWeapon.run(c.id, null, pick(["Country pistol", "Machete", "Knife", "Iron rod"]), "Recovered / reported in association");
    }

    const insOrg = db.prepare("INSERT INTO intel_organizations (name, type, district, notes) VALUES (?,?,?,?)");
    const insOrgMember = db.prepare("INSERT OR IGNORE INTO intel_org_members (org_id, criminal_id, role) VALUES (?,?,?)");
    for (const g of GANGS) {
      const info = insOrg.run(g.name, g.type, g.district, `Organized ${g.type} operating primarily in ${g.district}.`);
      const orgId = Number(info.lastInsertRowid);
      const members = pickN(criminals, rint(4, 9));
      members.forEach((m, idx) => {
        insOrgMember.run(orgId, m.id, idx === 0 ? "leader" : "member");
        insRel.run("criminal", m.id, "organization", orgId, "member_of", 0.8, null, null);
      });
      for (let a = 0; a < members.length; a++)
        for (let b = a + 1; b < members.length; b++)
          if (chance(0.5)) insRel.run("criminal", members[a].id, "criminal", members[b].id, "associate", 0.6 + rand() * 0.35, rint(1, 25), `Co-members of ${g.name}`);
    }
    for (let i = 0; i < 60; i++) {
      const [a, b] = pickN(criminals, 2);
      if (a && b) insRel.run("criminal", a.id, "criminal", b.id, "associate", 0.4 + rand() * 0.4, rint(1, 15), null);
    }
    for (let i = 0; i < 40; i++) {
      const [a, b] = pickN(criminals, 2);
      if (a && b) insRel.run("criminal", a.id, "criminal", b.id, "contacted", 0.5 + rand() * 0.3, rint(1, 12), "Frequent call contact");
    }

    /* ═══ Audit log seed ═══ */
    const insAudit = db.prepare(
      "INSERT INTO audit_logs (ts, user_id, username, role, action, entity, entity_id, request_id, ai_model, processing_ms, detail) VALUES (?,?,?,?,?,?,?,?,?,?,?)"
    );
    const actions = ["USER_LOGIN", "CASE_VIEWED", "AI_QUERY", "PREDICTION_GENERATED", "REPORT_EXPORTED", "EVIDENCE_UPLOADED", "SQL_EXECUTED"];
    for (let i = 0; i < 40; i++) {
      const u = pick(userRows);
      const act = pick(actions);
      insAudit.run(
        dateDaysAgo(rint(0, 30)), u.id, null, u.role, act, pick(["case", "fir", "criminal", "query"]),
        String(rint(1, 300)), `req_${Math.floor(rand() * 1e9).toString(36)}`,
        act.includes("AI") || act.includes("PREDICTION") ? "VL-Qwen3.6-35B-A3B" : null, rint(120, 3200), null
      );
    }
  });
  tx();
}

function main() {
  const reset = process.argv.includes("--reset");
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (reset && existsSync(DB_PATH)) {
    rmSync(DB_PATH, { force: true });
    for (const ext of ["-wal", "-shm", "-journal"]) rmSync(DB_PATH + ext, { force: true });
  }
  const db = new Database(DB_PATH);
  const already = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  const populated = already && db.prepare("SELECT COUNT(*) AS n FROM users").get().n > 0;
  if (populated && !reset) {
    console.log("✔ NETRA database already seeded at data/netra.db (use `npm run db:reset` to rebuild).");
    db.close();
    return;
  }
  console.log("→ Seeding NETRA crime database (official KSP FIR schema + intel layer)...");
  seedInto(db);
  const counts = {};
  for (const t of ["CaseMaster", "Accused", "Victim", "ComplainantDetails", "ArrestSurrender", "ChargesheetDetails", "Employee", "Unit", "intel_criminals", "intel_relationships"]) {
    counts[t] = db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
  }
  db.close();
  console.log("✔ Seed complete →", JSON.stringify(counts));
  console.log("  Demo login: admin / dcp.mysuru / io.bengaluru / analyst.scrb / desk.hubli  (password: police123)");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
