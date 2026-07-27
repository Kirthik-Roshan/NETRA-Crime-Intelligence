export type Role =
  | "administrator"
  | "senior_officer"
  | "investigation_officer"
  | "analyst"
  | "readonly";

export interface SessionUser {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  rank?: string;
}

export interface Criminal {
  id: number;
  name: string;
  aliases: string; // JSON
  gender: string;
  age: number;
  status: string;
  risk_score: number;
  crime_category: string;
  known_locations: string; // JSON
  home_district: string;
  first_seen: string;
  photo_seed: string;
  notes: string | null;
}

export interface Fir {
  id: number;
  fir_number: string;
  station_id: number;
  crime_type: string;
  ipc_sections: string;
  district: string;
  taluk: string | null;
  lat: number;
  lng: number;
  occurred_at: string;
  reported_at: string;
  status: string;
  severity: string;
  modus: string;
  description: string;
}

export interface CaseRow {
  id: number;
  case_number: string;
  title: string;
  fir_id: number;
  status: string;
  priority: string;
  assigned_officer: number;
  district: string;
  opened_at: string;
  updated_at: string;
  summary: string;
}

export interface GraphNode {
  id: string;
  type: "criminal" | "phone" | "vehicle" | "address" | "fir" | "organization" | "witness";
  label: string;
  meta?: Record<string, unknown>;
}
export interface GraphEdge {
  source: string;
  target: string;
  rel_type: string;
  confidence: number;
  frequency?: number | null;
  note?: string | null;
}

/** Structured, explainable answer returned by the AI pipeline. */
export interface AiInsight {
  answer: string;
  sql?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
  chart?: { kind: "bar" | "line"; x: string; y: string } | null;
  explain: {
    confidence: number; // 0..1
    reasoning: string;
    records_used: number;
    evidence: string[];
    alternatives: string[];
    /** Entities carried over from earlier turns (conversation memory). */
    context_used?: string[];
    source: "template-sql" | "llm" | "cache" | "demo-engine" | "semantic" | "lookup" | "rag";
    audit_id: string;
    processing_ms: number;
    ai_model: string;
  };
}

export const ROLE_LABEL: Record<Role, string> = {
  administrator: "Administrator",
  senior_officer: "Senior Officer",
  investigation_officer: "Investigation Officer",
  analyst: "Analyst",
  readonly: "Read-only Officer",
};
