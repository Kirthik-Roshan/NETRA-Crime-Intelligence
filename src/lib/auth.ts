import { cookies } from "next/headers";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { get } from "./db";
import type { Role, SessionUser } from "./types";

const COOKIE = "netra_session";
const SECRET = process.env.NETRA_SESSION_SECRET || "netra-dev-secret-change-me";

function hashPassword(pw: string): string {
  return createHash("sha256").update(`${pw}::netra-static-salt`).digest("hex");
}

function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token: string): SessionUser | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", SECRET).update(body).digest("base64url");
  try {
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionUser;
  } catch {
    return null;
  }
}

export function authenticate(username: string, password: string): SessionUser | null {
  const row = get<{
    id: number;
    username: string;
    password_hash: string;
    full_name: string;
    role: Role;
    rank: string;
  }>("SELECT id, username, password_hash, full_name, role, rank FROM users WHERE username = ?", [username]);
  if (!row) return null;
  if (row.password_hash !== hashPassword(password)) return null;
  return { id: row.id, username: row.username, full_name: row.full_name, role: row.role, rank: row.rank };
}

export function createSessionCookie(user: SessionUser) {
  cookies().set(COOKIE, sign(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

export function getSession(): SessionUser | null {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  return verify(token);
}

/** Coarse capability matrix used for RBAC gating in the UI + API. */
const CAPS: Record<Role, string[]> = {
  administrator: ["*"],
  senior_officer: ["view_all", "reports", "predictive", "analytics", "cases", "criminals", "network", "ai", "search"],
  investigation_officer: ["cases", "criminals", "network", "ai", "analytics"],
  analyst: ["analytics", "criminals", "network", "patterns", "reports", "ai", "search"],
  readonly: ["view", "search", "reports"],
};

export function can(role: Role, cap: string): boolean {
  const caps = CAPS[role] || [];
  return caps.includes("*") || caps.includes(cap);
}
