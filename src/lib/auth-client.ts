"use client";

import { clearCachedCatalystAccessToken, fetchAuthenticatedOfficer } from "./ai-client";
import type { Role, SessionUser } from "./types";

const KEY = "netra_session_user_v2";
const LEGACY_KEY = "netra_user";
const LOCAL_SIGNED_OUT_KEY = "netra_local_signed_out";
const LOCAL_PASSWORD = "police123";
const HOSTED_DEMO_ACCESS_ENABLED = process.env.NEXT_PUBLIC_DEMO_ACCESS_ENABLED === "true";
const CATALYST_WEB_CLIENT = process.env.NEXT_PUBLIC_CATALYST_WEB_CLIENT === "true";
const CATALYST_DEVELOPMENT_ORIGIN = "https://ksphacks-60080085094.development.catalystserverless.in";
const CATALYST_APP_ORIGIN = process.env.NEXT_PUBLIC_CATALYST_APP_ORIGIN || CATALYST_DEVELOPMENT_ORIGIN;
const CATALYST_PROJECT_ID = "56798000000013049";

type CatalystWindow = Window & {
  catalyst?: { auth?: CatalystAuth };
  __netraCatalystReady?: boolean;
};

export const DEMO_USERS: (SessionUser & { label: string })[] = [
  { id: 1, username: "admin", full_name: "System Administrator", role: "administrator", rank: "System", label: "Administrator" },
  { id: 2, username: "dcp.mysuru", full_name: "Vikram Rathore", role: "senior_officer", rank: "DCP", label: "Senior Officer" },
  { id: 3, username: "io.bengaluru", full_name: "Anjali Deshpande", role: "investigation_officer", rank: "Police Inspector", label: "Investigation Officer" },
  { id: 4, username: "analyst.scrb", full_name: "Rohan Bhat", role: "analyst", rank: "SCRB Analyst", label: "Analyst" },
  { id: 5, username: "desk.hubli", full_name: "Sana Fernandes", role: "readonly", rank: "Head Constable", label: "Read-only" },
];

type CatalystAuth = {
  isUserAuthenticated: () => Promise<unknown>;
  generateAuthToken?: () => Promise<{ access_token?: string } | string>;
  signIn: (elementId: string, config?: Record<string, unknown>) => Promise<unknown> | unknown;
  signOut: (redirectUrl?: string) => void;
};

function authSdk(): CatalystAuth | null {
  if (typeof window === "undefined") return null;
  const browser = window as CatalystWindow;
  if (!browser.__netraCatalystReady) return null;
  return browser.catalyst?.auth || null;
}

