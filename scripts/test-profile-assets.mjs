#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const { KSP_ER_TABLES, buildKspReadModel } = require("../functions/ai_quickml/ksp-read-model.js");
const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/synthetic-profiles/manifest.json"), "utf8"));

const db = new Database(path.join(root, "data/netra.db"), { readonly: true });
const source = Object.fromEntries(KSP_ER_TABLES.map((table) => [table, db.prepare(`SELECT * FROM "${table}"`).all()]));
db.close();
const profiles = buildKspReadModel(source).Criminals;
const byId = new Map(profiles.map((profile) => [Number(profile.id), profile]));

if (manifest.count !== 70 || manifest.profiles.length !== 70) throw new Error("Portrait manifest must contain exactly 70 profiles");
if (new Set(manifest.profiles.map((entry) => entry.profile_id)).size !== 70) throw new Error("Portrait IDs are not unique");

for (const entry of manifest.profiles) {
  const profile = byId.get(Number(entry.profile_id));
  if (!profile) throw new Error(`Profile ${entry.profile_id} is absent from the KSP read model`);
  if (profile.name !== entry.name) throw new Error(`Name mismatch for profile ${entry.profile_id}`);
  if (!entry.synthetic || entry.source_table !== "Accused") throw new Error(`Invalid provenance for profile ${entry.profile_id}`);
  const publicFile = path.join(root, entry.public_path.replace(/^\//, "public/"));
  const sourceFile = path.join(root, entry.source_file);
  if (!fs.existsSync(publicFile) || !fs.existsSync(sourceFile)) throw new Error(`Missing files for profile ${entry.profile_id}`);
  const bytes = fs.readFileSync(publicFile);
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error(`SHA mismatch for profile ${entry.profile_id}`);
  if (bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WEBP") throw new Error(`Invalid WebP for profile ${entry.profile_id}`);
  if (profile.portrait_key !== entry.stratus_key) throw new Error(`Read-model asset mismatch for profile ${entry.profile_id}`);
}

console.log("PASS: 70 synthetic accused portraits are unique, schema-linked, and integrity verified");
