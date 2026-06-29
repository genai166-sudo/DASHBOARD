/** GET /api/health — 배포·로컬 서버 상태 확인 */

function getEnvKey(name) {
  const raw = process.env[name] || "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({
    ok: true,
    runtime: "vercel-serverless",
    tavilyConfigured: Boolean(getEnvKey("TAVILY_API_KEY")),
    fxConfigured: Boolean(getEnvKey("EXCHANGERATE_API_KEY")),
  });
};
