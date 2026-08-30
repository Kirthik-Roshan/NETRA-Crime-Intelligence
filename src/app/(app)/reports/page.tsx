"use client";

import { useEffect, useState } from "react";
import { ReportView, type ReportData } from "@/components/reports/ReportView";
import { fetchCases, fetchCriminals, fetchDashboard } from "@/lib/cloudscale";

// Static export: all report data is baked at build; type switching + print
// happen client-side in ReportView (no runtime server / PDF route).
export default function ReportsPage() {
  const [data, setData] = useState<ReportData>({
    generatedOn: "Loading Cloud Scale…", stats: { totalFirs: 0, activeCases: 0, atLarge: 0, solveRate: 0 },
    byType: [], hotspots: [], topCriminals: [], recentCases: [],
  });
  useEffect(() => {
    Promise.all([fetchDashboard(), fetchCriminals(), fetchCases()]).then(([dashboard, criminals, cases]) => setData({
      generatedOn: new Date().toLocaleString("en-IN"),
      stats: { totalFirs: dashboard.stats.totalFirs, activeCases: dashboard.stats.activeCases, atLarge: dashboard.stats.atLarge, solveRate: dashboard.stats.solveRate },
      byType: dashboard.byType,
      hotspots: dashboard.hotspots,
      topCriminals: [...criminals].sort((a, b) => b.risk_score - a.risk_score).slice(0, 10),
      recentCases: [...cases].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 10),
    })).catch(() => undefined);
  }, []);
  return <ReportView data={data} />;
}
