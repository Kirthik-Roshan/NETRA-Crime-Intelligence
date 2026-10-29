# NETRA Official KSP Cloud Scale Import

Generated from the 28 normalized KSP tables in `data/netra.db` by
`npm run cloudscale:export`. The legacy prototype-facing operational views
are deliberately excluded. Every generated field uses a Catalyst-supported
Cloud Scale type.

## Schema Contract

Run the repeatable fidelity check before an export or deployment:

```bash
npm run schema:audit
```

The audit verifies all 28 official tables and columns, required values, date
values, storage types, and every declared foreign-key relationship. Optional
unknown values remain empty and are shown in NETRA as `Not recorded`.

## Import Order

1. KSP lookup tables: `State` through `CrimeSubHead` in the generated CSV table below.
2. KSP transactional tables: `CaseMaster`, then complainant, victim, accused,
   arrest, occurrence and chargesheet tables.

The generated CSVs keep relationship columns as `Int` so Catalyst can import
them before foreign-key wiring. The schema manifest records every PK/FK target.

## Function Allowlist

Set the `ai_quickml` Function environment variable to the generated official
allowlist. `Evidence`, `Notifications`, and `OcrResult` are isolated
platform-output tables; they are not substituted crime-source tables.

```
DATASTORE_TABLES=State,District,UnitType,Unit,Rank,Designation,Employee,CaseCategory,GravityOffence,CaseStatusMaster,CasteMaster,ReligionMaster,OccupationMaster,Court,Act,Section,CrimeHead,CrimeSubHead,CrimeHeadActSection,CaseMaster,ComplainantDetails,Victim,Accused,ActSectionAssociation,Inv_OccuranceTime,ArrestSurrender,inv_arrestsurrenderaccused,ChargesheetDetails,Evidence,Notifications,OcrResult
```

## CSV Files

| Cloud Scale table | CSV | Rows | Tier | Why it matters |
|---|---:|---:|---|---|
| `State` | `csv/State.csv` | 3 | ksp_er | Official normalized KSP FIR schema table. |
| `District` | `csv/District.csv` | 12 | ksp_er | Official normalized KSP FIR schema table. |
| `UnitType` | `csv/UnitType.csv` | 3 | ksp_er | Official normalized KSP FIR schema table. |
| `Unit` | `csv/Unit.csv` | 24 | ksp_er | Official normalized KSP FIR schema table. |
| `Rank` | `csv/Rank.csv` | 9 | ksp_er | Official normalized KSP FIR schema table. |
| `Designation` | `csv/Designation.csv` | 6 | ksp_er | Official normalized KSP FIR schema table. |
| `Employee` | `csv/Employee.csv` | 72 | ksp_er | Official normalized KSP FIR schema table. |
| `CaseCategory` | `csv/CaseCategory.csv` | 4 | ksp_er | Official normalized KSP FIR schema table. |
| `GravityOffence` | `csv/GravityOffence.csv` | 2 | ksp_er | Official normalized KSP FIR schema table. |
| `CaseStatusMaster` | `csv/CaseStatusMaster.csv` | 4 | ksp_er | Official normalized KSP FIR schema table. |
| `CasteMaster` | `csv/CasteMaster.csv` | 5 | ksp_er | Official normalized KSP FIR schema table. |
| `ReligionMaster` | `csv/ReligionMaster.csv` | 6 | ksp_er | Official normalized KSP FIR schema table. |
| `OccupationMaster` | `csv/OccupationMaster.csv` | 10 | ksp_er | Official normalized KSP FIR schema table. |
| `Court` | `csv/Court.csv` | 12 | ksp_er | Official normalized KSP FIR schema table. |
| `Act` | `csv/Act.csv` | 4 | ksp_er | Official normalized KSP FIR schema table. |
| `Section` | `csv/Section.csv` | 22 | ksp_er | Official normalized KSP FIR schema table. |
| `CrimeHead` | `csv/CrimeHead.csv` | 6 | ksp_er | Official normalized KSP FIR schema table. |
| `CrimeSubHead` | `csv/CrimeSubHead.csv` | 16 | ksp_er | Official normalized KSP FIR schema table. |
| `CrimeHeadActSection` | `csv/CrimeHeadActSection.csv` | 23 | ksp_er | Official normalized KSP FIR schema table. |
| `CaseMaster` | `csv/CaseMaster.csv` | 500 | ksp_er | Official normalized KSP FIR schema table. |
| `ComplainantDetails` | `csv/ComplainantDetails.csv` | 662 | ksp_er | Official normalized KSP FIR schema table. |
| `Victim` | `csv/Victim.csv` | 564 | ksp_er | Official normalized KSP FIR schema table. |
| `Accused` | `csv/Accused.csv` | 703 | ksp_er | Official normalized KSP FIR schema table. |
| `ActSectionAssociation` | `csv/ActSectionAssociation.csv` | 731 | ksp_er | Official normalized KSP FIR schema table. |
| `Inv_OccuranceTime` | `csv/Inv_OccuranceTime.csv` | 500 | ksp_er | Official normalized KSP FIR schema table. |
| `ArrestSurrender` | `csv/ArrestSurrender.csv` | 251 | ksp_er | Official normalized KSP FIR schema table. |
| `inv_arrestsurrenderaccused` | `csv/inv_arrestsurrenderaccused.csv` | 251 | ksp_er | Official normalized KSP FIR schema table. |
| `ChargesheetDetails` | `csv/ChargesheetDetails.csv` | 191 | ksp_er | Official normalized KSP FIR schema table. |

