"use client";
import { useState } from "react";
import { FileDown, FileText, Eye, Inbox, Loader2, TrendingUp, Users, MapPin } from "lucide-react";
import { PageHeader, Badge, StatusBadge, Segmented } from "@/components/ui";
import { cn, formatDate, riskBand, severityColor } from "@/lib/utils";
import { useT } from "@/lib/i18n-client";
import { exportConversationPdf } from "@/lib/ai-client";

export interface ReportData {
  generatedOn: string;
  stats: { totalFirs: number; activeCases: number; atLarge: number; solveRate: number };
  byType: { crime_type: string; count: number }[];
  hotspots: { district: string; cases: number }[];
  topCriminals: { name: string; risk_score: number; home_district: string; crime_category: string }[];
  recentCases: { case_number: string; title: string; district: string; status: string; priority: string; updated_at: string }[];
}

const REPORTS = [
  { id: "district", label: "District", icon: MapPin },
  { id: "trend", label: "Trend", icon: TrendingUp },
  { id: "network", label: "Network", icon: Users },
] as const;
type ReportType = (typeof REPORTS)[number]["id"];

const REPORT_TITLE: Record<ReportType, string> = {
  district: "District Crime Report",
  trend: "Crime Trend Report",
  network: "Network Intelligence Report",
};

