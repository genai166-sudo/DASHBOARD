/**
 * Gemini AI 분석 — Tavily + Naver 뉴스 요약
 * 모델: gemini-2.5-flash-lite
 */

const INSIGHT_PREFIX = {
  opportunity: "▲",
  risk: "⚠",
  watch: "◉",
};

let analysisTimer = null;
let analysisInFlight = false;

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setAiBadge(text, live = false) {
  const badge = document.getElementById("ai-badge");
  if (!badge) return;
  badge.textContent = text;
  badge.classList.toggle("intel-card__badge--ai-live", live);
}

function renderAiWaiting() {
  const container = document.getElementById("intel-ai");
  if (!container) return;
  setAiBadge("대기", false);
  container.innerHTML = `
    <div class="ai-brief ai-brief--loading">
      <div class="news-loading">뉴스 로딩 후 Gemini가 자동 분석합니다…</div>
      <p class="ai-brief__hint">gemini-2.5-flash-lite</p>
    </div>`;
}

function renderAiAnalysis(ai) {
  const container = document.getElementById("intel-ai");
  if (!container) return;

  const live = Boolean(ai.live);
  setAiBadge(live ? "Gemini · 실시간" : "목업", live);

  container.innerHTML = `
    <div class="ai-brief">
      <div class="ai-brief__top">
        <span class="ai-brief__sentiment ai-brief__sentiment--${escapeHtml(ai.sentiment)}">${escapeHtml(ai.sentimentLabel)}</span>
        <div class="ai-brief__confidence">
          <span class="ai-brief__confidence-label">신뢰도</span>
          <span class="ai-brief__confidence-value">${ai.confidence}%</span>
        </div>
      </div>
      <p class="ai-brief__summary">${escapeHtml(ai.summary)}</p>
      <ul class="ai-brief__insights">
        ${(ai.insights || [])
          .map(
            (ins) =>
              `<li class="ai-brief__insight ai-brief__insight--${escapeHtml(ins.type)}">${INSIGHT_PREFIX[ins.type] || "•"} ${escapeHtml(ins.text)}</li>`
          )
          .join("")}
      </ul>
      <div class="ai-brief__scores">
        ${(ai.sectorScores || [])
          .map(
            (s) =>
              `<div class="ai-score"><span class="ai-score__name">${escapeHtml(s.name)}</span><span class="ai-score__value">${s.score}</span></div>`
          )
          .join("")}
      </div>
      <div class="ai-brief__footer">
        ${escapeHtml(ai.generatedAt || "")}
        ${ai.model ? ` · ${escapeHtml(ai.model)}` : ""}
      </div>
      <button type="button" class="ai-brief__refresh" id="ai-refresh-btn">↻ 다시 분석</button>
    </div>`;

  document.getElementById("ai-refresh-btn")?.addEventListener("click", () => {
    loadGeminiAnalysis(true);
  });
}

function renderAiFallback(message) {
  const mock = { ...DEFENSE_DATA.aiAnalysis, live: false };
  renderAiAnalysis(mock);
  if (message) {
    const footer = document.querySelector(".ai-brief__footer");
    if (footer) footer.textContent = `목업 · ${message}`;
    setAiBadge("목업", false);
  }
}

function getNewsPayload() {
  const tavily = typeof getCollectedTavilyNews === "function" ? getCollectedTavilyNews() : [];
  const naver = typeof getCollectedNaverNews === "function" ? getCollectedNaverNews() : [];

  return {
    tavilyNews: tavily.map((n) => ({
      title: n.title,
      summary: n.summary,
      source: n.source,
    })),
    naverNews: naver.map((n) => ({
      title: n.title,
      summary: n.summary,
      source: n.source,
    })),
  };
}

async function fetchGeminiAnalysis(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  let res;
  try {
    res = await fetch("/api/gemini/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Gemini 분석 시간 초과 (45초)");
    }
    throw new Error("AI 서버에 연결할 수 없습니다. python server.py 실행 여부를 확인하세요.");
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Gemini 분석 실패");
  }
  return data;
}

async function loadGeminiAnalysis(force = false) {
  const payload = getNewsPayload();
  const hasNews = payload.tavilyNews.length + payload.naverNews.length > 0;

  if (!hasNews) {
    if (!force) renderAiFallback();
    return;
  }

  if (analysisInFlight && !force) return;
  analysisInFlight = true;
  setAiBadge("분석 중…", false);
  renderAiWaiting();

  try {
    const data = await fetchGeminiAnalysis(payload);
    renderAiAnalysis(data);
  } catch (err) {
    console.warn("Gemini analysis error:", err.message);
    renderAiFallback(err.message);
  } finally {
    analysisInFlight = false;
  }
}

function scheduleGeminiAnalysis() {
  clearTimeout(analysisTimer);
  analysisTimer = setTimeout(() => loadGeminiAnalysis(), 1200);
}

function initGeminiAnalysis() {
  renderAiWaiting();
}
