"use client";
import { UiText, useUiText } from '@/components/UiText';


import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "@/components/AppLink";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Database,
  FileCheck2,
  FileSearch,
  FileText,
  Fingerprint,
  GitCompareArrows,
  Lightbulb,
  Scale,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { Avatar, Badge, EmptyState, PanelHeader, StatusBadge, Tag } from "@/components/ui";
import { fetchCaseRecord, type CaseRecordBundle } from "@/lib/ai-client";
import { formatDate } from "@/lib/utils";
import { CaseJournal } from "@/components/database/CaseJournal";

type Row = Record<string, unknown>;

function text(row: Row | null | undefined, ...keys: string[]): string {
  for (const key of keys) if (row?.[key] != null && String(row[key]).trim()) return String(row[key]);
  return "";
}

function number(row: Row | null | undefined, ...keys: string[]): number {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function values(row: Row, key: string): string[] {
  return Array.isArray(row[key]) ? row[key].map(String).filter(Boolean) : [];
}

function RecordRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2.5 last:border-0 last:pb-0 first:pt-0">
      <dt className="stat-label shrink-0"><UiText text={label} /></dt>
      <dd className={`${mono ? "font-mono text-xs" : "text-sm"} min-w-0 text-right text-subtle`}>{value || "Not recorded"}</dd>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Users }) {
  return (
    <div className="border-l-2 border-accent/60 bg-elevated/35 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted"><Icon className="h-3.5 w-3.5" /><span className="stat-label"><UiText text={label} /></span></div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums"><UiText text={value} /></div>
    </div>
  );
}

