"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Network as NetworkIcon, RotateCcw, Filter, MousePointerClick, UserSearch, X } from "lucide-react";
import { GraphView } from "./GraphView";
import { Avatar, EmptyState, PanelHeader, Tag } from "@/components/ui";
import { cn, riskBand } from "@/lib/utils";
import type { GraphEdge, GraphNode } from "@/lib/types";
import { useT } from "@/lib/i18n-client";

interface CrimOption { id: number; name: string; risk_score: number; home_district: string }
type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };

const TYPES: { id: GraphNode["type"]; label: string; varName: string }[] = [
  { id: "criminal", label: "Criminals", varName: "--danger" },
  { id: "phone", label: "Phones", varName: "--info" },
  { id: "vehicle", label: "Vehicles", varName: "--warning" },
  { id: "address", label: "Addresses", varName: "--success" },
  { id: "fir", label: "FIRs", varName: "--accent" },
  { id: "organization", label: "Orgs", varName: "--fg" },
];

const HINTS = [
  "Click a criminal node to open their record",
  "Double-click to expand their network",
  "Hover a link to highlight it",
  "Drag to rearrange · scroll to zoom",
];

export function NetworkExplorer({
  options,
  graphs,
}: {
  options: CrimOption[];
  graphs: Record<string, Graph>;
}) {
  const t = useT();
  const router = useRouter();
  const [graph, setGraph] = useState<Graph>(graphs.top);
  const [selected, setSelected] = useState<{ id?: number; name: string }>({ name: "Highest-priority network" });
  const [q, setQ] = useState("");
  const [loading] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function load(id: number, name: string) {
    setSelected({ id, name });
    setGraph(graphs[String(id)] ?? { nodes: [], edges: [] });
  }

  function toggleType(type: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const filtered = useMemo(() => {
    if (hidden.size === 0) return graph;
    const keepNode = (n: GraphNode) => !hidden.has(n.type);
    const keptIds = new Set(graph.nodes.filter(keepNode).map((n) => n.id));
    return {
      nodes: graph.nodes.filter(keepNode),
      edges: graph.edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target)),
    };
  }, [graph, hidden]);

  const suspects = options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);

  return (
    <div className="grid animate-fade-in gap-4 lg:grid-cols-[280px_1fr]">
      {/* Suspect index rail */}
      <div className="card lg:sticky lg:top-[4.5rem] lg:self-start">
        <div className="border-b border-border p-3">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <span className="stat-label">Suspect index</span>
            <span className="font-mono text-[11px] tabular-nums text-muted">
              {suspects.length}/{options.length}
            </span>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("network.find")}
              aria-label={t("network.find")}
              className="h-8 w-full rounded-md border border-border bg-elevated/40 pl-8 pr-8 text-xs text-fg outline-none placeholder:text-muted focus:border-accent/60 focus:bg-elevated/70 focus:ring-2 focus:ring-accent/15"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                aria-label="Clear"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted transition-colors hover:text-fg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {suspects.length === 0 ? (
          <div className="p-3"><EmptyState icon={UserSearch} title="No suspect found" hint="Try a different name or spelling." /></div>
        ) : (
          <div className="-mr-2 max-h-[540px] space-y-0.5 overflow-y-auto p-2 pr-2">
            {suspects.map((o) => {
              const active = selected.id === o.id;
              const band = riskBand(o.risk_score);
              return (
                <button
                  key={o.id}
                  onClick={() => load(o.id, o.name)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "relative flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    active ? "bg-elevated text-fg" : "text-subtle hover:bg-elevated/60 hover:text-fg"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent",
                      active ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Avatar name={o.name} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate leading-tight">{o.name}</span>
                    {o.home_district && (
                      <span className="block truncate text-[11px] leading-tight text-muted">{o.home_district}</span>
                    )}
                  </span>
                  <span className={cn("shrink-0 font-mono text-xs font-semibold tabular-nums", band.color)}>
                    {o.risk_score}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Graph workspace */}
      <div className="card panel-pad">
        <PanelHeader
          icon={NetworkIcon}
          title={selected.name}
          sub={selected.id ? "Depth 1 · direct associations" : t("network.expand_hint")}
          action={
            <div className="flex items-center gap-1.5">
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Loading network" />}
              <Tag mono>{filtered.nodes.length} nodes</Tag>
              <Tag mono>{filtered.edges.length} links</Tag>
              {hidden.size > 0 && (
                <span className="tag border-warning/30 bg-warning/10 text-warning">
                  {hidden.size} hidden
                </span>
              )}
            </div>
          }
        />

        {/* Type filters — the graph legend AND declutter control */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-elevated/40 px-2.5 py-2">
          <span className="stat-label mr-1 flex items-center gap-1.5">
            <Filter className="h-3 w-3" /> Legend
          </span>
          {TYPES.map((ty) => {
            const off = hidden.has(ty.id);
            return (
              <button
                key={ty.id}
                onClick={() => toggleType(ty.id)}
                aria-pressed={!off}
                className={cn(
                  "flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  off
                    ? "border-border/50 bg-transparent text-muted/70 hover:text-muted"
                    : "border-border bg-surface/60 text-subtle hover:border-accent/40 hover:text-fg"
                )}
                title={off ? `Show ${ty.label}` : `Hide ${ty.label}`}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-sm transition-opacity"
                  style={{
                    background: `rgb(var(${ty.varName}))`,
                    opacity: off ? 0.3 : 1,
                  }}
                />
                <span className={off ? "line-through decoration-1" : undefined}>{ty.label}</span>
              </button>
            );
          })}
          {hidden.size > 0 && (
            <button
              onClick={() => setHidden(new Set())}
              className="ml-auto flex items-center gap-1 rounded border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )}
        </div>

        <GraphView
          data={filtered}
          height={580}
          onNodeFocus={(id) => router.push(`/criminals/${id}`)}
          onNodeExpand={(id, name) => load(id, name)}
        />

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2.5 text-[11px] text-muted">
          <MousePointerClick className="h-3 w-3 shrink-0" />
          {HINTS.map((h, i) => (
            <span key={h} className="flex items-center gap-2">
              {i > 0 && <span aria-hidden className="h-1 w-1 rounded-full bg-muted/50" />}
              {h}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
