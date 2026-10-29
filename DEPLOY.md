# Deploying NETRA On Zoho Catalyst

NETRA uses a static Next.js Web Client/Slate frontend and the `ai_quickml`
Advanced I/O Function. The Function is the only gateway to Cloud Scale,
QuickML, Zia, Stratus, Cache, SmartBrowz, and Catalyst Authentication.

## 1. Preflight

Run from the repository root:

```bash
npm install
npm run schema:audit
npm run read-model:test
npm run build
npm run build:catalyst
node --check functions/ai_quickml/index.js
node --check functions/ai_quickml/platform.js
node --check functions/ai_quickml/ksp-read-model.js
```

Expected data checks:

- 28/28 official ER tables present;
- zero required-value, date/type, and foreign-key issues;
- non-zero derived FIR/case/accused/link counts.

## 2. Required Cloud Scale Tables

Create and import the 28 case-sensitive table names documented in
[`data/cloudscale-import/KSP-CLOUDSCALE-CREATION.md`](./data/cloudscale-import/KSP-CLOUDSCALE-CREATION.md).
The generated CSVs are under `data/cloudscale-import/csv`.

Create these separate platform-output tables only if their features are used:

- `Evidence`: evidence analysis metadata linked by official `CaseMasterID`.
- `Notifications`: application notification state.
- `OcrResult`: OCR output metadata.

Do not create/import the former prototype tables (`Firs`, `Cases`,
`Criminals`, and similar). Those names now exist only as transient Function
read models.

## 3. Function Configuration

Keep secrets in **Serverless → Functions → ai_quickml → Configuration**, not in
source control. Use `.env.example` as the variable checklist. The allowlist is:

```text
State,District,UnitType,Unit,Rank,Designation,Employee,CaseCategory,GravityOffence,CaseStatusMaster,CasteMaster,ReligionMaster,OccupationMaster,Court,Act,Section,CrimeHead,CrimeSubHead,CrimeHeadActSection,CaseMaster,ComplainantDetails,Victim,Accused,ActSectionAssociation,Inv_OccuranceTime,ArrestSurrender,inv_arrestsurrenderaccused,ChargesheetDetails,Evidence,Notifications,OcrResult
```

Set `NEXT_PUBLIC_AI_FN_URL` only when overriding automatic environment routing.
For a production build its value must be the production URL:

```text
https://ksphacks-60080085094.catalystserverless.in/server/ai_quickml/
```

## 4. Deploy To Development

The Catalyst CLI deploy command targets Development:

```bash
npm run release:gate
catalyst deploy --only functions:ai_quickml,client
npm run release:live
npm run evidence:test
npm run voice:test
```

Development Web Client:

```text
https://ksphacks-60080085094.development.catalystserverless.in/app/index.html
```

Smoke-test the Function:

```bash
curl -sS -X POST \
  -H 'Content-Type: text/plain' \
  --data '{"mode":"infra:health"}' \
  https://ksphacks-60080085094.development.catalystserverless.in/server/ai_quickml/
```

## 5. Promote To Production

Catalyst Function promotion is console-managed:

1. Open the Catalyst console in **Development**.
2. Open **Settings → Environments** and start a deployment.
3. Select the updated `ai_quickml` Function and Web Client code/configuration.
4. Do not select deletions or empty Development Data Store data when Production
   already contains the verified 28-table import.
5. Review the diff, add release notes, and initiate deployment.
6. Wait for the environment deployment to complete before testing Production.

Any later Development code change requires another promotion before it appears
at the production Function URL.

### Production social-login callback

Configure this exact URI as the provider's web OAuth redirect URI. It is the
Production callback shown by Catalyst for ZAID `50044437015`:

```text
https://ksphacks-60080085094.catalystserverless.in/accounts/pfs/50044437015/clientidpcallback
```

- Google: add it under **Authorized redirect URIs** and add
  `https://ksphacks-60080085094.catalystserverless.in` under authorized origins.
- Microsoft Entra: add it as a **Web** redirect URI. The URI must match exactly,
  including host, path, case, and absence of a trailing slash.
- Facebook Login: add it under **Valid OAuth Redirect URIs**, add the Production
  host as an app domain, and make the Meta app Live/active. A Development-mode
  Meta app only permits accounts assigned an app role.

Provider activation and callback allowlists live in Google, Microsoft, and Meta
developer consoles; deploying NETRA code cannot change them.

## 6. Deploy Slate

Build the root-hosted artifact, then deploy the linked Slate app:

```bash
npm run build
catalyst deploy slate netra-crime-intelligence-r2 --production \
  -m "Official KSP schema read model"
```

Do this after the Production Function is current. Public Slate hosts prefer the
Production Function and fall back to Development only on endpoint failure.

## 7. Production Verification

Verify all of the following before deleting former prototype tables:

1. `infra:health` returns `read_model: ksp-er-v2` and lists 28 official tables.
2. `records:bundle` returns non-zero `Firs`, `Cases`, `Criminals`, and links.
3. dashboard, cases, accused, maps, network, predictions and reports load.
4. Assistant resolves a known official `Accused.AccusedName` and cites FIRs.
5. Database Explorer lists exactly the 28 official tables and live row counts.
6. Evidence uploads persist metadata and produce an audit identifier.
7. direct refresh works on `/assistant/`, `/cases/record?id=...`, and all other
   static routes.
8. all four configured social providers complete login, logout and a fresh
   login after session removal.

Only after these checks pass should the old physical operational tables be
deleted from Production.

## Troubleshooting

| Symptom | Resolution |
|---|---|
| Development views return zero | Import official rows into Development, or test the Production Function after promotion. |
| Production says Function not configured | Promote the latest Function configuration and code through Environments. |
| UI still uses Development | remove a stale `NEXT_PUBLIC_AI_FN_URL`, rebuild, and redeploy. |
| Search reports relational scan | enable Search Index on the official columns in `SEARCH-SETUP.md`. |
| Direct route refresh returns 404 | rebuild so `prepare-slate.mjs` emits static-route fallback metadata, then redeploy. |
| Evidence persists without a case | select a live FIR/case before analysis; the official schema remains the source of case identity. |
| Microsoft reports `AADSTS50011` | add the exact Production callback above as a Web redirect URI for the same client ID configured in Catalyst. |
| Facebook reports `App not active` | reactivate/publish the Meta app; this is not a redirect or NETRA frontend error. |
