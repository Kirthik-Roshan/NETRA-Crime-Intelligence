"use client";
import { useRouter } from "next/navigation";
import { Search, Bell, LogOut, Languages, Cpu } from "lucide-react";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { useAppStore } from "@/store/useAppStore";
import type { SessionUser } from "@/lib/types";
import { useT } from "@/lib/i18n-client";
import { useState, useEffect } from "react";

export function Topbar({ user }: { user: SessionUser }) {
  const router = useRouter();
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);
  const t = useT();
  const [aiOnline, setAiOnline] = useState<boolean | null>(null);

  function toggleLang() {
    setLang(lang === "en" ? "kn" : "en");
    // Re-render server components so their cookie-based localization updates too.
    router.refresh();
  }

  useEffect(() => {
    fetch("/api/ai/status")
      .then((r) => r.json())
      .then((j) => setAiOnline(j.online))
      .catch(() => setAiOnline(false));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function goSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get("q");
    if (q) router.push(`/assistant?q=${encodeURIComponent(String(q))}`);
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur sm:px-6">
      <form onSubmit={goSearch} className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          name="q"
          placeholder={t("top.search")}
          className="input h-9 py-0 pl-9 text-sm"
        />
        <span className="kbd pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">↵</span>
      </form>

      <div className="ml-auto flex items-center gap-2">
        {/* AI status */}
        <div
          className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-subtle sm:flex"
          title={aiOnline ? "Zoho Catalyst QuickML connected" : "Using built-in reasoning engine"}
        >
          <Cpu className="h-3.5 w-3.5 text-accent" />
          <span className="hidden md:inline">AI</span>
          <span className={`h-1.5 w-1.5 rounded-full ${aiOnline === null ? "bg-muted" : aiOnline ? "bg-success" : "bg-warning"}`} />
        </div>

        {/* Language */}
        <button
          onClick={toggleLang}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-subtle transition-colors hover:bg-elevated hover:text-fg"
          title="Toggle language"
        >
          <Languages className="h-4 w-4" />
          {lang === "en" ? "EN" : "ಕನ್ನಡ"}
        </button>

        <ThemeSwitcher />

        <button
          className="relative grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition-colors hover:bg-elevated hover:text-fg"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-danger" />
        </button>

        <button
          onClick={logout}
          className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition-colors hover:bg-elevated hover:text-danger"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </div>
    </header>
  );
}
