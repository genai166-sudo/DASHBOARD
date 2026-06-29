/**
 * Vercel Serverless Function
 * Route: GET/POST /api/naver/search
 *
 * Vercel Dashboard → Environment Variables
 *   NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
 */

const { naverNewsSearch } = require("../../lib/naver-proxy");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

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

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const params = req.method === "GET" ? req.query : parseBody(req);
    const data = await naverNewsSearch(params);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};
