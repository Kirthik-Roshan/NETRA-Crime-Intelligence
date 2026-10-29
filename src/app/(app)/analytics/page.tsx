"use client";
import { UiText, useUiText } from '@/components/UiText';

import { useEffect, useMemo, useState } from "react";
import Link from "@/components/AppLink";
import {
  BarChart3, FolderKanban, AlertTriangle, Users, Fingerprint, Clock,
  Flame, MapPin, Radar, Activity, Database, ArrowRight, ScanText,
  Network, UserRound, MessageSquareText, Building2, ShieldAlert,
  CircleCheck, CircleDashed,
  RefreshCw,
} from "lucide-react";
import { PageHeader, StatCard, Badge, Avatar, EmptyState, PanelHeader, Tag } from "@/components/ui";
import { MapPanel } from "@/components/maps/MapPanel";
import { fetchDashboard, fetchIntelligenceDimensions, type DashboardData, type IntelligenceDimensions } from "@/lib/cloudscale";
import { fetchCriminals } from "@/lib/cloudscale";
import { fetchCases } from "@/lib/cloudscale";
import { listOcr } from "@/lib/ai-client";
import { ReadAloud } from "@/components/ReadAloud";
import { Translated } from "@/components/Translated";
import type { CrimRow } from "@/components/criminals/CriminalsList";
import type { CaseRow } from "@/components/cases/CasesList";

