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

const plate = imageData("public/demo-evidence/vehicle-ka03ab7161.png");
const crowd = imageData("public/demo-evidence/crowd-watch-ganesh-nayak.png");
const reference = imageData("public/demo-evidence/watchlist-ganesh-nayak.png");

const plateResult = await call({
  mode: "plate",
  image: plate.data,
  name: plate.name,
  mime: plate.mime,
  language: "eng",
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
  criminal_id: 66,
  description: "Synthetic NETRA crowd-watch smoke test.",
});
summary("crowd-watch", crowdResult);
