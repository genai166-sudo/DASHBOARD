"""World Bank Open Data — 군사비 통계 (키 불필요)"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import datetime, timezone

WB_BASE = "https://api.worldbank.org/v2"

GDP_COUNTRIES = [
    ("USA", "미국"),
    ("SAU", "사우디"),
    ("ISR", "이스라엘"),
    ("RUS", "러시아"),
    ("KOR", "한국"),
    ("FRA", "프랑스"),
    ("GBR", "영국"),
    ("CHN", "중국"),
    ("JPN", "일본"),
    ("DEU", "독일"),
]

REGION_COUNTRIES = {
    "북미": ["USA", "CAN"],
    "유럽": ["DEU", "FRA", "GBR", "ITA", "ESP", "POL", "NLD", "NOR", "SWE", "UKR"],
    "아시아·태평양": ["CHN", "JPN", "KOR", "IND", "AUS", "TWN", "VNM", "IDN"],
    "중동": ["SAU", "ISR", "IRN", "ARE", "TUR", "EGY"],
}

REGION_COLORS = {
    "북미": ("#4da6ff", "rgba(77, 166, 255, 0.1)"),
    "유럽": ("#b48cff", "rgba(180, 140, 255, 0.08)"),
    "아시아·태평양": ("#3dd68c", "rgba(61, 214, 140, 0.08)"),
    "중동": ("#f0a030", "rgba(240, 160, 48, 0.08)"),
}

ALL_COUNTRY_CODES = sorted({
    *{c for c, _ in GDP_COUNTRIES},
    *{c for codes in REGION_COUNTRIES.values() for c in codes},
    "WLD",
    "KOR",
})


def _fetch_indicator(codes: list[str], indicator: str, date_range: str = "2019:2023") -> list[dict]:
    chunk_size = 12
    rows: list[dict] = []
    for i in range(0, len(codes), chunk_size):
        chunk = codes[i : i + chunk_size]
        url = f"{WB_BASE}/country/{';'.join(chunk)}/indicator/{indicator}?format=json&per_page=2000&date={date_range}"
        req = urllib.request.Request(url, headers={"User-Agent": "LIG-Dashboard/1.0 (worldbank-proxy)"})
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        chunk_rows = data[1] if isinstance(data, list) and len(data) > 1 else []
        rows.extend(r for r in chunk_rows if r.get("value") is not None)
    return rows


def _group(rows: list[dict]) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for row in rows:
        code = row["countryiso3code"]
        out.setdefault(code, {})[row["date"]] = row["value"]
    return out


def _sorted_years(by_country: dict, codes: list[str]) -> list[str]:
    years: set[str] = set()
    for code in codes:
        years.update(by_country.get(code, {}).keys())
    return sorted(years)


def fetch_worldbank_stats() -> dict:
    usd_rows = _fetch_indicator(ALL_COUNTRY_CODES, "MS.MIL.XPND.CD")
    gdp_rows = _fetch_indicator([c for c, _ in GDP_COUNTRIES] + ["WLD"], "MS.MIL.XPND.GD.ZS")

    by_usd = _group(usd_rows)
    by_gdp = _group(gdp_rows)
    years = _sorted_years(by_usd, ALL_COUNTRY_CODES)

    regional_datasets = []
    for region, codes in REGION_COUNTRIES.items():
        border, bg = REGION_COLORS[region]
        regional_datasets.append({
            "label": region,
            "data": [
                round(sum(by_usd.get(c, {}).get(y, 0) for c in codes) / 1e9, 1)
                for y in years
            ],
            "borderColor": border,
            "backgroundColor": bg,
            "tension": 0.3,
            "fill": True,
        })

    gdp_year = _sorted_years(by_gdp, [c for c, _ in GDP_COUNTRIES])[-1]
    gdp_items = [
        {"label": label, "value": by_gdp.get(code, {}).get(gdp_year)}
        for code, label in GDP_COUNTRIES
        if by_gdp.get(code, {}).get(gdp_year) is not None
    ]
    gdp_items.sort(key=lambda x: x["value"], reverse=True)

    kor = by_usd.get("KOR", {})
    kor_years = sorted(kor.keys())

    world = by_usd.get("WLD", {})
    w_years = sorted(world.keys())
    latest = w_years[-1]
    prev = w_years[-2] if len(w_years) > 1 else latest
    latest_val = world[latest]
    prev_val = world[prev]
    yoy = round(((latest_val - prev_val) / prev_val) * 100, 1) if prev_val else 0

    top5 = ["USA", "CHN", "RUS", "IND", "SAU"]
    top5_spend = sum(by_usd.get(c, {}).get(latest, 0) for c in top5)
    top5_share = round((top5_spend / latest_val) * 100, 1) if latest_val else None

    kor_gdp = by_gdp.get("KOR", {})
    kor_gdp_years = sorted(kor_gdp.keys())
    kor_latest = kor_gdp_years[-1]
    kor_prev = kor_gdp_years[-2] if len(kor_gdp_years) > 1 else kor_latest
    kor_val = kor_gdp.get(kor_latest)
    kor_change = round(kor_val - kor_gdp.get(kor_prev, kor_val), 1) if kor_val is not None else None

    return {
        "updated": datetime.now(timezone.utc).isoformat(),
        "source": "World Bank Open Data",
        "live": True,
        "regional": {
            "labels": years,
            "datasets": regional_datasets,
            "unit": "십억 USD",
            "source": "World Bank",
        },
        "gdpRatio": {
            "labels": [i["label"] for i in gdp_items],
            "data": [round(i["value"], 1) for i in gdp_items],
            "year": gdp_year,
            "source": "World Bank",
        },
        "koreaSpending": {
            "labels": kor_years,
            "data": [round(kor[y] / 1e9, 1) for y in kor_years],
            "unit": "십억 USD",
            "source": "World Bank",
            "note": "국방비 지출 (방산 수출액과 다름)",
        },
        "kpis": {
            "globalSpending": {
                "value": latest_val,
                "formatted": f"${latest_val / 1e12:.2f}T",
                "year": latest,
                "yoy": yoy,
                "source": "World Bank",
            },
            "top5Share": {
                "value": top5_share,
                "formatted": f"{top5_share}%" if top5_share is not None else "—",
                "year": latest,
                "note": "군사비 지출 상위 5개국 점유율",
                "source": "World Bank",
            },
            "koreaGdpRatio": {
                "value": kor_val,
                "formatted": f"{kor_val:.1f}%" if kor_val is not None else "—",
                "year": kor_latest,
                "change": kor_change,
                "source": "World Bank",
            },
        },
    }
