# NETRA Cloud Scale CSV Import

Generated from `data/netra.db` by `npm run cloudscale:export`.

This package now contains both the prototype-facing operational tables and all
28 normalized tables from `Police_FIR_ER_Diagram.pdf`. Every generated field
uses a Catalyst Cloud Scale-supported type.

## Schema Contract

Run the repeatable fidelity check before an export or deployment:

```bash
npm run schema:audit
```

The audit verifies all 28 official tables and columns, required values, date
values, storage types, and every declared foreign-key relationship. Optional
unknown values remain empty and are shown in NETRA as `Not recorded`.

## Import Order

1. Operational application tables: `Firs`, `Cases`, `Criminals`, then their detail/link tables.
2. ER lookup tables: `State` through `CrimeSubHead` in the generated CSV table below.
3. ER transactional tables: `CaseMaster`, then complainant/victim/accused/arrest/chargesheet tables.

The generated CSVs keep relationship columns as `Int` so Catalyst can import
them before foreign-key wiring. The schema manifest records every PK/FK target.

## Function Allowlist

After importing beyond the first three tables, set the `ai_quickml` Function
environment variable:

```
DATASTORE_TABLES=Firs,Cases,Criminals,FirCriminals,Arrests,Victims,Complainants,Evidence,Relationships,Phones,Vehicles,Addresses,Organizations,OrgMembers,Weapons,Chargesheets,PoliceStations,AuditLogs,Notifications,OcrResult,State,District,UnitType,Unit,Rank,Designation,Employee,CaseCategory,GravityOffence,CaseStatusMaster,CasteMaster,ReligionMaster,OccupationMaster,Court,Act,Section,CrimeHead,CrimeSubHead,CrimeHeadActSection,CaseMaster,ComplainantDetails,Victim,Accused,ActSectionAssociation,Inv_OccuranceTime,ArrestSurrender,inv_arrestsurrenderaccused,ChargesheetDetails
```

## CSV Files

| Cloud Scale table | CSV | Rows | Tier | Why it matters |
|---|---:|---:|---|---|
| `Firs` | `csv/Firs.csv` | 500 | must_import | Dashboard, maps, assistant search, predictions, FIR detail context. |
| `Cases` | `csv/Cases.csv` | 500 | must_import | Cases list, analytics, reports, case workspaces. |
| `Criminals` | `csv/Criminals.csv` | 70 | must_import | Criminal list, high-risk people, prediction and network seeds. |
| `FirCriminals` | `csv/FirCriminals.csv` | 703 | must_import | Links FIRs to resolved criminal profiles. |
| `Arrests` | `csv/Arrests.csv` | 251 | important | Arrest timelines, dashboard arrest counts, criminal profiles. |
| `Victims` | `csv/Victims.csv` | 564 | important | Case detail and demographic analytics. |
| `Complainants` | `csv/Complainants.csv` | 662 | important | Case detail and complainant occupation analytics. |
| `Evidence` | `csv/Evidence.csv` | 605 | important | Case timeline, evidence list, OCR/storage references. |
| `Relationships` | `csv/Relationships.csv` | 1159 | network | Knowledge graph edges for the network explorer. |
| `Phones` | `csv/Phones.csv` | 95 | network | Phone nodes and criminal profile contact data. |
| `Vehicles` | `csv/Vehicles.csv` | 45 | network | Vehicle nodes and criminal profile vehicle data. |
| `Addresses` | `csv/Addresses.csv` | 103 | network | Address nodes, map enrichment, criminal profile locations. |
| `Organizations` | `csv/Organizations.csv` | 6 | network | Gang/syndicate nodes. |
| `OrgMembers` | `csv/OrgMembers.csv` | 43 | network | Links organizations to criminal profiles. |
| `Weapons` | `csv/Weapons.csv` | 5 | detail | Criminal profile weapon associations. |
| `Chargesheets` | `csv/Chargesheets.csv` | 191 | detail | Case detail final-report/court panel. |
| `PoliceStations` | `csv/PoliceStations.csv` | 24 | support | Station names/codes for filters and display. |
| `AuditLogs` | `csv/AuditLogs.csv` | 64 | optional | Admin demo audit trail. Skip for public demo if you do not want seeded user activity. |
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
| `Notifications` | runtime | Runtime notification read/archive state used by the bell menu. | `ts` DateTime, `kind` Var Char, `severity` Var Char, `title` Var Char, `detail` Text, `entity` Var Char, `entity_id` Var Char, `status` Var Char |
| `OcrResult` | runtime | Runtime Zia OCR persistence table used by Scan document. | `ocr_text` Text, `language` Var Char, `source_key` Text, `source_name` Var Char |

