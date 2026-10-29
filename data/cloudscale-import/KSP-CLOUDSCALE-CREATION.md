# KSP Cloud Scale Table Creation Runbook

Generated from the 28 official KSP ER tables in `data/netra.db`.

## Important Catalyst Rules

- Do not create one Stratus bucket per table. Create one bucket, such as
  `netra-ksp-import`, and keep all CSV objects in it. The tables themselves
  are created under **Cloud Scale > Data Store**.
- Catalyst automatically creates `ROWID`, `CREATORID`, `CREATEDTIME`, and
  `MODIFIEDTIME`. Do not add those columns manually.
- `ROWID` is the physical Catalyst primary key. A non-FK column marked
  `PK` below is the KSP logical/business key: create it with
  **IsUnique = Yes** and **IsMandatory = Yes**. A field marked `PK + FK`
  is imported once with `insert` because Catalyst's FK control does not
  expose `IsUnique`.
- A column marked `FK` must be created with data type **Foreign Key** and the
  listed parent table. Catalyst stores the parent record's `ROWID`; the import
  `fk_mapping` resolves the CSV business-key value to that `ROWID`.
- Choose **On Delete = Null** for every FK. In production, deny deletion of
  referenced police records through roles/application logic; do not use Cascade
  for evidentiary data.
- Date CSV values use `YYYY-MM-DD`. DateTime values use
  `YYYY-MM-DD HH:mm:ss`. Boolean values use `true` or `false`.
- Catalyst cannot enforce composite keys. The three junction tables without a
  single PK are deduplicated and validated by `npm run schema:audit`.

## Console Steps

1. Select the correct environment: **Development** while testing, or
   **Production** only when you are ready to load production.
2. Open **Cloud Scale > Data Store > Create a new Table**.
3. Create the table using the exact case-sensitive name below.
4. Open **Schema View > + New Column** for each row in that table's section.
5. Set the data type and every flag exactly as listed. For `Var Char`, set max
   length to 255. For an FK, select the parent table and **On Delete = Null**.
6. Create all tables in the numbered order below. Parent tables must exist
   before child FK columns can be configured.
7. Before import, run `npm run schema:audit`. We will then import in the same
   numbered order using the generated CSVs and the shown FK mappings.

## Null Policy

Only `Unit.ParentUnit`, `CaseMaster.CourtID`, and
`ArrestSurrender.CourtID` are optional in the generated dataset. Every other
listed field is populated and should be mandatory. The optional court fields
represent cases that have not yet reached court; they are not fabricated.

## Schema Notes

- `Unit.ParentUnit` remains an optional `Int` because the supplied ER schema
  does not formally declare its FK relationship.
- `CrimeHeadActSection.SectionCode` remains `Var Char` for the same reason.
- `Inv_OccuranceTime.PlaceOfOccurance`, `OccuranceFrom`, and `OccuranceTo`
  are NETRA compatibility fields inferred around the matrix-listed
  `CaseMasterID`; they are explicitly documented here rather than presented
  as verbatim organizer fields.
- `ActSectionAssociation.ActID` and `SectionID` are `Var Char`, matching
  the actual `ActCode` and `SectionCode` parent key types.

## 1. State

