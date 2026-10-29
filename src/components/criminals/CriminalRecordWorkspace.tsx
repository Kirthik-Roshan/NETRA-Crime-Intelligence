"use client";
import { UiText, useUiText } from '@/components/UiText';


import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "@/components/AppLink";
import {
  ArrowLeft,
  CalendarDays,
  Database,
  FileCheck2,
  FileSearch,
  FileText,
  Fingerprint,
  MapPin,
  Network,
  ShieldCheck,
  User,
  Users,
} from "lucide-react";
import { Avatar, Badge, EmptyState, PanelHeader, RiskMeter, StatusBadge, Tag } from "@/components/ui";
import { fetchCriminalRecord, type EvidenceCriminalIntelligence } from "@/lib/ai-client";
import { formatDate, parseJsonArray, riskBand } from "@/lib/utils";

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

function safeDate(value: string): string {
  return value ? formatDate(value) : "Not recorded";
}

export function CriminalRecordWorkspace() {
  const ui = useUiText();
  const search = useSearchParams();
  const id = Number(search.get("id"));
  const [data, setData] = useState<EvidenceCriminalIntelligence | null>(null);
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
    void fetchCriminalRecord(id).then((result) => {
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

  const aliases = useMemo(() => parseJsonArray(text(data?.criminal, "aliases")), [data]);
  const locations = useMemo(() => parseJsonArray(text(data?.criminal, "known_locations")), [data]);

  if (loading) {
    return <div className="card card-static grid min-h-[420px] place-items-center"><EmptyState icon={FileSearch} title={ui("Resolving accused profile")} hint={ui("Joining official Accused, CaseMaster and ArrestSurrender records in Catalyst.")} /></div>;
  }

  if (missing || !data) {
    return (
      <div className="animate-fade-in space-y-4">
        <Link href="/criminals" className="btn-ghost w-fit"><ArrowLeft className="h-4 w-4" /><UiText text={" Accused profiles"} /></Link>
        <div className="card card-static"><EmptyState icon={User} title={ui("Accused profile not found")} hint={ui("The requested resolved profile is not present in the official KSP records.")} /></div>
      </div>
    );
  }

  const c = data.criminal;
  const score = number(c, "risk_score");
  const band = riskBand(score);
  const associates = data.associates || [];

  return (
    <div className="record-detail animate-fade-in space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/criminals" className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-fg"><ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /><UiText text={" Accused profiles"} /></Link>
        <div className="flex flex-wrap gap-2">
          <Link href={`/network?focus=${id}`} className="btn-ghost h-8 text-xs"><Network className="h-3.5 w-3.5" /><UiText text={" Open link analysis"} /></Link>
          <Link href="/database?table=Accused" className="btn-ghost h-8 text-xs"><Database className="h-3.5 w-3.5" /><UiText text={" Accused source"} /></Link>
        </div>
      </div>

      <section className="record-overview card card-static panel-pad relative overflow-hidden">
        <span className={`absolute inset-y-0 left-0 w-[3px] ${score >= 80 ? "bg-danger" : score >= 60 ? "bg-warning" : score >= 40 ? "bg-info" : "bg-success"}`} aria-hidden />
        <div className="flex flex-wrap items-start gap-5">
          <Avatar name={text(c, "name")} size={68} profileId={id} />
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Badge tone="accent"><ShieldCheck className="h-3 w-3" /><UiText text={" Official KSP resolution"} /></Badge>
              <Badge tone="info"><UiText text={"Synthetic reference image"} /></Badge>
              <StatusBadge status={text(c, "status")} />
              <Tag>{text(c, "crime_category")}</Tag>
            </div>
            <h1 className="font-display text-2xl font-bold"><UiText text={text(c, "name")} /></h1>
            {aliases.length > 0 && <p className="mt-1 text-sm text-muted"><UiText text={"Aliases: "} /><span className="text-subtle">{aliases.join(" · ")}</span></p>}
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> <UiText text={text(c, "gender") || "Gender not recorded"} /><UiText text={number(c, "age") ? `, ${number(c, "age")}` : ""} /></span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> <UiText text={text(c, "home_district") || "District not recorded"} /></span>
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /><UiText text={" First linked "} />{safeDate(text(c, "first_seen"))}</span>
              <span className="font-mono text-xs"><UiText text={"PROFILE-"} /><UiText text={id} /></span>
            </div>
            {locations.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{locations.map((location) => <Tag key={location}><MapPin className="h-3 w-3" /><UiText text={location} /></Tag>)}</div>}
          </div>
          <div className="min-w-[150px] border-l border-border pl-5 text-center">
            <div className="stat-label"><UiText text={"Derived risk score"} /></div>
            <div className={`mt-1 font-display text-4xl font-bold tabular-nums ${band.color}`}><UiText text={score} /></div>
            <div className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${band.color}`}><UiText text={band.label} /></div>
            <div className="mt-3 flex justify-center"><RiskMeter score={score} /></div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden border border-border bg-border sm:grid-cols-5">
          {[
            ["Linked FIRs", data.counts.firs, FileText],
            ["Arrests", data.counts.arrests, Fingerprint],
            ["Co-accused", associates.length, Users],
            ["Evidence", data.counts.evidence, FileCheck2],
            ["Districts", locations.length, MapPin],
          ].map(([label, value, Icon]) => {
            const MetricIcon = Icon as typeof Users;
            return <div key={String(label)} className="bg-elevated/70 px-3 py-3"><div className="flex items-center gap-1.5 text-muted"><MetricIcon className="h-3.5 w-3.5" /><span className="stat-label">{String(label)}</span></div><div className="mt-1 font-display text-2xl font-bold tabular-nums">{Number(value)}</div></div>;
          })}
        </div>
      </section>

      <div className="record-columns grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="space-y-4">
          <section className="card panel-pad">
            <PanelHeader icon={FileText} title={ui("Associated FIRs")} count={data.firs.length} sub={ui("Resolved through Accused.CaseMasterID")} />
            {data.firs.length ? <div className="space-y-1.5">{data.firs.map((fir) => <Link key={number(fir, "id")} href={`/cases/record?id=${number(fir, "id")}`} className="lift-row flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border p-2.5"><span className="font-mono text-xs text-muted">{text(fir, "fir_number")}</span><span className="min-w-0 flex-1 truncate text-sm font-medium"><UiText text={text(fir, "crime_type")} /></span><Tag><UiText text={text(fir, "link_role").replace(/_/g, " ")} /></Tag><span className="text-xs text-muted"><UiText text={text(fir, "district")} /> · {safeDate(text(fir, "occurred_at"))}</span><StatusBadge status={text(fir, "severity")} /></Link>)}</div> : <p className="text-sm text-muted"><UiText text={"No FIR linkage is recorded."} /></p>}
          </section>

          <section className="card panel-pad">
            <PanelHeader icon={Fingerprint} title={ui("Arrest and surrender history")} count={data.arrests.length} sub={ui("Official ArrestSurrender records")} />
            {data.arrests.length ? <ol className="space-y-3">{data.arrests.map((item, index) => <li key={text(item, "ROWID", "id") || index} className="grid gap-1 border-l-2 border-accent/60 pl-3 sm:grid-cols-[150px_minmax(0,1fr)_auto]"><span className="font-mono text-xs text-subtle">{safeDate(text(item, "arrested_at"))}</span><span className="min-w-0 break-words text-sm"><UiText text={text(item, "district")} /><UiText text={" · IO "} />{text(item, "arresting_officer")}</span><Badge tone="muted"><UiText text={text(item, "arrest_type")} /></Badge></li>)}</ol> : <p className="text-sm text-muted"><UiText text={"No arrest or surrender record is linked to this resolved identity."} /></p>}
          </section>

          <section className="card panel-pad">
            <PanelHeader icon={FileCheck2} title={ui("Linked evidence")} count={data.evidence.length} sub={ui("Platform evidence attached to official FIR identifiers")} />
            {data.evidence.length ? <div className="divide-y divide-border/50">{data.evidence.map((item, index) => <div key={text(item, "ROWID", "id") || index} className="flex flex-wrap items-center gap-2 py-2.5"><Tag>{text(item, "type") || "Evidence"}</Tag><span className="min-w-0 flex-1 truncate text-sm">{text(item, "description") || "Stored evidence object"}</span><span className="text-xs text-muted">{safeDate(text(item, "collected_at", "CREATEDTIME"))}</span></div>)}</div> : <p className="text-sm text-muted"><UiText text={"No evidence object is attached to the linked FIRs."} /></p>}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card panel-pad">
            <PanelHeader icon={Users} title={ui("Co-accused network")} count={associates.length} sub={ui("People named together in one or more official FIRs")} />
            {associates.length ? <div className="space-y-1.5">{associates.map((person) => <Link key={number(person, "id")} href={`/criminals/record?id=${number(person, "id")}`} className="lift-row flex items-center gap-2.5 rounded-md border border-border p-2"><Avatar name={text(person, "name")} size={30} profileId={number(person, "id")} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium"><UiText text={text(person, "name")} /></span><span className="block text-[11px] text-muted">{number(person, "frequency")}<UiText text={" shared FIR"} /><UiText text={number(person, "frequency") === 1 ? "" : "s"} /> · {Math.round(number(person, "confidence") * 100)}<UiText text={"% confidence"} /></span></span><span className={`font-mono text-xs font-semibold ${riskBand(number(person, "risk_score")).color}`}>{number(person, "risk_score")}</span></Link>)}</div> : <p className="text-sm text-muted"><UiText text={"No co-accused relationship is present."} /></p>}
          </section>

          <section className="card panel-pad">
            <PanelHeader icon={ShieldCheck} title={ui("Explainable profile basis")} />
            <p className="text-sm leading-relaxed text-subtle">{text(c, "notes")}</p>
            <div className="mt-3 rounded-md border border-border bg-elevated/40 p-3 font-mono text-xs leading-relaxed text-muted">{text(c, "risk_basis")}</div>
            <p className="mt-3 text-xs leading-relaxed text-muted"><UiText text={"This is a deterministic investigative index derived from official records. It is not a finding of guilt and must be verified by an authorized officer."} /></p>
          </section>
        </aside>
      </div>
    </div>
  );
}
