"use client";
import { UiText, useUiText } from '@/components/UiText';

import { ShieldCheck, Database, Activity, Image as ImageIcon } from "lucide-react";
import { appDocumentPath } from "@/lib/auth-client";
import type { SessionUser } from "@/lib/types";
import { useT, type TransKey } from "@/lib/i18n-client";

const ROLE_KEY: Record<string, TransKey> = {
  administrator: "role.administrator",
  senior_officer: "role.senior_officer",
  investigation_officer: "role.investigation_officer",
  analyst: "role.analyst",
  readonly: "role.readonly",
};

export function StatusBar({ user }: { user: SessionUser }) {
  const ui = useUiText();
  const t = useT();
  return (
    <footer className="flex h-8 items-center gap-4 border-t border-border bg-surface px-4 text-[11px] font-medium text-muted sm:px-6">
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> {t("common.online")}
      </span>
      <span className="hidden items-center gap-1.5 sm:flex">
        <Database className="h-3 w-3" /><UiText text={" Catalyst Data Store"} /></span>
      <span className="hidden items-center gap-1.5 md:flex">
        <ShieldCheck className="h-3 w-3" /> {t(ROLE_KEY[user.role] ?? "role.readonly")}<UiText text={" · audit active"} /></span>
      <span className="ml-auto flex items-center gap-1.5 tabular-nums">
        <a href={appDocumentPath("/workspace/ATTRIBUTION.txt")} target="_blank" rel="noreferrer" title={ui("Vidhana Soudha photo: iMahesh, CC BY-SA 4.0")} aria-label={ui("Background photograph attribution")}><ImageIcon className="h-3 w-3" /></a>
        <Activity className="h-3 w-3 text-accent" /><UiText text={" NETRA v1.1 · KSP Datathon 2026"} /></span>
    </footer>
  );
}
