# NETRA Evidence AI

Evidence AI uses Catalyst Zia for inference, Stratus for immutable source/result
objects, the existing `Evidence` Cloud Scale table for chain-of-custody metadata,
and Stratus audit objects for traceability.

No `OcrResult` table or File Store folder is required.

## Field workflows

- `plate`: Zia OCR -> normalized Karnataka plate -> Vehicles registry (when
  provisioned) -> Criminals -> FirCriminals -> Firs.
- `crowd`: Zia Face Analytics (up to 10 faces) -> prominent-face comparison
  against the selected watchlist portrait -> linked criminal/FIR case file only
  when Zia returns a match.
- `compareFace`: two-image identity verification, optionally correlated with a
  selected Cloud Scale criminal profile.
- `ocr`, `object`, `face`, `moderate`, `barcode`: general forensic tools.

Every successful field workflow automatically links the generated Evidence row
to the newest associated FIR unless the officer explicitly selects another FIR.

## Repeatable Development test

```bash
npm run evidence:test
```

This uploads only the bundled synthetic images, creates Development evidence and
audit objects, and prints the plate, match confidence, criminal, linked FIR count,
resolved FIR, evidence ID, and audit ID. It does not use real KSP imagery.

The demo assets are in `public/demo-evidence/` and are labeled synthetic in the
UI and result provenance.
