"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeName = "daylight" | "nightwatch" | "midnight" | "nocturne" | "carbon" | "slate" | "crimson" | "sandstone";
export type Lang = "en" | "kn";

// Daylight is the operational default. Dark palettes remain available for
// control rooms and night shifts without defining the product's first view.
export const THEMES: { id: ThemeName; label: string; swatch: string; desc: string }[] = [
  { id: "daylight", label: "Daylight", swatch: "#0891B2", desc: "Bright · Official · Operational" },
  { id: "nightwatch", label: "Nightwatch", swatch: "#22D3EE", desc: "High contrast · Night operations" },
  { id: "midnight", label: "Midnight Sapphire", swatch: "#38A0FF", desc: "Deep · Calm · Focused" },
  { id: "carbon", label: "Sunset Ember", swatch: "#F97316", desc: "Warm · Professional · Powerful" },
  { id: "slate", label: "Forest Sage", swatch: "#34D399", desc: "Natural · Tactical · Calm" },
  { id: "crimson", label: "Crimson Command", swatch: "#F43F5E", desc: "Alert · Intense · Critical" },
  { id: "nocturne", label: "Arctic Aurora", swatch: "#A882FF", desc: "Futuristic · Cool · AI-driven" },
  { id: "sandstone", label: "Sandstone", swatch: "#C4703B", desc: "Warm · Light · Editorial" },
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
      theme: "daylight",
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
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as Partial<AppState>;
        // Version 1 shipped with Midnight as an implicit default. Move those
        // workspaces to the new operational default once; explicit alternatives
        // such as Sandstone or Crimson are preserved.
        if (version < 2 && (!state.theme || state.theme === "midnight")) {
          return { ...state, theme: "daylight" } as AppState;
        }
        return state as AppState;
      },
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
