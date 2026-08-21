# Zia sample data

Sample images to test every Catalyst Zia service used by NETRA, plus a client
that drives them through the deployed `ai_quickml` Function.

## Regenerate the images
```bash
~/Downloads/.venv/bin/python scripts/gen-zia-samples.py
```

## Run the tests (against the deployed Function)
```bash
FN_URL=https://<project>.catalystserverless.in/server/ai_quickml/ \
  node scripts/zia-test.mjs           # all services
node scripts/zia-test.mjs ocr         # one service
```

## What each file tests

| File | Zia service | Function mode | Meaningful result? |
|------|-------------|---------------|--------------------|
| `ocr-fir.png` | OCR | `ocr` | ✅ real — reads the mock FIR text |
| `barcode-evidence.png` | Barcode Scanner | `barcode` | ✅ real — decodes Code128 `EVID-2026-000123` |
| `qr-case.png` | Barcode Scanner (QR) | `barcode` | ✅ real — decodes the QR payload |
| `face-synthetic.png` | Face Analytics / Identity | `face` / `compareFace` | ⚠️ plumbing only |
| `objects-synthetic.png` | Object Recognition / Moderation | `object` / `moderate` | ⚠️ plumbing only |

**⚠️ plumbing only:** these synthetic drawings verify the API round-trips
(request → Zia → JSON response) but Zia's ML won't reliably detect faces/objects
in crude graphics — expect an empty/low-confidence result. For **real detection**,
drop actual photographs into this folder and point the test at them:

- **Face Analytics / Identity Scanner** → a real face photo (JPG/PNG). For
  `compareFace`, supply two photos (`image` + `image2`).
- **Object Recognition** → a real photo of a scene/objects.
- **Image Moderation** → any real photo (returns safe/unsafe classification).

OCR and Barcode work fully with the generated samples — no real photo needed.

## Notes
- Images are base64-encoded and POSTed as `Content-Type: text/plain` (no CORS
  preflight) — the same path the app uses.
- The Function needs the Zia modes deployed (`catalyst deploy`) and runs the SDK
  with `catalyst.initialize(req, {scope:"admin"})`.
