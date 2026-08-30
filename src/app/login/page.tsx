"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Lock, ArrowRight, ShieldCheck, Network, ScanSearch, User, Loader2, AlertTriangle, ShieldAlert, KeyRound } from "lucide-react";
import { Emblem } from "@/components/Emblem";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Avatar, Badge } from "@/components/ui";
import { DEMO_USERS, login as clientLogin } from "@/lib/auth-client";

const DEMO_ACCOUNTS = DEMO_USERS.map((u) => ({
  username: u.username,
  label: u.label,
  full_name: u.full_name,
  rank: u.rank,
}));
const DEMO_PASSWORD = "police123";

const CAPABILITIES = [
  { icon: ScanSearch, label: "Natural language", sub: "English & Kannada" },
  { icon: Network, label: "Criminal networks", sub: "Link analysis" },
  { icon: ShieldCheck, label: "Explainable AI", sub: "Cited & auditable" },
];

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(false);

  const doLogin = useCallback((u: string, p: string) => {
    setLoading(true);
    setError("");
    setBooting(true);
    const user = clientLogin(u, p);
    if (user) {
      setTimeout(() => { router.push("/dashboard"); }, 500);
    } else {
      setError("Invalid officer ID or password");
      setLoading(false);
      setBooting(false);
    }
  }, [router]);

  const active = DEMO_ACCOUNTS.find((a) => a.username === username);

  return (
    <div className="relative grid min-h-screen overflow-hidden lg:grid-cols-[1.15fr_1fr]" style={{ background: "rgb(var(--bg))" }}>
      {/* Backdrop: static survey grid — matches the app shell, no glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--border) / 0.5) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--border) / 0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at 40% 40%, #000 30%, transparent 90%)",
          WebkitMaskImage: "radial-gradient(ellipse at 40% 40%, #000 30%, transparent 90%)",
        }}
      />

      {/* LEFT — identity panel */}
      <div className="relative hidden flex-col justify-between border-r border-border p-12 xl:p-16 lg:flex">
        <div className="relative z-10 flex items-start justify-between gap-6">
          <div className="flex items-center gap-3.5">
            <Emblem size={44} />
            <div className="min-w-0">
              <div className="font-display text-lg font-bold tracking-[-0.01em]">Crime Intelligence</div>
              <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">
                Karnataka State Police
              </div>
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded border border-border bg-elevated/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            <Lock className="h-3 w-3" /> Restricted
          </span>
        </div>

        <div className="relative z-10 space-y-6">
          <div className="space-y-3">
            <span className="stat-label block">Officer workspace</span>
            <h1 className="max-w-md font-display text-[2.25rem] font-bold leading-[1.1] tracking-[-0.03em]">
              Advanced Criminal Intelligence Platform
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-muted">
              Reason over FIRs, criminal networks, evidence and geography in natural language.
              Every insight is explainable, auditable, and keeps the officer in command.
            </p>
          </div>

          <div className="grid max-w-lg grid-cols-3 gap-3">
            {CAPABILITIES.map((f) => (
              <div key={f.label} className="rounded-md border border-border bg-surface p-3">
                <span className="mb-2 grid h-7 w-7 place-items-center rounded-md border border-border bg-elevated/60">
                  <f.icon className="h-3.5 w-3.5 text-accent" />
                </span>
                <div className="text-xs font-semibold leading-snug text-subtle">{f.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted">{f.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 text-[11px] font-medium text-muted">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> All systems operational</span>
          <span aria-hidden className="h-3 w-px bg-border" />
          <span>Powered by Zoho Catalyst</span>
          <span className="ml-auto font-mono tabular-nums">NETRA v1.1 · Datathon 2026</span>
        </div>
      </div>

      {/* RIGHT — sign-in */}
      <div className="relative z-10 flex items-center justify-center p-6 sm:p-12">
        <div className="absolute right-6 top-6"><ThemeSwitcher /></div>
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <Emblem size={38} />
            <div className="min-w-0">
              <div className="font-display text-base font-bold leading-tight tracking-[-0.01em]">Crime Intelligence</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Karnataka State Police</div>
            </div>
          </div>

          <div className="card panel-pad sm:p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-elevated/60">
                <KeyRound className="h-4 w-4 text-accent" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-xl font-bold tracking-[-0.02em]">Secure sign in</h2>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">Role-based access · every action is audited.</p>
              </div>
            </div>

            {/* Identity preview */}
            <div className="mt-5 flex items-center gap-3 rounded-md border border-border bg-elevated/40 p-2.5">
              {active ? (
                <>
                  <Avatar name={active.full_name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold leading-tight">{active.full_name}</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted">{active.rank}</div>
                  </div>
                  <Badge tone="accent">{active.label}</Badge>
                </>
              ) : (
                <>
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-dashed border-border bg-surface">
                    <User className="h-4 w-4 text-muted" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium leading-tight text-subtle">Unrecognised officer ID</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted">Pick a role below, or sign in manually</div>
                  </div>
                </>
              )}
            </div>

            {/* One-click demo entry */}
            <button
              onClick={() => doLogin(username, DEMO_PASSWORD)}
              disabled={loading}
              aria-busy={booting}
              className="btn-accent mt-4 h-10 w-full"
            >
              {booting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Booting workspace…</>
              ) : (
                <>Enter as {active?.label ?? "Demo"} <ArrowRight className="h-4 w-4" /></>
              )}
            </button>

            <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              <span className="h-px flex-1 bg-border" /> or sign in manually <span className="h-px flex-1 bg-border" />
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); doLogin(username, password); }}
              className="space-y-3"
            >
              <div>
                <label htmlFor="officer-id" className="stat-label mb-1.5 block">Officer ID</label>
                <div className="group relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition-colors group-focus-within:text-accent" />
                  <input id="officer-id" name="username" className="input pl-9 font-mono" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
                </div>
              </div>
              <div>
                <label htmlFor="officer-password" className="stat-label mb-1.5 block">Password</label>
                <div className="group relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition-colors group-focus-within:text-accent" />
                  <input id="officer-password" name="password" className="input pl-9 font-mono" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger animate-fade-in">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              <button type="submit" className="btn-ghost h-10 w-full" disabled={loading} aria-busy={loading}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
                ) : (
                  <>Sign in <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </form>

            {/* Demo role switcher */}
            <div className="mt-5 border-t border-border pt-4">
              <div className="stat-label mb-2.5">Demo roles · password <span className="kbd">{DEMO_PASSWORD}</span></div>
              <div className="flex flex-wrap gap-1.5">
                {DEMO_ACCOUNTS.map((a) => {
                  const on = username === a.username;
                  return (
                    <button
                      key={a.username}
                      type="button"
                      aria-pressed={on}
                      title={`${a.full_name} · ${a.rank}`}
                      onClick={() => { setUsername(a.username); setPassword(DEMO_PASSWORD); setError(""); }}
                      className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors hover:border-muted/40 hover:text-fg ${on ? "border-accent/60 bg-accent/10 text-fg" : "border-border text-muted"}`}
                    >
                      {on && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="mt-5 flex items-start justify-center gap-2 px-2 text-center text-[11px] leading-relaxed text-muted">
            <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>Authorised personnel only. Access is role-based and every action is written to the audit log.</span>
          </p>
          <div className="mt-3 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted/70 lg:hidden">
            NETRA v1.1 · Datathon 2026
          </div>
        </div>
      </div>
    </div>
  );
}
