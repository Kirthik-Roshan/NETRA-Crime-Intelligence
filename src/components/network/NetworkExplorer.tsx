"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Network as NetworkIcon, RotateCcw, Filter, MousePointerClick, UserSearch } from "lucide-react";
import { GraphView } from "./GraphView";
import { Avatar, EmptyState } from "@/components/ui";
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

// Canvas affordances, spelled out once so the footer reads as a legend row.
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

  // Static build: all ego-networks are prebuilt, so focus switching is in-memory.
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

  // Apply the type filter (declutter): keep the center + visible-type nodes.
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
    <div className="grid animate-fade-in gap-4 lg:grid-cols-[300px_1fr]">
      {/* selector */}
      <div className="card panel-pad lg:sticky lg:top-[4.5rem] lg:self-start">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <span className="stat-label">Suspect index</span>
          <span className="font-mono text-[11px] tabular-nums text-muted">
            {suspects.length}/{options.length}
          </span>
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("network.find")}
            aria-label={t("network.find")}
            className="input pl-9"
          />
        </div>

        {suspects.length === 0 ? (
          <EmptyState icon={UserSearch} title="No suspect found" hint="Try a different name or spelling." />
        ) : (
          <div className="-mr-2 max-h-[520px] space-y-0.5 overflow-y-auto pr-2">
            {suspects.map((o) => {
              const active = selected.id === o.id;
              const band = riskBand(o.risk_score);
              return (
                <button
                  key={o.id}
                  onClick={() => load(o.id, o.name)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                    active ? "bg-elevated text-fg" : "text-subtle hover:bg-elevated/60 hover:text-fg"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent transition-opacity",
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

      {/* graph */}
      <div className="card panel-pad">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/60 bg-elevated/60">
            <NetworkIcon className="h-4 w-4 text-accent" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-display text-base font-semibold tracking-tight">{selected.name}</h2>
            <p className="mt-0.5 truncate text-xs text-muted">
              {selected.id ? "Depth 1 · direct associations" : t("network.expand_hint")}
            </p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-label="Loading network" />}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <span className="chip font-mono tabular-nums">{filtered.nodes.length} nodes</span>
            <span className="chip font-mono tabular-nums">{filtered.edges.length} links</span>
            {hidden.size > 0 && (
              <span className="chip border-warning/30 bg-warning/10 font-mono tabular-nums text-warning">
                {hidden.size} hidden
              </span>
            )}
          </div>
        </div>

        {/* Type filters — click to hide/show a category (declutter the graph) */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-surface/40 px-2.5 py-2">
          <span className="stat-label mr-1 flex items-center gap-1.5">
            <Filter className="h-3 w-3" />
            Legend
          </span>
          {TYPES.map((ty) => {
            const off = hidden.has(ty.id);
            return (
              <button
                key={ty.id}
                onClick={() => toggleType(ty.id)}
                aria-pressed={!off}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  off
                    ? "border-border/50 text-muted/70 hover:text-muted"
                    : "border-border/70 bg-elevated/50 text-subtle hover:border-accent/40 hover:text-fg"
                )}
                title={off ? `Show ${ty.label}` : `Hide ${ty.label}`}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full transition-opacity"
                  style={{
                    background: `rgb(var(${ty.varName}))`,
                    opacity: off ? 0.3 : 1,
                    boxShadow: off ? "none" : `0 0 0 2px rgb(var(${ty.varName}) / 0.2)`,
                  }}
                />
                <span className={off ? "line-through decoration-1" : undefined}>{ty.label}</span>
              </button>
            );
          })}
          {hidden.size > 0 && (
            <button
              onClick={() => setHidden(new Set())}
              className="ml-auto flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          )}
        </div>

        <GraphView
          data={filtered}
          height={560}
          onNodeFocus={(id) => router.push(`/criminals/${id}`)}
          onNodeExpand={(id, name) => load(id, name)}
        />

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
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
