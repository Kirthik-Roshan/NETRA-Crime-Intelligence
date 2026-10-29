import fs from "node:fs";
import path from "node:path";

const functionUrl = process.env.NETRA_AI_FN_URL
  || "https://ksphacks-60080085094.development.catalystserverless.in/server/ai_quickml/";

function imageData(relativePath) {
  const absolute = path.resolve(relativePath);
  const mime = absolute.endsWith(".webp") ? "image/webp" : absolute.endsWith(".jpg") || absolute.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  return {
    name: path.basename(absolute),
    mime,
    data: `data:${mime};base64,${fs.readFileSync(absolute).toString("base64")}`,
  };
}

async function call(body) {
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${payload.error || payload.detail || "Unknown Catalyst error"}`);
  return payload;
}

function summary(label, payload) {
  const intelligence = payload.intelligence || payload.correlation?.intelligence;
  console.log(JSON.stringify({
    workflow: label,
    detected_fir_number: payload.detected_fir_number || null,
    case_match: payload.case_intelligence?.fir?.fir_number || null,
    plate: payload.plate || null,
    matched: payload.match?.matched ?? null,
    confidence: payload.match?.confidence ?? null,
    criminal: intelligence?.criminal?.name || null,
    firs: intelligence?.counts?.firs || 0,
    resolved_fir_id: payload.resolved_fir_id || null,
    evidence_id: payload.evidence_id || null,
    audit_id: payload.audit_id || null,
    warnings: payload.warnings || [],
  }, null, 2));
}

const firScan = imageData("public/demo-evidence/fir-104060011202600001-v2.png");
const plate = imageData("public/demo-evidence/vehicle-ka03ab7161-v2.png");
const crowd = imageData("public/demo-evidence/crowd-watch-ganesh-nayak-v2.png");
const reference = imageData("public/synthetic-profiles/profile-000015.webp");
const configuredFirId = Number(process.env.EVIDENCE_FIR_ID);
const firId = Number.isSafeInteger(configuredFirId) && configuredFirId > 0 ? configuredFirId : undefined;

const ocrResult = await call({
  mode: "ocr",
  image: firScan.data,
  name: firScan.name,
  mime: firScan.mime,
  language: "eng",
  description: "Synthetic NETRA FIR-document OCR smoke test.",
});
summary("fir-document-ocr", ocrResult);
if (ocrResult.detected_fir_number !== "104060011202600001") {
  throw new Error(`FIR OCR mismatch: expected 104060011202600001, received ${ocrResult.detected_fir_number || "none"}`);
}

const plateOcrResult = await call({
  mode: "ocr",
  image: plate.data,
  name: plate.name,
  mime: plate.mime,
  language: "eng",
  description: "Synthetic NETRA registration OCR layout regression test.",
});
summary("registration-ocr", plateOcrResult);
if (plateOcrResult.plate !== "KA03AB7161") {
  throw new Error(`Registration OCR mismatch: expected KA03AB7161, received ${plateOcrResult.plate || "none"}`);
}
if ((plateOcrResult.correlation?.associated_firs || []).length !== 2) {
  throw new Error(`Vehicle linkage mismatch: expected 2 FIRs, received ${plateOcrResult.correlation?.associated_firs?.length || 0}`);
}
if (/ {2,}/.test(plateOcrResult.text || "")) {
  throw new Error("Registration OCR output still contains layout spacing.");
}

const plateResult = await call({
  mode: "plate",
  image: plate.data,
  name: plate.name,
  mime: plate.mime,
  language: "eng",
  ...(firId ? { fir_id: firId } : {}),
  description: "Synthetic NETRA vehicle-stop smoke test.",
});
summary("vehicle-stop", plateResult);

const crowdResult = await call({
  mode: "crowd",
  image: crowd.data,
  name: crowd.name,
  mime: crowd.mime,
  image2: reference.data,
  name2: reference.name,
  mime2: reference.mime,
  ...(firId ? { fir_id: firId } : {}),
  description: "Synthetic NETRA crowd-watch smoke test.",
});
summary("crowd-watch", crowdResult);
