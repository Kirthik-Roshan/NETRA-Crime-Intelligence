"use client";
import { UiText, useUiText, useUiLocale } from '@/components/UiText';

import { useEffect, useRef, useState } from "react";
import Link from "@/components/AppLink";
import {
  FolderKanban, AlertTriangle, UserSearch, Fingerprint, TrendingUp,
  MapPin, ArrowRight, Flame, Radar, Activity, PieChart, BarChart3,
  ScanSearch, Network, Gauge, FileText, Target, Crosshair,
  RefreshCw,
} from "lucide-react";
import { OfficerFirstName } from "@/components/OfficerName";
import { PageHeader, PanelHeader, EmptyState } from "@/components/ui";
import { BarSeries, Donut } from "@/components/charts";
import { MapPanel } from "@/components/maps/MapPanel";
import { useT } from "@/lib/i18n-client";
import { fetchDashboard, type DashboardData } from "@/lib/cloudscale";
import { LoginNetwork } from "@/app/login/LoginNetwork";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./dashboard.css";

const EMPTY: DashboardData = {
  stats: { activeCases: 0, critical: 0, totalFirs: 0, atLarge: 0, arrests30: 0, solveRate: 0 },
  trend: [], byType: [], hotspots: [], geo: [],
  heat: [], velocity: { open: 0, active: 0, closed: 0, escalated: 0, avgClosureDays: 0 },
  confidence: { dataQuality: 0, caseLinkage: 0, patternSignal: 0, extractionReadiness: 0, overall: 0 },
};

