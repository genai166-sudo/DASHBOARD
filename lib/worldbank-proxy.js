/**
 * World Bank Open Data — 군사비 지출 (키 불필요)
 * https://data.worldbank.org/indicator/MS.MIL.XPND.CD
 */

const WB_BASE = "https://api.worldbank.org/v2";

let statsCache = null;
let statsCacheAt = 0;
const STATS_CACHE_MS = 15 * 60 * 1000;

const GDP_COUNTRIES = [
  { code: "USA", label: "미국" },
  { code: "SAU", label: "사우디" },
  { code: "ISR", label: "이스라엘" },
  { code: "RUS", label: "러시아" },
  { code: "KOR", label: "한국" },
  { code: "FRA", label: "프랑스" },
  { code: "GBR", label: "영국" },
  { code: "CHN", label: "중국" },
  { code: "JPN", label: "일본" },
  { code: "DEU", label: "독일" },
];

const REGION_COUNTRIES = {
  "북미": ["USA", "CAN"],
  "유럽": ["DEU", "FRA", "GBR", "ITA", "ESP", "POL", "NLD", "NOR", "SWE", "UKR"],
  "아시아·태평양": ["CHN", "JPN", "KOR", "IND", "AUS", "TWN", "VNM", "IDN"],
  "중동": ["SAU", "ISR", "IRN", "ARE", "TUR", "EGY"],
};

const REGION_COLORS = {
  "북미": { border: "#4da6ff", bg: "rgba(77, 166, 255, 0.1)" },
  "유럽": { border: "#b48cff", bg: "rgba(180, 140, 255, 0.08)" },
  "아시아·태평양": { border: "#3dd68c", bg: "rgba(61, 214, 140, 0.08)" },
  "중동": { border: "#f0a030", bg: "rgba(240, 160, 48, 0.08)" },
};

const ALL_COUNTRY_CODES = [
  ...new Set([
    ...GDP_COUNTRIES.map((c) => c.code),
    ...Object.values(REGION_COUNTRIES).flat(),
    "WLD",
    "KOR",
  ]),
];

async function fetchWbIndicator(countryCodes, indicator, dateRange = "2019:2023") {
  const chunkSize = 12;
  const rows = [];
  for (let i = 0; i < countryCodes.length; i += chunkSize) {
    const chunk = countryCodes.slice(i, i + chunkSize);
    const codes = chunk.join(";");
    const url =
      `${WB_BASE}/country/${codes}/indicator/${indicator}` +
      `?format=json&per_page=2000&date=${dateRange}`;

    const res = await fetch(url, {
      headers: { "User-Agent": "LIG-Dashboard/1.0 (worldbank-proxy)" },
    });
    if (!res.ok) throw new Error(`World Bank HTTP ${res.status}`);

    const json = await res.json();
    const part = Array.isArray(json) ? json[1] : null;
    if (!Array.isArray(part)) throw new Error("World Bank response invalid");
    rows.push(...part.filter((r) => r.value != null));
  }
  return rows;
}

function groupByCountryYear(rows) {
  const map = {};
  for (const row of rows) {
    const code = row.countryiso3code;
    if (!map[code]) map[code] = {};
    map[code][row.date] = row.value;
  }
  return map;
}

function sortedYears(map, codes) {
  const years = new Set();
  for (const code of codes) {
    Object.keys(map[code] || {}).forEach((y) => years.add(y));
  }
  return [...years].sort();
}

function buildRegionalChart(usdRows) {
  const byCountry = groupByCountryYear(usdRows);
  const years = sortedYears(byCountry, ALL_COUNTRY_CODES);

  const datasets = Object.entries(REGION_COUNTRIES).map(([region, codes]) => ({
    label: region,
    data: years.map((year) => {
      const sum = codes.reduce((acc, code) => acc + (byCountry[code]?.[year] || 0), 0);
      return Math.round((sum / 1e9) * 10) / 10;
    }),
    borderColor: REGION_COLORS[region].border,
    backgroundColor: REGION_COLORS[region].bg,
    tension: 0.3,
    fill: true,
  }));

  return { labels: years, datasets, unit: "십억 USD", source: "World Bank" };
}

