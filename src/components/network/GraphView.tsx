"use client";
import { UiText, useUiText } from '@/components/UiText';


import { useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  Position,
  useNodesInitialized,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeProps,
} from "reactflow";
import {
  Building2,
  CalendarDays,
  ExternalLink,
  FileText,
  Focus,
  HeartHandshake,
  MapPin,
  MessageSquareText,
  Network as NetworkIcon,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import "reactflow/dist/style.css";
import type { GraphEdge, GraphNode } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { Avatar } from "@/components/ui";

interface EntityNodeData {
  entity: GraphNode;
  degree: number;
  focus: boolean;
  dimmed: boolean;
  relationType: string;
  frequency: number;
}

const RELATION_STYLE: Record<string, { color: string; label: string; dash?: string }> = {
  prime_accused_in: { color: "rgb(var(--danger))", label: "Prime accused" },
  involved_in: { color: "rgb(var(--info))", label: "Named in FIR" },
  co_accused: { color: "rgb(var(--warning))", label: "Co-accused" },
  victim_in: { color: "rgb(var(--danger))", label: "Victim" },
  complainant_of: { color: "rgb(var(--info))", label: "Complainant" },
  registered_at: { color: "rgb(var(--success))", label: "Registered at" },
};

const NODE_TYPES = { entity: EntityNode };

function FitNetwork({ layoutKey }: { layoutKey: string }) {
  const { fitView } = useReactFlow();
  const ready = useNodesInitialized();
  const width = useStore(state => state.width);
  const height = useStore(state => state.height);
  useEffect(() => {
    if (!ready || !width || !height) return;
    const frame = requestAnimationFrame(() => { void fitView({ padding: .22, maxZoom: 1.05 }); });
    return () => cancelAnimationFrame(frame);
  }, [ready, width, height, layoutKey, fitView]);
  return null;
}

export function GraphView({
  data,
  height = 600,
  onNodeFocus,
  onFirFocus,
  onNodeExpand,
}: {
  data: { nodes: GraphNode[]; edges: GraphEdge[] };
  height?: number | string;
  onNodeFocus?: (criminalId: number, name: string) => void;
  onFirFocus?: (firId: number, name: string) => void;
  onNodeExpand?: (criminalId: number, name: string) => void;
}) {
  const ui = useUiText();
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const displayData = useMemo(() => {
    if (!compact) return data;
    const focus = data.nodes.find((node) => node.meta?.focus) || data.nodes[0];
    if (!focus) return data;
    const limits: Record<string, number> = { criminal: 3, fir: 4, victim: 2, complainant: 2, station: 2 };
    const counts = new Map<string, number>();
    const edges = data.edges.filter((edge) => {
      const neighbourId = edge.source === focus.id ? edge.target : edge.source;
      const neighbour = data.nodes.find((node) => node.id === neighbourId);
      if (!neighbour) return false;
      const count = counts.get(neighbour.type) || 0;
      if (count >= (limits[neighbour.type] || 2)) return false;
      counts.set(neighbour.type, count + 1);
      return true;
    });
    const ids = new Set([focus.id, ...edges.flatMap((edge) => [edge.source, edge.target])]);
    return { nodes: data.nodes.filter((node) => ids.has(node.id)), edges };
  }, [compact, data]);

  useEffect(() => setActiveNodeId(null), [displayData]);

  const focusNode = displayData.nodes.find((node) => node.meta?.focus) || displayData.nodes[0];
  const activeNode = displayData.nodes.find((node) => node.id === activeNodeId) || null;
  const activeLinks = activeNode
    ? displayData.edges.filter((edge) => edge.source === activeNode.id || edge.target === activeNode.id)
    : [];

  const { nodes, edges } = useMemo(() => {
    const degree = new Map<string, number>();
    for (const edge of displayData.edges) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    }

    const center = displayData.nodes.find((node) => node.meta?.focus) || displayData.nodes[0];
    const neighbours = displayData.nodes.filter((node) => node.id !== center?.id);
    const people = neighbours.filter((node) => node.type === "criminal")
      .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0) || a.label.localeCompare(b.label));
    const firs = neighbours.filter((node) => node.type === "fir")
      .sort((a, b) => String(b.meta?.occurred_at || "").localeCompare(String(a.meta?.occurred_at || "")));
    const contextOrder: Record<string, number> = { station: 0, victim: 1, complainant: 2 };
    const context = neighbours.filter((node) => node.type !== "criminal" && node.type !== "fir")
      .sort((a, b) => (contextOrder[a.type] ?? 3) - (contextOrder[b.type] ?? 3));

    const positions = new Map<string, { x: number; y: number }>();
    if (center) positions.set(center.id, { x: 0, y: 0 });
    if (compact) {
      people.forEach((node, index) => positions.set(node.id, { x: 0, y: -(index + 1) * 108 }));
      firs.forEach((node, index) => positions.set(node.id, { x: 0, y: 200 + index * 108 }));
      context.forEach((node, index) => positions.set(node.id, { x: 0, y: 200 + (firs.length + index) * 108 }));
    } else {
      if (people.length > 8) placeLane(people, -1, positions, 255, 220);
      else placePeopleArc(people, positions);
      placeLane(firs, 1, positions, 275, 205);
      placeLane(context, 1, positions, 555 + Math.max(0, Math.ceil(firs.length / 6) - 1) * 205, 205);
    }

    const rfNodes: Array<Node<EntityNodeData>> = displayData.nodes.map((entity) => {
      const relationship = displayData.edges.find((edge) => edge.source === entity.id || edge.target === entity.id);
      const connected = !activeNodeId || entity.id === activeNodeId || displayData.edges.some((edge) => (
        (edge.source === activeNodeId && edge.target === entity.id)
        || (edge.target === activeNodeId && edge.source === entity.id)
      ));
      return {
        id: entity.id,
        type: "entity",
        position: positions.get(entity.id) || { x: 0, y: 0 },
        data: {
          entity,
          degree: degree.get(entity.id) || 0,
          focus: entity.id === center?.id,
          dimmed: !connected,
          relationType: entity.id === center?.id ? "focus" : relationship?.rel_type || "related_to",
          frequency: Number(relationship?.frequency || 1),
        },
        selected: entity.id === activeNodeId,
        draggable: true,
      };
    });

    const rfEdges: Edge[] = displayData.edges.map((edge, index) => {
      const style = RELATION_STYLE[edge.rel_type] || { color: "rgb(var(--muted))", label: edge.rel_type.replace(/_/g, " ") };
      const connected = !activeNodeId || edge.source === activeNodeId || edge.target === activeNodeId;
      const vertical = compact;
      const sourcePosition = positions.get(edge.source) || { x: 0, y: 0 };
      const targetPosition = positions.get(edge.target) || { x: 0, y: 0 };
      const targetIsBefore = vertical
        ? targetPosition.y < sourcePosition.y
        : targetPosition.x < sourcePosition.x;
      return {
        id: `edge-${index}-${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        sourceHandle: vertical ? (targetIsBefore ? "source-top" : "source-bottom") : targetIsBefore ? "source-left" : "source-right",
        targetHandle: vertical ? (targetIsBefore ? "target-bottom" : "target-top") : targetIsBefore ? "target-right" : "target-left",
        type: "default",
        style: {
          stroke: style.color,
          strokeWidth: connected ? 1.7 + Math.min(1.3, Number(edge.confidence || 0.5)) : 1,
          strokeDasharray: style.dash,
          opacity: connected ? 0.78 : 0.1,
          transition: "opacity 160ms ease",
        },
      };
    });

    return { nodes: rfNodes, edges: rfEdges };
  }, [activeNodeId, compact, displayData]);

  const openActiveRecord = () => {
    if (!activeNode) return;
    const id = Number(activeNode.id.split(":")[1]);
    if (activeNode.type === "criminal") onNodeFocus?.(id, activeNode.label);
    if (activeNode.type === "fir") onFirFocus?.(id, activeNode.label);
  };

  return (
    <div style={{ height }} className="netra-network-canvas relative overflow-hidden rounded-lg border border-accent/45 bg-surface">
      {nodes.length ? (
        <>
          {!compact && <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <span className="netra-network-zone netra-network-zone-people" />
            <span className="netra-network-zone netra-network-zone-focus" />
            <span className="netra-network-zone netra-network-zone-firs" />
            <span className="netra-network-zone netra-network-zone-context" />
          </div>}
          <ReactFlow
            className="!bg-transparent"
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            fitView
            fitViewOptions={{ padding: 0.22, maxZoom: 1.05 }}
            minZoom={0.03}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => setActiveNodeId((current) => current === node.id ? null : node.id)}
            onNodeDoubleClick={(_, node) => {
              if (node.id.startsWith("criminal:")) {
                const entity = (node.data as EntityNodeData).entity;
                onNodeExpand?.(Number(node.id.split(":")[1]), entity.label);
              }
            }}
            onPaneClick={() => setActiveNodeId(null)}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            zoomOnDoubleClick={false}
            panOnScroll={false}
            zoomOnScroll={false}
            preventScrolling={false}
            panOnDrag
          >
            <FitNetwork layoutKey={`${compact}:${nodes.map(node => node.id).join(',')}:${edges.map(edge => edge.id).join(',')}`} />
            <Background color="rgb(var(--accent) / 0.18)" gap={22} size={1} />
            <Controls position="bottom-left" showInteractive={false} />
          </ReactFlow>

          <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between gap-3">
            <LaneLabel icon={UserRound} label={compact ? "People above" : "Co-accused"} tone="warning" />
            {!compact && (
              <div className="hidden rounded border border-danger/25 bg-surface/95 px-2 py-1 text-[10px] font-semibold uppercase text-danger shadow-card sm:block"><UiText text={"Focused profile"} /></div>
            )}
            <div className="flex items-center gap-1.5">
              <LaneLabel icon={FileText} label={compact ? "FIRs below" : "Linked FIRs"} tone="accent" />
              {!compact && <LaneLabel icon={NetworkIcon} label={ui("Case context")} tone="success" />}
            </div>
          </div>

          {!compact && <div className="pointer-events-none absolute inset-x-12 bottom-12 hidden grid-cols-3 gap-3 lg:grid">
            <LaneCount tone="warning" value={displayData.nodes.filter((node) => node.type === "criminal" && !node.meta?.focus).length} label={ui("co-accused shown")} />
            <LaneCount tone="accent" value={displayData.nodes.filter((node) => node.type === "fir").length} label={ui("linked FIRs")} />
            <LaneCount tone="success" value={displayData.nodes.filter((node) => node.type === "station").length} label={ui("police stations")} />
          </div>}

          {activeNode ? (
            <NodeInspector
              node={activeNode}
              links={activeLinks}
              isFocus={activeNode.id === focusNode?.id}
              onOpen={openActiveRecord}
              onFocus={() => {
                if (activeNode.type === "criminal") {
                  onNodeExpand?.(Number(activeNode.id.split(":")[1]), activeNode.label);
                }
              }}
            />
          ) : (
            <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded border border-border bg-surface/95 px-3 py-1.5 text-[11px] text-muted shadow-card">
              <ShieldCheck className="h-3 w-3 text-success" /><UiText text={" Official KSP relationship evidence"} /></div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center px-6 text-center">
          <div>
            <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-md border border-border bg-elevated">
              <NetworkIcon className="h-5 w-5 text-muted" />
            </span>
            <p className="font-display text-sm font-semibold text-fg"><UiText text={"No relationship graph available"} /></p>
            <p className="mt-1 max-w-sm text-xs text-muted"><UiText text={"Select another accused profile or refresh the official KSP relationship data."} /></p>
          </div>
        </div>
      )}
    </div>
  );
}

function placeLane(
  nodes: GraphNode[],
  direction: -1 | 1,
  positions: Map<string, { x: number; y: number }>,
  start = 330,
  columnGap = 245,
) {
  const rowsPerColumn = 6;
  nodes.forEach((node, index) => {
    const column = Math.floor(index / rowsPerColumn);
    const row = index % rowsPerColumn;
    const inColumn = Math.min(rowsPerColumn, nodes.length - column * rowsPerColumn);
    positions.set(node.id, {
      x: direction * (start + column * columnGap),
      y: (row - (inColumn - 1) / 2) * 88,
    });
  });
}

function placePeopleArc(nodes: GraphNode[], positions: Map<string, { x: number; y: number }>) {
  const count = Math.max(1, nodes.length);
  nodes.forEach((node, index) => {
    const normalized = count === 1 ? 0 : (index / (count - 1)) * 2 - 1;
    positions.set(node.id, {
      x: -255 - (1 - Math.abs(normalized)) * 105,
      y: normalized * 245,
    });
  });
}

function EntityNode({ data, selected }: NodeProps<EntityNodeData>) {
  const { entity, degree, focus, dimmed, relationType, frequency } = data;
  const isPerson = entity.type === "criminal";
  const isFir = entity.type === "fir";
  const meta = entity.meta || {};
  const firNumber = String(meta.fir_number || entity.label).replace(/\D/g, "");
  const displayLabel = isFir && firNumber.length >= 9
    ? `FIR-${firNumber.slice(-9, -5)}-${firNumber.slice(-4)}`
    : entity.label;
  const subtitle = isPerson ? "Co-accused"
    : isFir ? String(meta.crime_type || meta.district || "FIR record")
      : entity.type === "victim" ? `${meta.age || "Age not stated"} · ${meta.gender || "Gender not stated"}`
        : entity.type === "complainant" ? String(meta.occupation || meta.district || "Complainant")
          : String(meta.district || meta.station_code || "Police station");
  const border = focus ? "border-danger shadow-[0_0_0_3px_rgb(var(--danger)/0.12)]"
    : entity.type === "criminal" ? "border-warning/60"
      : entity.type === "fir" ? "border-accent/60"
        : entity.type === "victim" ? "border-danger/45"
          : entity.type === "complainant" ? "border-info/50"
            : "border-success/50";
  const iconTone = entity.type === "criminal" ? "border-warning/30 bg-warning/10 text-warning"
    : entity.type === "fir" ? "border-accent/30 bg-accent/10 text-accent"
      : entity.type === "victim" ? "border-danger/30 bg-danger/10 text-danger"
        : entity.type === "complainant" ? "border-info/30 bg-info/10 text-info"
          : "border-success/30 bg-success/10 text-success";
  if (focus) {
    return (
      <div className={cn("netra-focus-node", selected && "is-selected", dimmed && "opacity-25")}>
        <NodeHandles />
        <div className="netra-focus-orbit" aria-hidden />
        <div className="netra-focus-ring">
          <Avatar name={entity.label} size={78} profileId={Number(entity.id.split(":")[1])} />
        </div>
        <div className="netra-focus-name" title={entity.label}><UiText text={entity.label} /></div>
        <div className="netra-focus-badge"><UiText text={"Network focus"} /></div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "netra-entity-node",
        entity.type === "criminal" ? "netra-entity-person" : entity.type === "fir" ? "netra-entity-fir" : entity.type === "station" ? "netra-entity-station" : "netra-entity-context",
        "transition-[border-color,box-shadow,opacity,transform] duration-150",
        selected && "scale-[1.03] shadow-[0_0_0_3px_rgb(var(--accent)/0.16)]",
        dimmed && "opacity-25",
      )}
    >
      <NodeHandles />

      <div className="flex items-center gap-2">
        {isPerson ? (
          <span className="netra-node-avatar"><Avatar name={entity.label} size={38} profileId={Number(entity.id.split(":")[1])} /></span>
        ) : (
          <span className={cn(
            "netra-node-glyph grid h-9 w-9 shrink-0 place-items-center rounded-full border",
            iconTone,
          )}>
            <EntityGlyph type={entity.type} className="h-3.5 w-3.5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className={cn("truncate font-semibold text-fg", isFir ? "font-mono text-[10px]" : "font-display text-xs")} title={entity.label}><UiText text={displayLabel} /></div>
          <div className="mt-0.5 truncate text-[10px] text-muted" title={subtitle}><UiText text={subtitle} /></div>
        </div>
      </div>
    </div>
  );
}

function NodeHandles() {
  return <>
    <Handle id="target-left" type="target" position={Position.Left} className="netra-link-handle" />
    <Handle id="target-right" type="target" position={Position.Right} className="netra-link-handle" />
    <Handle id="source-left" type="source" position={Position.Left} className="netra-link-handle" />
    <Handle id="source-right" type="source" position={Position.Right} className="netra-link-handle" />
    <Handle id="target-top" type="target" position={Position.Top} className="netra-link-handle netra-vertical-handle" />
    <Handle id="target-bottom" type="target" position={Position.Bottom} className="netra-link-handle netra-vertical-handle" />
    <Handle id="source-top" type="source" position={Position.Top} className="netra-link-handle netra-vertical-handle" />
    <Handle id="source-bottom" type="source" position={Position.Bottom} className="netra-link-handle netra-vertical-handle" />
  </>;
}

function EntityGlyph({ type, className }: { type: GraphNode["type"]; className?: string }) {
  if (type === "criminal") return <UserRound className={className} />;
  if (type === "fir") return <FileText className={className} />;
  if (type === "victim") return <HeartHandshake className={className} />;
  if (type === "complainant") return <MessageSquareText className={className} />;
  return <Building2 className={className} />;
}

function LaneLabel({ icon: Icon, label, tone }: { icon: typeof UserRound; label: string; tone: "warning" | "accent" | "success" }) {
  return (
    <span className={cn(
      "flex items-center gap-1.5 rounded border bg-surface/95 px-2 py-1 text-[10px] font-semibold uppercase shadow-card",
      tone === "warning" ? "border-warning/30 text-warning" : tone === "success" ? "border-success/30 text-success" : "border-accent/30 text-accent",
    )}>
      <Icon className="h-3 w-3" /> <UiText text={label} />
    </span>
  );
}

function LaneCount({ tone, value, label, className }: { tone: "warning" | "accent" | "success"; value: number; label: string; className?: string }) {
  return <span className={cn("netra-lane-count", `netra-lane-count-${tone}`, className)}><span className="grid h-4 w-4 place-items-center rounded-full bg-current/10 font-mono text-[9px]"><UiText text={value} /></span><UiText text={value} /> <UiText text={label} /></span>;
}

function NodeInspector({
  node,
  links,
  isFocus,
  onOpen,
  onFocus,
}: {
  node: GraphNode;
  links: GraphEdge[];
  isFocus: boolean;
  onOpen: () => void;
  onFocus: () => void;
}) {
  const ui = useUiText();
  const person = node.type === "criminal";
  const fir = node.type === "fir";
  const canOpen = person || fir;
  const meta = node.meta || {};
  const relation = links[0];
  const relationLabel = relation
    ? (RELATION_STYLE[relation.rel_type]?.label || relation.rel_type.replace(/_/g, " "))
    : "Focused record";

  return (
    <aside className="absolute bottom-3 right-3 w-[min(300px,calc(100%-24px))] border border-border bg-surface/95 p-3 shadow-card backdrop-blur-sm">
      <div className="flex items-start gap-2.5">
        {person ? (
          <Avatar name={node.label} size={32} profileId={Number(node.id.split(":")[1])} />
        ) : (
          <span className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-md border",
            fir ? "border-accent/30 bg-accent/10 text-accent"
              : node.type === "victim" ? "border-danger/30 bg-danger/10 text-danger"
                : node.type === "complainant" ? "border-info/30 bg-info/10 text-info"
                  : "border-success/30 bg-success/10 text-success",
          )}>
            <EntityGlyph type={node.type} className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-semibold text-fg"><UiText text={node.label} /></p>
          <p className="mt-0.5 text-[10px] font-medium uppercase text-muted"><UiText text={relationLabel} /></p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-y border-border py-2 text-[11px]">
        <InspectorValue icon={MapPin} label={ui("District")} value={String(meta.district || "Not recorded")} />
        {person ? (
          <>
            <InspectorValue label={ui("Risk score")} value={String(meta.risk || "-")} />
            <InspectorValue label={ui("FIR history")} value={String(meta.fir_count ?? links.length)} />
            <InspectorValue label={ui("Arrests")} value={String(meta.arrest_count ?? 0)} />
          </>
        ) : fir ? (
          <>
            <InspectorValue label={ui("Offence")} value={String(meta.crime_type || "Unclassified")} />
            <InspectorValue label={ui("Status")} value={String(meta.status || "Registered").replace(/_/g, " ")} />
            <InspectorValue icon={CalendarDays} label={ui("Occurred")} value={meta.occurred_at ? formatDate(String(meta.occurred_at)) : "Not recorded"} />
          </>
        ) : node.type === "station" ? (
          <>
            <InspectorValue label={ui("Entity")} value="Police station" />
            <InspectorValue label={ui("Station code")} value={String(meta.station_code || "Not recorded")} />
            <InspectorValue label={ui("Source")} value={String(meta.source_table || "Unit")} />
          </>
        ) : (
          <>
            <InspectorValue label={ui("Entity")} value={String(meta.role || node.type)} />
            <InspectorValue label={ui("Age / gender")} value={`${meta.age || "-"} / ${meta.gender || "-"}`} />
            <InspectorValue label={ui("FIR link")} value={String(meta.fir_id || "Not recorded")} />
          </>
        )}
      </div>

      <div className="mt-2 flex gap-2">
        {person && !isFocus && (
          <button type="button" onClick={onFocus} className="btn-secondary h-8 flex-1 justify-center text-xs">
            <Focus className="h-3.5 w-3.5" /><UiText text={" Focus network"} /></button>
        )}
        {canOpen && (
          <button type="button" onClick={onOpen} className="btn-primary h-8 flex-1 justify-center text-xs">
            <ExternalLink className="h-3.5 w-3.5" /><UiText text={" Open record"} /></button>
        )}
      </div>
    </aside>
  );
}

function InspectorValue({ icon: Icon, label, value }: { icon?: typeof MapPin; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="flex items-center gap-1 text-[9px] font-medium uppercase text-muted">
        {Icon && <Icon className="h-2.5 w-2.5" />} <UiText text={label} />
      </span>
      <span className="mt-0.5 block truncate font-medium capitalize text-subtle" title={value}><UiText text={value} /></span>
    </div>
  );
}
