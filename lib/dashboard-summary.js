/**
 * 대시보드 환율·뉴스·입찰·AI 데이터 수집
 */

const { fetchFxRates } = require("./fx-proxy");
const { tavilySearch } = require("./tavily-proxy");
const { naverNewsSearch } = require("./naver-proxy");
const { fetchDapaBids } = require("./dapa-bids-proxy");
const { analyzeDefenseNews } = require("./gemini-proxy");

function stripHtml(str) {
  return String(str || "").replace(/<[^>]*>/g, "").trim();
}

async function collectDashboardSummaryData() {
  let fx = null;
  try {
    fx = await fetchFxRates();
  } catch {
    fx = null;
  }

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
      tavilyNews.push({
        title: item.title || "",
        summary: (item.content || "").slice(0, 280),
        url: item.url || "",
        source: item.url || "Tavily",
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
      naverNews.push({
        title,
        summary: stripHtml(item.description).slice(0, 280),
        url: item.link || item.originallink || "",
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
      ai = await analyzeDefenseNews({
        tavilyNews: tavilyNews.map((n) => ({
          title: n.title,
          summary: n.summary,
          source: n.url || n.source,
        })),
        naverNews: naverNews.map((n) => ({
          title: n.title,
          summary: n.summary,
          source: n.source,
        })),
      });
    } catch {
      ai = null;
    }
  }

  return {
    fx,
    tavilyNews,
    naverNews,
    bids,
    ai,
    tavilyCount: tavilyNews.length,
    naverCount: naverNews.length,
    bidsCount: bids.length,
  };
}

module.exports = { collectDashboardSummaryData };
