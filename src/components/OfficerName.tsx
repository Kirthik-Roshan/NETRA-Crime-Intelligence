"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { getClientUser } from "@/lib/auth-client";
import { Badge } from "@/components/ui";
import { ROLE_LABEL, type Role, type SessionUser } from "@/lib/types";

/** Reactive access to the client-side officer (null until mounted). */
export function useOfficer(): SessionUser | null {
  const [u, setU] = useState<SessionUser | null>(null);
  useEffect(() => setU(getClientUser()), []);
  return u;
}

/** Renders the officer's first name once hydrated (blank during SSG). */
export function OfficerFirstName() {
  const u = useOfficer();
  return <>{u ? u.full_name.split(" ")[0] : "Officer"}</>;
}

/** Role badge for the current officer. */
export function RoleBadge() {
  const u = useOfficer();
  if (!u) return null;
  return (
    <Badge tone="accent">
      <ShieldCheck className="h-3 w-3" /> {ROLE_LABEL[u.role]}
    </Badge>
  );
}

/**
 * Client route guard: redirects to /dashboard unless the officer's role is
 * allowed. Renders nothing until the check passes (avoids flashing gated data).
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const u = getClientUser();
    if (!u) router.replace("/login");
    else if (!roles.includes(u.role)) router.replace("/dashboard");
    else setOk(true);
  }, [router, roles]);
  if (!ok) return null;
  return <>{children}</>;
}
