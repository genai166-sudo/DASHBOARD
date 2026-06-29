/**
 * ExchangeRate-API 프록시 — EXCHANGERATE_API_KEY
 * https://www.exchangerate-api.com/
 * 차트·전일 대비: Frankfurter (키 불필요, ECB 기준)
 */

const EXCHANGE_RATE_API_URL = "https://v6.exchangerate-api.com/v6";
const FRANKFURTER_URL = "https://api.frankfurter.app";

function getFxApiKey() {
  const raw = process.env.EXCHANGERATE_API_KEY || "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

function formatUpdated() {
  return new Date().toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }) + " KST";
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
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function fetchExchangeRateApiLatest() {
  const key = getFxApiKey();
  if (!key) return null;

  const data = await fetchJson(`${EXCHANGE_RATE_API_URL}/${key}/latest/USD`);
  if (data.result !== "success") {
    throw new Error(data["error-type"] || "ExchangeRate-API request failed");
  }
  return data.conversion_rates;
}

async function fetchFrankfurterLatest() {
  const data = await fetchJson(`${FRANKFURTER_URL}/latest?from=USD&to=KRW,EUR,JPY,CNY`);
  return data.rates ? { ...data.rates, KRW: data.rates.KRW } : data.rates;
}

async function fetchFrankfurterOnDate(dateStr) {
  const data = await fetchJson(`${FRANKFURTER_URL}/${dateStr}?from=USD&to=KRW,EUR,JPY,CNY`);
  return data.rates;
}

async function fetchFrankfurterHistory(days = 7) {
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
  };
}

function prevBusinessDateStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function fetchFxRates() {
  let usdBase = await fetchExchangeRateApiLatest();
  let source = "exchangerate-api";

  if (!usdBase) {
    usdBase = await fetchFrankfurterLatest();
    source = "frankfurter";
  }

  if (!usdBase?.KRW) {
    const err = new Error("EXCHANGERATE_API_KEY is not configured and Frankfurter fallback failed");
    err.status = 500;
    throw err;
  }

  const current = calcPairRates(usdBase);

  let previous = null;
  try {
    const prevRaw = await fetchFrankfurterOnDate(prevBusinessDateStr());
    if (prevRaw) previous = calcPairRates({ ...prevRaw, KRW: prevRaw.KRW });
  } catch {
    /* 전일 데이터 없으면 change 0 */
  }

  const usdTrend = await fetchFrankfurterHistory(7);

  return {
    updated: formatUpdated(),
    source,
    rates: buildRateRows(current, previous),
    usdTrend,
  };
}

module.exports = { fetchFxRates, getFxApiKey };
