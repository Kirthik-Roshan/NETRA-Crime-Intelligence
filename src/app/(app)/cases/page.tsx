import Link from "next/link";
import { FolderKanban, Search } from "lucide-react";
import { all } from "@/lib/db";
import { PageHeader, Badge, StatusBadge, EmptyState } from "@/components/ui";
import { formatDate, timeAgo } from "@/lib/utils";
import { getT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

const PRIORITY_TONE: Record<string, "danger" | "warning" | "info" | "muted"> = {
  critical: "danger", high: "warning", medium: "info", low: "muted",
};

export default function CasesPage({ searchParams }: { searchParams: { status?: string; priority?: string; q?: string } }) {
  const t = getT();
  const { status = "all", priority = "all", q = "" } = searchParams;
  const where: string[] = [];
  const params: unknown[] = [];
  if (status !== "all") { where.push("c.status=?"); params.push(status); }
  if (priority !== "all") { where.push("c.priority=?"); params.push(priority); }
  if (q) { where.push("(c.title LIKE ? OR c.case_number LIKE ? OR c.district LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }

  const rows = all<{ id: number; case_number: string; title: string; status: string; priority: string; district: string; updated_at: string; crime_type: string; officer: string }>(
    `SELECT c.id, c.case_number, c.title, c.status, c.priority, c.district, c.updated_at, c.officer,
            f.crime_type
     FROM cases c LEFT JOIN firs f ON f.id=c.fir_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY (c.priority='critical') DESC, c.updated_at DESC LIMIT 120`,
    params
  );

  // Official CaseStatusMaster values (lowercased in the view)
  const statuses = ["all", "registered", "under_investigation", "charge_sheeted", "closed"];
  const priorities = ["all", "critical", "high", "medium", "low"];

  return (
    <div>
      <PageHeader title={t("cases.title")} subtitle={`${rows.length} · ${t("cases.subtitle")}`} />

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder="Search cases…" className="input pl-9" />
        </div>
        <select name="status" defaultValue={status} className="input w-auto">
          {statuses.map((s) => <option key={s} value={s}>{s === "all" ? t("cases.all_statuses") : s.replace(/_/g, " ")}</option>)}
        </select>
        <select name="priority" defaultValue={priority} className="input w-auto">
          {priorities.map((p) => <option key={p} value={p}>{p === "all" ? "All priorities" : p}</option>)}
        </select>
        <button className="btn-ghost">Filter</button>
      </form>

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
