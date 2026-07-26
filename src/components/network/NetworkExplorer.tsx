"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Network as NetworkIcon, RotateCcw, Filter, MousePointerClick } from "lucide-react";
import { GraphView } from "./GraphView";
import type { GraphEdge, GraphNode } from "@/lib/types";
import { useT } from "@/lib/i18n-client";

interface CrimOption { id: number; name: string; risk_score: number; home_district: string }

const TYPES: { id: GraphNode["type"]; label: string; varName: string }[] = [
  { id: "criminal", label: "Criminals", varName: "--danger" },
  { id: "phone", label: "Phones", varName: "--info" },
  { id: "vehicle", label: "Vehicles", varName: "--warning" },
  { id: "address", label: "Addresses", varName: "--success" },
  { id: "fir", label: "FIRs", varName: "--accent" },
  { id: "organization", label: "Orgs", varName: "--fg" },
];

export function NetworkExplorer({
  options,
  initialGraph,
  initialId,
  initialName,
}: {
  options: CrimOption[];
  initialGraph: { nodes: GraphNode[]; edges: GraphEdge[] };
  initialId?: number;
  initialName?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [graph, setGraph] = useState(initialGraph);
  const [selected, setSelected] = useState<{ id?: number; name: string }>({ id: initialId, name: initialName || "Highest-priority network" });
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  async function load(id: number, name: string) {
    setLoading(true);
    setSelected({ id, name });
    try {
      const res = await fetch(`/api/network/${id}`);
      setGraph(await res.json());
    } finally {
      setLoading(false);
    }
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
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* selector */}
      <div className="card panel-pad">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("network.find")} className="input pl-9" />
        </div>
        <div className="max-h-[520px] space-y-1 overflow-y-auto">
          {suspects.map((o) => (
            <button
              key={o.id}
              onClick={() => load(o.id, o.name)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-elevated ${selected.id === o.id ? "bg-elevated text-fg" : "text-subtle"}`}
            >
              <span className="truncate">{o.name}</span>
              <span className="ml-auto font-mono text-xs text-muted">{o.risk_score}</span>
            </button>
          ))}
        </div>
      </div>

      {/* graph */}
      <div className="card panel-pad">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <NetworkIcon className="h-4 w-4 text-accent" />
          <h2 className="font-display text-base font-semibold">{selected.name}</h2>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
          <span className="ml-auto text-xs text-muted">
            {filtered.nodes.length} nodes · {filtered.edges.length} links · {t("network.expand_hint")}
          </span>
        </div>

        {/* Type filters — click to hide/show a category (declutter the graph) */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted" />
          {TYPES.map((ty) => {
            const off = hidden.has(ty.id);
            return (
              <button
                key={ty.id}
                onClick={() => toggleType(ty.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${off ? "border-border text-muted opacity-50" : "border-border text-subtle hover:text-fg"}`}
                title={off ? `Show ${ty.label}` : `Hide ${ty.label}`}
              >
                <span className="h-2 w-2 rounded-sm" style={{ background: `rgb(var(${ty.varName}))` }} />
                {ty.label}
              </button>
            );
          })}
          {hidden.size > 0 && (
            <button onClick={() => setHidden(new Set())} className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-accent hover:bg-elevated">
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
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          <MousePointerClick className="h-3 w-3" />
          Click a criminal node → open their database record · double-click → expand their network · hover a link to highlight · drag to rearrange · scroll to zoom.
        </p>
      </div>
    </div>
  );
}
