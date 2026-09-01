"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Loader2, Lock, Network, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Emblem } from "@/components/Emblem";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { beginCatalystSignIn, getClientUser, isDemoAccessMode, mountCatalystSignIn, replaceAppRoute } from "@/lib/auth-client";

const CAPABILITIES = [
  { icon: Sparkles, label: "Natural language", sub: "English and Kannada" },
  { icon: Network, label: "Criminal networks", sub: "Relationship analysis" },
  { icon: ShieldCheck, label: "Explainable AI", sub: "Cited and audited" },
];

export default function LoginPage() {
  const [local, setLocal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const localMode = isDemoAccessMode();
    setLocal(localMode);
    if (localMode) {
      setLoading(false);
      return () => { active = false; };
    }

    void getClientUser().then(async (user) => {
      if (!active) return;
      if (user) {
        replaceAppRoute("/dashboard");
        return;
      }
      try {
        const mounted = await mountCatalystSignIn("catalyst-login");
        if (!active) return;
        setLoading(false);
        if (!mounted) setError("Catalyst Authentication is unavailable in this environment.");
      } catch {
        if (!active) return;
        setLoading(false);
        setError("Catalyst could not initialize the secure sign-in panel.");
      }
    }).catch(() => {
      if (!active) return;
      setLoading(false);
      setError("Catalyst could not check the current officer session.");
    });
    return () => { active = false; };
  }, []);

  return (
    <div className="relative isolate grid min-h-screen overflow-x-hidden bg-bg lg:grid-cols-[1.15fr_1fr]">
      <AmbientBackground intensity="active" />

      <section className="relative hidden min-h-screen flex-col justify-between border-r border-border p-12 lg:flex xl:p-16">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-3.5">
            <Emblem size={44} />
            <div>
              <div className="font-display text-lg font-bold">Crime Intelligence</div>
              <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-muted">Karnataka State Police</div>
            </div>
          </div>
          <span className="chip text-[10px] uppercase tracking-[0.14em]"><Lock className="h-3 w-3" /> Restricted</span>
        </div>

        <div className="max-w-xl space-y-6">
          <div className="space-y-3">
            <span className="stat-label block">Officer workspace</span>
            <h1 className="max-w-lg font-display text-4xl font-bold leading-tight">Advanced Criminal Intelligence Platform</h1>
            <p className="max-w-lg text-sm leading-relaxed text-muted">
              Investigate FIRs, criminal networks, evidence, and geography through one intelligence workspace.
            </p>
          </div>
          <div className="grid max-w-lg grid-cols-3 gap-3">
            {CAPABILITIES.map((item) => (
              <div key={item.label} className="rounded-md border border-border bg-surface p-3">
                <item.icon className="mb-2 h-4 w-4 text-accent" />
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

      <section className="relative flex min-h-screen items-center justify-center p-6 sm:p-12">
        <div className="absolute right-6 top-6"><ThemeSwitcher /></div>
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <Emblem size={40} />
            <div>
              <div className="font-display text-lg font-bold">Crime Intelligence</div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted">Karnataka State Police</div>
            </div>
          </div>

          <div className="card panel-pad sm:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-accent/25 bg-accent/10">
                <Lock className="h-4 w-4 text-accent" />
              </span>
              <div>
                <h2 className="font-display text-2xl font-bold">Secure sign in</h2>
                <p className="mt-1 text-sm text-muted">Catalyst Authentication and role-based access</p>
              </div>
            </div>

            {local ? (
              <button type="button" onClick={beginCatalystSignIn} className="btn-accent mt-6 w-full">
                <ExternalLink className="h-4 w-4" /> Sign in with Google via Catalyst
              </button>
            ) : (
              <div className="relative mt-6 h-[520px] overflow-hidden rounded-md border border-border bg-elevated/30 p-2">
                <div id="catalyst-login" className="h-[500px]" />
                {loading && (
                  <div className="absolute inset-2 grid h-[500px] place-items-center bg-elevated text-sm text-muted">
                    <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-accent" /> Loading secure sign in...</span>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <p className="mt-6 flex items-start justify-center gap-2 px-2 text-center text-[11px] leading-relaxed text-muted">
            <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>Authorized personnel only. Access and intelligence operations are audited.</span>
          </p>
        </div>
      </section>
    </div>
  );
}