export function ReportView({ data }: { data: ReportData }) {
  const t = useT();
  const [type, setType] = useState<ReportType>("district");
  const [pdfBusy, setPdfBusy] = useState(false);
  const { stats, byType, hotspots, topCriminals, recentCases, generatedOn } = data;

  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      const label = REPORTS.find((report) => report.id === type)?.label || "Crime Report";
      const detail = type === "district"
        ? hotspots.map((row) => `${row.district}: ${row.cases} FIRs`).join("\n")
        : type === "trend"
          ? byType.map((row) => `${row.crime_type}: ${row.count}`).join("\n")
          : topCriminals.map((row) => `${row.name}: risk ${row.risk_score}, ${row.home_district}, ${row.crime_category}`).join("\n");
      const generated = await exportConversationPdf([
        {
          question: "Executive summary",
          answer: `Total FIRs: ${stats.totalFirs}\nActive cases: ${stats.activeCases}\nSuspects at large: ${stats.atLarge}\nSolve rate: ${stats.solveRate}%`,
        },
        { question: label, answer: detail || "No matching records." },
        {
          question: "Recent cases",
          answer: recentCases.map((row) => `${row.case_number} | ${row.title} | ${row.district} | ${row.status}`).join("\n") || "No recent cases.",
        },
      ], label);
      if (!generated?.pdf) {
        window.print();
        return;
      }
      const binary = atob(generated.pdf);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const url = URL.createObjectURL(new Blob([bytes], { type: generated.mime || "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = generated.filename || "netra-report.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title={t("reports.title")} subtitle={t("reports.subtitle")}>
        <button type="button" onClick={() => { void exportPdf(); }} disabled={pdfBusy} className="btn-ghost">
          {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} {t("reports.branded_pdf")}
        </button>
      </PageHeader>

      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <span className="stat-label">Report type</span>
        <Segmented<ReportType>
          ariaLabel="Report type"
          value={type}
          onChange={setType}
          options={REPORTS.map((r) => ({ value: r.id, label: r.label, icon: r.icon }))}
        />
      </div>

      <div className="card panel-pad space-y-6">
        {/* Branded document header */}
        <div className="flex flex-wrap items-start justify-between gap-3 break-inside-avoid border-b border-border pb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent text-accent-fg"><Eye className="h-4 w-4" /></span>
              <span className="stat-label !text-subtle">NETRA · State Crime Records Bureau</span>
            </div>
            <h2 className="mt-3 font-display text-xl font-bold tracking-[-0.02em]">{REPORT_TITLE[type]}</h2>
            <p className="mt-1 text-sm text-muted">Karnataka State Police · Generated <span className="font-mono tabular-nums">{generatedOn}</span></p>
          </div>
          <Badge tone="accent">CONFIDENTIAL</Badge>
        </div>

        {/* Report KPIs */}
        <div className="grid grid-cols-2 gap-3 break-inside-avoid sm:grid-cols-4">
          {[
            ["Total FIRs", stats.totalFirs],
            ["Active Cases", stats.activeCases],
            ["Suspects at large", stats.atLarge],
            ["Solve rate", `${stats.solveRate}%`],
          ].map(([l, v]) => (
            <div key={l as string} className="rounded-md border border-border bg-elevated/40 p-3">
              <div className="stat-label">{l}</div>
              <div className="mt-1 font-display text-2xl font-bold leading-none tabular-nums">{v}</div>
            </div>
          ))}
        </div>

        {type === "district" && (
          <ReportSection title="District crime distribution" meta={`${hotspots.length} districts`}>
            <table className="w-full min-w-[24rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="pb-2 pr-4">District</th>
                  <th className="pb-2 pr-4 text-right">FIRs</th>
                  <th className="pb-2 text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {hotspots.map((h) => (
                  <tr key={h.district} className="border-t border-border/50 transition-colors hover:bg-elevated/50">
                    <td className="py-2 pr-4 font-medium">{h.district}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{h.cases}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-muted">{stats.totalFirs ? Math.round((h.cases / stats.totalFirs) * 100) : 0}%</td>
                  </tr>
                ))}
                {hotspots.length === 0 && <EmptyRow span={3}>No district records available.</EmptyRow>}
              </tbody>
            </table>
          </ReportSection>
        )}

        {type === "trend" && (
          <ReportSection title="Crime-type breakdown" meta={`${byType.length} categories`}>
            <table className="w-full min-w-[24rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="pb-2 pr-4">Crime type</th>
                  <th className="pb-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {byType.map((ct) => (
                  <tr key={ct.crime_type} className="border-t border-border/50 transition-colors hover:bg-elevated/50">
                    <td className="py-2 pr-4 font-medium capitalize">{ct.crime_type}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{ct.count}</td>
                  </tr>
                ))}
                {byType.length === 0 && <EmptyRow span={2}>No crime-type records available.</EmptyRow>}
              </tbody>
            </table>
          </ReportSection>
        )}

        {type === "network" && (
          <ReportSection title="Highest-risk individuals" meta={`Top ${topCriminals.length}`}>
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">District</th>
                  <th className="pb-2 pr-4">Category</th>
                  <th className="pb-2 text-right">Risk</th>
                </tr>
              </thead>
              <tbody>
                {topCriminals.map((c) => (
                  <tr key={c.name} className="border-t border-border/50 transition-colors hover:bg-elevated/50">
                    <td className="py-2 pr-4 font-medium">{c.name}</td>
                    <td className="py-2 pr-4 text-muted">{c.home_district}</td>
                    <td className="py-2 pr-4 capitalize text-muted">{c.crime_category}</td>
                    <td className={cn("py-2 text-right font-mono font-semibold tabular-nums", riskBand(c.risk_score).color)}>{c.risk_score}</td>
                  </tr>
                ))}
                {topCriminals.length === 0 && <EmptyRow span={4}>No individuals on record.</EmptyRow>}
              </tbody>
            </table>
          </ReportSection>
        )}

        <ReportSection title="Recent cases" meta={`${recentCases.length} latest`}>
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                <th className="pb-2 pr-4">Case</th>
                <th className="pb-2 pr-4">District</th>
                <th className="pb-2 pr-4">Priority</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 text-right">Updated</th>
              </tr>
            </thead>
            <tbody>
              {recentCases.map((c) => (
                <tr key={c.case_number} className="border-t border-border/50 align-top transition-colors hover:bg-elevated/50">
                  <td className="py-2 pr-4"><span className="font-medium">{c.title}</span><br /><span className="font-mono text-[10px] tracking-wide text-muted">{c.case_number}</span></td>
                  <td className="py-2 pr-4 text-muted">{c.district}</td>
                  <td className={cn("py-2 pr-4 font-medium capitalize", severityColor(c.priority))}>{c.priority}</td>
                  <td className="py-2 pr-4"><StatusBadge status={c.status} /></td>
                  <td className="py-2 text-right text-xs tabular-nums text-muted">{formatDate(c.updated_at)}</td>
                </tr>
              ))}
              {recentCases.length === 0 && <EmptyRow span={5}>No recent cases available.</EmptyRow>}
            </tbody>
          </table>
        </ReportSection>

        <div className="border-t border-border pt-4 text-xs leading-relaxed text-muted">
          <FileText className="mr-1.5 inline h-3 w-3 text-accent" />
          Generated by NETRA · Every figure is derived from audited crime records. This document is for authorized law-enforcement use only.
        </div>
      </div>
    </div>
  );
}

function ReportSection({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <div className="mb-2.5 flex items-baseline justify-between gap-4 border-b border-border/60 pb-1.5">
        <h3 className="font-display text-sm font-semibold uppercase tracking-[0.06em] text-fg">{title}</h3>
        {meta && <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted">{meta}</span>}
      </div>
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