## Runtime-Only Tables

These have no seed CSV because the app writes them at runtime.

| Cloud Scale table | Tier | Why it matters | Fields |
|---|---|---|---|
| `Evidence` | runtime | Runtime evidence chain-of-custody metadata linked to official CaseMaster records. | `id` Int, `fir_id` Int, `type` Var Char, `description` Text, `collected_at` DateTime, `storage_ref` Text |
| `Notifications` | runtime | Runtime notification read/archive state used by the bell menu. | `ts` DateTime, `kind` Var Char, `severity` Var Char, `title` Var Char, `detail` Text, `entity` Var Char, `entity_id` Var Char, `status` Var Char |
| `OcrResult` | runtime | Runtime Zia OCR persistence table used by Scan document. | `ocr_text` Text, `language` Var Char, `source_key` Text, `source_name` Var Char |

## Field Types

### State

| Column | Catalyst type |
|---|---|
| `StateID` | Int |
| `StateName` | Var Char |
| `NationalityID` | Int |
| `Active` | Boolean |

### District

| Column | Catalyst type |
|---|---|
| `DistrictID` | Int |
| `DistrictName` | Var Char |
| `StateID` | Int |
| `Active` | Boolean |

### UnitType

| Column | Catalyst type |
|---|---|
| `UnitTypeID` | Int |
| `UnitTypeName` | Var Char |
| `CityDistState` | Var Char |
| `Hierarchy` | Int |
| `Active` | Boolean |

### Unit

| Column | Catalyst type |
|---|---|
| `UnitID` | Int |
| `UnitName` | Var Char |
| `TypeID` | Int |
| `ParentUnit` | Int |
| `NationalityID` | Int |
| `StateID` | Int |
| `DistrictID` | Int |
| `Active` | Boolean |

### Rank

| Column | Catalyst type |
|---|---|
| `RankID` | Int |
| `RankName` | Var Char |
| `Hierarchy` | Int |
| `Active` | Boolean |

### Designation

| Column | Catalyst type |
|---|---|
| `DesignationID` | Int |
| `DesignationName` | Var Char |
| `Active` | Boolean |
| `SortOrder` | Int |

### Employee

| Column | Catalyst type |
|---|---|
| `EmployeeID` | Int |
| `DistrictID` | Int |
| `UnitID` | Int |
| `RankID` | Int |
| `DesignationID` | Int |
| `KGID` | Var Char |
| `FirstName` | Var Char |
| `EmployeeDOB` | Date |
| `GenderID` | Int |
| `BloodGroupID` | Int |
| `PhysicallyChallenged` | Boolean |
| `AppointmentDate` | Date |

### CaseCategory

| Column | Catalyst type |
|---|---|
| `CaseCategoryID` | Int |
| `LookupValue` | Var Char |

### GravityOffence

| Column | Catalyst type |
|---|---|
| `GravityOffenceID` | Int |
| `LookupValue` | Var Char |

### CaseStatusMaster

| Column | Catalyst type |
|---|---|
| `CaseStatusID` | Int |
| `CaseStatusName` | Var Char |

### CasteMaster

| Column | Catalyst type |
|---|---|
| `caste_master_id` | Int |
| `caste_master_name` | Var Char |

### ReligionMaster

| Column | Catalyst type |
|---|---|
| `ReligionID` | Int |
| `ReligionName` | Var Char |

### OccupationMaster

| Column | Catalyst type |
|---|---|
| `OccupationID` | Int |
| `OccupationName` | Var Char |

### Court

| Column | Catalyst type |
|---|---|
| `CourtID` | Int |
| `CourtName` | Var Char |
| `DistrictID` | Int |
| `StateID` | Int |
| `Active` | Boolean |

### Act

| Column | Catalyst type |
|---|---|
| `ActCode` | Var Char |
| `ActDescription` | Var Char |
| `ShortName` | Var Char |
| `Active` | Boolean |

