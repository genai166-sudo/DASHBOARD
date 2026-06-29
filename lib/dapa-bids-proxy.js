/**
 * 방위사업청 군수품조달 입찰공고 — data.go.kr BidPblancInfoService
 */

const BASE_URL =
  "https://apis.data.go.kr/1690000/BidPblancInfoService/getDmstcCmpetBidPblancList";
const D2B_DETAIL_URL = "https://www.d2b.go.kr/pdb/bid/bidDetail.do";

let bidsCache = null;
let bidsCacheAt = 0;
const BIDS_CACHE_MS = 5 * 60 * 1000;

function getDataGoKrKey() {
  const raw = process.env.DATA_GO_KR_SERVICE_KEY || "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

function fmtYyyymmdd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function localTag(tag) {
  const i = tag.indexOf("}");
  return i >= 0 ? tag.slice(i + 1) : tag;
}

function parseItems(xml) {
  const codeMatch = xml.match(/<resultCode>([^<]*)<\/resultCode>/);
  const msgMatch = xml.match(/<resultMsg>([^<]*)<\/resultMsg>/);
  const resultCode = codeMatch?.[1]?.trim() || "";
  const resultMsg = msgMatch?.[1]?.trim() || "";

  if (resultCode && resultCode !== "00" && resultCode !== "0") {
    const err = new Error(resultMsg || `API error (${resultCode})`);
    err.status = 502;
    throw err;
  }

  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const block of blocks) {
    const row = {};
    const fields = block.matchAll(/<([a-zA-Z0-9_]+)>([^<]*)<\/\1>/g);
    for (const [, name, value] of fields) {
      if (name !== "item") row[name] = value.trim();
    }
    if (Object.keys(row).length) items.push(row);
  }
  return items;
}

function parseDt(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length >= 14) {
    const d = new Date(
      Number(digits.slice(0, 4)),
      Number(digits.slice(4, 6)) - 1,
      Number(digits.slice(6, 8)),
      Number(digits.slice(8, 10)),
      Number(digits.slice(10, 12)),
      Number(digits.slice(12, 14))
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (digits.length >= 8) {
    const d = new Date(
      Number(digits.slice(0, 4)),
      Number(digits.slice(4, 6)) - 1,
      Number(digits.slice(6, 8))
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function deadlineLabel(dt) {
  if (!dt) return { deadline: "—", status: "open" };
  const days = Math.ceil((dt.getTime() - Date.now()) / 86400000);
  if (days < 0) return { deadline: "마감", status: "closed" };
  if (days <= 7) return { deadline: `D-${days}`, status: "urgent" };
  return { deadline: `D-${days}`, status: "open" };
}

function bidUrl(item) {
  const bidno = item.g2bPblancNo || item.pblancNo || "";
  const bidseq = item.g2bPblancOdr || item.pblancOdr || "00";
  if (bidno) {
    return `${D2B_DETAIL_URL}?bidno=${encodeURIComponent(bidno)}&bidseq=${encodeURIComponent(bidseq)}`;
  }
  return "https://www.d2b.go.kr/";
}

function mapBid(item, index) {
  const closeRaw =
    item.biddocPresentnClosDt || item.bidPartcptRegistClosDt || item.opengDt || "";
  const closeDt = parseDt(closeRaw);
  const { deadline, status } = deadlineLabel(closeDt);
  const meta = [item.busiDivs, item.cntrctMth].filter(Boolean);

  return {
    id: item.pblancNo || item.g2bPblancNo || `DAPA-${index + 1}`,
    title: item.bidNm || "제목 없음",
    agency: item.ornt || "방위사업청",
    budget: meta.length ? meta.join(" · ") : "공고문 확인",
    deadline,
    status,
    url: bidUrl(item),
    pblancDate: item.pblancDate || "",
    opengDt: item.opengDt || "",
    closeDt: closeRaw,
  };
}

function sortBids(bids) {
  return [...bids].sort((a, b) => {
    const au = a.status === "urgent" ? 0 : 1;
    const bu = b.status === "urgent" ? 0 : 1;
    if (au !== bu) return au - bu;
    const ac = parseDt(a.closeDt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bc = parseDt(b.closeDt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (ac !== bc) return ac - bc;
    const ap = parseDt(a.pblancDate)?.getTime() ?? 0;
    const bp = parseDt(b.pblancDate)?.getTime() ?? 0;
    return bp - ap;
  });
}

async function fetchDapaBids(options = {}) {
  if (bidsCache && Date.now() - bidsCacheAt < BIDS_CACHE_MS) {
    return bidsCache;
  }

  const apiKey = getDataGoKrKey();
  if (!apiKey) {
    const err = new Error("DATA_GO_KR_SERVICE_KEY is not configured on the server");
    err.status = 500;
    throw err;
  }

  const pageNo = options.pageNo || 1;
  const numOfRows = Math.min(Math.max(options.numOfRows || 10, 1), 100);
  const daysBack = options.daysBack || 30;

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (Math.max(daysBack, 1) - 1));

  const url = new URL(BASE_URL);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("anmtDateBegin", fmtYyyymmdd(start));
  url.searchParams.set("anmtDateEnd", fmtYyyymmdd(end));
  const requestUrl = `${url.toString()}&serviceKey=${encodeURIComponent(apiKey)}`;

  const res = await fetch(requestUrl, {
    headers: { "User-Agent": "LIG-Dashboard/1.0 (dapa-bids-proxy)" },
  });
  const xml = await res.text();
  if (!res.ok) {
    const err = new Error(xml || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const items = parseItems(xml);
  const bids = sortBids(items.map((item, i) => mapBid(item, i)));

  bidsCache = {
    bids,
    totalCount: bids.length,
    source: "dapa",
    live: true,
    query: {
      anmtDateBegin: fmtYyyymmdd(start),
      anmtDateEnd: fmtYyyymmdd(end),
    },
  };
  bidsCacheAt = Date.now();
  return bidsCache;
}

module.exports = { fetchDapaBids, getDataGoKrKey };