CSV: `csv/State.csv` (3 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `StateID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `StateName` | Var Char | 255 | - | - | Yes | No | Yes | No | - | - |
| `NationalityID` | Int | - | - | - | Yes | No | No | No | - | - |
| `Active` | Boolean | - | - | - | Yes | No | No | No | true | - |

Import configuration skeleton:

```json
{
  "table_identifier": "State",
  "operation": "upsert",
  "find_by": "StateID"
}
```

## 2. District

CSV: `csv/District.csv` (12 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `DistrictID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `DistrictName` | Var Char | 255 | - | - | Yes | No | Yes | No | - | - |
| `StateID` | Foreign Key | - | FK | `State.StateID` | Yes | No | No | No | - | Null |
| `Active` | Boolean | - | - | - | Yes | No | No | No | true | - |

Import configuration skeleton:

```json
{
  "table_identifier": "District",
  "operation": "upsert",
  "find_by": "DistrictID",
  "fk_mapping": [
    { "local_column": "StateID", "reference_column": "StateID" }
  ]
}
```

## 3. UnitType

CSV: `csv/UnitType.csv` (3 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `UnitTypeID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `UnitTypeName` | Var Char | 255 | - | - | Yes | No | No | No | - | - |
| `CityDistState` | Var Char | 255 | - | - | Yes | No | No | No | - | - |
| `Hierarchy` | Int | - | - | - | Yes | No | No | No | - | - |
| `Active` | Boolean | - | - | - | Yes | No | No | No | true | - |

Import configuration skeleton:

```json
{
  "table_identifier": "UnitType",
  "operation": "upsert",
  "find_by": "UnitTypeID"
}
```

## 4. Unit

CSV: `csv/Unit.csv` (24 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `UnitID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `UnitName` | Var Char | 255 | - | - | Yes | No | Yes | No | - | - |
| `TypeID` | Foreign Key | - | FK | `UnitType.UnitTypeID` | Yes | No | No | No | - | Null |
| `ParentUnit` | Int | - | - | - | No | No | No | No | - | - |
| `NationalityID` | Int | - | - | - | Yes | No | No | No | - | - |
| `StateID` | Foreign Key | - | FK | `State.StateID` | Yes | No | No | No | - | Null |
| `DistrictID` | Foreign Key | - | FK | `District.DistrictID` | Yes | No | No | No | - | Null |
| `Active` | Boolean | - | - | - | Yes | No | No | No | true | - |

Import configuration skeleton:

```json
{
  "table_identifier": "Unit",
  "operation": "upsert",
  "find_by": "UnitID",
  "fk_mapping": [
    { "local_column": "TypeID", "reference_column": "UnitTypeID" },
    { "local_column": "StateID", "reference_column": "StateID" },
    { "local_column": "DistrictID", "reference_column": "DistrictID" }
  ]
}
```

## 5. Rank

CSV: `csv/Rank.csv` (9 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `RankID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `RankName` | Var Char | 255 | - | - | Yes | No | No | No | - | - |
| `Hierarchy` | Int | - | - | - | Yes | No | No | No | - | - |
| `Active` | Boolean | - | - | - | Yes | No | No | No | true | - |

Import configuration skeleton:

```json
{
  "table_identifier": "Rank",
  "operation": "upsert",
  "find_by": "RankID"
}
```

## 6. Designation

CSV: `csv/Designation.csv` (6 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `DesignationID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `DesignationName` | Var Char | 255 | - | - | Yes | No | No | No | - | - |
| `Active` | Boolean | - | - | - | Yes | No | No | No | true | - |
| `SortOrder` | Int | - | - | - | Yes | No | No | No | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "Designation",
  "operation": "upsert",
  "find_by": "DesignationID"
}
```

## 7. Employee

CSV: `csv/Employee.csv` (72 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `EmployeeID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `DistrictID` | Foreign Key | - | FK | `District.DistrictID` | Yes | No | No | No | - | Null |
| `UnitID` | Foreign Key | - | FK | `Unit.UnitID` | Yes | No | No | No | - | Null |
| `RankID` | Foreign Key | - | FK | `Rank.RankID` | Yes | No | No | No | - | Null |
| `DesignationID` | Foreign Key | - | FK | `Designation.DesignationID` | Yes | No | No | No | - | Null |
| `KGID` | Var Char | 255 | - | - | Yes | Yes | Yes | Yes | - | - |
| `FirstName` | Var Char | 255 | - | - | Yes | No | Yes | Yes | - | - |
| `EmployeeDOB` | Date | - | - | - | Yes | No | No | Yes | - | - |
| `GenderID` | Int | - | - | - | Yes | No | No | No | - | - |
| `BloodGroupID` | Int | - | - | - | Yes | No | No | No | - | - |
| `PhysicallyChallenged` | Boolean | - | - | - | Yes | No | No | No | false | - |
| `AppointmentDate` | Date | - | - | - | Yes | No | No | No | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "Employee",
  "operation": "upsert",
  "find_by": "EmployeeID",
  "fk_mapping": [
    { "local_column": "DistrictID", "reference_column": "DistrictID" },
    { "local_column": "UnitID", "reference_column": "UnitID" },
    { "local_column": "RankID", "reference_column": "RankID" },
    { "local_column": "DesignationID", "reference_column": "DesignationID" }
  ]
}
```

## 8. CaseCategory

CSV: `csv/CaseCategory.csv` (4 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `CaseCategoryID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `LookupValue` | Var Char | 255 | - | - | Yes | No | No | No | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "CaseCategory",
  "operation": "upsert",
  "find_by": "CaseCategoryID"
}
```

## 9. GravityOffence

CSV: `csv/GravityOffence.csv` (2 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `GravityOffenceID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `LookupValue` | Var Char | 255 | - | - | Yes | No | No | No | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "GravityOffence",
  "operation": "upsert",
  "find_by": "GravityOffenceID"
}
```

## 10. CaseStatusMaster

CSV: `csv/CaseStatusMaster.csv` (4 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `CaseStatusID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `CaseStatusName` | Var Char | 255 | - | - | Yes | No | No | No | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "CaseStatusMaster",
  "operation": "upsert",
  "find_by": "CaseStatusID"
}
```

## 11. CasteMaster

CSV: `csv/CasteMaster.csv` (5 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `caste_master_id` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `caste_master_name` | Var Char | 255 | - | - | Yes | No | No | No | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "CasteMaster",
  "operation": "upsert",
  "find_by": "caste_master_id"
}
```

