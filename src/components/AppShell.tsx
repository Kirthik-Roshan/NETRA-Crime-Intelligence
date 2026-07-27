"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { getClientUser } from "@/lib/auth-client";
import type { SessionUser } from "@/lib/types";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { StatusBar } from "@/components/StatusBar";
import { AmbientBackground } from "@/components/AmbientBackground";

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
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = getClientUser();
    if (!u) {
      router.replace("/login");
      return;
    }
    setUser(u);
    setReady(true);
  }, [router]);

  if (!ready || !user) {
    return (
      <div className="grid min-h-screen place-items-center" style={{ background: "rgb(var(--bg))" }}>
        <div className="flex items-center gap-3 text-muted">
          <div className="grid h-10 w-10 animate-pulse place-items-center rounded-xl bg-accent text-accent-fg">
            <Eye className="h-5 w-5" />
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
