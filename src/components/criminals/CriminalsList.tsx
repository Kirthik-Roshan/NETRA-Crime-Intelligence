"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users, ShieldAlert, Database } from "lucide-react";
import { PageHeader, Avatar, RiskMeter, StatusBadge, Badge, EmptyState } from "@/components/ui";
import { parseJsonArray } from "@/lib/utils";
import { useT } from "@/lib/i18n-client";

export interface CrimRow {
  id: number; name: string; aliases: string; age: number; gender: string; status: string;
  risk_score: number; crime_category: string; home_district: string; fir_count: number; arrest_count: number;
}

// Static build: all criminals baked in; search + risk band run client-side.
export function CriminalsList({ criminals }: { criminals: CrimRow[] }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState("all");

  const filters = [
    { id: "all", label: t("common.all") },
    { id: "high", label: t("criminals.high_risk") },
    { id: "medium", label: t("criminals.moderate") },
    { id: "low", label: t("criminals.low") },
  ];

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return criminals.filter((c) => {
      if (risk === "high" && !(c.risk_score >= 70)) return false;
      if (risk === "medium" && !(c.risk_score >= 40 && c.risk_score < 70)) return false;
      if (risk === "low" && !(c.risk_score < 40)) return false;
      if (needle && !`${c.name} ${c.home_district} ${c.crime_category}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [criminals, q, risk]);

  return (
    <div>
      <PageHeader title={t("criminals.title")} subtitle={`${rows.length} ${t("criminals.subtitle")}`}>
        <Link href="/database" className="btn-ghost text-sm">
          <Database className="h-4 w-4" /> View in database
        </Link>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("criminals.search")} className="input pl-9" />
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => setRisk(f.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${risk === f.id ? "bg-elevated text-fg" : "text-muted hover:text-fg"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No criminals match your search" hint="Try a different name, district, or risk band." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const aliases = parseJsonArray(c.aliases);
            return (
              <Link key={c.id} href={`/criminals/${c.id}`} className="card panel-pad group animate-fade-in transition-colors hover:border-accent/40">
                <div className="flex items-start gap-3">
                  <Avatar name={c.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{c.name}</span>
                      {c.risk_score >= 80 && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-danger" />}
                    </div>
                    {aliases[0] && <div className="truncate text-xs text-muted">alias {aliases[0]}</div>}
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge status={c.status} />
                      <span className="text-xs text-muted">{c.home_district}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
                  <RiskMeter score={c.risk_score} />
                  <div className="flex gap-3 text-xs text-muted">
                    <span>{c.fir_count} FIRs</span>
                    <span>{c.arrest_count} arrests</span>
                  </div>
                </div>
                <div className="mt-2">
                  <Badge tone="info">{c.crime_category}</Badge>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
