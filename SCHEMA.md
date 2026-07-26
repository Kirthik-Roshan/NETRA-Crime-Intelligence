# NETRA — Database Schema Fidelity Document

> **The database implements the official KSP "Police FIR System — ER Diagram"
> (Karnataka Police Department, Database Design Document) exactly** — every
> table, column, key and relationship from the provided PDF — plus a clearly
> namespaced `intel_*` AI-enrichment layer and thin read-only views for the
> application. If SCRB hands us real data in the official format, it loads
> straight in with zero remapping.

---

## Part 1 — Official KSP tables (verbatim from the ER document)

| # | Table | Purpose | Notes |
|---|-------|---------|-------|
| 1 | `CaseMaster` | One row per FIR/case | Includes structured `CrimeNo` + `CaseNo`, GPS `latitude`/`longitude`, `BriefFacts` |
| 2 | `ComplainantDetails` | Complainants per case | FKs to Occupation/Religion/Caste masters |
| 3 | `ActSectionAssociation` | Acts & sections invoked per case | `ActID`→`Act.ActCode`, `SectionID`→`Section.SectionCode` |
| 4 | `Victim` | Victims per case | `VictimPolice` flag |
| 5 | `Accused` | Accused per case | `PersonID` ordering A1, A2, A3… |
| 6 | `ArrestSurrender` | Arrest / voluntary-surrender events | FKs to State/District/Unit/Employee/Court/Accused |
| 7 | `inv_arrestsurrenderaccused` | Junction: arrest event ↔ accused | Per relationship matrix |
| 8 | `ChargesheetDetails` | Final reports | `cstype`: A=Chargesheet, B=False Case, C=Undetected |
| 9 | `Inv_OccuranceTime` | 1:1 occurrence time/location record | Relationship specified in the PDF; column detail minimal-faithful |
| 10 | `Act`, `Section`, `CrimeHeadActSection` | Legal acts & sections | IPC / IT Act / NDPS / KP Act seeded |
| 11 | `CrimeHead`, `CrimeSubHead` | Major / minor crime classification | e.g. *Crimes Against Property* → *Burglary* |
| 12 | `CaseCategory` | FIR / UDR / PAR / Zero FIR | **ID doubles as the CrimeNo category digit** (1/3/4/8) |
| 13 | `GravityOffence` | Heinous / Non-Heinous | |
| 14 | `CaseStatusMaster` | Registered / Under Investigation / Charge Sheeted / Closed | |
| 15 | `CasteMaster`, `ReligionMaster`, `OccupationMaster` | Socio-demographic lookups | |
| 16 | `Court` | Courts per district | |
| 17 | `State`, `District` | Geography | 12 Karnataka districts seeded |
| 18 | `Unit`, `UnitType` | Police stations & unit hierarchy | 24 stations (2/district) |
| 19 | `Rank`, `Designation`, `Employee` | Police personnel | KGID, rank/designation FKs |

### CrimeNo format (implemented exactly)

```
1  digit  Case Category code   (FIR=1, UDR=3, PAR=4, Zero FIR=8)
4  digits District ID
4  digits Police Station (Unit) ID
4  digits Year
5  digits Running serial — maintained PER station, PER category, PER year
─────────
e.g. 1 0410 0019 2025 00001  →  104100019202500001
CaseNo = last 9 digits (YYYY + serial) → 202500001
```

The seeder maintains true per-`(station, category, year)` serial counters,
exactly as the document specifies.

---

## Part 2 — `intel_*` AI-enrichment layer (NETRA extensions)

The official schema stores *records*; the hackathon problem statement demands
*intelligence* (networks, risk, patterns). These tables hold what NETRA's AI
pipeline derives — they never modify official tables:

| Table | What it holds | PRD pipeline step |
|-------|---------------|-------------------|
| `intel_criminals` | Resolved person profiles (risk score, aliases, status) | **Entity Resolution** — the same offender appearing as `Accused` in many FIRs becomes one profile |
| `intel_accused_link` | `Accused.AccusedMasterID` → profile | Entity-resolution mapping |
| `intel_case_enrichment` | Modus-operandi tag, severity/priority, AI summary per case | Pattern tagging |
| `intel_relationships` | Graph edges (associate / uses_phone / uses_vehicle / member_of / involved_in / contacted) with confidence + frequency | **Relationship Detection → Knowledge Graph** |
| `intel_phones`, `intel_vehicles`, `intel_addresses`, `intel_weapons` | Linked entities | Network engine nodes |
| `intel_organizations`, `intel_org_members` | Gangs / syndicates | Organized-crime analysis |
| `intel_evidence` | Evidence metadata per case | Evidence management (not present in the official schema) |

Platform tables: `users` (auth, linked to `Employee` via `employee_id`) and
`audit_logs` (immutable action trail).

---

## Part 3 — Compatibility views

Thin, read-only SQL views expose investigator-friendly shapes so application
code and the NL→SQL engine can stay simple, while every byte still comes from
official tables:

| View | Backed by |
|------|-----------|
| `firs` | `CaseMaster` ⋈ `CrimeSubHead` ⋈ `Unit` ⋈ `District` ⋈ `CaseStatusMaster` ⋈ `intel_case_enrichment` (+ `ActSectionAssociation` aggregate) |
| `cases` | Same + `Employee` (assigned officer) |
| `criminals` | `intel_criminals` |
| `fir_criminals` | `Accused` ⋈ `intel_accused_link` (role = prime_accused when `PersonID='A1'`) |
| `arrests` | `ArrestSurrender` ⋈ `Employee` ⋈ `District` (type: arrest/surrender) |
| `victims`, `complainants` | `Victim` / `ComplainantDetails` ⋈ occupation/religion masters |
| `police_stations` | `Unit` ⋈ `District` |
| `phones`, `vehicles`, `addresses`, `weapons`, `organizations`, `org_members`, `relationships`, `evidence` | corresponding `intel_*` tables |

The NL→SQL safety whitelist permits **official tables, views and intel tables
only**, and the LLM prompt teaches the official table names first.

---

## Local vs production storage

| Environment | Engine | Why |
|-------------|--------|-----|
| Local / demo | SQLite (better-sqlite3), auto-seeded | Zero setup, runs on any laptop |
| Production | **Catalyst Data Store** (#6) — same tables; **Catalyst NoSQL** (#7) for conversation memory; **Catalyst Stratus** (#8) for evidence blobs; **Catalyst Cache** (#9) for semantic cache | Hackathon-required services |

The repository pattern in `src/lib/db.ts` isolates every query, so swapping
SQLite → Data Store touches one layer only.
