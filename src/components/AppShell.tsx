"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { can, getClientUser, replaceAppRoute } from "@/lib/auth-client";
import type { SessionUser } from "@/lib/types";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { StatusBar } from "@/components/StatusBar";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Emblem } from "@/components/Emblem";

/**
 * Client-side auth gate + app chrome for the static build.
 *
 * Every page under (app) is prerendered statically with the demo data baked in.
 * There is no server session, so this component reads the client-side officer
 * (localStorage) after mount, redirects to /login when absent, and only then
 * renders the workspace around the already-built page `children`.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void getClientUser().then((u) => {
      if (!active) return;
      if (!u) {
        replaceAppRoute("/login");
        return;
      }
      setUser(u);
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    const rules: [string, string][] = [
      ["/assistant", "ai"], ["/predictions", "predictive"], ["/cases", "cases"],
      ["/criminals", "criminals"], ["/network", "network"], ["/analytics", "analytics"],
      ["/maps", "analytics"], ["/database", "search"], ["/evidence", "evidence"], ["/reports", "reports"],
    ];
    const routePath = pathname.replace(/^\/app(?=\/|$)/, "") || "/";
    const required = rules.find(([path]) => routePath.startsWith(path))?.[1];
    if (required && !can(user.role, required)) replaceAppRoute("/dashboard");
    if (routePath.startsWith("/admin") && !["administrator", "senior_officer"].includes(user.role)) replaceAppRoute("/dashboard");
  }, [pathname, user]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (!ready || !user) {
    return (
      <div className="grid min-h-screen place-items-center" style={{ background: "rgb(var(--bg))" }}>
        <div className="flex items-center gap-3 text-muted">
          <div className="animate-pulse">
            <Emblem size={44} glass={false} />
          </div>
          <span className="text-sm">Securing workspace…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <AmbientBackground />
      <Sidebar user={user} />
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-fg/20 backdrop-blur-[2px]"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          />
          <Sidebar user={user} mobile onClose={() => setMobileNavOpen(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} onMenu={() => setMobileNavOpen(true)} />
        <main id="main-content" className="relative flex-1 overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1760px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <div className="min-h-[calc(100vh-8.5rem)]">{children}</div>
          </div>
        </main>
        <StatusBar user={user} />
      </div>
    </div>
  );
}
