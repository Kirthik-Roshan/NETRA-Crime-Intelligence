"use client";

import { listRecordBundle } from "./ai-client";
import type { GraphEdge, GraphNode } from "./types";

type Row = Record<string, unknown>;
const value = (row: Row, ...keys: string[]) => {
  for (const key of keys) {
    if (row[key] != null) return row[key];
    const actual = Object.keys(row).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (actual && row[actual] != null) return row[actual];
  }
  return undefined;
};
const text = (row: Row, ...keys: string[]) => String(value(row, ...keys) ?? "").trim();
const number = (row: Row, ...keys: string[]) => {
  const parsed = Number(value(row, ...keys) ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface NetworkOption {
  id: number;
  name: string;
  risk_score: number;
  home_district: string;
  fir_count: number;
  arrest_count: number;
  link_count: number;
}

export interface NetworkGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CloudNetwork {
  options: NetworkOption[];
  graphs: Record<string, NetworkGraph>;
}

/**
 * Build focused, explainable ego networks from the official KSP read model.
 * FirCriminals is intentionally fetched as a second source of truth: even if a
 * previously cached Relationships view is empty, the graph can reconstruct
 * every accused-to-FIR edge without inventing data.
 */
export async function fetchCloudNetwork(refresh = true): Promise<CloudNetwork> {
  const bundle = await listRecordBundle([
    "Criminals", "Relationships", "Firs", "FirCriminals", "Victims",
    "Complainants", "PoliceStations",
  ], refresh);
  const criminals = bundle.Criminals || [];
  const relationshipRows = bundle.Relationships || [];
  const firCriminals = bundle.FirCriminals || [];
  const firs = bundle.Firs || [];
  const victims = bundle.Victims || [];
  const complainants = bundle.Complainants || [];
  const stations = bundle.PoliceStations || [];
  const tables: Record<string, Map<number, Row>> = {};
  for (const [name, rows] of Object.entries({
    criminal: criminals,
    fir: firs,
    victim: victims,
    complainant: complainants,
    station: stations,
  })) {
    tables[name] = new Map(rows.map((row) => [number(row, "id"), row]));
  }

  const relationshipMap = new Map<string, Row>();
  const addRelationship = (row: Row) => {
    const sourceType = text(row, "source_type").toLowerCase();
    const sourceId = number(row, "source_id");
    const targetType = text(row, "target_type").toLowerCase();
    const targetId = number(row, "target_id");
    if (!sourceType || !targetType || !sourceId || !targetId) return;
    const key = `${sourceType}:${sourceId}>${targetType}:${targetId}:${text(row, "rel_type")}`;
    if (!relationshipMap.has(key)) relationshipMap.set(key, row);
  };
  relationshipRows.forEach(addRelationship);
  firCriminals.forEach((row) => addRelationship({
    source_type: "criminal",
    source_id: number(row, "criminal_id"),
    target_type: "fir",
    target_id: number(row, "fir_id"),
    rel_type: text(row, "role") === "prime_accused" ? "prime_accused_in" : "involved_in",
    confidence: 1,
    frequency: 1,
    note: `Official Accused record ${text(row, "accused_master_id")}`,
  }));
  const relationships = [...relationshipMap.values()];

  const linkCounts = new Map<number, number>();
  for (const row of relationships) {
    if (text(row, "source_type").toLowerCase() === "criminal") {
      const id = number(row, "source_id");
      linkCounts.set(id, (linkCounts.get(id) || 0) + 1);
    }
    if (text(row, "target_type").toLowerCase() === "criminal") {
      const id = number(row, "target_id");
      linkCounts.set(id, (linkCounts.get(id) || 0) + 1);
    }
  }

  const options: NetworkOption[] = criminals.map((row) => ({
    id: number(row, "id"),
    name: text(row, "name"),
    risk_score: number(row, "risk_score"),
    home_district: text(row, "home_district"),
    fir_count: number(row, "fir_count"),
    arrest_count: number(row, "arrest_count"),
    link_count: linkCounts.get(number(row, "id")) || 0,
  })).filter((row) => row.id && row.name)
    .sort((a, b) => b.link_count - a.link_count || b.risk_score - a.risk_score || a.name.localeCompare(b.name));

  const makeNode = (type: string, id: number): GraphNode => {
    const row = tables[type]?.get(id) || {};
    let label = `${type}#${id}`;
    if (type === "criminal") label = text(row, "name") || label;
    if (type === "fir") label = text(row, "fir_number") || label;
    if (type === "victim") label = text(row, "name") || `Victim ${id}`;
    if (type === "complainant") label = text(row, "name") || `Complainant ${id}`;
    if (type === "station") label = text(row, "name") || `Police station ${id}`;
    const fir = type === "victim" || type === "complainant"
      ? tables.fir?.get(number(row, "fir_id"))
      : undefined;
    const contextualMeta = type === "victim" ? {
      role: "Victim",
      age: number(row, "age"),
      gender: text(row, "gender"),
      police_personnel: Boolean(value(row, "police_personnel")),
      district: fir ? text(fir, "district") : "",
      fir_id: number(row, "fir_id"),
      source_table: "Victim",
    } : type === "complainant" ? {
      role: "Complainant",
      age: number(row, "age"),
      gender: text(row, "gender"),
      occupation: text(row, "occupation"),
      religion: text(row, "religion"),
      caste: text(row, "caste"),
      district: fir ? text(fir, "district") : "",
      fir_id: number(row, "fir_id"),
      source_table: "ComplainantDetails",
    } : type === "station" ? {
      role: "Police station",
      station_code: text(row, "station_code"),
      district: text(row, "district"),
      source_table: "Unit",
    } : null;
    return {
      id: `${type}:${id}`,
      type: type as GraphNode["type"],
      label,
      meta: type === "criminal" ? {
        profile_id: id,
        portrait_synthetic: true,
        risk: number(row, "risk_score"),
        status: text(row, "status"),
        category: text(row, "crime_category"),
        district: text(row, "home_district"),
        fir_count: number(row, "fir_count"),
        arrest_count: number(row, "arrest_count"),
      } : type === "fir" ? {
        ...row,
        fir_number: text(row, "fir_number"),
        crime_type: text(row, "crime_type"),
        district: text(row, "district"),
        status: text(row, "status"),
        occurred_at: text(row, "occurred_at"),
      } : contextualMeta || { ...row },
    };
  };
  const graphFor = (criminalId: number) => {
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];
    const center = makeNode("criminal", criminalId);
    center.meta = { ...(center.meta || {}), focus: true };
    nodes.set(center.id, center);
    const direct = relationships.filter((row) => {
      const sourceType = text(row, "source_type").toLowerCase();
      const sourceId = number(row, "source_id");
      const targetType = text(row, "target_type").toLowerCase();
      const targetId = number(row, "target_id");
      return (sourceType === "criminal" && sourceId === criminalId) || (targetType === "criminal" && targetId === criminalId);
    }).sort((left, right) => {
      const frequency = number(right, "frequency") - number(left, "frequency");
      if (frequency) return frequency;
      return number(right, "confidence") - number(left, "confidence");
    });

    const linkedFirIds = new Set<number>();
    const addEdge = (row: Row, centerFirst = false) => {
      const sourceType = text(row, "source_type").toLowerCase();
      const sourceId = number(row, "source_id");
      const targetType = text(row, "target_type").toLowerCase();
      const targetId = number(row, "target_id");
      const source = makeNode(sourceType, sourceId);
      const target = makeNode(targetType, targetId);
      nodes.set(source.id, source); nodes.set(target.id, target);
      const neighbour = source.id === center.id ? target : source;
      if (neighbour.type === "fir") linkedFirIds.add(Number(neighbour.id.split(":")[1]));
      edges.push({
        source: centerFirst ? center.id : source.id,
        target: centerFirst ? neighbour.id : target.id,
        rel_type: text(row, "rel_type") || "related_to",
        confidence: number(row, "confidence") || 0.5, frequency: number(row, "frequency") || null,
        note: text(row, "note") || null,
      });
    };

    for (const row of direct) {
      addEdge(row, true);
      if (nodes.size >= 60 || edges.length >= 64) break;
    }

    const contextTypes = new Set(["victim", "complainant", "station"]);
    const contextual = relationships.filter((row) => {
      const sourceType = text(row, "source_type").toLowerCase();
      const sourceId = number(row, "source_id");
      const targetType = text(row, "target_type").toLowerCase();
      const targetId = number(row, "target_id");
      return (sourceType === "fir" && linkedFirIds.has(sourceId) && contextTypes.has(targetType))
        || (targetType === "fir" && linkedFirIds.has(targetId) && contextTypes.has(sourceType));
    }).sort((left, right) => {
      const order = (row: Row) => {
        const types = `${text(row, "source_type")}:${text(row, "target_type")}`;
        return types.includes("station") ? 0 : types.includes("victim") ? 1 : 2;
      };
      return order(left) - order(right) || number(left, "source_id") - number(right, "source_id");
    });
    for (const row of contextual) {
      if (nodes.size >= 60 || edges.length >= 64) break;
      addEdge(row);
    }
    return { nodes: [...nodes.values()], edges };
  };
  const graphs: CloudNetwork["graphs"] = {};
  for (const option of options) graphs[String(option.id)] = graphFor(option.id);
  const top = options.find((option) => graphs[String(option.id)].edges.length)?.id;
  graphs.top = top ? graphs[String(top)] : { nodes: [], edges: [] };
  return { options, graphs };
}
