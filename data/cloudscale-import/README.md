# NETRA Cloud Scale CSV Import

Generated from `data/netra.db` by `npm run cloudscale:export`.

Use these denormalized, prototype-facing tables first. They match the tables
already read by the Cloud Scale adapter: `Firs`, `Cases`, and `Criminals`,
and add the link/detail tables needed to move the remaining prototype screens
off local SQLite.

## Normalized KSP ER Schema

The bundled SQLite source also contains all 28 tables named by
`Police_FIR_ER_Diagram.pdf`. Run the repeatable contract check before an export
or demo:

```bash
npm run schema:audit
```

The audit checks table and column names, required demo values, and every
declared foreign key. The Database workspace separates these normalized tables
under **KSP ER schema** from NETRA's denormalized **Operational** read models.
Optional unknown values are preserved and displayed as `Not recorded`; they are
not replaced with invented police data.

The CSVs below are the operational Cloud Scale read models used by the live
dashboard, assistant, maps, network, and case screens. A normalized ER table is
read live when a same-named table exists in the selected Catalyst environment;
otherwise the Database workspace clearly labels its bundled synchronized
schema snapshot.

## Import Order

1. `Firs`, `Cases`, `Criminals`
2. `FirCriminals`, `Arrests`, `Victims`, `Complainants`, `Evidence`
3. `Relationships`, `Phones`, `Vehicles`, `Addresses`, `Organizations`, `OrgMembers`, `Weapons`
4. `Chargesheets`, `PoliceStations`, `AuditLogs` if the matching screens need them

The id/link columns are typed as `Int` for easy CSV import. You can convert
them to Catalyst `Foreign Key` fields later if you wire table relationships
manually in the console.

## Function Allowlist

After importing beyond the first three tables, set the `ai_quickml` Function
environment variable:

```
DATASTORE_TABLES=Firs,Cases,Criminals,FirCriminals,Arrests,Victims,Complainants,Evidence,Relationships,Phones,Vehicles,Addresses,Organizations,OrgMembers,Weapons,Chargesheets,PoliceStations,AuditLogs,Notifications,OcrResult
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
