# Catalyst Search setup for NETRA

NETRA already calls Catalyst Search from `platform.js`. Until the columns below
are indexed, it deliberately uses a bounded Cloud Scale row scan and reports the
fallback in the response.

Search Index is a schema constraint. Catalyst currently requires it to be
enabled in the console; the CLI and public Data Store APIs do not create or edit
table schemas.

## Enable in Development and Production

Open **Cloud Scale -> Data Store**, select each table, and use **Schema View ->
column menu -> Edit -> Search Index -> Update**.

Enable these columns:

- `Firs`: `fir_number`, `crime_type`, `ipc_sections`, `district`, `taluk`,
  `status`, `severity`, `modus`, `description`
- `Cases`: `case_number`, `title`, `status`, `case_priority`, `district`,
  `summary`
- `Criminals`: `name`, `aliases`, `status`, `crime_category`,
  `known_locations`, `home_district`, `notes`
- `Evidence`: `type`, `description`, `storage_ref`
- `Vehicles` when provisioned: `plate`, `make`, `model`, `color`, `type`

Wait for the Catalyst indexing-complete notification before testing. Repeat the
same schema change in Production because Catalyst environments have separate
schemas and indexes.

## Verify

```bash
curl -sS "https://ksphacks-60080085094.development.catalystserverless.in/server/ai_quickml/" \
  -H "Content-Type: text/plain" \
  --data '{"mode":"search:records","query":"burglary Mysuru","max":5}'
```

The response is complete when `engine` is `catalyst-search` and `warning` is
empty. `bounded-datastore-fallback` means at least one configured column still
lacks its Search Index.
