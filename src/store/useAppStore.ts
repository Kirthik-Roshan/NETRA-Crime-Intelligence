"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "midnight" | "nocturne" | "carbon" | "slate" | "crimson" | "daylight" | "sandstone";
export type Lang = "en" | "kn";

// AXIOM signature themes (id kept stable for persistence; label = AXIOM identity).
export const THEMES: { id: ThemeName; label: string; swatch: string; desc: string }[] = [
  { id: "midnight", label: "Midnight Sapphire", swatch: "#38A0FF", desc: "Deep · Calm · Focused" },
  { id: "carbon", label: "Sunset Ember", swatch: "#F97316", desc: "Warm · Professional · Powerful" },
  { id: "slate", label: "Forest Sage", swatch: "#34D399", desc: "Natural · Tactical · Calm" },
  { id: "crimson", label: "Crimson Command", swatch: "#F43F5E", desc: "Alert · Intense · Critical" },
  { id: "nocturne", label: "Arctic Aurora", swatch: "#A882FF", desc: "Futuristic · Cool · AI-driven" },
  { id: "sandstone", label: "Sandstone", swatch: "#C4703B", desc: "Warm · Light · Editorial" },
  { id: "daylight", label: "Daylight", swatch: "#0D9488", desc: "Bright · Clean · Daytime" },
];

interface AppState {
  theme: ThemeName;
  lang: Lang;
  sidebarCollapsed: boolean;
  activeInvestigation: string | null;
  reducedMotion: boolean;
  compact: boolean;
  notifyAlerts: boolean;
  setTheme: (t: ThemeName) => void;
  setLang: (l: Lang) => void;
  toggleSidebar: () => void;
  setActiveInvestigation: (id: string | null) => void;
  setReducedMotion: (v: boolean) => void;
  setCompact: (v: boolean) => void;
  setNotifyAlerts: (v: boolean) => void;
}

function applyTheme(theme: ThemeName) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

function applyPrefs(reducedMotion: boolean, compact: boolean) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-motion", reducedMotion ? "reduced" : "full");
    document.documentElement.setAttribute("data-density", compact ? "compact" : "comfortable");
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: "midnight",
      lang: "en",
      sidebarCollapsed: false,
      activeInvestigation: null,
      reducedMotion: false,
      compact: false,
      notifyAlerts: true,
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      setReducedMotion: (reducedMotion) => {
        set({ reducedMotion });
        applyPrefs(reducedMotion, useAppStore.getState().compact);
      },
      setCompact: (compact) => {
        set({ compact });
        applyPrefs(useAppStore.getState().reducedMotion, compact);
      },
      setNotifyAlerts: (notifyAlerts) => set({ notifyAlerts }),
      setLang: (lang) => {
        // Mirror into a cookie so server components can localize too.
        if (typeof document !== "undefined") {
          document.cookie = `netra-lang=${lang}; path=/; max-age=31536000; samesite=lax`;
        }
        set({ lang });
      },
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setActiveInvestigation: (activeInvestigation) => set({ activeInvestigation }),
    }),
    {
      name: "netra-prefs",
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
          applyPrefs(state.reducedMotion, state.compact);
          // Keep the server-readable lang cookie in sync with persisted prefs.
          if (typeof document !== "undefined") {
            document.cookie = `netra-lang=${state.lang}; path=/; max-age=31536000; samesite=lax`;
          }
        }
      },
    }
  )
);
