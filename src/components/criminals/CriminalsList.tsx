"use client";
import { useMemo, useState } from "react";
import Link from "@/components/AppLink";
import { Search, Users, ShieldAlert, Database, UserSearch, Fingerprint, ChevronRight, X } from "lucide-react";
import { PageHeader, Avatar, RiskMeter, StatusBadge, EmptyState, StatCard, Segmented, Tag } from "@/components/ui";
import { parseJsonArray, riskBand } from "@/lib/utils";
import { useT } from "@/lib/i18n-client";

export interface CrimRow {
  id: number; name: string; aliases: string; age: number; gender: string; status: string;
  risk_score: number; crime_category: string; home_district: string; fir_count: number; arrest_count: number;
}

type RiskFilter = "all" | "high" | "medium" | "low";

// Static build: all criminals baked in; search + risk band run client-side.
export function CriminalsList({ criminals }: { criminals: CrimRow[] }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState<RiskFilter>("all");

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
      <PageHeader title={t("criminals.title")} subtitle={`${rows.length} · ${t("criminals.subtitle")}`}>
        <Link href="/database" className="btn-ghost h-9 text-xs">
          <Database className="h-4 w-4" /> View in database
        </Link>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="In view" value={stats.total} icon={Users} />
        <StatCard label="Critical risk" value={stats.critical} sub="Score 80+" icon={ShieldAlert} tone="danger" />
        <StatCard label="At large" value={stats.atLarge} sub="Not in custody" icon={UserSearch} tone="warning" />
        <StatCard label="Linked FIRs" value={stats.firs} sub="Across visible profiles" icon={Fingerprint} tone="accent" />
      </div>

      {/* Filter toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface/60 p-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("criminals.search")}
            aria-label={t("criminals.search")}
            className="h-9 w-full rounded-md border border-border bg-elevated/40 pl-9 pr-8 text-sm text-fg outline-none placeholder:text-muted focus:border-accent/60 focus:bg-elevated/70 focus:ring-2 focus:ring-accent/15"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded text-muted transition-colors hover:text-fg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Segmented<RiskFilter>
          ariaLabel="Filter by risk band"
          value={risk}
          onChange={setRisk}
          options={[
            { value: "all", label: t("common.all") },
            { value: "high", label: t("criminals.high_risk") },
            { value: "medium", label: t("criminals.moderate") },
            { value: "low", label: t("criminals.low") },
          ]}
        />
        {(q || risk !== "all") && (
          <button
            onClick={() => { setQ(""); setRisk("all"); }}
            className="btn-subtle h-9 text-xs"
          >
            Reset
          </button>
        )}
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
            const risk_bg = c.risk_score >= 80 ? "bg-danger" : c.risk_score >= 60 ? "bg-warning" : c.risk_score >= 40 ? "bg-info" : "bg-success";
            return (
              <Link
                key={c.id}
                href={`/criminals/${c.id}`}
                className="card panel-pad group relative overflow-hidden hover:border-accent/40"
              >
                <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${risk_bg}`} />
                <div className="flex items-start gap-3">
                  <Avatar name={c.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold tracking-[-0.01em] transition-colors group-hover:text-accent">{c.name}</span>
                      {c.risk_score >= 80 && <ShieldAlert aria-label="Critical risk" className="h-3.5 w-3.5 shrink-0 text-danger" />}
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted">
                      REC-{String(c.id).padStart(4, "0")}
                      {aliases[0] && <> · alias <span className="text-subtle">{aliases[0]}</span></>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={c.status} />
                      <Tag>{c.home_district}</Tag>
                    </div>
                  </div>
                  <ChevronRight aria-hidden className="mt-1 h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
                  <div className="min-w-0">
                    <div className="stat-label">Risk</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`font-display text-lg font-bold leading-none tabular-nums ${band.color}`}>{c.risk_score}</span>
                      <span className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${band.color}`}>{band.label}</span>
                    </div>
                    <div className="mt-1.5"><RiskMeter score={c.risk_score} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MicroStat label="FIRs" value={c.fir_count} />
                    <MicroStat label="Arrests" value={c.arrest_count} />
                  </div>
                </div>

                <div className="mt-2.5 text-[11px] capitalize text-muted">
                  <span className="text-subtle">{c.crime_category || "—"}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MicroStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="stat-label truncate">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-subtle">{value ?? 0}</div>
    </div>
  );
}
