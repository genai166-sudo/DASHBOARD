/**
 * Tavily 프록시 공통 로직 — Vercel Serverless + Node dev-server
 * API 키: process.env.TAVILY_API_KEY (Vercel Env / 로컬 .env)
 */

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

const ALLOWED_BODY_KEYS = [
  "query",
  "search_depth",
  "topic",
  "days",
  "max_results",
  "include_images",
  "include_answer",
  "include_raw_content",
  "include_domains",
  "exclude_domains",
];

function pickAllowedFields(body) {
  const payload = {};
  for (const key of ALLOWED_BODY_KEYS) {
    if (body[key] !== undefined) payload[key] = body[key];
  }
  return payload;
}

async function tavilySearch(body) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    const err = new Error("TAVILY_API_KEY is not configured on the server");
    err.status = 500;
    throw err;
  }

  if (!body?.query || typeof body.query !== "string") {
    const err = new Error("query is required");
    err.status = 400;
    throw err;
  }

  const res = await fetch(TAVILY_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      ...pickAllowedFields(body),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.detail || data.error || "Tavily API request failed");
    err.status = res.status;
    throw err;
  }

  return data;
}

module.exports = { tavilySearch, pickAllowedFields };
