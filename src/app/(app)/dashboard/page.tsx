"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FolderKanban, AlertTriangle, UserSearch, Fingerprint, TrendingUp,
  MapPin, ArrowRight, Flame, Radar, Activity, PieChart, BarChart3,
  ScanSearch, Network, Gauge, FileText, Target, Crosshair,
} from "lucide-react";
import { OfficerFirstName } from "@/components/OfficerName";
import { StatCard, PageHeader, PanelHeader, Badge, EmptyState } from "@/components/ui";
import { TrendLine, BarSeries, Donut } from "@/components/charts";
import { MapPanel } from "@/components/maps/MapPanel";
import { useT } from "@/lib/i18n-client";
import { fetchDashboard, type DashboardData } from "@/lib/cloudscale";

const EMPTY: DashboardData = {
  stats: { activeCases: 0, critical: 0, totalFirs: 0, atLarge: 0, arrests30: 0, solveRate: 0 },
  trend: [], byType: [], hotspots: [], geo: [],
  heat: [], velocity: { open: 0, active: 0, closed: 0, escalated: 0, avgClosureDays: 0 },
  confidence: { dataQuality: 0, caseLinkage: 0, patternSignal: 0, extractionReadiness: 0, overall: 0 },
};

// Reads all stats from Cloud Scale Data Store via the Catalyst Function.
export default function DashboardPage() {
  const t = useT();
  const [d, setD] = useState<DashboardData | null>(null);
  useEffect(() => { fetchDashboard().then(setD).catch(() => setD(EMPTY)); }, []);

  const { stats, trend, byType, hotspots, geo, heat, velocity, confidence } = d ?? EMPTY;
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

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
    <div className="space-y-5">
      <PageHeader title={<>{t("dash.greeting")}, <OfficerFirstName /></>} subtitle={`${today} · ${t("dash.subtitle")}`}>
        <span className="chip hidden sm:inline-flex">
          <span className={`h-1.5 w-1.5 rounded-full ${d === null ? "animate-pulse bg-warning" : "bg-success"}`} />
          <span className="font-mono text-[11px] tracking-wide">{d === null ? "SYNCING" : "CLOUD SCALE · LIVE"}</span>
        </span>
        <Link href="/assistant" className="btn-accent">
          <ScanSearch className="h-4 w-4" /> {t("dash.ask")}
        </Link>
      </PageHeader>

      {/* Live-sync affordance while the first payload resolves */}
      {d === null && (
        <div className="flex items-center gap-2.5 rounded-md border border-border bg-elevated/40 px-3 py-2">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Loading live data from Cloud Scale…</span>
        </div>
      )}

      {/* KPI strip — the state of the operation at a glance */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label={t("dash.active_cases")} value={stats.activeCases} sub={`${stats.critical} critical priority`} icon={FolderKanban} tone="accent" />
        <StatCard label={t("dash.critical_alerts")} value={stats.critical} sub="Require immediate review" icon={AlertTriangle} tone="danger" />
        <StatCard label={t("dash.suspects_at_large")} value={stats.atLarge} sub={`of ${stats.totalFirs} FIRs on record`} icon={UserSearch} tone="warning" />
        <StatCard label={t("dash.arrests_30d")} value={stats.arrests30} sub={`${stats.solveRate}% case solve rate`} icon={Fingerprint} tone="success" />
        <StatCard label="Total FIRs" value={stats.totalFirs} sub="On record · Cloud Scale" icon={FileText} tone="info" />
        <StatCard label="Solve Rate" value={`${stats.solveRate}%`} sub="Charge-sheeted or closed" icon={Target} tone="default" />
      </div>

      {/* Primary working grid — trend/heat + district load on the left, ops rail on the right */}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* Crime heat evolution + incident trend */}
          <div className="card panel-pad">
            <PanelHeader
              icon={Flame}
              tone="danger"
              title="Crime Heat Evolution"
              sub="Incident volume across trailing windows · Δ vs previous window"
              action={<Badge tone="accent"><TrendingUp className="h-3 w-3" /> live</Badge>}
            />
            {/* Windowed density evolution — 24h → 6mo, anchored to the newest FIR */}
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(heat.length ? heat : [{ key: "24h", label: "24 hours", count: 0, delta: 0 }, { key: "7d", label: "7 days", count: 0, delta: 0 }, { key: "30d", label: "30 days", count: 0, delta: 0 }, { key: "6mo", label: "6 months", count: 0, delta: 0 }]).map((w) => {
                const up = w.delta > 0, flat = w.delta === 0;
                return (
                  <div key={w.key} className="lift-row rounded-md border border-border bg-elevated/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="stat-label">{w.label}</div>
                      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${flat ? "bg-muted" : up ? "bg-danger" : "bg-success"}`} />
                    </div>
                    <div className="mt-1 font-display text-xl font-bold tabular-nums">{w.count}</div>
                    <div className={`mt-0.5 font-mono text-[11px] tabular-nums ${flat ? "text-muted" : up ? "text-danger" : "text-success"}`}>
                      {flat ? "±0%" : `${up ? "▲" : "▼"} ${Math.abs(w.delta)}%`}
                    </div>
                  </div>
                );
              })}
            </div>
            {trend.length ? <TrendLine data={trend} /> : <EmptyState icon={Activity} title="No FIR records yet" hint="Incident trends appear here once Cloud Scale has data." />}
          </div>

          {/* District load */}
          <div className="card panel-pad">
            <PanelHeader icon={BarChart3} tone="warning" title={t("dash.district_load")} sub="FIRs by district · top 8" />
            {hotspots.length ? <BarSeries data={hotspots.slice(0, 8)} x="district" y="cases" color="warning" height={300} /> : <EmptyState icon={BarChart3} title="No district data yet" hint="District load ranks appear once FIRs are geotagged." />}
          </div>
        </div>

        {/* Operations rail — briefings, confidence, and jump-offs */}
        <div className="space-y-5">
          <div className="card panel-pad">
            <PanelHeader icon={Radar} title={t("dash.ai_briefings")} count={alerts.length} sub="Derived from live Cloud Scale records" />
            {alerts.length ? (
              <div className="space-y-2">
                {alerts.slice(0, 4).map((a, i) => (
                  <div key={i} className="lift-row flex gap-3 rounded-md border border-border bg-elevated/40 p-3 animate-fade-in">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-warning/30 bg-warning/10">
                      <a.icon className="h-4 w-4 text-warning" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{a.title}</div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">{a.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyState icon={Radar} title="No briefings yet" hint="Intelligence briefings surface as Cloud Scale accumulates records." />}
          </div>

          <div className="card panel-pad">
            <PanelHeader icon={Gauge} title="Intelligence Confidence" sub="Record completeness & linkage signal" />
            <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-elevated/40 px-3 py-2.5">
              <span className="stat-label">Overall</span>
              <span className="font-display text-2xl font-bold tabular-nums text-accent">{overallPct}<span className="ml-0.5 text-base text-muted">%</span></span>
            </div>
            <ConfidenceBar label="Data quality" v={confidence.dataQuality} />
            <ConfidenceBar label="Case linkage" v={confidence.caseLinkage} />
            <ConfidenceBar label="Pattern signal" v={confidence.patternSignal} />
            <ConfidenceBar label="Extraction readiness" v={confidence.extractionReadiness} />
          </div>

          <div className="card panel-pad">
            <PanelHeader icon={Crosshair} title="Quick Actions" sub="Jump into an investigation surface" />
            <div className="space-y-2">
              {quickActions.map((a) => (
                <Link key={a.href} href={a.href} className="lift-row group flex items-center gap-3 rounded-md border border-border bg-elevated/40 px-3 py-2.5 hover:bg-elevated">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-surface">
                    <a.icon className="h-4 w-4 text-accent" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{a.label}</div>
                    <div className="truncate text-[11px] text-muted">{a.desc}</div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Geographic intelligence + offence mix */}
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="card panel-pad xl:col-span-2">
          <PanelHeader
            icon={MapPin}
            title={t("dash.hotspots")}
            sub={`${geo.length} geolocated FIRs · from Cloud Scale`}
            action={<Link href="/maps" className="btn-ghost h-8 py-0 text-xs">{t("dash.full_map")} <ArrowRight className="h-3.5 w-3.5" /></Link>}
          />
          <MapPanel points={geo} height={360} />
        </div>
        <div className="card panel-pad">
          <PanelHeader icon={PieChart} title={t("dash.crime_mix")} sub="Share by category" />
          {byType.length ? (
            <>
              <Donut data={byType} nameKey="crime_type" valueKey="count" />
              <div className="mt-3">
                {byType.slice(0, 5).map((ct, i) => (
                  <div key={ct.crime_type} className="flex items-center justify-between border-t border-border/50 py-1.5 text-xs first:border-t-0 first:pt-0">
                    <span className="flex items-center gap-2 text-subtle">
                      <span className="h-2 w-2 rounded-full" style={{ background: `rgb(var(${["--accent", "--info", "--warning", "--danger", "--success"][i]}))` }} />
                      {ct.crime_type}
                    </span>
                    <span className="font-mono tabular-nums text-muted">{ct.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <EmptyState icon={PieChart} title="No categories yet" hint="Offence breakdown appears once FIRs are on record." />}
        </div>
      </div>

      {/* Investigation velocity — throughput strip */}
      <div className="card panel-pad">
        <PanelHeader icon={Activity} title="Investigation Velocity" sub="Live case throughput across the state · from Cloud Scale" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <VelocityTile label="Open" value={velocity.open} />
          <VelocityTile label="Active" value={velocity.active} tone="warning" />
          <VelocityTile label="Closed" value={velocity.closed} tone="success" />
          <VelocityTile label="Escalated" value={velocity.escalated} tone="danger" />
          <VelocityTile label="Avg closure" value={velocity.avgClosureDays ? `${velocity.avgClosureDays}d` : "—"} />
        </div>
      </div>
    </div>
  );
}

function VelocityTile({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "danger" | "warning" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-fg";
  const edge = tone === "success" ? "bg-success" : tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-border";
  return (
    <div className="lift-row relative overflow-hidden rounded-md border border-border bg-elevated/40 p-3">
      <span aria-hidden className={`absolute inset-x-0 top-0 h-[2px] ${edge}`} />
      <div className="stat-label">{label}</div>
      <div className={`mt-1 font-display text-2xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function ConfidenceBar({ label, v }: { label: string; v: number }) {
  const pct = Math.round(v * 100);
  const tone = pct >= 75 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-danger";
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-subtle">{label}</span>
        <span className="font-mono tabular-nums text-muted">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border/60">
        <div className={`h-full rounded-full transition-[width] duration-500 ease-out ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
