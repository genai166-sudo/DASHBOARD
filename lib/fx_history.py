"""USD/KRW 차트 — Frankfurter 일/월봉"""

from __future__ import annotations

from datetime import date, timedelta

FRANKFURTER_URL = "https://api.frankfurter.app"

CHART_INTERVALS = {
    "1d": {"label": "1일", "days": 1},
    "1w": {"label": "1주일", "days": 7},
    "1mo": {"label": "1달", "days": 30},
    "1y": {"label": "1년", "days": 365},
    "10y": {"label": "10년", "months": 120},
}

_LEGACY = {"7d": "1w", "1M": "1mo", "1m": "1d", "10m": "1d", "30m": "1d"}


def _normalize_interval(interval: str) -> str:
    interval = (interval or "1w").strip()
    return _LEGACY.get(interval, interval)


def _fetch_frankfurter_range(start: date, end: date, http_get_json) -> dict:
    url = f"{FRANKFURTER_URL}/{start.isoformat()}..{end.isoformat()}?from=USD&to=KRW"
    return http_get_json(url, timeout=20)


def fetch_daily_chart(http_get_json, days: int = 7) -> dict:
    end = date.today()
    start = end - timedelta(days=max(days - 1, 0))
    try:
        data = _fetch_frankfurter_range(start, end, http_get_json)
        labels, values = [], []
        for day in sorted(data.get("rates", {}).keys()):
            d = date.fromisoformat(day)
            labels.append(f"{d.month}/{d.day}")
            values.append(data["rates"][day]["KRW"])
        return {"labels": labels, "data": values, "sparse": not values}
    except Exception:
        return {"labels": [], "data": [], "sparse": True}


def fetch_monthly_chart(http_get_json, months: int = 12) -> dict:
    end = date.today()
    start = end - timedelta(days=months * 31)
    try:
        data = _fetch_frankfurter_range(start, end, http_get_json)
        by_month: dict[str, float] = {}
        for day in sorted(data.get("rates", {}).keys()):
            ym = day[:7]
            by_month[ym] = data["rates"][day]["KRW"]
        labels = [ym.replace("-", "/") for ym in by_month.keys()]
        return {"labels": labels, "data": list(by_month.values()), "sparse": not labels}
    except Exception:
        return {"labels": [], "data": [], "sparse": True}


def fetch_fx_chart(interval: str, http_get_json) -> dict:
    interval = _normalize_interval(interval)
    meta = CHART_INTERVALS.get(interval, CHART_INTERVALS["1w"])

    if meta.get("months"):
        chart = fetch_monthly_chart(http_get_json, months=meta["months"])
    else:
        chart = fetch_daily_chart(http_get_json, days=meta["days"])

    chart["interval"] = interval
    chart["intervalLabel"] = meta["label"]
    chart["pair"] = "USD/KRW"
    chart["live"] = bool(chart["data"])
    return chart
