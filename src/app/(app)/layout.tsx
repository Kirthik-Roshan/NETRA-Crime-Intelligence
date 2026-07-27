import { AppShell } from "@/components/AppShell";

// Static build: no server session. The client-side gate + chrome live in
// AppShell; this server layout just wraps the prerendered page children so
// their data still bakes in at build time.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
