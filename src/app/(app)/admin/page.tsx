"use client";

import { useEffect, useState } from "react";
import { Users, ScrollText, Cpu, ShieldCheck, Gauge, ClipboardList } from "lucide-react";
import { PageHeader, Badge, StatCard, Avatar, EmptyState, PanelHeader, Tag } from "@/components/ui";
import { ROLE_LABEL, type SessionUser } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { DataImport } from "@/components/admin/DataImport";
import { useT } from "@/lib/i18n-client";
import { RequireRole, RoleBadge } from "@/components/OfficerName";
import { fetchAuditTrail, fetchCatalystUsers, fetchInfraHealth, type CatalystInfraHealth } from "@/lib/ai-client";

export default function AdminPage() {
  const t = useT();
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [infra, setInfra] = useState<CatalystInfraHealth | null>(null);
  const [audit, setAudit] = useState<{ ts: string; username: string; role: string; action: string; entity: string; ai_model: string; processing_ms: number; request_id: string }[]>([]);
  useEffect(() => {
    void Promise.all([fetchCatalystUsers(), fetchAuditTrail(100), fetchInfraHealth()]).then(([officers, rows, health]) => {
      setUsers(officers);
      setInfra(health);
      setAudit(rows.map((row) => {
        const actor = row.actor && typeof row.actor === "object" ? row.actor as Record<string, unknown> : {};
        return {
          ts: String(row.occurred_at || ""), username: String(actor.username || actor.full_name || ""), role: String(actor.role || ""),
          action: String(row.action || ""), entity: String(row.entity || ""), ai_model: String(row.model || ""),
          processing_ms: Number(row.processing_ms || 0), request_id: String(row.id || ""),
        };
      }).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 40));
    }).catch(() => { setUsers([]); setAudit([]); setInfra(null); });
  }, []);

  // Presentation-only rollups over the rows already loaded above.
  const admins = users.filter((u) => u.role === "administrator").length;
  const aiCalls = audit.filter((a) => a.ai_model).length;
  const latencies = audit.map((a) => a.processing_ms).filter((n) => Number(n) > 0);
  const avgMs = latencies.length ? Math.round(latencies.reduce((s, n) => s + Number(n), 0) / latencies.length) : 0;

  return (
    <RequireRole roles={["administrator", "senior_officer"]}>
      <div className="space-y-5">
        <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")}>
          <RoleBadge />
        </PageHeader>

        {/* Posture KPI strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Officers on roster" value={users.length} sub={`${admins} with admin rights`} icon={Users} tone="accent" />
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
              count={users.length}
            />
            {users.length ? (
              <div className="divide-y divide-border/50">
                {users.map((u) => (
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
            count={audit.length}
          />
          {audit.length ? (
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
                  {audit.map((a, i) => (
                    <tr key={i} className="border-t border-border/50 transition-colors hover:bg-elevated/50">
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
            <EmptyState icon={ScrollText} title="No audit entries yet" hint="Console and AI activity is logged here as officers work." />
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
