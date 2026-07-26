import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Single shared SQLite connection for the whole server runtime.
 * On first access, if the database file is missing, we run the
 * standalone seeder in a child process so a freshly cloned repo
 * "just works" with `npm run dev` — no manual seed step required.
 */
const ROOT = process.cwd();
const DATA_DIR = join(ROOT, "data");
const DB_PATH = join(DATA_DIR, "netra.db");

let _db: Database.Database | null = null;

function ensureSeeded() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_PATH)) {
    // eslint-disable-next-line no-console
    console.log("[netra] No database found — seeding on first run...");
    execFileSync("node", [join(ROOT, "scripts", "seed.mjs")], { stdio: "inherit" });
  }
}

export function getDb(): Database.Database {
  if (_db) return _db;
  ensureSeeded();
  _db = new Database(DB_PATH);
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
