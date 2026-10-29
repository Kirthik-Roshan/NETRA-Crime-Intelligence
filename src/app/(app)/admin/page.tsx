"use client";
import { UiText, useUiText } from '@/components/UiText';


import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from 'react-dom';
import { Users, ScrollText, Cpu, ShieldCheck, Gauge, ClipboardList, Download, RefreshCw, Search, ExternalLink, X, Activity, Database, BrainCircuit, FileText } from "lucide-react";
import { PageHeader, Badge, StatCard, Avatar, EmptyState, PanelHeader, Tag } from "@/components/ui";
import { ROLE_LABEL, type SessionUser } from "@/lib/types";
import { timeAgo } from "@/lib/utils";
import { DataImport } from "@/components/admin/DataImport";
import { useT } from "@/lib/i18n-client";
import { RequireRole, RoleBadge, useOfficer } from "@/components/OfficerName";
import { fetchAuditTrail, fetchCatalystUsers, fetchInfraHealth, type CatalystInfraHealth } from "@/lib/ai-client";
import type { PortalSessions as SessionSnapshot } from '@/lib/ai-client';
import { PortalSessions } from '@/components/admin/PortalSessions';

interface AuditEntry { ts: string; actor_id: string; username: string; full_name: string; role: string; action: string; entity: string; ai_model: string; processing_ms: number; request_id: string; detail: string; source: string }

