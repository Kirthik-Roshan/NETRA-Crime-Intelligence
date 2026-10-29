# NETRA Evidence AI

Evidence AI uses Catalyst Zia for inference, Stratus for source/result objects,
`Evidence` for chain-of-custody metadata, and Stratus audit objects for
traceability. `Evidence` is an application-output table, not part of the
organizer's crime-source schema.

## Workflows

- `plate`: Zia OCR normalizes a registration number. NETRA first searches
  official `CaseMaster.BriefFacts`; when an officer selected an incident FIR,
  a newly captured plate is instead attached to that official `CaseMaster`
  record. Associated `Accused` and FIR context are resolved through
  `CaseMasterID` relationships.
- `crowd`: Zia detects faces and compares a prominent face against the uploaded
  reference portrait. Registered fictional portraits resolve their own profile
  automatically by SHA-256, with no name selection. Current `Accused` and FIR
  context is returned only when Zia reports a match and the registry name/ID
  still agrees with the database.
- `cctv`: the browser decodes the selected MP4, WebM, or MOV clip and extracts
  four to eight JPEG frames across its real duration. The Function compares
  every sampled frame against the uploaded reference
  portrait, ranks the matches, resolves official FIR context after a confirmed
  candidate match, and archives the clip, reference portrait, strongest
  evidentiary frames, result, and audit event. Clips are limited to 30 seconds
  and 8 MB so the complete
  evidence package stays within the Advanced I/O request boundary.
- `compareFace`: compares two images and automatically resolves a registered
  fictional reference's profile and linked FIRs only after a successful match.
- `evidence:reference`: checks the uploaded reference's fingerprint and returns
  registry metadata for the intake status. It returns no case details.
- `ocr`, `object`, `face`, `moderate`, `barcode`: general forensic analyses.

Successful analysis persists the original and result in Stratus, writes
evidence metadata, and returns an audit ID. The Function authenticates the
officer and enforces role checks before using its server credential for those
approved writes. A plate without a `BriefFacts` match or officer-selected FIR
returns no case correlation; NETRA does not use a hard-coded vehicle registry.

The CCTV workflow is targeted 1:1 watchlist verification because Catalyst Zia
Face Comparison compares two images. It does not claim automatic 1:N identity
recognition over all 70 profiles. Both original registered PNGs and served
WebPs work, regardless of filename. Client-supplied `criminal_id` is ignored.
Unregistered, cropped, resized or re-encoded references can still be compared,
but receive no inferred identity or case linkage. The UI explains that limit.
The older standalone Ganesh demo portrait differs from the registered profile;
demo loading now uses the actual registered profile 15, with no forced match.
Every match remains an investigative candidate that requires officer verification.

## Repeatable Development Test

```bash
npm run evidence:test
npm run cctv:test
node scripts/test-evidence-reference.mjs
```

The test uses only bundled synthetic images. Development Cloud Scale must also
contain official KSP rows for case/profile correlation. Run the equivalent test
against Production only with approved synthetic or authorized evidence.
