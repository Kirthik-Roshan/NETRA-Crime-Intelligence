"use client";
import { UiText, useUiText, useUiLocale } from '@/components/UiText';


import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowRight, Bell, Check, CheckCheck, ChevronDown, FileDown, FileSearch, GitCompareArrows, History, Layers, Loader2, Network, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, X } from "lucide-react";
import Link from "@/components/AppLink";
import { useReportPrint } from '@/lib/use-report-print';
import { Badge, PanelHeader } from "@/components/ui";
import { investigationRequest, listRecordBundle } from "@/lib/ai-client";
import { checkInvestigations, downloadInvestigationPdf, refreshInvestigationAlerts, reviewInvestigationAlert, type InvestigationAlert, type InvestigationAnalysis, type InvestigationCriteria, type InvestigationExclusion, type InvestigationFinding, type InvestigationObservation, type InvestigationRevision, type SavedInvestigation } from "@/lib/investigations";
import "./investigations.css";

const Graph = dynamic(() => import("./InvestigationGraph"), { ssr: false, loading: () => <div className="investigation-graph grid place-items-center text-sm text-muted"><UiText text={"Opening relationship graph..."} /></div> });
type Row = Record<string, unknown>;
type Summary = Omit<SavedInvestigation, "analysis"> & { counts: InvestigationAnalysis["counts"] };
const emptyCriteria: InvestigationCriteria = { enabled: false, crime_type: "", district: "", term: "" };
const defaultQuestion = "Could these incidents be connected? What supports or contradicts that connection?";

