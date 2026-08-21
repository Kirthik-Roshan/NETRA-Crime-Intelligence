"use client";
import { useState, type ReactNode } from "react";
import { Sparkles, ScanSearch, FileText, Share2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { analyzeCase, type NlpExtract, type NlpSummary, type NlpEntities, type NlpOp } from "@/lib/ai-client";

/**
 * On-demand NLP over the case text, routed through the Catalyst Function
 * (`nlp` mode → QuickML). The text comes from whatever the page already holds
 * (Cloud Scale Data Store); nothing is fetched from a baked DB here. Every op
 * fails honestly — an unconfigured/unreachable Function shows a clear message,
 * never a fabricated result.
 */
export function CaseIntelligence({ text }: { text: string }) {
  const has = text.trim().length > 0;
  const [busy, setBusy] = useState<NlpOp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [extract, setExtract] = useState<NlpExtract | null>(null);
  const [summary, setSummary] = useState<NlpSummary | null>(null);
  const [entities, setEntities] = useState<NlpEntities | null>(null);

  async function run(op: NlpOp) {
    if (!has || busy) return;
    setBusy(op); setErr(null);
    try {
      const r = await analyzeCase<NlpExtract | NlpSummary | NlpEntities>(op, text);
      if (!r) { setErr("QuickML is not connected. Deploy the Function or check the connection — no result was fabricated."); return; }
      if (op === "extract") setExtract(r as NlpExtract);
      else if (op === "summarize") setSummary(r as NlpSummary);
      else setEntities(r as NlpEntities);
    } catch {
      setErr("The intelligence request failed. Try again once the Function is reachable.");
    } finally {
      setBusy(null);
    }
  }

  const ACTIONS: { op: NlpOp; label: string; icon: typeof ScanSearch }[] = [
    { op: "extract", label: "Extract entities", icon: ScanSearch },
    { op: "summarize", label: "Summarize", icon: FileText },
    { op: "entities", label: "Link entities", icon: Share2 },
  ];

  return (
    <div className="card panel-pad">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold">AI Case Intelligence</h3>
        <Badge tone="accent">QuickML</Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.op}
            onClick={() => run(a.op)}
            disabled={!has || !!busy}
            className="btn-ghost h-8 py-0 text-xs disabled:opacity-40"
          >
            {busy === a.op ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <a.icon className="h-3.5 w-3.5" />}
            {a.label}
          </button>
        ))}
      </div>

      {!has && <p className="mt-3 text-xs text-muted">No case text available to analyse yet.</p>}
      {err && <p className="mt-3 text-xs text-danger">{err}</p>}

      {summary && (
        <Section title="Summary" confidence={summary.confidence}>
          <p className="text-sm leading-relaxed text-subtle">{summary.summary || "—"}</p>
        </Section>
      )}

      {extract && (
        <Section title="Extracted entities" confidence={extract.confidence}>
          {(() => {
            const groups: [string, string[]][] = [
              ["Names", extract.names], ["Locations", extract.locations], ["Dates", extract.dates],
              ["Organizations", extract.organizations], ["Vehicles", extract.vehicles],
              ["Phones", extract.phones], ["Financial", extract.financial],
            ].filter(([, v]) => Array.isArray(v) && v.length > 0) as [string, string[]][];
            if (!groups.length) return <p className="text-xs text-muted">No entities found in the text.</p>;
            return (
              <div className="space-y-2">
                {groups.map(([label, vals]) => (
                  <div key={label}>
                    <div className="stat-label mb-1">{label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {vals.map((v, i) => (
                        <span key={i} className="rounded-md border border-border bg-elevated px-2 py-0.5 text-[11px] text-subtle">{v}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </Section>
      )}

      {entities && (
        <Section title="Entity links" confidence={entities.confidence}>
          {entities.links.length === 0 ? (
            <p className="text-xs text-muted">No relationships supported by the text.</p>
          ) : (
            <div className="space-y-1.5">
              {entities.links.map((l, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span className="font-medium text-subtle">{l.from}</span>
                  <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">{l.type}</span>
                  <span className="font-medium text-subtle">{l.to}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted">{Math.round(l.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

function Section({ title, confidence, children }: { title: string; confidence: number; children: ReactNode }) {
  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="stat-label">{title}</span>
        <span className="font-mono text-[10px] text-muted">confidence {Math.round((confidence || 0) * 100)}%</span>
      </div>
      {children}
    </div>
  );
}
