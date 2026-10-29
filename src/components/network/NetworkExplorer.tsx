"use client";
import { matchesUiText } from '@/lib/ui-kannada';
import { UiText, useUiText } from '@/components/UiText';


import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  FileText,
  Filter,
  Layers3,
  Loader2,
  Network as NetworkIcon,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  UserSearch,
  X,
} from "lucide-react";
import { navigateAppRoute } from "@/lib/auth-client";
import { GraphView } from "./GraphView";
import { Avatar, EmptyState, PanelHeader, Segmented, Tag } from "@/components/ui";
import { cn, riskBand } from "@/lib/utils";
import type { GraphEdge, GraphNode } from "@/lib/types";
import type { NetworkOption } from "@/lib/cloud-network";
import { useT } from "@/lib/i18n-client";

type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };
type ViewMode = "focused" | "all";
type TimeRange = "6m" | "12m" | "all";

const TYPES: { id: GraphNode["type"]; label: string; className: string }[] = [
  { id: "criminal", label: "Co-accused", className: "bg-warning" },
  { id: "fir", label: "Official FIRs", className: "bg-accent" },
  { id: "victim", label: "Victims", className: "bg-danger" },
  { id: "complainant", label: "Complainants", className: "bg-info" },
  { id: "station", label: "Police stations", className: "bg-success" },
];