## 12. ReligionMaster

CSV: `csv/ReligionMaster.csv` (6 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `ReligionID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `ReligionName` | Var Char | 255 | - | - | Yes | No | No | No | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "ReligionMaster",
  "operation": "upsert",
  "find_by": "ReligionID"
}
```

## 13. OccupationMaster

CSV: `csv/OccupationMaster.csv` (10 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `OccupationID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `OccupationName` | Var Char | 255 | - | - | Yes | No | No | No | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "OccupationMaster",
  "operation": "upsert",
  "find_by": "OccupationID"
}
```

## 14. Court

CSV: `csv/Court.csv` (12 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `CourtID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `CourtName` | Var Char | 255 | - | - | Yes | No | Yes | No | - | - |
| `DistrictID` | Foreign Key | - | FK | `District.DistrictID` | Yes | No | No | No | - | Null |
| `StateID` | Foreign Key | - | FK | `State.StateID` | Yes | No | No | No | - | Null |
| `Active` | Boolean | - | - | - | Yes | No | No | No | true | - |

Import configuration skeleton:

```json
{
  "table_identifier": "Court",
  "operation": "upsert",
  "find_by": "CourtID",
  "fk_mapping": [
    { "local_column": "DistrictID", "reference_column": "DistrictID" },
    { "local_column": "StateID", "reference_column": "StateID" }
  ]
}
```

## 15. Act

CSV: `csv/Act.csv` (4 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `ActCode` | Var Char | 255 | PK | - | Yes | Yes | Yes | No | - | - |
| `ActDescription` | Var Char | 255 | - | - | Yes | No | No | No | - | - |
| `ShortName` | Var Char | 255 | - | - | Yes | No | Yes | No | - | - |
| `Active` | Boolean | - | - | - | Yes | No | No | No | true | - |

Import configuration skeleton:

```json
{
  "table_identifier": "Act",
  "operation": "upsert",
  "find_by": "ActCode"
}
```

## 16. Section

CSV: `csv/Section.csv` (22 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `ActCode` | Foreign Key | 255 | FK | `Act.ActCode` | Yes | No | No | No | - | Null |
| `SectionCode` | Var Char | 255 | PK | - | Yes | Yes | Yes | No | - | - |
| `SectionDescription` | Var Char | 255 | - | - | Yes | No | No | No | - | - |
| `Active` | Boolean | - | - | - | Yes | No | No | No | true | - |

Import configuration skeleton:

```json
{
  "table_identifier": "Section",
  "operation": "upsert",
  "find_by": "SectionCode",
  "fk_mapping": [
    { "local_column": "ActCode", "reference_column": "ActCode" }
  ]
}
```

## 17. CrimeHead

CSV: `csv/CrimeHead.csv` (6 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `CrimeHeadID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `CrimeGroupName` | Var Char | 255 | - | - | Yes | No | Yes | No | - | - |
| `Active` | Boolean | - | - | - | Yes | No | No | No | true | - |

Import configuration skeleton:

```json
{
  "table_identifier": "CrimeHead",
  "operation": "upsert",
  "find_by": "CrimeHeadID"
}
```

## 18. CrimeSubHead

CSV: `csv/CrimeSubHead.csv` (16 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `CrimeSubHeadID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `CrimeHeadID` | Foreign Key | - | FK | `CrimeHead.CrimeHeadID` | Yes | No | No | No | - | Null |
| `CrimeHeadName` | Var Char | 255 | - | - | Yes | No | Yes | No | - | - |
| `SeqID` | Int | - | - | - | Yes | No | No | No | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "CrimeSubHead",
  "operation": "upsert",
  "find_by": "CrimeSubHeadID",
  "fk_mapping": [
    { "local_column": "CrimeHeadID", "reference_column": "CrimeHeadID" }
  ]
}
```

## 19. CrimeHeadActSection

CSV: `csv/CrimeHeadActSection.csv` (23 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `CrimeHeadID` | Foreign Key | - | FK | `CrimeHead.CrimeHeadID` | Yes | No | No | No | - | Null |
| `ActCode` | Foreign Key | 255 | FK | `Act.ActCode` | Yes | No | No | No | - | Null |
| `SectionCode` | Var Char | 255 | - | - | Yes | No | No | No | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "CrimeHeadActSection",
  "operation": "insert",
  "fk_mapping": [
    { "local_column": "CrimeHeadID", "reference_column": "CrimeHeadID" },
    { "local_column": "ActCode", "reference_column": "ActCode" }
  ]
}
```

## 20. CaseMaster

CSV: `csv/CaseMaster.csv` (500 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `CaseMasterID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `CrimeNo` | Var Char | 255 | - | - | Yes | Yes | Yes | No | - | - |
| `CaseNo` | Var Char | 255 | - | - | Yes | No | Yes | No | - | - |
| `CrimeRegisteredDate` | Date | - | - | - | Yes | No | No | No | - | - |
| `PolicePersonID` | Foreign Key | - | FK | `Employee.EmployeeID` | Yes | No | No | No | - | Null |
| `PoliceStationID` | Foreign Key | - | FK | `Unit.UnitID` | Yes | No | No | No | - | Null |
| `CaseCategoryID` | Foreign Key | - | FK | `CaseCategory.CaseCategoryID` | Yes | No | No | No | - | Null |
| `GravityOffenceID` | Foreign Key | - | FK | `GravityOffence.GravityOffenceID` | Yes | No | No | No | - | Null |
| `CrimeMajorHeadID` | Foreign Key | - | FK | `CrimeHead.CrimeHeadID` | Yes | No | No | No | - | Null |
| `CrimeMinorHeadID` | Foreign Key | - | FK | `CrimeSubHead.CrimeSubHeadID` | Yes | No | No | No | - | Null |
| `CaseStatusID` | Foreign Key | - | FK | `CaseStatusMaster.CaseStatusID` | Yes | No | No | No | - | Null |
| `CourtID` | Foreign Key | - | FK | `Court.CourtID` | No | No | No | No | - | Null |
| `IncidentFromDate` | DateTime | - | - | - | Yes | No | No | No | - | - |
| `IncidentToDate` | DateTime | - | - | - | Yes | No | No | No | - | - |
| `InfoReceivedPSDate` | DateTime | - | - | - | Yes | No | No | No | - | - |
| `latitude` | Double | - | - | - | Yes | No | No | Yes | - | - |
| `longitude` | Double | - | - | - | Yes | No | No | Yes | - | - |
| `BriefFacts` | Text | - | - | - | Yes | No | No | Yes | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "CaseMaster",
  "operation": "upsert",
  "find_by": "CaseMasterID",
  "fk_mapping": [
    { "local_column": "PolicePersonID", "reference_column": "EmployeeID" },
    { "local_column": "PoliceStationID", "reference_column": "UnitID" },
    { "local_column": "CaseCategoryID", "reference_column": "CaseCategoryID" },
    { "local_column": "GravityOffenceID", "reference_column": "GravityOffenceID" },
    { "local_column": "CrimeMajorHeadID", "reference_column": "CrimeHeadID" },
    { "local_column": "CrimeMinorHeadID", "reference_column": "CrimeSubHeadID" },
    { "local_column": "CaseStatusID", "reference_column": "CaseStatusID" },
    { "local_column": "CourtID", "reference_column": "CourtID" }
  ]
}
```

## 21. ComplainantDetails

CSV: `csv/ComplainantDetails.csv` (662 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `ComplainantID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `CaseMasterID` | Foreign Key | - | FK | `CaseMaster.CaseMasterID` | Yes | No | No | No | - | Null |
| `ComplainantName` | Var Char | 255 | - | - | Yes | No | Yes | Yes | - | - |
| `AgeYear` | Int | - | - | - | Yes | No | No | Yes | - | - |
| `OccupationID` | Foreign Key | - | FK | `OccupationMaster.OccupationID` | Yes | No | No | Yes | - | Null |
| `ReligionID` | Foreign Key | - | FK | `ReligionMaster.ReligionID` | Yes | No | No | Yes | - | Null |
| `CasteID` | Foreign Key | - | FK | `CasteMaster.caste_master_id` | Yes | No | No | Yes | - | Null |
| `GenderID` | Int | - | - | - | Yes | No | No | Yes | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "ComplainantDetails",
  "operation": "upsert",
  "find_by": "ComplainantID",
  "fk_mapping": [
    { "local_column": "CaseMasterID", "reference_column": "CaseMasterID" },
    { "local_column": "OccupationID", "reference_column": "OccupationID" },
    { "local_column": "ReligionID", "reference_column": "ReligionID" },
    { "local_column": "CasteID", "reference_column": "caste_master_id" }
  ]
}
```

## 22. Victim

CSV: `csv/Victim.csv` (564 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `VictimMasterID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `CaseMasterID` | Foreign Key | - | FK | `CaseMaster.CaseMasterID` | Yes | No | No | No | - | Null |
| `VictimName` | Var Char | 255 | - | - | Yes | No | Yes | Yes | - | - |
| `AgeYear` | Int | - | - | - | Yes | No | No | Yes | - | - |
| `GenderID` | Int | - | - | - | Yes | No | No | Yes | - | - |
| `VictimPolice` | Var Char | 255 | - | - | Yes | No | No | No | 0 | - |

Import configuration skeleton:

```json
{
  "table_identifier": "Victim",
  "operation": "upsert",
  "find_by": "VictimMasterID",
  "fk_mapping": [
    { "local_column": "CaseMasterID", "reference_column": "CaseMasterID" }
  ]
}
```

## 23. Accused

CSV: `csv/Accused.csv` (703 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `AccusedMasterID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `CaseMasterID` | Foreign Key | - | FK | `CaseMaster.CaseMasterID` | Yes | No | No | No | - | Null |
| `AccusedName` | Var Char | 255 | - | - | Yes | No | Yes | Yes | - | - |
| `AgeYear` | Int | - | - | - | Yes | No | No | Yes | - | - |
| `GenderID` | Int | - | - | - | Yes | No | No | Yes | - | - |
| `PersonID` | Var Char | 255 | - | - | Yes | No | No | Yes | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "Accused",
  "operation": "upsert",
  "find_by": "AccusedMasterID",
  "fk_mapping": [
    { "local_column": "CaseMasterID", "reference_column": "CaseMasterID" }
  ]
}
```

## 24. ActSectionAssociation

CSV: `csv/ActSectionAssociation.csv` (731 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `CaseMasterID` | Foreign Key | - | FK | `CaseMaster.CaseMasterID` | Yes | No | No | No | - | Null |
| `ActID` | Foreign Key | 255 | FK | `Act.ActCode` | Yes | No | No | No | - | Null |
| `SectionID` | Foreign Key | 255 | FK | `Section.SectionCode` | Yes | No | No | No | - | Null |
| `ActOrderID` | Int | - | - | - | Yes | No | No | No | - | - |
| `SectionOrderID` | Int | - | - | - | Yes | No | No | No | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "ActSectionAssociation",
  "operation": "insert",
  "fk_mapping": [
    { "local_column": "CaseMasterID", "reference_column": "CaseMasterID" },
    { "local_column": "ActID", "reference_column": "ActCode" },
    { "local_column": "SectionID", "reference_column": "SectionCode" }
  ]
}
```

## 25. Inv_OccuranceTime

CSV: `csv/Inv_OccuranceTime.csv` (500 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `CaseMasterID` | Foreign Key | - | PK + FK | `CaseMaster.CaseMasterID` | Yes | No | No | No | - | Null |
| `PlaceOfOccurance` | Var Char | 255 | - | - | Yes | No | No | No | - | - |
| `OccuranceFrom` | DateTime | - | - | - | Yes | No | No | No | - | - |
| `OccuranceTo` | DateTime | - | - | - | Yes | No | No | No | - | - |

Import configuration skeleton:

```json
{
  "table_identifier": "Inv_OccuranceTime",
  "operation": "insert",
  "fk_mapping": [
    { "local_column": "CaseMasterID", "reference_column": "CaseMasterID" }
  ]
}
```

## 26. ArrestSurrender

CSV: `csv/ArrestSurrender.csv` (251 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `ArrestSurrenderID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `CaseMasterID` | Foreign Key | - | FK | `CaseMaster.CaseMasterID` | Yes | No | No | No | - | Null |
| `ArrestSurrenderTypeID` | Int | - | - | - | Yes | No | No | No | - | - |
| `ArrestSurrenderDate` | Date | - | - | - | Yes | No | No | No | - | - |
| `ArrestSurrenderStateId` | Foreign Key | - | FK | `State.StateID` | Yes | No | No | No | - | Null |
| `ArrestSurrenderDistrictId` | Foreign Key | - | FK | `District.DistrictID` | Yes | No | No | No | - | Null |
| `PoliceStationID` | Foreign Key | - | FK | `Unit.UnitID` | Yes | No | No | No | - | Null |
| `IOID` | Foreign Key | - | FK | `Employee.EmployeeID` | Yes | No | No | No | - | Null |
| `CourtID` | Foreign Key | - | FK | `Court.CourtID` | No | No | No | No | - | Null |
| `AccusedMasterID` | Foreign Key | - | FK | `Accused.AccusedMasterID` | Yes | No | No | No | - | Null |
| `IsAccused` | Boolean | - | - | - | Yes | No | No | No | true | - |
| `IsComplainantAccused` | Boolean | - | - | - | Yes | No | No | No | false | - |

Import configuration skeleton:

```json
{
  "table_identifier": "ArrestSurrender",
  "operation": "upsert",
  "find_by": "ArrestSurrenderID",
  "fk_mapping": [
    { "local_column": "CaseMasterID", "reference_column": "CaseMasterID" },
    { "local_column": "ArrestSurrenderStateId", "reference_column": "StateID" },
    { "local_column": "ArrestSurrenderDistrictId", "reference_column": "DistrictID" },
    { "local_column": "PoliceStationID", "reference_column": "UnitID" },
    { "local_column": "IOID", "reference_column": "EmployeeID" },
    { "local_column": "CourtID", "reference_column": "CourtID" },
    { "local_column": "AccusedMasterID", "reference_column": "AccusedMasterID" }
  ]
}
```

## 27. inv_arrestsurrenderaccused

CSV: `csv/inv_arrestsurrenderaccused.csv` (251 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `ArrestSurrenderID` | Foreign Key | - | FK | `ArrestSurrender.ArrestSurrenderID` | Yes | No | No | No | - | Null |
| `AccusedMasterID` | Foreign Key | - | FK | `Accused.AccusedMasterID` | Yes | No | No | No | - | Null |

Import configuration skeleton:

```json
{
  "table_identifier": "inv_arrestsurrenderaccused",
  "operation": "insert",
  "fk_mapping": [
    { "local_column": "ArrestSurrenderID", "reference_column": "ArrestSurrenderID" },
    { "local_column": "AccusedMasterID", "reference_column": "AccusedMasterID" }
  ]
}
```

## 28. ChargesheetDetails

CSV: `csv/ChargesheetDetails.csv` (191 rows)

| Column | Catalyst type | Max length | Logical key | Parent business key | Mandatory | Unique | Search | PII | Default | On delete |
|---|---|---:|---|---|---|---|---|---|---|---|
| `CSID` | Int | - | PK | - | Yes | Yes | No | No | - | - |
| `CaseMasterID` | Foreign Key | - | FK | `CaseMaster.CaseMasterID` | Yes | No | No | No | - | Null |
| `csdate` | Date | - | - | - | Yes | No | No | No | - | - |
| `cstype` | Var Char | 255 | - | - | Yes | No | No | No | - | - |
| `PolicePersonID` | Foreign Key | - | FK | `Employee.EmployeeID` | Yes | No | No | No | - | Null |

Import configuration skeleton:

```json
{
  "table_identifier": "ChargesheetDetails",
  "operation": "upsert",
  "find_by": "CSID",
  "fk_mapping": [
    { "local_column": "CaseMasterID", "reference_column": "CaseMasterID" },
    { "local_column": "PolicePersonID", "reference_column": "EmployeeID" }
  ]
}
```
