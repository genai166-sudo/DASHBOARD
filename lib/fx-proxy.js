/**
 * 환율 프록시 — 다중 소스 폴백
 * 1) ExchangeRate-API (EXCHANGERATE_API_KEY)
 * 2) open.er-api.com (키 불필요)
 * 3) Frankfurter (ECB, 키 불필요)
 * 차트·전일 대비: Frankfurter
 */


const EXCHANGE_RATE_API_URL = "https://v6.exchangerate-api.com/v6";
const OPEN_ER_API_URL = "https://open.er-api.com/v6/latest/USD";
const FRANKFURTER_URL = "https://api.frankfurter.app";

const FX_CHART_INTERVALS = {
  "1d": { label: "1일", days: 1 },
  "1w": { label: "1주일", days: 7 },
  "1mo": { label: "1달", days: 30 },
  "1y": { label: "1년", days: 365 },
  "10y": { label: "10년", months: 120 },
};

const LEGACY_INTERVALS = {
  "7d": "1w",
  "1M": "1mo",
  "1m": "1d",
  "10m": "1d",
  "30m": "1d",
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

function normalizeChartInterval(interval) {
  const key = String(interval || "1w").trim();
  return LEGACY_INTERVALS[key] || key;
}

async function appendLiveSpot(chart) {
  try {
    const { usdBase } = await fetchUsdBaseRates();
    const krw = usdBase?.KRW;
    if (!krw) return chart;

    const today = new Date();
    const todayLabel = `${today.getMonth() + 1}/${today.getDate()}`;
    if (chart.labels.length && chart.labels[chart.labels.length - 1] === todayLabel) {
      chart.data[chart.data.length - 1] = krw;
    } else {
      chart.labels.push(todayLabel);
      chart.data.push(krw);
    }
    chart.sparse = false;
  } catch {
    /* optional */
  }
  return chart;
}

async function fetchFxChart(interval = "1w") {
  interval = normalizeChartInterval(interval);
  const meta = FX_CHART_INTERVALS[interval] || FX_CHART_INTERVALS["1w"];

  let chart;
  if (meta.months) {
    chart = await fetchFrankfurterMonthly(meta.months);
  } else {
    chart = await fetchFrankfurterDaily(meta.days);
    if (meta.days <= 30) {
      chart = await appendLiveSpot(chart);
    }
  }

  return {
    ...chart,
    interval,
    intervalLabel: meta.label,
    pair: "USD/KRW",
    live: chart.data.length > 0,
  };
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
  getFxApiKey,
  FX_CHART_INTERVALS,
};