export function CaseRecordWorkspace() {
  const ui = useUiText();
  const search = useSearchParams();
  const id = Number(search.get("id"));
  const [data, setData] = useState<CaseRecordBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setMissing(false);
    if (!Number.isSafeInteger(id) || id <= 0) {
      setLoading(false);
      setMissing(true);
      return () => { live = false; };
    }
    void fetchCaseRecord(id).then((result) => {
      if (!live) return;
      setData(result);
      setMissing(!result);
    }).catch(() => {
      if (live) setMissing(true);
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, [id]);

  if (loading) {
    return <div className="card card-static grid min-h-[420px] place-items-center"><EmptyState icon={FileSearch} title={ui("Opening official case record")} hint={ui("Resolving linked KSP schema records from Catalyst Cloud Scale.")} /></div>;
  }

  if (missing || !data) {
    return (
      <div className="animate-fade-in space-y-4">
        <Link href="/cases" className="btn-ghost w-fit"><ArrowLeft className="h-4 w-4" /><UiText text={" Case registry"} /></Link>
        <div className="card card-static"><EmptyState icon={FileSearch} title={ui("Case record not found")} hint={ui("The requested identifier is not present in CaseMaster in the current Catalyst environment.")} /></div>
      </div>
    );
  }

  const c = data.case;
  const fir = data.fir;
  const chargesheet = data.chargesheets[0];

  return (
    <div className="record-detail animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/cases" className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /><UiText text={" Case registry"} /></Link>
        <div className="flex flex-wrap gap-2"><Link href={`/investigations?cases=${[id, ...data.related.slice(0, 1).map(row => number(row, "id"))].join(',')}`} className="btn-ghost h-8 text-xs"><GitCompareArrows className="h-3.5 w-3.5" /><UiText text={" Investigate connections"} /></Link><Link href={`/database?table=CaseMaster`} className="btn-ghost h-8 text-xs"><Database className="h-3.5 w-3.5" /><UiText text={" CaseMaster source"} /></Link></div>
      </div>

      <section className="record-overview card card-static panel-pad relative overflow-hidden">
        <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone="accent"><ShieldCheck className="h-3 w-3" /><UiText text={" Official KSP record"} /></Badge>
              <StatusBadge status={text(c, "status") || "registered"} />
              <StatusBadge status={text(c, "priority") || "medium"} />
            </div>
            <div className="font-mono text-xs uppercase tracking-wide text-muted">{text(c, "case_number") || `CaseMaster ${id}`}</div>
            <h1 className="mt-1 font-display text-2xl font-bold"><UiText text={text(c, "title") || text(fir, "crime_type")} /></h1>
            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted">{text(fir, "description") || "Brief facts were not recorded."}</p>
          </div>
          <div className="shrink-0 text-right">
            <div className="stat-label"><UiText text={"FIR number"} /></div>
            <div className="mt-1 font-mono text-sm font-semibold">{text(fir, "fir_number") || "Not recorded"}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 sm:grid-cols-4">
          <Metric label={ui("Accused")} value={data.suspects.length} icon={Users} />
          <Metric label={ui("Victims")} value={data.victims.length} icon={UserRound} />
          <Metric label={ui("Arrests")} value={data.arrests.length} icon={Fingerprint} />
          <Metric label={ui("Evidence")} value={data.evidence.length} icon={FileCheck2} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-4">
          <section className="card panel-pad">
            <PanelHeader icon={FileText} title={ui("Incident record")} sub={ui("CaseMaster, occurrence, unit and legal joins")} />
            <dl className="grid gap-x-8 md:grid-cols-2">
              <RecordRow label={ui("Offence")} value={text(fir, "crime_type")} />
              <RecordRow label={ui("Sections")} value={text(fir, "ipc_sections")} mono />
              <RecordRow label={ui("District")} value={text(fir, "district")} />
              <RecordRow label={ui("Police station")} value={text(fir, "station_name")} />
              <RecordRow label={ui("Place")} value={text(fir, "location")} />
              <RecordRow label={ui("Investigating officer")} value={text(c, "officer")} />
              <RecordRow label={ui("Occurred")} value={formatDate(text(fir, "occurred_at"))} />
              <RecordRow label={ui("Reported")} value={formatDate(text(fir, "reported_at"))} />
              <RecordRow label={ui("Modus")} value={text(fir, "modus")} />
              <RecordRow label={ui("Coordinates")} value={number(fir, "lat") ? `${number(fir, "lat").toFixed(5)}, ${number(fir, "lng").toFixed(5)}` : "Not recorded"} mono />
            </dl>
          </section>

          <section className="card panel-pad">
            <PanelHeader icon={Lightbulb} title={ui("Investigator decision support")} count={data.leads.length} sub={ui("Deterministic leads grounded in the joined official records")} />
            <p className="border-l-2 border-accent bg-accent/5 px-3 py-2.5 text-sm leading-relaxed text-subtle"><UiText text={data.decision_summary} /></p>
            {data.leads.length ? (
              <ol className="mt-3 divide-y divide-border/60">
                {data.leads.map((lead, index) => (
                  <li key={`${lead.title}-${index}`} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={lead.priority === "high" ? "danger" : lead.priority === "medium" ? "warning" : "info"}><UiText text={lead.priority} /></Badge>
                      <span className="text-sm font-semibold text-fg"><UiText text={lead.title} /></span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted"><UiText text={lead.rationale} /></p>
                    {lead.evidence.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{lead.evidence.map((item) => <Tag key={item} mono><UiText text={item} /></Tag>)}</div>}
                  </li>
                ))}
              </ol>
            ) : <p className="mt-3 text-sm text-muted"><UiText text={"No additional lead is supported by the current linked records."} /></p>}
          </section>

          <section className="card panel-pad">
            <PanelHeader icon={Users} title={ui("People linked to this case")} sub={ui("Accused, Victim and ComplainantDetails")} />
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <div className="stat-label mb-2"><UiText text={"Accused · "} /><UiText text={data.suspects.length} /></div>
                <div className="space-y-1.5">
                  {data.suspects.map((person) => (
                    <Link key={number(person, "id")} href={`/criminals/record?id=${number(person, "id")}`} className="lift-row flex items-center gap-2 rounded-md border border-border p-2">
                      <Avatar name={text(person, "name")} size={28} profileId={number(person, "id")} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium"><UiText text={text(person, "name")} /></span><span className="block text-[11px] capitalize text-muted"><UiText text={text(person, "role").replace(/_/g, " ")} /></span></span>
                      <span className="font-mono text-xs text-accent">{number(person, "risk_score")}</span>
                    </Link>
                  ))}
                  {!data.suspects.length && <p className="text-xs text-muted"><UiText text={"No accused record linked."} /></p>}
                </div>
              </div>
              <div>
                <div className="stat-label mb-2"><UiText text={"Victims · "} /><UiText text={data.victims.length} /></div>
                <div className="space-y-1.5">{data.victims.map((person) => <div key={number(person, "id")} className="rounded-md border border-border p-2 text-sm"><span className="font-medium"><UiText text={text(person, "name")} /></span><span className="block text-[11px] text-muted"><UiText text={text(person, "gender")} /><UiText text={" · age "} />{number(person, "age") || "not recorded"}</span></div>)}</div>
              </div>
              <div>
                <div className="stat-label mb-2"><UiText text={"Complainants · "} /><UiText text={data.complainants.length} /></div>
                <div className="space-y-1.5">{data.complainants.map((person) => <div key={number(person, "id")} className="rounded-md border border-border p-2 text-sm"><span className="font-medium"><UiText text={text(person, "name")} /></span><span className="block text-[11px] text-muted"><UiText text={text(person, "occupation")} /> · <UiText text={text(person, "religion")} /></span></div>)}</div>
              </div>
            </div>
          </section>

          <section className="card panel-pad">
            <PanelHeader icon={FileCheck2} title={ui("Evidence register")} count={data.evidence.length} sub={ui("Officer uploads stored through Stratus and linked to this official FIR")} />
            {data.evidence.length ? <div className="divide-y divide-border/50">{data.evidence.map((item, index) => <div key={text(item, "ROWID", "id") || index} className="flex flex-wrap items-center gap-2 py-2.5 text-sm"><Tag>{text(item, "type") || "Evidence"}</Tag><span className="min-w-0 flex-1 truncate">{text(item, "description") || text(item, "storage_ref")}</span><span className="text-xs text-muted">{formatDate(text(item, "collected_at", "CREATEDTIME"))}</span></div>)}</div> : <p className="text-sm text-muted"><UiText text={"No platform evidence has been attached to this FIR."} /></p>}
          </section>
          <CaseJournal initialCaseId={id} />
        </div>

        <aside className="space-y-4">
          <section className="card panel-pad">
            <PanelHeader icon={Scale} title={ui("Case disposition")} />
            <dl>
              <RecordRow label={ui("Status")} value={text(c, "status").replace(/_/g, " ")} />
              <RecordRow label={ui("Gravity")} value={text(fir, "severity")} />
              <RecordRow label={ui("Chargesheet")} value={chargesheet ? text(chargesheet, "final_report", "cstype") : "Not filed"} />
              <RecordRow label={ui("Filed date")} value={chargesheet ? formatDate(text(chargesheet, "csdate")) : "Not recorded"} />
              <RecordRow label={ui("Court")} value={text(chargesheet, "court")} />
            </dl>
          </section>

          <section className="card panel-pad">
            <PanelHeader icon={Clock3} title={ui("Investigation timeline")} count={data.timeline.length} sub={ui("Chronology from official and separately marked evidence events")} />
            {data.timeline.length ? (
              <ol className="space-y-3">
                {data.timeline.map((event, index) => (
                  <li key={`${event.type}-${event.record_id}-${index}`} className="relative border-l-2 border-accent/45 pl-3">
                    <div className="text-sm font-medium text-fg"><UiText text={event.label} /></div>
                    <div className="mt-0.5 text-xs text-muted">{formatDate(event.date)} · <UiText text={event.source} /></div>
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-muted"><UiText text={"No dated investigation events are recorded."} /></p>}
          </section>

          <section className="card panel-pad">
            <PanelHeader icon={Fingerprint} title={ui("Custody actions")} count={data.arrests.length} />
            {data.arrests.length ? <ol className="space-y-3">{data.arrests.map((item, index) => <li key={text(item, "ROWID", "id") || index} className="border-l-2 border-accent/50 pl-3"><div className="text-sm font-medium capitalize"><UiText text={text(item, "arrest_type")} /></div><div className="mt-0.5 text-xs text-muted">{formatDate(text(item, "arrested_at"))} · <UiText text={text(item, "district")} /></div><div className="text-xs text-muted"><UiText text={"IO: "} />{text(item, "arresting_officer")}</div></li>)}</ol> : <p className="text-sm text-muted"><UiText text={"No arrest or surrender is linked."} /></p>}
          </section>

          <section className="card panel-pad">
            <PanelHeader icon={GitCompareArrows} title={ui("Similar past cases")} count={data.related.length} sub={ui("Ranked by offence, modus, district and station")} />
            <div className="space-y-2">{data.related.map((item) => (
              <Link key={number(item, "id")} href={`/cases/record?id=${number(item, "id")}`} className="lift-row block rounded-md border border-border p-2.5">
                <div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] text-muted">{text(item, "fir_number", "case_number")}</span><Badge tone="info">{number(item, "similarity_score")}<UiText text={"% match"} /></Badge></div>
                <span className="mt-1 block truncate text-sm font-medium">{text(item, "title")}</span>
                <span className="mt-1 block text-[11px] capitalize text-muted">{text(item, "outcome")}</span>
                <span className="mt-1 block text-[10px] text-muted">{values(item, "match_reasons").join(" · ")}</span>
              </Link>
            ))}</div>
            {!data.related.length && <p className="text-sm text-muted"><UiText text={"No sufficiently similar official case was found."} /></p>}
          </section>

          <div className="flex items-start gap-2 border-l-2 border-success bg-success/5 px-3 py-2.5 text-xs text-muted">
            <CalendarDays className="mt-px h-3.5 w-3.5 shrink-0 text-success" />
            <span><UiText text={"Every core field on this page is resolved from the official KSP schema in Catalyst Cloud Scale. Evidence is separately marked as platform-generated."} /></span>
          </div>
        </aside>
      </div>
    </div>
  );
}