const EMPTY: DashboardData = {
  stats: { activeCases: 0, critical: 0, totalFirs: 0, atLarge: 0, arrests30: 0, solveRate: 0 },
  trend: [], byType: [], hotspots: [], geo: [],
  heat: [], velocity: { open: 0, active: 0, closed: 0, escalated: 0, avgClosureDays: 0 },
  confidence: { dataQuality: 0, caseLinkage: 0, patternSignal: 0, extractionReadiness: 0, overall: 0 },
};
const PRI = { critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;

export default function AnalyticsPage() {
  const ui = useUiText();
  const [d, setD] = useState<DashboardData | null>(null);
  const [criminals, setCriminals] = useState<CrimRow[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [ocr, setOcr] = useState(0);
  const [dimensions, setDimensions] = useState<IntelligenceDimensions | null>(null);
  const [dimensionsError, setDimensionsError] = useState("");
  const [dimensionsLoading, setDimensionsLoading] = useState(true);
  const loadDimensions = () => {
    setDimensionsLoading(true);
    setDimensionsError("");
    fetchIntelligenceDimensions().then(setDimensions).catch(error => {
      setDimensions(null);
      setDimensionsError(error instanceof Error ? error.message : "Demographic sources could not be read.");
    }).finally(() => setDimensionsLoading(false));
  };
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    fetchDashboard().then(setD).catch(() => setD(EMPTY));
    fetchCriminals().then(setCriminals).catch(() => setCriminals([]));
    fetchCases().then(setCases).catch(() => setCases([]));
    listOcr().then((r) => setOcr(r.length)).catch(() => setOcr(0));
    loadDimensions();
  }, []);

  const { stats, byType, hotspots, geo, heat, velocity } = d ?? EMPTY;
  const ranked = useMemo(() => [...criminals].sort((a, b) => (b.risk_score - a.risk_score) || (b.fir_count - a.fir_count)), [criminals]);
  const repeat = criminals.filter((c) => c.fir_count > 1).length;
  const active = useMemo(() => ranked.find((c) => c.id === sel) ?? ranked[0] ?? null, [ranked, sel]);
  const queue = useMemo(() => [...cases].sort((a, b) => (PRI[a.priority] ?? 9) - (PRI[b.priority] ?? 9)).slice(0, 6), [cases]);

  // Cross-case intelligence derived only from the official KSP relationships.
  const links = useMemo(() => {
    const districts = new Set(cases.map((c) => c.district).filter(Boolean));
    const types = new Set(cases.map((c) => c.crime_type).filter(Boolean));
    const groups = new Map<string, number>();
    for (const c of cases) if (c.district && c.crime_type) groups.set(`${c.district}|${c.crime_type}`, (groups.get(`${c.district}|${c.crime_type}`) ?? 0) + 1);
    const linkedCases = cases.filter((c) => c.district && c.crime_type && (groups.get(`${c.district}|${c.crime_type}`) ?? 0) > 1).length;
    return {
      linkedCases,
      entities: [
        { icon: MapPin, label: "Locations", value: districts.size, cls: "text-info", note: "distinct districts" },
        { icon: Fingerprint, label: "Modus Operandi", value: types.size, cls: "text-warning", note: "distinct crime types" },
        { icon: Users, label: "Accused Profiles", value: criminals.length, cls: "text-accent", note: "resolved from Accused" },
        { icon: UserRound, label: "Victims", value: dimensions?.entities.victims || 0, cls: "text-info", note: "official Victim rows" },
        { icon: MessageSquareText, label: "Complainants", value: dimensions?.entities.complainants || 0, cls: "text-warning", note: "official complainants" },
        { icon: Building2, label: "Police Stations", value: dimensions?.entities.stations || 0, cls: "text-accent", note: `${dimensions?.entities.relationships || 0} derived links` },
      ],
    };
  }, [cases, criminals, dimensions]);

  const heat30 = heat.find((h) => h.key === "30d");
  const summary = [
    byType[0] && `${byType[0].crime_type} leads with ${byType[0].count} FIRs on record.`,
    hotspots[0] && `${hotspots[0].district} is the top hotspot (${hotspots[0].cases} FIRs).`,
    heat30 && `Incidents ${heat30.delta >= 0 ? "up" : "down"} ${Math.abs(heat30.delta)}% over the last 30 days.`,
    repeat > 0 && `${repeat} repeat offenders across the state.`,
  ].filter(Boolean) as string[];

  const threats = hotspots.slice(0, 4).map((h, i) => ({
    title: `Elevated activity in ${h.district}`,
    detail: `${h.cases} FIRs registered · ${byType[i]?.crime_type ?? "mixed offences"}`,
    tone: (i === 0 ? "danger" : i < 2 ? "warning" : "info") as "danger" | "warning" | "info",
  }));

  const perf = [
    { label: "FIRs Filed", value: stats.totalFirs, max: Math.max(1, stats.totalFirs), color: "bg-info" },
    { label: "FIRs Closed", value: velocity.closed, max: Math.max(1, stats.totalFirs), color: "bg-success" },
    { label: "Escalated", value: velocity.escalated, max: Math.max(1, stats.totalFirs), color: "bg-warning" },
    { label: "Solve Rate", value: stats.solveRate, max: 100, color: "bg-accent", pct: true },
  ];

  return (
    <div className="analytics-workspace space-y-5">
      <PageHeader title={ui("Crime Intelligence Overview")} subtitle={ui("Real-time intelligence and investigation insights · from Cloud Scale")}>
        <Link href="/database?table=CaseMaster" className="btn-ghost h-9 text-xs"><Database className="h-4 w-4" /><UiText text={" Open in database"} /></Link>
      </PageHeader>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {d === null ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card panel-pad">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton mt-3 h-7 w-16" />
            </div>
          ))
        ) : (
          <>
            <StatCard label={ui("Total Cases")} value={cases.length || stats.totalFirs} sub={ui("All registered cases")} icon={BarChart3} tone="accent" />
            <StatCard label={ui("Open Investigations")} value={stats.activeCases} sub={ui("Active investigations")} icon={FolderKanban} />
            <StatCard label={ui("Critical Alerts")} value={stats.critical} sub={ui("Critical priority cases")} icon={AlertTriangle} tone="danger" />
            <StatCard label={ui("Repeat Offenders")} value={repeat} sub={ui("Profiles with multiple FIRs")} icon={Users} tone="warning" />
            <StatCard label={ui("Cases Solved")} value={`${stats.solveRate}%`} sub={ui("Charge-sheeted or closed")} icon={Fingerprint} tone="success" />
            <StatCard label={ui("Avg Investigation")} value={velocity.avgClosureDays ? `${velocity.avgClosureDays}d` : "—"} sub={ui("Recorded closure duration")} icon={Clock} />
          </>
        )}
      </div>

      {/* Aggregated social context; no individual identity or causal claim is inferred. */}
      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="stat-label"><UiText text={"Sociological intelligence"} /></div>
            <h2 className="mt-1 font-display text-lg font-semibold"><UiText text={"Population context in reported cases"} /></h2>
          </div>
          <Badge tone="info"><ShieldAlert className="h-3 w-3" /><UiText text={" Aggregated decision support"} /></Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DemographicPanel title={ui("Victim Gender")} icon={Users} rows={dimensions?.victimGender || []} loading={dimensionsLoading} unavailable={!!dimensionsError} />
          <DemographicPanel title={ui("Victim Age Bands")} icon={UserRound} rows={dimensions?.victimAgeBands || []} loading={dimensionsLoading} unavailable={!!dimensionsError} />
          <DemographicPanel title={ui("Complainant Occupations")} icon={Users} rows={dimensions?.complainantOccupations || []} loading={dimensionsLoading} unavailable={!!dimensionsError} />
          <DemographicPanel title={ui("Incident Setting")} icon={Building2} rows={dimensions?.incidentSettings || []} loading={dimensionsLoading} unavailable={!!dimensionsError} note="Narrative descriptor, not an urbanization index." />
        </div>
        {dimensionsError && (
          <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm">
            <span><UiText text={dimensionsError} /></span>
            <button type="button" className="btn-ghost" onClick={loadDimensions}><RefreshCw size={15} /><UiText text={"Retry demographic sources"} /></button>
          </div>
        )}
        {dimensions && <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <SocialContextPanel dimensions={dimensions} />
          <VulnerabilityPanel dimensions={dimensions} />
        </div>}
        <CoveragePanel rows={dimensions?.coverage || []} />
      </section>

      {/* AI summary + hotspots + threats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card panel-pad">
          <PanelHeader
            icon={Radar}
            title={ui("Intelligence summary")}
            sub={ui("Derived from live Cloud Scale records")}
            action={summary.length > 0 ? <ReadAloud label={ui("Listen")} text={summary.map(ui).join(". ")} /> : undefined}
          />
          {summary.length === 0 ? (
            <p className="text-sm text-muted"><UiText text={"No Cloud Scale records yet."} /></p>
          ) : (
            <ul className="space-y-2">
              {summary.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-subtle">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  <UiText text={s} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card panel-pad">
          <PanelHeader icon={Flame} tone="warning" title={ui("Crime hotspots")} sub={ui("Top districts by volume")} />
          <MapPanel points={geo} height={200} />
          <div className="mt-3 space-y-1">
            {hotspots.slice(0, 5).map((h, i) => (
              <div key={h.district} className="flex items-center justify-between text-xs">
                <span className="text-subtle">
                  <span className="mr-2 font-mono tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <UiText text={h.district} />
                </span>
                <Badge tone={i === 0 ? "danger" : i < 2 ? "warning" : "info"}><UiText text={h.cases} /></Badge>
              </div>
            ))}
            {hotspots.length === 0 && <p className="text-xs text-muted"><UiText text={"No geolocated FIRs yet."} /></p>}
          </div>
        </div>

        <div className="card panel-pad">
          <PanelHeader icon={AlertTriangle} tone="danger" title={ui("Active threats & alerts")} />
          <div className="space-y-2">
            {threats.length === 0 && <p className="text-sm text-muted"><UiText text={"No alerts derived yet."} /></p>}
            {threats.map((tr, i) => (
              <div key={i} className="rounded-md border border-border bg-elevated/40 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold"><UiText text={tr.title} /></span>
                  <Badge tone={tr.tone}><UiText text={tr.tone === "danger" ? "HIGH" : tr.tone === "warning" ? "MED" : "LOW"} /></Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted"><UiText text={tr.detail} /></p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Repeat offenders (selectable) + performance */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card panel-pad lg:col-span-2">
          <PanelHeader icon={Users} title={ui("Repeat offender analysis")} sub={`${criminals.length} profiles indexed`} />
          {active ? (
            <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
              <div className="rounded-md border border-border bg-elevated/40 p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={active.name} size={44} profileId={active.id} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold"><UiText text={active.name} /></div>
                    <div className="font-mono text-[11px] text-accent"><UiText text={"KSP-"} />{String(active.id).padStart(4, "0")}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted"><UiText text={"Age "} />{active.age || "—"} · {active.home_district || "—"}
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs"><span className="text-subtle"><UiText text={"Risk score"} /></span><span className="font-mono tabular-nums text-danger"><UiText text={active.risk_score} />%</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border"><div className="h-full rounded-full bg-danger transition-[width] duration-500 ease-out" style={{ width: `${Math.min(100, active.risk_score)}%` }} /></div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded border border-border bg-surface/60 p-2"><div className="stat-label"><UiText text={"FIRs"} /></div><div className="mt-1 font-mono text-lg font-semibold tabular-nums"><UiText text={active.fir_count} /></div></div>
                  <div className="rounded border border-border bg-surface/60 p-2"><div className="stat-label"><UiText text={"Arrests"} /></div><div className="mt-1 font-mono text-lg font-semibold tabular-nums"><UiText text={active.arrest_count} /></div></div>
                </div>
                <div className="mt-2 text-xs capitalize text-muted">{active.crime_category || active.status}</div>
                <Link href={`/criminals/record?id=${active.id}`} className="btn-ghost mt-3 h-8 w-full justify-center text-xs"><UiText text={"View profile "} /><ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
              <div>
                <div className="stat-label mb-2"><UiText text={"Select an offender"} /></div>
                <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
                  {ranked.map((c) => (
                    <button key={c.id} onClick={() => setSel(c.id)} className={`flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors ${active.id === c.id ? "bg-elevated ring-1 ring-inset ring-accent/40" : "hover:bg-elevated/60"}`}>
                      <Avatar name={c.name} size={26} profileId={c.id} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium"><UiText text={c.name} /></div>
                        <div className="text-[10.5px] capitalize text-muted">{c.crime_category || c.home_district} · <UiText text={c.fir_count} /><UiText text={" FIRs"} /></div>
                      </div>
                      <span className="font-mono text-xs font-semibold tabular-nums text-danger"><UiText text={c.risk_score} /></span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : <EmptyState icon={Users} title={ui("No offenders on record")} hint={ui("Analysis appears once profiles sync from Cloud Scale.")} />}
        </div>

        <div className="card panel-pad">
          <PanelHeader icon={Activity} title={ui("Investigation performance")} />
          <div className="space-y-3">
            {perf.map((p) => (
              <div key={p.label}>
                <div className="mb-1 flex items-center justify-between text-xs"><span className="text-subtle"><UiText text={p.label} /></span><span className="font-mono tabular-nums text-muted"><UiText text={p.value} /><UiText text={p.pct ? "%" : ""} /></span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border"><div className={`h-full rounded-full transition-[width] duration-500 ease-out ${p.color}`} style={{ width: `${Math.min(100, (p.value / p.max) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cross-case connections */}
      <div className="card panel-pad">
        <PanelHeader icon={Network} title={ui("Cross-case connections")} action={<Tag><UiText text={"derived"} /></Tag>} />
        {cases.length === 0 && criminals.length === 0 ? (
          <EmptyState icon={Network} title={ui("No connections derived yet")} hint={ui("Links surface once cases share a district and crime type.")} />
        ) : (
          <div className="grid items-stretch gap-4 lg:grid-cols-[180px_1fr]">
            <div className="flex flex-col items-center justify-center rounded-md border border-accent/30 bg-accent/5 p-4 text-center">
              <div className="font-display text-3xl font-bold tabular-nums text-accent"><UiText text={links.linkedCases} /></div>
              <div className="mt-1 text-xs font-semibold text-subtle"><UiText text={"Linked cases"} /></div>
              <div className="mt-0.5 text-[10px] text-muted"><UiText text={"shared district + crime type"} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {links.entities.map((e) => (
                <div key={e.label} className="rounded-md border border-border bg-elevated/40 p-2.5">
                  <div className="flex items-center justify-between">
                    <e.icon className={`h-4 w-4 ${e.cls}`} />
                    <span className="font-display text-lg font-bold tabular-nums"><UiText text={e.value} /></span>
                  </div>
                  <div className="mt-1 text-xs font-medium text-subtle"><UiText text={e.label} /></div>
                  <div className="text-[10.5px] text-muted"><UiText text={e.note} /></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Queue + evidence */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card panel-pad lg:col-span-2">
          <PanelHeader icon={FolderKanban} title={ui("Priority investigation queue")} sub={ui("Top by priority")} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="pb-2 pr-3"><UiText text={"Priority"} /></th>
                  <th className="pb-2 pr-3"><UiText text={"Case"} /></th>
                  <th className="pb-2 pr-3"><UiText text={"Type"} /></th>
                  <th className="pb-2 pr-3"><UiText text={"District"} /></th>
                  <th className="pb-2"><UiText text={"Status"} /></th>
                </tr>
              </thead>
              <tbody>
                {queue.map((c) => (
                  <tr key={c.id} className="border-t border-border/50 transition-colors hover:bg-elevated/50">
                    <td className="py-2 pr-3"><Badge tone={c.priority === "critical" ? "danger" : c.priority === "high" ? "warning" : "info"}><UiText text={c.priority} /></Badge></td>
                    <td className="py-2 pr-3 font-mono text-xs">{c.case_number || `#${c.id}`}</td>
                    <td className="py-2 pr-3 text-subtle">{c.crime_type || "—"}</td>
                    <td className="py-2 pr-3 text-muted">{c.district || "—"}</td>
                    <td className="py-2 text-xs capitalize text-muted"><UiText text={c.status?.replace(/_/g, " ")} /></td>
                  </tr>
                ))}
                {queue.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-sm text-muted"><UiText text={"No cases in Cloud Scale yet."} /></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card panel-pad">
          <PanelHeader icon={ScanText} title={ui("Evidence & processing")} />
          <div className="grid grid-cols-2 gap-2">
            <Stat icon={ScanText} label={ui("OCR documents")} value={ocr} />
            <Stat icon={MapPin} label={ui("Geolocated FIRs")} value={geo.length} />
            <Stat icon={FolderKanban} label={ui("Total cases")} value={cases.length} />
            <Stat icon={Users} label={ui("Profiles")} value={criminals.length} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DemographicPanel({ title, icon, rows, note, loading = false, unavailable = false }: { title: string; icon: typeof Users; rows: { label: string; count: number }[]; note?: string; loading?: boolean; unavailable?: boolean }) {
  const ui = useUiText();
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="demographic-panel card panel-pad">
      <PanelHeader icon={icon} title={title} action={<Badge tone="muted"><UiText text={loading || unavailable ? "—" : total} /></Badge>} />
      {loading ? <div aria-label={ui("Loading demographic sources")} aria-busy className="skeleton h-44"/> : unavailable ? <EmptyState icon={Database} title={ui("Source unavailable")} hint={ui("Demographic data could not be retrieved. Retry the source connection below.")}/> : rows.length ? <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">{rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-center justify-between text-xs"><span className="capitalize text-subtle"><UiText text={row.label} /></span><span className="font-mono tabular-nums text-muted"><UiText text={row.count} /> · <UiText text={total ? Math.round(row.count / total * 100) : 0} />%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-elevated"><div className="h-full rounded-full bg-accent" style={{ width: `${total ? row.count / total * 100 : 0}%` }} /></div>
        </div>
      ))}</div> : <EmptyState icon={Users} title={ui("No records returned")} hint={ui("The current Cloud Scale environment returned no rows for this analysis.")} />}
      {note && <p className="mt-3 border-t border-border pt-2 text-[10.5px] leading-relaxed text-muted"><UiText text={note} /></p>}
    </div>
  );
}

function SocialContextPanel({ dimensions }: { dimensions: IntelligenceDimensions | null }) {
  const ui = useUiText();
  const groups = [
    { title: "Complainant gender", rows: dimensions?.complainantGender || [] },
    { title: "Age bands", rows: dimensions?.complainantAgeBands || [] },
    { title: "Religion", rows: dimensions?.complainantReligions || [] },
    { title: "Caste", rows: dimensions?.complainantCastes || [] },
  ];
  return (
    <div className="card panel-pad">
      <PanelHeader icon={Users} title={ui("Complainant Social Context")} sub={ui("Aggregate distributions from organizer-supplied demographic references")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => (
          <div key={group.title} className="min-w-0">
            <div className="stat-label mb-2"><UiText text={group.title} /></div>
            <div className="space-y-1.5">
              {group.rows.slice(0, 5).map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate capitalize text-subtle" title={row.label}><UiText text={row.label} /></span>
                  <span className="shrink-0 font-mono tabular-nums text-muted"><UiText text={row.count} /></span>
                </div>
              ))}
              {!group.rows.length && <span className="text-xs text-muted"><UiText text={"No records"} /></span>}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-border pt-2 text-[10.5px] leading-relaxed text-muted"><UiText text={"Sensitive attributes are shown only as aggregate context. NETRA does not use religion or caste to infer guilt, intent, or individual risk."} /></p>
    </div>
  );
}

function VulnerabilityPanel({ dimensions }: { dimensions: IntelligenceDimensions | null }) {
  const ui = useUiText();
  const rows = [
    { label: "Minor victims", value: dimensions?.vulnerability.minors || 0 },
    { label: "Senior victims", value: dimensions?.vulnerability.seniors || 0 },
    { label: "Police personnel victims", value: dimensions?.vulnerability.policePersonnel || 0 },
  ];
  return (
    <div className="card panel-pad">
      <PanelHeader icon={ShieldAlert} tone="warning" title={ui("Victim Vulnerability")} sub={ui("Age and service-status indicators")} />
      <div className="divide-y divide-border/60">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between py-2.5">
            <span className="text-xs text-subtle"><UiText text={row.label} /></span>
            <span className="font-display text-lg font-semibold tabular-nums"><UiText text={row.value} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoveragePanel({ rows }: { rows: IntelligenceDimensions["coverage"] }) {
  return (
    <div className="mt-4 border-y border-border bg-surface/35 px-3 py-3 sm:px-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="stat-label"><UiText text={"Source coverage"} /></div>
          <div className="mt-0.5 text-xs text-muted"><UiText text={"What the supplied 28-table KSP schema can support without fabricated fields"} /></div>
        </div>
        <Tag><UiText text={"schema-bound"} /></Tag>
      </div>
      <div className="grid gap-x-5 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const available = row.status === "available";
          const proxy = row.status === "proxy";
          const Icon = available ? CircleCheck : CircleDashed;
          return (
            <div key={row.label} className="flex items-start gap-2 border-t border-border/50 pt-2">
              <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${available ? "text-success" : proxy ? "text-warning" : "text-muted"}`} />
              <div className="min-w-0">
                <div className="text-xs font-medium text-subtle"><UiText text={row.label} /></div>
                <div className="mt-0.5 text-[10.5px] leading-relaxed text-muted"><UiText text={proxy ? "Proxy · " : row.status === "not-supplied" ? "Not supplied · " : "Available · "} /><UiText text={row.source} /></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-elevated/40 p-2.5">
      <Icon className="h-4 w-4 text-accent" />
      <div className="mt-1.5 font-display text-lg font-bold tabular-nums"><UiText text={value} /></div>
      <div className="text-[10.5px] text-muted"><UiText text={label} /></div>
    </div>
  );
}
