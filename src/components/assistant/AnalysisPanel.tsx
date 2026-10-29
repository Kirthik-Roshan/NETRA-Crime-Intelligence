"use client";
import { UiText, useUiText, useUiLocale } from '@/components/UiText';


import { useState } from 'react';
import dynamic from 'next/dynamic';
import { BarChart3, MapPin, Network, GitCompareArrows, Bell, ChevronLeft, ChevronRight, ExternalLink, ShieldCheck } from 'lucide-react';
import { BarSeries, TrendLine, Donut } from '@/components/charts';
import AppLink from '@/components/AppLink';
import type { AnalysisContext, AssistantAnalysis } from '@/lib/assistant-analysis';
import './analysis.css';

const CrimeMap = dynamic(() => import('@/components/maps/CrimeMap'), { ssr: false, loading: () => <div className="h-[340px] animate-pulse bg-elevated" aria-label="Loading incident map" /> });
const EvidenceGraph = dynamic(() => import('@/components/investigations/InvestigationGraph'), { ssr: false, loading: () => <div className="h-[340px] animate-pulse bg-elevated" aria-label="Loading evidence graph" /> });

export type AskAnalysis = (question: string, context?: AnalysisContext) => void;

export function AnalysisPanel({ analysis: a, onAsk }: { analysis: AssistantAnalysis; onAsk: AskAnalysis }) {
  const ui = useUiText();
  const locale = useUiLocale();
  const [selected, setSelected] = useState<number[]>(a.context.case_ids);
  const [page, setPage] = useState(0);
  const [findingId, setFindingId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [selectionError, setSelectionError] = useState('');
  const comparison = a.comparison;
  const finding = comparison?.findings.find(item => item.id === findingId);
  const source = comparison?.sources.find(item => item.id === sourceId);
  const freshness = a.warnings.find(warning => warning.startsWith('Latest incident date in this scope:'));
  const actions = [
    { view: 'bar', label: 'Chart', icon: BarChart3, query: 'Show these FIRs by district' },
    { view: 'map', label: 'Map', icon: MapPin, query: 'Show these FIRs on a map' },
    { view: 'periods', label: 'Periods', icon: GitCompareArrows, query: 'Compare these FIR patterns over the last 30 days with the previous period' },
    { view: 'warnings', label: 'Warnings', icon: Bell, query: 'What changed in this scope over the last 30 days? Show early warnings' },
  ];
  const toggle = (id: number) => {
    setSelectionError('');
    if (selected.includes(id)) setSelected(selected.filter(value => value !== id));
    else if (selected.length < 6) setSelected([...selected, id]);
    else setSelectionError('Select up to six FIRs for a comparison.');
  };
  const request = (question: string, change: Partial<AnalysisContext> = {}) => onAsk(question, { ...a.context, ...change });
  return <section className="assistant-analysis" aria-label={ui("Source-backed analysis")}>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
      <div className="min-w-0"><h4 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-accent" /><UiText text={"Recorded-data analysis"} /></h4><p className="mt-1 break-words text-xs text-muted"><UiText text={a.scope} /></p><p className="mt-1 text-xs text-muted"><UiText text={a.total} /><UiText text={" matching FIRs · Retrieved "} />{new Date(a.generated_at).toLocaleString(locale)}</p><p className="mt-1 text-xs text-muted"><UiText text={"Latest incident in scope: "} />{a.latest_incident || 'No valid incident date'}</p></div>
      <div className="flex flex-wrap gap-1 print:hidden" role="group" aria-label={ui("Analysis views")}>
        {actions.map(({ view, label, icon: Icon, query }) => <button key={view} title={label} aria-pressed={a.context.view === view} className="btn-ghost !px-2 !py-1 text-xs" onClick={() => request(query, ['periods', 'warnings'].includes(view) ? { case_ids: [], exclusions: [] } : {})}><Icon className="h-4 w-4" /><UiText text={label} /></button>)}
      </div>
    </div>

    {freshness && <p role="status" className="border-l-2 border-warning bg-warning/5 px-3 py-2 text-xs text-muted"><UiText text={freshness} /></p>}

    {['bar', 'line', 'pie'].includes(a.context.view) && <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold"><UiText text={"FIR count"} /></span><select aria-label={ui("Group FIRs by")} className="input !w-auto !py-1 text-xs print:hidden" value={a.context.group} onChange={e => request(e.target.value === 'month' ? 'Show these FIRs by month' : e.target.value === 'crime_type' ? 'Show these FIRs by offence' : 'Show these FIRs by district')}><option value="district"><UiText text={"District"} /></option><option value="crime_type"><UiText text={"Offence"} /></option><option value="month"><UiText text={"Incident month"} /></option></select></div>
      {a.rows.length ? <div className="h-[260px] min-w-0">{a.context.view === 'pie' ? <Donut data={a.rows} nameKey="label" valueKey="count" includeOthers height={260} /> : a.context.view === 'line' ? <TrendLine data={a.rows} x="label" y="count" height={260} /> : <BarSeries data={a.rows} x="label" y="count" height={260} />}</div> : <p className="py-8 text-sm text-muted"><UiText text={"No FIRs match these filters."} /></p>}
      <details className="mt-2"><summary className="cursor-pointer text-xs text-accent"><UiText text={"Counts and source coverage"} /></summary><div className="analysis-table-scroll"><table><thead><tr><th><UiText text={"Group"} /></th><th><UiText text={"FIRs"} /></th></tr></thead><tbody>{a.rows.map(row => <tr key={row.label}><td><UiText text={row.label} /></td><td><UiText text={row.count} /></td></tr>)}</tbody></table></div></details>
    </div>}

    {a.context.view === 'map' && <div>
      <p className="mb-2 text-xs text-muted"><UiText text={a.points.length} /><UiText text={" geolocated FIRs"} /><UiText text={a.points_truncated ? ' shown (1,000-point display limit)' : ''} /><UiText text={" · Incident locations"} /></p>
      {a.points.length ? <CrimeMap points={a.points} height={340} initialView="incident" /> : <p className="py-8 text-sm text-muted"><UiText text={"No usable Karnataka coordinates in this selection."} /></p>}
    </div>}

    {a.periods && <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden"><label className="text-xs text-muted"><UiText text={"Window length"} /><select className="input mt-1 !w-auto !py-1" aria-label={ui("Comparison window length")} value={a.context.days || 30} onChange={e => request('Compare these periods', { days: Number(e.target.value) })}>{![7, 30, 90, 180, 365].includes(a.context.days || 30) && <option value={a.context.days || 30}><UiText text={a.context.days} /><UiText text={" days"} /></option>}{[7, 30, 90, 180, 365].map(days => <option key={days} value={days}><UiText text={days} /><UiText text={" days"} /></option>)}</select></label><label className="text-xs text-muted"><UiText text={"Window ending"} /><input type="date" className="input mt-1 !w-auto !py-1" aria-label={ui("Comparison window ending")} value={a.context.end_date || a.periods.current_end} onChange={e => { if (e.target.value) request('Compare these periods', { end_date: e.target.value }); }} /></label>{a.latest_incident && a.latest_incident < a.periods.current_start && <button className="btn-ghost text-xs" onClick={() => request('Compare these periods', { end_date: a.latest_incident })}><UiText text={"Compare at latest recorded incident"} /></button>}</div>
      <div className="grid grid-cols-2 gap-4 border-b border-border pb-3"><div><p className="text-xs text-muted"><UiText text={"Current: "} /><UiText text={a.periods.current_start} /><UiText text={" to "} /><UiText text={a.periods.current_end} /></p><strong className="text-2xl"><UiText text={a.periods.current} /></strong><span className="ml-2 text-xs text-muted"><UiText text={"FIRs"} /></span></div><div><p className="text-xs text-muted"><UiText text={"Previous: "} /><UiText text={a.periods.previous_start} /><UiText text={" to "} /><UiText text={a.periods.previous_end} /></p><strong className="text-2xl"><UiText text={a.periods.previous} /></strong><span className="ml-2 text-xs text-muted"><UiText text={"FIRs"} /></span></div></div>
      <div className="analysis-table-scroll"><table><thead><tr><th><UiText text={"District"} /></th><th><UiText text={"Current"} /></th><th><UiText text={"Previous"} /></th><th><UiText text={"Change"} /></th><th><UiText text={"Review signal"} /></th></tr></thead><tbody>{a.periods.changes.map(row => <tr key={row.label}><td><UiText text={row.label} /></td><td><UiText text={row.current} /></td><td><UiText text={row.previous} /></td><td><UiText text={row.delta > 0 ? '+' : ''} /><UiText text={row.delta} /> (<UiText text={row.percent == null ? 'no baseline' : `${row.percent}%`} />)</td><td>{row.flagged ? <span className="text-warning"><UiText text={"Review increase"} /></span> : 'Below rule threshold'}</td></tr>)}</tbody></table></div>
      {!a.periods.changes.length && <p className="py-4 text-sm text-muted"><UiText text={"No dated FIRs in either window."} /></p>}
    </div>}

    {comparison && <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-xs"><span><UiText text={comparison.counts.support} /><UiText text={" supporting signals"} /></span><span className="text-danger"><UiText text={comparison.counts.conflicts} /><UiText text={" conflicts"} /></span><span><UiText text={comparison.counts.excluded} /><UiText text={" excluded sources"} /></span></div>
      <EvidenceGraph analysis={comparison} onFinding={setFindingId} />
      <div className="grid gap-2 sm:grid-cols-2">{comparison.findings.map(item => <button key={item.id} className={`analysis-finding text-left ${!item.active ? 'opacity-60' : ''}`} onClick={() => setFindingId(item.id)} aria-pressed={findingId === item.id}><span className="block text-[10px] uppercase text-muted"><UiText text={!item.active ? 'Inactive after exclusion' : item.kind === 'conflict' ? 'Conflicting evidence' : 'Supporting signal'} /></span><strong className="text-xs"><UiText text={item.title} /></strong></button>)}</div>
      {!comparison.findings.length && <p className="text-sm text-muted"><UiText text={"No recorded connection found in the selected sources."} /></p>}
      {finding && <div className="border-l-2 border-accent pl-3" aria-live="polite"><h5 className="text-sm font-semibold"><UiText text={finding.title} /></h5><p className="mt-1 text-sm text-muted"><UiText text={finding.detail} /></p><p className="mt-1 text-xs text-muted"><UiText text={finding.active ? 'Supported by included sources' : 'Support removed after exclusion'} /> · <UiText text={finding.strength.replace(/_/g, ' ')} /></p><div className="mt-2 flex flex-wrap gap-2">{finding.source_ids.map(id => <button key={id} className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setSourceId(id); setReason(''); }}>{comparison.sources.find(item => item.id === id)?.label || id}</button>)}</div></div>}
      <details><summary className="cursor-pointer text-xs font-semibold text-accent"><UiText text={"Evidence sources ("} /><UiText text={comparison.sources.length} />)</summary><div className="mt-2 flex flex-wrap gap-2">{comparison.sources.map(item => <button key={item.id} className="btn-ghost !px-2 !py-1 text-xs" onClick={() => { setSourceId(item.id); setReason(''); }}><UiText text={item.excluded ? 'Excluded: ' : ''} /><UiText text={item.label} /></button>)}</div></details>
      {source && <div className="space-y-2 border-l-2 border-warning pl-3" aria-label={ui("Selected evidence source")}><h5 className="break-words text-sm font-semibold"><UiText text={source.label} /></h5><p className="text-xs text-muted"><UiText text={source.table} /> #<UiText text={source.record_id} /> · <UiText text={source.origin} /></p><p className="whitespace-pre-wrap break-words text-sm">{source.excerpt || 'No narrative recorded.'}</p><p className="break-all text-[10px] text-muted"><UiText text={"Source fingerprint: "} /><UiText text={source.fingerprint} /></p>{source.excluded ? <><p className="text-xs text-warning"><UiText text={"Excluded: "} /><UiText text={source.exclusion_reason} /></p><button className="btn-ghost print:hidden" onClick={() => request('Restore source to this comparison', { exclusions: a.context.exclusions.filter(item => item.source_id !== source.id) })}><UiText text={"Restore source"} /></button></> : <div className="flex flex-wrap items-end gap-2 print:hidden"><label className="min-w-0 flex-1 text-xs"><UiText text={"Exclusion reason"} /><input className="input mt-1" value={reason} maxLength={500} onChange={e => setReason(e.target.value)} /></label><button className="btn-ghost" disabled={reason.trim().length < 5} onClick={() => request('Exclude source from this comparison', { exclusions: [...a.context.exclusions.filter(item => item.source_id !== source.id), { source_id: source.id, reason: reason.trim() }] })}><UiText text={"Exclude & recalculate"} /></button></div>}</div>}
      <div><h5 className="text-xs font-semibold"><UiText text={"Missing information"} /></h5><ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted">{comparison.gaps.map((gap, i) => <li key={i}><UiText text={gap.title} />: <UiText text={gap.detail} /></li>)}</ul></div>
      <div><h5 className="text-xs font-semibold"><UiText text={"Next checks"} /></h5><ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted">{comparison.next_checks.map(item => <li key={item}><UiText text={item} /></li>)}</ul></div>
      <AppLink href={`/investigations/?cases=${comparison.cases.map(item => item.id).join(',')}`} className="inline-flex items-center gap-1 text-xs text-accent print:hidden"><UiText text={"Open saved-brief workspace "} /><ExternalLink className="h-3 w-3" /></AppLink>
    </div>}

    {!comparison && a.records.length > 0 && <details><summary className="cursor-pointer text-xs font-semibold text-accent"><UiText text={"Matching FIRs · Select records for comparison"} /></summary><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-muted"><UiText text={selected.length} /><UiText text={"/6 selected · "} /><UiText text={a.records_truncated ? `First ${a.records.length} of ${a.total} shown; narrow the question for other records` : `${a.total} records`} /></span><button className="btn-ghost print:hidden" disabled={selected.length < 2} onClick={() => request('Compare selected FIRs and explain their documented connections', { case_ids: selected, exclusions: [] })}><Network className="h-4 w-4" /><UiText text={"Compare selected FIRs"} /></button></div>{selectionError && <p role="alert" className="text-xs text-warning"><UiText text={selectionError} /></p>}<div className="analysis-table-scroll"><table><thead><tr><th className="print:hidden"><UiText text={"Select"} /></th><th><UiText text={"FIR"} /></th><th><UiText text={"Offence"} /></th><th><UiText text={"District"} /></th><th><UiText text={"Incident"} /></th></tr></thead><tbody>{a.records.slice(page * 10, page * 10 + 10).map(row => <tr key={row.id}><td className="print:hidden"><input type="checkbox" aria-label={`Select FIR ${row.fir_number}`} checked={selected.includes(row.id)} onChange={() => toggle(row.id)} /></td><td><AppLink href={`/cases/record/?id=${row.id}`} className="text-accent"><UiText text={row.fir_number} /></AppLink></td><td><UiText text={row.crime_type} /></td><td><UiText text={row.district} /></td><td>{row.occurred_at.slice(0, 10) || 'Not recorded'}</td></tr>)}</tbody></table></div><div className="mt-2 flex items-center justify-end gap-2 text-xs print:hidden"><button className="btn-ghost !p-1" aria-label={ui("Previous FIR page")} title={ui("Previous FIR page")} disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></button><span>{page + 1} / {Math.ceil(a.records.length / 10)}</span><button className="btn-ghost !p-1" aria-label={ui("Next FIR page")} title={ui("Next FIR page")} disabled={(page + 1) * 10 >= a.records.length} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></button></div></details>}
    <details className="text-xs text-muted"><summary className="cursor-pointer"><UiText text={"Coverage and limitations"} /></summary><ul className="mt-2 list-disc space-y-1 pl-4">{a.warnings.map(warning => <li key={warning}><UiText text={warning} /></li>)}</ul><p className="mt-2 break-all"><UiText text={"Snapshot SHA-256: "} /><UiText text={a.fingerprint} /></p></details>
  </section>;
}
