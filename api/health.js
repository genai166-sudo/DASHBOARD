/** GET /api/health — 배포·로컬 서버 상태 확인 */

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
    tavilyConfigured: Boolean(process.env.TAVILY_API_KEY),
  });
};
