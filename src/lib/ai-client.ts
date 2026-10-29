"use client";
import type { SessionUser } from "./types";
/**
 * Client-side AI bridge for the static build.
 *
 * The static site has no server, so the old /api/assistant/query route is gone.
 * Instead the browser calls the deployed Catalyst Serverless Function
 * (functions/ai_quickml), which holds the QuickML token server-side and returns
 * the model's answer. Configure its URL at build time:
 *
 *   NEXT_PUBLIC_AI_FN_URL = https://<project>.catalystserverless.in/server/ai_quickml/
 *
 * When unset, AI features show a clean "not connected" state instead of failing.
 * Production is preferred for public deployments. Localhost and Catalyst's
 * development hostname use the development Function unless a URL is supplied.
 */
const PROD_FN_URL = "https://ksphacks-60080085094.catalystserverless.in/server/ai_quickml/";
const DEV_FN_URL = "https://ksphacks-60080085094.development.catalystserverless.in/server/ai_quickml/";
const EXPLICIT_FN_URL = process.env.NEXT_PUBLIC_AI_FN_URL || "";

function functionUrls(): string[] {
  if (EXPLICIT_FN_URL) return [EXPLICIT_FN_URL];
  if (typeof window === "undefined") return [PROD_FN_URL];
  const host = window.location.hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  if (local) return [DEV_FN_URL, PROD_FN_URL];
  if (host.includes(".development.")) return [DEV_FN_URL];
  return [PROD_FN_URL];
}

type CatalystTokenAuth = {
  generateAuthToken?: () => Promise<{ access_token?: string } | string>;
};

let cachedCatalystToken = "";
let cachedCatalystTokenUntil = 0;

export function clearCachedCatalystAccessToken(): void {
  cachedCatalystToken = "";
  cachedCatalystTokenUntil = 0;
}

async function catalystAccessToken(): Promise<string> {
  if (typeof window === "undefined") return "";
  if (cachedCatalystToken && Date.now() < cachedCatalystTokenUntil) return cachedCatalystToken;
  const auth = (window as Window & { catalyst?: { auth?: CatalystTokenAuth } }).catalyst?.auth;
  if (!auth?.generateAuthToken) return "";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      auth.generateAuthToken(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Catalyst token timed out")), 7000);
      }),
    ]);
    const token = typeof response === "string" ? response : String(response?.access_token || "");
    if (token) {
      cachedCatalystToken = token;
      cachedCatalystTokenUntil = Date.now() + 50 * 60 * 1000;
    }
    return token;
  } catch {
    return "";
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function callFunction(body: Record<string, unknown>): Promise<Response | null> {
  const requestBody = JSON.stringify(body);
  let lastResponse: Response | null = null;
  for (const url of functionUrls()) {
    try {
      const sameOrigin = typeof window !== "undefined" && new URL(url).origin === window.location.origin;
      const send = async (accessToken: string) => fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain", ...(accessToken ? { Authorization: accessToken } : {}) },
        // A hosted Web Client can authenticate with its Catalyst session cookie
        // even when generateAuthToken is temporarily unavailable.
        credentials: sameOrigin || accessToken ? "include" : "omit",
        body: requestBody,
      });
      let res = await send(await catalystAccessToken());
      if (res.status === 401) {
        clearCachedCatalystAccessToken();
        const renewed = await catalystAccessToken();
        if (renewed) res = await send(renewed);
      }
      if (res.ok) return res;
      lastResponse = res;
      if (typeof window !== "undefined" && window.location.hostname.endsWith(".catalystserverless.in")) return res;
      if (res.status >= 400 && res.status < 500 && ![401, 403, 404].includes(res.status)) return res;
    } catch {
      // A network failure is reported as unavailable to the caller.
    }
  }
  return lastResponse;
}

export function aiConfigured(): boolean {
  return functionUrls().length > 0;
}

/** Green dot when a Function endpoint is configured. */
export function aiOnline(): boolean {
  return aiConfigured();
}

/** Resolve the request's authenticated Catalyst user through the Function. */
export async function fetchAuthenticatedOfficer(): Promise<{
  user: SessionUser;
  authenticated: boolean;
  auth_required: boolean;
} | null> {
  return ziaCall<{ user: SessionUser; authenticated: boolean; auth_required: boolean }>({ mode: "auth:me" });
}

