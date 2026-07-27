"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { FolderKanban, Search } from "lucide-react";
import { PageHeader, Badge, StatusBadge, EmptyState } from "@/components/ui";
import { timeAgo } from "@/lib/utils";
import { useT } from "@/lib/i18n-client";

export interface CaseRow {
  id: number; case_number: string; title: string; status: string; priority: string;
  district: string; updated_at: string; crime_type: string; officer: string;
}

const PRIORITY_TONE: Record<string, "danger" | "warning" | "info" | "muted"> = {
  critical: "danger", high: "warning", medium: "info", low: "muted",
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

  return (
    <div>
      <PageHeader title={t("cases.title")} subtitle={`${rows.length} · ${t("cases.subtitle")}`} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases…" className="input pl-9" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input w-auto">
          {STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? t("cases.all_statuses") : s.replace(/_/g, " ")}</option>)}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="input w-auto">
          {PRIORITIES.map((p) => <option key={p} value={p}>{p === "all" ? "All priorities" : p}</option>)}
        </select>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No cases match" hint="Adjust your filters or search terms." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Case</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">District</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Officer</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-border transition-colors hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`/cases/${c.id}`} className="block">
                      <div className="font-medium text-fg hover:text-accent">{c.title}</div>
                      <div className="font-mono text-xs text-muted">{c.case_number}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-subtle">{c.crime_type}</td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">{c.district}</td>
                  <td className="hidden px-4 py-3 text-muted lg:table-cell">{c.officer}</td>
                  <td className="px-4 py-3"><Badge tone={PRIORITY_TONE[c.priority]}>{c.priority}</Badge></td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="hidden px-4 py-3 text-xs text-muted sm:table-cell">{timeAgo(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
