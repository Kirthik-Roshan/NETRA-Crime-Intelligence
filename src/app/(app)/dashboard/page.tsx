import Link from "next/link";
import {
  FolderKanban, AlertTriangle, UserSearch, Fingerprint, TrendingUp, Sparkles,
  MapPin, Activity, ArrowRight, Flame, Network, Radar,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import {
  dashboardStats, crimeTrend, crimeByType, districtHotspots, aiAlerts, recentActivity, firGeoPoints,
} from "@/lib/queries";
import { StatCard, PageHeader, Badge } from "@/components/ui";
import { TrendLine, BarSeries, Donut } from "@/components/charts";
import { MapPanel } from "@/components/maps/MapPanel";
import { timeAgo } from "@/lib/utils";
import { getT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

const ALERT_ICON: Record<string, typeof Flame> = {
  repeat_offender: UserSearch,
  hotspot: Flame,
  gang: Network,
  spike: TrendingUp,
};

export default function DashboardPage() {
  const user = getSession()!;
  const t = getT();

  console.time("dashboardStats");
  const stats = dashboardStats();
  console.timeEnd("dashboardStats");

  console.time("crimeTrend");
  const trend = crimeTrend(12);
  console.timeEnd("crimeTrend");

  console.time("crimeByType");
  const byType = crimeByType();
  console.timeEnd("crimeByType");

  console.time("districtHotspots");
  const hotspots = districtHotspots();
  console.timeEnd("districtHotspots");

  console.time("aiAlerts");
  const alerts = aiAlerts();
  console.timeEnd("aiAlerts");

  console.time("recentActivity");
  const activity = recentActivity(8);
  console.timeEnd("recentActivity");

  console.time("firGeoPoints");
  const geo = firGeoPoints();
  console.timeEnd("firGeoPoints");

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return (
    <div className="space-y-6">
      <PageHeader title={`${t("dash.greeting")}, ${user.full_name.split(" ")[0]}`} subtitle={`${today} · ${t("dash.subtitle")}`}>
        <Link href="/assistant" className="btn-accent">
          <Sparkles className="h-4 w-4" /> {t("dash.ask")}
        </Link>
      </PageHeader>

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
              <h2 className="font-display text-base font-semibold">{t("dash.crime_trends")}</h2>
              <p className="text-xs text-muted">FIRs registered per month · last 12 months</p>
            </div>
            <Badge tone="accent"><TrendingUp className="h-3 w-3" /> live</Badge>
          </div>
          <TrendLine data={trend} />
        </div>
        <div className="card panel-pad">
          <h2 className="mb-1 font-display text-base font-semibold">{t("dash.crime_mix")}</h2>
          <p className="mb-2 text-xs text-muted">Share by category</p>
          <Donut data={byType} nameKey="crime_type" valueKey="count" />
          <div className="mt-3 space-y-1.5">
            {byType.slice(0, 5).map((t, i) => (
              <div key={t.crime_type} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-subtle">
                  <span className="h-2 w-2 rounded-full" style={{ background: `rgb(var(${["--accent", "--info", "--warning", "--danger", "--success"][i]}))` }} />
                  {t.crime_type}
                </span>
                <span className="font-mono text-muted">{t.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* AI alerts */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Radar className="h-4 w-4 text-accent" />
          <h2 className="font-display text-base font-semibold">{t("dash.ai_briefings")}</h2>
          <Badge tone="accent">{alerts.length} new</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {alerts.map((a, i) => {
            const Icon = ALERT_ICON[a.kind] || Sparkles;
            const high = a.severity === "high";
            return (
              <div key={i} className="card panel-pad flex gap-3 animate-fade-in">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${high ? "bg-danger/10" : "bg-warning/10"}`}>
                  <Icon className={`h-5 w-5 ${high ? "text-danger" : "text-warning"}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{a.title}</span>
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-accent">
                      <Sparkles className="h-3 w-3" /> AI
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{a.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Map + hotspots */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card panel-pad lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <MapPin className="h-4 w-4 text-accent" /> {t("dash.hotspots")}
              </h2>
              <p className="text-xs text-muted">{geo.length} geolocated FIRs · click a marker to inspect</p>
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
          <BarSeries data={hotspots.slice(0, 8)} x="district" y="cases" color="warning" height={300} />
        </div>
      </div>

      {/* Recent activity */}
      <div className="card panel-pad">
        <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
          <Activity className="h-4 w-4 text-accent" /> {t("dash.recent_activity")}
        </h2>
        <div className="space-y-1">
          {activity.map((a, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border/50 py-2 text-sm last:border-0">
              <span className="chip font-mono text-[10px]">{a.action}</span>
              <span className="text-subtle capitalize">{a.role?.replace(/_/g, " ")}</span>
              {a.ai_model && <Badge tone="accent"><Sparkles className="h-2.5 w-2.5" /> {a.ai_model}</Badge>}
              <span className="ml-auto text-xs text-muted">{timeAgo(a.ts)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