/** Archive an authenticated login/logout event in the immutable NETRA audit trail. */
export async function recordAuthenticationAudit(
  action: "AUTH_LOGIN" | "AUTH_LOGOUT" | "AUTH_SESSION_VERIFIED",
): Promise<boolean> {
  const result = await ziaCall<{ ok?: boolean }>({
    mode: "auth:audit",
    action,
    path: typeof window === "undefined" ? "" : window.location.pathname,
    client: "NETRA Web Client",
  });
  return result?.ok === true;
}

/** List Catalyst project users for the administration workspace. */
export async function fetchCatalystUsers(): Promise<SessionUser[]> {
  const result = await ziaCall<{ users?: SessionUser[] }>({ mode: "auth:users" });
  return result?.users || [];
}

/** Read the most recent immutable audit objects archived in Stratus. */
export async function fetchAuditTrail(max = 50): Promise<Array<Record<string, unknown>>> {
  const result = await portalSessionRequest<{ rows?: Array<Record<string, unknown>> }>({ mode: "audit:list", max });
  return result?.rows || [];
}

export type PortalSession = {
  id: string;
  user: { id: string; username: string; full_name: string; role: SessionUser['role'] };
  status: 'active' | 'idle';
  started_at: string;
  last_seen_at: string;
  path: string;
  device: string;
};

export type PortalSessions = {
  rows: PortalSession[]; scope: 'department' | 'self'; observed_at: string;
  active_window_seconds: number; expiry_seconds: number; warnings: string[];
};

export async function portalSessionRequest<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await callFunction(payload);
  if (!response) throw new Error('The portal session service could not be reached.');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Portal session request failed (${response.status}).`);
  return data;
}

export const fetchPortalSessions = () => portalSessionRequest<PortalSessions>({ mode: 'auth:sessions' });

export async function caseJournalRequest(payload: Record<string, unknown>): Promise<{ rows?: Record<string, unknown>[]; row?: Record<string, unknown>; warning?: string }> {
  const response = await callFunction(payload);
  if (!response) throw new Error("Cloud Scale could not be reached.");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Case journal request failed (${response.status}).`);
  if (payload.mode === "journal:save" && typeof window !== "undefined") window.dispatchEvent(new Event("netra:records-updated"));
  return result;
}

export async function investigationRequest<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await callFunction(payload);
  if (!response) throw new Error("The investigation service could not be reached.");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `Investigation request failed (${response.status}).`);
  return result as T;
}

export interface CatalystInfraHealth {
  ok: boolean;
  environment: string;
  services: {
    authentication: boolean;
    datastore: boolean;
    stratus: { bucket: string } | boolean;
    cache: boolean;
    search: boolean | string;
    smartbrowz: boolean;
    zia: boolean;
    quickml: boolean;
    automl: boolean | string;
  };
  tables: string[];
}

/** Read the Function's live Catalyst service posture for the admin console. */
export async function fetchInfraHealth(): Promise<CatalystInfraHealth | null> {
  return ziaCall<CatalystInfraHealth>({ mode: "infra:health" });
}

