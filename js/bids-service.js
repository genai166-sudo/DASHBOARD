/**
 * 방위사업청 조달 입찰공고 — data.go.kr BidPblancInfoService
 */

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchDefenseBids() {
  const params = new URLSearchParams({ pageNo: "1", numOfRows: "10", daysBack: "30" });
  let res;
  try {
    res = await fetch(`/api/bids/dapa?${params}`);
  } catch {
    throw new Error("입찰공고 서버에 연결할 수 없습니다. python server.py 재시작 후 다시 시도하세요.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("입찰 API 미연결 — python server.py 재시작 필요");
    }
    throw new Error(data.error || "입찰공고 조회 실패");
  }
  return data.bids || [];
}

const BID_STATUS_CLASS = { urgent: "urgent", open: "open", closed: "closed" };

function setBidsBadge(text, live = false) {
  const badge = document.getElementById("bids-badge");
  if (!badge) return;
  badge.textContent = text;
  badge.classList.toggle("intel-card__badge--live", live);
}

function renderBids(bids) {
  const container = document.getElementById("intel-bids");
  if (!container) return;

  if (!bids.length) {
    container.innerHTML = `<div class="news-empty">최근 30일 입찰공고가 없습니다.</div>`;
    setBidsBadge("방위사업청", false);
    return;
  }

  container.innerHTML = bids
    .map(
      (bid) => `
      <a class="bid-item bid-item--link" href="${escapeHtml(bid.url)}" target="_blank" rel="noopener noreferrer">
        <div class="bid-item__top">
          <span class="bid-item__id">${escapeHtml(bid.id)}</span>
          <span class="bid-item__deadline bid-item__deadline--${BID_STATUS_CLASS[bid.status] || "open"}">${escapeHtml(bid.deadline)}</span>
        </div>
        <div class="bid-item__title">${escapeHtml(bid.title)}</div>
        <div class="bid-item__meta">
          <span>${escapeHtml(bid.agency)}</span>
          <span class="bid-item__budget">${escapeHtml(bid.budget)}</span>
        </div>
      </a>`
    )
    .join("");

  setBidsBadge("방위사업청 · 실시간", true);
}

function renderBidsLoading() {
  const container = document.getElementById("intel-bids");
  if (container) {
    container.innerHTML = `<div class="news-loading">방위사업청 입찰공고 조회 중…</div>`;
  }
  setBidsBadge("로딩", false);
}

function renderBidsError(message) {
  const container = document.getElementById("intel-bids");
  if (container) {
    container.innerHTML = `<div class="news-empty">${escapeHtml(message)}</div>`;
  }
  if (/키|KEY|not configured/i.test(message)) {
    setBidsBadge("키 미설정", false);
  } else if (/재시작|404|미연결/i.test(message)) {
    setBidsBadge("서버 재시작", false);
  } else {
    setBidsBadge("오류", false);
  }
}

async function loadDefenseBids() {
  renderBidsLoading();
  try {
    const bids = await fetchDefenseBids();
    renderBids(bids);
  } catch (err) {
    console.warn("DAPA bids error:", err.message);
    renderBidsError(err.message);
  }
}
