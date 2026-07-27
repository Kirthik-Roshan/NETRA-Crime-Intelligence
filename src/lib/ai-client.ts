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
 */
const FN_URL = process.env.NEXT_PUBLIC_AI_FN_URL || "";

export function aiConfigured(): boolean {
  return FN_URL.length > 0;
}

/** Green dot when a Function endpoint is configured. */
export function aiOnline(): boolean {
  return aiConfigured();
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, system: opts?.system, temperature: opts?.temperature ?? 0.2 }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { response?: string; answer?: string; text?: string };
    return (j.response || j.answer || j.text || "").trim() || null;
  } catch {
    return null;
  }
}
