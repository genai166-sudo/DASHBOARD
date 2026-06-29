/**
 * 이중 뉴스 — Tavily(국외) + Naver(국내)
 */

const DEFAULT_TAVILY_QUERY =
  "defense industry NATO military export Ukraine arms procurement";

const DEFAULT_NAVER_QUERY = "방산 수출 국방 KAI LIG";

let collectedTavilyNews = [];
let collectedNaverNews = [];

function getCollectedTavilyNews() {
  return collectedTavilyNews;
}

function getCollectedNaverNews() {
  return collectedNaverNews;
}

function storeCollectedNews(provider, items) {
  if (provider === "tavily") collectedTavilyNews = items;
  else collectedNaverNews = items;
  if (typeof scheduleGeminiAnalysis === "function") scheduleGeminiAnalysis();
}

const NEWS_TAG_LABELS = {
  budget: { text: "예산", class: "tag--budget" },
  export: { text: "수출", class: "tag--export" },
  tech: { text: "기술", class: "tag--tech" },
  conflict: { text: "분쟁", class: "tag--conflict" },
  alliance: { text: "동맹", class: "tag--alliance" },
};

const TAG_KEYWORDS = [
  { tag: "conflict", patterns: /war|conflict|ukraine|middle east|분쟁|전쟁|러시아|우크라/i },
  { tag: "alliance", patterns: /nato|aukus|alliance|동맹|협력/i },
  { tag: "budget", patterns: /budget|spending|defense bill|예산|방위비|국방비/i },
  { tag: "tech", patterns: /drone|uas|ai|hypersonic|무인|자율|미사일|hbm|드론/i },
  { tag: "export", patterns: /export|contract|procurement|수출|입찰|조달|방산/i },
];

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .trim();
}

function inferTag(title, content) {
  const text = `${title} ${content}`;
  for (const { tag, patterns } of TAG_KEYWORDS) {
    if (patterns.test(text)) return tag;
  }
  return "export";
}

