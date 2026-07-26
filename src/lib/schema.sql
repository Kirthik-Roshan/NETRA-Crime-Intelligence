-- ============================================================
-- NETRA — Database schema
--
-- PART 1 · OFFICIAL KSP "Police FIR System" SCHEMA
--   Implemented exactly as specified in the provided ER Diagram
--   document (Karnataka Police Department — Database Design
--   Document): table names, column names, keys & relationships.
--
-- PART 2 · intel_* EXTENSION TABLES
--   AI/platform enrichment produced by NETRA's intelligence
--   pipeline (entity resolution, network graph, risk scoring,
--   evidence metadata). Clearly namespaced so the official
--   schema stays untouched. Documented in SCHEMA.md.
--
-- PART 3 · PLATFORM TABLES + COMPATIBILITY VIEWS
--   users/auth + audit_logs, and read-only views that expose
--   investigator-friendly shapes over the official tables.
-- ============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ────────────────────────────────────────────────────────────
-- PART 1 · OFFICIAL KSP FIR SCHEMA (per ER diagram PDF)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS State (
  StateID        INTEGER PRIMARY KEY,
  StateName      TEXT NOT NULL,
  NationalityID  INTEGER,
  Active         INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS District (
  DistrictID    INTEGER PRIMARY KEY,
  DistrictName  TEXT NOT NULL,
  StateID       INTEGER REFERENCES State(StateID),
  Active        INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS UnitType (
  UnitTypeID     INTEGER PRIMARY KEY,
  UnitTypeName   TEXT,
  CityDistState  TEXT,
  Hierarchy      INTEGER,
  Active         INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS Unit (
  UnitID         INTEGER PRIMARY KEY,
  UnitName       TEXT NOT NULL,
  TypeID         INTEGER REFERENCES UnitType(UnitTypeID),
  ParentUnit     INTEGER,
  NationalityID  INTEGER,
  StateID        INTEGER REFERENCES State(StateID),
  DistrictID     INTEGER REFERENCES District(DistrictID),
  Active         INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS Rank (
  RankID     INTEGER PRIMARY KEY,
  RankName   TEXT,
  Hierarchy  INTEGER,
  Active     INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS Designation (
  DesignationID    INTEGER PRIMARY KEY,
  DesignationName  TEXT,
  Active           INTEGER DEFAULT 1,
  SortOrder        INTEGER
);

CREATE TABLE IF NOT EXISTS Employee (
  EmployeeID            INTEGER PRIMARY KEY,
  DistrictID            INTEGER REFERENCES District(DistrictID),
  UnitID                INTEGER REFERENCES Unit(UnitID),
  RankID                INTEGER REFERENCES Rank(RankID),
  DesignationID         INTEGER REFERENCES Designation(DesignationID),
  KGID                  TEXT,
  FirstName             TEXT,
  EmployeeDOB           TEXT,
  GenderID              INTEGER,
  BloodGroupID          INTEGER,
  PhysicallyChallenged  INTEGER DEFAULT 0,
  AppointmentDate       TEXT
);

CREATE TABLE IF NOT EXISTS CaseCategory (
  CaseCategoryID  INTEGER PRIMARY KEY,   -- ID doubles as the 1-digit category code in CrimeNo (FIR=1, UDR=3, PAR=4, Zero FIR=8)
  LookupValue     TEXT
);

CREATE TABLE IF NOT EXISTS GravityOffence (
  GravityOffenceID  INTEGER PRIMARY KEY,
  LookupValue       TEXT                  -- e.g. Heinous, Non-Heinous
);

CREATE TABLE IF NOT EXISTS CrimeHead (
  CrimeHeadID     INTEGER PRIMARY KEY,
  CrimeGroupName  TEXT,                   -- e.g. Crimes Against Body
  Active          INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS CrimeSubHead (
  CrimeSubHeadID  INTEGER PRIMARY KEY,
  CrimeHeadID     INTEGER REFERENCES CrimeHead(CrimeHeadID),
  CrimeHeadName   TEXT,                   -- e.g. Murder, Robbery
  SeqID           INTEGER
);

CREATE TABLE IF NOT EXISTS Act (
  ActCode  TEXT PRIMARY KEY,
  ActName  TEXT,
  Active   INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS Section (
  SectionCode  TEXT PRIMARY KEY,
  ActCode      TEXT REFERENCES Act(ActCode),
  SectionName  TEXT
);

CREATE TABLE IF NOT EXISTS CrimeHeadActSection (
  CrimeHeadID  INTEGER REFERENCES CrimeHead(CrimeHeadID),
  ActCode      TEXT REFERENCES Act(ActCode),
  SectionCode  TEXT
);

CREATE TABLE IF NOT EXISTS CaseStatusMaster (
  CaseStatusID    INTEGER PRIMARY KEY,
  CaseStatusName  TEXT                    -- Registered / Under Investigation / Charge Sheeted / Closed
);

CREATE TABLE IF NOT EXISTS CasteMaster (
  caste_master_id    INTEGER PRIMARY KEY,
  caste_master_name  TEXT
);

CREATE TABLE IF NOT EXISTS ReligionMaster (
  ReligionID    INTEGER PRIMARY KEY,
  ReligionName  TEXT
);

CREATE TABLE IF NOT EXISTS OccupationMaster (
  OccupationID    INTEGER PRIMARY KEY,
  OccupationName  TEXT
);

CREATE TABLE IF NOT EXISTS Court (
  CourtID     INTEGER PRIMARY KEY,
  CourtName   TEXT,
  DistrictID  INTEGER REFERENCES District(DistrictID),
  StateID     INTEGER REFERENCES State(StateID),
  Active      INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS CaseMaster (
  CaseMasterID         INTEGER PRIMARY KEY,
  CrimeNo              TEXT,              -- 1-digit category + 4-digit district + 4-digit PS unit + 4-digit year + 5-digit serial
  CaseNo               TEXT,              -- YYYY + 5-digit running serial (last 9 digits of CrimeNo)
  CrimeRegisteredDate  TEXT,
  PolicePersonID       INTEGER REFERENCES Employee(EmployeeID),
  PoliceStationID      INTEGER REFERENCES Unit(UnitID),
  CaseCategoryID       INTEGER REFERENCES CaseCategory(CaseCategoryID),
  GravityOffenceID     INTEGER REFERENCES GravityOffence(GravityOffenceID),
  CrimeMajorHeadID     INTEGER REFERENCES CrimeHead(CrimeHeadID),
  CrimeMinorHeadID     INTEGER REFERENCES CrimeSubHead(CrimeSubHeadID),
  CaseStatusID         INTEGER REFERENCES CaseStatusMaster(CaseStatusID),
  CourtID              INTEGER REFERENCES Court(CourtID),
  IncidentFromDate     TEXT,
  IncidentToDate       TEXT,
  InfoReceivedPSDate   TEXT,
  latitude             REAL,
  longitude            REAL,
  BriefFacts           TEXT
);

CREATE TABLE IF NOT EXISTS ComplainantDetails (
  ComplainantID    INTEGER PRIMARY KEY,
  CaseMasterID     INTEGER REFERENCES CaseMaster(CaseMasterID),
  ComplainantName  TEXT,
  AgeYear          INTEGER,
  OccupationID     INTEGER REFERENCES OccupationMaster(OccupationID),
  ReligionID       INTEGER REFERENCES ReligionMaster(ReligionID),
  CasteID          INTEGER REFERENCES CasteMaster(caste_master_id),
  GenderID         INTEGER                -- 1=M, 2=F, 3=T (lookup value)
);

CREATE TABLE IF NOT EXISTS ActSectionAssociation (
  CaseMasterID    INTEGER REFERENCES CaseMaster(CaseMasterID),
  ActID           TEXT REFERENCES Act(ActCode),
  SectionID       TEXT REFERENCES Section(SectionCode),
  ActOrderID      INTEGER,
  SectionOrderID  INTEGER
);

CREATE TABLE IF NOT EXISTS Victim (
  VictimMasterID  INTEGER PRIMARY KEY,
  CaseMasterID    INTEGER REFERENCES CaseMaster(CaseMasterID),
  VictimName      TEXT,
  AgeYear         INTEGER,
  GenderID        INTEGER,
  VictimPolice    TEXT DEFAULT '0'        -- '1' if the victim is police
);

CREATE TABLE IF NOT EXISTS Accused (
  AccusedMasterID  INTEGER PRIMARY KEY,
  CaseMasterID     INTEGER REFERENCES CaseMaster(CaseMasterID),
  AccusedName      TEXT,
  AgeYear          INTEGER,
  GenderID         INTEGER,
  PersonID         TEXT                   -- accused ordering: A1, A2, A3…
);

CREATE TABLE IF NOT EXISTS ArrestSurrender (
  ArrestSurrenderID          INTEGER PRIMARY KEY,
  CaseMasterID               INTEGER REFERENCES CaseMaster(CaseMasterID),
  ArrestSurrenderTypeID      INTEGER,     -- lookup value: 1=Arrest, 2=Voluntary Surrender
  ArrestSurrenderDate        TEXT,
  ArrestSurrenderStateId     INTEGER REFERENCES State(StateID),
  ArrestSurrenderDistrictId  INTEGER REFERENCES District(DistrictID),
  PoliceStationID            INTEGER REFERENCES Unit(UnitID),
  IOID                       INTEGER REFERENCES Employee(EmployeeID),
  CourtID                    INTEGER REFERENCES Court(CourtID),
  AccusedMasterID            INTEGER REFERENCES Accused(AccusedMasterID),
  IsAccused                  INTEGER DEFAULT 1,
  IsComplainantAccused       INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inv_arrestsurrenderaccused (
  ArrestSurrenderID  INTEGER REFERENCES ArrestSurrender(ArrestSurrenderID),
  AccusedMasterID    INTEGER REFERENCES Accused(AccusedMasterID)
);

CREATE TABLE IF NOT EXISTS ChargesheetDetails (
  CSID            INTEGER PRIMARY KEY,
  CaseMasterID    INTEGER REFERENCES CaseMaster(CaseMasterID),
  csdate          TEXT,
  cstype          TEXT,                   -- A=Chargesheet, B=False Case, C=Undetected
  PolicePersonID  INTEGER REFERENCES Employee(EmployeeID)
);

-- One-to-one occurrence time/location record (relationship specified in
-- the ER document; column detail beyond the FK is not enumerated there,
-- so a minimal faithful shape is used).
CREATE TABLE IF NOT EXISTS Inv_OccuranceTime (
  CaseMasterID      INTEGER PRIMARY KEY REFERENCES CaseMaster(CaseMasterID),
  PlaceOfOccurance  TEXT,
  OccuranceFrom     TEXT,
  OccuranceTo       TEXT
);

-- ────────────────────────────────────────────────────────────
-- PART 2 · intel_* — NETRA AI enrichment layer
-- (entity resolution, network graph, risk scores, evidence)
-- ────────────────────────────────────────────────────────────

-- Resolved person profiles: the same offender appearing as Accused in
-- many FIRs is resolved to ONE intelligence profile (PRD: Entity Resolution).
CREATE TABLE IF NOT EXISTS intel_criminals (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL,
  aliases          TEXT,                  -- JSON array
  gender           TEXT,
  age              INTEGER,
  status           TEXT,                  -- at_large | arrested | on_bail | convicted
  risk_score       INTEGER,               -- 0..100 (AI-computed)
  crime_category   TEXT,
  known_locations  TEXT,                  -- JSON array of district names
  home_district    TEXT,
  first_seen       TEXT,
  photo_seed       TEXT,
  notes            TEXT
);

-- Entity-resolution link: official Accused row → resolved profile.
CREATE TABLE IF NOT EXISTS intel_accused_link (
  AccusedMasterID  INTEGER PRIMARY KEY REFERENCES Accused(AccusedMasterID),
  criminal_id      INTEGER REFERENCES intel_criminals(id)
);

-- AI-derived enrichment per FIR (modus tag, severity/priority scoring, summary).
CREATE TABLE IF NOT EXISTS intel_case_enrichment (
  CaseMasterID  INTEGER PRIMARY KEY REFERENCES CaseMaster(CaseMasterID),
  modus         TEXT,
  severity      TEXT,                     -- low | medium | high | critical
  priority      TEXT,
  ai_summary    TEXT,
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS intel_evidence (
  id            INTEGER PRIMARY KEY,
  fir_id        INTEGER REFERENCES CaseMaster(CaseMasterID),
  type          TEXT,                     -- physical | digital | forensic | document | cctv
  description   TEXT,
  collected_at  TEXT,
  storage_ref   TEXT
);

CREATE TABLE IF NOT EXISTS intel_phones (
  id                 INTEGER PRIMARY KEY,
  number             TEXT,
  carrier            TEXT,
  owner_criminal_id  INTEGER REFERENCES intel_criminals(id)
);

CREATE TABLE IF NOT EXISTS intel_vehicles (
  id                 INTEGER PRIMARY KEY,
  plate              TEXT,
  make               TEXT,
  model              TEXT,
  color              TEXT,
  type               TEXT,
  owner_criminal_id  INTEGER REFERENCES intel_criminals(id)
);

CREATE TABLE IF NOT EXISTS intel_addresses (
  id           INTEGER PRIMARY KEY,
  criminal_id  INTEGER REFERENCES intel_criminals(id),
  type         TEXT,                      -- residence | hideout | frequent
  line         TEXT,
  district     TEXT,
  lat          REAL,
  lng          REAL
);

CREATE TABLE IF NOT EXISTS intel_weapons (
  id           INTEGER PRIMARY KEY,
  criminal_id  INTEGER REFERENCES intel_criminals(id),
  fir_id       INTEGER REFERENCES CaseMaster(CaseMasterID),
  type         TEXT,
  description  TEXT
);

CREATE TABLE IF NOT EXISTS intel_organizations (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  type      TEXT,                         -- gang | syndicate | network
  district  TEXT,
  notes     TEXT
);

CREATE TABLE IF NOT EXISTS intel_org_members (
  org_id       INTEGER NOT NULL REFERENCES intel_organizations(id),
  criminal_id  INTEGER NOT NULL REFERENCES intel_criminals(id),
  role         TEXT,
  PRIMARY KEY (org_id, criminal_id)
);

-- Generic relationship graph (edges) — powers the network engine.
CREATE TABLE IF NOT EXISTS intel_relationships (
  id           INTEGER PRIMARY KEY,
  source_type  TEXT NOT NULL,             -- criminal | phone | vehicle | address | fir | organization
  source_id    INTEGER NOT NULL,
  target_type  TEXT NOT NULL,
  target_id    INTEGER NOT NULL,
  rel_type     TEXT NOT NULL,             -- associate | uses_phone | uses_vehicle | resides | involved_in | member_of | contacted
  confidence   REAL,
  frequency    INTEGER,
  note         TEXT
);

-- ────────────────────────────────────────────────────────────
-- PART 3 · Platform tables (auth + audit) and views
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY,
  username       TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  full_name      TEXT NOT NULL,
  role           TEXT NOT NULL,           -- administrator | senior_officer | investigation_officer | analyst | readonly
  rank           TEXT,
  employee_id    INTEGER REFERENCES Employee(EmployeeID),
  station_id     INTEGER REFERENCES Unit(UnitID),
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id             INTEGER PRIMARY KEY,
  ts             TEXT NOT NULL,
  user_id        INTEGER,
  username       TEXT,
  role           TEXT,
  action         TEXT NOT NULL,
  entity         TEXT,
  entity_id      TEXT,
  request_id     TEXT,
  ai_model       TEXT,
  processing_ms  INTEGER,
  detail         TEXT
);

-- ── Compatibility views (read-only investigator-friendly shapes) ──

CREATE VIEW IF NOT EXISTS firs AS
SELECT
  cm.CaseMasterID                                   AS id,
  cm.CrimeNo                                        AS fir_number,
  cm.PoliceStationID                                AS station_id,
  csh.CrimeHeadName                                 AS crime_type,
  (SELECT group_concat(asa.ActID || ' ' || asa.SectionID, ', ')
     FROM ActSectionAssociation asa
    WHERE asa.CaseMasterID = cm.CaseMasterID)       AS ipc_sections,
  d.DistrictName                                    AS district,
  NULL                                              AS taluk,
  cm.latitude                                       AS lat,
  cm.longitude                                      AS lng,
  cm.IncidentFromDate                               AS occurred_at,
  cm.InfoReceivedPSDate                             AS reported_at,
  lower(replace(csm.CaseStatusName, ' ', '_'))      AS status,
  COALESCE(en.severity, 'medium')                   AS severity,
  en.modus                                          AS modus,
  cm.BriefFacts                                     AS description
FROM CaseMaster cm
LEFT JOIN CrimeSubHead csh    ON csh.CrimeSubHeadID = cm.CrimeMinorHeadID
LEFT JOIN Unit u              ON u.UnitID = cm.PoliceStationID
LEFT JOIN District d          ON d.DistrictID = u.DistrictID
LEFT JOIN CaseStatusMaster csm ON csm.CaseStatusID = cm.CaseStatusID
LEFT JOIN intel_case_enrichment en ON en.CaseMasterID = cm.CaseMasterID;

CREATE VIEW IF NOT EXISTS cases AS
SELECT
  cm.CaseMasterID                                   AS id,
  cm.CaseNo                                         AS case_number,
  csh.CrimeHeadName || ' — ' || d.DistrictName      AS title,
  cm.CaseMasterID                                   AS fir_id,
  lower(replace(csm.CaseStatusName, ' ', '_'))      AS status,
  COALESCE(en.priority, 'medium')                   AS priority,
  cm.PolicePersonID                                 AS assigned_officer,
  e.FirstName                                       AS officer,
  d.DistrictName                                    AS district,
  cm.CrimeRegisteredDate                            AS opened_at,
  COALESCE(en.updated_at, cm.CrimeRegisteredDate)   AS updated_at,
  COALESCE(en.ai_summary, cm.BriefFacts)            AS summary
FROM CaseMaster cm
LEFT JOIN CrimeSubHead csh    ON csh.CrimeSubHeadID = cm.CrimeMinorHeadID
LEFT JOIN Unit u              ON u.UnitID = cm.PoliceStationID
LEFT JOIN District d          ON d.DistrictID = u.DistrictID
LEFT JOIN CaseStatusMaster csm ON csm.CaseStatusID = cm.CaseStatusID
LEFT JOIN Employee e          ON e.EmployeeID = cm.PolicePersonID
LEFT JOIN intel_case_enrichment en ON en.CaseMasterID = cm.CaseMasterID;

CREATE VIEW IF NOT EXISTS criminals AS
SELECT * FROM intel_criminals;

CREATE VIEW IF NOT EXISTS fir_criminals AS
SELECT
  a.CaseMasterID  AS fir_id,
  l.criminal_id   AS criminal_id,
  CASE WHEN a.PersonID = 'A1' THEN 'prime_accused' ELSE 'accused' END AS role
FROM Accused a
JOIN intel_accused_link l ON l.AccusedMasterID = a.AccusedMasterID;

CREATE VIEW IF NOT EXISTS arrests AS
SELECT
  ar.ArrestSurrenderID    AS id,
  l.criminal_id           AS criminal_id,
  ar.CaseMasterID         AS fir_id,
  ar.ArrestSurrenderDate  AS arrested_at,
  e.FirstName             AS arresting_officer,
  d.DistrictName          AS district,
  CASE ar.ArrestSurrenderTypeID WHEN 2 THEN 'surrender' ELSE 'arrest' END AS arrest_type
FROM ArrestSurrender ar
LEFT JOIN intel_accused_link l ON l.AccusedMasterID = ar.AccusedMasterID
LEFT JOIN Employee e           ON e.EmployeeID = ar.IOID
LEFT JOIN District d           ON d.DistrictID = ar.ArrestSurrenderDistrictId;

CREATE VIEW IF NOT EXISTS victims AS
SELECT
  v.VictimMasterID  AS id,
  v.CaseMasterID    AS fir_id,
  v.VictimName      AS name,
  CASE v.GenderID WHEN 2 THEN 'F' WHEN 3 THEN 'T' ELSE 'M' END AS gender,
  v.AgeYear         AS age
FROM Victim v;

CREATE VIEW IF NOT EXISTS complainants AS
SELECT
  cd.ComplainantID    AS id,
  cd.CaseMasterID     AS fir_id,
  cd.ComplainantName  AS name,
  cd.AgeYear          AS age,
  CASE cd.GenderID WHEN 2 THEN 'F' WHEN 3 THEN 'T' ELSE 'M' END AS gender,
  o.OccupationName    AS occupation,
  r.ReligionName      AS religion
FROM ComplainantDetails cd
LEFT JOIN OccupationMaster o ON o.OccupationID = cd.OccupationID
LEFT JOIN ReligionMaster r   ON r.ReligionID = cd.ReligionID;

CREATE VIEW IF NOT EXISTS police_stations AS
SELECT
  u.UnitID        AS id,
  'U-' || u.UnitID AS station_code,
  u.UnitName      AS name,
  d.DistrictName  AS district
FROM Unit u
LEFT JOIN District d ON d.DistrictID = u.DistrictID
WHERE u.TypeID = 1;

CREATE VIEW IF NOT EXISTS evidence      AS SELECT * FROM intel_evidence;
CREATE VIEW IF NOT EXISTS phones        AS SELECT * FROM intel_phones;
CREATE VIEW IF NOT EXISTS vehicles      AS SELECT * FROM intel_vehicles;
CREATE VIEW IF NOT EXISTS addresses     AS SELECT * FROM intel_addresses;
CREATE VIEW IF NOT EXISTS weapons       AS SELECT * FROM intel_weapons;
CREATE VIEW IF NOT EXISTS organizations AS SELECT * FROM intel_organizations;
CREATE VIEW IF NOT EXISTS org_members   AS SELECT * FROM intel_org_members;
CREATE VIEW IF NOT EXISTS relationships AS SELECT * FROM intel_relationships;

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cm_station   ON CaseMaster(PoliceStationID);
CREATE INDEX IF NOT EXISTS idx_cm_subhead   ON CaseMaster(CrimeMinorHeadID);
CREATE INDEX IF NOT EXISTS idx_cm_incident  ON CaseMaster(IncidentFromDate);
CREATE INDEX IF NOT EXISTS idx_cm_status    ON CaseMaster(CaseStatusID);
CREATE INDEX IF NOT EXISTS idx_accused_case ON Accused(CaseMasterID);
CREATE INDEX IF NOT EXISTS idx_victim_case  ON Victim(CaseMasterID);
CREATE INDEX IF NOT EXISTS idx_compl_case   ON ComplainantDetails(CaseMasterID);
CREATE INDEX IF NOT EXISTS idx_asa_case     ON ActSectionAssociation(CaseMasterID);
CREATE INDEX IF NOT EXISTS idx_arrest_case  ON ArrestSurrender(CaseMasterID);
CREATE INDEX IF NOT EXISTS idx_arrest_acc   ON ArrestSurrender(AccusedMasterID);
CREATE INDEX IF NOT EXISTS idx_link_crim    ON intel_accused_link(criminal_id);
CREATE INDEX IF NOT EXISTS idx_rel_source   ON intel_relationships(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_rel_target   ON intel_relationships(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_ts     ON audit_logs(ts);