export function InvestigationWorkbench() {
  const ui = useUiText();
  const locale = useUiLocale();
  const date = (value: string) => new Date(value).toLocaleString(locale, { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const params = useSearchParams();
  const [firs, setFirs] = useState<Row[]>([]);
  const [registryError, setRegistryError] = useState("");
  const [registryLoading, setRegistryLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ids, setIds] = useState<number[]>([]);
  const [question, setQuestion] = useState(defaultQuestion);
  const [title, setTitle] = useState("");
  const [observations, setObservations] = useState<InvestigationObservation[]>([]);
  const [exclusions, setExclusions] = useState<InvestigationExclusion[]>([]);
  const [analysis, setAnalysis] = useState<InvestigationAnalysis | null>(null);
  const [saved, setSaved] = useState<SavedInvestigation | null>(null);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [archiveError, setArchiveError] = useState("");
  const [revisions, setRevisions] = useState<InvestigationRevision[]>([]);
  const [criteria, setCriteria] = useState<InvestigationCriteria>(emptyCriteria);
  const [annotation, setAnnotation] = useState("");
  const [reviewStatus, setReviewStatus] = useState<"draft" | "reviewed">("draft");
  const [reviewNote, setReviewNote] = useState("");
  const [tab, setTab] = useState<"assessment" | "sources" | "brief" | "alerts">("assessment");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [watchError, setWatchError] = useState("");
  const [alerts, setAlerts] = useState<InvestigationAlert[]>([]);
  const [checkedAt, setCheckedAt] = useState("");
  const [exclusionTarget, setExclusionTarget] = useState("");
  const [exclusionReason, setExclusionReason] = useState("");
  const [focusedSources, setFocusedSources] = useState<string[]>([]);
  const [delta, setDelta] = useState("");
  const requestId = useRef("");
  const [observationOpen, setObservationOpen] = useState(false);
  const [observation, setObservation] = useState({ case_id: "", plate: "", vehicle_type: "", reference: "", note: "" });
  const [dirty, setDirty] = useState(false);
  const historical = !!saved && !!revisions.length && saved.revision_id !== revisions[0].revision_id;

  const loadRegistry = useCallback(async () => {
    setRegistryLoading(true); setRegistryError("");
    try { const result = await listRecordBundle(["Firs"], true, 5000); setFirs(result.Firs); }
    catch (cause) { setRegistryError(cause instanceof Error ? cause.message : "FIR registry unavailable."); }
    finally { setRegistryLoading(false); }
  }, []);
  const loadSaved = useCallback(async () => {
    try { const result = await investigationRequest<{ rows: Summary[] }>({ mode: "investigation:list" }); setSummaries(result.rows); setArchiveError(""); }
    catch (cause) { setArchiveError(cause instanceof Error ? cause.message : "Saved investigations unavailable."); }
  }, []);
  const loadAlerts = useCallback(async (force = false) => {
    try { const result = await checkInvestigations(force); setAlerts(result.alerts); setCheckedAt(result.checked_at); setWatchError(result.warnings.join(" ")); }
    catch (cause) { setWatchError(cause instanceof Error ? cause.message : "Watch check failed."); }
  }, []);
  useEffect(() => { void loadRegistry(); void loadSaved(); void loadAlerts(); }, [loadRegistry, loadSaved, loadAlerts]);
  useEffect(() => {
    const poll = () => { if (document.visibilityState === "visible") void loadAlerts(); };
    const timer = window.setInterval(poll, 60000);
    window.addEventListener("netra:investigations-updated", poll);
    window.addEventListener("netra:records-updated", poll);
    return () => { clearInterval(timer); window.removeEventListener("netra:investigations-updated", poll); window.removeEventListener("netra:records-updated", poll); };
  }, [loadAlerts]);

  const openSaved = useCallback(async (id: string, revisionId?: string) => {
    setBusy("open"); setError(""); setMessage("");
    try {
      const result = await investigationRequest<{ saved: SavedInvestigation; revisions: InvestigationRevision[] }>({ mode: "investigation:open", id, revision_id: revisionId });
      const row = result.saved;
      setSaved(row); setRevisions(result.revisions); setIds(row.case_ids); setQuestion(row.question); setTitle(row.title); setObservations(row.observations); setExclusions(row.exclusions);
      setAnalysis(row.analysis); setCriteria(row.criteria); setAnnotation(row.annotation); setReviewStatus(row.review_status); setReviewNote(row.review_note);
      setDelta(""); setFocusedSources([]); setDirty(false); setExclusionTarget(""); setObservationOpen(false); requestId.current = "";
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open investigation."); }
    finally { setBusy(""); }
  }, []);
  useEffect(() => {
    const savedId = params.get("id");
    if (savedId) { void openSaved(savedId); return; }
    const selected = (params.get("cases") || "").split(",").map(Number).filter(id => Number.isSafeInteger(id) && id > 0).slice(0, 6);
    if (selected.length) {
      setIds([...new Set(selected)]); setSaved(null); setAnalysis(null); setRevisions([]); setObservations([]); setExclusions([]);
      setTitle(""); setQuestion(defaultQuestion); setCriteria(emptyCriteria); setAnnotation(""); setReviewStatus("draft"); setReviewNote(""); setDirty(false); setTab("assessment");
    }
  }, [params, openSaved]);

  function changed() { setDirty(true); requestId.current = ""; setMessage(""); }
  function changedAnalysis() { changed(); setAnalysis(null); setDelta(""); }
  function reset() {
    setIds([]); setSaved(null); setAnalysis(null); setTitle(""); setQuestion(defaultQuestion); setObservations([]); setExclusions([]); setCriteria(emptyCriteria);
    setAnnotation(""); setReviewStatus("draft"); setReviewNote(""); setRevisions([]); setError(""); setMessage(""); setDelta(""); setDirty(false); setFocusedSources([]); setExclusionTarget(""); setObservationOpen(false); requestId.current = "";
  }
  async function run(nextExclusions = exclusions) {
    setBusy("analyze"); setError(""); setMessage(""); setFocusedSources([]);
    try {
      const result = await investigationRequest<{ analysis: InvestigationAnalysis; warning?: string }>({ mode: "investigation:analyze", case_ids: ids, question, observations, exclusions: nextExclusions });
      if (analysis) {
        const before = analysis.findings.filter(item => item.active).map(item => item.id);
        const after = result.analysis.findings.filter(item => item.active).map(item => item.id);
        const lost = before.filter(id => !after.includes(id)).length; const gained = after.filter(id => !before.includes(id)).length;
        setDelta(`${lost} finding${lost === 1 ? '' : 's'} lost support; ${gained} restored or added.`);
      }
      setAnalysis(result.analysis); setExclusions(nextExclusions); setExclusionTarget(""); setExclusionReason(""); setTab("assessment"); changed();
      if (result.warning) setMessage(result.warning);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Analysis failed."); }
    finally { setBusy(""); }
  }
  async function save() {
    if (!analysis) return;
    setBusy("save"); setError(""); setMessage("");
    if (!requestId.current) requestId.current = crypto.randomUUID();
    try {
      const result = await investigationRequest<{ saved: SavedInvestigation; warning?: string }>({ mode: "investigation:save", id: saved?.id, previous_revision: saved?.revision_id, request_id: requestId.current,
        title, question, case_ids: ids, observations, exclusions, criteria, annotation, review_status: reviewStatus, review_note: reviewNote, analysis_fingerprint: analysis.source_fingerprint });
      setSaved(result.saved); setAnalysis(result.saved.analysis); setDirty(false); requestId.current = "";
      setMessage(result.warning || `Revision ${result.saved.revision_number} saved. The evidence snapshot is preserved.`);
      const history = await investigationRequest<{ revisions: InvestigationRevision[] }>({ mode: "investigation:open", id: result.saved.id }); setRevisions(history.revisions);
      await loadSaved(); refreshInvestigationAlerts();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Save failed."); }
    finally { setBusy(""); }
  }
  async function exportBrief() {
    if (busy) return;
    if (!saved) { setError('Save an investigation revision before exporting its brief.'); return; }
    if (dirty) { setError('Save the current revision before exporting the investigation brief.'); return; }
    setBusy("pdf"); setError("");
    try { await downloadInvestigationPdf(await investigationRequest<import('@/lib/report-export').ReportExport>({ mode: "investigation:pdf", id: saved.id, revision_id: saved.revision_id })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "PDF export failed."); }
    finally { setBusy(""); }
  }
  useReportPrint(exportBrief);
  async function alertAction(id: string, status: InvestigationAlert["status"]) {
    setBusy("alert"); setError("");
    try { await reviewInvestigationAlert(id, status); await loadAlerts(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Alert review failed."); }
    finally { setBusy(""); }
  }
  function inspect(finding: InvestigationFinding) { setFocusedSources(finding.source_ids); setTab("sources"); }
  const filtered = firs.filter(row => `${row.fir_number} ${row.crime_type} ${row.district} ${row.description}`.toLowerCase().includes(search.toLowerCase()));
  const activeAlerts = alerts.filter(item => item.status !== "dismissed");
  const registryOptions = (field: string) => [...new Set(firs.map(row => String(row[field] || "")).filter(Boolean))].sort();
  const buttonBusy = (name: string) => busy === name ? <Loader2 size={15} className="animate-spin" /> : null;

  return <div className="investigation-workbench animate-fade-in space-y-5">
    <header className="section-head flex flex-wrap items-end justify-between gap-4">
      <div><div className="stat-label mb-2 text-accent"><UiText text={"Investigation workspace"} /></div><h1 className="font-display text-2xl font-bold"><UiText text={"Investigation Workbench"} /></h1><p className="mt-1 text-sm text-muted"><UiText text={saved ? `${saved.title} · Revision ${saved.revision_number}${historical ? ' · Historical snapshot' : ''}` : 'Cross-case evidence review'} /></p></div>
      <div className="flex flex-wrap gap-2"><button disabled={!!busy} className="btn-ghost" onClick={reset}><Plus size={16} /><UiText text={"New investigation"} /></button><button disabled={!!busy || !saved || dirty} className="btn-ghost" onClick={() => void exportBrief()}>{buttonBusy("pdf") || <FileDown size={16} />}<UiText text={"Export brief"} /></button></div>
    </header>
    {error && <div role="alert" className="investigation-notice border-danger/40 bg-danger/5 text-danger"><AlertTriangle size={17} /><span><UiText text={error} /></span></div>}
    {message && <div role="status" className="investigation-notice border-accent/40 bg-accent/5"><ShieldCheck size={17} /><span><UiText text={message} /></span></div>}
    {historical && <div className="investigation-notice border-warning/40 bg-warning/5"><History size={17} /><span><UiText text={"This is a preserved revision from "} />{saved && date(saved.saved_at)}.</span><button disabled={!!busy} className="ml-auto text-sm text-accent" onClick={() => saved && void openSaved(saved.id)}><UiText text={"Open latest"} /></button></div>}
    <div className="investigation-layout">
      <aside className="min-w-0 space-y-4">
        <section className="investigation-panel">
          <PanelHeader title={ui("Selected FIRs")} icon={Layers} count={ids.length} />
          <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-surface px-2"><Search size={15} className="shrink-0 text-muted" /><input aria-label={ui("Find FIRs")} className="h-10 min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder={ui("FIR, district, offence...")} value={search} onChange={event => setSearch(event.target.value)} /></div>
          <p className="mb-2 text-[11px] text-muted"><UiText text={"Select 2-6 FIRs · "} /><UiText text={firs.length} /><UiText text={" available"} /></p>
          {registryLoading && <p className="py-5 text-sm text-muted"><UiText text={"Loading FIRs..."} /></p>}
          {registryError && <div role="alert" className="text-xs text-danger"><UiText text={registryError} /><button className="btn-ghost mt-2" onClick={() => void loadRegistry()}><RefreshCw size={14} /><UiText text={"Retry"} /></button></div>}
          <div className="investigation-case-list">{[...filtered].sort((a, b) => Number(ids.includes(Number(b.id))) - Number(ids.includes(Number(a.id)))).map(row => {
            const id = Number(row.id); const selected = ids.includes(id);
            return <label key={id} className={`investigation-case ${selected ? 'is-selected' : ''}`}><input type="checkbox" checked={selected} disabled={!!busy || historical || (!selected && ids.length >= 6)} onChange={() => { setIds(selected ? ids.filter(value => value !== id) : [...ids, id]); setExclusions([]); setObservations(observations.filter(item => item.case_id !== id)); changedAnalysis(); }} /><span className="min-w-0"><strong className="block break-all font-mono text-[11px]">{String(row.fir_number || id)}</strong><span className="mt-1 block text-xs">{String(row.crime_type)} · {String(row.district)}</span></span></label>;
          })}</div>
          {!registryLoading && !registryError && !filtered.length && <p className="py-4 text-xs text-muted"><UiText text={"No matching FIRs."} /></p>}
        </section>
        <section className="investigation-panel">
          <PanelHeader title={ui("Saved investigations")} icon={History} count={summaries.length} />
          {archiveError ? <div className="text-xs text-danger"><UiText text={archiveError} /><button className="btn-ghost mt-2" onClick={() => void loadSaved()}><RefreshCw size={14} /><UiText text={"Retry archive"} /></button></div> : summaries.length ? <div className="max-h-72 divide-y divide-border overflow-y-auto">{summaries.map(row => <button key={row.id} disabled={!!busy} className={`investigation-saved ${row.id === saved?.id ? 'is-selected' : ''}`} onClick={() => void openSaved(row.id)}><strong className="block text-sm"><UiText text={row.title} /></strong><span className="mt-1 block text-[11px] text-muted"><UiText text={"Revision "} /><UiText text={row.revision_number} /> · <UiText text={row.review_status} /><UiText text={row.criteria.enabled ? ' · Watch active' : ''} /></span></button>)}</div> : <p className="text-xs text-muted"><UiText text={"No saved investigations."} /></p>}
        </section>
      </aside>
      <div className="min-w-0 space-y-4">
        <section className="investigation-panel">
          <label className="stat-label" htmlFor="investigation-question"><UiText text={"Investigation question"} /></label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row"><textarea id="investigation-question" className="input min-h-[76px] w-full flex-1 resize-y text-sm" disabled={!!busy || historical} maxLength={1000} value={question} onChange={event => { setQuestion(event.target.value); changedAnalysis(); }} /><button disabled={!!busy || ids.length < 2 || question.trim().length < 8 || historical} className="btn-accent self-end" onClick={() => void run()}>{buttonBusy("analyze") || <GitCompareArrows size={16} />}<UiText text={busy === 'analyze' ? 'Comparing...' : 'Compare records'} /></button></div>
        </section>
        <div className="investigation-tabs" role="tablist" aria-label={ui("Investigation views")}>{([['assessment', 'Assessment', GitCompareArrows], ['sources', 'Sources', FileSearch], ['brief', 'Brief & watch', Save], ['alerts', 'Updates', Bell]] as const).map(([key, label, Icon]) => <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}><Icon size={15} /><span><UiText text={label} /></span>{key === 'alerts' && activeAlerts.length > 0 && <span className="investigation-count"><UiText text={activeAlerts.length} /></span>}</button>)}</div>

        {tab === 'assessment' && <>
          {analysis ? <>
            {analysis.warnings.map(warning => <div key={warning} role="status" className="investigation-notice border-warning/40 bg-warning/5"><AlertTriangle size={16} /><span><UiText text={warning} /></span></div>)}
            <div className="investigation-metrics">{[['Supporting signals', analysis.counts.support, 'accent'], ['Conflicting details', analysis.counts.conflicts, 'danger'], ['Information gaps', analysis.counts.gaps, 'warning'], ['Included sources', analysis.counts.included, 'success']].map(([label, value, tone]) => <div key={label} className={`investigation-metric tone-${tone}`}><span className="stat-label"><UiText text={label} /></span><strong><UiText text={value} /></strong></div>)}</div>
            <div className="border-l-2 border-accent bg-surface/80 px-4 py-3 text-sm leading-relaxed"><UiText text={analysis.summary} />{delta && <span className="mt-2 block font-semibold text-accent" role="status"><UiText text={delta} /></span>}</div>
            <section className="investigation-panel !p-0"><div className="px-4 pt-4"><PanelHeader title={ui("Evidence dependencies")} icon={Network} count={analysis.findings.length} /></div><Graph analysis={analysis} onFinding={id => { const finding = analysis.findings.find(item => item.id === id); if (finding) inspect(finding); }} /></section>
            <div className="investigation-findings-grid">{(['support', 'conflict'] as const).map(kind => <section key={kind} className="investigation-panel"><PanelHeader title={kind === 'support' ? 'Supporting findings' : 'Conflicting evidence'} icon={kind === 'support' ? ShieldCheck : AlertTriangle} count={analysis.findings.filter(item => item.kind === kind && item.active).length} /><div className="divide-y divide-border">{analysis.findings.filter(item => item.kind === kind).map(item => <article key={item.id} className={`investigation-finding ${!item.active ? 'is-inactive' : ''}`}><Badge tone={!item.active ? 'muted' : kind === 'conflict' ? 'danger' : 'accent'}><UiText text={!item.active ? 'Inactive after exclusion' : item.strength.replaceAll('_', ' ')} /></Badge><h3 className="mt-2 text-sm font-semibold"><UiText text={item.title} /></h3><p className="mt-1 text-xs leading-relaxed text-muted"><UiText text={item.detail} /></p><button className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent" onClick={() => inspect(item)}><UiText text={"Inspect "} /><UiText text={item.source_ids.length} /><UiText text={" sources"} /><ArrowRight size={13} /></button></article>)}</div>{!analysis.findings.some(item => item.kind === kind) && <p className="text-xs text-muted"><UiText text={kind === 'support' ? 'No supporting finding is recorded.' : 'No conflict was identified in the checked fields.'} /></p>}</section>)}</div>
            <section className="investigation-panel"><PanelHeader title={ui("Missing information & next checks")} icon={Search} /><div className="divide-y divide-border">{analysis.gaps.map((gap, index) => <div className="py-3 first:pt-0" key={`${gap.case_id}-${index}`}><h3 className="text-sm font-semibold"><UiText text={gap.title} /></h3><p className="mt-1 text-xs leading-relaxed text-muted"><UiText text={gap.detail} /></p></div>)}</div><ol className="mt-3 list-decimal space-y-2 border-t border-border pl-4 pt-3 text-xs text-subtle">{analysis.next_checks.map(item => <li key={item}><UiText text={item} /></li>)}</ol></section>
          </> : <div className="investigation-empty"><GitCompareArrows size={34} className="text-accent" /><h2 className="mt-3 font-semibold"><UiText text={ids.length < 2 ? 'Select FIRs to investigate' : 'Ready to compare'} /></h2><p className="mt-2 text-sm text-muted"><UiText text={ids.length < 2 ? 'Choose at least two FIRs from the registry.' : 'Run the comparison to review supporting records and conflicting details.'} /></p></div>}
          <section className="investigation-panel"><button disabled={!!busy || historical || !ids.length} className="flex w-full items-center justify-between text-left text-sm font-semibold" onClick={() => setObservationOpen(value => !value)} aria-expanded={observationOpen}><span className="flex items-center gap-2"><Plus size={16} /><UiText text={"Officer observations"} />{observations.length > 0 && ` (${observations.length})`}</span><ChevronDown size={16} /></button>
            {observations.map(item => <div key={item.id} className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-xs"><div className="min-w-0 flex-1"><strong>{item.plate || 'Observation'}{item.vehicle_type && ` · ${item.vehicle_type}`}</strong><p className="mt-1 break-words text-muted"><UiText text={item.reference} /> · <UiText text={item.note} /></p><span className="text-muted"><UiText text={"FIR "} /><UiText text={item.case_id} /><UiText text={" · Officer observation"} /></span></div><button disabled={!!busy || historical} className="btn-ghost h-8 w-8 !p-0" title={ui("Remove observation")} aria-label={ui("Remove observation")} onClick={() => { setObservations(observations.filter(row => row.id !== item.id)); setExclusions(exclusions.filter(row => row.source_id !== item.id)); changedAnalysis(); }}><Trash2 size={14} /></button></div>)}
            {observationOpen && <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); setObservations([...observations, { ...observation, id: `obs-${crypto.randomUUID()}`, case_id: Number(observation.case_id), label: 'Officer vehicle observation' }]); setObservation({ case_id: '', plate: '', vehicle_type: '', reference: '', note: '' }); changedAnalysis(); }}><label className="investigation-field"><UiText text={"FIR"} /><select aria-label={ui("FIR")} required className="input" disabled={!!busy} value={observation.case_id} onChange={event => setObservation({ ...observation, case_id: event.target.value })}><option value=""><UiText text={"Select FIR"} /></option>{ids.map(id => <option key={id} value={id}>{String(firs.find(row => Number(row.id) === id)?.fir_number || id)}</option>)}</select></label><label className="investigation-field"><UiText text={"Registration"} /><input className="input" disabled={!!busy} maxLength={20} value={observation.plate} placeholder={ui("KA 03 AB 7161")} onChange={event => setObservation({ ...observation, plate: event.target.value })} /></label><label className="investigation-field"><UiText text={"Vehicle type"} /><select aria-label={ui("Vehicle type")} className="input" disabled={!!busy} value={observation.vehicle_type} onChange={event => setObservation({ ...observation, vehicle_type: event.target.value })}><option value=""><UiText text={"Not recorded"} /></option>{['car', 'motorcycle', 'truck', 'bus', 'autorickshaw', 'other'].map(type => <option key={type} value={type}><UiText text={type} /></option>)}</select></label><label className="investigation-field"><UiText text={"Media / source reference"} /><input className="input" required minLength={3} maxLength={500} disabled={!!busy} value={observation.reference} placeholder={ui("Evidence ID or source filename")} onChange={event => setObservation({ ...observation, reference: event.target.value })} /></label><label className="investigation-field sm:col-span-2"><UiText text={"Review note"} /><textarea className="input min-h-20" required minLength={5} maxLength={2000} disabled={!!busy} value={observation.note} onChange={event => setObservation({ ...observation, note: event.target.value })} /></label><button className="btn-ghost w-fit" disabled={!!busy || observations.length >= 24}><Plus size={15} /><UiText text={"Add observation"} /></button></form>}
          </section>
        </>}

        {tab === 'sources' && <section className="investigation-panel"><div className="flex items-center justify-between gap-2"><PanelHeader title={ui("Source register")} icon={FileSearch} count={analysis?.sources.length || 0} />{focusedSources.length > 0 && <button className="mb-4 text-xs text-accent" onClick={() => setFocusedSources([])}><UiText text={"Show all"} /></button>}</div>{!analysis && <p className="text-sm text-muted"><UiText text={"Compare records to load their sources."} /></p>}
          <div className="divide-y divide-border">{analysis?.sources.filter(source => !focusedSources.length || focusedSources.includes(source.id)).map(source => <article key={source.id} className={`investigation-source ${source.excluded ? 'is-excluded' : ''}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-2"><Badge tone={source.excluded ? 'warning' : source.origin === 'record' ? 'accent' : 'muted'}><UiText text={source.excluded ? 'Excluded' : source.origin === 'record' ? 'Recorded fact' : source.origin === 'officer' ? 'Officer observation' : 'AI-derived observation'} /></Badge><span className="font-mono text-[11px] text-muted"><UiText text={source.table} /> #<UiText text={source.record_id} /></span></div><h3 className="mt-2 text-sm font-semibold"><UiText text={source.label} /></h3></div><button disabled={!!busy || historical} className="btn-ghost h-8 text-xs" onClick={() => { if (source.excluded) void run(exclusions.filter(item => item.source_id !== source.id)); else { setExclusionTarget(source.id); setExclusionReason(""); } }}>{source.excluded ? <RefreshCw size={13} /> : <X size={13} />}<UiText text={source.excluded ? 'Restore source' : 'Exclude source'} /></button></div><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted">{source.excerpt || 'No narrative text recorded.'}</p><dl className="mt-2 grid gap-1 text-[11px] text-muted">{Object.entries(source.fields).filter(([, value]) => value != null && value !== '' && (!Array.isArray(value) || value.length)).map(([key, value]) => <div key={key} className="min-w-0 break-words"><dt className="inline font-semibold capitalize">{key.replaceAll('_', ' ')}: </dt><dd className="inline"><UiText text={typeof value === 'object' ? JSON.stringify(value) : String(value)} /></dd></div>)}</dl><div className="mt-2 flex flex-wrap gap-3 text-xs"><Link href={`/cases/record?id=${source.case_id}`} className="text-accent"><UiText text={"Open FIR "} /><UiText text={source.case_id} /><ArrowRight className="ml-1 inline" size={12} /></Link><span className="break-all font-mono text-[10px] text-muted" title={source.fingerprint}><UiText text={"SHA-256 "} />{source.fingerprint.slice(0, 20)}...</span></div>{source.excluded && <p className="mt-2 text-xs text-warning"><UiText text={"Reason: "} /><UiText text={source.exclusion_reason} /></p>}{exclusionTarget === source.id && <form className="mt-3 flex flex-col gap-2 border-l-2 border-warning pl-3" onSubmit={event => { event.preventDefault(); void run([...exclusions, { source_id: source.id, reason: exclusionReason }]); }}><label className="investigation-field"><UiText text={"Exclusion reason"} /><input autoFocus required minLength={5} maxLength={500} className="input" value={exclusionReason} onChange={event => setExclusionReason(event.target.value)} /></label><div className="flex gap-2"><button className="btn-accent" disabled={!!busy}><GitCompareArrows size={14} /><UiText text={"Exclude & recalculate"} /></button><button type="button" className="btn-ghost" onClick={() => setExclusionTarget("")}><UiText text={"Cancel"} /></button></div></form>}</article>)}</div>
        </section>}

        {tab === 'brief' && <>
          <section className="investigation-panel"><PanelHeader title={ui("Investigation brief")} icon={Save} /><fieldset disabled={!!busy || historical} className="grid min-w-0 gap-4 sm:grid-cols-2"><label className="investigation-field sm:col-span-2"><UiText text={"Title"} /><input className="input" value={title} maxLength={160} onChange={event => { setTitle(event.target.value); changed(); }} placeholder={ui("Investigation title")} /></label><label className="investigation-field sm:col-span-2"><UiText text={"Officer annotations"} /><textarea className="input min-h-28" value={annotation} maxLength={6000} onChange={event => { setAnnotation(event.target.value); changed(); }} /></label><label className="investigation-field"><UiText text={"Review status"} /><select aria-label={ui("Review status")} className="input" value={reviewStatus} onChange={event => { setReviewStatus(event.target.value as 'draft' | 'reviewed'); changed(); }}><option value="draft"><UiText text={"Draft"} /></option><option value="reviewed"><UiText text={"Reviewed by officer"} /></option></select></label><label className="investigation-field"><UiText text={"Review note"} /><input className="input" minLength={reviewStatus === 'reviewed' ? 5 : undefined} value={reviewNote} maxLength={2000} onChange={event => { setReviewNote(event.target.value); changed(); }} /></label></fieldset></section>
          <section className="investigation-panel"><PanelHeader title={ui("Saved investigation watch")} icon={Bell} /><fieldset disabled={!!busy || historical} className="space-y-4"><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={criteria.enabled} onChange={event => { setCriteria({ ...criteria, enabled: event.target.checked }); changed(); }} /><UiText text={"Watch for matching FIRs and changes to selected records"} /></label>{criteria.enabled && <div className="grid gap-3 sm:grid-cols-3"><label className="investigation-field"><UiText text={"Offence"} /><select aria-label={ui("Offence")} className="input" value={criteria.crime_type} onChange={event => { setCriteria({ ...criteria, crime_type: event.target.value }); changed(); }}><option value=""><UiText text={"Any offence"} /></option>{registryOptions('crime_type').map(value => <option key={value}><UiText text={value} /></option>)}</select></label><label className="investigation-field"><UiText text={"District"} /><select aria-label={ui("District")} className="input" value={criteria.district} onChange={event => { setCriteria({ ...criteria, district: event.target.value }); changed(); }}><option value=""><UiText text={"Any district"} /></option>{registryOptions('district').map(value => <option key={value}><UiText text={value} /></option>)}</select></label><label className="investigation-field"><UiText text={"Recorded phrase"} /><input className="input" maxLength={100} value={criteria.term} onChange={event => { setCriteria({ ...criteria, term: event.target.value }); changed(); }} placeholder={ui("Optional exact phrase")} /></label></div>}<p className="text-xs leading-relaxed text-muted"><UiText text={"Checks run when NETRA opens and every minute while it is active. Existing matches become the baseline when this revision is saved."} /></p></fieldset></section>
          <div className="flex flex-wrap items-center gap-3"><button disabled={!!busy || !analysis || title.trim().length < 3 || historical || (reviewStatus === 'reviewed' && reviewNote.trim().length < 5)} className="btn-accent" onClick={() => void save()}>{buttonBusy('save') || <Save size={16} />}<UiText text={saved ? 'Save new revision' : 'Save investigation'} /></button><span className="text-xs text-muted"><UiText text={!analysis ? 'Compare records before saving.' : dirty ? 'Unsaved changes' : saved ? `Saved ${date(saved.saved_at)}` : 'Ready to save'} /></span></div>
          {saved && <section className="investigation-panel"><PanelHeader title={ui("Revision history")} icon={History} /><div className="space-y-2">{revisions.map(revision => <div key={revision.revision_id} className="border-b border-border py-3 last:border-0"><button disabled={!!busy} className="flex w-full items-center gap-2 text-left text-sm" onClick={() => void openSaved(saved.id, revision.revision_id)}><History size={14} className="text-accent" /><strong><UiText text={"Revision "} /><UiText text={revision.revision_number} /></strong><span className="text-xs text-muted">{date(revision.saved_at)} · <UiText text={revision.review_status} /></span>{saved.revision_id === revision.revision_id && <Check size={14} className="ml-auto text-success" />}</button><ul className="mt-2 space-y-1 text-xs text-muted">{revision.changes.slice(0, 8).map((change, index) => <li key={index}><UiText text={change} /></li>)}</ul></div>)}</div><p className="mt-3 break-all font-mono text-[10px] text-muted"><UiText text={"Snapshot SHA-256: "} /><UiText text={saved.integrity_hash} /></p></section>}
        </>}

        {tab === 'alerts' && <section className="investigation-panel"><div className="flex flex-wrap items-start justify-between gap-3"><PanelHeader title={ui("Investigation updates")} icon={Bell} count={activeAlerts.length} sub={checkedAt ? `Last checked ${date(checkedAt)}` : undefined} /><button className="btn-ghost h-8 text-xs" disabled={!!busy} onClick={() => void loadAlerts(true)}><RefreshCw size={14} /><UiText text={"Check now"} /></button></div>{watchError && <p role="status" className="mb-3 text-xs text-warning"><UiText text={watchError} /></p>}<div className="divide-y divide-border">{activeAlerts.map(alert => <article key={alert.id} className="py-4 first:pt-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={alert.status === 'unread' ? 'accent' : 'muted'}>{alert.kind.replaceAll('_', ' ')}</Badge><span className="text-xs text-muted">{date(alert.detected_at)}</span></div><h3 className="mt-2 text-sm font-semibold"><UiText text={alert.title} /></h3><p className="mt-1 text-xs text-muted"><UiText text={alert.investigation_title} /><UiText text={" · FIR "} />{alert.fir_number || alert.case_id}</p><ul className="mt-2 space-y-1 text-xs text-subtle">{alert.reasons.map(reason => <li key={reason}><UiText text={reason} /></li>)}</ul><div className="mt-3 flex flex-wrap gap-2"><Link href={`/investigations?cases=${[...new Set([...(summaries.find(row => row.id === alert.investigation_id)?.case_ids || []), alert.case_id])].slice(-6).join(',')}`} className="btn-ghost h-8 text-xs"><GitCompareArrows size={13} /><UiText text={"Open comparison"} /></Link><Link href={`/cases/record?id=${alert.case_id}`} className="btn-ghost h-8 text-xs"><FileSearch size={13} /><UiText text={"Open FIR"} /></Link>{alert.status === 'unread' && <button disabled={!!busy} className="btn-ghost h-8 text-xs" onClick={() => void alertAction(alert.id, 'read')}><CheckCheck size={13} /><UiText text={"Reviewed"} /></button>}<button disabled={!!busy} className="btn-ghost h-8 text-xs" onClick={() => void alertAction(alert.id, 'dismissed')}><X size={13} /><UiText text={"Dismiss"} /></button></div></article>)}</div>{!activeAlerts.length && <p className="py-5 text-sm text-muted"><UiText text={"No new matching records or source changes."} /></p>}</section>}
      </div>
    </div>
  </div>;
}