export default function AdminPage() {
  const ui = useUiText();
  const t = useT();
  const currentOfficer = useOfficer();
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [infra, setInfra] = useState<CatalystInfraHealth | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [rosterQuery, setRosterQuery] = useState("");
  const [rosterRole, setRosterRole] = useState("all");
  const [selectedAudit, setSelectedAudit] = useState<AuditEntry | null>(null);
  const [sessions, setSessions] = useState<SessionSnapshot | null>(null);
  const [identity, setIdentity] = useState<{ id: string; label: string } | null>(null);
  const [auditError, setAuditError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [officersResult, auditResult, healthResult] = await Promise.allSettled([
      fetchCatalystUsers(), fetchAuditTrail(200), fetchInfraHealth(),
    ]);
    setUsers(officersResult.status === "fulfilled" ? officersResult.value : []);
    setInfra(healthResult.status === "fulfilled" ? healthResult.value : null);
    setAuditError(auditResult.status === 'rejected' ? 'Audit logs could not be refreshed. Retry to verify current activity.' : '');
    const rows = auditResult.status === "fulfilled" ? auditResult.value : null;
    if (rows) setAudit(rows.map((row) => {
        const actor = row.actor && typeof row.actor === "object" ? row.actor as Record<string, unknown> : {};
        return {
          ts: String(row.occurred_at || ""), actor_id: String(actor.id || ''), full_name: String(actor.full_name || ''), username: String(actor.username || actor.full_name || ""), role: String(actor.role || ""),
          action: String(row.action || ""), entity: String(row.entity || ""), ai_model: String(row.model || ""),
          processing_ms: Number(row.processing_ms || 0), request_id: String(row.id || ""),
          detail: typeof row.detail === "string" ? row.detail : row.detail ? JSON.stringify(row.detail) : "",
          source: String(row.source || "Stratus"),
        };
      }).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 200));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!selectedAudit) return;
    const previous = document.body.style.overflow;
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedAudit(null); };
    window.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', escape); focus?.focus({ preventScroll: true }); };
  }, [selectedAudit]);

  const actions = useMemo(() => [...new Set(audit.map((row) => row.action).filter(Boolean))].sort(), [audit]);
  const filteredAudit = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return audit.filter((row) => {
      if (identity && row.actor_id !== identity.id) return false;
      if (actionFilter !== "all" && row.action !== actionFilter) return false;
      return !needle || Object.values(row).some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [actionFilter, audit, query, identity]);

  const exportLogs = useCallback(() => {
    const fields = ["ts", "actor_id", "full_name", "username", "role", "action", "entity", "ai_model", "processing_ms", "request_id", "source", "detail"] as const;
    const quote = (value: unknown) => `"${String(value ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
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
  const filteredUsers = visibleUsers.filter((user) => (rosterRole === "all" || user.role === rosterRole) && (!rosterQuery.trim() || [user.full_name, user.username, user.role, user.rank]
    .some((value) => String(value || "").toLowerCase().includes(rosterQuery.trim().toLowerCase()))));
  const admins = visibleUsers.filter((u) => u.role === "administrator").length;
  const aiCalls = audit.filter((a) => a.ai_model).length;
  const latencies = audit.map((a) => a.processing_ms).filter((n) => Number(n) > 0);
  const avgMs = latencies.length ? Math.round(latencies.reduce((s, n) => s + Number(n), 0) / latencies.length) : 0;

  return (
    <RequireRole roles={["administrator", "senior_officer", "investigation_officer", "analyst"]}>
      <div className="admin-workspace space-y-5">
        <PageHeader title={t("admin.title")} subtitle={t("admin.subtitle")}>
          <RoleBadge />
        </PageHeader>

        {/* Posture KPI strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label={ui("Signed-in identities")}
            value={sessions ? new Set(sessions.rows.map(row => row.user.id)).size : '—'}
            sub={sessions ? `${sessions.rows.length} recent browser sessions · ${sessions.scope === 'department' ? 'department' : 'your identity'}` : 'Awaiting verified presence'}
            icon={Users}
            tone="accent"
          />
          <StatCard label={ui("Audit entries")} value={audit.length} sub={ui("Most recent window")} icon={ScrollText} tone="info" />
          <StatCard label={ui("AI-assisted actions")} value={aiCalls} sub={ui("Model-attributed")} icon={Cpu} tone="success" />
          <StatCard label={ui("Avg AI latency")} value={avgMs ? `${avgMs}ms` : "—"} sub={latencies.length ? `Across ${latencies.length} timed calls` : "No timed calls"} icon={Gauge} tone="warning" />
        </div>

        <PortalSessions canViewDepartmentActivity={["administrator", "senior_officer"].includes(currentOfficer?.role || "")} onSnapshot={setSessions} onIdentity={(id, label) => { setIdentity({ id, label }); document.getElementById('admin-audit-trail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Officers & Roles */}
          <div className="officer-roster card panel-pad">
            <PanelHeader
              icon={Users}
              title={ui("Officers & roles")}
              sub={`Registered accounts · ${admins} with admin rights · account status does not imply an active session`}
              count={visibleUsers.length}
            />
            <div className="mb-4 flex flex-wrap gap-2"><label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" /><input value={rosterQuery} onChange={(event) => setRosterQuery(event.target.value)} placeholder={ui("Find officer, username, or role")} className="input h-9 pl-8 text-xs" /></label><select aria-label={ui("Filter officer roles")} value={rosterRole} onChange={event => setRosterRole(event.target.value)} className="input h-9 w-auto text-xs"><option value="all"><UiText text={"All roles"} /></option>{Array.from(new Set(visibleUsers.map(user => user.role))).map(role => <option key={role} value={role}><UiText text={ROLE_LABEL[role]} /></option>)}</select></div>
            {filteredUsers.length ? (
              <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-left text-xs"><thead><tr><th><UiText text={"Name"} /></th><th><UiText text={"Username / email"} /></th><th><UiText text={"Role"} /></th><th><UiText text={"Status"} /></th></tr></thead><tbody>{filteredUsers.map(u => {
                const status = (u as SessionUser & { status?: string }).status;
                return <tr key={u.id}><td><span className="flex items-center gap-2"><Avatar name={u.full_name} size={30}/><strong className="whitespace-nowrap font-medium"><UiText text={u.full_name} /></strong></span></td><td className="text-muted"><UiText text={u.username} /></td><td><Badge tone={u.role === "administrator" ? "danger" : "info"}><UiText text={ROLE_LABEL[u.role]} /></Badge></td><td className="whitespace-nowrap">{status || (String(u.id) === String(currentOfficer?.id) ? "Current session" : "Not reported")}</td></tr>;
              })}</tbody></table><p className="mt-4 text-xs text-muted"><UiText text={"Showing "} /><UiText text={filteredUsers.length} /><UiText text={" of "} /><UiText text={visibleUsers.length} /><UiText text={" visible accounts"} /></p></div>
            ) : (
              <EmptyState icon={Users} title={ui("No officer accounts")} hint={ui("Accounts appear here once the roster is provisioned.")} />
            )}
          </div>

          {/* AI Configuration */}
          <div className="card panel-pad">
            <PanelHeader
              icon={Cpu}
              title={ui("AI configuration")}
              sub={ui("Pipeline posture, guardrails, and traceability")}
              action={<Badge tone={infra?.services.datastore && infra?.services.zia ? "success" : "warning"}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" /> <UiText text={infra ? "live" : "health unavailable"} /></Badge>}
            />
            <div className="text-sm">
              <ConfigRow label={ui("AI backend")} value={infra?.services.quickml ? "Catalyst QuickML connected" : "QuickML unavailable"} tone={infra?.services.quickml ? "accent" : "warning"} />
              <ConfigRow label={ui("Identity session")} value={infra?.services.authentication ? "Catalyst Authentication verified" : "Not authenticated in this session"} tone={infra?.services.authentication ? "success" : "warning"} />
              <ConfigRow label={ui("Record access")} value={infra?.services.datastore ? "Cloud Scale connected" : "Cloud Scale unavailable"} tone={infra?.services.datastore ? "success" : "warning"} />
              <ConfigRow label={ui("Record search")} value={infra?.services.search === true ? "Catalyst Search indexed" : "Bounded fallback scan"} tone={infra?.services.search === true ? "success" : "warning"} />
              <ConfigRow label={ui("Prediction model")} value="Explainable baseline · India DC" tone="info" />
              <ConfigRow label={ui("Explainability")} value="Enabled · confidence + evidence" tone="success" />
              <ConfigRow label={ui("Audit logging")} value="Immutable · Catalyst Stratus" tone="success" />
            </div>
            {infra && <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <ServiceState label={ui("Data Store")} online={!!infra.services.datastore} />
              <ServiceState label={ui("Authentication")} online={!!infra.services.authentication} />
              <ServiceState label={ui("Zia")} online={!!infra.services.zia} />
              <ServiceState label={ui("QuickML")} online={!!infra.services.quickml} />
              <ServiceState label={ui("Stratus")} online={!!infra.services.stratus} />
              <ServiceState label={ui("SmartBrowz")} online={!!infra.services.smartbrowz} />
            </div>}
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-border/60 bg-elevated/50 p-3 text-xs leading-relaxed text-muted">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
              <span><UiText text={"Catalyst user permissions are applied before records are retrieved. Login, logout, AI, Search, evidence-analysis, and PDF operations are traceable through immutable audit objects."} /></span>
            </div>
          </div>
        </div>

        <DataImport />

        {/* Audit trail */}
        <div id="admin-audit-trail" className="card panel-pad scroll-mt-20">
          <PanelHeader
            icon={ClipboardList}
            title={ui("Audit trail")}
            sub={`${['administrator', 'senior_officer'].includes(currentOfficer?.role || '') ? 'Department' : 'Your identity'} audit archive · most recent 200 entries · newest first`}
            count={filteredAudit.length}
            action={<div className="flex items-center gap-1.5">
              <button type="button" onClick={() => void load()} disabled={loading} className="btn-ghost h-8 px-2.5" title={ui("Refresh audit trail")}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /><UiText text={" Refresh"} /></button>
              <button type="button" onClick={exportLogs} disabled={!filteredAudit.length} className="btn-ghost h-8 px-2.5" title={ui("Export filtered logs")}>
                <Download className="h-3.5 w-3.5" /><UiText text={" Export"} /></button>
            </div>}
          />
          {auditError && <p role="alert" className="mb-3 text-xs text-warning"><UiText text={auditError} /></p>}
          {identity && <div className="mb-3 flex items-center gap-2 text-sm"><Badge tone="accent"><UiText text={"Activity for "} /><UiText text={identity.label} /></Badge><button type="button" className="btn-ghost h-8 text-xs" onClick={() => setIdentity(null)}><UiText text={"Clear identity filter"} /></button></div>}
          <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ui("Search actor, entity, model, or request ID…")} className="h-9 w-full rounded-md border border-border bg-elevated/40 pl-8 pr-3 text-xs outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15" />
            </label>
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="h-9 rounded-md border border-border bg-elevated/40 px-3 text-xs outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/15">
              <option value="all"><UiText text={"All actions"} /></option>
              {actions.map((action) => <option key={action} value={action}><UiText text={action} /></option>)}
            </select>
          </div>
          {filteredAudit.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                    <th className="pb-2 pr-3"><UiText text={"Identity"} /></th>
                    <th className="pb-2 pr-3"><UiText text={"Action"} /></th>
                    <th className="pb-2 pr-3"><UiText text={"Role"} /></th>
                    <th className="pb-2 pr-3"><UiText text={"Entity"} /></th>
                    <th className="pb-2 pr-3"><UiText text={"AI model"} /></th>
                    <th className="pb-2 pr-3 text-right"><UiText text={"Latency"} /></th>
                    <th className="pb-2 pr-3"><UiText text={"Request ID"} /></th>
                    <th className="pb-2 text-right"><UiText text={"When"} /></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.map((a, index) => (
                    <tr key={`${a.request_id}-${a.ts}-${index}`} tabIndex={0} onClick={() => setSelectedAudit(a)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedAudit(a); }} className="cursor-pointer border-t border-border/50 transition-colors hover:bg-elevated/50 focus:bg-accent/5 focus:outline-none">
                      <td className="py-2 pr-3"><strong className="block text-xs">{a.full_name || a.username || 'System'}</strong><span className="block text-[10px] text-muted"><UiText text={a.username} /></span></td>
                      <td className="py-2 pr-3"><Tag mono><UiText text={a.action} /></Tag></td>
                      <td className="whitespace-nowrap py-2 pr-3 capitalize text-subtle"><UiText text={a.role?.replace(/_/g, " ")} /></td>
                      <td className="py-2 pr-3 text-muted"><UiText text={a.entity} /></td>
                      <td className="py-2 pr-3">{a.ai_model ? <Badge tone="accent"><UiText text={a.ai_model} /></Badge> : <span className="text-muted">—</span>}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right font-mono tabular-nums text-muted"><UiText text={a.processing_ms ? `${a.processing_ms}ms` : "—"} /></td>
                      <td className="py-2 pr-3 font-mono text-[10px] text-muted"><UiText text={a.request_id} /></td>
                      <td className="whitespace-nowrap py-2 text-right text-xs tabular-nums text-muted"><span className="inline-flex items-center gap-1.5">{timeAgo(a.ts)}<ExternalLink className="h-3 w-3" /></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={ScrollText} title={loading ? "Loading audit entries" : query || actionFilter !== "all" ? "No matching audit entries" : "No audit entries yet"} hint={loading ? "Reading immutable logs from Catalyst Stratus and Cloud Scale." : "Console and AI activity is logged here as officers work."} />
          )}
        </div>
        {selectedAudit && createPortal(<div className="fixed inset-0 z-[100] flex justify-end bg-fg/20 backdrop-blur-[1px]" role="dialog" aria-modal="true" aria-label={ui("Audit event details")} onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedAudit(null); }}>
          <aside className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface p-5 shadow-2xl animate-fade-in">
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4"><div><div className="eyebrow"><UiText text={"Immutable audit event"} /></div><h2 className="mt-1 font-display text-lg font-bold">{selectedAudit.action || "Recorded activity"}</h2></div><button type="button" autoFocus onClick={() => setSelectedAudit(null)} className="btn-icon" title={ui("Close audit details")}><X className="h-4 w-4" /></button></div>
            <dl className="mt-4 divide-y divide-border/60">
              <Detail label={ui("Occurred")} value={selectedAudit.ts || "Not recorded"} />
              <Detail label={ui("Actor")} value={selectedAudit.username || "System"} />
              <Detail label={ui("Catalyst user ID")} value={selectedAudit.actor_id || 'Not recorded'} mono />
              <Detail label={ui("Role")} value={selectedAudit.role.replace(/_/g, " ") || "System"} />
              <Detail label={ui("Entity")} value={selectedAudit.entity || "Not recorded"} />
              <Detail label={ui("Model")} value={selectedAudit.ai_model || "No AI model"} />
              <Detail label={ui("Processing")} value={selectedAudit.processing_ms ? `${selectedAudit.processing_ms} ms` : "Not timed"} />
              <Detail label={ui("Request ID")} value={selectedAudit.request_id || "Not recorded"} mono />
              <Detail label={ui("Archive source")} value={selectedAudit.source || "Stratus"} />
            </dl>
            <div className="mt-5"><div className="stat-label mb-2"><UiText text={"Event payload"} /></div><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-elevated/50 p-3 font-mono text-[11px] leading-relaxed text-subtle">{prettyDetail(selectedAudit.detail)}</pre></div>
            <div className="mt-4 flex items-start gap-2 rounded-md border border-success/30 bg-success/10 p-3 text-xs text-success"><ShieldCheck className="mt-px h-4 w-4 shrink-0" /><UiText text={"This event was read from NETRA's immutable audit trail."} /></div>
          </aside>
        </div>, document.body)}
      </div>
    </RequireRole>
  );
}

function ServiceState({ label, online }: { label: string; online: boolean }) {
  return <div className="flex items-center gap-2 rounded-md border border-border bg-elevated/40 px-2.5 py-2 text-xs"><Activity className={`h-3.5 w-3.5 ${online ? "text-success" : "text-danger"}`} /><span className="min-w-0 flex-1 truncate"><UiText text={label} /></span><span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-success" : "bg-danger"}`} /></div>;
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="grid grid-cols-[110px_1fr] gap-3 py-3 text-xs"><dt className="text-muted"><UiText text={label} /></dt><dd className={`${mono ? "break-all font-mono text-[11px]" : "capitalize"} text-subtle`}><UiText text={value} /></dd></div>;
}

function prettyDetail(detail: string) {
  try { return JSON.stringify(JSON.parse(detail), null, 2); } catch { return detail || "No additional payload was recorded."; }
}

function ConfigRow({ label, value, tone }: { label: string; value: string; tone: "info" | "accent" | "success" | "warning" }) {
  return (
    <div className="admin-config-row flex flex-wrap items-center justify-between gap-3 border-b border-border/50 py-3 last:border-0">
      <span className="flex items-center gap-3 font-medium text-fg"><span className="admin-config-icon">{label === "AI backend" ? <Cpu size={19}/> : label === "Record access" ? <Database size={19}/> : label === "Record search" ? <Search size={19}/> : label === "Prediction model" ? <BrainCircuit size={19}/> : label === "Explainability" ? <FileText size={19}/> : <ShieldCheck size={19}/>}</span><UiText text={label} /></span>
      <Badge tone={tone}><UiText text={value} /></Badge>
    </div>
  );
}
