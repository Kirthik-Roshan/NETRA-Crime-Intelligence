"use client";
import { UiText, useUiText } from '@/components/UiText';


import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FileDown, Loader2, MessageSquareText, RotateCcw } from 'lucide-react';
import { libraryCall, exportConversationPdf, type ConversationMessage, type RagSource } from '@/lib/ai-client';
import { presentReport } from '@/lib/report-export';
import { useReportPrint } from '@/lib/use-report-print';
import { Translated } from '@/components/Translated';
import { useAppStore } from '@/store/useAppStore';

type Reply = { answer: string; sources: RagSource[]; audit_id?: string; model?: string };
type Turn = Reply & { question: string };

export function EvidenceChat({ recordId, evidenceId }: { recordId?: string | null; evidenceId?: number }) {
  const ui = useUiText();
  const language = useAppStore(store => store.lang);
  const [query, setQuery] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true), pending = useRef(false);
  const feed = useRef<HTMLDivElement>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }); }, [turns.length, busy]);
  const available = !!(recordId || evidenceId);
  const ask = async (question: string) => {
    if (pending.current || !question.trim() || !available) return;
    pending.current = true; setBusy(true); setError(''); setQuery('');
    const history: ConversationMessage[] = turns.slice(-3).flatMap(turn => [{ role: 'user', content: turn.question }, { role: 'assistant', content: turn.answer }]);
    try {
      const reply = await libraryCall<Reply>({ mode: 'evidence:chat', record_id: recordId, evidence_id: evidenceId, query: question.trim(), history, language });
      if (typeof reply.answer !== 'string') throw new Error('The deployed Function does not support evidence chat yet. Deploy the matching Function and Web Client revision.');
      if (active.current) setTurns(previous => [...previous, { ...reply, question: question.trim() }]);
    } catch (cause) {
      if (active.current) { setError(cause instanceof Error ? cause.message : 'This evidence could not be queried.'); setQuery(question); }
    } finally { if (active.current) { setBusy(false); pending.current = false; } }
  };
  const exportPdf = async (preview = false) => {
    if (pdfBusy) return;
    setPdfBusy(true); setError('');
    try {
      const result = await exportConversationPdf(turns.map(turn => ({ question: turn.question, answer: turn.answer, sources: turn.sources, audit_id: turn.audit_id || '' })), 'NETRA Evidence Conversation', preview);
      await presentReport(result);
      if (result.warning) setError(result.warning);
    } catch (cause) { if (active.current) setError(cause instanceof Error ? cause.message : 'Export failed.'); }
    finally { if (active.current) setPdfBusy(false); }
  };
  useReportPrint(() => exportPdf(true), turns.length > 0);
  return <section aria-label={ui("Evidence conversation")} className="mt-5 min-w-0 border-t border-border pt-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="flex items-center gap-2 text-sm font-semibold"><MessageSquareText className="h-4 w-4 text-accent" /><UiText text={"Ask about this evidence"} /></h3><p className="mt-1 text-xs text-muted"><UiText text={"Saved Zia observations and this exhibit’s current FIR links · English & ಕನ್ನಡ"} /></p></div>
      {!!turns.length && <div className="flex gap-1"><button type="button" className="btn-ghost !p-2" aria-label={ui("Clear evidence conversation")} title={ui("Clear conversation")} disabled={busy} onClick={() => setTurns([])}><RotateCcw className="h-4 w-4" /></button><button type="button" className="btn-ghost !p-2" aria-label={ui("Export evidence conversation")} title={ui("Export PDF")} disabled={pdfBusy} onClick={() => void exportPdf()}>{pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}</button></div>}
    </div>
    {!available && <p className="mt-3 text-sm text-warning"><UiText text={"Save the evidence analysis successfully before asking questions."} /></p>}
    {!turns.length && <div className="mt-3 flex flex-wrap gap-2">{['Summarize this analysis', 'Which FIR is linked?', 'What information is missing?'].map(question => <button key={question} type="button" className="chip hover:border-accent hover:text-accent disabled:opacity-50" disabled={!available || busy} onClick={() => void ask(question)}><UiText text={question} /></button>)}</div>}
    <div ref={feed} className="mt-3 max-h-[480px] space-y-4 overflow-y-auto overscroll-contain [overflow-wrap:anywhere]" aria-live="polite" aria-busy={busy}>
      {turns.map((turn, index) => <article key={index} className="border-b border-border/60 pb-4">
        <p className="text-sm font-semibold text-accent"><UiText text={turn.question} /></p>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed"><Translated text={turn.answer} /></p>
        {!!turn.sources?.length && <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer"><UiText text={"Sources · "} /><UiText text={turn.sources.length} /></summary><ul className="mt-2 space-y-2">{turn.sources.map((source, item) => <li key={item}><span className="font-semibold text-subtle"><UiText text={source.title} /></span><p className="mt-1 whitespace-pre-line"><UiText text={source.snippet} /></p></li>)}</ul></details>}
        <p className="mt-2 text-[10px] text-muted"><UiText text={turn.model} /><UiText text={" · Audit "} />{turn.audit_id || 'not confirmed'}</p>
      </article>)}
      {busy && <p role="status" className="flex items-center gap-2 py-2 text-xs text-accent"><Loader2 className="h-4 w-4 animate-spin" /><UiText text={"Checking the saved analysis and linked records…"} /></p>}
    </div>
    {error && <p role="alert" className="my-2 break-words text-xs text-danger"><UiText text={error} /></p>}
    <form className="mt-3 flex min-w-0 items-end gap-2" onSubmit={event => { event.preventDefault(); void ask(query); }}>
      <label className="min-w-0 flex-1"><span className="sr-only"><UiText text={"Evidence question"} /></span><textarea rows={2} maxLength={5000} value={query} disabled={!available || busy} onChange={event => setQuery(event.target.value)} className="input w-full resize-y text-sm" placeholder={ui("Ask a follow-up about this scan or its linked FIR…")} /></label>
      <button className="btn-accent shrink-0" disabled={!available || busy || !query.trim()} aria-label={ui("Ask evidence question")}><UiText text={"Ask "} /><ArrowRight className="h-4 w-4" /></button>
    </form>
    <p className="mt-2 text-[10px] text-muted"><UiText text={"Observations are investigative leads. A file match or case association does not establish guilt."} /></p>
  </section>;
}
