import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Single shared SQLite connection for the whole server runtime.
 *
 * The shipped database (data/netra.db) exposes the app's tables as VIEWS over a
 * normalized schema (CaseMaster/Accused/Victim/…). Those views re-run their
 * JOINs and correlated subqueries on every read, so a page like the dashboard
 * issues thousands of small random page-reads against the .db file.
 *
 * On a local SSD that is a few milliseconds. On a managed/serverless runtime
 * (Catalyst Slate, AppSail, …) the app directory is a high-latency, usually
 * read-only filesystem, so every page-read pays that latency and the same
 * render balloons to 30-40s — long enough for the edge gateway to return a
 * 524. WAL mode also needs to create -wal/-shm sidecars, which a read-only app
 * dir forbids.
 *
 * Fix: in production copy the shipped .db once into the OS temp dir (tmpfs —
 * RAM-backed and writable) and open it there. Reads become in-memory-fast and
 * WAL has somewhere to write. The copy is per-container and ephemeral, so
 * writes (audit log, imports) do not survive a restart or span instances;
 * moving those to a managed store is the durable fix. Reads — the whole
 * officer-facing app — work correctly and fast.
 */
const ROOT = process.cwd();
const DATA_DIR = join(ROOT, "data");
const SOURCE_DB = join(DATA_DIR, "netra.db");

// Any managed/serverless runtime sets NODE_ENV=production (Next does this for a
// production build). Local `next dev` leaves it unset/"development" and keeps
// opening the file in place.
const IN_PRODUCTION = process.env.NODE_ENV === "production";
const RUNTIME_DB = IN_PRODUCTION ? join(tmpdir(), "netra.db") : SOURCE_DB;

let _db: Database.Database | null = null;

/** Copy the shipped DB into the writable temp dir if the copy isn't current. */
function stageRuntimeDb() {
  if (!existsSync(SOURCE_DB)) {
    throw new Error(
      "[netra] data/netra.db is missing from the deployment. It ships in the repo " +
        "(it is committed) — do not delete it; there is no seed-on-boot in production.",
    );
  }
  const current =
    existsSync(RUNTIME_DB) && statSync(RUNTIME_DB).mtimeMs >= statSync(SOURCE_DB).mtimeMs;
  if (!current) copyFileSync(SOURCE_DB, RUNTIME_DB);
}

function ensureSeeded() {
  // Local dev convenience only: seed a freshly-cloned repo so `npm run dev`
  // just works. Never in production — a blocking child process on the first
  // request is exactly what turns a slow cold start into a gateway 524.
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(SOURCE_DB)) {
    // eslint-disable-next-line no-console
    console.log("[netra] No database found — seeding on first run...");
    execFileSync("node", [join(ROOT, "scripts", "seed.mjs")], { stdio: "inherit" });
  }
}

export function getDb(): Database.Database {
  if (_db) return _db;

  if (IN_PRODUCTION) stageRuntimeDb();
  else ensureSeeded();

  _db = new Database(RUNTIME_DB);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  return _db;
}

/** Convenience helpers. */
export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}
export function get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}
export function run(sql: string, params: unknown[] = []) {
  return getDb().prepare(sql).run(...params);
}