export interface RagSource {
  title: string;
  snippet: string;
  score?: number | null;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiResponseMeta {
  source_chart?: import('@/components/assistant/SourceChart').SourceChartData;
  response_scope?: 'documents' | 'supplied';
  analysis?: import('./assistant-analysis').AssistantAnalysis;
  response_kind?: "conversation" | "clarification" | "records" | "no_data";
  confidence?: number | null;
  activity?: AnalysisActivity[];
  audit_id?: string;
  processing_ms?: number;
  model?: string;
}
export interface AnalysisActivity { stage: string; status: string; detail: string; at: string }

/**
 * Ask over the case-document knowledge base (RAG). The Catalyst Function calls
 * QuickML RAG, which retrieves the relevant passages from the case PDFs you
 * uploaded to the knowledge base and grounds the answer in them.
 * Returns the answer plus the source documents, or null if unavailable.
 */
export async function askRag(
  query: string,
  opts?: { history?: ConversationMessage[]; language?: "en" | "kn"; user?: Record<string, unknown>; document_ids?: string[]; analysis_context?: import('./assistant-analysis').AnalysisContext; onActivity?: (entry: AnalysisActivity) => void },
): Promise<{ answer: string; sources: RagSource[]; meta: AiResponseMeta } | null> {
  if (!functionUrls().length) return null;
  try {
    const { onActivity, ...request } = opts || {};
    const res = await callFunction({ mode: "rag", query, ...request, stream: true, refresh: true });
    if (!res) return null;
    let result: unknown;
    if (res.headers.get("Content-Type")?.includes("ndjson") && res.body) {
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let pending = "";
      const consume = (line: string) => { if (!line.trim()) return; const item = JSON.parse(line); if (item.type === "activity") onActivity?.(item.entry); if (item.type === "result") { if (item.status >= 400) throw new Error(item.data.error); result = item.data; } };
      while (true) { const { value, done } = await reader.read(); pending += decoder.decode(value, { stream: !done }); const lines = pending.split("\n"); pending = lines.pop() || ""; lines.forEach(consume); if (done) break; }
      consume(pending);
    } else result = await res.json();
    const j = result as { answer?: string; response?: string; sources?: RagSource[] } & AiResponseMeta;
    if (!j) return null;
    const answer = (j.answer || j.response || "").trim();
    return answer ? {
      answer,
      sources: Array.isArray(j.sources) ? j.sources : [],
      meta: { audit_id: j.audit_id, processing_ms: j.processing_ms, model: j.model, activity: j.activity, response_kind: j.response_kind, response_scope: j.response_scope, confidence: j.confidence, analysis: j.analysis, source_chart: j.source_chart },
    } : null;
  } catch {
    return null;
  }
}

/** Post a Zia job to the Function (token stays server-side). */
async function ziaCall<T>(body: Record<string, unknown>): Promise<T | null> {
  if (!functionUrls().length) return null;
  try {
    const res = await callFunction(body);
    if (!res || !res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function libraryCall<T>(body: Record<string, unknown>): Promise<T> {
  const response = await callFunction(body);
  if (!response) throw new Error('The document library could not be reached.');
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The document operation failed.');
  return result as T;
}

/** Translate text (default English → Kannada) via Zia. */
export async function translateText(text: string, target = "kn", source = "en"): Promise<string | null> {
  const j = await ziaCall<{ translation?: string }>({ mode: "translate", text, target, source });
  return (j?.translation || "").trim() || null;
}

/** Text-to-speech via Zia. Returns base64 audio (or null). */
export async function synthesizeSpeech(text: string, language = "en-IN"): Promise<string | null> {
  const j = await ziaCall<{ audio?: string; mime?: string }>({ mode: "tts", text, language });
  if (typeof j?.audio !== "string" || !j.audio.trim()) return null;
  if (j.audio.startsWith("data:")) return /^data:audio\/[\w.+-]+;base64,/i.test(j.audio) ? j.audio : null;
  const mime = /^audio\/[\w.+-]+$/i.test(j.mime || "") ? j.mime : "audio/wav";
  return `data:${mime};base64,${j.audio}`;
}

/** Analyze a recognized voice command with Catalyst Zia Text Analytics. */
export async function analyzeVoiceCommand(
  text: string,
  language: "en" | "kn" = "en",
): Promise<{ text: string; analytics?: unknown; analytics_text?: string } | null> {
  if (!text.trim()) return null;
  const j = await ziaCall<{ text?: string; analytics?: unknown; analytics_text?: string }>({ mode: "voice:nlp", text, language });
  const command = (j?.text || "").trim();
  return command ? { text: command, analytics: j?.analytics, analytics_text: j?.analytics_text } : null;
}

/** Transcribe a WAV recording with Catalyst Zia's audio model. */
export async function transcribeAudio(
  audio: string,
  language: "en" | "kn" = "en",
): Promise<{ text: string; language?: string; processing_ms?: number | null } | null> {
  if (!audio) return null;
  const response = await callFunction({
    mode: "transcribe",
    audio,
    language,
    mime: "audio/wav",
    name: "voice-command.wav",
  });
  if (!response) throw new Error("The transcription service could not be reached. Check your connection or retry with browser recognition.");
  if (response.status === 401) throw new Error("Your Catalyst session has expired. Sign in again before transcribing.");
  if (response.status === 403) throw new Error("Your Catalyst role cannot access transcription.");
  if (response.status === 429) throw new Error("The transcription service is rate-limited. Wait a moment before retrying.");
  const j = await response.json().catch(() => null) as { text?: unknown; language?: string; processing_ms?: number | null; code?: string; status?: number } | null;
  if (j?.code === "NO_TRANSCRIPT") throw new Error("The service returned no transcript. Check the selected microphone and language, or retry with browser recognition.");
  if (!response.ok) throw new Error(`Catalyst transcription is unavailable (HTTP ${response.status}${j?.status ? `; speech service ${j.status}` : ""}). This is a service failure, not a microphone recognition result.`);
  const text = typeof j?.text === "string" ? j.text.trim() : "";
  if (!text) throw new Error("The transcription service returned an unexpected response without speech text.");
  return { text, language: j?.language, processing_ms: j?.processing_ms };
}

export interface OcrResult {
  text: string;
  record_id?: string | null;
  evidence_id?: number;
  storage_ref?: Record<string, unknown>;
  warnings?: string[];
  audit_id?: string;
  model?: string;
}

/** OCR an FIR scan via Zia; the Function also stores it (Stratus + Data Store). */
export async function extractText(image: string, language = "eng", name = ""): Promise<OcrResult | null> {
  const j = await ziaCall<OcrResult>({ mode: "ocr", image, language, name });
  return j && typeof j.text === "string" ? j : null;
}

/** List stored OCR results from the Data Store (via the Function). */
export async function listOcr(): Promise<Array<Record<string, unknown>>> {
  const j = await ziaCall<{ rows?: Array<Record<string, unknown>> }>({ mode: "records:list" });
  return j?.rows || [];
}

export type EvidenceAnalysisMode = "ocr" | "object" | "face" | "moderate" | "barcode" | "compareFace" | "plate" | "crowd" | "cctv";

export interface EvidenceCriminalIntelligence {
  criminal: Record<string, unknown>;
  firs: Array<Record<string, unknown>>;
  arrests: Array<Record<string, unknown>>;
  vehicles: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  relationships?: Array<Record<string, unknown>>;
  associates?: Array<Record<string, unknown>>;
  counts: {
    firs: number;
    arrests: number;
    vehicles: number;
    evidence: number;
    victims?: number;
    complainants?: number;
    chargesheets?: number;
    stations?: number;
  };
  source: string;
}

export interface CaseRecordBundle {
  case: Record<string, unknown>;
  fir: Record<string, unknown>;
  suspects: Array<Record<string, unknown>>;
  victims: Array<Record<string, unknown>>;
  complainants: Array<Record<string, unknown>>;
  arrests: Array<Record<string, unknown>>;
  chargesheets: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  related: Array<Record<string, unknown>>;
  decision_summary: string;
  timeline: Array<{ date: string; type: string; label: string; source: string; record_id: string }>;
  leads: Array<{ priority: "high" | "medium" | "low"; title: string; rationale: string; evidence: string[] }>;
  source: string;
}

/** Resolve one case and every linked official KSP record in a single request. */
export async function fetchCaseRecord(id: number): Promise<CaseRecordBundle | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return ziaCall<CaseRecordBundle>({ mode: "record:case", id });
}

/** Resolve one deduplicated accused profile and its official KSP case history. */
export async function fetchCriminalRecord(id: number): Promise<EvidenceCriminalIntelligence | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return ziaCall<EvidenceCriminalIntelligence>({ mode: "record:criminal", id });
}

export interface EvidenceReferenceLink {
  profile_id: number | null;
  name: string | null;
  synthetic: boolean;
  sha256: string;
  link_method: "exact_synthetic_asset_sha256" | "unidentified";
  notice: string;
}

export async function resolveEvidenceReference(image: string, name: string, mime: string): Promise<EvidenceReferenceLink> {
  const res = await callFunction({ mode: "evidence:reference", image, name, mime });
  if (!res) throw new Error("Reference lookup unavailable. The analysis will check the uploaded reference again.");
  const payload = await res.json();
  if (!res.ok || !payload.reference_link) throw new Error(payload.error || "The reference could not be checked.");
  return payload.reference_link;
}

export interface EvidenceAnalysisResult {
  reference_link?: EvidenceReferenceLink;
  linked?: boolean;
  text?: string;
  result?: unknown;
  record_id?: string | null;
  evidence_id?: number;
  storage_ref?: Record<string, unknown>;
  warnings?: string[];
  audit_id?: string;
  model?: string;
  workflow?: string;
  plate?: string;
  candidates?: string[];
  match?: { matched: boolean; confidence: number };
  intelligence?: EvidenceCriminalIntelligence | null;
  correlation?: {
    plate: string;
    vehicle: Record<string, unknown> | null;
    intelligence: EvidenceCriminalIntelligence | null;
    source: string;
    associated_firs?: Array<Record<string, unknown>>;
    duplicate_plate_observed?: boolean;
  } | null;
  resolved_fir_id?: number | null;
  detected_fir_number?: string | null;
  ocr_confidence?: number | null;
  case_intelligence?: CaseRecordBundle | null;
  target_profile?: {
    id: number;
    name: string;
    portrait_asset?: string;
    synthetic: boolean;
  } | null;
  video_analysis?: {
    duration_seconds: number;
    sample_count: number;
    scan_scope: string;
    target_profile_id: number | null;
    best_frame_index: number | null;
    best_timestamp: number | null;
    matching_frames: number;
    successful_frames: number;
    frames: Array<{
      index: number;
      timestamp: number;
      matched: boolean;
      confidence: number;
      error?: string;
      preview?: string;
    }>;
  };
}

/** Analyze and persist an evidence image through Catalyst Zia + Stratus. */
export async function analyzeEvidence(
  mode: EvidenceAnalysisMode,
  image: string,
  options: {
    name: string;
    mime: string;
    fir_id?: number;
    description?: string;
    language?: string;
    image2?: string;
    name2?: string;
    mime2?: string;
    plate_hint?: string;
  },
): Promise<EvidenceAnalysisResult | null> {
  const res = await callFunction({ mode, image, ...options });
  if (!res) throw new Error("Catalyst Function is unreachable.");
  const payload = await res.json().catch(() => ({})) as EvidenceAnalysisResult & { error?: string; detail?: string };
  if (!res.ok) throw new Error(payload.error || payload.detail || `Evidence analysis failed (${res.status}).`);
  return payload;
}

/** Analyze runtime-extracted frames from an uploaded CCTV clip against one verified watchlist portrait. */
export async function analyzeCctvEvidence(options: {
  video: string;
  video_name: string;
  video_mime: string;
  duration_seconds: number;
  frames: Array<{ index: number; timestamp: number; image: string }>;
  reference: string;
  reference_name: string;
  reference_mime: string;
  fir_id?: number;
  description?: string;
}): Promise<EvidenceAnalysisResult | null> {
  const res = await callFunction({
    mode: "cctv",
    video: options.video,
    video_name: options.video_name,
    video_mime: options.video_mime,
    duration_seconds: options.duration_seconds,
    frames: options.frames,
    image2: options.reference,
    name2: options.reference_name,
    mime2: options.reference_mime,
    fir_id: options.fir_id,
    description: options.description,
  });
  if (!res) throw new Error("Catalyst Function is unreachable.");
  const payload = await res.json().catch(() => ({})) as EvidenceAnalysisResult & { error?: string; detail?: string };
  if (!res.ok) throw new Error(payload.error || payload.detail || `CCTV analysis failed (${res.status}).`);
  return payload;
}

/** Link an existing analysis record to an official FIR and return its relational context. */
export async function linkEvidenceToFir(
  evidence: EvidenceAnalysisResult,
  firId: number,
): Promise<EvidenceAnalysisResult> {
  const res = await callFunction({
    mode: "evidence:link",
    fir_id: firId,
    evidence_id: evidence.evidence_id,
    record_id: evidence.record_id,
    plate: evidence.plate,
  });
  if (!res) throw new Error("Catalyst Function is unreachable.");
  const payload = await res.json().catch(() => ({})) as EvidenceAnalysisResult & { error?: string; detail?: string };
  if (!res.ok) throw new Error(payload.error || payload.detail || `Evidence linkage failed (${res.status}).`);
  return payload;
}

export interface CloudSearchResult {
  hits: Array<{ table: string; score: number; row: Record<string, unknown> }>;
  engine: string;
  warning?: string | null;
  cache?: boolean;
  audit_id?: string;
}

/** Full-text Search over indexed Catalyst tables, with a bounded DB fallback. */
export async function searchCloudRecords(query: string, max = 24): Promise<CloudSearchResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const remote = await ziaCall<CloudSearchResult>({ mode: "search:records", query: trimmed, max });
  if (remote?.hits?.length) return remote;

  // Older Function deployments expose table reads but not Search. Keep the
  // investigation usable by matching a bounded set of Cloud Scale rows in the
  // browser until the current Function is promoted.
  const tableLimits: Array<[string, number]> = [
    ["Firs", 1000],
    ["Cases", 500],
    ["Criminals", 500],
    ["Evidence", 500],
    ["Vehicles", 500],
  ];
  const stop = new Set(["about", "and", "are", "case", "cases", "files", "from", "give", "into", "show", "summarise", "summary", "tell", "that", "the", "these", "this", "what", "which", "with"]);
  const tokens = trimmed.toLowerCase().match(/[a-z0-9]+/g)?.map((token) => token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token)
    .filter((token) => token.length >= 3 && !stop.has(token)) || [];
  const rowsByTable = await Promise.all(tableLimits.map(async ([table, limit]) => ({ table, rows: await listRecords(table, limit) })));
  const hits = rowsByTable.flatMap(({ table, rows }) => rows.map((row) => {
    const searchable = Object.entries(row).flatMap(([key, value]) => [key, value]).join(" ").toLowerCase();
    const score = tokens.reduce((total, token) => total + (searchable.includes(token) ? 1 : 0), 0)
      + (searchable.includes(trimmed.toLowerCase()) ? 2 : 0);
    return { table, score, row };
  })).filter((hit) => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, Math.max(1, max));

  const fallback = hits.length ? hits : rowsByTable.find(({ table }) => table === "Firs")?.rows.slice(0, Math.max(1, max)).map((row) => ({ table: "Firs", score: 0.1, row })) || [];
  return {
    hits: fallback,
    engine: "browser-cloudscale-scan",
    warning: "Catalyst Search is not available in the current Function deployment; results were matched directly against live Cloud Scale rows.",
  };
}

export interface PdfExportResult {
  pdf?: string;
  html?: string;
  template_version?: string;
  mime?: string;
  filename?: string;
  storage_ref?: string | null;
  audit_id?: string;
  library_id?: string | null;
  warning?: string | null;
}

/** Generate and archive a confidential PDF using Catalyst SmartBrowz. */
export async function exportConversationPdf(
  turns: Array<Record<string, unknown>>,
  title = "NETRA Investigation Conversation",
  preview = false,
): Promise<PdfExportResult> {
  const result = await libraryCall<PdfExportResult>({ mode: preview ? 'report:preview' : "report:pdf", title, turns });
  return result;
}

/** Invoke the configured Zia AutoML endpoint. */
export async function predictWithAutoML(input: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  return ziaCall<Record<string, unknown>>({ mode: "automl:predict", input });
}

/**
 * Read rows from a Cloud Scale Data Store table (allowlisted server-side via
 * DATASTORE_TABLES). Read-only, row-capped — the app's live-data read path.
 */
export async function listRecords(table: string, max = 50, refresh = false): Promise<Array<Record<string, unknown>>> {
  const j = await ziaCall<{ rows?: Array<Record<string, unknown>> }>({ mode: "records", table, max, refresh });
  return j?.rows || [];
}

/** Fetch several KSP-derived views with one relational Cloud Scale read. */
export async function listRecordBundle(
  tables: string[],
  refresh = false,
  max = 5000,
): Promise<Record<string, Array<Record<string, unknown>>>> {
  const response = await callFunction({ mode: "records:bundle", tables, refresh, max });
  if (!response?.ok) {
    const failure = response ? await response.json().catch(() => null) : null;
    throw new Error(response?.status === 401
      ? "Your Catalyst session cannot access the Production data service. Sign out and sign in again."
      : failure?.error || `Cloud Scale data could not be loaded${response ? ` (HTTP ${response.status})` : ""}.`);
  }
  const result = await response.json() as { tables?: Record<string, Array<Record<string, unknown>>> };
  if (!result.tables || tables.some(table => !Array.isArray(result.tables?.[table]))) {
    throw new Error("Cloud Scale returned an incomplete response. Verify that the deployed Function supports all requested investigator views.");
  }
  return result.tables;
}

/** Read table totals without transferring police records to the browser. */
export async function listRecordCounts(tables: string[], refresh = false): Promise<Record<string, number | null>> {
  const result = await ziaCall<{ counts?: Record<string, number | null> }>({ mode: "records:counts", tables, refresh });
  return result?.counts || Object.fromEntries(tables.map((table) => [table, null]));
}

/* ── Notifications — durable state in a Cloud Scale Data Store table ──────── */
export interface NotificationRow {
  id: string; ts: string; kind: string; severity: string;
  title: string; detail: string; entity: string; entity_id: string; status: string;
}

/** List notifications from the Data Store (via the Function). Empty-safe. */
export async function fetchNotifications(max = 50): Promise<NotificationRow[]> {
  const j = await ziaCall<{ rows?: Array<Record<string, unknown>> }>({ mode: "notif:list", max });
  const s = (r: Record<string, unknown>, ...k: string[]) => { for (const x of k) if (r[x] != null) return String(r[x]); return ""; };
  return (j?.rows || []).map((r) => ({
    id: s(r, "ROWID", "id"),
    ts: s(r, "ts", "CREATEDTIME"),
    kind: s(r, "kind") || "system",
    severity: s(r, "severity"),
    title: s(r, "title"),
    detail: s(r, "detail"),
    entity: s(r, "entity"),
    entity_id: s(r, "entity_id"),
    status: s(r, "status") || "unread",
  }));
}

/** Update one notification's status (read / archived / unread). Returns success. */
export async function setNotificationStatus(rowid: string, status: "read" | "archived" | "unread"): Promise<boolean> {
  const j = await ziaCall<{ ok?: boolean }>({ mode: "notif:update", rowid, status });
  return !!(j && j.ok);
}

/* ── NLP over case text (via the Function's `nlp` mode → QuickML) ─────────── */
export interface NlpExtract { names: string[]; locations: string[]; dates: string[]; organizations: string[]; vehicles: string[]; phones: string[]; financial: string[]; confidence: number }
export interface NlpSummary { summary: string; confidence: number }
export interface NlpLink { from: string; type: string; to: string; confidence: number }
export interface NlpEntities { links: NlpLink[]; confidence: number }
export type NlpOp = "extract" | "summarize" | "entities";

/**
 * Run an NLP op over supplied case text. The text is grounded in the Cloud Scale
 * Data Store (whatever the page holds); QuickML only analyses it. Returns the
 * parsed JSON result, or null when the Function/model is unavailable.
 */
export async function analyzeCase<T = Record<string, unknown>>(op: NlpOp, text: string): Promise<T | null> {
  if (!text.trim()) return null;
  const j = await ziaCall<{ op?: string; result?: T | null }>({ mode: "nlp", op, text });
  return (j && j.result) || null;
}

/** Ask the Catalyst Function. Returns the answer text, or null if unavailable. */
export async function askAssistant(
  prompt: string,
  opts?: {
    system?: string;
    temperature?: number;
    history?: ConversationMessage[];
    language?: "en" | "kn";
    user?: Record<string, unknown>;
  },
): Promise<{ answer: string; meta: AiResponseMeta } | null> {
  if (!functionUrls().length) return null;
  try {
    const res = await callFunction({ prompt, ...opts, temperature: opts?.temperature ?? 0.2 });
    if (!res) return null;
    const j = (await res.json()) as { response?: string; answer?: string; text?: string } & AiResponseMeta;
    const answer = (j.response || j.answer || j.text || "").trim();
    return answer ? {
      answer,
      meta: { audit_id: j.audit_id, processing_ms: j.processing_ms, model: j.model, response_kind: j.response_kind, confidence: j.confidence, analysis: j.analysis },
    } : null;
  } catch {
    return null;
  }
}
