"use client";
import { presentReport, type ReportExport } from './report-export';

import { investigationRequest } from "./ai-client";

export interface InvestigationObservation {
  id: string; case_id: number; label: string; note: string; reference: string;
  plate: string; vehicle_type: string; actor?: string;
}
export interface InvestigationExclusion { source_id: string; reason: string }
export interface InvestigationSource {
  id: string; table: string; record_id: string; case_id: number; label: string;
  origin: string; excerpt: string; fields: Record<string, unknown>;
  fingerprint: string; record_fingerprint?: string; excluded: boolean; exclusion_reason: string;
}
export interface InvestigationFinding {
  id: string; kind: "support" | "conflict"; title: string; detail: string;
  strength: string; source_ids: string[]; case_ids: number[]; active: boolean;
}
export interface InvestigationAnalysis {
  version: string; question: string; generated_at: string; source_fingerprint: string;
  cases: Array<{ id: number; fir_number: string; title: string; district: string; crime_type: string; status: string }>;
  sources: InvestigationSource[]; findings: InvestigationFinding[];
  gaps: Array<{ case_id: number | null; title: string; detail: string }>;
  warnings: string[]; summary: string; next_checks: string[];
  counts: { support: number; conflicts: number; gaps: number; included: number; excluded: number };
}
export interface InvestigationCriteria { enabled: boolean; crime_type: string; district: string; term: string }
export interface SavedInvestigation {
  id: string; revision_id: string; revision_number: number; previous_revision: string | null;
  title: string; question: string; case_ids: number[]; saved_at: string;
  observations: InvestigationObservation[]; exclusions: InvestigationExclusion[];
  annotation: string; criteria: InvestigationCriteria; review_status: "draft" | "reviewed";
  review_note: string; actor: { id: string; name: string; role: string };
  analysis: InvestigationAnalysis; integrity_hash: string; changes: string[];
}
export interface InvestigationRevision { revision_id: string; revision_number: number; saved_at: string; review_status: string; changes: string[] }
export interface InvestigationAlert {
  id: string; investigation_id: string; investigation_title: string; case_id: number;
  fir_number: string; title: string; reasons: string[]; kind: string;
  detected_at: string; status: "unread" | "read" | "dismissed";
}
export interface InvestigationWatchResult { checked_at: string; watched: number; alerts: InvestigationAlert[]; warnings: string[] }

let watchCache: InvestigationWatchResult | null = null;
let watchUntil = 0;
let watchPending: Promise<InvestigationWatchResult> | null = null;
let watchGeneration = 0;
let pendingGeneration = 0;
function invalidateWatch() { watchGeneration++; watchUntil = 0; }
if (typeof window !== "undefined") window.addEventListener("netra:records-updated", invalidateWatch);
export function checkInvestigations(force = false): Promise<InvestigationWatchResult> {
  if (watchPending) {
    if (pendingGeneration !== watchGeneration) return watchPending.then(() => checkInvestigations());
    return watchPending;
  }
  if (!force && watchCache && watchUntil > Date.now()) return Promise.resolve(watchCache);
  pendingGeneration = watchGeneration;
  watchPending = investigationRequest<InvestigationWatchResult>({ mode: "investigation:check" }).then(result => {
    watchCache = result; watchUntil = pendingGeneration === watchGeneration ? Date.now() + 30000 : 0; return result;
  }).finally(() => { watchPending = null; });
  return watchPending;
}
export function refreshInvestigationAlerts() {
  invalidateWatch();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("netra:investigations-updated"));
}
export async function reviewInvestigationAlert(id: string, status: InvestigationAlert["status"]) {
  await investigationRequest({ mode: "investigation:alert", alert_id: id, status });
  if (watchCache) watchCache = { ...watchCache, alerts: watchCache.alerts.map(item => item.id === id ? { ...item, status } : item) };
  refreshInvestigationAlerts();
}
export function downloadInvestigationPdf(result: ReportExport) {
  return presentReport(result);
}
