"use client";
import { UiText, useUiText, useUiLocale } from '@/components/UiText';


import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Monitor, RefreshCw, Search, ShieldCheck, Users } from 'lucide-react';
import { Avatar, Badge, EmptyState, PanelHeader } from '@/components/ui';
import { fetchPortalSessions, type PortalSessions as Snapshot } from '@/lib/ai-client';
import { ROLE_LABEL } from '@/lib/types';

export function PortalSessions({ onIdentity, onSnapshot, canViewDepartmentActivity = false }: {
  onIdentity: (id: string, label: string) => void;
  onSnapshot: (snapshot: Snapshot) => void;
  canViewDepartmentActivity?: boolean;
}) {
  const ui = useUiText();
  const locale = useUiLocale();
  const date = (value: string) => new Date(value).toLocaleString(locale, { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { const snapshot = await fetchPortalSessions(); setData(snapshot); onSnapshot(snapshot); setError(''); }
    catch (error) { setError(error instanceof Error ? error.message : 'Session presence is unavailable.'); }
    finally { setLoading(false); }
  }, [onSnapshot]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    return () => window.clearInterval(timer);
  }, [load]);
  const identities = useMemo(() => {
    const groups = new Map<string, NonNullable<Snapshot>['rows']>();
    for (const session of data?.rows || []) groups.set(session.user.id, [...(groups.get(session.user.id) || []), session]);
    return [...groups.values()].filter(rows => !query.trim() || [rows[0].user.full_name, rows[0].user.username, rows[0].user.role].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  }, [data, query]);
  return <section className="card panel-pad min-w-0" aria-label={ui("Portal session presence")}>
    <PanelHeader icon={Users} title={ui("Signed-in identities")} count={new Set((data?.rows || []).map(row => row.user.id)).size}
      sub={data?.scope === 'department' ? 'Department-wide portal presence · verified Catalyst identities' : 'Your portal sessions · shared presence is available to operational officers'}
      action={<button type="button" className="btn-ghost h-8 px-2.5" disabled={loading} onClick={() => void load()}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /><UiText text={"Refresh"} /></button>} />
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <label className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input className="input h-9 pl-9 text-xs" aria-label={ui("Find signed-in identity")} placeholder={ui("Find signed-in name, email or role")} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <span className="text-xs text-muted"><UiText text={data ? `${data.rows.length} browser sessions · checked ${date(data.observed_at)} IST` : 'Checking session presence…'} /></span>
    </div>
    {error && <p role="alert" className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning"><UiText text={error} /><UiText text={data ? ' Showing the last successful snapshot; current presence is unverified.' : ''} /></p>}
    {data?.warnings.map(warning => <p key={warning} className="mb-2 text-xs text-warning"><UiText text={warning} /></p>)}
    {identities.length ? <div className="divide-y divide-border rounded-lg border border-border">{identities.map(sessions => {
      const latest = sessions[0], user = latest.user, active = sessions.some(row => row.status === 'active'), open = expanded === user.id;
      return <article key={user.id} className="min-w-0 p-3">
        <div className="flex flex-wrap items-center gap-3"><Avatar name={user.full_name} size={36} /><div className="min-w-0 flex-1"><strong className="block text-sm"><UiText text={user.full_name} /></strong><span className="block break-all text-xs text-muted"><UiText text={user.username} /></span></div>
          <Badge tone="info">{ROLE_LABEL[user.role] || user.role}</Badge><Badge tone={active ? 'success' : 'warning'}><UiText text={active ? 'Recently active' : 'Idle / unconfirmed'} /></Badge>
          <button className="btn-ghost h-8 text-xs" disabled={!canViewDepartmentActivity} title={!canViewDepartmentActivity ? ui("Department audit access requires administrator or senior officer") : undefined} onClick={() => onIdentity(user.id, user.full_name || user.username)}><UiText text={"View activity"} /></button>
          <button className="btn-ghost h-8 text-xs" aria-expanded={open} onClick={() => setExpanded(open ? '' : user.id)}><UiText text={sessions.length} /> <UiText text={sessions.length === 1 ? 'session' : 'sessions'} /><ChevronDown className={`h-3.5 w-3.5 ${open ? 'rotate-180' : ''}`} /></button>
        </div>
        <p className="mt-2 text-xs text-muted"><UiText text={"Last seen "} />{date(latest.last_seen_at)}<UiText text={" IST · "} /><UiText text={latest.device} /> · <span className="break-all"><UiText text={latest.path} /></span></p>
        {open && <div className="mt-3 grid gap-2 lg:grid-cols-2">{sessions.map(session => <dl key={session.id} className="rounded-md border border-border bg-elevated/40 p-3 text-xs">
          <div className="mb-2 flex items-center gap-2 font-medium"><Monitor className="h-4 w-4 text-accent" /><UiText text={session.device} /><Badge tone={session.status === 'active' ? 'success' : 'warning'}><UiText text={session.status} /></Badge></div>
          <dt className="text-muted"><UiText text={"Presence first observed"} /></dt><dd className="mb-2">{date(session.started_at)}<UiText text={" IST"} /></dd><dt className="text-muted"><UiText text={"Last verified heartbeat"} /></dt><dd className="mb-2">{date(session.last_seen_at)}<UiText text={" IST"} /></dd><dt className="text-muted"><UiText text={"Current page"} /></dt><dd className="mb-2 break-all"><UiText text={session.path} /></dd><dt className="text-muted"><UiText text={"Portal session reference"} /></dt><dd className="break-all font-mono text-[10px]"><UiText text={session.id} /></dd>
        </dl>)}</div>}
      </article>;
    })}</div> : <EmptyState icon={Users} title={loading ? 'Checking signed-in identities' : query ? 'No matching identities' : error ? 'Session presence unavailable' : 'No recent portal sessions'} hint={ui("Sessions appear after a verified browser heartbeat. Registered accounts are listed separately below.")} />}
    <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><UiText text={"Presence refreshes every 30 seconds. Visible tabs send a heartbeat each minute; active means seen within 3 minutes, idle sessions expire from this view after 30 minutes. Closing a tab or losing connectivity is reflected after these windows. This is portal presence, not a list of all Zoho account sessions."} /></p>
  </section>;
}
