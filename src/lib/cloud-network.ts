"use client";

import { listRecords } from "./ai-client";
import type { GraphEdge, GraphNode } from "./types";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key] ?? "");
const number = (row: Row, key: string) => Number(row[key] ?? 0);

export interface CloudNetwork {
  options: { id: number; name: string; risk_score: number; home_district: string }[];
  graphs: Record<string, { nodes: GraphNode[]; edges: GraphEdge[] }>;
}

export async function fetchCloudNetwork(): Promise<CloudNetwork> {
  const [criminals, relationships, phones, vehicles, addresses, firs, organizations] = await Promise.all([
    listRecords("Criminals", 5000),
    listRecords("Relationships", 5000),
    listRecords("Phones", 5000),
    listRecords("Vehicles", 5000),
    listRecords("Addresses", 5000),
    listRecords("Firs", 5000),
    listRecords("Organizations", 5000),
  ]);
  const tables: Record<string, Map<number, Row>> = {};
  for (const [name, rows] of Object.entries({ criminal: criminals, phone: phones, vehicle: vehicles, address: addresses, fir: firs, organization: organizations })) {
    tables[name] = new Map(rows.map((row) => [number(row, "id"), row]));
  }
  const options = criminals.map((row) => ({
    id: number(row, "id"), name: text(row, "name"), risk_score: number(row, "risk_score"), home_district: text(row, "home_district"),
  })).filter((row) => row.id && row.name).sort((a, b) => b.risk_score - a.risk_score);

  const makeNode = (type: string, id: number): GraphNode => {
    const row = tables[type]?.get(id) || {};
    let label = `${type}#${id}`;
    if (type === "criminal") label = text(row, "name") || label;
    if (type === "phone") label = text(row, "number") || label;
    if (type === "vehicle") label = text(row, "plate") || label;
    if (type === "address") label = text(row, "district") || text(row, "line") || label;
    if (type === "fir") label = text(row, "fir_number") || label;
    if (type === "organization") label = text(row, "name") || label;
    return {
      id: `${type}:${id}`,
      type: type as GraphNode["type"],
      label,
      meta: type === "criminal" ? { risk: number(row, "risk_score"), status: text(row, "status"), category: text(row, "crime_category") } : row,
    };
  };
  const graphFor = (criminalId: number) => {
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const center = makeNode("criminal", criminalId);
    nodes.set(center.id, center);
    for (const row of relationships) {
      const sourceType = text(row, "source_type");
      const sourceId = number(row, "source_id");
      const targetType = text(row, "target_type");
      const targetId = number(row, "target_id");
      if (!((sourceType === "criminal" && sourceId === criminalId) || (targetType === "criminal" && targetId === criminalId))) continue;
      const source = makeNode(sourceType, sourceId);
      const target = makeNode(targetType, targetId);
      nodes.set(source.id, source); nodes.set(target.id, target);
      edges.push({
        source: source.id, target: target.id, rel_type: text(row, "rel_type") || "related_to",
        confidence: number(row, "confidence") || 0.5, frequency: number(row, "frequency") || null,
        note: text(row, "note") || null,
      });
      if (nodes.size >= 55 || edges.length >= 54) break;
    }
    return { nodes: [...nodes.values()], edges };
  };
  const graphs: CloudNetwork["graphs"] = {};
  for (const option of options) graphs[String(option.id)] = graphFor(option.id);
  const top = options.find((option) => graphs[String(option.id)].edges.length)?.id;
  graphs.top = top ? graphs[String(top)] : { nodes: [], edges: [] };
  return { options, graphs };
}
