# Catalyst Search Setup

NETRA searches the official KSP schema. If Catalyst Search is unavailable or a
column is not indexed, the Function performs a bounded relational scan over the
same official records and reports `ksp-relational-scan`.

In **Cloud Scale → Data Store → Schema View**, enable Search Index for:

- `CaseMaster`: `CrimeNo`, `CaseNo`, `BriefFacts`
- `Accused`: `AccusedName`, `PersonID`
- `ComplainantDetails`: `ComplainantName`
- `Victim`: `VictimName`
- `CrimeSubHead`: `CrimeHeadName`
- `Unit`: `UnitName`
- `District`: `DistrictName`
- optional `Evidence`: `type`, `description`, `storage_ref`

Repeat the configuration in every environment whose Function will be called.
Wait for Catalyst's indexing-complete notification before verification.

```bash
curl -sS -X POST \
  -H 'Content-Type: text/plain' \
  --data '{"mode":"search:records","query":"burglary Mysuru","max":5}' \
  https://ksphacks-60080085094.catalystserverless.in/server/ai_quickml/
```

Expected engines are `catalyst-search+ksp-relational` or, if Search is not
available, `ksp-relational-scan`. Both paths return official KSP-derived rows.
