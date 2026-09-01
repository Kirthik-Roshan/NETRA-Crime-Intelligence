/**
 * Zoho Catalyst QuickML + Zia client — the ONLY AI backend.
 *
 * NETRA uses no external AI product. Everything is env-configured; no secrets
 * are hardcoded. If CATALYST_QUICKML_TOKEN is not set (local dev), callers fall
 * back to NETRA's built-in deterministic engine so the app still runs offline.
 *
 * Set these in your Catalyst environment (Console → Environment Variables):
 *   CATALYST_DC_BASE       = https://api.catalyst.zoho.in
 *   CATALYST_ORG           = 60079036047
 *   CATALYST_PROJECT_ID    = 52939000000021001
 *   CATALYST_QUICKML_TOKEN = <your Bearer token>
 *   CATALYST_LLM_MODEL     = VL-Qwen3.6-35B-A3B      (or your text model)
 *   CATALYST_LLM_PATH      = vlm/chat                 (or llm/chat)
 */
const BASE = process.env.CATALYST_DC_BASE || "https://api.catalyst.zoho.in";
const ORG = process.env.CATALYST_ORG || "60080085094";
const PROJECT = process.env.CATALYST_PROJECT_ID || "56798000000013049";
const TOKEN = process.env.CATALYST_QUICKML_TOKEN || "";

export const LLM_MODEL = process.env.CATALYST_LLM_MODEL || "VL-Qwen3.6-35B-A3B";

const LLM_PATH = process.env.CATALYST_LLM_PATH || "vlm/chat";

export function catalystConfigured(): boolean {
  return TOKEN.length > 0;
}

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Zoho-oauthtoken ${TOKEN}`,   
   "CATALYST-ORG": ORG,
  };
}

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), ms);
  try {
    return await p(c.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** QuickML LLM chat. Text-only by default (no images) — works with /vlm/chat too. */
export async function quickmlChat(
  prompt: string,
  opts?: { system?: string; temperature?: number; images?: string[] }
): Promise<string | null> {
  if (!catalystConfigured()) return null;
  const url = `${BASE}/quickml/v1/project/${PROJECT}/${LLM_PATH}`;
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(url, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          prompt,
          model: LLM_MODEL,
          system_prompt: opts?.system,
          images: opts?.images ?? [],
          temperature: opts?.temperature ?? 0.2,
          top_k: 50,
          top_p: 0.9,
          max_tokens: 700,
        }),
        signal,
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { response?: string; answer?: string; output?: string; text?: string };
      return (j.response || j.answer || j.output || j.text || "").trim() || null;
    }, 30000);
  } catch {
    return null;
  }
}

/** QuickML RAG — answers over a Catalyst Knowledge Base. */
export async function quickmlRag(query: string): Promise<{ answer: string; sources?: unknown[] } | null> {
  if (!catalystConfigured()) return null;
  const url = `${BASE}/quickml/v1/project/${PROJECT}/rag/answer`;
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(url, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ query, top_k: 5 }),
        signal,
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { answer?: string; response?: string; sources?: unknown[] };
      const answer = (j.answer || j.response || "").trim();
      return answer ? { answer, sources: j.sources } : null;
    }, 30000);
  } catch {
    return null;
  }
}

/* ── Zia Services (voice + translation) — production voice path ── */

/** Speech-to-text (Kannada/English) via Zia. audio = base64. */
export async function ziaTranscribe(audioBase64: string, language = "en-IN"): Promise<string | null> {
  if (!catalystConfigured()) return null;
  const url = `${BASE}/quickml/api/v1/models/zia/audio/transcribe`;
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify({ audio: audioBase64, language }), signal });
      if (!res.ok) return null;
      const j = (await res.json()) as { text?: string; transcript?: string };
      return (j.text || j.transcript || "").trim() || null;
    }, 30000);
  } catch {
    return null;
  }
}

/** Text-to-speech via Zia. Returns base64 audio. */
export async function ziaTts(text: string, language = "en-IN"): Promise<string | null> {
  if (!catalystConfigured()) return null;
  const url = `${BASE}/quickml/api/v1/models/zia/tts/synthesize`;
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify({ text, language }), signal });
      if (!res.ok) return null;
      const j = (await res.json()) as { audio?: string };
      return j.audio || null;
    }, 30000);
  } catch {
    return null;
  }
}

/** Translation (e.g. English → Kannada) via Zia. */
export async function ziaTranslate(text: string, target = "kn", source = "en"): Promise<string | null> {
  if (!catalystConfigured()) return null;
  const url = `${BASE}/quickml/api/v1/models/zia/translate`;
  try {
    return await withTimeout(async (signal) => {
      const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify({ text, target_language: target, source_language: source }), signal });
      if (!res.ok) return null;
      const j = (await res.json()) as { translation?: string; text?: string };
      return (j.translation || j.text || "").trim() || null;
    }, 30000);
  } catch {
    return null;
  }
}
