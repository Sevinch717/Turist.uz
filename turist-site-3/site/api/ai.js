// Vercel serverless function. The key lives in the AI_API_KEY environment variable, never in the page.
const hits = new Map();
const MODELS = { quick: "claude-haiku-4-5-20251001", default: "claude-sonnet-5-5", complex: "claude-sonnet-5-5" };

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const key = process.env.AI_API_KEY;
  if (!key) return res.status(503).json({ error: "not_configured" });

  const ip = String(req.headers["x-forwarded-for"] || "local").split(",")[0];
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 20) return res.status(429).json({ error: "rate_limited" });
  recent.push(now); hits.set(ip, recent);

  const { messages, images = [], tier = "default" } = req.body || {};
  if (!Array.isArray(messages) || !messages.length || messages.length > 20 || images.length > 6)
    return res.status(400).json({ error: "bad_request" });
  const clean = messages.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0, 4000),
  }));
  if (images.length) {
    const last = clean[clean.length - 1];
    last.content = [
      ...images.filter((b) => typeof b === "string" && b.length < 700000)
        .map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
      { type: "text", text: last.content },
    ];
  }
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODELS[tier] || MODELS.default, max_tokens: 700, messages: clean }),
    });
    if (!r.ok) return res.status(502).json({ error: "upstream" });
    const d = await r.json();
    res.status(200).json({ text: (d.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n") });
  } catch (e) { res.status(502).json({ error: "upstream" }); }
};
