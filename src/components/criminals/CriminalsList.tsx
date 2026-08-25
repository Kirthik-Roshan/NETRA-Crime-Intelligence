"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users, ShieldAlert, Database, UserSearch, Fingerprint, ChevronRight } from "lucide-react";
import { PageHeader, Avatar, RiskMeter, StatusBadge, Badge, EmptyState, StatCard } from "@/components/ui";
import { parseJsonArray, riskBand } from "@/lib/utils";
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

  // Live command readout — tiles reflect the currently filtered view.
  const stats = useMemo(() => {
    let critical = 0, atLarge = 0, firs = 0;
    for (const c of rows) {
      if (c.risk_score >= 80) critical++;
      if (c.status === "at_large") atLarge++;
      firs += c.fir_count || 0;
    }
    return { total: rows.length, critical, atLarge, firs };
  }, [rows]);

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("criminals.title")} subtitle={`${rows.length} ${t("criminals.subtitle")}`}>
        <Link href="/database" className="btn-ghost text-sm">
          <Database className="h-4 w-4" /> View in database
        </Link>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="In view" value={stats.total} icon={Users} />
        <StatCard label="Critical risk" value={stats.critical} sub="Score 80 and above" icon={ShieldAlert} tone="danger" />
        <StatCard label="At large" value={stats.atLarge} sub="Not in custody" icon={UserSearch} tone="warning" />
        <StatCard label="Linked FIRs" value={stats.firs} sub="Across profiles in view" icon={Fingerprint} tone="accent" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("criminals.search")}
            aria-label={t("criminals.search")}
            className="input pl-9"
          />
        </div>
        <div role="group" aria-label="Filter by risk band" className="flex gap-1 rounded-lg border border-border bg-surface/40 p-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={risk === f.id}
              onClick={() => setRisk(f.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium tracking-[-0.01em] transition-colors ${
                risk === f.id
                  ? "bg-elevated text-fg shadow-[inset_0_0_0_1px_rgb(var(--border))]"
                  : "text-muted hover:bg-elevated/50 hover:text-fg"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        criminals.length === 0 ? (
          <EmptyState icon={Users} title="No criminal profiles on record" hint="Profiles appear here once Cloud Scale has intelligence data." />
        ) : (
          <EmptyState icon={Search} title="No profiles match your search" hint="Try a different name, district, or risk band." />
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const aliases = parseJsonArray(c.aliases);
            const band = riskBand(c.risk_score);
            return (
              <Link
                key={c.id}
                href={`/criminals/${c.id}`}
                className="card panel-pad group hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-glow"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={c.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold tracking-[-0.01em] transition-colors group-hover:text-accent">{c.name}</span>
                      {c.risk_score >= 80 && <ShieldAlert aria-label="Critical risk" className="h-3.5 w-3.5 shrink-0 text-danger" />}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {aliases[0] ? <>alias <span className="text-subtle">{aliases[0]}</span></> : <span className="opacity-60">no known alias</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <StatusBadge status={c.status} />
                      <span className="truncate text-xs text-muted">{c.home_district}</span>
                    </div>
                  </div>
                  <ChevronRight aria-hidden className="mt-1 h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </div>

                <div className="mt-3.5 flex items-center justify-between gap-3 border-t border-border/50 pt-3">
                  <div className="flex items-center gap-2">
                    <span className={`stat-label ${band.color}`}>{band.label}</span>
                    <RiskMeter score={c.risk_score} />
                  </div>
                  <div className="flex shrink-0 gap-3 text-xs text-muted">
                    <span><span className="font-mono font-semibold tabular-nums text-subtle">{c.fir_count}</span> FIRs</span>
                    <span><span className="font-mono font-semibold tabular-nums text-subtle">{c.arrest_count}</span> arrests</span>
                  </div>
                </div>

                <div className="mt-2.5">
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
