"use client";
import { useMemo } from "react";
import ReactFlow, { Background, Controls, MarkerType, type Node, type Edge } from "reactflow";
import "reactflow/dist/style.css";
import type { GraphEdge, GraphNode } from "@/lib/types";

const TYPE_STYLE: Record<string, { bg: string; ring: string }> = {
  criminal: { bg: "rgb(var(--danger) / 0.16)", ring: "rgb(var(--danger))" },
  phone: { bg: "rgb(var(--info) / 0.16)", ring: "rgb(var(--info))" },
  vehicle: { bg: "rgb(var(--warning) / 0.16)", ring: "rgb(var(--warning))" },
  address: { bg: "rgb(var(--success) / 0.16)", ring: "rgb(var(--success))" },
  fir: { bg: "rgb(var(--accent) / 0.16)", ring: "rgb(var(--accent))" },
  organization: { bg: "rgb(var(--fg) / 0.12)", ring: "rgb(var(--fg))" },
  witness: { bg: "rgb(var(--muted) / 0.16)", ring: "rgb(var(--muted))" },
};

const TYPE_ORDER = ["criminal", "organization", "fir", "phone", "vehicle", "address", "witness"];

export function GraphView({
  data,
  height = 560,
  onNodeFocus,
  onNodeExpand,
}: {
  data: { nodes: GraphNode[]; edges: GraphEdge[] };
  height?: number;
  /** Single click on a criminal node — open its record. */
  onNodeFocus?: (criminalId: number, name: string) => void;
  /** Double click on a criminal node — expand its network in place. */
  onNodeExpand?: (criminalId: number, name: string) => void;
}) {
  const { nodes, edges } = useMemo(() => {
    const degree = new Map<string, number>();
    for (const e of data.edges) {
      degree.set(e.source, (degree.get(e.source) || 0) + 1);
      degree.set(e.target, (degree.get(e.target) || 0) + 1);
    }
    // Center = highest-degree node (the focus of the ego network).
    const sorted = [...data.nodes].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
    const center = sorted[0];
    const rest = sorted.slice(1);

    const rfNodes: Node[] = [];
    if (center) rfNodes.push(makeNode(center, 0, 0, degree.get(center.id) || 0, true));

    // Group the neighbours by entity type and lay each group out in its own
    // angular sector — so criminals, phones, vehicles, etc. cluster together
    // instead of scattering. Within a sector, split across rings if crowded.
    const byType = new Map<string, GraphNode[]>();
    for (const n of rest) {
      const arr = byType.get(n.type) || [];
      arr.push(n);
      byType.set(n.type, arr);
    }
    const presentTypes = TYPE_ORDER.filter((t) => byType.has(t));
    const sectorCount = presentTypes.length || 1;
    presentTypes.forEach((type, ti) => {
      const group = byType.get(type) || [];
      const sectorStart = (ti / sectorCount) * Math.PI * 2;
      const sectorSpan = (Math.PI * 2) / sectorCount;
      const perRing = Math.max(3, Math.ceil(Math.sqrt(group.length)) + 1);
      group.forEach((n, i) => {
        const ring = Math.floor(i / perRing);
        const idxInRing = i % perRing;
        const countInRing = Math.min(perRing, group.length - ring * perRing);
        const R = 220 + ring * 170;
        // Spread within the sector, leaving a small gutter between sectors.
        const a = sectorStart + ((idxInRing + 0.5) / countInRing) * sectorSpan * 0.86 + sectorSpan * 0.07;
        rfNodes.push(makeNode(n, Math.cos(a) * R, Math.sin(a) * R, degree.get(n.id) || 0, false));
      });
    });

    const rfEdges: Edge[] = data.edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      label: e.rel_type.replace(/_/g, " "),
      animated: e.rel_type === "associate" || e.rel_type === "contacted",
      style: { stroke: "rgb(var(--border))", strokeWidth: 1 + (e.confidence || 0.5) * 1.5 },
      labelStyle: { fill: "rgb(var(--muted))", fontSize: 9 },
      labelBgStyle: { fill: "rgb(var(--surface))" },
      markerEnd: { type: MarkerType.ArrowClosed, color: "rgb(var(--border))" },
    }));

    return { nodes: rfNodes, edges: rfEdges };
  }, [data]);

  const handleNodeClick = (_e: unknown, node: Node) => {
    if (onNodeFocus && typeof node.id === "string" && node.id.startsWith("criminal:")) {
      onNodeFocus(Number(node.id.split(":")[1]), String((node.data as { label?: string })?.label ?? ""));
    }
  };
  const handleNodeDoubleClick = (_e: unknown, node: Node) => {
    if (onNodeExpand && typeof node.id === "string" && node.id.startsWith("criminal:")) {
      onNodeExpand(Number(node.id.split(":")[1]), String((node.data as { label?: string })?.label ?? ""));
    }
  };

  return (
    <div style={{ height }} className="overflow-hidden rounded-xl border border-border bg-surface">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.15}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
        onNodeClick={handleNodeClick as never}
        onNodeDoubleClick={handleNodeDoubleClick as never}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        zoomOnScroll
        panOnDrag
        selectionOnDrag={false}
        nodeOrigin={[0.5, 0.5]}
      >
        <Background color="rgb(var(--border))" gap={22} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

function makeNode(n: GraphNode, x: number, y: number, deg: number, isCenter: boolean): Node {
  const style = TYPE_STYLE[n.type] || TYPE_STYLE.witness;
  return {
    id: n.id,
    position: { x, y },
    data: { label: `${n.label}` },
    style: {
      background: style.bg,
      border: `1.5px solid ${style.ring}`,
      borderRadius: 10,
      color: "rgb(var(--fg))",
      fontSize: isCenter ? 13 : 11,
      fontWeight: isCenter ? 700 : 500,
      padding: isCenter ? "10px 14px" : "6px 10px",
      minWidth: 44,
      cursor: n.type === "criminal" ? "pointer" : "grab",
      boxShadow: isCenter ? "0 0 0 3px rgb(var(--accent) / 0.25)" : "none",
    },
    sourcePosition: "right" as never,
    targetPosition: "left" as never,
  };
}
