import { all } from "@/lib/db";
import { crimeTrend, crimeByType, districtHotspots, complainantOccupations, victimGenderSplit } from "@/lib/queries";
import { PageHeader, StatCard, Badge } from "@/components/ui";
import { TrendLine, BarSeries, Donut } from "@/components/charts";
import Link from "next/link";
import { BarChart3, TrendingUp, MapPin, Layers, Users, Database } from "lucide-react";
import { getT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default function AnalyticsPage() {
  const t = getT();
  const trend = crimeTrend(12);
  const byType = crimeByType();
  const hotspots = districtHotspots();
  const bySeverity = all<{ severity: string; count: number }>("SELECT severity, COUNT(*) count FROM firs GROUP BY severity ORDER BY count DESC");
  const byStatus = all<{ status: string; count: number }>("SELECT status, COUNT(*) count FROM firs GROUP BY status");
  const byHour = all<{ hour: string; count: number }>("SELECT substr(occurred_at,12,2) AS hour, COUNT(*) count FROM firs GROUP BY hour ORDER BY hour");
  const occupations = complainantOccupations();
  const victimGender = victimGenderSplit();

  const totalFirs = byType.reduce((a, b) => a + b.count, 0);
  const criticalShare = Math.round(((bySeverity.find((s) => s.severity === "critical")?.count || 0) / totalFirs) * 100);

  return (
    <div className="space-y-6">
      <PageHeader title={t("analytics.title")} subtitle={t("analytics.subtitle")}>
        <Link href="/database?table=firs" className="btn-ghost text-sm">
          <Database className="h-4 w-4" /> Open in database
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total FIRs" value={totalFirs} icon={BarChart3} tone="accent" />
        <StatCard label="Crime Types" value={byType.length} icon={Layers} />
        <StatCard label="Districts" value={hotspots.length} icon={MapPin} tone="warning" />
        <StatCard label="Critical share" value={`${criticalShare}%`} icon={TrendingUp} tone="danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card panel-pad">
          <h2 className="mb-3 font-display text-base font-semibold">Monthly Trend</h2>
          <TrendLine data={trend} />
        </div>
        <div className="card panel-pad">
          <h2 className="mb-3 font-display text-base font-semibold">Crime by Type</h2>
          <BarSeries data={byType} x="crime_type" y="count" color="info" height={260} />
        </div>
        <div className="card panel-pad">
          <h2 className="mb-3 font-display text-base font-semibold">District Distribution</h2>
          <BarSeries data={hotspots} x="district" y="cases" color="warning" height={260} />
        </div>
        <div className="card panel-pad">
          <h2 className="mb-3 font-display text-base font-semibold">Time-of-Day Pattern</h2>
          <BarSeries data={byHour} x="hour" y="count" color="accent" height={260} />
        </div>
        <div className="card panel-pad">
          <h2 className="mb-3 font-display text-base font-semibold">Severity Split</h2>
          <Donut data={bySeverity} nameKey="severity" valueKey="count" />
        </div>
        <div className="card panel-pad">
          <h2 className="mb-3 font-display text-base font-semibold">Investigation Status</h2>
          <Donut data={byStatus} nameKey="status" valueKey="count" />
        </div>
      </div>

      {/* Socio-demographic insights — official ComplainantDetails / Victim lookups */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" />
          <h2 className="font-display text-base font-semibold">{t("analytics.socio")}</h2>
          <Badge tone="accent">official SCRB lookups</Badge>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card panel-pad">
            <h3 className="mb-1 text-sm font-semibold">Complainants by Occupation</h3>
            <p className="mb-2 text-xs text-muted">Who reports crime — from ComplainantDetails × OccupationMaster</p>
            <BarSeries data={occupations} x="occupation" y="count" color="info" height={260} />
          </div>
          <div className="card panel-pad">
            <h3 className="mb-1 text-sm font-semibold">Victims by Gender</h3>
            <p className="mb-2 text-xs text-muted">From the official Victim table (GenderID lookup)</p>
            <Donut data={victimGender} nameKey="gender" valueKey="count" />
          </div>
        </div>
      </div>
    </div>
  );
}
