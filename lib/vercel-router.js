/**
 * Vercel 단일 Serverless 라우터 — Hobby 플랜 12개 함수 제한 대응
 */

const { tavilySearch } = require("./tavily-proxy");
const { naverNewsSearch } = require("./naver-proxy");
const { fetchFxRates, fetchFxChart, recordFxSnapshot, fetchUsdBaseRates, calcPairRates } = require("./fx-proxy");
const { analyzeDefenseNews } = require("./gemini-proxy");
const { fetchWorldBankStats } = require("./worldbank-proxy");
const { fetchDapaBids } = require("./dapa-bids-proxy");
const {
  buildOAuthLoginUrl,
  exchangeCodeForToken,
  saveRefreshToken,
  getRedirectUri,
  isKakaoConfigured,
  getRestApiKey,
  sendMemoTemplate,
  getPublicUrl,
  isServerless,
} = require("./kakao-proxy");
const { collectDashboardSummaryData } = require("./dashboard-summary");
const {
  publishReport,
  buildReportHeadline,
  buildKakaoReportMessage,
  buildReportHtml,
  loadReportPayload,
} = require("./report-builder");

function getEnvKey(name) {
  const raw = process.env[name] || "";
  return raw.trim().replace(/^["']|["']$/g, "");
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

function setCors(res, methods = "GET, POST, OPTIONS") {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function routePath(req) {
  let path = req.query?.path;

  if (Array.isArray(path)) {
    path = path.filter(Boolean).join("/");
  }

  if (typeof path === "string" && path.trim()) {
    return path.replace(/^\/+|\/+$/g, "");
  }

  const urlPath = String(req.url || "").split("?")[0];
  const match = urlPath.match(/^\/api\/(.+)$/);
  if (match) {
    return match[1].replace(/\/+$/g, "");
  }

  return "";
}

function queryParams(req) {
  const q = { ...(req.query || {}) };
  delete q.path;
  return q;
}

async function handleHealth(req, res) {
  setCors(res, "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  return res.status(200).json({
    ok: true,
    runtime: "vercel-serverless",
    tavilyConfigured: Boolean(getEnvKey("TAVILY_API_KEY")),
    fxConfigured: Boolean(getEnvKey("EXCHANGERATE_API_KEY")),
    naverConfigured: Boolean(getEnvKey("NAVER_CLIENT_ID") && getEnvKey("NAVER_CLIENT_SECRET")),
    geminiConfigured: Boolean(getEnvKey("GEMINI_API_KEY")),
    dapaConfigured: Boolean(getEnvKey("DATA_GO_KR_SERVICE_KEY")),
    kakaoConfigured: Boolean(getEnvKey("KAKAO_REST_API_KEY") && getEnvKey("KAKAO_REFRESH_TOKEN")),
  });
}

async function handleTavilySearch(req, res) {
  setCors(res, "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const data = await tavilySearch(parseBody(req));
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function handleNaverSearch(req, res) {
  setCors(res, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const params = req.method === "GET" ? queryParams(req) : parseBody(req);
    const data = await naverNewsSearch(params);
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function handleFxRates(req, res) {
  setCors(res, "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const data = await fetchFxRates();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function handleFxChart(req, res) {
  setCors(res, "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const q = queryParams(req);
  const interval = String(q.interval || "1d");
  try {
    try {
      const { usdBase } = await fetchUsdBaseRates();
      const current = calcPairRates(usdBase);
      recordFxSnapshot(current.KRW);
    } catch {
      /* snapshot optional */
    }
    const chart = await fetchFxChart(interval);
    return res.status(200).json(chart);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function handleGeminiAnalyze(req, res) {
  setCors(res, "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const data = await analyzeDefenseNews(parseBody(req));
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function handleWorldBank(req, res) {
  setCors(res, "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const data = await fetchWorldBankStats();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message });
  }
}

async function handleDapaBids(req, res) {
  setCors(res, "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const q = queryParams(req);
    const pageNo = Number(q.pageNo) || 1;
    const numOfRows = Number(q.numOfRows) || 10;
    const daysBack = Number(q.daysBack) || 30;
    const data = await fetchDapaBids({ pageNo, numOfRows, daysBack });
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function handleKakaoLogin(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const url = buildOAuthLoginUrl();
    res.writeHead(302, { Location: url });
    return res.end();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function handleKakaoCallback(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const q = queryParams(req);
  const code = q.code;
  const error = q.error;
  if (error) {
    return res.status(400).send(`<h1>카카오 로그인 실패</h1><p>${error}</p>`);
  }
  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }

  try {
    const tokens = await exchangeCodeForToken(code);
    const saved = tokens.refresh_token ? saveRefreshToken(tokens.refresh_token) : false;
    const onVercel = isServerless();

    const tokenBlock = tokens.refresh_token
      ? onVercel || !saved
        ? `<p><strong>Vercel/서버리스:</strong> 아래 Refresh Token을 Vercel Environment Variables에 등록한 뒤 재배포하세요.</p>
<pre><code>KAKAO_REFRESH_TOKEN=${tokens.refresh_token}</code></pre>`
        : `<p>Refresh Token이 <code>.data/kakao-token.json</code> 에 저장되었습니다.</p>
<p>배포 시에는 Environment Variables에도 동일 값을 넣으세요:</p>
<pre><code>KAKAO_REFRESH_TOKEN=${tokens.refresh_token}</code></pre>`
      : `<p>Refresh Token이 없습니다. 동의 항목 <code>talk_message</code> 확인 후 다시 로그인하세요.</p>`;

    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/><title>카카오 연동 완료</title>
<style>body{font-family:sans-serif;background:#0a0e14;color:#e8edf4;padding:2rem;max-width:640px;margin:auto}
code{background:#151c26;padding:2px 6px;border-radius:4px;word-break:break-all}</style></head><body>
<h1>✅ 카카오톡 연동 완료</h1>
<p>OAuth 인증이 완료되었습니다.</p>
${tokenBlock}
<p>Redirect URI: <code>${getRedirectUri()}</code></p>
<p><a href="/">대시보드로 돌아가기</a></p></body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (err) {
    return res.status(err.status || 500).send(`<h1>토큰 발급 실패</h1><p>${err.message}</p>`);
  }
}

async function handleKakaoStatus(req, res) {
  setCors(res, "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  return res.status(200).json({
    configured: isKakaoConfigured(),
    hasAppKey: Boolean(getRestApiKey()),
    hasRefreshToken: isKakaoConfigured(),
    loginUrl: "/api/kakao/oauth/login",
  });
}

async function handleKakaoSendSummary(req, res) {
  setCors(res, "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!isKakaoConfigured()) {
    return res.status(401).json({
      error: "Kakao not linked — open /api/kakao/oauth/login first",
      loginUrl: "/api/kakao/oauth/login",
    });
  }

  try {
    const publicUrl = getPublicUrl();
    const detail = await collectDashboardSummaryData();
    const report = publishReport(detail, publicUrl);
    const headline = buildReportHeadline(detail);
    const template = buildKakaoReportMessage(headline, report.url, publicUrl);
    await sendMemoTemplate(template);

    return res.status(200).json({
      ok: true,
      sent: true,
      reportUrl: report.url,
      headline,
      summary: {
        tavilyCount: detail.tavilyCount,
        naverCount: detail.naverCount,
        bidsCount: detail.bidsCount,
        hasAi: Boolean(detail.ai),
      },
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

async function handleReport(req, res, segments) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  let id = segments[1];
  if (!id) return res.status(400).send("Report id required");

  id = String(id).replace(/\.html$/, "");
  const payload = loadReportPayload(id);
  if (!payload) {
    return res.status(404).send("보고서를 찾을 수 없습니다.");
  }

  const html = buildReportHtml(payload);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).send(html);
}

const ROUTES = {
  "health": handleHealth,
  "tavily/search": handleTavilySearch,
  "naver/search": handleNaverSearch,
  "fx/rates": handleFxRates,
  "fx/chart": handleFxChart,
  "gemini/analyze": handleGeminiAnalyze,
  "stats/worldbank": handleWorldBank,
  "bids/dapa": handleDapaBids,
  "kakao/oauth/login": handleKakaoLogin,
  "kakao/oauth/callback": handleKakaoCallback,
  "kakao/status": handleKakaoStatus,
  "kakao/send-summary": handleKakaoSendSummary,
};

async function dispatch(req, res) {
  const pathKey = routePath(req);
  const segments = pathKey ? pathKey.split("/") : [];

  if (segments[0] === "reports") {
    return handleReport(req, res, segments);
  }

  const handler = ROUTES[pathKey];
  if (!handler) {
    return res.status(404).json({ error: "Not Found", path: `/api/${pathKey}` });
  }

  return handler(req, res);
}

module.exports = { dispatch, routePath };
