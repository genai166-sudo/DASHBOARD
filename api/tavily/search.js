/**
 * Vercel Serverless — 배포 시 Vercel 대시보드에 TAVILY_API_KEY 환경변수 등록
 * (.env 파일은 배포에 포함되지 않음)
 */

const { tavilySearch } = require("../../server/lib/tavily-proxy");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = await tavilySearch(req.body);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};
