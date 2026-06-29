/**
 * Vercel Serverless Function
 * Route: POST /api/tavily/search
 *
 * 배포 전 Vercel Dashboard → Settings → Environment Variables
 *   TAVILY_API_KEY = (your key)
 */

const { tavilySearch } = require("../../lib/tavily-proxy");

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = await tavilySearch(parseBody(req));
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};
