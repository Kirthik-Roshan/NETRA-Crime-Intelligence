import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { StatusBar } from "@/components/StatusBar";
import { AmbientBackground } from "@/components/AmbientBackground";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <AmbientBackground />
      <Sidebar user={session} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={session} />
        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto w-full max-w-workspace px-5 py-6 sm:px-8">{children}</div>
        </main>
        <StatusBar user={session} />
      </div>
    </div>
  );
}
