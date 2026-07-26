import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { all } from "@/lib/db";
import { dashboardStats, crimeByType, districtHotspots } from "@/lib/queries";
import { brandedReportHtml, htmlToPdf } from "@/lib/smartbrowz";

export const dynamic = "force-dynamic";

const TITLES: Record<string, string> = {
  district: "District Crime Report",
  trend: "Crime Trend Report",
  network: "Network Intelligence Report",
};

/**
 * Server-generated branded report.
 *   ?format=pdf  → Catalyst SmartBrowz PDF in production; HTML fallback locally.
 *   (default)    → branded, print-optimized HTML (browser Save-as-PDF).
 */
export async function GET(req: Request, { params }: { params: { type: string } }) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = TITLES[params.type] ? params.type : "district";
  const stats = dashboardStats();
  const generatedOn = new Date().toLocaleString("en-IN");

  const summary: [string, string | number][] = [
    ["Total FIRs", stats.totalFirs],
    ["Active Cases", stats.activeCases],
    ["Suspects at large", stats.atLarge],
    ["Solve rate", `${stats.solveRate}%`],
  ];

  const sections: { heading: string; columns: string[]; rows: (string | number)[][] }[] = [];

  if (type === "district") {
    const hotspots = districtHotspots();
    sections.push({
      heading: "District Crime Distribution",
      columns: ["District", "FIRs", "Share"],
      rows: hotspots.map((h) => [h.district, h.cases, `${Math.round((h.cases / stats.totalFirs) * 100)}%`]),
    });
  } else if (type === "trend") {
    const byType = crimeByType();
    sections.push({
      heading: "Crime Type Breakdown",
      columns: ["Crime Type", "Count"],
      rows: byType.map((t) => [t.crime_type, t.count]),
    });
  } else if (type === "network") {
    const top = all<{ name: string; risk_score: number; home_district: string; crime_category: string }>(
      "SELECT name, risk_score, home_district, crime_category FROM criminals ORDER BY risk_score DESC LIMIT 15"
    );
    sections.push({
      heading: "Highest-Risk Individuals",
      columns: ["Name", "District", "Category", "Risk"],
      rows: top.map((c) => [c.name, c.home_district, c.crime_category, c.risk_score]),
    });
  }

  const recent = all<{ case_number: string; title: string; district: string; status: string; priority: string }>(
    "SELECT case_number, title, district, status, priority FROM cases ORDER BY updated_at DESC LIMIT 12"
  );
  sections.push({
    heading: "Recent Cases",
    columns: ["Case No", "Title", "District", "Priority", "Status"],
    rows: recent.map((c) => [c.case_number, c.title, c.district, c.priority, c.status.replace(/_/g, " ")]),
  });

  const html = brandedReportHtml({ title: TITLES[type], generatedOn, summary, sections });
  const wantPdf = new URL(req.url).searchParams.get("format") === "pdf";

  audit({ user, action: "REPORT_EXPORTED", entity: "report", entity_id: type, detail: wantPdf ? "pdf" : "html" });

  if (wantPdf) {
    const pdf = await htmlToPdf(html); // non-null only when SmartBrowz is configured (production)
    if (pdf) {
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="netra-${type}-report.pdf"`,
        },
      });
    }
    // Local fallback: serve the same branded HTML with an auto-print trigger.
    return new NextResponse(html.replace("</body>", "<script>window.onload=()=>window.print()</script></body>"), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
