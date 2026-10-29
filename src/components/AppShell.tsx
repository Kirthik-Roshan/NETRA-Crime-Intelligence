"use client";
import { UiText, useUiText } from '@/components/UiText';

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { appDocumentPath, can, getClientUser, replaceAppRoute, resetClientAuthResolution } from "@/lib/auth-client";
import type { SessionUser } from "@/lib/types";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { StatusBar } from "@/components/StatusBar";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Emblem } from "@/components/Emblem";
import { AlertTriangle, LogIn, RefreshCw } from "lucide-react";
import "./workspace.css";
import "./workspace-polish.css";
import "./operations-polish.css";
import { startPortalPresence } from '@/lib/session-presence';

/**
 * Client-side auth gate + app chrome for the static build.
 *
 * Every page under (app) is prerendered as a static shell; records are loaded
 * after sign-in from the authenticated Catalyst Function and Cloud Scale. The
 * component resolves the Catalyst officer session, redirects to /login when
 * absent, and only then renders the workspace.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const ui = useUiText();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [authFailure, setAuthFailure] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const resolveSession = useCallback(() => {
    let active = true;
    setAuthFailure(null);
    const timeout = window.setTimeout(() => {
      if (active) setAuthFailure("The Catalyst session took too long to respond on this browser.");
    }, 12000);

    void getClientUser().then((u) => {
      if (!active) return;
      window.clearTimeout(timeout);
      if (!u) {
        replaceAppRoute("/login");
        return;
      }
      setUser(u);
      setReady(true);
    }).catch(() => {
      window.clearTimeout(timeout);
      if (active) setAuthFailure("The Catalyst session could not be verified.");
    });

    const onSdkFailure = () => {
      if (active) setAuthFailure("The Catalyst authentication service was blocked or failed to load.");
    };
    window.addEventListener("netra:catalyst-error", onSdkFailure);
    return () => {
      active = false;
      window.clearTimeout(timeout);
      window.removeEventListener("netra:catalyst-error", onSdkFailure);
    };
  }, []);

  useEffect(() => {
    return resolveSession();
  }, [resolveSession]);

  const retrySession = () => {
    resetClientAuthResolution();
    window.location.replace(`${window.location.pathname}?_netra_auth=${Date.now()}`);
  };

  const openSignIn = () => {
    resetClientAuthResolution();
    replaceAppRoute("/login?recover=1");
  };

  useEffect(() => {
    if (!user) return;
    const rules: [string, string][] = [
      ["/assistant", "ai"], ["/investigations", "ai"], ["/predictions", "predictive"], ["/cases", "cases"],
      ["/criminals", "criminals"], ["/network", "network"], ["/analytics", "analytics"],
      ["/maps", "analytics"], ["/database", "search"], ["/evidence", "evidence"], ["/reports", "reports"],
      ["/admin", "audit"],
    ];
    const routePath = pathname.replace(/^\/app(?=\/|$)/, "") || "/";
    const required = rules.find(([path]) => routePath.startsWith(path))?.[1];
    if (required && !can(user.role, required)) replaceAppRoute("/dashboard");
  }, [pathname, user]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (user) return startPortalPresence();
  }, [user, pathname]);

  if (!ready || !user) {
    return (
      <div className="grid min-h-screen place-items-center" style={{ background: "rgb(var(--bg))" }}>
        {authFailure ? (
          <div className="mx-5 w-full max-w-md rounded-md border border-warning/35 bg-surface p-5 shadow-card">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-warning/30 bg-warning/10 text-warning">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div>
                <h1 className="font-display text-base font-semibold"><UiText text={"Session recovery required"} /></h1>
                <p className="mt-1 text-sm leading-relaxed text-muted"><UiText text={authFailure} /></p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              <button type="button" className="btn-primary" onClick={retrySession}><RefreshCw className="h-4 w-4" /><UiText text={" Retry"} /></button>
              <button type="button" className="btn-ghost" onClick={openSignIn}><LogIn className="h-4 w-4" /><UiText text={" Open sign in"} /></button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted"><UiText text={"If a privacy extension blocks Zoho or Catalyst scripts, allow this site and retry. NETRA does not clear your provider account cookies."} /></p>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-muted">
            <div className="animate-pulse"><Emblem size={44} glass={false} /></div>
            <span className="text-sm"><UiText text={"Securing workspace..."} /></span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <AmbientBackground intensity="active" />
      <Sidebar user={user} />
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-fg/20 backdrop-blur-[2px]"
            onClick={() => setMobileNavOpen(false)}
            aria-label={ui("Close navigation")}
          />
          <Sidebar user={user} mobile onClose={() => setMobileNavOpen(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} onMenu={() => setMobileNavOpen(true)} />
        <main id="main-content" data-page={pathname.replace(/^\/app(?=\/|$)/, "").split("/")[1] || "dashboard"} className="netra-workspace relative min-w-0 flex-1 overflow-x-clip">
          <div className="workspace-landmark" aria-hidden="true">
            <svg width="0" height="0" className="absolute pointer-events-none" focusable="false">
              <defs>
                <filter id="netra-landmark-ink" colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
                  <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 0 1" result="detail" />
                  <feComponentTransfer in="detail" result="silhouette"><feFuncA type="linear" slope="1.8" intercept="-0.3" /></feComponentTransfer>
                  <feFlood style={{ floodColor: "rgb(var(--muted))" }} result="theme" />
                  <feComposite in="theme" in2="silhouette" operator="in" />
                </filter>
              </defs>
            </svg>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={appDocumentPath("/workspace/vidhana-soudha.jpg")} alt="" />
          </div>
          <div className="mx-auto w-full max-w-[1760px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <div className="min-h-[calc(100vh-8.5rem)]">{children}</div>
          </div>
        </main>
        <StatusBar user={user} />
      </div>
    </div>
  );
}
