"use client";
import { useState } from "react";
import { FileText, Eye, Inbox } from "lucide-react";
import { PageHeader, Badge, StatusBadge } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { cn, formatDate, riskBand, severityColor } from "@/lib/utils";
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

      <div className="no-print mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Report type">
        <span className="stat-label mr-1">Report</span>
        {REPORTS.map((r) => (
          <button
            key={r.id}
            onClick={() => setType(r.id)}
            aria-pressed={type === r.id}
            className={cn(
              "chip transition-colors",
              type === r.id
                ? "border-accent/50 bg-accent/10 text-fg"
                : "text-muted hover:border-border hover:bg-elevated hover:text-fg"
            )}
          >
            <FileText className={cn("h-3.5 w-3.5", type === r.id && "text-accent")} /> {r.label}
          </button>
        ))}
      </div>

      <div className="card panel-pad space-y-7">
        <div className="flex flex-wrap items-start justify-between gap-3 break-inside-avoid border-b border-border pb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-fg shadow-[0_6px_16px_-8px_rgb(var(--accent)/0.55)]"><Eye className="h-4 w-4" /></span>
              <span className="stat-label !text-subtle">NETRA · State Crime Records Bureau</span>
            </div>
            <h2 className="mt-3 font-display text-xl font-bold tracking-tight">{REPORTS.find((r) => r.id === type)?.label}</h2>
            <p className="mt-0.5 text-sm text-muted">Karnataka State Police · Generated <span className="tabular-nums">{generatedOn}</span></p>
          </div>
          <Badge tone="accent">CONFIDENTIAL</Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 break-inside-avoid sm:grid-cols-4">
          {[
            ["Total FIRs", stats.totalFirs],
            ["Active Cases", stats.activeCases],
            ["Suspects at large", stats.atLarge],
            ["Solve rate", `${stats.solveRate}%`],
          ].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-border/70 bg-elevated/20 p-3 transition-colors hover:border-border">
              <div className="stat-label">{l}</div>
              <div className="mt-1 font-display text-2xl font-bold leading-none tabular-nums">{v}</div>
            </div>
          ))}
        </div>

        {type === "district" && (
          <ReportSection title="District Crime Distribution" meta={`${hotspots.length} districts`}>
            <table className="w-full min-w-[24rem] text-left text-sm">
              <thead><tr className="text-[11px] uppercase tracking-wider text-muted"><th className="pb-2 font-semibold">District</th><th className="pb-2 text-right font-semibold">FIRs</th><th className="pb-2 text-right font-semibold">Share</th></tr></thead>
              <tbody>
                {hotspots.map((h) => (
                  <tr key={h.district} className="border-t border-border/50 transition-colors hover:bg-elevated/40">
                    <td className="py-2 font-medium">{h.district}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{h.cases}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-muted">{stats.totalFirs ? Math.round((h.cases / stats.totalFirs) * 100) : 0}%</td>
                  </tr>
                ))}
                {hotspots.length === 0 && <EmptyRow span={3}>No district records available.</EmptyRow>}
              </tbody>
            </table>
          </ReportSection>
        )}

        {type === "trend" && (
          <ReportSection title="Crime Type Breakdown" meta={`${byType.length} categories`}>
            <table className="w-full min-w-[24rem] text-left text-sm">
              <thead><tr className="text-[11px] uppercase tracking-wider text-muted"><th className="pb-2 font-semibold">Crime Type</th><th className="pb-2 text-right font-semibold">Count</th></tr></thead>
              <tbody>
                {byType.map((ct) => (
                  <tr key={ct.crime_type} className="border-t border-border/50 transition-colors hover:bg-elevated/40">
                    <td className="py-2 font-medium capitalize">{ct.crime_type}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{ct.count}</td>
                  </tr>
                ))}
                {byType.length === 0 && <EmptyRow span={2}>No crime-type records available.</EmptyRow>}
              </tbody>
            </table>
          </ReportSection>
        )}

        {type === "network" && (
          <ReportSection title="Highest-Risk Individuals" meta={`Top ${topCriminals.length}`}>
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead><tr className="text-[11px] uppercase tracking-wider text-muted"><th className="pb-2 font-semibold">Name</th><th className="pb-2 font-semibold">District</th><th className="pb-2 font-semibold">Category</th><th className="pb-2 text-right font-semibold">Risk</th></tr></thead>
              <tbody>
                {topCriminals.map((c) => (
                  <tr key={c.name} className="border-t border-border/50 transition-colors hover:bg-elevated/40">
                    <td className="py-2 font-medium">{c.name}</td>
                    <td className="py-2 text-muted">{c.home_district}</td>
                    <td className="py-2 capitalize text-muted">{c.crime_category}</td>
                    <td className={cn("py-2 text-right font-mono font-semibold tabular-nums", riskBand(c.risk_score).color)}>{c.risk_score}</td>
                  </tr>
                ))}
                {topCriminals.length === 0 && <EmptyRow span={4}>No individuals on record.</EmptyRow>}
              </tbody>
            </table>
          </ReportSection>
        )}

        <ReportSection title="Recent Cases" meta={`${recentCases.length} latest`}>
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead><tr className="text-[11px] uppercase tracking-wider text-muted"><th className="pb-2 font-semibold">Case</th><th className="pb-2 font-semibold">District</th><th className="pb-2 font-semibold">Priority</th><th className="pb-2 font-semibold">Status</th><th className="pb-2 text-right font-semibold">Updated</th></tr></thead>
            <tbody>
              {recentCases.map((c) => (
                <tr key={c.case_number} className="border-t border-border/50 align-top transition-colors hover:bg-elevated/40">
                  <td className="py-2"><span className="font-medium">{c.title}</span><br /><span className="font-mono text-[10px] tracking-wide text-muted">{c.case_number}</span></td>
                  <td className="py-2 text-muted">{c.district}</td>
                  <td className={cn("py-2 font-medium capitalize", severityColor(c.priority))}>{c.priority}</td>
                  <td className="py-2"><StatusBadge status={c.status} /></td>
                  <td className="py-2 text-right text-xs tabular-nums text-muted">{formatDate(c.updated_at)}</td>
                </tr>
              ))}
              {recentCases.length === 0 && <EmptyRow span={5}>No recent cases available.</EmptyRow>}
            </tbody>
          </table>
        </ReportSection>

        <div className="border-t border-border pt-4 text-xs leading-relaxed text-muted">
          Generated by NETRA AI · Every figure is derived from audited crime records. This document is for authorized law-enforcement use only.
        </div>
      </div>
    </div>
  );
}

function ReportSection({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <div className="mb-2.5 flex items-baseline justify-between gap-4 border-b border-border/60 pb-1.5">
        <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
        {meta && <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted">{meta}</span>}
      </div>
      {/* Wide tables scroll inside the section instead of the page; print gets the full width. */}
      <div className="overflow-x-auto print:overflow-visible">{children}</div>
    </section>
  );
}

function EmptyRow({ span, children }: { span: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={span} className="py-10 text-center">
        <span className="inline-flex items-center gap-2 text-sm text-muted">
          <Inbox className="h-4 w-4 opacity-70" />
          {children}
        </span>
      </td>
    </tr>
  );
}
