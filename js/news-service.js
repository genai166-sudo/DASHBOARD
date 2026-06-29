/**
 * Tavily 기반 방산 뉴스 — 서버 프록시(/api/tavily/search) 경유
 */

const DEFAULT_NEWS_QUERY =
  "방산 수출 NATO 방위산업 defense industry Korea military";

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
  { tag: "budget", patterns: /budget|spending|defense bill|예산|방위비/i },
  { tag: "tech", patterns: /drone|uas|ai|hypersonic|무인|자율|미사일|hbm/i },
  { tag: "export", patterns: /export|contract|procurement|수출|입찰|조달/i },
];

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  if (Number.isNaN(d.getTime())) return publishedDate.slice(0, 10);
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

async function fetchDefenseNews(query) {
  const opts = {
    search_depth: "basic",
    max_results: 10,
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

function setSearchStatus(message, type = "info") {
  const el = document.getElementById("news-search-status");
  if (!el) return;
  el.hidden = !message;
  el.className = `news-search-status news-search-status--${type}`;
  el.textContent = message;
}

function setSearchLoading(loading) {
  const btn = document.querySelector("#news-search-form button");
  const input = document.getElementById("news-search-input");
  if (btn) {
    btn.disabled = loading;
    btn.textContent = loading ? "…" : "검색";
  }
  if (input) input.disabled = loading;
}

function renderIntelNews(items, container) {
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

function renderFallbackNews() {
  const mock = (DEFENSE_DATA?.news || []).map((item) => ({
    title: item.title,
    summary: item.summary,
    url: "#",
    date: item.date,
    time: item.date?.slice(5) || "—",
    tag: item.tag || "export",
    hot: false,
    source: "목업",
  }));

  renderIntelNews(mock, document.getElementById("intel-news"));
  renderNewsFeed(mock, document.getElementById("news-feed"));

  const feedTag = document.getElementById("news-feed-tag");
  if (feedTag) feedTag.textContent = `${mock.length}건 · 목업`;
}

function setNewsLoading(isLoading) {
  const intel = document.getElementById("intel-news");
  const feed = document.getElementById("news-feed");
  const badge = document.getElementById("news-badge");

  if (isLoading) {
    intel.innerHTML = `<div class="news-loading">Tavily 검색 중…</div>`;
    feed.innerHTML = `<li class="news-loading">Tavily 검색 중…</li>`;
    if (badge) badge.textContent = "검색 중";
  }
}

async function loadTavilyNews(query) {
  const searchQuery = (query || DEFAULT_NEWS_QUERY).trim();
  if (!searchQuery) {
    setSearchStatus("검색어를 입력하세요.", "error");
    return;
  }

  setSearchLoading(true);
  setNewsLoading(true);
  setSearchStatus("");

  try {
    const items = await fetchDefenseNews(searchQuery);
    renderIntelNews(items, document.getElementById("intel-news"));
    renderNewsFeed(items, document.getElementById("news-feed"));

    const badge = document.getElementById("news-badge");
    if (badge) badge.textContent = "Tavily";

    const feedTag = document.getElementById("news-feed-tag");
    if (feedTag) feedTag.textContent = `${items.length}건 · Tavily`;

    setSearchStatus(`${items.length}건 검색 완료`, "ok");
  } catch (err) {
    const hint =
      window.location.protocol === "file:"
        ? "file:// 로는 안 됩니다 → python server.py"
        : "python server.py 재시작 또는 Vercel Env + 재배포";

    setSearchStatus(`${err.message} (${hint})`, "error");
    renderFallbackNews();

    const badge = document.getElementById("news-badge");
    if (badge) badge.textContent = "오류";
  } finally {
    setSearchLoading(false);
  }
}

function initNewsSearch() {
  const form = document.getElementById("news-search-form");
  const input = document.getElementById("news-search-input");
  if (!form || !input) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    loadTavilyNews(input.value);
  });
}
