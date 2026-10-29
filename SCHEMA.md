# NETRA KSP Schema Fidelity

The deployed crime-source contract consists of the 28 tables represented in the
organizer-provided Police FIR ER diagram. NETRA stores synthetic demonstration
data in that normalized structure and reads those same tables from Catalyst
Cloud Scale.

## Official Tables

| Domain | Tables |
|---|---|
| Case records | `CaseMaster`, `ComplainantDetails`, `Victim`, `Accused`, `Inv_OccuranceTime`, `ArrestSurrender`, `inv_arrestsurrenderaccused`, `ChargesheetDetails`, `ActSectionAssociation` |
| Legal classification | `Act`, `Section`, `CrimeHead`, `CrimeSubHead`, `CrimeHeadActSection`, `CaseCategory`, `GravityOffence`, `CaseStatusMaster` |
| Police organization | `State`, `District`, `UnitType`, `Unit`, `Rank`, `Designation`, `Employee`, `Court` |
| Demographic lookup | `CasteMaster`, `ReligionMaster`, `OccupationMaster` |

The machine-readable field/type/key contract is
[`data/cloudscale-import/schema.json`](./data/cloudscale-import/schema.json).
The console creation and relationship instructions are
[`data/cloudscale-import/KSP-CLOUDSCALE-CREATION.md`](./data/cloudscale-import/KSP-CLOUDSCALE-CREATION.md).

## Keys And Relationships

- Catalyst `ROWID` is the physical Data Store primary key.
- organizer identifiers such as `CaseMasterID`, `AccusedMasterID`, and
  `DistrictID` remain logical unique keys.
- Cloud Scale foreign-key fields point to the parent table's `ROWID`; CSV import
  mappings resolve the organizer business keys to those rows.
- junction tables preserve their organizer-defined composite relationships and
  are deduplicated/audited before import.
- destructive cascading is not used for evidentiary records.

Important case relationships include:

```text
CaseMaster
  -> Unit -> District -> State
  -> CrimeSubHead -> CrimeHead
  -> CaseStatusMaster / GravityOffence / CaseCategory
  -> Employee / Court
  -> ComplainantDetails / Victim / Accused
  -> ActSectionAssociation -> Act / Section
  -> Inv_OccuranceTime
  -> ArrestSurrender -> inv_arrestsurrenderaccused
  -> ChargesheetDetails
```

## Catalyst Storage Types

CSV values are normalized before import:

- `Date`: `YYYY-MM-DD`
- `DateTime`: `YYYY-MM-DD HH:mm:ss`
- `Boolean`: `true` or `false`
- bounded integer/double values for numeric fields
- `Var Char` only for values at most 255 characters
- `Text` for `BriefFacts` and other long content

Run `npm run schema:audit` to validate table/column presence, mandatory values,
date formatting, Catalyst storage compatibility, and every SQLite-declared FK.

## Investigator Read Model

Normalized tables are ideal for integrity but awkward for repeated police
workflows. `functions/ai_quickml/ksp-read-model.js` therefore derives transient
JSON views inside the Catalyst Function:

| Read-model name | Official source |
|---|---|
| `Firs` / `Cases` | `CaseMaster` plus station, district, status, gravity, officer, occurrence and legal joins |
| `Criminals` | identity-resolved `Accused` occurrences and linked case/arrest context |
| `FirCriminals` | `Accused.CaseMasterID` case-person links |
| `Arrests` | `ArrestSurrender`, accused junction, employee and geography joins |
| `Victims` / `Complainants` | official person rows plus demographic lookups |
| `Relationships` | deterministic co-accused and accused-to-FIR links |
| `PoliceStations` | `Unit`, `UnitType`, and `District` |
| `Chargesheets` | `ChargesheetDetails`, `Court`, and `Employee` |

These names are not physical Cloud Scale tables and are never imported. Empty
phone, vehicle, weapon, address and organization views explicitly represent
data that the supplied schema does not contain; NETRA does not fabricate it.

## Platform Outputs

`Evidence`, `Notifications`, and `OcrResult` are application-owned output
tables. Evidence rows reference official cases, while source/result binaries
and audit events are archived in Stratus. These outputs are clearly separated
from the 28-table source contract.

## Local Generator Versus Runtime

`data/netra.db` and `scripts/seed.mjs` provide reproducible synthetic generation
and validation. The static deployed application does not bundle or query that
SQLite database. Runtime records come through `ai_quickml` from Cloud Scale.