export function NetworkExplorer({
  options,
  graphs,
  loading = false,
  error = null,
  onRefresh,
}: {
  options: NetworkOption[];
  graphs: Record<string, Graph>;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void | Promise<void>;
}) {
  const ui = useUiText();
  const t = useT();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set(["victim", "complainant"]));
  const [viewMode, setViewMode] = useState<ViewMode>("focused");
  const [timeRange, setTimeRange] = useState<TimeRange>("6m");

  const topFocusId = Number(graphs.top?.nodes.find((node) => node.meta?.focus)?.id.split(":")[1] || 0);
  const selected = options.find((option) => option.id === selectedId)
    || options.find((option) => option.id === topFocusId)
    || options[0];
  const graph = selected ? (graphs[String(selected.id)] || graphs.top) : (graphs.top || { nodes: [], edges: [] });

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  function load(id: number) {
    setSelectedId(id);
    setHidden(new Set(["victim", "complainant"]));
  }

  function toggleType(type: string) {
    setHidden((previous) => {
      const next = new Set(previous);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const focus = graph.nodes.find((node) => node.meta?.focus) || graph.nodes[0];
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const cutoff = new Date();
    if (timeRange !== "all") cutoff.setMonth(cutoff.getMonth() - (timeRange === "6m" ? 6 : 12));
    const inTimeRange = (node: GraphNode | undefined) => {
      if (!node || node.type !== "fir" || timeRange === "all") return true;
      const date = new Date(String(node.meta?.occurred_at || ""));
      return !Number.isNaN(date.getTime()) && date >= cutoff;
    };
    const eligible = graph.edges.filter((edge) => {
      const source = nodeById.get(edge.source);
      const target = nodeById.get(edge.target);
      return source && target && !hidden.has(source.type) && !hidden.has(target.type) && inTimeRange(source) && inTimeRange(target);
    });
    const visibleEdges: GraphEdge[] = [];
    const keptIds = new Set<string>();
    if (focus && !hidden.has(focus.type)) keptIds.add(focus.id);

    if (viewMode === "all") {
      visibleEdges.push(...eligible);
      eligible.forEach((edge) => { keptIds.add(edge.source); keptIds.add(edge.target); });
    } else if (focus) {
      const limits: Partial<Record<GraphNode["type"], number>> = {
        criminal: 8, fir: 6, victim: 5, complainant: 5, station: 6,
      };
      const counts = new Map<GraphNode["type"], number>();
      const admit = (edge: GraphEdge, candidateId: string) => {
        const candidate = nodeById.get(candidateId);
        if (!candidate) return false;
        if (keptIds.has(candidateId)) {
          visibleEdges.push(edge);
          keptIds.add(edge.source); keptIds.add(edge.target);
          return true;
        }
        const current = counts.get(candidate.type) || 0;
        if (current >= (limits[candidate.type] || 4)) return false;
        counts.set(candidate.type, current + 1);
        visibleEdges.push(edge);
        keptIds.add(edge.source); keptIds.add(edge.target);
        return true;
      };

      for (const edge of eligible) {
        if (edge.source === focus.id) admit(edge, edge.target);
        else if (edge.target === focus.id) admit(edge, edge.source);
      }
      for (const edge of eligible) {
        if (visibleEdges.includes(edge)) continue;
        const sourceKept = keptIds.has(edge.source);
        const targetKept = keptIds.has(edge.target);
        if (sourceKept === targetKept) continue;
        admit(edge, sourceKept ? edge.target : edge.source);
      }
    }

    if (focus && !hidden.has(focus.type)) keptIds.add(focus.id);
    return {
      nodes: graph.nodes.filter((node) => keptIds.has(node.id)),
      edges: visibleEdges,
    };
  }, [graph, hidden, timeRange, viewMode]);

  const suspects = useMemo(() => {
    const term = query.trim().toLowerCase();
    return options.filter((option) => !term || [option.name, option.home_district]
      .some((value) => matchesUiText([value], term)));
  }, [options, query]);

  const stats = useMemo(() => ({
    people: graph.nodes.filter((node) => node.type === "criminal" && !node.meta?.focus).length,
    firs: graph.nodes.filter((node) => node.type === "fir").length,
    context: graph.nodes.filter((node) => ["victim", "complainant", "station"].includes(node.type)).length,
    verified: graph.edges.filter((edge) => edge.confidence >= 0.95).length,
  }), [graph]);

  return (
    <div className="network-workspace grid min-w-0 animate-fade-in items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="card overflow-hidden xl:sticky xl:top-[4.5rem] xl:self-start">
        <div className="border-b border-border p-3">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <span className="stat-label"><UiText text={"Accused profiles"} /></span>
            <span className="font-mono text-[11px] tabular-nums text-muted">
              <UiText text={suspects.length} />/<UiText text={options.length} />
            </span>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("network.find")}
              aria-label={t("network.find")}
              className="h-9 w-full rounded-md border border-border bg-elevated/40 pl-8 pr-8 text-xs text-fg outline-none placeholder:text-muted focus:border-accent/60 focus:bg-elevated/70 focus:ring-2 focus:ring-accent/15"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={ui("Clear search")}
                title={ui("Clear search")}
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-muted transition-colors hover:bg-elevated hover:text-fg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {loading && options.length === 0 ? (
          <div className="grid min-h-[360px] place-items-center p-4 text-center">
            <div>
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-accent" />
              <p className="mt-2 text-xs text-muted"><UiText text={"Building official relationships..."} /></p>
            </div>
          </div>
        ) : suspects.length === 0 ? (
          <div className="p-3"><EmptyState icon={UserSearch} title={ui("No accused found")} hint={ui("Try a name or district.")} /></div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto overscroll-contain p-2 xl:max-h-[min(650px,calc(100dvh-12rem))]">
            {suspects.map((option) => {
              const active = selected?.id === option.id;
              const band = riskBand(option.risk_score);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => load(option.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "relative mb-0.5 flex w-full items-center gap-2.5 rounded-md border px-2 py-2 text-left transition-colors",
                    active
                      ? "border-accent/30 bg-accent/10 text-fg"
                      : "border-transparent text-subtle hover:border-border hover:bg-elevated/60 hover:text-fg",
                  )}
                >
                  <Avatar name={option.name} size={30} profileId={option.id} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium leading-tight"><UiText text={option.name} /></span>
                    <span className="mt-1 flex items-center gap-1.5 truncate text-[10px] leading-tight text-muted">
                      <NetworkIcon className="h-2.5 w-2.5 shrink-0" /> <UiText text={option.link_count} /><UiText text={" links"} /><span aria-hidden>·</span> {option.home_district || "District unknown"}
                    </span>
                  </span>
                  <span className={cn("shrink-0 font-mono text-[11px] font-semibold tabular-nums", band.color)} title={`${band.label} risk`}>
                    <UiText text={option.risk_score} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <section className="card min-w-0 p-3 sm:p-4">
        <PanelHeader
          icon={NetworkIcon}
          title={selected?.name || "Relationship map"}
          sub={selected ? `${selected.home_district || "District not recorded"} · official KSP accused profile` : "Select an accused profile"}
          action={
            <div className="hidden items-center gap-1.5 sm:flex">
              {loading && <Loader2 className="h-4 w-4 animate-spin text-accent" aria-label={ui("Refreshing relationship data")} />}
              <label className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-[10px] text-muted" title={ui("Limit FIR relationships by incident date")}>
                <CalendarDays className="h-3.5 w-3.5 text-accent" />
                <span className="hidden sm:inline"><UiText text={"Recent"} /></span>
                <select value={timeRange} onChange={(event) => setTimeRange(event.target.value as TimeRange)} className="bg-transparent font-medium text-fg outline-none">
                  <option value="6m"><UiText text={"6 months"} /></option>
                  <option value="12m"><UiText text={"12 months"} /></option>
                  <option value="all"><UiText text={"All time"} /></option>
                </select>
              </label>
              <Tag mono><UiText text={graph.nodes.length} /><UiText text={" records"} /></Tag>
              <Tag mono><UiText text={graph.edges.length} /><UiText text={" links"} /></Tag>
              <button
                type="button"
                onClick={() => void onRefresh?.()}
                disabled={loading}
                aria-label={ui("Refresh official relationships")}
                title={ui("Refresh official relationships")}
                className="btn-icon h-8 w-8"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              </button>
            </div>
          }
        />
        <div className="mb-3 flex items-center gap-1.5 sm:hidden">
          <label className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border bg-surface px-2 text-[10px] text-muted">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-accent" />
            <select value={timeRange} onChange={(event) => setTimeRange(event.target.value as TimeRange)} className="min-w-0 flex-1 bg-transparent font-medium text-fg outline-none"><option value="6m"><UiText text={"Recent 6 months"} /></option><option value="12m"><UiText text={"Recent 12 months"} /></option><option value="all"><UiText text={"All time"} /></option></select>
          </label>
          <Tag mono><UiText text={graph.nodes.length} /><UiText text={" nodes"} /></Tag>
          <button type="button" onClick={() => void onRefresh?.()} disabled={loading} className="btn-icon h-8 w-8" title={ui("Refresh relationships")}><RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /></button>
        </div>

        {error && (
          <div className="mb-3 flex items-start gap-2 border border-danger/25 bg-danger/5 px-3 py-2 text-xs text-danger">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1"><UiText text={error} /></span>
            <button type="button" onClick={() => void onRefresh?.()} className="font-semibold underline underline-offset-2"><UiText text={"Retry"} /></button>
          </div>
        )}

        <div className="mb-3 grid grid-cols-2 border-y border-border sm:grid-cols-4">
          <NetworkStat icon={UserRound} label={ui("Co-accused")} value={stats.people} />
          <NetworkStat icon={FileText} label={ui("Linked FIRs")} value={stats.firs} />
          <NetworkStat icon={Layers3} label={ui("Case context")} value={stats.context} />
          <NetworkStat icon={ShieldCheck} label={ui("Verified links")} value={stats.verified} />
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="stat-label mr-1 flex items-center gap-1.5">
              <Filter className="h-3 w-3" /><UiText text={" Show"} /></span>
            {TYPES.map((type) => {
              const off = hidden.has(type.id);
              return (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => toggleType(type.id)}
                  aria-pressed={!off}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded border px-2 text-[11px] font-medium transition-colors",
                    off ? "border-border/60 text-muted opacity-60" : "border-border bg-elevated/60 text-subtle hover:border-accent/40",
                  )}
                  title={off ? `Show ${type.label}` : `Hide ${type.label}`}
                >
                  <span className={cn("h-2 w-2 rounded-sm", type.className, off && "opacity-30")} />
                  <span className={off ? "line-through" : undefined}><UiText text={type.label} /></span>
                </button>
              );
            })}
            {hidden.size > 0 && (
              <button
                type="button"
                onClick={() => setHidden(new Set())}
                aria-label={ui("Reset entity filters")}
                title={ui("Reset entity filters")}
                className="btn-icon h-7 w-7"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>

          <Segmented<ViewMode>
            ariaLabel="Relationship density"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { value: "focused", label: "Focused" },
              { value: "all", label: "All direct links" },
            ]}
          />
        </div>

        <GraphView
          data={filtered}
          height="clamp(360px, calc(100dvh - 22rem), 620px)"
          onNodeFocus={(id) => navigateAppRoute(`/criminals/record?id=${id}`, router.push)}
          onFirFocus={(id) => navigateAppRoute(`/cases/record?id=${id}`, router.push)}
          onNodeExpand={(id) => load(id)}
        />

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2.5 text-[10px] font-medium uppercase text-muted">
          <span><UiText text={"Source: official KSP foreign keys"} /></span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-muted/50" />
          <span><UiText text={"Depth: accused to FIR to case context"} /></span>
          <span aria-hidden className="h-1 w-1 rounded-full bg-muted/50" />
          <span><UiText text={"No inferred identities"} /></span>
        </div>
      </section>
    </div>
  );
}

function NetworkStat({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: number }) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-border px-2 py-2.5 first:pl-0 sm:border-r sm:px-3 sm:last:border-r-0">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-elevated/60 text-accent">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[9px] font-medium uppercase text-muted"><UiText text={label} /></span>
        <span className="block font-display text-base font-semibold tabular-nums text-fg"><UiText text={value} /></span>
      </span>
    </div>
  );
}