### Section

| Column | Catalyst type |
|---|---|
| `ActCode` | Var Char |
| `SectionCode` | Var Char |
| `SectionDescription` | Var Char |
| `Active` | Boolean |

### CrimeHead

| Column | Catalyst type |
|---|---|
| `CrimeHeadID` | Int |
| `CrimeGroupName` | Var Char |
| `Active` | Boolean |

### CrimeSubHead

| Column | Catalyst type |
|---|---|
| `CrimeSubHeadID` | Int |
| `CrimeHeadID` | Int |
| `CrimeHeadName` | Var Char |
| `SeqID` | Int |

### CrimeHeadActSection

| Column | Catalyst type |
|---|---|
| `CrimeHeadID` | Int |
| `ActCode` | Var Char |
| `SectionCode` | Var Char |

### CaseMaster

| Column | Catalyst type |
|---|---|
| `CaseMasterID` | Int |
| `CrimeNo` | Var Char |
| `CaseNo` | Var Char |
| `CrimeRegisteredDate` | Date |
| `PolicePersonID` | Int |
| `PoliceStationID` | Int |
| `CaseCategoryID` | Int |
| `GravityOffenceID` | Int |
| `CrimeMajorHeadID` | Int |
| `CrimeMinorHeadID` | Int |
| `CaseStatusID` | Int |
| `CourtID` | Int |
| `IncidentFromDate` | DateTime |
| `IncidentToDate` | DateTime |
| `InfoReceivedPSDate` | DateTime |
| `latitude` | Double |
| `longitude` | Double |
| `BriefFacts` | Text |

### ComplainantDetails

| Column | Catalyst type |
|---|---|
| `ComplainantID` | Int |
| `CaseMasterID` | Int |
| `ComplainantName` | Var Char |
| `AgeYear` | Int |
| `OccupationID` | Int |
| `ReligionID` | Int |
| `CasteID` | Int |
| `GenderID` | Int |

### Victim

| Column | Catalyst type |
|---|---|
| `VictimMasterID` | Int |
| `CaseMasterID` | Int |
| `VictimName` | Var Char |
| `AgeYear` | Int |
| `GenderID` | Int |
| `VictimPolice` | Var Char |

### Accused

| Column | Catalyst type |
|---|---|
| `AccusedMasterID` | Int |
| `CaseMasterID` | Int |
| `AccusedName` | Var Char |
| `AgeYear` | Int |
| `GenderID` | Int |
| `PersonID` | Var Char |

### ActSectionAssociation

| Column | Catalyst type |
|---|---|
| `CaseMasterID` | Int |
| `ActID` | Var Char |
| `SectionID` | Var Char |
| `ActOrderID` | Int |
| `SectionOrderID` | Int |

### Inv_OccuranceTime

| Column | Catalyst type |
|---|---|
| `CaseMasterID` | Int |
| `PlaceOfOccurance` | Var Char |
| `OccuranceFrom` | DateTime |
| `OccuranceTo` | DateTime |

### ArrestSurrender

| Column | Catalyst type |
|---|---|
| `ArrestSurrenderID` | Int |
| `CaseMasterID` | Int |
| `ArrestSurrenderTypeID` | Int |
| `ArrestSurrenderDate` | Date |
| `ArrestSurrenderStateId` | Int |
| `ArrestSurrenderDistrictId` | Int |
| `PoliceStationID` | Int |
| `IOID` | Int |
| `CourtID` | Int |
| `AccusedMasterID` | Int |
| `IsAccused` | Boolean |
| `IsComplainantAccused` | Boolean |

### inv_arrestsurrenderaccused

| Column | Catalyst type |
|---|---|
| `ArrestSurrenderID` | Int |
| `AccusedMasterID` | Int |

### ChargesheetDetails

| Column | Catalyst type |
|---|---|
| `CSID` | Int |
| `CaseMasterID` | Int |
| `csdate` | Date |
| `cstype` | Var Char |
| `PolicePersonID` | Int |

### Evidence

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `fir_id` | Int |
| `type` | Var Char |
| `description` | Text |
| `collected_at` | DateTime |
| `storage_ref` | Text |

### Notifications

| Column | Catalyst type |
|---|---|
| `ts` | DateTime |
| `kind` | Var Char |
| `severity` | Var Char |
| `title` | Var Char |
| `detail` | Text |
| `entity` | Var Char |
| `entity_id` | Var Char |
| `status` | Var Char |

### OcrResult

| Column | Catalyst type |
|---|---|
| `ocr_text` | Text |
| `language` | Var Char |
| `source_key` | Text |
| `source_name` | Var Char |
