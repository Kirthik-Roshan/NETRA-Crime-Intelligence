"use client";
import { useRouter } from "next/navigation";
import { Search, LogOut, Languages, Cpu, CornerDownLeft } from "lucide-react";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { NotificationsBell } from "./NotificationsBell";
import { useAppStore } from "@/store/useAppStore";
import type { SessionUser } from "@/lib/types";
import { useT } from "@/lib/i18n-client";
import { aiOnline as aiOnlineFn } from "@/lib/ai-client";
import { logout as clearAuth } from "@/lib/auth-client";
import { useState, useEffect } from "react";

export function Topbar({ user: _user }: { user: SessionUser }) {
  const router = useRouter();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const t = useT();
  const [aiOnline, setAiOnline] = useState<boolean | null>(null);

  function toggleLang() {
    setLang(lang === "en" ? "kn" : "en");
  }

  useEffect(() => {
    setAiOnline(aiOnlineFn());
  }, []);

  function logout() {
    clearAuth();
    router.push("/login");
  }

  function goSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    if (q) router.push(`/assistant?q=${encodeURIComponent(String(q))}`);
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur-sm sm:px-6">
      {/* Global command search — routes into the investigation assistant. */}
      <form onSubmit={goSearch} className="group relative hidden max-w-xl flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition-colors group-focus-within:text-accent" />
        <input
          name="q"
          placeholder={t("top.search")}
          className="h-9 w-full rounded-md border border-border bg-elevated/40 pl-9 pr-16 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent/60 focus:bg-elevated/70 focus:ring-2 focus:ring-accent/15"
          aria-label={t("top.search")}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
          <span className="kbd hidden items-center gap-0.5 md:inline-flex"><CornerDownLeft className="h-3 w-3" /></span>
        </span>
      </form>

      <div className="ml-auto flex items-center gap-1.5">
        {/* AI backend status */}
        <div
          className="hidden h-9 items-center gap-1.5 rounded-md border border-border bg-elevated/40 px-2.5 text-xs font-medium text-subtle sm:flex"
          title={aiOnline ? "Zoho Catalyst QuickML connected" : "Using built-in reasoning engine"}
        >
          <Cpu className="h-3.5 w-3.5 text-accent" />
          <span className="hidden md:inline">AI</span>
          <span className={`h-1.5 w-1.5 rounded-full ${aiOnline === null ? "bg-muted" : aiOnline ? "bg-success" : "bg-warning"}`} />
        </div>

        <button
          onClick={toggleLang}
          className="flex h-9 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-subtle transition-colors hover:border-muted/40 hover:bg-elevated hover:text-fg"
          title="Toggle language"
        >
          <Languages className="h-4 w-4" />
          {lang === "en" ? "EN" : "ಕನ್ನಡ"}
        </button>

        <ThemeSwitcher />
        <NotificationsBell />

        <button
          onClick={logout}
          className="grid h-9 w-9 place-items-center rounded-md border border-border text-muted transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
