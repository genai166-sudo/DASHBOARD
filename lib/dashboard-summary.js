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

function formatUpdated() {
  return (
    new Date().toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    }) + " KST"
  );
}

function buildFxDescription(fx) {
  if (!fx?.rates?.length) return "환율 데이터 없음";

  return fx.rates
    .map((r) => {
      const sign = r.change >= 0 ? "+" : "";
      const value = r.value.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return `${r.pair} ${value} (${sign}${r.changePct}%)`;
    })
    .join("\n");
}

function buildNewsDescription(tavilyTitles, naverTitles) {
  const lines = [];

  for (const title of (tavilyTitles || []).slice(0, 2)) {
    if (title) lines.push(`🌍 ${trunc(title, 72)}`);
  }
  for (const title of (naverTitles || []).slice(0, 2)) {
    if (title) lines.push(`🇰🇷 ${trunc(title, 72)}`);
  }

  const total = (tavilyTitles?.length || 0) + (naverTitles?.length || 0);
  if (total > lines.length) {
    lines.push(`외 ${total - lines.length}건 더`);
  }

  return lines.length ? lines.join("\n") : "뉴스 수집 없음";
}

function buildBidAiDescription(bids, ai) {
  const lines = [];

  for (const bid of (bids || []).slice(0, 2)) {
    lines.push(`📋 ${trunc(bid.title, 68)} (${bid.deadline || "—"})`);
  }
  if ((bids?.length || 0) > 2) {
    lines.push(`입찰공고 외 ${bids.length - 2}건`);
  }

  if (ai) {
    lines.push(`🤖 ${ai.sentimentLabel || "AI 분석"} (신뢰도 ${ai.confidence ?? "—"}%)`);
    if (ai.summary) lines.push(trunc(ai.summary, 180));
    const insight = ai.insights?.find((i) => i.type === "opportunity") || ai.insights?.[0];
    if (insight?.text) lines.push(`💡 ${trunc(insight.text, 100)}`);
  }

  return lines.length ? lines.join("\n") : "입찰·AI 데이터 없음";
}

function buildKakaoListTemplate({ fx, tavilyTitles, naverTitles, bids, ai }, webUrl) {
  const link = { web_url: webUrl, mobile_web_url: webUrl };
  const updated = formatUpdated();

  let headerTitle = `◈ 방산 대시보드 브리핑 · ${updated}`;
  if (ai?.sentimentLabel) {
    headerTitle += ` · ${ai.sentimentLabel}`;
  }

  return {
    object_type: "list",
    header_title: trunc(headerTitle, 200),
    header_link: link,
    contents: [
      {
        title: "💱 환율",
        description: trunc(buildFxDescription(fx), 280),
        link,
      },
      {
        title: "📰 방산 뉴스",
        description: trunc(buildNewsDescription(tavilyTitles, naverTitles), 320),
        link,
      },
      {
        title: "📋 입찰 · AI",
        description: trunc(buildBidAiDescription(bids, ai), 320),
        link,
      },
    ],
    buttons: [{ title: "대시보드 열기", link }],
  };
}

/** API 응답용 평문 미리보기 */
function formatKakaoSummary({ fx, tavilyTitles, naverTitles, bids, ai }) {
  const sections = [
    "◈ 방산 대시보드 브리핑",
    "",
    "💱 환율",
    buildFxDescription(fx),
    "",
    "📰 방산 뉴스",
    buildNewsDescription(tavilyTitles, naverTitles),
    "",
    "📋 입찰 · AI",
    buildBidAiDescription(bids, ai),
  ];

  return sections.join("\n").trim();
}

async function collectDashboardSummaryData(webUrl) {
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
        summary: (item.content || "").slice(0, 200),
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
        summary: stripHtml(item.description).slice(0, 200),
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

  const payload = { fx, tavilyTitles, naverTitles, bids, ai };
  const text = formatKakaoSummary(payload);
  const template = buildKakaoListTemplate(payload, webUrl || "http://localhost:3000");

  return {
    fx,
    tavilyCount: tavilyTitles.length,
    naverCount: naverTitles.length,
    bidsCount: bids.length,
    ai,
    text,
    template,
  };
}

module.exports = { formatKakaoSummary, buildKakaoListTemplate, collectDashboardSummaryData };
