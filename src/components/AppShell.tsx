"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { can, getClientUser } from "@/lib/auth-client";
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
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    void getClientUser().then((u) => {
      if (!active) return;
      if (!u) {
        router.replace("/login");
        return;
      }
      setUser(u);
      setReady(true);
    });
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const rules: [string, string][] = [
      ["/assistant", "ai"], ["/predictions", "predictive"], ["/cases", "cases"],
      ["/criminals", "criminals"], ["/network", "network"], ["/analytics", "analytics"],
      ["/maps", "analytics"], ["/database", "search"], ["/evidence", "evidence"], ["/reports", "reports"],
    ];
    const required = rules.find(([path]) => pathname.startsWith(path))?.[1];
    if (required && !can(user.role, required)) router.replace("/dashboard");
    if (pathname.startsWith("/admin") && !["administrator", "senior_officer"].includes(user.role)) router.replace("/dashboard");
  }, [pathname, router, user]);

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
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} />
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto w-full max-w-workspace px-5 py-6 sm:px-8">{children}</div>
        </main>
        <StatusBar user={user} />
      </div>
    </div>
  );
}
