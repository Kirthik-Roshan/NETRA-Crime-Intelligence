#!/usr/bin/env node
/**
 * Generate real case-file PDFs from the demo database, for uploading to the
 * Catalyst QuickML RAG knowledge base. These are the "PDFs the RAG picks up and
 * analyses": once uploaded to the KB, the assistant (mode: "rag") answers
 * questions grounded in them with citations.
 *
 * Output: ./case-dossiers/*.pdf  (NOT in public/ — Slate wouldn't serve it, and
 * these are for the KB, not the app). Upload them in Catalyst console →
 * QuickML → your RAG knowledge base.
 *
 *   npm run dossiers
 *
 * Self-contained PDF writer (Helvetica, WinAnsi) — no dependency. Text only.
 */
import Database from "better-sqlite3";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DB = join(ROOT, "data", "netra.db");
const OUT = join(ROOT, "case-dossiers");
const N_CASES = 10; // a handful of dossiers is enough to demo RAG

// ── minimal PDF writer ────────────────────────────────────────────────────
const PAGE_W = 595, PAGE_H = 842, MARGIN = 54, FONT = 11, LEAD = 15;
const MAX_LINES = Math.floor((PAGE_H - 2 * MARGIN) / LEAD);
const MAX_CHARS = 92; // ~chars per line at 11pt Helvetica in the text column

const esc = (s) => String(s).replace(/[\\()]/g, "\\$&");
// Keep to WinAnsi-printable; replace anything else so the PDF stays valid.
const ascii = (s) => String(s ?? "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

function wrap(text) {
  const out = [];
  for (const raw of String(text).split("\n")) {
    const line = ascii(raw).replace(/\s+$/, "");
    if (line.length <= MAX_CHARS) { out.push(line); continue; }
    let cur = "";
    for (const word of line.split(" ")) {
      if ((cur + " " + word).trim().length > MAX_CHARS) { out.push(cur); cur = word; }
      else cur = (cur ? cur + " " : "") + word;
    }
    if (cur) out.push(cur);
  }
  return out;
}

function pdfFromLines(lines) {
  // paginate
  const pages = [];
  for (let i = 0; i < lines.length; i += MAX_LINES) pages.push(lines.slice(i, i + MAX_LINES));
  if (!pages.length) pages.push([""]);

  const objects = []; // 1-indexed content strings
  const add = (s) => (objects.push(s), objects.length);

  const fontId = add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  const kids = [];
  const pagesId = objects.length + 1 + pages.length * 2 + 1; // placeholder; fixed below
  // We need Pages id known by page objects. Build page + content objects first,
  // referencing a Pages id we reserve now.
  const reservedPagesId = null; // compute after
  const pageContentIds = [];
  for (const pl of pages) {
    let stream = `BT /F1 ${FONT} Tf ${LEAD} TL ${MARGIN} ${PAGE_H - MARGIN} Td\n`;
    pl.forEach((ln, idx) => { stream += `(${esc(ln)}) Tj T*\n`; void idx; });
    stream += "ET";
    const cid = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
    pageContentIds.push(cid);
  }
  const PAGES_ID = objects.length + pages.length + 1; // pages obj comes after page objs
  const pageIds = [];
  pages.forEach((_, i) => {
    const cid = pageContentIds[i];
    const pid = add(`<< /Type /Page /Parent ${PAGES_ID} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${cid} 0 R >>`);
    pageIds.push(pid);
    kids.push(`${pid} 0 R`);
  });
  const pagesObjId = add(`<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageIds.length} >>`);
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesObjId} 0 R >>`);
  void pagesId; void reservedPagesId; void PAGES_ID; // PAGES_ID equals pagesObjId by construction

  // serialize with xref
  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets[i + 1] = Buffer.byteLength(out, "latin1");
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

// ── build dossiers from the DB ────────────────────────────────────────────
const db = new Database(DB, { readonly: true });
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const cases = db.prepare(
  `SELECT id, fir_number, crime_type, district, taluk, ipc_sections, modus, severity, status, occurred_at, reported_at, description
   FROM firs ORDER BY (severity='Critical') DESC, occurred_at DESC LIMIT ?`
).all(N_CASES);

const manifest = [];
for (const c of cases) {
  const L = [];
  L.push("KARNATAKA STATE POLICE — CASE DOSSIER (DEMO)");
  L.push("NETRA Crime Intelligence Platform");
  L.push("");
  L.push(`FIR Number      : ${c.fir_number}`);
  L.push(`Crime Type      : ${c.crime_type}`);
  L.push(`IPC Sections    : ${c.ipc_sections ?? "-"}`);
  L.push(`District / Taluk: ${c.district} / ${c.taluk ?? "-"}`);
  L.push(`Severity        : ${c.severity}     Status: ${c.status}`);
  L.push(`Occurred / Filed: ${(c.occurred_at || "").slice(0,10)} / ${(c.reported_at || "").slice(0,10)}`);
  L.push(`Modus Operandi  : ${c.modus ?? "-"}`);
  L.push("");
  L.push("BRIEF FACTS");
  L.push(...wrap(c.description || "No narrative recorded."));
  L.push("");

  // accused
  const accused = db.prepare(
    `SELECT cr.name, cr.age, cr.home_district FROM fir_criminals fc
     JOIN criminals cr ON cr.id = fc.criminal_id WHERE fc.fir_id = ? LIMIT 12`
  ).all(c.id);
  L.push(`ACCUSED / SUSPECTS (${accused.length})`);
  if (accused.length) for (const a of accused) L.push(` - ${a.name} (age ${a.age ?? "?"}, ${a.home_district ?? "?"})`);
  else L.push(" - None linked in the intelligence layer.");
  L.push("");

  // evidence
  const evidence = db.prepare(`SELECT type, description FROM evidence WHERE fir_id = ? LIMIT 12`).all(c.id);
  L.push(`EVIDENCE (${evidence.length})`);
  if (evidence.length) for (const e of evidence) L.push(...wrap(` - [${e.type}] ${e.description}`));
  else L.push(" - No evidence catalogued.");
  L.push("");
  L.push("— End of dossier. Generated by NETRA for the QuickML RAG knowledge base. —");

  const safe = String(c.fir_number).replace(/[^A-Za-z0-9_-]/g, "");
  const file = `FIR-${safe}.pdf`;
  writeFileSync(join(OUT, file), pdfFromLines(L));
  manifest.push({ file, fir: c.fir_number, crime: c.crime_type, district: c.district });
}

writeFileSync(join(OUT, "_INDEX.txt"),
  "NETRA case dossiers for the QuickML RAG knowledge base.\n" +
  "Upload every .pdf here in Catalyst console -> QuickML -> your RAG knowledge base.\n\n" +
  manifest.map((m) => `${m.file}  —  ${m.crime} in ${m.district} (${m.fir})`).join("\n") + "\n");

console.log(`[dossiers] ✓ wrote ${manifest.length} case PDFs to ./case-dossiers`);