function formatNewsDate(publishedDate) {
  if (!publishedDate) {
    return new Date().toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  const d = new Date(publishedDate);
  if (Number.isNaN(d.getTime())) return String(publishedDate).slice(0, 10);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatNewsTime(publishedDate) {
  if (!publishedDate) {
    return new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  const d = new Date(publishedDate);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function truncate(text, max) {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1) + "…";
}

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function mapTavilyResults(data) {
  const results = data.results || [];
  return results.map((item, index) => ({
    id: index,
    title: item.title || "제목 없음",
    summary: truncate(item.content, 140),
    url: item.url || "#",
    date: formatNewsDate(item.published_date),
    time: formatNewsTime(item.published_date),
    tag: inferTag(item.title || "", item.content || ""),
    hot: (item.score || 0) > 0.85,
    source: item.url ? getHostname(item.url) : "",
  }));
}

function mapNaverResults(data) {
  const items = data.items || [];
  return items.map((item, index) => {
    const title = stripHtml(item.title);
    const description = stripHtml(item.description);
    const url = item.originallink || item.link || "#";
    return {
      id: index,
      title: title || "제목 없음",
      summary: truncate(description, 140),
      url,
      date: formatNewsDate(item.pubDate),
      time: formatNewsTime(item.pubDate),
      tag: inferTag(title, description),
      hot: false,
      source: getHostname(url) || "Naver",
    };
  });
}

async function fetchTavilyNews(query) {
  const opts = {
    search_depth: "basic",
    max_results: 8,
    include_answer: false,
  };

  try {
    const data = await tavilySearch(query, { ...opts, topic: "news", days: 14 });
    const items = mapTavilyResults(data);
    if (items.length) return items;
  } catch (err) {
    if (/deactivated|not configured|401/i.test(err.message)) throw err;
  }

  const data = await tavilySearch(query, { ...opts, topic: "general" });
  return mapTavilyResults(data);
}

async function fetchNaverNews(query) {
  const data = await naverNewsSearch(query, { display: 8, sort: "date" });
  return mapNaverResults(data);
}

function setSearchStatus(provider, message, type = "info") {
  const el = document.getElementById(`${provider}-search-status`);
  if (!el) return;
  el.hidden = !message;
  el.className = `news-search-status news-search-status--${type}`;
  el.textContent = message;
}

function setSearchLoading(provider, loading) {
  const btn = document.querySelector(`#${provider}-search-form button`);
  const input = document.getElementById(`${provider}-search-input`);
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? "…" : "검색";
  }
  if (input) input.disabled = loading;
}

function setPanelLoading(provider, isLoading) {
  const intel = document.getElementById(`intel-news-${provider}`);
  const feed = document.getElementById(`news-feed-${provider}`);
  const badge = document.getElementById(`${provider}-badge`);
  const label = provider === "tavily" ? "Tavily" : "Naver";

  if (isLoading) {
    if (intel) intel.innerHTML = `<div class="news-loading">${label} 검색 중…</div>`;
    if (feed) feed.innerHTML = `<li class="news-loading">${label} 검색 중…</li>`;
    if (badge) badge.textContent = "검색 중";
  }
}

function renderIntelNews(items, container) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `<div class="news-empty">검색 결과가 없습니다. 다른 키워드로 시도해 보세요.</div>`;
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
      <a class="intel-news-item intel-news-item--link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
        <div class="intel-news-item__meta">
          <span class="intel-news-item__time">${escapeHtml(item.time)}</span>
          ${item.hot ? '<span class="intel-news-item__hot">HOT</span>' : ""}
          ${item.source ? `<span class="intel-news-item__source">${escapeHtml(item.source)}</span>` : ""}
        </div>
        <p class="intel-news-item__title">${escapeHtml(item.title)}</p>
      </a>`
    )
    .join("");
}

function renderNewsFeed(items, list) {
  if (!list) return;
  if (!items.length) {
    list.innerHTML = `<li class="news-empty">검색 결과가 없습니다.</li>`;
    return;
  }

  list.innerHTML = items
    .map((item) => {
      const tag = NEWS_TAG_LABELS[item.tag] || NEWS_TAG_LABELS.export;
      return `
        <li class="news-item">
          <span class="news-item__date">${escapeHtml(item.date)}</span>
          <div class="news-item__content">
            <h3>
              <a class="news-item__link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
                ${escapeHtml(item.title)}
              </a>
            </h3>
            <p>${escapeHtml(item.summary)}</p>
            <span class="news-item__tag ${tag.class}">${tag.text}</span>
          </div>
        </li>`;
    })
    .join("");
}

function buildMockNewsItems() {
  return (DEFENSE_DATA?.news || []).map((item) => ({
    title: item.title,
    summary: item.summary,
    url: "#",
    date: item.date,
    time: item.date?.slice(5) || "—",
    tag: item.tag || "export",
    hot: false,
    source: "목업",
  }));
}

function renderFallbackNews(provider) {
  const mock = buildMockNewsItems();

  renderIntelNews(mock, document.getElementById(`intel-news-${provider}`));
  renderNewsFeed(mock, document.getElementById(`news-feed-${provider}`));

  const feedTag = document.getElementById(`news-feed-tag-${provider}`);
  if (feedTag) feedTag.textContent = `${mock.length}건 · 목업`;

  const badge = document.getElementById(`${provider}-badge`);
  if (badge) badge.textContent = "목업";

  storeCollectedNews(provider, mock);
}

function serverHint() {
  return window.location.protocol === "file:"
    ? "file:// 로는 안 됩니다 → python server.py"
    : "python server.py 재시작 또는 Vercel Env + 재배포";
}

async function loadTavilyNews(query) {
  const searchQuery = (query || DEFAULT_TAVILY_QUERY).trim();
  if (!searchQuery) {
    setSearchStatus("tavily", "검색어를 입력하세요.", "error");
    return;
  }

  setSearchLoading("tavily", true);
  setPanelLoading("tavily", true);
  setSearchStatus("tavily", "");

  try {
    const items = await fetchTavilyNews(searchQuery);
    storeCollectedNews("tavily", items);
    renderIntelNews(items, document.getElementById("intel-news-tavily"));
    renderNewsFeed(items, document.getElementById("news-feed-tavily"));

    const badge = document.getElementById("tavily-badge");
    if (badge) badge.textContent = `${items.length}건`;

    const feedTag = document.getElementById("news-feed-tag-tavily");
    if (feedTag) feedTag.textContent = `${items.length}건 · Tavily`;

    setSearchStatus("tavily", `${items.length}건 검색 완료`, "ok");
  } catch (err) {
    setSearchStatus("tavily", `${err.message} (${serverHint()})`, "error");
    renderFallbackNews("tavily");
    const badge = document.getElementById("tavily-badge");
    if (badge) badge.textContent = "오류";
  } finally {
    setSearchLoading("tavily", false);
  }
}

async function loadNaverNews(query) {
  const searchQuery = (query || DEFAULT_NAVER_QUERY).trim();
  if (!searchQuery) {
    setSearchStatus("naver", "검색어를 입력하세요.", "error");
    return;
  }

  setSearchLoading("naver", true);
  setPanelLoading("naver", true);
  setSearchStatus("naver", "");

  try {
    const items = await fetchNaverNews(searchQuery);
    storeCollectedNews("naver", items);
    renderIntelNews(items, document.getElementById("intel-news-naver"));
    renderNewsFeed(items, document.getElementById("news-feed-naver"));

    const badge = document.getElementById("naver-badge");
    if (badge) badge.textContent = `${items.length}건`;

    const feedTag = document.getElementById("news-feed-tag-naver");
    if (feedTag) feedTag.textContent = `${items.length}건 · Naver`;

    setSearchStatus("naver", `${items.length}건 검색 완료`, "ok");
  } catch (err) {
    setSearchStatus("naver", `${err.message} (${serverHint()})`, "error");
    renderFallbackNews("naver");
    const badge = document.getElementById("naver-badge");
    if (badge) badge.textContent = "오류";
  } finally {
    setSearchLoading("naver", false);
  }
}

function loadAllNews() {
  loadTavilyNews(document.getElementById("tavily-search-input")?.value);
  loadNaverNews(document.getElementById("naver-search-input")?.value);
}

function initNewsSearch() {
  const tavilyForm = document.getElementById("tavily-search-form");
  const tavilyInput = document.getElementById("tavily-search-input");
  if (tavilyForm && tavilyInput) {
    tavilyForm.addEventListener("submit", (e) => {
      e.preventDefault();
      loadTavilyNews(tavilyInput.value);
    });
  }

  const naverForm = document.getElementById("naver-search-form");
  const naverInput = document.getElementById("naver-search-input");
  if (naverForm && naverInput) {
    naverForm.addEventListener("submit", (e) => {
      e.preventDefault();
      loadNaverNews(naverInput.value);
    });
  }
}
