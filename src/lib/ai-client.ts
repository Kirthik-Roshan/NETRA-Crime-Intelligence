"use client";
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
const FN_URLS = [...new Set([process.env.NEXT_PUBLIC_AI_FN_URL || DEV_FN_URL, DEV_FN_URL, PROD_FN_URL].filter(Boolean))];

async function callFunction(body: Record<string, unknown>): Promise<Response | null> {
  for (const url of FN_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        // text/plain keeps this a CORS "simple request". The Function parses
        // the raw JSON body regardless of content-type.
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(body),
      });
      if (res.ok) return res;
    } catch {
      // Try the next configured Catalyst environment.
    }
  }
  return null;
}

export function aiConfigured(): boolean {
  return FN_URLS.length > 0;
}

/** Green dot when a Function endpoint is configured. */
export function aiOnline(): boolean {
  return aiConfigured();
}

export interface RagSource {
  title: string;
  snippet: string;
  score?: number | null;
}

/**
 * Ask over the case-document knowledge base (RAG). The Catalyst Function calls
 * QuickML RAG, which retrieves the relevant passages from the case PDFs you
 * uploaded to the knowledge base and grounds the answer in them.
 * Returns the answer plus the source documents, or null if unavailable.
 */
export async function askRag(
  query: string,
): Promise<{ answer: string; sources: RagSource[] } | null> {
  if (!FN_URLS.length) return null;
  try {
    const res = await callFunction({ mode: "rag", query });
    if (!res) return null;
    const j = (await res.json()) as { answer?: string; response?: string; sources?: RagSource[] };
    const answer = (j.answer || j.response || "").trim();
    return answer ? { answer, sources: Array.isArray(j.sources) ? j.sources : [] } : null;
  } catch {
    return null;
  }
}

/** Post a Zia job to the Function (token stays server-side). */
async function ziaCall<T>(body: Record<string, unknown>): Promise<T | null> {
  if (!FN_URLS.length) return null;
  try {
    const res = await callFunction(body);
    if (!res) return null;
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

export interface OcrResult { text: string; file_id?: string | null; record_id?: string | null }

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

/**
 * Read rows from a Cloud Scale Data Store table (allowlisted server-side via
 * DATASTORE_TABLES). Read-only, row-capped — the app's live-data read path.
 */
export async function listRecords(table: string, max = 50): Promise<Array<Record<string, unknown>>> {
  const j = await ziaCall<{ rows?: Array<Record<string, unknown>> }>({ mode: "records", table, max });
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
  opts?: { system?: string; temperature?: number },
): Promise<string | null> {
  if (!FN_URLS.length) return null;
  try {
    const res = await callFunction({ prompt, system: opts?.system, temperature: opts?.temperature ?? 0.2 });
    if (!res) return null;
    const j = (await res.json()) as { response?: string; answer?: string; text?: string };
    return (j.response || j.answer || j.text || "").trim() || null;
  } catch {
    return null;
  }
}
