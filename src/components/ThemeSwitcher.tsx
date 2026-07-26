"use client";
import { useState, useRef, useEffect } from "react";
import { Palette, Check } from "lucide-react";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

export function ThemeSwitcher() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition-colors hover:bg-elevated hover:text-fg"
        aria-label="Change theme"
        title="Change theme"
      >
        <Palette className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 animate-scale-in rounded-xl border border-border/70 p-1.5 shadow-card glass">
          <div className="stat-label px-2.5 py-1.5">Theme engine</div>
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTheme(t.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-elevated",
                theme === t.id ? "text-fg" : "text-subtle"
              )}
            >
              <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-border" style={{ background: t.swatch, boxShadow: `0 0 10px ${t.swatch}66` }} />
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate">{t.label}</span>
                <span className="block truncate text-[10px] text-muted">{t.desc}</span>
              </span>
              {theme === t.id && <Check className="h-4 w-4 shrink-0 text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
