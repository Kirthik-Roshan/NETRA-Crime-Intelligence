import { t as translate, type TransKey } from "./i18n";

/**
 * Build-time translator for the static export.
 *
 * Server components render once at BUILD time, where there is no request and no
 * language cookie, so their text is baked in English. Live language switching
 * happens client-side via `useT()` (src/lib/i18n-client.ts), which re-renders
 * the interactive components on toggle.
 */
export function getT(): (key: TransKey) => string {
  return (key: TransKey) => translate("en", key);
}