export function isLocalDevelopment(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function isCatalystHosted(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname.endsWith(".catalystserverless.in");
}

export function isDemoAccessMode(): boolean {
  return HOSTED_DEMO_ACCESS_ENABLED;
}

/** Resolve a statically exported page on Slate or Catalyst Web Client Hosting. */
export function appDocumentPath(route: string): string {
  const match = route.match(/^([^?#]*)(.*)$/);
  const pathname = `/${String(match?.[1] || "/").replace(/^\/+|\/+$/g, "")}`;
  const suffix = match?.[2] || "";
  const base = CATALYST_WEB_CLIENT ? "/app" : "";

  if (isLocalDevelopment()) return `${base}${pathname === "/" ? "/" : `${pathname}/`}${suffix}`;
  if (pathname === "/") return `${base}/index.html${suffix}`;
  if (/\.[a-z0-9]+$/i.test(pathname)) return `${base}${pathname}${suffix}`;
  return `${base}${pathname}/index.html${suffix}`;
}

export function replaceAppRoute(route: string): void {
  if (typeof window !== "undefined") window.location.replace(appDocumentPath(route));
}

export function catalystHostedSignInUrl(): string {
  if (typeof window === "undefined") return `${CATALYST_DEVELOPMENT_ORIGIN}/__catalyst/auth/login`;
  const catalystHost = window.location.hostname.endsWith(".catalystserverless.in");
  const origin = catalystHost ? window.location.origin : CATALYST_DEVELOPMENT_ORIGIN;
  return `${origin}/__catalyst/auth/login`;
}

export function beginCatalystSignIn(): void {
  if (typeof window === "undefined") return;
  if (!isCatalystHosted()) {
    window.location.assign(`${CATALYST_APP_ORIGIN}/app/login/index.html`);
    return;
  }
  window.location.assign(catalystHostedSignInUrl());
}

function remember(user: SessionUser | null) {
  if (typeof localStorage === "undefined") return;
  if (user) localStorage.setItem(KEY, JSON.stringify(user));
  else {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  }
}

function localSignedOut(): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem(LOCAL_SIGNED_OUT_KEY) === "1";
}

function setLocalSignedOut(value: boolean): void {
  if (typeof localStorage === "undefined") return;
  if (value) localStorage.setItem(LOCAL_SIGNED_OUT_KEY, "1");
  else localStorage.removeItem(LOCAL_SIGNED_OUT_KEY);
}

export function getCachedUser(): SessionUser | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

function normalizeRole(value: unknown): Role {
  const role = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (["administrator", "app_administrator", "admin", "system_administrator"].includes(role)) return "administrator";
  if (["senior_officer", "seniorofficer", "supervisor"].includes(role)) return "senior_officer";
  if (["investigation_officer", "investigating_officer", "officer", "app_user", "user"].includes(role)) return "investigation_officer";
  if (["analyst", "scrb_analyst"].includes(role)) return "analyst";
  return "readonly";
}

function unwrapUser(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  for (const key of ["user", "user_details", "content", "data"]) {
    const nested = row[key];
    if (nested && typeof nested === "object") {
      const found = unwrapUser(nested);
      if (found) return found;
    }
  }
  return row.user_id || row.zuid || row.email_id ? row : null;
}

function mapSdkUser(value: unknown): SessionUser | null {
  const user = unwrapUser(value);
  if (!user) return null;
  const roleDetails = user.role_details && typeof user.role_details === "object"
    ? user.role_details as Record<string, unknown>
    : {};
  const first = String(user.first_name || "").trim();
  const last = String(user.last_name || "").trim();
  return {
    id: String(user.user_id || user.zuid || ""),
    username: String(user.email_id || user.user_id || ""),
    full_name: `${first} ${last}`.trim() || String(user.email_id || "Catalyst User"),
    role: normalizeRole(roleDetails.role_name),
    rank: String(roleDetails.role_name || "Catalyst User"),
  };
}

async function waitForAuthSdk(timeoutMs = 10000): Promise<CatalystAuth | null> {
  if (!isCatalystHosted()) return null;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const sdk = authSdk();
    if (sdk) return sdk;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Catalyst Authentication timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

let clientUserPromise: Promise<SessionUser | null> | null = null;
let signInMountPromise: Promise<boolean> | null = null;

async function resolveClientUser(): Promise<SessionUser | null> {
  if (isDemoAccessMode()) {
    if (localSignedOut()) {
      remember(null);
      return null;
    }
    return getCachedUser();
  }

  const sdk = await waitForAuthSdk();
  if (sdk) {
    try {
      const user = mapSdkUser(await withTimeout(sdk.isUserAuthenticated(), 7000));
      if (user) {
        const verified = await withTimeout(fetchAuthenticatedOfficer(), 7000).catch(() => null);
        const resolved = verified?.authenticated && verified.user ? verified.user : user;
        remember(resolved);
        return resolved;
      }
    } catch {
      // An unauthenticated visitor is expected to reach the sign-in widget.
    }
  }

  remember(null);
  return null;
}

/** Resolve and verify the current user once per document before opening the app. */
export function getClientUser(): Promise<SessionUser | null> {
  if (!clientUserPromise) clientUserPromise = resolveClientUser();
  return clientUserPromise;
}

/** Mount Catalyst's embedded sign-in widget into the supplied element. */
export function mountCatalystSignIn(elementId: string): Promise<boolean> {
  if (!signInMountPromise) {
    signInMountPromise = (async () => {
      const sdk = await waitForAuthSdk();
      if (!sdk) return false;
      const redirect = new URL(appDocumentPath("/dashboard"), window.location.origin).toString();
      await withTimeout(Promise.resolve(sdk.signIn(elementId, { service_url: redirect })), 7000);
      return true;
    })();
  }
  return signInMountPromise;
}

/** Local-only account selection. It is unreachable on a hosted build. */
export function loginLocal(username = "admin", password = LOCAL_PASSWORD): SessionUser | null {
  if (!isDemoAccessMode() || password !== LOCAL_PASSWORD) return null;
  const selected = DEMO_USERS.find((user) => user.username === username) || DEMO_USERS[0];
  const { label: _label, ...user } = selected;
  setLocalSignedOut(false);
  remember(user);
  return user;
}

/** Clear NETRA state and return true when Catalyst owns the redirect. */
export async function logout(): Promise<boolean> {
  clientUserPromise = null;
  signInMountPromise = null;
  remember(null);
  clearCachedCatalystAccessToken();

  if (isDemoAccessMode()) {
    setLocalSignedOut(true);
    return false;
  }

  const redirect = new URL(appDocumentPath("/login"), window.location.origin).toString();
  const logoutUrl = `${window.location.origin}/baas/logout?logout=true&PROJECT_ID=${CATALYST_PROJECT_ID}`;
  let fallbackStarted = false;
  const fallback = () => {
    if (fallbackStarted) return;
    fallbackStarted = true;
    const redirectTimer = window.setTimeout(() => window.location.replace(redirect), 1500);
    void fetch(logoutUrl, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      keepalive: true,
    }).catch(() => undefined).finally(() => {
      window.clearTimeout(redirectTimer);
      window.location.replace(redirect);
    });
  };

  const sdk = await waitForAuthSdk(3000);
  if (!sdk) {
    fallback();
    return true;
  }

  window.setTimeout(fallback, 2500);
  sdk.signOut(redirect);
  return true;
}

const CAPS: Record<Role, string[]> = {
  administrator: ["*"],
  senior_officer: ["view_all", "reports", "predictive", "analytics", "cases", "criminals", "network", "ai", "search", "evidence"],
  investigation_officer: ["cases", "criminals", "network", "ai", "analytics", "evidence", "search", "reports"],
  analyst: ["analytics", "criminals", "network", "patterns", "reports", "ai", "search"],
  readonly: ["view", "search", "reports"],
};

export function can(role: Role, capability: string): boolean {
  const caps = CAPS[role] || [];
  return caps.includes("*") || caps.includes(capability);
}
