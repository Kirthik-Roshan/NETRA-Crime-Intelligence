#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const { KSP_ER_TABLES, buildKspReadModel } = require("../functions/ai_quickml/ksp-read-model.js");

const root = process.cwd();
const sourceDir = path.join(root, "test-assets/evidence-ai/criminal-profiles");
const publicDir = path.join(root, "public/synthetic-profiles");
const manifestPath = path.join(publicDir, "manifest.json");
const testManifestPath = path.join(sourceDir, "manifest.json");
const functionManifestPath = path.join(root, "functions/ai_quickml/profile-assets.json");

if (!fs.existsSync(sourceDir)) throw new Error(`Missing portrait source directory: ${sourceDir}`);
fs.mkdirSync(publicDir, { recursive: true });

const db = new Database(path.join(root, "data/netra.db"), { readonly: true });
const source = Object.fromEntries(KSP_ER_TABLES.map((table) => [
  table,
  db.prepare(`SELECT * FROM "${table}"`).all(),
]));
db.close();

const profiles = buildKspReadModel(source).Criminals.slice().sort((left, right) => left.id - right.id);
const sources = fs.readdirSync(sourceDir).filter((name) => /^profile-\d{6}-.+\.png$/i.test(name));
const entries = [];

for (const profile of profiles) {
  const paddedId = String(profile.id).padStart(6, "0");
  const matching = sources.filter((name) => name.startsWith(`profile-${paddedId}-`));
  if (matching.length !== 1) {
    throw new Error(`Expected exactly one source portrait for profile ${profile.id}; found ${matching.length}`);
  }

  const sourceName = matching[0];
  const sourcePath = path.join(sourceDir, sourceName);
  const outputName = `profile-${paddedId}.webp`;
  const outputPath = path.join(publicDir, outputName);
  const conversion = process.argv.includes('--manifest-only') && fs.existsSync(outputPath) ? { status: 0 } : spawnSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", sourcePath,
    "-vf", "scale=512:512:force_original_aspect_ratio=decrease",
    "-c:v", "libwebp", "-quality", "82", "-compression_level", "6",
    "-y", outputPath,
  ], { encoding: "utf8" });
  if (conversion.status !== 0) {
    throw new Error(`ffmpeg failed for ${sourceName}: ${conversion.stderr || conversion.stdout}`);
  }

  const bytes = fs.readFileSync(outputPath);
  entries.push({
    profile_id: profile.id,
    name: profile.name,
    age: profile.age,
    gender: profile.gender,
    home_district: profile.home_district,
    crime_category: profile.crime_category,
    source_table: "Accused",
    synthetic: true,
    source_file: `test-assets/evidence-ai/criminal-profiles/${sourceName}`,
    public_path: `/synthetic-profiles/${outputName}`,
    stratus_key: `synthetic-accused-profiles/v1/${outputName}`,
    mime_type: "image/webp",
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    source_sha256: crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex"),
  });
}

if (entries.length !== 70) throw new Error(`Expected 70 consolidated profiles; found ${entries.length}`);
if (new Set(entries.map((entry) => entry.profile_id)).size !== entries.length) throw new Error("Duplicate profile IDs in portrait manifest");

const manifest = {
  version: 1,
  collection: "NETRA synthetic accused reference portraits",
  notice: "All identities and images are fictional synthetic demonstration data. They do not depict KSP suspects or real accused persons.",
  source: "Profile IDs and demographics are derived from the official-schema Accused synthetic rows; images are separate Stratus assets.",
  count: entries.length,
  profiles: entries,
};
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
fs.writeFileSync(manifestPath, serialized);
fs.writeFileSync(testManifestPath, serialized);
fs.writeFileSync(functionManifestPath, serialized);
fs.writeFileSync(path.join(root, 'functions/ai_quickml/profile-names.json'), JSON.stringify(entries.map(entry => entry.name)) + '\n');

const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
console.log(`Built ${entries.length} synthetic profile portraits (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Manifest: ${path.relative(root, manifestPath)}`);