function buildGdpRatioChart(gdpRows) {
  const byCountry = groupByCountryYear(gdpRows);
  const latestYear = sortedYears(byCountry, GDP_COUNTRIES.map((c) => c.code)).pop();

  const items = GDP_COUNTRIES.map(({ code, label }) => ({
    label,
    value: byCountry[code]?.[latestYear] ?? null,
  }))
    .filter((i) => i.value != null)
    .sort((a, b) => b.value - a.value);

  return {
    labels: items.map((i) => i.label),
    data: items.map((i) => Math.round(i.value * 10) / 10),
    year: latestYear,
    source: "World Bank",
  };
}

function buildKoreaSpendingChart(usdRows) {
  const byCountry = groupByCountryYear(usdRows);
  const korea = byCountry.KOR || {};
  const years = Object.keys(korea).sort();
  const data = years.map((y) => Math.round((korea[y] / 1e9) * 10) / 10);

  return {
    labels: years,
    data,
    unit: "십억 USD",
    source: "World Bank",
    note: "국방비 지출 (방산 수출액과 다름)",
  };
}

function buildKpis(usdRows, gdpRows) {
  const byCountry = groupByCountryYear(usdRows);
  const world = byCountry.WLD || {};
  const years = Object.keys(world).sort();
  const latest = years[years.length - 1];
  const prev = years[years.length - 2];
  const latestVal = world[latest];
  const prevVal = world[prev];
  const yoy = prevVal ? ((latestVal - prevVal) / prevVal) * 100 : 0;

  const gdpByCountry = groupByCountryYear(gdpRows);
  const gdpYear = sortedYears(gdpByCountry, GDP_COUNTRIES.map((c) => c.code)).pop();

  const top5Spenders = ["USA", "CHN", "RUS", "IND", "SAU"];
  const top5Spend = top5Spenders.reduce((s, c) => s + (byCountry[c]?.[latest] || 0), 0);
  const top5Share = latestVal ? (top5Spend / latestVal) * 100 : null;

  const korGdp = gdpByCountry.KOR || {};
  const korYears = Object.keys(korGdp).sort();
  const korLatest = korYears[korYears.length - 1];
  const korPrev = korYears[korYears.length - 2];
  const korGdpVal = korGdp[korLatest];
  const korGdpChange = korGdpVal != null && korGdp[korPrev] != null
    ? korGdpVal - korGdp[korPrev]
    : null;

  return {
    globalSpending: {
      value: latestVal,
      formatted: `$${(latestVal / 1e12).toFixed(2)}T`,
      year: latest,
      yoy: Math.round(yoy * 10) / 10,
      source: "World Bank",
    },
    top5Share: {
      value: top5Share,
      formatted: top5Share != null ? `${top5Share.toFixed(1)}%` : "—",
      year: latest,
      note: "군사비 지출 상위 5개국 점유율",
      source: "World Bank",
    },
    koreaGdpRatio: {
      value: korGdpVal,
      formatted: korGdpVal != null ? `${korGdpVal.toFixed(1)}%` : "—",
      year: korLatest,
      change: korGdpChange,
      source: "World Bank",
    },
  };
}

async function fetchWorldBankStats() {
  if (statsCache && Date.now() - statsCacheAt < STATS_CACHE_MS) {
    return statsCache;
  }

  const [usdRows, gdpRows] = await Promise.all([
    fetchWbIndicator(ALL_COUNTRY_CODES, "MS.MIL.XPND.CD", "2019:2023"),
    fetchWbIndicator([...GDP_COUNTRIES.map((c) => c.code), "WLD"], "MS.MIL.XPND.GD.ZS", "2019:2023"),
  ]);

  statsCache = {
    updated: new Date().toISOString(),
    source: "World Bank Open Data",
    live: true,
    regional: buildRegionalChart(usdRows),
    gdpRatio: buildGdpRatioChart(gdpRows),
    koreaSpending: buildKoreaSpendingChart(usdRows),
    kpis: buildKpis(usdRows, gdpRows),
  };
  statsCacheAt = Date.now();
  return statsCache;
}

module.exports = {
  fetchWorldBankStats,
  GDP_COUNTRIES,
  REGION_COUNTRIES,
};