## Field Types

### Firs

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `fir_number` | Var Char |
| `station_id` | Int |
| `crime_type` | Var Char |
| `ipc_sections` | Text |
| `district` | Var Char |
| `taluk` | Var Char |
| `lat` | Double |
| `lng` | Double |
| `occurred_at` | DateTime |
| `reported_at` | DateTime |
| `status` | Var Char |
| `severity` | Var Char |
| `modus` | Var Char |
| `description` | Text |

### Cases

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `case_number` | Var Char |
| `title` | Text |
| `fir_id` | Int |
| `status` | Var Char |
| `case_priority` | Var Char |
| `assigned_officer` | Int |
| `officer` | Var Char |
| `district` | Var Char |
| `opened_at` | DateTime |
| `updated_at` | DateTime |
| `summary` | Text |
| `crime_type` | Var Char |

### Criminals

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `name` | Var Char |
| `aliases` | Text |
| `gender` | Var Char |
| `age` | Int |
| `status` | Var Char |
| `risk_score` | Int |
| `crime_category` | Var Char |
| `known_locations` | Text |
| `home_district` | Var Char |
| `first_seen` | DateTime |
| `photo_seed` | Var Char |
| `notes` | Text |
| `fir_count` | Int |
| `arrest_count` | Int |

### FirCriminals

| Column | Catalyst type |
|---|---|
| `fir_id` | Int |
| `criminal_id` | Int |
| `role` | Var Char |

### Arrests

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `criminal_id` | Int |
| `fir_id` | Int |
| `arrested_at` | DateTime |
| `arresting_officer` | Var Char |
| `district` | Var Char |
| `arrest_type` | Var Char |

### Victims

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `fir_id` | Int |
| `name` | Var Char |
| `gender` | Var Char |
| `age` | Int |

### Complainants

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `fir_id` | Int |
| `name` | Var Char |
| `age` | Int |
| `gender` | Var Char |
| `occupation` | Var Char |
| `religion` | Var Char |

### Evidence

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `fir_id` | Int |
| `type` | Var Char |
| `description` | Text |
| `collected_at` | DateTime |
| `storage_ref` | Text |

### Relationships

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `source_type` | Var Char |
| `source_id` | Int |
| `target_type` | Var Char |
| `target_id` | Int |
| `rel_type` | Var Char |
| `confidence` | Double |
| `frequency` | Int |
| `note` | Text |

### Phones

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `number` | Var Char |
| `carrier` | Var Char |
| `owner_criminal_id` | Int |

### Vehicles

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `plate` | Var Char |
| `make` | Var Char |
| `model` | Var Char |
| `color` | Var Char |
| `type` | Var Char |
| `owner_criminal_id` | Int |

### Addresses

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `criminal_id` | Int |
| `type` | Var Char |
| `line` | Text |
| `district` | Var Char |
| `lat` | Double |
| `lng` | Double |

### Organizations

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `name` | Var Char |
| `type` | Var Char |
| `district` | Var Char |
| `notes` | Text |

### OrgMembers

| Column | Catalyst type |
|---|---|
| `org_id` | Int |
| `criminal_id` | Int |
| `role` | Var Char |

### Weapons

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `criminal_id` | Int |
| `fir_id` | Int |
| `type` | Var Char |
| `description` | Text |

### Chargesheets

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `fir_id` | Int |
| `csdate` | DateTime |
| `cstype` | Var Char |
| `final_report` | Var Char |
| `police_person_id` | Int |
| `court` | Var Char |

### PoliceStations

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `station_code` | Var Char |
| `name` | Var Char |
| `district` | Var Char |

### AuditLogs

| Column | Catalyst type |
|---|---|
| `id` | Int |
| `ts` | DateTime |
| `user_id` | Int |
| `username` | Var Char |
| `role` | Var Char |
| `action` | Var Char |
| `entity` | Var Char |
| `entity_id` | Var Char |
| `request_id` | Var Char |
| `ai_model` | Var Char |
| `processing_ms` | Int |
| `detail` | Text |

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
| `OccuranceFrom` | Var Char |
| `OccuranceTo` | Var Char |

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