// Reads all stats from Cloud Scale Data Store via the Catalyst Function.
export default function DashboardPage() {
  const ui = useUiText();
  const t = useT();
  const locale = useUiLocale();
  const [d, setD] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [period, setPeriod] = useState(6);
  const [clock, setClock] = useState<Date | null>(null);
  useEffect(() => { setClock(new Date()); const timer = setInterval(() => setClock(new Date()), 60000); return () => clearInterval(timer); }, []);
  const loadDashboard = () => {
    setLoadError("");
    setD(null);
    fetchDashboard().then(setD).catch((error) => setLoadError(error instanceof Error ? error.message : "Cloud Scale data could not be loaded."));
  };
  useEffect(() => { loadDashboard(); }, []);

  const { stats, trend, byType, hotspots, geo, heat, velocity, confidence } = d ?? EMPTY;
  const today = new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  // Insights derived from the Cloud Scale data itself (no separate source).
  const alerts: { icon: typeof Flame; title: string; detail: string }[] = [];
  if (hotspots[0]) alerts.push({ icon: Flame, title: "Top hotspot", detail: `${hotspots[0].district} leads with ${hotspots[0].cases} FIRs.` });
  if (byType[0]) alerts.push({ icon: TrendingUp, title: "Leading offence", detail: `${byType[0].crime_type} is the most frequent (${byType[0].count}).` });
  if (stats.activeCases > 0) alerts.push({ icon: FolderKanban, title: "Active workload", detail: `${stats.activeCases} cases currently require investigation follow-up.` });
  if (stats.arrests30 > 0) alerts.push({ icon: Fingerprint, title: "Custody activity", detail: `${stats.arrests30} arrests were recorded in the latest 30-day window.` });

  const overallPct = Math.round(confidence.overall * 100);
  const quickActions = [
    { href: "/assistant", icon: ScanSearch, label: "Investigation Assistant", desc: "Natural-language record search" },
    { href: "/cases", icon: FolderKanban, label: "Case Registry", desc: "Open & active investigations" },
    { href: "/network", icon: Network, label: "Link Analysis", desc: "Suspect & entity network graph" },
    { href: "/maps", icon: MapPin, label: "Crime Map", desc: "Geospatial hotspot explorer" },
  ];

  return (
    <div className="dashboard-workspace space-y-4">
      <div className="dashboard-network"><LoginNetwork /></div>
      <PageHeader title={<>{t("dash.greeting")}, <OfficerFirstName /></>} subtitle={`${today} · ${t("dash.subtitle")}`}>
        <span className="chip hidden sm:inline-flex">
          <span className={`h-1.5 w-1.5 rounded-full ${loadError ? "bg-danger" : d === null ? "animate-pulse bg-warning" : "bg-success"}`} />
          <span className="font-mono text-[11px] tracking-wide"><UiText text={loadError ? "DATA UNAVAILABLE" : d === null ? "SYNCING" : "CLOUD SCALE · LIVE"} /></span>
        </span>
        <div className="dashboard-date"><FileText size={20} /><div><strong>{clock?.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }) ?? "Today"}</strong><span>{clock?.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) ?? ""}<UiText text={" · Karnataka"} /></span></div></div>
      </PageHeader>

      {/* Live-sync affordance while the first payload resolves */}
      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <span><UiText text={loadError} /><UiText text={" Figures below are unavailable until the connection is restored."} /></span>
          <button type="button" onClick={loadDashboard} className="btn-ghost h-8 text-xs"><RefreshCw className="h-3.5 w-3.5" /><UiText text={" Retry"} /></button>
        </div>
      )}
      {d === null && !loadError && (
        <div className="flex items-center gap-2.5 rounded-md border border-border bg-elevated/40 px-3 py-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted"><UiText text={"Loading live data from Cloud Scale…"} /></span>
        </div>
      )}

      {!loadError && <>
      {/* KPI strip — the state of the operation at a glance */}
      <div className="dashboard-kpis grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label={t("dash.active_cases")} value={stats.activeCases} sub={`${stats.critical} critical priority`} icon={FolderKanban} tone="accent" />
        <StatCard label={t("dash.critical_alerts")} value={stats.critical} sub={ui("Require immediate review")} icon={AlertTriangle} tone="danger" />
        <StatCard label={t("dash.suspects_at_large")} value={stats.atLarge} sub={`of ${stats.totalFirs} FIRs on record`} icon={UserSearch} tone="warning" />
        <StatCard label={t("dash.arrests_30d")} value={stats.arrests30} sub={`${stats.solveRate}% case solve rate`} icon={Fingerprint} tone="success" />
        <StatCard label={ui("Total FIRs")} value={stats.totalFirs} sub={ui("On record · Cloud Scale")} icon={FileText} tone="info" />
        <StatCard label={ui("Solve Rate")} value={`${stats.solveRate}%`} sub={ui("Charge-sheeted or closed")} icon={Target} tone="default" />
      </div>

      {/* Independent working columns prevent unequal panel heights from creating dead space. */}
      <div className="dashboard-grid">
        <div className="dashboard-main">
          {/* Crime heat evolution + incident trend */}
          <div className="card panel-pad dashboard-trend">
            <PanelHeader
              icon={Flame}
              tone="danger"
              title={ui("Crime Heat Evolution")}
              sub={ui("Incident volume across trailing windows · Δ vs previous window")}
              action={<div className="dashboard-period" role="group" aria-label={ui("Trend period")}>{[3, 6, 12].map((months) => <button key={months} aria-pressed={period === months} onClick={() => setPeriod(months)}><UiText text={months === 12 ? "1Y" : `${months}M`} /></button>)}</div>}
            />
            {/* Windowed density evolution — 24h → 6mo, anchored to the newest FIR */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(heat.length ? heat : [{ key: "24h", label: "24 hours", count: 0, delta: 0 }, { key: "7d", label: "7 days", count: 0, delta: 0 }, { key: "30d", label: "30 days", count: 0, delta: 0 }, { key: "6mo", label: "6 months", count: 0, delta: 0 }]).map((w) => {
                const up = w.delta > 0, flat = w.delta === 0;
                return (
                  <div key={w.key} className="lift-row rounded-md border border-border bg-elevated/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="stat-label"><UiText text={w.label} /></div>
                      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${flat ? "bg-muted" : up ? "bg-danger" : "bg-success"}`} />
                    </div>
                    <div className="mt-1 font-display text-xl font-bold tabular-nums"><UiText text={w.count} /></div>
                    <div className={`mt-0.5 font-mono text-[11px] tabular-nums ${flat ? "text-muted" : up ? "text-danger" : "text-success"}`}>
                      <UiText text={flat ? "±0%" : `${up ? "▲" : "▼"} ${Math.abs(w.delta)}%`} />
                    </div>
                  </div>
                );
              })}
            </div>
            {trend.length ? <ResponsiveContainer width="100%" height={210}><AreaChart data={trend.slice(-period)} margin={{ top: 12, right: 8, left: -22, bottom: 0 }}><defs><linearGradient id="dashboard-trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#087fbe" stopOpacity={0.28}/><stop offset="100%" stopColor="#087fbe" stopOpacity={0.02}/></linearGradient></defs><CartesianGrid vertical={false} stroke="rgb(var(--border))" strokeDasharray="3 5"/><XAxis dataKey="month" tick={{ fontSize: 11, fill: "rgb(var(--muted))" }} tickLine={false} axisLine={false}/><YAxis tick={{ fontSize: 11, fill: "rgb(var(--muted))" }} tickLine={false} axisLine={false} allowDecimals={false}/><Tooltip contentStyle={{ borderRadius: 6, borderColor: "rgb(var(--border))", background: "rgb(var(--surface))", color: "rgb(var(--fg))" }}/><Area type="monotone" dataKey="cases" name="FIRs" stroke="#087fbe" strokeWidth={2.5} fill="url(#dashboard-trend-fill)" activeDot={{ r: 5, strokeWidth: 3 }}/></AreaChart></ResponsiveContainer> : <EmptyState icon={Activity} title={ui("No FIR records yet")} hint={ui("Incident trends appear here once Cloud Scale has data.")} />}
          </div>

          {/* District load */}
          <div className="card panel-pad dashboard-districts">
            <PanelHeader icon={BarChart3} title={t("dash.district_load")} sub={ui("FIRs by district · top 8")} action={<Link href="/maps" className="dashboard-text-link"><UiText text={"View all "} /><ArrowRight size={14}/></Link>} />
            {hotspots.length ? <BarSeries data={hotspots.slice(0, 8)} x="district" y="cases" color="info" height={200} compactLabels /> : <EmptyState icon={BarChart3} title={ui("No district data yet")} hint={ui("District load ranks appear once FIRs are geotagged.")} />}
          </div>

          <div className="card panel-pad dashboard-map">
            <PanelHeader
              icon={MapPin}
              title={t("dash.hotspots")}
              sub={`${geo.length} geolocated FIRs · from Cloud Scale`}
              action={<Link href="/maps" className="btn-ghost h-8 py-0 text-xs">{t("dash.full_map")} <ArrowRight className="h-3.5 w-3.5" /></Link>}
            />
            <div className="dashboard-map-stage">
              <aside className="dashboard-map-legend"><h4><UiText text={"Crime categories"} /></h4>{byType.slice(0, 7).map((row, index) => <div key={row.crime_type}><span style={{ background: ["#1686ff", "#ef3853", "#ff982b", "#8163e8", "#0bb48b", "#14bad3", "#a2b7cb"][index] }} /><span><UiText text={row.crime_type} /></span><strong><UiText text={row.count} /></strong></div>)}<div className="dashboard-heat-key"><h4><UiText text={"FIR density"} /></h4><div /><span><UiText text={"Low"} /></span><span><UiText text={"High"} /></span></div></aside>
              <DeferredMapPanel points={geo} />
            </div>
          </div>

          <div className="card panel-pad dashboard-velocity">
            <PanelHeader icon={Activity} title={ui("Investigation Velocity")} sub={ui("Live case throughput across the state · from Cloud Scale")} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <VelocityTile label={ui("Open")} value={velocity.open} />
              <VelocityTile label={ui("Active")} value={velocity.active} tone="warning" />
              <VelocityTile label={ui("Closed")} value={velocity.closed} tone="success" />
              <VelocityTile label={ui("Escalated")} value={velocity.escalated} tone="danger" />
              <VelocityTile label={ui("Avg closure")} value={velocity.avgClosureDays ? `${velocity.avgClosureDays}d` : "—"} />
            </div>
          </div>
        </div>

        {/* Operations rail — briefings, confidence, and jump-offs */}
        <div className="dashboard-rail">
          <div className="card panel-pad dashboard-ranking">
            <PanelHeader icon={MapPin} title={ui("Top Districts by FIRs")} action={<Link href="/maps" className="dashboard-text-link"><UiText text={"View all "} /><ArrowRight size={14}/></Link>} />
            <ol>{hotspots.slice(0, 8).map((row, index) => <li key={row.district}><Link href="/maps"><span className="dashboard-rank-number">{index + 1}</span><span className="dashboard-rank-name"><UiText text={row.district} /></span><span className="dashboard-rank-track"><span style={{ width: `${row.cases / Math.max(1, hotspots[0].cases) * 100}%` }} /></span><strong><UiText text={row.cases} /></strong></Link></li>)}</ol>
          </div>
          <div className="card panel-pad dashboard-briefings">
            <PanelHeader icon={Radar} title={t("dash.ai_briefings")} sub={ui("Derived from live Cloud Scale records")} action={<Link href="/analytics" className="dashboard-text-link"><UiText text={"View all "} /><ArrowRight size={14}/></Link>} />
            {alerts.length ? (
              <div className="space-y-2">
                {alerts.slice(0, 4).map((a, i) => (
                  <Link href={["/maps", "/analytics", "/cases", "/cases"][i]} key={i} className="dashboard-briefing lift-row flex gap-3 p-3 animate-fade-in">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-warning/30 bg-warning/10">
                      <a.icon className="h-4 w-4 text-warning" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold"><UiText text={a.title} /></div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted"><UiText text={a.detail} /></p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : <EmptyState icon={Radar} title={ui("No briefings yet")} hint={ui("Intelligence briefings surface as Cloud Scale accumulates records.")} />}
          </div>

          <div className="card panel-pad dashboard-confidence">
            <PanelHeader icon={Gauge} title={ui("Intelligence Confidence")} sub={ui("Record completeness & linkage signal")} />
            <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-elevated/40 px-3 py-2.5">
              <span className="stat-label"><UiText text={"Overall"} /></span>
              <span className="font-display text-2xl font-bold tabular-nums text-accent"><UiText text={overallPct} /><span className="ml-0.5 text-base text-muted">%</span></span>
            </div>
            <ConfidenceBar label={ui("Data quality")} v={confidence.dataQuality} />
            <ConfidenceBar label={ui("Case linkage")} v={confidence.caseLinkage} />
            <ConfidenceBar label={ui("Pattern signal")} v={confidence.patternSignal} />
            <ConfidenceBar label={ui("Extraction readiness")} v={confidence.extractionReadiness} />
          </div>

          <div className="card panel-pad dashboard-actions">
            <PanelHeader icon={Crosshair} title={ui("Quick Actions")} sub={ui("Jump into an investigation surface")} />
            <div className="space-y-2">
              {quickActions.map((a) => (
                <Link key={a.href} href={a.href} className="lift-row group flex items-center gap-3 rounded-md border border-border bg-elevated/40 px-3 py-2.5 hover:bg-elevated">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-surface">
                    <a.icon className="h-4 w-4 text-accent" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold"><UiText text={a.label} /></div>
                    <div className="truncate text-[11px] text-muted"><UiText text={a.desc} /></div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
              ))}
            </div>
          </div>

          <div className="card panel-pad dashboard-distribution">
            <PanelHeader icon={PieChart} title={t("dash.crime_mix")} sub={ui("Share by category")} />
            {byType.length ? (
              <>
                <div className="dashboard-mix"><div className="dashboard-donut"><Donut data={byType} nameKey="crime_type" valueKey="count" height={190} includeOthers /><div className="dashboard-donut-label"><strong><UiText text={stats.totalFirs} /></strong><span><UiText text={"Total FIRs"} /></span></div></div>
                <div className="dashboard-mix-legend">
                  {[...byType.slice(0, 5), ...(byType.length > 5 ? [{ crime_type: "Others", count: byType.slice(5).reduce((sum, row) => sum + row.count, 0) }] : [])].map((ct, i) => (
                    <div key={ct.crime_type} className="flex items-center justify-between border-t border-border/50 py-1.5 text-xs first:border-t-0 first:pt-0">
                      <span className="flex items-center gap-2 text-subtle">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: `rgb(var(${["--accent", "--info", "--warning", "--danger", "--success"][i % 5]}))` }} />
                        <UiText text={ct.crime_type} />
                      </span>
                      <span className="font-mono tabular-nums text-muted"><UiText text={ct.count} /></span>
                    </div>
                  ))}
                </div></div>
              </>
            ) : <EmptyState icon={PieChart} title={ui("No categories yet")} hint={ui("Offence breakdown appears once FIRs are on record.")} />}
          </div>
        </div>
      </div>
      </>}
    </div>
  );
}

function DeferredMapPanel({ points }: { points: DashboardData["geo"] }) {
  const ui = useUiText();
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible || !container.current) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "300px" });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={container} className="min-h-[480px] min-w-0" aria-label={ui("Crime map")}>
      {visible ? <MapPanel points={points} height={480} initialView="heatmap" /> : <div className="h-[480px] rounded-md border border-border bg-elevated/30" />}
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, tone = "default" }: { label: string; value: React.ReactNode; sub: string; icon: typeof FileText; tone?: string }) {
  const color = ({ accent: "#0678bd", danger: "#d9203a", warning: "#ed7c24", success: "#009579", info: "#1468dc", default: "#6249dc" } as Record<string, string>)[tone];
  return <Link href={tone === "danger" ? "/cases?priority=critical" : tone === "warning" ? "/criminals" : tone === "default" ? "/analytics" : "/cases"} className="dashboard-stat card" style={{ "--stat-color": color } as React.CSSProperties}>
    <div className="dashboard-stat-heading"><span className="dashboard-stat-icon"><Icon size={21}/></span><span><UiText text={label} /></span><ArrowRight size={14} className="dashboard-stat-arrow"/></div>
    <strong><UiText text={value} /></strong><span className="dashboard-stat-sub"><UiText text={sub} /></span>
  </Link>;
}

function VelocityTile({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "danger" | "warning" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-fg";
  const edge = tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-border";
  return (
    <div className="lift-row relative overflow-hidden rounded-md border border-border bg-elevated/40 p-3">
      <span aria-hidden className={`absolute inset-x-0 top-0 h-[2px] ${edge}`} />
      <div className="stat-label"><UiText text={label} /></div>
      <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${color}`}><UiText text={value} /></div>
    </div>
  );
}

function ConfidenceBar({ label, v }: { label: string; v: number }) {
  const pct = Math.round(v * 100);
  const tone = pct >= 75 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-danger";
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-subtle"><UiText text={label} /></span>
        <span className="font-mono tabular-nums text-muted"><UiText text={pct} />%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border/60">
        <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
