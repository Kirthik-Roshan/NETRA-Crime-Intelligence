import { Users, ScrollText, Cpu, ShieldCheck, Gauge, Sparkles, type LucideIcon } from "lucide-react";
import { all } from "@/lib/db";
import { PageHeader, Badge, StatCard, Avatar, EmptyState } from "@/components/ui";
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

  // Presentation-only rollups over the rows already loaded above.
  const admins = users.filter((u) => u.role === "administrator").length;
  const aiCalls = audit.filter((a) => a.ai_model).length;
  const latencies = audit.map((a) => a.processing_ms).filter((n) => Number(n) > 0);
  const avgMs = latencies.length ? Math.round(latencies.reduce((s, n) => s + Number(n), 0) / latencies.length) : 0;

  return (
    <RequireRole roles={["administrator", "senior_officer"]}>
      <div className="space-y-6">
        <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")}>
          <RoleBadge />
        </PageHeader>

        {/* Console posture at a glance */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Officers on roster"
            value={users.length}
            sub={`${admins} with administrator rights`}
            icon={Users}
            tone="accent"
          />
          <StatCard
            label="Audit entries"
            value={audit.length}
            sub="Most recent activity window"
            icon={ScrollText}
          />
          <StatCard
            label="AI-assisted actions"
            value={aiCalls}
            sub="Model-attributed in this window"
            icon={Sparkles}
            tone="success"
          />
          <StatCard
            label="Avg AI latency"
            value={avgMs ? `${avgMs}ms` : "—"}
            sub={latencies.length ? `Across ${latencies.length} timed calls` : "No timed calls recorded"}
            icon={Gauge}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* Users */}
          <div className="card panel-pad">
            <CardHead
              icon={Users}
              title="Officers & Roles"
              subtitle="Role-based access control across the console"
              action={users.length > 0 ? <Badge tone="muted">{users.length}</Badge> : undefined}
            />
            {users.length ? (
              <div className="space-y-2">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-elevated/30 p-2.5 transition-colors hover:border-border hover:bg-elevated/60"
                  >
                    <Avatar name={u.full_name} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{u.full_name}</div>
                      <div className="truncate font-mono text-xs text-muted">{u.username} · {u.rank}</div>
                    </div>
                    <Badge tone={u.role === "administrator" ? "danger" : "info"}>{ROLE_LABEL[u.role]}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Users} title="No officer accounts" hint="Accounts appear here once the roster is provisioned." />
            )}
          </div>

          {/* AI config */}
          <div className="card panel-pad">
            <CardHead
              icon={Cpu}
              title="AI Configuration"
              subtitle="Pipeline posture, guardrails, and traceability"
              action={<Badge tone="success"><span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" /> operational</Badge>}
            />
            <div className="text-sm">
              <ConfigRow label="AI backend" value="Zoho Catalyst QuickML" tone="accent" />
              <ConfigRow label="Offline dev fallback" value="Built-in reasoning engine" tone="info" />
              <ConfigRow label="SQL guard" value="SELECT-only · table whitelist" tone="success" />
              <ConfigRow label="Explainability" value="Enabled · confidence + evidence" tone="success" />
              <ConfigRow label="Audit logging" value="Immutable · all AI queries" tone="success" />
            </div>
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-border/60 bg-elevated/50 p-3 text-xs leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span>
                The intelligence pipeline never sends raw SQL rows to a black box. Intent detection and permission checks
                run before any record is retrieved. Every AI decision is traceable via its audit ID.
              </span>
            </div>
          </div>
        </div>

        {/* Real-data import */}
        <DataImport />

        {/* Audit trail */}
        <div className="card panel-pad">
          <CardHead
            icon={ScrollText}
            title="Audit Trail"
            subtitle="Immutable record of console and AI activity · newest first"
            action={audit.length > 0 ? <Badge tone="muted">{audit.length}</Badge> : undefined}
          />
          {audit.length ? (
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/70">
                    <th className="stat-label py-2 pr-4 font-semibold">Action</th>
                    <th className="stat-label py-2 pr-4 font-semibold">Role</th>
                    <th className="stat-label py-2 pr-4 font-semibold">Entity</th>
                    <th className="stat-label py-2 pr-4 font-semibold">AI Model</th>
                    <th className="stat-label py-2 pr-4 font-semibold">Latency</th>
                    <th className="stat-label py-2 pr-4 font-semibold">Request ID</th>
                    <th className="stat-label py-2 text-right font-semibold">When</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a, i) => (
                    <tr key={i} className="border-t border-border/40 transition-colors hover:bg-elevated/40">
                      <td className="py-2 pr-4"><span className="chip font-mono text-[10px]">{a.action}</span></td>
                      <td className="whitespace-nowrap py-2 pr-4 capitalize text-subtle">{a.role?.replace(/_/g, " ")}</td>
                      <td className="py-2 pr-4 text-muted">{a.entity}</td>
                      <td className="py-2 pr-4">{a.ai_model ? <Badge tone="accent">{a.ai_model}</Badge> : <span className="text-muted">—</span>}</td>
                      <td className="whitespace-nowrap py-2 pr-4 font-mono tabular-nums text-muted">{a.processing_ms ? `${a.processing_ms}ms` : "—"}</td>
                      <td className="py-2 pr-4 font-mono text-[10px] text-muted">{a.request_id}</td>
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

/** Shared card heading — icon, title, supporting line, optional right-hand slot. */
function CardHead({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Icon className="h-4 w-4 shrink-0 text-accent" /> {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function ConfigRow({ label, value, tone }: { label: string; value: string; tone: "info" | "accent" | "success" }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2.5 last:border-0">
      <span className="text-muted">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}
