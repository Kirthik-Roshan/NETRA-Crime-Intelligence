"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderKanban, Search, ShieldAlert, Radar, CheckCircle2, X } from "lucide-react";
import { PageHeader, Badge, StatCard, StatusBadge, EmptyState, Segmented, Tag, Avatar } from "@/components/ui";
import { timeAgo } from "@/lib/utils";
import { useT } from "@/lib/i18n-client";

export interface CaseRow {
  id: number; case_number: string; title: string; status: string; priority: string;
  district: string; updated_at: string; crime_type: string; officer: string;
}

const PRIORITY_TONE: Record<string, "danger" | "warning" | "info" | "muted"> = {
  critical: "danger", high: "warning", medium: "info", low: "muted",
};
// Left-edge scan bar — lets an investigator sweep the table for criticality.
const PRIORITY_BAR: Record<string, string> = {
  critical: "bg-danger", high: "bg-warning", medium: "bg-info", low: "bg-border",
};
const STATUSES = ["all", "registered", "under_investigation", "charge_sheeted", "closed"];
const PRIORITIES = ["all", "critical", "high", "medium", "low"];

// Static build: all cases are baked in; search + filters run client-side.
export function CasesList({ cases }: { cases: CaseRow[] }) {
  const t = useT();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cases.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (priority !== "all" && c.priority !== priority) return false;
      if (needle && !`${c.title} ${c.case_number} ${c.district}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [cases, q, status, priority]);

  // Live command readout — tiles reflect the currently filtered view.
  const stats = useMemo(() => {
    let critical = 0, investigating = 0, closed = 0;
    for (const c of rows) {
      if (c.priority === "critical") critical++;
      if (c.status === "under_investigation") investigating++;
      if (c.status === "closed") closed++;
    }
    return { total: rows.length, critical, investigating, closed };
  }, [rows]);

  const activeFilters = q.trim() !== "" || status !== "all" || priority !== "all";
  const reset = () => { setQ(""); setStatus("all"); setPriority("all"); };

  return (
    <div className="animate-fade-in">
      <PageHeader title={t("cases.title")} subtitle={`${rows.length} · ${t("cases.subtitle")}`}>
        <div className="hidden items-center gap-2 sm:flex">
          <span className="stat-label">Total records</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-fg">{cases.length}</span>
        </div>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="In view" value={stats.total} sub="Matching filters" icon={FolderKanban} />
        <StatCard label="Critical" value={stats.critical} sub="Highest priority" icon={ShieldAlert} tone="danger" />
        <StatCard label="Investigating" value={stats.investigating} sub="Active workload" icon={Radar} tone="warning" />
        <StatCard label="Closed" value={stats.closed} sub="Resolved & filed" icon={CheckCircle2} tone="success" />
      </div>

      {/* Command filter bar — one seamless control strip. */}
      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-surface p-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:min-w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search case number, title, or district…"
            aria-label="Search cases"
            className="input border-transparent bg-transparent pl-9 focus:border-accent/60 focus:bg-elevated/50"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <span aria-hidden className="hidden h-6 w-px shrink-0 bg-border sm:block" />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
            className="input w-auto shrink-0 capitalize border-transparent bg-transparent focus:border-accent/60 focus:bg-elevated/50"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s === "all" ? t("cases.all_statuses") : s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <Segmented
            ariaLabel="Filter by priority"
            value={priority}
            onChange={setPriority}
            options={PRIORITIES.map((p) => ({ value: p, label: p === "all" ? "All" : p[0].toUpperCase() + p.slice(1) }))}
          />
          {activeFilters && (
            <button type="button" onClick={reset} aria-label="Reset filters" className="btn-subtle shrink-0 px-2.5 text-xs">
              <X className="h-3.5 w-3.5" /> Reset
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        cases.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No cases on record" hint="Cases appear here once Cloud Scale returns investigation data." />
        ) : (
          <div>
            <EmptyState icon={Search} title="No cases match your filters" hint="Try a different search term, status, or priority band." />
            {activeFilters && (
              <div className="mt-3 flex justify-center">
                <button type="button" onClick={reset} className="btn-ghost text-sm">
                  <X className="h-4 w-4" /> Reset filters
                </button>
              </div>
            )}
          </div>
        )
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-elevated/40 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                <tr>
                  <th className="w-1 p-0" aria-hidden />
                  <th className="px-4 py-3 font-semibold">Case</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">District</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Officer</th>
                  <th className="px-4 py-3 font-semibold">Priority</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="hidden px-4 py-3 text-right font-semibold sm:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="group border-t border-border/50 transition-colors hover:bg-elevated/50">
                    <td className="p-0">
                      <span aria-hidden className={`mx-auto block h-7 w-[3px] rounded-full ${PRIORITY_BAR[c.priority] ?? "bg-border"}`} />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/cases/${c.id}`} className="block">
                        <span className="block font-mono text-[11px] uppercase tracking-wide text-muted">{c.case_number}</span>
                        <span className="mt-0.5 block max-w-[38ch] truncate font-medium text-fg transition-colors group-hover:text-accent">{c.title}</span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3"><Tag>{c.crime_type}</Tag></td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-muted md:table-cell">{c.district}</td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <div className="flex items-center gap-2">
                        <Avatar name={c.officer} size={22} />
                        <span className="whitespace-nowrap text-subtle">{c.officer}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge tone={PRIORITY_TONE[c.priority]}>{c.priority}</Badge></td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right text-xs tabular-nums text-muted sm:table-cell">{timeAgo(c.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-elevated/20 px-4 py-2.5 text-[11px] text-muted">
            <span>
              Showing <span className="font-mono tabular-nums text-subtle">{rows.length}</span> of{" "}
              <span className="font-mono tabular-nums text-subtle">{cases.length}</span> cases
            </span>
            {stats.critical > 0 && (
              <span className="inline-flex items-center gap-1.5 font-medium text-danger">
                <ShieldAlert className="h-3.5 w-3.5" /> {stats.critical} critical in view
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
