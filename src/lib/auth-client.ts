"use client";
import type { Role, SessionUser } from "./types";

/**
 * Client-side auth for the static build.
 *
 * NETRA is deployed to Catalyst Slate as a fully static site (see
 * next.config.mjs) — there is no runtime server, so the old cookie/HMAC session
 * (src/lib/auth.ts, server-only) can't run. This is a demo gate over public
 * demo data, not real security: the officer list is fixed and login just checks
 * the shared demo password and remembers the chosen officer in localStorage.
 */

const KEY = "netra_user";
const DEMO_PASSWORD = "police123";

/** The seeded demo officers, mirrored from data/netra.db. */
export const DEMO_USERS: (SessionUser & { label: string })[] = [
  { id: 1, username: "admin", full_name: "System Administrator", role: "administrator", rank: "System", label: "Administrator" },
  { id: 2, username: "dcp.mysuru", full_name: "Vikram Rathore", role: "senior_officer", rank: "DCP", label: "Senior Officer" },
  { id: 3, username: "io.bengaluru", full_name: "Anjali Deshpande", role: "investigation_officer", rank: "Police Inspector", label: "Investigation Officer" },
  { id: 4, username: "analyst.scrb", full_name: "Rohan Bhat", role: "analyst", rank: "SCRB Analyst", label: "Analyst" },
  { id: 5, username: "desk.hubli", full_name: "Sana Fernandes", role: "readonly", rank: "Head Constable", label: "Read-only" },
];

export function login(username: string, password: string): SessionUser | null {
  if (password !== DEMO_PASSWORD) return null;
  const u = DEMO_USERS.find((x) => x.username === username.trim());
  if (!u) return null;
  const { label: _label, ...user } = u;
  if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(user));
  return user;
}

export function logout() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
}

/** Current officer, or null. Safe to call on the server (returns null at build). */
export function getClientUser(): SessionUser | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

/** Coarse capability matrix (mirrors the old server RBAC in src/lib/auth.ts). */
const CAPS: Record<Role, string[]> = {
  administrator: ["*"],
  senior_officer: ["view_all", "reports", "predictive", "analytics", "cases", "criminals", "network"],
  investigation_officer: ["cases", "criminals", "network", "ai", "analytics"],
  analyst: ["analytics", "criminals", "network", "patterns", "reports"],
  readonly: ["view", "search", "reports"],
};

export function can(role: Role, cap: string): boolean {
  const caps = CAPS[role] || [];
  return caps.includes("*") || caps.includes(cap);
}
