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
 * Development is the default because that Function currently owns the
 * QuickML/Zia credentials and the first Cloud Scale import. A configured URL
 * still wins, and Production remains available once its Function is promoted.
 */
const PROD_FN_URL = "https://ksphacks-60080085094.catalystserverless.in/server/ai_quickml/";
const DEV_FN_URL = "https://ksphacks-60080085094.development.catalystserverless.in/server/ai_quickml/";
const EXPLICIT_FN_URL = process.env.NEXT_PUBLIC_AI_FN_URL || "";
const CATALYST_AUTH_ENABLED = process.env.NEXT_PUBLIC_CATALYST_AUTH_ENABLED === "true";

function functionUrls(): string[] {
  if (EXPLICIT_FN_URL) return [EXPLICIT_FN_URL];
  if (typeof window === "undefined") return [PROD_FN_URL];
  const host = window.location.hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  return [local || host.includes(".development.") ? DEV_FN_URL : PROD_FN_URL];
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
  if (!CATALYST_AUTH_ENABLED || typeof window === "undefined") return "";
  if (cachedCatalystToken && Date.now() < cachedCatalystTokenUntil) return cachedCatalystToken;
  const auth = (window as Window & { catalyst?: { auth?: CatalystTokenAuth } }).catalyst?.auth;
  if (!auth?.generateAuthToken) return "";
  try {
    const response = await auth.generateAuthToken();
    const token = typeof response === "string" ? response : String(response?.access_token || "");
    if (token) {
      cachedCatalystToken = token;
      cachedCatalystTokenUntil = Date.now() + 50 * 60 * 1000;
    }
    return token;
  } catch {
    return "";
  }
}

async function callFunction(body: Record<string, unknown>): Promise<Response | null> {
  const accessToken = await catalystAccessToken();
  for (const url of functionUrls()) {
    try {
      const res = await fetch(url, {
        method: "POST",
        // Keep the payload compatible with unauthenticated localhost calls.
        // Hosted auth adds Authorization, and the Function handles its CORS preflight.
        headers: {
          "Content-Type": "text/plain",
          ...(accessToken ? { Authorization: accessToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify(body),
      });
      return res;
    } catch {
      // A network failure is reported as unavailable to the caller.
    }
  }
  return null;
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

/** List Catalyst project users for the administration workspace. */
export async function fetchCatalystUsers(): Promise<SessionUser[]> {
  const result = await ziaCall<{ users?: SessionUser[] }>({ mode: "auth:users" });
  return result?.users || [];
}

/** Read the most recent immutable audit objects archived in Stratus. */
export async function fetchAuditTrail(max = 50): Promise<Array<Record<string, unknown>>> {
  const result = await ziaCall<{ rows?: Array<Record<string, unknown>> }>({ mode: "audit:list", max });
  return result?.rows || [];
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
  audit_id?: string;
  processing_ms?: number;
  model?: string;
}

/**
 * Ask over the case-document knowledge base (RAG). The Catalyst Function calls
 * QuickML RAG, which retrieves the relevant passages from the case PDFs you
 * uploaded to the knowledge base and grounds the answer in them.
 * Returns the answer plus the source documents, or null if unavailable.
 */
export async function askRag(
  query: string,
  opts?: { history?: ConversationMessage[]; language?: "en" | "kn"; user?: Record<string, unknown> },
): Promise<{ answer: string; sources: RagSource[]; meta: AiResponseMeta } | null> {
  if (!functionUrls().length) return null;
  try {
    const res = await callFunction({ mode: "rag", query, ...opts });
    if (!res) return null;
    const j = (await res.json()) as { answer?: string; response?: string; sources?: RagSource[] } & AiResponseMeta;
    const answer = (j.answer || j.response || "").trim();
    return answer ? {
      answer,
      sources: Array.isArray(j.sources) ? j.sources : [],
      meta: { audit_id: j.audit_id, processing_ms: j.processing_ms, model: j.model },
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

/** Translate text (default English → Kannada) via Zia. */
export async function translateText(text: string, target = "kn", source = "en"): Promise<string | null> {
  const j = await ziaCall<{ translation?: string }>({ mode: "translate", text, target, source });
  return (j?.translation || "").trim() || null;
}

/** Text-to-speech via Zia. Returns base64 audio (or null). */
export async function synthesizeSpeech(text: string, language = "en-IN"): Promise<string | null> {
  const j = await ziaCall<{ audio?: string }>({ mode: "tts", text, language });
  return j?.audio || null;
}

/** Analyze a recognized voice command with Catalyst Zia Text Analytics. */
export async function analyzeVoiceCommand(text: string): Promise<{ text: string; analytics?: unknown } | null> {
  if (!text.trim()) return null;
  const j = await ziaCall<{ text?: string; analytics?: unknown }>({ mode: "voice:nlp", text });
  const command = (j?.text || "").trim();
  return command ? { text: command, analytics: j?.analytics } : null;
}

/** Transcribe a WAV recording with Catalyst Zia's audio model. */
export async function transcribeAudio(
  audio: string,
  language: "en" | "kn" = "en",
): Promise<{ text: string; language?: string; processing_ms?: number | null } | null> {
  if (!audio) return null;
  const j = await ziaCall<{ text?: string; language?: string; processing_ms?: number | null }>({
    mode: "transcribe",
    audio,
    language,
    mime: "audio/wav",
    name: "voice-command.wav",
  });
  const text = (j?.text || "").trim();
  return text ? { text, language: j?.language, processing_ms: j?.processing_ms } : null;
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

export type EvidenceAnalysisMode = "ocr" | "object" | "face" | "moderate" | "barcode" | "compareFace" | "plate" | "crowd";

export interface EvidenceCriminalIntelligence {
  criminal: Record<string, unknown>;
  firs: Array<Record<string, unknown>>;
  arrests: Array<Record<string, unknown>>;
  vehicles: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  counts: { firs: number; arrests: number; vehicles: number; evidence: number };
  source: string;
}

export interface EvidenceAnalysisResult {
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
  } | null;
  resolved_fir_id?: number | null;
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
    criminal_id?: number;
    plate_hint?: string;
  },
): Promise<EvidenceAnalysisResult | null> {
  const res = await callFunction({ mode, image, ...options });
  if (!res) throw new Error("Catalyst Function is unreachable.");
  const payload = await res.json().catch(() => ({})) as EvidenceAnalysisResult & { error?: string; detail?: string };
  if (!res.ok) throw new Error(payload.error || payload.detail || `Evidence analysis failed (${res.status}).`);
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
  if (!query.trim()) return null;
  return ziaCall<CloudSearchResult>({ mode: "search:records", query, max });
}

export interface PdfExportResult {
  pdf: string;
  mime: string;
  filename: string;
  storage_ref?: string | null;
  audit_id?: string;
}

/** Generate and archive a confidential PDF using Catalyst SmartBrowz. */
export async function exportConversationPdf(
  turns: Array<Record<string, unknown>>,
  title = "NETRA Investigation Conversation",
): Promise<PdfExportResult | null> {
  return ziaCall<PdfExportResult>({ mode: "report:pdf", title, turns });
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
      meta: { audit_id: j.audit_id, processing_ms: j.processing_ms, model: j.model },
    } : null;
  } catch {
    return null;
  }
}
