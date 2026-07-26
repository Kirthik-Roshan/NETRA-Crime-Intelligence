"use client";
import { useAppStore } from "@/store/useAppStore";
import { t, type TransKey } from "./i18n";

/** Client hook — re-renders on language toggle. */
export function useT(): (key: TransKey) => string {
  const lang = useAppStore((s) => s.lang);
  return (key: TransKey) => t(lang, key);
}

export type { TransKey };
