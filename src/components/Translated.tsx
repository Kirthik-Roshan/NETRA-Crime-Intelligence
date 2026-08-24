"use client";
import { createElement, useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { translateText } from "@/lib/ai-client";

// Module-level cache so the same string isn't re-translated across renders/mounts.
const cache = new Map<string, string>();

/**
 * Translate-on-display: when the officer has toggled to Kannada, return the
 * Kannada rendering of `text`; otherwise (or while the translation is pending,
 * or if Zia is unavailable) return the original English — never blank. The DB
 * stays English; translation happens only on display, client-side.
 */
export function useTranslated(text: string): string {
  const lang = useAppStore((s) => s.lang);
  // Always start from the English source so SSR/first-paint matches the server.
  const [out, setOut] = useState(text);

  useEffect(() => {
    if (lang !== "kn" || !text.trim()) {
      setOut(text);
      return;
    }
    const key = `kn:${text}`;
    const cached = cache.get(key);
    if (cached) {
      setOut(cached);
      return;
    }
    let alive = true;
    setOut(text); // show English while the translation resolves
    translateText(text)
      .then((kn) => {
        if (alive && kn) {
          cache.set(key, kn);
          setOut(kn);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lang, text]);

  return out;
}

export function Translated({
  text,
  as = "span",
  className,
}: {
  text: string;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}) {
  const out = useTranslated(text);
  return createElement(as, className ? { className } : undefined, out);
}

export default Translated;
