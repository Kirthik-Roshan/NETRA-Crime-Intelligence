import { all } from "@/lib/db";
import { dashboardStats, crimeByType, districtHotspots } from "@/lib/queries";
import { ReportView, type ReportData } from "@/components/reports/ReportView";

// Static export: all report data is baked at build; type switching + print
// happen client-side in ReportView (no runtime server / PDF route).
export default function ReportsPage() {
  const data: ReportData = {
    generatedOn: new Date().toLocaleString("en-IN"),
    stats: dashboardStats(),
    byType: crimeByType(),
    hotspots: districtHotspots(),
    topCriminals: all(
      "SELECT name, risk_score, home_district, crime_category FROM criminals ORDER BY risk_score DESC LIMIT 10"
    ),
    recentCases: all(
      "SELECT case_number, title, district, status, priority, updated_at FROM cases ORDER BY updated_at DESC LIMIT 10"
    ),
  };
  return <ReportView data={data} />;
}
