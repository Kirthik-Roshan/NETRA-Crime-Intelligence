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
 * Defaults to the deployed KspHacks ai_quickml Function (public endpoint,
 * CORS-restricted to the onslate.in origin; the QuickML credentials live only
 * inside the Function). Override with NEXT_PUBLIC_AI_FN_URL at build time.
 */
const FN_URL =
  process.env.NEXT_PUBLIC_AI_FN_URL ||
  "https://ksphacks-60080085094.development.catalystserverless.in/server/ai_quickml/";

export function aiConfigured(): boolean {
  return FN_URL.length > 0;
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
  if (!FN_URL) return null;
  try {
    const res = await fetch(FN_URL, {
      method: "POST",
      // text/plain keeps this a CORS "simple request" → no preflight. Catalyst
      // intercepts OPTIONS without CORS headers, so a preflight would be blocked;
      // the Function parses the raw JSON body regardless of content-type.
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ mode: "rag", query }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { answer?: string; response?: string; sources?: RagSource[] };
    const answer = (j.answer || j.response || "").trim();
    return answer ? { answer, sources: Array.isArray(j.sources) ? j.sources : [] } : null;
  } catch {
    return null;
  }
}

/** Post a Zia job to the Function (token stays server-side). */
async function ziaCall<T>(body: Record<string, unknown>): Promise<T | null> {
  if (!FN_URL) return null;
  try {
    const res = await fetch(FN_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
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

/** Speech-to-text via Zia. audio = base64 (no data: prefix). */
export async function transcribeAudio(audio: string, language = "en-IN"): Promise<string | null> {
  const j = await ziaCall<{ text?: string }>({ mode: "transcribe", audio, language });
  return (j?.text || "").trim() || null;
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

/** Ask the Catalyst Function. Returns the answer text, or null if unavailable. */
export async function askAssistant(
  prompt: string,
  opts?: { system?: string; temperature?: number },
): Promise<string | null> {
  if (!FN_URL) return null;
  try {
    const res = await fetch(FN_URL, {
      method: "POST",
      // text/plain keeps this a CORS "simple request" → no preflight. Catalyst
      // intercepts OPTIONS without CORS headers, so a preflight would be blocked;
      // the Function parses the raw JSON body regardless of content-type.
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ prompt, system: opts?.system, temperature: opts?.temperature ?? 0.2 }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { response?: string; answer?: string; text?: string };
    return (j.response || j.answer || j.text || "").trim() || null;
  } catch {
    return null;
  }
}
