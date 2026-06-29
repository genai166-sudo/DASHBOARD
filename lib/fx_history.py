"""USD/KRW 차트 — 분봉 스냅샷 + Frankfurter 일/월봉"""

from __future__ import annotations

import json
import threading
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SNAPSHOT_FILE = ROOT / ".data" / "fx-snapshots.json"
FRANKFURTER_URL = "https://api.frankfurter.app"

MAX_SNAPSHOTS = 60 * 24 * 7  # 7일 분봉
_lock = threading.Lock()

INTERVALS = {
    "1m": {"bucket_min": 1, "lookback_min": 60, "label": "1분"},
    "10m": {"bucket_min": 10, "lookback_min": 24 * 60, "label": "10분"},
    "30m": {"bucket_min": 30, "lookback_min": 3 * 24 * 60, "label": "30분"},
}


def _ensure_data_dir() -> None:
    SNAPSHOT_FILE.parent.mkdir(parents=True, exist_ok=True)


def load_snapshots() -> list[dict]:
    _ensure_data_dir()
    if not SNAPSHOT_FILE.is_file():
        return []
    try:
        raw = json.loads(SNAPSHOT_FILE.read_text(encoding="utf-8"))
        if isinstance(raw, list):
            return [s for s in raw if isinstance(s.get("ts"), (int, float)) and isinstance(s.get("krw"), (int, float))]
    except (json.JSONDecodeError, OSError):
        pass
    return []


def save_snapshots(snapshots: list[dict]) -> None:
    _ensure_data_dir()
    trimmed = snapshots[-MAX_SNAPSHOTS:]
    SNAPSHOT_FILE.write_text(json.dumps(trimmed), encoding="utf-8")


def record_snapshot(krw: float) -> None:
    if not krw or krw <= 0:
        return
    now_ms = int(datetime.now().timestamp() * 1000)
    minute_ms = (now_ms // 60_000) * 60_000

    with _lock:
        snapshots = load_snapshots()
        if snapshots and snapshots[-1].get("ts") == minute_ms:
            snapshots[-1]["krw"] = round(krw, 2)
        else:
            snapshots.append({"ts": minute_ms, "krw": round(krw, 2)})
        save_snapshots(snapshots)


def _aggregate_intraday(snapshots: list[dict], bucket_min: int, lookback_min: int) -> dict:
    if not snapshots:
        return {"labels": [], "data": [], "sparse": True}

    cutoff = int(datetime.now().timestamp() * 1000) - lookback_min * 60_000
    bucket_ms = bucket_min * 60_000
    recent = [s for s in snapshots if s["ts"] >= cutoff]
    if not recent:
        return {"labels": [], "data": [], "sparse": True}

    buckets: dict[int, float] = {}
    for s in recent:
        key = (s["ts"] // bucket_ms) * bucket_ms
        buckets[key] = s["krw"]

    keys = sorted(buckets.keys())
    labels = []
    for ts in keys:
        dt = datetime.fromtimestamp(ts / 1000)
        if bucket_min >= 30:
            labels.append(dt.strftime("%m/%d %H:%M"))
        elif bucket_min >= 10:
            labels.append(dt.strftime("%H:%M"))
        else:
            labels.append(dt.strftime("%H:%M"))

    return {
        "labels": labels,
        "data": [buckets[k] for k in keys],
        "sparse": len(keys) == 0,
    }


def _fetch_frankfurter_range(start: date, end: date, http_get_json) -> dict:
    url = f"{FRANKFURTER_URL}/{start.isoformat()}..{end.isoformat()}?from=USD&to=KRW"
    return http_get_json(url, timeout=15)


def fetch_daily_chart(http_get_json, days: int = 90) -> dict:
    end = date.today()
    start = end - timedelta(days=days - 1)
    try:
        data = _fetch_frankfurter_range(start, end, http_get_json)
        labels, values = [], []
        for day in sorted(data.get("rates", {}).keys()):
            d = date.fromisoformat(day)
            labels.append(f"{d.month}/{d.day}")
            values.append(data["rates"][day]["KRW"])
        return {"labels": labels, "data": values, "sparse": False}
    except Exception:
        return {"labels": [], "data": [], "sparse": True}


def fetch_monthly_chart(http_get_json, months: int = 24) -> dict:
    end = date.today()
    start = end - timedelta(days=months * 31)
    try:
        data = _fetch_frankfurter_range(start, end, http_get_json)
        by_month: dict[str, float] = {}
        for day in sorted(data.get("rates", {}).keys()):
            ym = day[:7]
            by_month[ym] = data["rates"][day]["KRW"]
        labels = [ym.replace("-", "/") for ym in by_month.keys()]
        return {"labels": labels, "data": list(by_month.values()), "sparse": False}
    except Exception:
        return {"labels": [], "data": [], "sparse": True}


def fetch_fx_chart(interval: str, http_get_json) -> dict:
    interval = interval or "1d"
    meta = INTERVALS.get(interval)

    if meta:
        with _lock:
            snapshots = load_snapshots()
        chart = _aggregate_intraday(snapshots, meta["bucket_min"], meta["lookback_min"])
        chart["interval"] = interval
        chart["intervalLabel"] = meta["label"]
        chart["pair"] = "USD/KRW"
        chart["live"] = bool(chart["data"])
        return chart

    if interval == "7d":
        chart = fetch_daily_chart(http_get_json, days=7)
        with _lock:
            snapshots = load_snapshots()
        if snapshots:
            today_label = f"{date.today().month}/{date.today().day}"
            live_krw = snapshots[-1]["krw"]
            if chart["data"] and chart["labels"][-1] != today_label:
                chart["labels"].append(today_label)
                chart["data"].append(live_krw)
            elif not chart["data"]:
                chart["labels"] = [today_label]
                chart["data"] = [live_krw]
                chart["sparse"] = False
        chart["interval"] = "7d"
        chart["intervalLabel"] = "7일"
        chart["pair"] = "USD/KRW"
        chart["live"] = bool(chart["data"])
        return chart

    if interval == "1M":
        chart = fetch_monthly_chart(http_get_json)
        chart["interval"] = "1M"
        chart["intervalLabel"] = "1월"
        chart["pair"] = "USD/KRW"
        chart["live"] = bool(chart["data"])
        return chart

    chart = fetch_daily_chart(http_get_json, days=90)
    chart["interval"] = "1d"
    chart["intervalLabel"] = "1일"
    chart["pair"] = "USD/KRW"
    chart["live"] = bool(chart["data"])
    return chart
