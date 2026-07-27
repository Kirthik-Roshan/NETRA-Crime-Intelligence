"use client";
import { useState } from "react";
import { FileText, Eye } from "lucide-react";
import { PageHeader, Badge } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { formatDate } from "@/lib/utils";
import { useT } from "@/lib/i18n-client";

export interface ReportData {
  generatedOn: string;
  stats: { totalFirs: number; activeCases: number; atLarge: number; solveRate: number };
  byType: { crime_type: string; count: number }[];
  hotspots: { district: string; cases: number }[];
  topCriminals: { name: string; risk_score: number; home_district: string; crime_category: string }[];
  recentCases: { case_number: string; title: string; district: string; status: string; priority: string; updated_at: string }[];
}

const REPORTS = [
  { id: "district", label: "District Crime Report" },
  { id: "trend", label: "Crime Trend Report" },
  { id: "network", label: "Network Intelligence Report" },
] as const;

type ReportType = (typeof REPORTS)[number]["id"];

export function ReportView({ data }: { data: ReportData }) {
  const t = useT();
  const [type, setType] = useState<ReportType>("district");
  const { stats, byType, hotspots, topCriminals, recentCases, generatedOn } = data;

  return (
    <div>
      <PageHeader title={t("reports.title")} subtitle={t("reports.subtitle")}>
        <PrintButton label={t("reports.branded_pdf")} />
      </PageHeader>

      <div className="mb-5 flex flex-wrap gap-2 no-print">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            onClick={() => setType(r.id)}
            className={`chip ${type === r.id ? "border-accent/50 text-fg" : "hover:text-fg"}`}
          >
            <FileText className="h-3.5 w-3.5" /> {r.label}
          </button>
        ))}
      </div>

      <div className="card panel-pad space-y-6">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg"><Eye className="h-4 w-4" /></span>
              <span className="font-display text-lg font-bold">NETRA · State Crime Records Bureau</span>
            </div>
            <h2 className="mt-3 font-display text-xl font-bold">{REPORTS.find((r) => r.id === type)?.label}</h2>
            <p className="text-sm text-muted">Karnataka State Police · Generated {generatedOn}</p>
          </div>
          <Badge tone="accent">CONFIDENTIAL</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Total FIRs", stats.totalFirs],
            ["Active Cases", stats.activeCases],
            ["Suspects at large", stats.atLarge],
            ["Solve rate", `${stats.solveRate}%`],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-border p-3">
              <div className="stat-label">{l}</div>
              <div className="font-display text-2xl font-bold">{v}</div>
            </div>
          ))}
        </div>

        {type === "district" && (
          <ReportSection title="District Crime Distribution">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="py-2">District</th><th className="py-2 text-right">FIRs</th><th className="py-2 text-right">Share</th></tr></thead>
              <tbody>
                {hotspots.map((h) => (
                  <tr key={h.district} className="border-t border-border/50">
                    <td className="py-1.5">{h.district}</td>
                    <td className="py-1.5 text-right font-mono">{h.cases}</td>
                    <td className="py-1.5 text-right font-mono text-muted">{Math.round((h.cases / stats.totalFirs) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ReportSection>
        )}

        {type === "trend" && (
          <ReportSection title="Crime Type Breakdown">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="py-2">Crime Type</th><th className="py-2 text-right">Count</th></tr></thead>
              <tbody>
                {byType.map((ct) => (
                  <tr key={ct.crime_type} className="border-t border-border/50">
                    <td className="py-1.5">{ct.crime_type}</td>
                    <td className="py-1.5 text-right font-mono">{ct.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ReportSection>
        )}

        {type === "network" && (
          <ReportSection title="Highest-Risk Individuals">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="py-2">Name</th><th className="py-2">District</th><th className="py-2">Category</th><th className="py-2 text-right">Risk</th></tr></thead>
              <tbody>
                {topCriminals.map((c) => (
                  <tr key={c.name} className="border-t border-border/50">
                    <td className="py-1.5 font-medium">{c.name}</td>
                    <td className="py-1.5 text-muted">{c.home_district}</td>
                    <td className="py-1.5 text-muted">{c.crime_category}</td>
                    <td className="py-1.5 text-right font-mono">{c.risk_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ReportSection>
        )}

        <ReportSection title="Recent Cases">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="py-2">Case</th><th className="py-2">District</th><th className="py-2">Priority</th><th className="py-2">Status</th><th className="py-2 text-right">Updated</th></tr></thead>
            <tbody>
              {recentCases.map((c) => (
                <tr key={c.case_number} className="border-t border-border/50">
                  <td className="py-1.5"><span className="font-medium">{c.title}</span><br /><span className="font-mono text-[10px] text-muted">{c.case_number}</span></td>
                  <td className="py-1.5 text-muted">{c.district}</td>
                  <td className="py-1.5 capitalize">{c.priority}</td>
                  <td className="py-1.5 capitalize">{c.status}</td>
                  <td className="py-1.5 text-right text-xs text-muted">{formatDate(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportSection>

        <div className="border-t border-border pt-3 text-xs text-muted">
          Generated by NETRA AI · Every figure is derived from audited crime records. This document is for authorized law-enforcement use only.
        </div>
      </div>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 font-display text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}
