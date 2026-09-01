import type { Metadata } from "next";
import localFont from "next/font/local";
import { CatalystSdkLoader } from "@/components/CatalystSdkLoader";
import "./globals.css";

// Self-hosted fonts — no external font CDN (Google Fonts) is contacted at
// build or runtime. Variable woff2 files ship in the repo under app/fonts.
// Pairing: Space Grotesk (display — a confident, engineered grotesque that
// reads as authoritative signage), Manrope (body — a highly legible geometric
// sans), JetBrains Mono (data/IDs). fallback + metric adjustment cut the
// layout shift before the woff2 swaps in.
const sans = localFont({
  src: "./fonts/manrope.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "400 700",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
const display = localFont({
  src: "./fonts/space-grotesk.woff2",
  variable: "--font-display",
  display: "swap",
  weight: "400 700",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
const mono = localFont({
  src: "./fonts/jetbrains-mono.woff2",
  variable: "--font-mono",
  display: "swap",
  weight: "400 700",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "NETRA — Crime Intelligence Platform | KSP",
  description:
    "AI-powered Crime Investigation Intelligence Platform for the Karnataka State Police. Natural-language investigation, criminal network analysis, and explainable predictive intelligence.",
};

// Set the theme before first paint to avoid a flash of the wrong palette.
const themeInit = `(function(){try{var p=JSON.parse(localStorage.getItem('netra-prefs'));var t=p&&p.state&&p.state.theme;var v=p&&p.version;if((v==null||v<2)&&(!t||t==='midnight'))t='daylight';document.documentElement.setAttribute('data-theme',t||'daylight');}catch(e){document.documentElement.setAttribute('data-theme','daylight');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="daylight" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <CatalystSdkLoader />
        {children}
      </body>
    </html>
  );
}
