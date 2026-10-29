#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const checks = [
  ["Official ER schema", "node", ["scripts/audit-er-schema.mjs"]],
  ["KSP read model", "node", ["scripts/test-ksp-read-model.mjs"]],
  ["Analytics demographic sources", "node", ["scripts/test-analytics-sources.mjs"]],
  ["Synthetic profile assets", "node", ["scripts/test-profile-assets.mjs"]],
  ["Vehicle evidence linkage", "node", ["scripts/test-vehicle-evidence-link.mjs"]],
  ["Dynamic CCTV evidence", "node", ["scripts/test-cctv-workflow.mjs"]],
  ["Automatic synthetic reference linkage", "node", ["scripts/test-evidence-reference.mjs"]],
  ["Assistant grounding", "node", ["scripts/test-assistant-grounding.mjs"]],
  ["Conversation routing", "node", ["scripts/test-conversation-routing.mjs"]],
  ["Kannada interface", "node", ["scripts/test-kannada-ui.mjs"]],
  ["Track 1 conversational analysis", "node", ["scripts/test-assistant-analysis.mjs"]],
  ["Source report charts", "node", ["scripts/test-source-chart.mjs"]],
  ["Unified PDF exports", "node", ["scripts/test-report-export.mjs"]],
  ["Document chat and file library", "node", ["scripts/test-document-library.mjs"]],
  ["Portal session presence and audit access", "node", ["scripts/test-session-presence.mjs"]],
  ["Photo and saved evidence chat", "node", ["scripts/test-evidence-chat.mjs"]],
  ["Analysis activity stream", "node", ["scripts/test-analysis-stream.mjs"]],
  ["Voice response normalization", "node", ["scripts/test-voice-response.mjs"]],
  ["Transcription error handling", "node", ["scripts/test-transcription-client.mjs"]],
  ["On-device speech recovery", "node", ["scripts/test-local-speech.mjs"]],
  ["Speech playback", "node", ["scripts/test-speech-playback.mjs"]],
  ["Investigation workbench", "node", ["scripts/test-investigations.mjs"]],
  ["Investigation alert updates", "node", ["scripts/test-investigation-alert-client.mjs"]],
  ["Static chunk recovery", "node", ["scripts/test-static-worker.mjs"]],
  ["Function syntax", "node", ["--check", "functions/ai_quickml/index.js"]],
  ["CCTV analysis syntax", "node", ["--check", "functions/ai_quickml/cctv-analysis.js"]],
  ["Platform syntax", "node", ["--check", "functions/ai_quickml/platform.js"]],
  ["Read-model syntax", "node", ["--check", "functions/ai_quickml/ksp-read-model.js"]],
  ["TypeScript", "npx", ["tsc", "--noEmit"]],
  ["Catalyst production build", "npm", ["run", "build:catalyst"]],
  ["Static route refresh", "node", ["scripts/test-static-routes.mjs"]],
];

console.log("NETRA release gate\n");
for (const [label, command, args] of checks) {
  console.log(`\n[${label}] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    console.error(`\nRelease gate failed at: ${label}`);
    process.exit(result.status || 1);
  }
}

console.log("\nNETRA release gate passed. The artifact is ready for Development deployment.");
