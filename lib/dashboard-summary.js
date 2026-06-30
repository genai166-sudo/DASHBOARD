/**
 * 대시보드 환율·뉴스·입찰·AI 요약
 */

const { fetchFxRates } = require("./fx-proxy");
const { tavilySearch } = require("./tavily-proxy");
const { naverNewsSearch } = require("./naver-proxy");
const { fetchDapaBids } = require("./dapa-bids-proxy");
const { analyzeDefenseNews } = require("./gemini-proxy");

function trunc(s, n) {
  const clean = String(s || "").replace(/\s+/g, " ").trim();
  return clean.length <= n ? clean : clean.slice(0, n - 1) + "…";
}

function stripHtml(str) {
  return String(str || "").replace(/<[^>]*>/g, "").trim();
}

function formatKakaoSummary({ fx, tavilyTitles, naverTitles, bids, ai }) {
  const lines = ["◈ 방산 대시보드 요약"];

  if (fx?.rates) {
    const usd = fx.rates.find((r) => r.pair === "USD/KRW");
    if (usd) {
      const sign = usd.change >= 0 ? "+" : "";
      lines.push(`💱 USD/KRW ${usd.value.toLocaleString("ko-KR")} (${sign}${usd.changePct}%)`);
    }
  }

  const newsBits = [];
  if (tavilyTitles?.length) newsBits.push(trunc(tavilyTitles[0], 22));
  if (naverTitles?.length) newsBits.push(trunc(naverTitles[0], 22));
  if (newsBits.length) {
    const total = (tavilyTitles?.length || 0) + (naverTitles?.length || 0);
    const extra = total > newsBits.length ? ` 외 ${total - 1}건` : "";
    lines.push(`📰 ${newsBits.join(" / ")}${extra}`);
  }

  if (bids?.length) {
    lines.push(`📋 ${trunc(bids[0].title, 24)} (${bids[0].deadline || "—"})`);
  }

  if (ai) {
    lines.push(`🤖 ${ai.sentimentLabel || "분석"} — ${trunc(ai.summary, 48)}`);
  }

  let text = lines.join("\n");
  if (text.length > 200) text = text.slice(0, 197) + "…";
  return text;
}

async function collectDashboardSummaryData() {
  let fx = null;
  try {
    fx = await fetchFxRates();
  } catch {
    fx = null;
  }

  const tavilyTitles = [];
  const naverTitles = [];
  const tavilyNews = [];
  const naverNews = [];

  try {
    const tData = await tavilySearch({
      query: "defense industry NATO military export",
      search_depth: "basic",
      max_results: 5,
      topic: "news",
      days: 14,
    });
    for (const item of (tData.results || []).slice(0, 5)) {
      tavilyTitles.push(item.title || "");
      tavilyNews.push({
        title: item.title,
        summary: (item.content || "").slice(0, 140),
        source: item.url || "",
      });
    }
  } catch {
    /* optional */
  }

  try {
    const nData = await naverNewsSearch({
      query: "방산 수출 국방 KAI LIG",
      display: 5,
      sort: "date",
    });
    for (const item of (nData.items || []).slice(0, 5)) {
      const title = stripHtml(item.title);
      naverTitles.push(title);
      naverNews.push({
        title,
        summary: stripHtml(item.description).slice(0, 140),
        source: "Naver",
      });
    }
  } catch {
    /* optional */
  }

  let bids = [];
  try {
    const bidData = await fetchDapaBids({ numOfRows: 5 });
    bids = bidData.bids || [];
  } catch {
    bids = [];
  }

  let ai = null;
  if (tavilyNews.length || naverNews.length) {
    try {
      ai = await analyzeDefenseNews({ tavilyNews, naverNews });
    } catch {
      ai = null;
    }
  }

  const text = formatKakaoSummary({ fx, tavilyTitles, naverTitles, bids, ai });
  return {
    fx,
    tavilyCount: tavilyTitles.length,
    naverCount: naverTitles.length,
    bidsCount: bids.length,
    ai,
    text,
  };
}

module.exports = { formatKakaoSummary, collectDashboardSummaryData };
