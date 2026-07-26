/**
 * NETRA — Catalyst Serverless (Advanced I/O) function.
 *
 * Optional server-side AI proxy. The Next.js app (on AppSail) can call this
 * function to reach Catalyst QuickML LLM serving behind the Catalyst API
 * Gateway, keeping the model call audited and rate-limited. The app can also
 * call QuickML directly (see src/lib/catalyst.ts) — this function mirrors that
 * contract for teams that prefer a Functions boundary.
 *
 * AI backend: Zoho Catalyst QuickML only. No external LLM is used.
 */
module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    try {
      const { prompt, system, temperature } = JSON.parse(body || "{}");
      if (!prompt) {
        res.status(400).json({ error: "prompt required" });
        return;
      }

      const base = process.env.CATALYST_DC_BASE || "https://api.catalyst.zoho.in";
      const org = process.env.CATALYST_ORG;
      const project = process.env.CATALYST_PROJECT_ID;
      const token = process.env.CATALYST_QUICKML_TOKEN;
      const model = process.env.CATALYST_LLM_MODEL || "VL-Qwen3.6-35B-A3B";
      const path = process.env.CATALYST_LLM_PATH || "vlm/chat";
      if (!token || !org || !project) {
        res.status(503).json({ error: "QuickML not configured", response: null });
        return;
      }

      // Call the Catalyst QuickML LLM-serving endpoint.
      const r = await fetch(`${base}/quickml/v1/project/${project}/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "CATALYST-ORG": org,
        },
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
      res.status(500).json({ error: String(e), response: null });
    }
  });
};
