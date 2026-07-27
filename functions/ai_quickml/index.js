/**
 * NETRA — Catalyst Serverless (Advanced I/O) function: AI backend for the
 * static NETRA frontend (Slate). The static site has no server, so the browser
 * calls this function directly. It holds the QuickML token server-side and
 * reaches Zoho Catalyst QuickML. AI backend: Catalyst QuickML only.
 *
 * Two modes (JSON body field `mode`):
 *   mode: "rag"  → answer over the case-document knowledge base (RAG). Returns
 *                  { answer, sources }. This is what "analyze the PDFs and say"
 *                  uses — upload your case PDFs to the QuickML RAG knowledge
 *                  base in the Catalyst console, then ask questions here.
 *   mode: "chat" → plain LLM answer (default). Returns { response }.
 *
 * CORS: the frontend is a different origin (…onslate.in) from this function
 * (…catalystserverless.…), so every response carries CORS headers and OPTIONS
 * preflight is answered. Without this the browser blocks the call.
 *
 * Env (Catalyst console → this function → Configuration):
 *   CATALYST_DC_BASE, CATALYST_ORG, CATALYST_PROJECT_ID, CATALYST_QUICKML_TOKEN,
 *   CATALYST_LLM_MODEL (default VL-Qwen3.6-35B-A3B), CATALYST_LLM_PATH (vlm/chat),
 *   CATALYST_RAG_PATH (default rag/answer), CORS_ALLOW_ORIGIN (default *).
 */
function cors(res) {
  const origin = process.env.CORS_ALLOW_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

module.exports = async (req, res) => {
  cors(res);

  // Preflight.
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const payload = JSON.parse(body || "{}");
      const mode = payload.mode || "chat";

      const base = process.env.CATALYST_DC_BASE || "https://api.catalyst.zoho.in";
      const org = process.env.CATALYST_ORG;
      const project = process.env.CATALYST_PROJECT_ID;
      const token = process.env.CATALYST_QUICKML_TOKEN;
      if (!token || !org || !project) {
        res.status(503).json({ error: "QuickML not configured", answer: null, response: null });
        return;
      }
      const authHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "CATALYST-ORG": org,
      };

      // ── RAG over the case-document knowledge base ──
      if (mode === "rag") {
        const query = payload.query || payload.prompt;
        if (!query) {
          res.status(400).json({ error: "query required" });
          return;
        }
        const ragPath = process.env.CATALYST_RAG_PATH || "rag/answer";
        const r = await fetch(`${base}/quickml/v1/project/${project}/${ragPath}`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ query, top_k: payload.top_k ?? 5 }),
        });
        if (!r.ok) {
          res.status(502).json({ error: "QuickML RAG upstream error", answer: null });
          return;
        }
        const data = await r.json();
        const answer = data?.answer ?? data?.response ?? data?.output ?? null;
        // Normalise whatever the RAG endpoint returns for citations into a
        // simple { title, snippet, score } list the frontend can render.
        const raw = data?.sources || data?.citations || data?.documents || [];
        const sources = (Array.isArray(raw) ? raw : []).map((s) => ({
          title: s.title || s.document || s.file || s.source || s.name || "Case document",
          snippet: s.snippet || s.text || s.content || s.chunk || "",
          score: s.score ?? s.relevance ?? null,
        }));
        res.status(200).json({ answer, sources });
        return;
      }

      // ── Plain LLM chat ──
      const { prompt, system, temperature } = payload;
      if (!prompt) {
        res.status(400).json({ error: "prompt required" });
        return;
      }
      const model = process.env.CATALYST_LLM_MODEL || "VL-Qwen3.6-35B-A3B";
      const path = process.env.CATALYST_LLM_PATH || "vlm/chat";
      const r = await fetch(`${base}/quickml/v1/project/${project}/${path}`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          prompt,
          model,
          system_prompt: system,
          images: [],
          temperature: temperature ?? 0.2,
          top_k: 50,
          top_p: 0.9,
          max_tokens: 700,
        }),
      });
      if (!r.ok) {
        res.status(502).json({ error: "QuickML upstream error", response: null });
        return;
      }
      const data = await r.json();
      const text = data?.response ?? data?.answer ?? data?.output ?? data?.text ?? null;
      res.status(200).json({ response: text });
    } catch (e) {
      res.status(500).json({ error: String(e), answer: null, response: null });
    }
  });
};
