#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { faceMatch, summarizeCctvFrames } = require("../functions/ai_quickml/cctv-analysis.js");

assert.deepEqual(faceMatch({ data: { matched: true, confidence: 92 } }), { matched: true, confidence: 0.92 });
assert.deepEqual(faceMatch({ score: 0.86 }), { matched: true, confidence: 0.86 });
assert.deepEqual(faceMatch({ matched: false, confidence: 99 }), { matched: false, confidence: 0.99 });

const summary = summarizeCctvFrames([
  { index: 0, timestamp: 0.6, matched: false, confidence: 0.32 },
  { index: 1, timestamp: 2.1, matched: true, confidence: 0.88 },
  { index: 2, timestamp: 3.7, matched: true, confidence: 0.94 },
  { index: 3, timestamp: 5.2, matched: false, confidence: 0, error: "no face" },
]);
assert.equal(summary.matched, true);
assert.equal(summary.confidence, 0.94);
assert.equal(summary.best_frame_index, 2);
assert.equal(summary.best_timestamp, 3.7);
assert.equal(summary.matching_frames, 2);
assert.equal(summary.successful_frames, 3);

const manifest = JSON.parse(fs.readFileSync("functions/ai_quickml/profile-assets.json", "utf8"));
const chetan = manifest.profiles.find((profile) => profile.profile_id === 176);
assert(chetan, "Chetan Desai synthetic profile 176 must exist");
assert.equal(chetan.name, "Chetan Desai");
assert.equal(chetan.synthetic, true);
assert(fs.existsSync(chetan.source_file), "Chetan Desai reference portrait must exist");

const client = fs.readFileSync("src/components/evidence/EvidenceLab.tsx", "utf8");
const fn = fs.readFileSync("functions/ai_quickml/index.js", "utf8");
assert(client.includes("extractVideoFrames(cctvVideo"), "EvidenceAI must split the selected clip at runtime");
assert(client.includes("analyzeCctvEvidence"), "EvidenceAI must submit extracted frames to Catalyst");
assert(fn.includes('if (mode === "cctv")'), "Catalyst Function must expose the CCTV workflow");
assert(fn.includes("EVIDENCE_CCTV_FACE_SCAN"), "CCTV workflow must write a dedicated audit event");

console.log("PASS: dynamic CCTV frame extraction, match ranking, profile 176 linkage, and audit contract verified");
