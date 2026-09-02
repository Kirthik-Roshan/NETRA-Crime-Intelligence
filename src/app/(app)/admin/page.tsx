"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Users, ScrollText, Cpu, ShieldCheck, Gauge, ClipboardList, Download, RefreshCw, Search } from "lucide-react";
import { PageHeader, Badge, StatCard, Avatar, EmptyState, PanelHeader, Tag } from "@/components/ui";
import { ROLE_LABEL, type SessionUser } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { DataImport } from "@/components/admin/DataImport";
import { useT } from "@/lib/i18n-client";
import { RequireRole, RoleBadge, useOfficer } from "@/components/OfficerName";
import { fetchAuditTrail, fetchCatalystUsers, fetchInfraHealth, type CatalystInfraHealth } from "@/lib/ai-client";

export default function AdminPage() {
  const t = useT();
  const currentOfficer = useOfficer();
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [infra, setInfra] = useState<CatalystInfraHealth | null>(null);
  const [audit, setAudit] = useState<{ ts: string; username: string; role: string; action: string; entity: string; ai_model: string; processing_ms: number; request_id: string; detail: string; source: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [officersResult, auditResult, healthResult] = await Promise.allSettled([
      fetchCatalystUsers(), fetchAuditTrail(200), fetchInfraHealth(),
    ]);
    setUsers(officersResult.status === "fulfilled" ? officersResult.value : []);
    setInfra(healthResult.status === "fulfilled" ? healthResult.value : null);
    const rows = auditResult.status === "fulfilled" ? auditResult.value : [];
    setAudit(rows.map((row) => {
        const actor = row.actor && typeof row.actor === "object" ? row.actor as Record<string, unknown> : {};
        return {
          ts: String(row.occurred_at || ""), username: String(actor.username || actor.full_name || ""), role: String(actor.role || ""),
          action: String(row.action || ""), entity: String(row.entity || ""), ai_model: String(row.model || ""),
          processing_ms: Number(row.processing_ms || 0), request_id: String(row.id || ""),
          detail: typeof row.detail === "string" ? row.detail : row.detail ? JSON.stringify(row.detail) : "",
          source: String(row.source || "Stratus"),
        };
      }).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 200));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const actions = useMemo(() => [...new Set(audit.map((row) => row.action).filter(Boolean))].sort(), [audit]);
  const filteredAudit = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return audit.filter((row) => {
      if (actionFilter !== "all" && row.action !== actionFilter) return false;
      return !needle || Object.values(row).some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [actionFilter, audit, query]);

  const exportLogs = useCallback(() => {
    const fields = ["ts", "username", "role", "action", "entity", "ai_model", "processing_ms", "request_id", "source", "detail"] as const;
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [fields.join(","), ...filteredAudit.map((row) => fields.map((field) => quote(row[field])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `netra-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredAudit]);

  // Presentation-only rollups over the rows already loaded above.
  const visibleUsers = users.length ? users : currentOfficer ? [currentOfficer] : [];
  const admins = visibleUsers.filter((u) => u.role === "administrator").length;
  const aiCalls = audit.filter((a) => a.ai_model).length;
  const latencies = audit.map((a) => a.processing_ms).filter((n) => Number(n) > 0);
  const avgMs = latencies.length ? Math.round(latencies.reduce((s, n) => s + Number(n), 0) / latencies.length) : 0;

  return (
    <RequireRole roles={["administrator", "senior_officer", "investigation_officer", "analyst"]}>
      <div className="space-y-5">
        <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")}>
          <RoleBadge />
        </PageHeader>

        {/* Posture KPI strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label={users.length ? "Officers on roster" : "Visible sessions"}
            value={visibleUsers.length}
            sub={users.length ? `${admins} with admin rights` : "Full roster restricted by role"}
            icon={Users}
            tone="accent"
          />
          <StatCard label="Audit entries" value={audit.length} sub="Most recent window" icon={ScrollText} />
          <StatCard label="AI-assisted actions" value={aiCalls} sub="Model-attributed" icon={Cpu} tone="success" />
          <StatCard label="Avg AI latency" value={avgMs ? `${avgMs}ms` : "—"} sub={latencies.length ? `Across ${latencies.length} timed calls` : "No timed calls"} icon={Gauge} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Officers & Roles */}
          <div className="card panel-pad">
            <PanelHeader
              icon={Users}
              title="Officers & roles"
              sub="Role-based access control across the console"
              count={visibleUsers.length}
            />
            {visibleUsers.length ? (
              <div className="divide-y divide-border/50">
                {visibleUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <Avatar name={u.full_name} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{u.full_name}</div>
                      <div className="truncate font-mono text-[11px] text-muted">{u.username} · {u.rank || ROLE_LABEL[u.role]}</div>
                    </div>
                    <Badge tone={u.role === "administrator" ? "danger" : "info"}>{ROLE_LABEL[u.role]}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Users} title="No officer accounts" hint="Accounts appear here once the roster is provisioned." />
            )}
          </div>

          {/* AI Configuration */}
          <div className="card panel-pad">
            <PanelHeader
              icon={Cpu}
              title="AI configuration"
              sub="Pipeline posture, guardrails, and traceability"
              action={<Badge tone={infra?.services.datastore && infra?.services.zia ? "success" : "warning"}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" /> {infra ? "live" : "health unavailable"}</Badge>}
            />
            <div className="text-sm">
              <ConfigRow label="AI backend" value={infra?.services.quickml ? "Catalyst QuickML connected" : "QuickML unavailable"} tone={infra?.services.quickml ? "accent" : "warning"} />
              <ConfigRow label="Identity session" value={infra?.services.authentication ? "Catalyst Authentication verified" : "Not authenticated in this session"} tone={infra?.services.authentication ? "success" : "warning"} />
              <ConfigRow label="Record access" value={infra?.services.datastore ? "Cloud Scale connected" : "Cloud Scale unavailable"} tone={infra?.services.datastore ? "success" : "warning"} />
              <ConfigRow label="Record search" value={infra?.services.search === true ? "Catalyst Search indexed" : "Bounded fallback scan"} tone={infra?.services.search === true ? "success" : "warning"} />
              <ConfigRow label="Prediction model" value="Explainable baseline · India DC" tone="info" />
              <ConfigRow label="Explainability" value="Enabled · confidence + evidence" tone="success" />
              <ConfigRow label="Audit logging" value="Immutable · Catalyst Stratus" tone="success" />
            </div>
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-border/60 bg-elevated/50 p-3 text-xs leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>
                Catalyst user permissions are applied before records are retrieved. Every AI, Search, evidence-analysis,
                and PDF operation is traceable through its immutable audit object.
              </span>
            </div>
          </div>
        </div>

        <DataImport />

        {/* Audit trail */}
        <div className="card panel-pad">
          <PanelHeader
            icon={ClipboardList}
            title="Audit trail"
            sub="Immutable record of console and AI activity · newest first"
            count={filteredAudit.length}
            action={<div className="flex items-center gap-1.5">
              <button type="button" onClick={() => void load()} disabled={loading} className="btn-ghost h-8 px-2.5" title="Refresh audit trail">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
              </button>
              <button type="button" onClick={exportLogs} disabled={!filteredAudit.length} className="btn-ghost h-8 px-2.5" title="Export filtered logs">
                <Download className="h-3.5 w-3.5" /> Export
              </button>
            </div>}
          />
          <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search actor, entity, model, or request ID…" className="h-9 w-full rounded-md border border-border bg-elevated/40 pl-8 pr-3 text-xs outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15" />
            </label>
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="h-9 rounded-md border border-border bg-elevated/40 px-3 text-xs outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15">
              <option value="all">All actions</option>
              {actions.map((action) => <option key={action} value={action}>{action}</option>)}
            </select>
          </div>
          {filteredAudit.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                    <th className="pb-2 pr-3">Action</th>
                    <th className="pb-2 pr-3">Role</th>
                    <th className="pb-2 pr-3">Entity</th>
                    <th className="pb-2 pr-3">AI model</th>
                    <th className="pb-2 pr-3 text-right">Latency</th>
                    <th className="pb-2 pr-3">Request ID</th>
                    <th className="pb-2 text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.map((a, index) => (
                    <tr key={`${a.request_id}-${a.ts}-${index}`} className="border-t border-border/50 transition-colors hover:bg-elevated/50">
                      <td className="py-2 pr-3"><Tag mono>{a.action}</Tag></td>
                      <td className="whitespace-nowrap py-2 pr-3 capitalize text-subtle">{a.role?.replace(/_/g, " ")}</td>
                      <td className="py-2 pr-3 text-muted">{a.entity}</td>
                      <td className="py-2 pr-3">{a.ai_model ? <Badge tone="accent">{a.ai_model}</Badge> : <span className="text-muted">—</span>}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right font-mono tabular-nums text-muted">{a.processing_ms ? `${a.processing_ms}ms` : "—"}</td>
                      <td className="py-2 pr-3 font-mono text-[10px] text-muted">{a.request_id}</td>
                      <td className="whitespace-nowrap py-2 text-right text-xs tabular-nums text-muted">{timeAgo(a.ts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={ScrollText} title={loading ? "Loading audit entries" : query || actionFilter !== "all" ? "No matching audit entries" : "No audit entries yet"} hint={loading ? "Reading immutable logs from Catalyst Stratus and Cloud Scale." : "Console and AI activity is logged here as officers work."} />
          )}
        </div>
      </div>
    </RequireRole>
  );
}

function ConfigRow({ label, value, tone }: { label: string; value: string; tone: "info" | "accent" | "success" | "warning" }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-2.5 last:border-0">
      <span className="text-muted">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}
