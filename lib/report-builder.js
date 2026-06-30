/**
 * HTML 브리핑 보고서 생성 · 저장 · 카카오 링크 메시지
 */

const fs = require("fs");
const path = require("path");

const REPORTS_DIR = path.join(__dirname, "..", "reports");

function isServerless() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function canPersistReports() {
  return !isServerless();
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function trunc(s, n) {
  const clean = String(s || "").replace(/\s+/g, " ").trim();
  return clean.length <= n ? clean : clean.slice(0, n - 1) + "…";
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

function generateReportId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${rand}`;
}

function encodeReportPayload(payload) {
  const json = JSON.stringify(payload);
  const encoded = Buffer.from(json, "utf8").toString("base64url");
  return `e${encoded}`;
}

function decodeReportPayload(id) {
  if (!id || !String(id).startsWith("e")) return null;
  try {
    const json = Buffer.from(String(id).slice(1), "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function normalizeReportPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    generatedAt: raw.generatedAt || formatUpdated(),
    fx: raw.fx || null,
    tavilyNews: raw.tavilyNews || [],
    naverNews: raw.naverNews || [],
    bids: raw.bids || [],
    ai: raw.ai || null,
    tavilyCount: raw.tavilyCount ?? (raw.tavilyNews || []).length,
    naverCount: raw.naverCount ?? (raw.naverNews || []).length,
    bidsCount: raw.bidsCount ?? (raw.bids || []).length,
  };
}

function buildReportHeadline(data) {
  const parts = ["◈ 방산 브리핑"];

  const usd = data.fx?.rates?.find((r) => r.pair === "USD/KRW");
  if (usd) {
    const sign = usd.change >= 0 ? "+" : "";
    parts.push(`USD/KRW ${usd.value.toLocaleString("ko-KR")}(${sign}${usd.changePct}%)`);
  }

  const newsTotal = (data.tavilyCount || 0) + (data.naverCount || 0);
  if (newsTotal) parts.push(`뉴스 ${newsTotal}건`);

  if (data.bidsCount) parts.push(`입찰 ${data.bidsCount}건`);

  if (data.ai?.sentimentLabel) parts.push(data.ai.sentimentLabel);

  return trunc(parts.join(" · "), 120);
}

function buildReportHtml(data) {
  const generatedAt = data.generatedAt || formatUpdated();
  const insightPrefix = { opportunity: "▲", risk: "⚠", watch: "◉" };

  const fxRows = (data.fx?.rates || [])
    .map((r) => {
      const dir = r.change >= 0 ? "up" : "down";
      const sign = r.change >= 0 ? "+" : "";
      return `<tr>
        <td>${escapeHtml(r.pair)}</td>
        <td class="num">${escapeHtml(r.value.toLocaleString("ko-KR", { minimumFractionDigits: 2 }))}</td>
        <td class="num ${dir}">${sign}${escapeHtml(String(r.change))} (${sign}${escapeHtml(String(r.changePct))}%)</td>
      </tr>`;
    })
    .join("");

  const tavilyItems = (data.tavilyNews || [])
    .map(
      (n) => `<li>
        <a href="${escapeHtml(n.url || n.source || "#")}" target="_blank" rel="noopener">${escapeHtml(n.title)}</a>
        ${n.summary ? `<p>${escapeHtml(n.summary)}</p>` : ""}
      </li>`
    )
    .join("");

  const naverItems = (data.naverNews || [])
    .map(
      (n) => `<li>
        <strong>${escapeHtml(n.title)}</strong>
        ${n.summary ? `<p>${escapeHtml(n.summary)}</p>` : ""}
      </li>`
    )
    .join("");

  const bidRows = (data.bids || [])
    .map(
      (b) => `<tr>
        <td>${escapeHtml(b.title)}</td>
        <td>${escapeHtml(b.agency || "—")}</td>
        <td>${escapeHtml(b.deadline || "—")}</td>
        <td>${escapeHtml(b.budget || "—")}</td>
      </tr>`
    )
    .join("");

  const ai = data.ai;
  let aiSection = `<p class="muted">AI 분석 데이터 없음</p>`;
  if (ai) {
    const insights = (ai.insights || [])
      .map(
        (ins) =>
          `<li class="insight insight--${escapeHtml(ins.type)}">${insightPrefix[ins.type] || "•"} ${escapeHtml(ins.text)}</li>`
      )
      .join("");
    const scores = (ai.sectorScores || [])
      .map((s) => `<span class="score"><b>${escapeHtml(s.name)}</b> ${escapeHtml(String(s.score))}</span>`)
      .join("");
    aiSection = `
      <div class="ai-top">
        <span class="badge badge--${escapeHtml(ai.sentiment || "neutral")}">${escapeHtml(ai.sentimentLabel || "분석")}</span>
        <span class="muted">신뢰도 ${escapeHtml(String(ai.confidence ?? "—"))}%</span>
      </div>
      <p class="ai-summary">${escapeHtml(ai.summary || "")}</p>
      <ul class="insights">${insights}</ul>
      <div class="scores">${scores}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>방산 동향 브리핑 · ${escapeHtml(generatedAt)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --bg: #0a0e14; --panel: #151c26; --border: #243044;
      --text: #e8edf4; --muted: #8b9cb3; --accent: #3dd68c;
      --warn: #f0a030; --danger: #e85555;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Noto Sans KR", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 1.5rem;
      max-width: 920px;
      margin: 0 auto;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
      margin-bottom: 1.5rem;
    }
    h1 { font-size: 1.4rem; margin-bottom: 0.35rem; }
    .meta { color: var(--muted); font-size: 0.85rem; font-family: "JetBrains Mono", monospace; }
    section {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.1rem 1.25rem;
      margin-bottom: 1rem;
    }
    h2 { font-size: 1rem; margin-bottom: 0.75rem; color: var(--accent); }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { padding: 0.5rem 0.4rem; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-weight: 500; font-size: 0.8rem; }
    .num { font-family: "JetBrains Mono", monospace; text-align: right; }
    .up { color: var(--accent); }
    .down { color: var(--danger); }
    ul.news { list-style: none; }
    ul.news li { padding: 0.65rem 0; border-bottom: 1px solid var(--border); }
    ul.news li:last-child { border-bottom: none; }
    ul.news a { color: var(--text); text-decoration: none; font-weight: 500; }
    ul.news a:hover { color: var(--accent); }
    ul.news p { color: var(--muted); font-size: 0.85rem; margin-top: 0.35rem; }
    .ai-top { display: flex; gap: 1rem; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; }
    .badge {
      display: inline-block; padding: 0.2rem 0.55rem; border-radius: 4px;
      font-size: 0.8rem; font-weight: 600; background: rgba(61,214,140,0.15); color: var(--accent);
    }
    .badge--negative { background: rgba(232,85,85,0.15); color: var(--danger); }
    .badge--neutral { background: rgba(240,160,48,0.15); color: var(--warn); }
    .ai-summary { margin-bottom: 0.75rem; }
    .insights { list-style: none; margin-bottom: 0.75rem; }
    .insights li { padding: 0.35rem 0; font-size: 0.9rem; }
    .insight--risk { color: var(--danger); }
    .insight--watch { color: var(--warn); }
    .scores { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; font-size: 0.85rem; color: var(--muted); }
    .score b { color: var(--text); }
    .muted { color: var(--muted); font-size: 0.85rem; }
    footer { margin-top: 1.5rem; text-align: center; color: var(--muted); font-size: 0.8rem; }
    footer a { color: var(--accent); }
  </style>
</head>
<body>
  <header>
    <h1>◈ 방산 동향 브리핑 보고서</h1>
    <p class="meta">${escapeHtml(generatedAt)} · Defense Trends Dashboard</p>
  </header>

  <section>
    <h2>💱 환율</h2>
    ${
      fxRows
        ? `<table><thead><tr><th>통화</th><th>환율</th><th>전일 대비</th></tr></thead><tbody>${fxRows}</tbody></table>`
        : `<p class="muted">환율 데이터 없음</p>`
    }
  </section>

  <section>
    <h2>📰 방산 뉴스</h2>
    <h3 class="muted" style="margin-bottom:0.5rem;font-size:0.85rem">국외 (Tavily)</h3>
    ${tavilyItems ? `<ul class="news">${tavilyItems}</ul>` : `<p class="muted">국외 뉴스 없음</p>`}
    <h3 class="muted" style="margin:1rem 0 0.5rem;font-size:0.85rem">국내 (Naver)</h3>
    ${naverItems ? `<ul class="news">${naverItems}</ul>` : `<p class="muted">국내 뉴스 없음</p>`}
  </section>

  <section>
    <h2>📋 입찰 · 조달</h2>
    ${
      bidRows
        ? `<table><thead><tr><th>공고명</th><th>기관</th><th>마감</th><th>예산</th></tr></thead><tbody>${bidRows}</tbody></table>`
        : `<p class="muted">입찰공고 없음</p>`
    }
  </section>

  <section>
    <h2>🤖 AI 분석</h2>
    ${aiSection}
  </section>

  <footer>
    <p>LIG Defense Trends Dashboard · <a href="/">대시보드로 이동</a></p>
  </footer>
</body>
</html>`;
}

function saveReportPayload(id, payload) {
  if (!canPersistReports()) return false;
  try {
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(REPORTS_DIR, `${id}.json`), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function loadReportPayload(id) {
  const decoded = decodeReportPayload(id);
  if (decoded) return normalizeReportPayload(decoded);

  if (!canPersistReports()) return null;
  try {
    const file = path.join(REPORTS_DIR, `${id}.json`);
    if (!fs.existsSync(file)) return null;
    return normalizeReportPayload(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

function publishReport(detail, publicUrl) {
  const payload = normalizeReportPayload({
    generatedAt: formatUpdated(),
    fx: detail.fx,
    tavilyNews: detail.tavilyNews,
    naverNews: detail.naverNews,
    bids: detail.bids,
    ai: detail.ai,
    tavilyCount: detail.tavilyCount,
    naverCount: detail.naverCount,
    bidsCount: detail.bidsCount,
  });

  let id = generateReportId();
  if (saveReportPayload(id, payload)) {
    return {
      id,
      url: `${publicUrl.replace(/\/$/, "")}/reports/${id}.html`,
      payload,
    };
  }

  id = encodeReportPayload(payload);
  return {
    id,
    url: `${publicUrl.replace(/\/$/, "")}/reports/${id}.html`,
    payload,
  };
}

function buildKakaoReportMessage(headline, reportUrl, dashboardUrl) {
  const link = {
    web_url: reportUrl,
    mobile_web_url: reportUrl,
  };
  const dashLink = {
    web_url: dashboardUrl,
    mobile_web_url: dashboardUrl,
  };

  return {
    object_type: "feed",
    content: {
      title: trunc(headline, 80),
      description: "방산·환율·뉴스·입찰·AI 분석 상세 보고서",
      link,
    },
    buttons: [
      { title: "보고서 열기", link },
      { title: "대시보드", link: dashLink },
    ],
  };
}

module.exports = {
  buildReportHtml,
  buildReportHeadline,
  buildKakaoReportMessage,
  publishReport,
  loadReportPayload,
  decodeReportPayload,
  normalizeReportPayload,
  canPersistReports,
  REPORTS_DIR,
};
