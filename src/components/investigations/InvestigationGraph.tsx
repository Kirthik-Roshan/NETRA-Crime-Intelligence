"use client";
import { UiText, useUiText } from '@/components/UiText';


import { useEffect, useMemo } from "react";
import ReactFlow, { Background, Controls, Position, useNodesInitialized, useReactFlow, useStore, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import type { InvestigationAnalysis } from "@/lib/investigations";

function FitGraphOnResize() {
  const { fitView } = useReactFlow();
  const width = useStore(state => state.width);
  const height = useStore(state => state.height);
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (!initialized || !width || !height) return;
    const frame = requestAnimationFrame(() => { void fitView({ padding: .15 }); });
    return () => cancelAnimationFrame(frame);
  }, [fitView, width, height, initialized]);
  return null;
}

export default function InvestigationGraph({ analysis, onFinding }: { analysis: InvestigationAnalysis; onFinding: (id: string) => void }) {
  const ui = useUiText();
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = analysis.cases.map((item, index) => ({
      id: `case-${item.id}`, position: { x: 0, y: index * 110 }, sourcePosition: Position.Right,
      data: { label: <span><strong className="block text-xs">{item.fir_number || `FIR ${item.id}`}</strong><span className="mt-1 block text-[11px]"><UiText text={item.title} /></span></span> },
      style: { width: 225, borderRadius: 6, background: 'rgb(var(--surface))', color: 'rgb(var(--fg))', border: '1px solid rgb(var(--accent) / .5)', padding: 12 },
    }));
    const edges: Edge[] = [];
    analysis.findings.forEach((finding, index) => {
      const tone = finding.active ? finding.kind === 'conflict' ? 'var(--danger)' : 'var(--accent)' : 'var(--muted)';
      nodes.push({ id: finding.id, position: { x: 355, y: index * 90 }, targetPosition: Position.Left,
        data: { label: <span><span className="block text-[9px] uppercase"><UiText text={finding.active ? finding.kind === 'conflict' ? 'Conflicting detail' : 'Supporting signal' : 'Inactive after exclusion'} /></span><strong className="mt-1 block text-xs"><UiText text={finding.title} /></strong></span> },
        style: { width: 280, borderRadius: 6, padding: 10, background: 'rgb(var(--surface))', color: `rgb(${tone})`, border: `1px ${finding.active ? 'solid' : 'dashed'} rgb(${tone} / .65)`, opacity: finding.active ? 1 : .6 },
      });
      for (const caseId of finding.case_ids) edges.push({ id: `${caseId}-${finding.id}`, source: `case-${caseId}`, target: finding.id, type: 'smoothstep', animated: false,
        style: { stroke: `rgb(${tone})`, strokeWidth: finding.active ? 2 : 1, strokeDasharray: finding.active ? undefined : '5 5' },
      });
    });
    return { nodes, edges };
  }, [analysis]);
  return <div className="investigation-graph" aria-label={ui("Case relationships and evidence dependencies")}>
    <ReactFlow key={analysis.generated_at} nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: .15 }} minZoom={.03} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, node) => { if (!node.id.startsWith('case-')) onFinding(node.id); }} proOptions={{ hideAttribution: true }}>
      <FitGraphOnResize />
      <Background color="rgb(var(--accent) / .2)" gap={22} size={1} /><Controls showInteractive={false} />
    </ReactFlow>
  </div>;
}
