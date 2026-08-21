#!/usr/bin/env node
/**
 * Exercise every Catalyst Zia service through the deployed ai_quickml Function.
 * The Function holds the token; this just POSTs base64 images and prints results.
 *
 *   FN_URL=https://<project>.catalystserverless.in/server/ai_quickml/ \
 *     node scripts/zia-test.mjs [service]
 *
 * service (optional): ocr | face | object | moderate | barcode | compareFace | all (default)
 * Samples come from data/zia-samples/ (run scripts/gen-zia-samples.py first).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES = join(HERE, "..", "data", "zia-samples");
const FN_URL =
  process.env.FN_URL ||
  process.env.NEXT_PUBLIC_AI_FN_URL ||
  "https://ksphacks-60080085094.development.catalystserverless.in/server/ai_quickml/";

const b64 = (f) => readFileSync(join(SAMPLES, f)).toString("base64");

async function call(body) {
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // simple request → no CORS preflight
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

const CASES = {
  ocr:         () => call({ mode: "ocr", image: b64("ocr-fir.png"), language: "eng", name: "ocr-fir.png" }),
  barcode:     () => call({ mode: "barcode", image: b64("barcode-evidence.png"), format: "all" }),
  qr:          () => call({ mode: "barcode", image: b64("qr-case.png"), format: "all" }),
  face:        () => call({ mode: "face", image: b64("face-synthetic.png"), gender: "true" }),
  object:      () => call({ mode: "object", image: b64("objects-synthetic.png") }),
  moderate:    () => call({ mode: "moderate", image: b64("objects-synthetic.png"), modMode: "advanced" }),
  compareFace: () => call({ mode: "compareFace", image: b64("face-synthetic.png"), image2: b64("face-synthetic.png") }),
};

const pick = process.argv[2] || "all";
const run = pick === "all" ? Object.keys(CASES) : [pick];

console.log(`Zia test → ${FN_URL}\n`);
for (const name of run) {
  if (!CASES[name]) { console.log(`  ${name}: unknown service`); continue; }
  try {
    const { status, json } = await CASES[name]();
    const preview = typeof json === "string" ? json.slice(0, 200) : JSON.stringify(json).slice(0, 300);
    console.log(`  ${name.padEnd(12)} HTTP ${status}  ${preview}`);
  } catch (e) {
    console.log(`  ${name.padEnd(12)} ERROR  ${e.message}`);
  }
}
