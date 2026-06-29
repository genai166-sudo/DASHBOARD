/**
 * 환율 프록시 — 다중 소스 폴백
 * 1) ExchangeRate-API (EXCHANGERATE_API_KEY)
 * 2) open.er-api.com (키 불필요)
 * 3) Frankfurter (ECB, 키 불필요)
 * 차트·전일 대비: Frankfurter
 */

const fs = require("fs");
const path = require("path");

const EXCHANGE_RATE_API_URL = "https://v6.exchangerate-api.com/v6";
const OPEN_ER_API_URL = "https://open.er-api.com/v6/latest/USD";
const FRANKFURTER_URL = "https://api.frankfurter.app";

const SNAPSHOT_FILE = path.join(__dirname, "..", ".data", "fx-snapshots.json");
const MAX_SNAPSHOTS = 60 * 24 * 7;

const FX_INTERVALS = {
  "1m": { bucketMin: 1, lookbackMin: 60, label: "1분" },
  "10m": { bucketMin: 10, lookbackMin: 24 * 60, label: "10분" },
  "30m": { bucketMin: 30, lookbackMin: 3 * 24 * 60, label: "30분" },
};

let fxCache = null;
let fxCacheAt = 0;
const FX_CACHE_MS = 5 * 60 * 1000;

function getFxApiKey() {
  const raw = process.env.EXCHANGERATE_API_KEY || "";
  return raw.trim().replace(/^["']|["']$/g, "");
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

function calcPairRates(usdBase) {
  const krw = usdBase.KRW;
  const eur = usdBase.EUR;
  const jpy = usdBase.JPY;
  const cny = usdBase.CNY;
  if (!krw) throw new Error("KRW rate unavailable");

  return {
    KRW: krw,
    EUR: eur ? krw / eur : null,
    JPY: jpy ? krw / jpy : null,
    CNY: cny ? krw / cny : null,
  };
}

function buildRateRows(current, previous) {
  const pairs = [
    { pair: "USD/KRW", key: "KRW", decimals: 2 },
    { pair: "EUR/KRW", key: "EUR", decimals: 2 },
    { pair: "JPY/KRW", key: "JPY", decimals: 2 },
    { pair: "CNY/KRW", key: "CNY", decimals: 2 },
  ];

  return pairs
    .filter((p) => current[p.key] != null)
    .map((p) => {
      const value = current[p.key];
      const prev = previous?.[p.key];
      const change = prev != null ? value - prev : 0;
      const changePct = prev != null && prev !== 0 ? (change / prev) * 100 : 0;
      return {
        pair: p.pair,
        value: Number(value.toFixed(p.decimals)),
        change: Number(change.toFixed(p.decimals)),
        changePct: Number(changePct.toFixed(2)),
      };
    });
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "LIG-Dashboard/1.0 (fx-proxy)" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function fetchExchangeRateApiLatest() {
  const key = getFxApiKey();
  if (!key) return null;

  try {
    const data = await fetchJson(`${EXCHANGE_RATE_API_URL}/${key}/latest/USD`);
    if (data.result === "success") return data.conversion_rates;
    console.warn("ExchangeRate-API:", data["error-type"] || "failed");
  } catch (err) {
    console.warn("ExchangeRate-API error:", err.message);
  }
  return null;
}

async function fetchOpenErApiLatest() {
  try {
    const data = await fetchJson(OPEN_ER_API_URL);
    if (data.result === "success" && data.rates) return data.rates;
  } catch (err) {
    console.warn("open.er-api error:", err.message);
  }
  return null;
}

async function fetchFrankfurterLatest() {
  try {
    const data = await fetchJson(`${FRANKFURTER_URL}/latest?from=USD&to=KRW,EUR,JPY,CNY`);
    return data.rates || null;
  } catch (err) {
    console.warn("Frankfurter latest error:", err.message);
    return null;
  }
}

async function fetchFrankfurterOnDate(dateStr) {
  try {
    const data = await fetchJson(`${FRANKFURTER_URL}/${dateStr}?from=USD&to=KRW,EUR,JPY,CNY`);
    return data.rates || null;
  } catch {
    return null;
  }
}

async function fetchFrankfurterHistory(days = 7) {
  return fetchFrankfurterDaily(days);
}

async function fetchFrankfurterDaily(days = 90) {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));

    const fmt = (d) => d.toISOString().slice(0, 10);
    const data = await fetchJson(
      `${FRANKFURTER_URL}/${fmt(start)}..${fmt(end)}?from=USD&to=KRW`
    );

    const entries = Object.entries(data.rates || {}).sort(([a], [b]) => a.localeCompare(b));
    return {
      labels: entries.map(([date]) => {
        const d = new Date(date);
        return `${d.getMonth() + 1}/${d.getDate()}`;
      }),
      data: entries.map(([, rates]) => rates.KRW),
      sparse: false,
    };
  } catch {
    return { labels: [], data: [], sparse: true };
  }
}

async function fetchFrankfurterMonthly(months = 24) {
  try {
    const end = new Date();
    const start = new Date();
    start.setMonth(end.getMonth() - months);

    const fmt = (d) => d.toISOString().slice(0, 10);
    const data = await fetchJson(
      `${FRANKFURTER_URL}/${fmt(start)}..${fmt(end)}?from=USD&to=KRW`
    );

    const byMonth = {};
    for (const [day, rates] of Object.entries(data.rates || {}).sort()) {
      byMonth[day.slice(0, 7)] = rates.KRW;
    }

    return {
      labels: Object.keys(byMonth).map((ym) => ym.replace("-", "/")),
      data: Object.values(byMonth),
      sparse: false,
    };
  } catch {
    return { labels: [], data: [], sparse: true };
  }
}

function loadSnapshots() {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw.filter((s) => typeof s.ts === "number" && typeof s.krw === "number");
  } catch {
    return [];
  }
}

