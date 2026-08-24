"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FolderKanban, AlertTriangle, UserSearch, Fingerprint, TrendingUp, Sparkles,
  MapPin, ArrowRight, Flame, Radar, Activity, PieChart, BarChart3,
} from "lucide-react";
import { OfficerFirstName } from "@/components/OfficerName";
import { StatCard, PageHeader, Badge, EmptyState } from "@/components/ui";
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

  return (
    <div className="space-y-6">
      <PageHeader title={<>{t("dash.greeting")}, <OfficerFirstName /></>} subtitle={`${today} · ${t("dash.subtitle")}`}>
        <Link href="/assistant" className="btn-accent">
          <Sparkles className="h-4 w-4" /> {t("dash.ask")}
        </Link>
      </PageHeader>

      {d === null && (
        <div className="chip">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          Loading live data from Cloud Scale…
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t("dash.active_cases")} value={stats.activeCases} sub={`${stats.critical} critical priority`} icon={FolderKanban} tone="accent" />
        <StatCard label={t("dash.critical_alerts")} value={stats.critical} sub="Require immediate review" icon={AlertTriangle} tone="danger" />
        <StatCard label={t("dash.suspects_at_large")} value={stats.atLarge} sub={`of ${stats.totalFirs} FIRs on record`} icon={UserSearch} tone="warning" />
        <StatCard label={t("dash.arrests_30d")} value={stats.arrests30} sub={`${stats.solveRate}% case solve rate`} icon={Fingerprint} tone="success" />
      </div>

      {/* Trend + type */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card panel-pad lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-semibold"><Flame className="h-4 w-4 text-accent" /> Crime Heat Evolution</h2>
              <p className="text-xs text-muted">Incident volume across timescales · Δ vs previous window · from Cloud Scale</p>
            </div>
            <Badge tone="accent"><TrendingUp className="h-3 w-3" /> live</Badge>
          </div>
          {/* Windowed density evolution — 24h → 6mo, anchored to the newest FIR */}
          <div className="mb-4 grid grid-cols-4 gap-2">
            {(heat.length ? heat : [{ key: "24h", label: "24 hours", count: 0, delta: 0 }, { key: "7d", label: "7 days", count: 0, delta: 0 }, { key: "30d", label: "30 days", count: 0, delta: 0 }, { key: "6mo", label: "6 months", count: 0, delta: 0 }]).map((w) => {
              const up = w.delta > 0, flat = w.delta === 0;
              return (
                <div key={w.key} className="rounded-lg border border-border/60 bg-elevated/40 p-3 transition-colors hover:border-border">
                  <div className="stat-label">{w.label}</div>
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
        <div className="card panel-pad">
          <h2 className="mb-1 font-display text-base font-semibold">{t("dash.crime_mix")}</h2>
          <p className="mb-2 text-xs text-muted">Share by category</p>
          {byType.length ? (
            <>
              <Donut data={byType} nameKey="crime_type" valueKey="count" />
              <div className="mt-3 space-y-1.5">
                {byType.slice(0, 5).map((ct, i) => (
                  <div key={ct.crime_type} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-subtle">
                      <span className="h-2 w-2 rounded-full" style={{ background: `rgb(var(${["--accent", "--info", "--warning", "--danger", "--success"][i]}))` }} />
                      {ct.crime_type}
                    </span>
                    <span className="font-mono text-muted">{ct.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <EmptyState icon={PieChart} title="No categories yet" hint="Offence breakdown appears once FIRs are on record." />}
        </div>
      </div>

      {/* Investigation velocity + intelligence confidence — derived from Cloud Scale records */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card panel-pad lg:col-span-2">
          <h2 className="mb-1 flex items-center gap-2 font-display text-base font-semibold"><Activity className="h-4 w-4 text-accent" /> Investigation Velocity</h2>
          <p className="mb-3 text-xs text-muted">Live case throughput across the state · from Cloud Scale</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <VelocityTile label="Open" value={velocity.open} />
            <VelocityTile label="Active" value={velocity.active} />
            <VelocityTile label="Closed" value={velocity.closed} tone="success" />
            <VelocityTile label="Escalated" value={velocity.escalated} tone="danger" />
            <VelocityTile label="Avg closure" value={velocity.avgClosureDays ? `${velocity.avgClosureDays}d` : "—"} />
          </div>
        </div>
        <div className="card panel-pad">
          <h2 className="mb-1 flex items-center gap-2 font-display text-base font-semibold"><Radar className="h-4 w-4 text-accent" /> Intelligence Confidence</h2>
          <p className="mb-3 text-xs text-muted">Overall <span className="font-mono text-accent">{Math.round(confidence.overall * 100)}%</span> · from record completeness & linkage</p>
          <ConfidenceBar label="Data quality" v={confidence.dataQuality} />
          <ConfidenceBar label="Case linkage" v={confidence.caseLinkage} />
          <ConfidenceBar label="Pattern signal" v={confidence.patternSignal} />
          <ConfidenceBar label="Extraction readiness" v={confidence.extractionReadiness} />
        </div>
      </div>

      {/* Data-derived insights */}
      {alerts.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Radar className="h-4 w-4 text-accent" />
            <h2 className="font-display text-base font-semibold">{t("dash.ai_briefings")}</h2>
            <Badge tone="accent">{alerts.length}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {alerts.map((a, i) => (
              <div key={i} className="card panel-pad flex gap-3 animate-fade-in">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-warning/10">
                  <a.icon className="h-5 w-5 text-warning" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-semibold">{a.title}</span>
                  <p className="mt-0.5 text-sm text-muted">{a.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Map + hotspots */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card panel-pad lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <MapPin className="h-4 w-4 text-accent" /> {t("dash.hotspots")}
              </h2>
              <p className="text-xs text-muted">{geo.length} geolocated FIRs · from Cloud Scale</p>
            </div>
            <Link href="/maps" className="btn-ghost h-8 py-0 text-xs">
              {t("dash.full_map")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <MapPanel points={geo} height={360} />
        </div>
        <div className="card panel-pad">
          <h2 className="mb-1 font-display text-base font-semibold">{t("dash.district_load")}</h2>
          <p className="mb-2 text-xs text-muted">FIRs by district</p>
          {hotspots.length ? <BarSeries data={hotspots.slice(0, 8)} x="district" y="cases" color="warning" height={300} /> : <EmptyState icon={BarChart3} title="No district data yet" hint="District load ranks appear once FIRs are geotagged." />}
        </div>
      </div>
    </div>
  );
}

function VelocityTile({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-fg";
  return (
    <div className="rounded-lg border border-border/60 bg-elevated/40 p-3 transition-colors hover:border-border">
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
