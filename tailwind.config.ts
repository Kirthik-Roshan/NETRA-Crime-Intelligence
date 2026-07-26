import type { Config } from "tailwindcss";

/**
 * Every color maps to a CSS variable defined per-theme in globals.css.
 * Swapping the `data-theme` attribute on <html> re-skins the whole app live.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        elevated: "rgb(var(--elevated) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        fg: "rgb(var(--fg) / <alpha-value>)",
        subtle: "rgb(var(--subtle) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-fg": "rgb(var(--accent-fg) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        info: "rgb(var(--info) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      maxWidth: {
        workspace: "1600px",
      },
      boxShadow: {
        card: "0 1px 0 0 rgb(var(--border) / 0.6), 0 8px 24px -12px rgb(0 0 0 / 0.5)",
        glow: "0 0 0 1px rgb(var(--accent) / 0.25), 0 0 24px -6px rgb(var(--accent) / 0.35)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--accent) / 0.5)" },
          "70%": { boxShadow: "0 0 0 8px rgb(var(--accent) / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--accent) / 0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.36s ease-out both",
        "scale-in": "scale-in 0.24s ease-out both",
        "pulse-ring": "pulse-ring 2s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
