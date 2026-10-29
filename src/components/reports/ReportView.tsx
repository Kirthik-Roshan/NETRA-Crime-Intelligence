"use client";
import { UiText, useUiText } from '@/components/UiText';

import { useMemo, useState } from "react";
import { FileDown, FileText, Eye, Inbox, Loader2, TrendingUp, Users, MapPin, Download, Printer, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { PageHeader, Badge, StatusBadge, Segmented } from "@/components/ui";
import { cn, formatDate, riskBand, severityColor } from "@/lib/utils";
import { useT } from "@/lib/i18n-client";
import { exportConversationPdf } from "@/lib/ai-client";
import Link from "@/components/AppLink";
import { presentReport } from '@/lib/report-export';
import { useReportPrint } from '@/lib/use-report-print';
import { Emblem } from '@/components/Emblem';

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

export function ReportView({ data, loading = false, onRefresh }: { data: ReportData; loading?: boolean; onRefresh?: () => void | Promise<void> }) {
  const ui = useUiText();
  const t = useT();
  const [type, setType] = useState<ReportType>("district");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState('');
  const [district, setDistrict] = useState("all");
  const [query, setQuery] = useState("");
  const [includeCases, setIncludeCases] = useState(true);
  const [classification, setClassification] = useState("CONFIDENTIAL");
  const { stats, byType, hotspots, topCriminals, recentCases, generatedOn } = data;
  const districts = useMemo(() => [...new Set([...hotspots.map((row) => row.district), ...recentCases.map((row) => row.district)])].filter(Boolean).sort(), [hotspots, recentCases]);
  const scopedHotspots = district === "all" ? hotspots : hotspots.filter((row) => row.district === district);
  const scopedCriminals = district === "all" ? topCriminals : topCriminals.filter((row) => row.home_district === district);
  const scopedCases = recentCases.filter((row) => (district === "all" || row.district === district) && (!query.trim() || [row.case_number, row.title, row.status, row.priority].some((value) => value.toLowerCase().includes(query.trim().toLowerCase()))));

  const printReport = () => exportPdf(true);

  const exportPdf = async (preview = false) => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setExportMessage('');
    try {
      const label = REPORTS.find((report) => report.id === type)?.label || "Crime Report";
      const generated = await exportConversationPdf([
        {
          question: "Executive summary",
          answer: `Total FIRs: ${stats.totalFirs}\nActive cases: ${stats.activeCases}\nAccused without an arrest record: ${stats.atLarge}\nSolve rate: ${stats.solveRate}%`,
          table: { columns: ['Metric', 'Recorded value'], rows: [['Total FIRs', stats.totalFirs], ['Active cases', stats.activeCases], ['Without arrest record', stats.atLarge], ['Solve rate', `${stats.solveRate}%`]] },
        },
        { question: label, answer: `Scope: ${district === 'all' ? 'All recorded districts' : district}. Figures from the current Cloud Scale report preview.`, table: type === 'district'
          ? { columns: ['District', 'FIRs', 'Share of total'], rows: scopedHotspots.map(row => [row.district, row.cases, `${stats.totalFirs ? Math.round(row.cases / stats.totalFirs * 100) : 0}%`]) }
          : type === 'trend' ? { columns: ['Offence', 'Count'], rows: byType.map(row => [row.crime_type, row.count]) }
          : { columns: ['Name', 'District', 'Category', 'Derived risk index'], rows: scopedCriminals.map(row => [row.name, row.home_district, row.crime_category, row.risk_score]) } },
        {
          question: "Recent cases",
          answer: includeCases ? `${scopedCases.length} cases included in the current preview.` : "Case appendix excluded by report configuration.",
          table: includeCases ? { columns: ['Case', 'Title', 'District', 'Priority', 'Status'], rows: scopedCases.map(row => [row.case_number, row.title, row.district, row.priority, row.status]) } : undefined,
        },
      ], REPORT_TITLE[type], preview);
      await presentReport(generated);
      setExportMessage(generated.warning || (generated.library_id ? 'PDF saved in Saved reports.' : 'Branded report prepared for printing.'));
    } catch (cause) {
      setExportMessage(cause instanceof Error ? cause.message : 'Report export failed. Please retry.');
    } finally {
      setPdfBusy(false);
    }
  };
  useReportPrint(() => exportPdf(true));

  const exportCsv = () => {
    const rows = scopedCases.map((row) => [row.case_number, row.title, row.district, row.priority, row.status, row.updated_at]);
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [["Case", "Title", "District", "Priority", "Status", "Updated"], ...rows].map((row) => row.map(quote).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `netra-${type}-${district}-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title={t("reports.title")} subtitle={t("reports.subtitle")}>
        <Link href="/investigations" className="btn-ghost"><FileText className="h-4 w-4" /><UiText text={"Investigation briefs"} /></Link>
        <button type="button" onClick={() => { void onRefresh?.(); }} disabled={loading} className="btn-ghost" title={ui("Regenerate from current Cloud Scale records")}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}<UiText text={" Refresh data"} /></button>
        <button type="button" onClick={() => { void exportPdf(); }} disabled={pdfBusy} className="btn-accent">
          {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} {t("reports.branded_pdf")}
        </button>
      </PageHeader>
      {exportMessage && <p role="status" className="mb-3 text-sm text-muted"><UiText text={exportMessage} /></p>}

      <div className="report-controls no-print mb-4 flex flex-wrap items-center gap-3">
        <span className="stat-label"><UiText text={"Report type"} /></span>
        <Segmented<ReportType>
          ariaLabel="Report type"
          value={type}
          onChange={setType}
          options={REPORTS.map((r) => ({ value: r.id, label: r.label, icon: r.icon }))}
        />
      </div>

      <section className="card panel-pad no-print mb-4">
        <div className="mb-3 flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-accent" /><div><h2 className="font-display text-sm font-semibold"><UiText text={"Report builder"} /></h2><p className="text-xs text-muted"><UiText text={"Scope the live preview before exporting an official copy."} /></p></div></div>
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[200px_minmax(0,1fr)_170px_auto] [&>label]:min-w-0">
          <label><span className="stat-label mb-1.5 block"><UiText text={"District scope"} /></span><select value={district} onChange={(event) => setDistrict(event.target.value)} className="input h-9 text-xs"><option value="all"><UiText text={"All districts"} /></option>{districts.map((name) => <option key={name} value={name}><UiText text={name} /></option>)}</select></label>
          <label><span className="stat-label mb-1.5 block"><UiText text={"Case filter"} /></span><span className="relative block"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="input h-9 pl-8 text-xs" placeholder={ui("Case, offence, priority, status")} /></span></label>
          <label><span className="stat-label mb-1.5 block"><UiText text={"Classification"} /></span><select value={classification} onChange={(event) => setClassification(event.target.value)} className="input h-9 text-xs"><option value="CONFIDENTIAL"><UiText text={"CONFIDENTIAL"} /></option><option value="RESTRICTED"><UiText text={"RESTRICTED"} /></option><option value="INTERNAL"><UiText text={"INTERNAL"} /></option></select></label>
          <label className="flex items-end"><button type="button" role="switch" aria-checked={includeCases} onClick={() => setIncludeCases((value) => !value)} className="btn-ghost h-9 w-full"><span className={`h-2 w-2 rounded-full ${includeCases ? "bg-success" : "bg-muted"}`} /><UiText text={" Case appendix"} /></button></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3"><span className="text-xs text-muted"><UiText text={"Preview contains "} /><UiText text={scopedCases.length} /><UiText text={" cases, "} /><UiText text={scopedHotspots.length} /><UiText text={" district rows, and "} /><UiText text={scopedCriminals.length} /><UiText text={" priority profiles."} /></span><div className="flex gap-2"><button type="button" onClick={exportCsv} disabled={!scopedCases.length} className="btn-ghost h-8"><Download className="h-3.5 w-3.5" /><UiText text={" CSV"} /></button><button type="button" onClick={() => { void printReport(); }} className="btn-ghost h-8"><Printer className="h-3.5 w-3.5" /><UiText text={" Print preview"} /></button></div></div>
      </section>

      <div className="report-document card card-static panel-pad space-y-6">
        {/* Branded document header */}
        <div className="report-masthead flex flex-wrap items-start justify-between gap-3 break-inside-avoid border-b border-border pb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Emblem size={64} glass={false} />
              <div><div className="report-organization font-display text-base font-bold text-fg"><UiText text={"Karnataka State Police"} /></div><span className="stat-label !text-subtle"><UiText text={"NETRA · State Crime Records Bureau"} /></span></div>
            </div>
            <h2 className="mt-3 font-display text-xl font-bold tracking-[-0.02em]"><UiText text={REPORT_TITLE[type]} /></h2>
            <p className="mt-1 text-sm text-muted"><UiText text={"Karnataka State Police · Generated "} /><span className="font-mono tabular-nums"><UiText text={generatedOn} /></span></p>
          </div>
          <Badge tone={classification === "CONFIDENTIAL" ? "danger" : "accent"}><UiText text={classification} /></Badge>
        </div>

        {/* Report KPIs */}
        <div className="report-kpis grid grid-cols-2 gap-3 break-inside-avoid sm:grid-cols-4">
          {[
            ["Total FIRs", stats.totalFirs],
            ["Active Cases", stats.activeCases],
            ["Without arrest record", stats.atLarge],
            ["Solve rate", `${stats.solveRate}%`],
          ].map(([l, v], index) => (
            <div key={l as string} className="report-kpi rounded-md border border-border bg-elevated/40 p-3">
              <div className="stat-label flex items-center gap-2"><span aria-hidden>{index === 0 ? <FileText className="h-4 w-4 text-accent" /> : index === 1 ? <TrendingUp className="h-4 w-4 text-info" /> : index === 2 ? <Users className="h-4 w-4 text-warning" /> : <Eye className="h-4 w-4 text-success" />}</span><UiText text={l} /></div>
              <div className="mt-1 font-display text-2xl font-bold leading-none tabular-nums"><UiText text={v} /></div>
            </div>
          ))}
        </div>

        {type === "district" && (
          <ReportSection title={ui("District crime distribution")} meta={`${scopedHotspots.length} districts`}>
            <table className="w-full min-w-[24rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="pb-2 pr-4"><UiText text={"District"} /></th>
                  <th className="pb-2 pr-4 text-right"><UiText text={"FIRs"} /></th>
                  <th className="pb-2 text-right"><UiText text={"Share"} /></th>
                </tr>
              </thead>
              <tbody>
                {scopedHotspots.map((h) => (
                  <tr key={h.district} className="border-t border-border/50 transition-colors hover:bg-elevated/50">
                    <td className="py-2 pr-4 font-medium"><UiText text={h.district} /></td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums"><UiText text={h.cases} /></td>
                    <td className="py-2 text-right font-mono tabular-nums text-muted"><UiText text={stats.totalFirs ? Math.round((h.cases / stats.totalFirs) * 100) : 0} />%</td>
                  </tr>
                ))}
                {scopedHotspots.length === 0 && <EmptyRow span={3}><UiText text={"No district records available."} /></EmptyRow>}
              </tbody>
            </table>
          </ReportSection>
        )}

        {type === "trend" && (
          <ReportSection title={ui("Crime-type breakdown")} meta={`${byType.length} categories`}>
            <table className="w-full min-w-[24rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="pb-2 pr-4"><UiText text={"Crime type"} /></th>
                  <th className="pb-2 text-right"><UiText text={"Count"} /></th>
                </tr>
              </thead>
              <tbody>
                {byType.map((ct) => (
                  <tr key={ct.crime_type} className="border-t border-border/50 transition-colors hover:bg-elevated/50">
                    <td className="py-2 pr-4 font-medium capitalize"><UiText text={ct.crime_type} /></td>
                    <td className="py-2 text-right font-mono tabular-nums"><UiText text={ct.count} /></td>
                  </tr>
                ))}
                {byType.length === 0 && <EmptyRow span={2}><UiText text={"No crime-type records available."} /></EmptyRow>}
              </tbody>
            </table>
          </ReportSection>
        )}

        {type === "network" && (
          <ReportSection title={ui("Highest-risk individuals")} meta={`Top ${scopedCriminals.length}`}>
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="pb-2 pr-4"><UiText text={"Name"} /></th>
                  <th className="pb-2 pr-4"><UiText text={"District"} /></th>
                  <th className="pb-2 pr-4"><UiText text={"Category"} /></th>
                  <th className="pb-2 text-right"><UiText text={"Risk"} /></th>
                </tr>
              </thead>
              <tbody>
                {scopedCriminals.map((c) => (
                  <tr key={c.name} className="border-t border-border/50 transition-colors hover:bg-elevated/50">
                    <td className="py-2 pr-4 font-medium"><UiText text={c.name} /></td>
                    <td className="py-2 pr-4 text-muted"><UiText text={c.home_district} /></td>
                    <td className="py-2 pr-4 capitalize text-muted"><UiText text={c.crime_category} /></td>
                    <td className={cn("py-2 text-right font-mono font-semibold tabular-nums", riskBand(c.risk_score).color)}><UiText text={c.risk_score} /></td>
                  </tr>
                ))}
                {scopedCriminals.length === 0 && <EmptyRow span={4}><UiText text={"No individuals on record."} /></EmptyRow>}
              </tbody>
            </table>
          </ReportSection>
        )}

        {includeCases && <ReportSection title={ui("Recent cases")} meta={`${scopedCases.length} included`}>
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                <th className="pb-2 pr-4"><UiText text={"Case"} /></th>
                <th className="pb-2 pr-4"><UiText text={"District"} /></th>
                <th className="pb-2 pr-4"><UiText text={"Priority"} /></th>
                <th className="pb-2 pr-4"><UiText text={"Status"} /></th>
                <th className="pb-2 text-right"><UiText text={"Updated"} /></th>
              </tr>
            </thead>
            <tbody>
              {scopedCases.map((c) => (
                <tr key={c.case_number} className="border-t border-border/50 align-top transition-colors hover:bg-elevated/50">
                  <td className="py-2 pr-4"><span className="font-medium"><UiText text={c.title} /></span><br /><span className="font-mono text-[10px] tracking-wide text-muted"><UiText text={c.case_number} /></span></td>
                  <td className="py-2 pr-4 text-muted"><UiText text={c.district} /></td>
                  <td className={cn("py-2 pr-4 font-medium capitalize", severityColor(c.priority))}><UiText text={c.priority} /></td>
                  <td className="py-2 pr-4"><StatusBadge status={c.status} /></td>
                  <td className="py-2 text-right text-xs tabular-nums text-muted">{formatDate(c.updated_at)}</td>
                </tr>
              ))}
              {scopedCases.length === 0 && <EmptyRow span={5}><UiText text={"No recent cases match this report scope."} /></EmptyRow>}
            </tbody>
          </table>
        </ReportSection>}

        <div className="border-t border-border pt-4 text-xs leading-relaxed text-muted">
          <FileText className="mr-1.5 inline h-3 w-3 text-accent" /><UiText text={"Generated by NETRA · Every figure is derived from audited crime records. This document is for authorized law-enforcement use only."} /></div>
      </div>
    </div>
  );
}

function ReportSection({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="report-section break-inside-avoid">
      <div className="mb-2.5 flex items-baseline justify-between gap-4 border-b border-border/60 pb-1.5">
        <h3 className="ops-heading-icon font-display text-sm font-semibold uppercase tracking-[0.06em] text-fg"><FileText aria-hidden className="h-4 w-4" /><UiText text={title} /></h3>
        {meta && <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider text-muted"><UiText text={meta} /></span>}
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
