import "server-only";
import { cookies } from "next/headers";
import { t as translate, type TransKey } from "./i18n";
import type { Lang } from "@/store/useAppStore";

/** Read the active UI language from the `netra-lang` cookie (defaults to English). */
export function getLang(): Lang {
  const v = cookies().get("netra-lang")?.value;
  return v === "kn" ? "kn" : "en";
}

/** Server-side translator bound to the request's language cookie. */
export function getT(): (key: TransKey) => string {
  const lang = getLang();
  return (key: TransKey) => translate(lang, key);
}
