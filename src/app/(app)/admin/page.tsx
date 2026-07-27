import { Users, ScrollText, Cpu } from "lucide-react";
import { all } from "@/lib/db";
import { PageHeader, Badge } from "@/components/ui";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { DataImport } from "@/components/admin/DataImport";
import { getT } from "@/lib/i18n-server";
import { RequireRole, RoleBadge } from "@/components/OfficerName";


export default function AdminPage() {
  const t = getT();

  const users = all<{ id: number; username: string; full_name: string; role: Role; rank: string }>(
    "SELECT id, username, full_name, role, rank FROM users ORDER BY id"
  );
  const audit = all<{ ts: string; username: string; role: string; action: string; entity: string; ai_model: string; processing_ms: number; request_id: string }>(
    "SELECT ts, username, role, action, entity, ai_model, processing_ms, request_id FROM audit_logs ORDER BY ts DESC LIMIT 40"
  );

  return (
    <RequireRole roles={["administrator", "senior_officer"]}>
    <div className="space-y-6">
      <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")}>
        <RoleBadge />
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Users */}
        <div className="card panel-pad">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold"><Users className="h-4 w-4 text-accent" /> Officers &amp; Roles</h2>
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-lg border border-border/50 p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{u.full_name}</div>
                  <div className="font-mono text-xs text-muted">{u.username} · {u.rank}</div>
                </div>
                <Badge tone={u.role === "administrator" ? "danger" : "info"}>{ROLE_LABEL[u.role]}</Badge>
              </div>
            ))}
          </div>
        </div>

        {/* AI config */}
        <div className="card panel-pad">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold"><Cpu className="h-4 w-4 text-accent" /> AI Configuration</h2>
          <div className="space-y-2 text-sm">
            <ConfigRow label="AI backend" value="Zoho Catalyst QuickML" tone="accent" />
            <ConfigRow label="Offline dev fallback" value="Built-in reasoning engine" tone="info" />
            <ConfigRow label="SQL guard" value="SELECT-only · table whitelist" tone="success" />
            <ConfigRow label="Explainability" value="Enabled · confidence + evidence" tone="success" />
            <ConfigRow label="Audit logging" value="Immutable · all AI queries" tone="success" />
          </div>
          <div className="mt-3 rounded-lg border border-border bg-elevated p-3 text-xs text-muted">
            The intelligence pipeline never sends raw SQL rows to a black box. Intent detection and permission checks
            run before any record is retrieved. Every AI decision is traceable via its audit ID.
          </div>
        </div>
      </div>

      {/* Real-data import */}
      <DataImport />

      {/* Audit trail */}
      <div className="card panel-pad">
        <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold"><ScrollText className="h-4 w-4 text-accent" /> Audit Trail</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Entity</th>
                <th className="py-2 pr-4">AI Model</th>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Request ID</th>
                <th className="py-2 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a, i) => (
                <tr key={i} className="border-t border-border/50">
                  <td className="py-2 pr-4"><span className="chip font-mono text-[10px]">{a.action}</span></td>
                  <td className="py-2 pr-4 capitalize text-subtle">{a.role?.replace(/_/g, " ")}</td>
                  <td className="py-2 pr-4 text-muted">{a.entity}</td>
                  <td className="py-2 pr-4">{a.ai_model ? <Badge tone="accent">{a.ai_model}</Badge> : <span className="text-muted">—</span>}</td>
                  <td className="py-2 pr-4 font-mono text-muted">{a.processing_ms ? `${a.processing_ms}ms` : "—"}</td>
                  <td className="py-2 pr-4 font-mono text-[10px] text-muted">{a.request_id}</td>
                  <td className="py-2 text-right text-xs text-muted">{timeAgo(a.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    </RequireRole>
  );
}

function ConfigRow({ label, value, tone }: { label: string; value: string; tone: "info" | "accent" | "success" }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2 last:border-0">
      <span className="text-muted">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}