function saveSnapshots(snapshots) {
  const dir = path.dirname(SNAPSHOT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshots.slice(-MAX_SNAPSHOTS)));
}

function recordFxSnapshot(krw) {
  if (!krw || krw <= 0) return;
  const nowMs = Date.now();
  const minuteMs = Math.floor(nowMs / 60_000) * 60_000;
  const snapshots = loadSnapshots();

  if (snapshots.length && snapshots[snapshots.length - 1].ts === minuteMs) {
    snapshots[snapshots.length - 1].krw = Math.round(krw * 100) / 100;
  } else {
    snapshots.push({ ts: minuteMs, krw: Math.round(krw * 100) / 100 });
  }
  saveSnapshots(snapshots);
}

function aggregateIntraday(snapshots, bucketMin, lookbackMin) {
  if (!snapshots.length) {
    return { labels: [], data: [], sparse: true };
  }

  const cutoff = Date.now() - lookbackMin * 60_000;
  const bucketMs = bucketMin * 60_000;
  const recent = snapshots.filter((s) => s.ts >= cutoff);
  if (!recent.length) {
    return { labels: [], data: [], sparse: true };
  }

  const buckets = {};
  for (const s of recent) {
    const key = Math.floor(s.ts / bucketMs) * bucketMs;
    buckets[key] = s.krw;
  }

  const keys = Object.keys(buckets)
    .map(Number)
    .sort((a, b) => a - b);

  const labels = keys.map((ts) => {
    const d = new Date(ts);
    if (bucketMin >= 30) {
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    }
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });

  return {
    labels,
    data: keys.map((k) => buckets[k]),
    sparse: keys.length === 0,
  };
}

async function fetchFxChart(interval = "1d") {
  const meta = FX_INTERVALS[interval];

  if (meta) {
    const chart = aggregateIntraday(loadSnapshots(), meta.bucketMin, meta.lookbackMin);
    return {
      ...chart,
      interval,
      intervalLabel: meta.label,
      pair: "USD/KRW",
      live: chart.data.length > 0,
    };
  }

  if (interval === "7d") {
    const chart = await fetchFrankfurterDaily(7);
    const snapshots = loadSnapshots();
    if (snapshots.length) {
      const today = new Date();
      const todayLabel = `${today.getMonth() + 1}/${today.getDate()}`;
      const liveKrw = snapshots[snapshots.length - 1].krw;
      if (chart.data.length && chart.labels[chart.labels.length - 1] !== todayLabel) {
        chart.labels.push(todayLabel);
        chart.data.push(liveKrw);
      } else if (!chart.data.length) {
        chart.labels = [todayLabel];
        chart.data = [liveKrw];
        chart.sparse = false;
      }
    }
    return { ...chart, interval: "7d", intervalLabel: "7일", pair: "USD/KRW", live: chart.data.length > 0 };
  }

  if (interval === "1M") {
    const chart = await fetchFrankfurterMonthly(24);
    return { ...chart, interval: "1M", intervalLabel: "1월", pair: "USD/KRW", live: chart.data.length > 0 };
  }

  const chart = await fetchFrankfurterDaily(90);
  return { ...chart, interval: "1d", intervalLabel: "1일", pair: "USD/KRW", live: chart.data.length > 0 };
}

function prevBusinessDateStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function fetchUsdBaseRates() {
  const openEr = await fetchOpenErApiLatest();
  if (openEr?.KRW) return { usdBase: openEr, source: "open.er-api" };

  const exchangerate = await fetchExchangeRateApiLatest();
  if (exchangerate?.KRW) return { usdBase: exchangerate, source: "exchangerate-api" };

  const frankfurter = await fetchFrankfurterLatest();
  if (frankfurter?.KRW) return { usdBase: frankfurter, source: "frankfurter" };

  const err = new Error("All FX sources failed");
  err.status = 502;
  throw err;
}

async function fetchFxRates() {
  if (fxCache && Date.now() - fxCacheAt < FX_CACHE_MS) {
    return fxCache;
  }

  const { usdBase, source } = await fetchUsdBaseRates();
  const current = calcPairRates(usdBase);
  recordFxSnapshot(current.KRW);

  const [prevRaw, usdTrend] = await Promise.all([
    fetchFrankfurterOnDate(prevBusinessDateStr()),
    fetchFrankfurterDaily(7),
  ]);

  let previous = null;
  if (prevRaw) {
    try {
      previous = calcPairRates({ ...prevRaw, KRW: prevRaw.KRW });
    } catch {
      /* ignore */
    }
  }

  fxCache = {
    updated: formatUpdated(),
    source,
    live: true,
    rates: buildRateRows(current, previous),
    usdTrend,
  };
  fxCacheAt = Date.now();
  return fxCache;
}

module.exports = {
  fetchFxRates,
  fetchFxChart,
  fetchUsdBaseRates,
  calcPairRates,
  recordFxSnapshot,
  getFxApiKey,
  FX_INTERVALS,
};
