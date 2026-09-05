"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  AtSign,
  BadgeCheck,
  ExternalLink,
  KeyRound,
  Loader2,
  LockKeyhole,
  Network,
  Radio,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Emblem } from "@/components/Emblem";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import {
  beginCatalystSignIn,
  getClientUser,
  mountCatalystSignIn,
  replaceAppRoute,
} from "@/lib/auth-client";

const CAPABILITIES = [
  { icon: Sparkles, label: "Natural language", sub: "English and Kannada" },
  { icon: Network, label: "Criminal networks", sub: "Relationship analysis" },
  { icon: ShieldCheck, label: "Explainable AI", sub: "Cited and audited" },
];

type AuthView = "checking" | "embedded" | "redirect" | "error";

export default function LoginPage() {
  const [authView, setAuthView] = useState<AuthView>("checking");
  const [error, setError] = useState("");
  const [officerEmail, setOfficerEmail] = useState("");

  async function mountProvider() {
    setAuthView("checking");
    setError("");
    try {
      const mounted = await mountCatalystSignIn("netra-catalyst-signin");
      setAuthView(mounted ? "embedded" : "redirect");
    } catch {
      setAuthView("error");
      setError("Catalyst Authentication could not be loaded. Use the secure redirect to continue.");
    }
  }

  useEffect(() => {
    let active = true;
    void getClientUser()
      .then(async (user) => {
        if (!active) return;
        if (user) {
          replaceAppRoute("/dashboard");
          return;
        }
        try {
          const mounted = await mountCatalystSignIn("netra-catalyst-signin");
          if (active) setAuthView(mounted ? "embedded" : "redirect");
        } catch {
          if (!active) return;
          setAuthView("error");
          setError("Catalyst Authentication could not be loaded. Use the secure redirect to continue.");
        }
      })
      .catch(() => {
        if (!active) return;
        setAuthView("error");
        setError("Catalyst could not verify the current officer session.");
      });
    return () => { active = false; };
  }, []);

  const checking = authView === "checking";
  const showRedirect = authView === "redirect" || authView === "error";

  return (
    <div className="relative isolate grid min-h-screen overflow-x-hidden bg-bg lg:grid-cols-[minmax(0,1.2fr)_minmax(430px,0.8fr)]">
      <AmbientBackground intensity="active" />

      <section className="relative hidden min-h-screen flex-col justify-between border-r border-border p-12 lg:flex xl:p-16">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-3.5">
            <Emblem size={48} />
            <div>
              <div className="font-display text-lg font-bold">Crime Intelligence</div>
              <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">Karnataka State Police</div>
            </div>
          </div>
          <span className="chip text-[10px] uppercase tracking-[0.14em]"><LockKeyhole className="h-3 w-3" /> Restricted</span>
        </div>

        <div className="max-w-2xl space-y-7">
          <div className="space-y-3">
            <span className="eyebrow block">Officer workspace</span>
            <h1 className="max-w-xl font-display text-4xl font-bold leading-tight xl:text-5xl">
              Advanced Criminal Intelligence Platform
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted">
              Investigate FIRs, criminal networks, evidence, and geography through one intelligence workspace.
            </p>
          </div>

          <div className="grid max-w-xl grid-cols-3 gap-3">
            {CAPABILITIES.map((item) => (
              <div key={item.label} className="rounded-md border border-border bg-surface/90 p-3.5 shadow-sm">
                <item.icon className="mb-2.5 h-4 w-4 text-accent" />
                <div className="text-xs font-semibold text-subtle">{item.label}</div>
                <div className="mt-0.5 text-[11px] text-muted">{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 border-t border-border pt-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success" /> Cloud Scale connected</span>
          <span className="ml-auto font-mono">NETRA v1.1</span>
        </div>
      </section>

      <section className="relative flex min-h-screen items-start justify-center bg-surface/35 px-5 pb-10 pt-24 backdrop-blur-[2px] sm:px-10 lg:items-center lg:py-10 xl:px-14">
        <div className="absolute right-5 top-5"><ThemeSwitcher /></div>
        <div className="w-full max-w-[470px]">
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <Emblem size={46} />
            <div>
              <div className="font-display text-lg font-bold">Crime Intelligence</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted">Karnataka State Police</div>
            </div>
          </div>

          <div className="login-gateway card card-static overflow-hidden">
            <div className="px-6 pb-6 pt-8 text-center sm:px-7">
              <Emblem size={112} glass={false} className="mx-auto" />
              <span className="stat-label mt-4 block text-accent">Karnataka State Police</span>
              <h2 className="mt-1 font-display text-2xl font-bold">Secure officer sign in</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">NETRA Crime Intelligence Gateway</p>
            </div>

            <div className="flex items-center gap-2 border-y border-border bg-elevated/55 px-6 py-2.5 text-[11px] text-muted sm:px-7">
              <BadgeCheck className="h-3.5 w-3.5 text-success" />
              <span className="font-semibold text-subtle">Catalyst verified</span>
              <span aria-hidden="true">/</span>
              <span>Federated identity enabled</span>
            </div>

            <div className="px-6 py-6 sm:px-7">
              <div className="mb-3 flex items-center justify-between gap-4">
                <span className="stat-label">Identity provider</span>
                <span className="flex items-center gap-1.5 text-[11px] text-success"><Radio className="h-3 w-3" /> Online</span>
              </div>

              <label htmlFor="officer-email" className="stat-label block">Official email address</label>
              <div className="relative mt-2">
                <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  id="officer-email"
                  type="email"
                  value={officerEmail}
                  onChange={(event) => setOfficerEmail(event.target.value)}
                  autoComplete="username"
                  placeholder="name@ksp.gov.in"
                  className="input h-11 pl-10"
                />
              </div>

              <div className="relative mt-4">
                <div
                  id="netra-catalyst-signin"
                  aria-label="Catalyst officer sign in"
                  className={`catalyst-signin-frame ${checking || authView === "embedded" ? "is-mounted" : ""}`}
                />

                {checking && (
                  <div className="absolute inset-0 z-[1] flex items-center justify-center gap-2.5 rounded-md border border-border bg-elevated text-sm text-muted">
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                    Verifying secure session
                  </div>
                )}

                {showRedirect && (
                  <button
                    type="button"
                    onClick={beginCatalystSignIn}
                    className="btn-accent h-12 w-full text-sm"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open secure sign-in
                  </button>
                )}
              </div>

              {error && (
                <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs leading-relaxed text-danger">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {authView === "error" && (
                <button type="button" onClick={() => void mountProvider()} className="btn-subtle mt-2 w-full text-xs">
                  Retry embedded authentication
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 divide-x divide-border border-t border-border bg-elevated/35 px-2 py-3.5 text-center text-[10px] text-muted">
              <span className="flex items-center justify-center gap-1.5"><KeyRound className="h-3 w-3 text-accent" /> SSO protected</span>
              <span className="flex items-center justify-center gap-1.5"><ShieldCheck className="h-3 w-3 text-accent" /> Role controlled</span>
              <span className="flex items-center justify-center gap-1.5"><BadgeCheck className="h-3 w-3 text-accent" /> Audit logged</span>
            </div>
          </div>

          <p className="mt-5 flex items-start justify-center gap-2 px-2 text-center text-[11px] leading-relaxed text-muted">
            <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>Authorized personnel only. Access and intelligence operations are monitored and audited.</span>
          </p>
        </div>
      </section>
    </div>
  );
}
