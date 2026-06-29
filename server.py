#!/usr/bin/env python3
"""
로컬 개발 서버 (Python 표준 라이브러리만 사용)
- 정적 파일 + Tavily / 환율 API 프록시

실행: python server.py
접속: http://localhost:3000
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "lib"))
from worldbank_proxy import fetch_worldbank_stats  # noqa: E402
from gemini_proxy import analyze_defense_news, get_gemini_key  # noqa: E402
from prompt_loader import KNOWN_PROMPTS  # noqa: E402
from fx_history import fetch_fx_chart, record_snapshot  # noqa: E402
PORT = int(os.environ.get("PORT", "3000"))
TAVILY_URL = "https://api.tavily.com/search"
NAVER_NEWS_URL = "https://openapi.naver.com/v1/search/news.json"
EXCHANGE_RATE_API_URL = "https://v6.exchangerate-api.com/v6"
OPEN_ER_API_URL = "https://open.er-api.com/v6/latest/USD"
FRANKFURTER_URL = "https://api.frankfurter.app"

ALLOWED_BODY_KEYS = frozenset({
    "query", "search_depth", "topic", "days", "max_results",
    "include_images", "include_answer", "include_raw_content",
    "include_domains", "exclude_domains",
})

_response_cache: dict[str, tuple[float, object]] = {}


def cache_get(key: str, ttl_sec: int):
    entry = _response_cache.get(key)
    if not entry:
        return None
    ts, value = entry
    if time.time() - ts > ttl_sec:
        _response_cache.pop(key, None)
        return None
    return value


def cache_set(key: str, value: object) -> None:
    _response_cache[key] = (time.time(), value)


def load_env(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if not key or not value:
            continue
        existing = os.environ.get(key, "").strip()
        if key not in os.environ or not existing:
            os.environ[key] = value


def http_get_json(url: str, timeout: int = 30) -> dict:
    req = urllib.request.Request(
        url,
        method="GET",
        headers={"User-Agent": "LIG-Dashboard/1.0 (fx-proxy)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
            message = detail.get("message") or detail.get("error") or raw
        except json.JSONDecodeError:
            message = raw
        raise RuntimeError(str(message)) from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Connection failed: {e.reason}") from e


def get_tavily_key() -> str:
    return os.environ.get("TAVILY_API_KEY", "").strip().strip('"').strip("'")


def get_fx_key() -> str:
    return os.environ.get("EXCHANGERATE_API_KEY", "").strip().strip('"').strip("'")


def get_naver_credentials() -> tuple[str, str]:
    client_id = os.environ.get("NAVER_CLIENT_ID", "").strip().strip('"').strip("'")
    client_secret = os.environ.get("NAVER_CLIENT_SECRET", "").strip().strip('"').strip("'")
    return client_id, client_secret


def http_get_json_headers(url: str, headers: dict, timeout: int = 30) -> dict:
    req = urllib.request.Request(
        url,
        method="GET",
        headers={**headers, "User-Agent": headers.get("User-Agent", "LIG-Dashboard/1.0")},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
            message = detail.get("errorMessage") or detail.get("message") or detail.get("error") or raw
        except json.JSONDecodeError:
            message = raw or "HTTP request failed"
        raise RuntimeError(str(message)) from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Connection failed: {e.reason}") from e


def pick_allowed_fields(body: dict) -> dict:
    return {k: body[k] for k in ALLOWED_BODY_KEYS if k in body}


def tavily_search(body: dict) -> tuple[int, dict]:
    api_key = get_tavily_key()
    if not api_key:
        return 500, {"error": "TAVILY_API_KEY is not configured on the server"}

    query = body.get("query")
    if not query or not isinstance(query, str):
        return 400, {"error": "query is required"}

    payload = json.dumps({"api_key": api_key, **pick_allowed_fields(body)}).encode("utf-8")
    req = urllib.request.Request(
        TAVILY_URL, data=payload,
        headers={"Content-Type": "application/json"}, method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 200, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
            message = detail.get("detail") or detail.get("error") or detail.get("message") or raw
            if isinstance(message, dict):
                message = message.get("error") or str(message)
        except json.JSONDecodeError:
            message = raw or "Tavily API request failed"
        return e.code, {"error": str(message)}
    except urllib.error.URLError as e:
        return 502, {"error": f"Tavily connection failed: {e.reason}"}


def naver_news_search(params: dict) -> tuple[int, dict]:
    client_id, client_secret = get_naver_credentials()
    if not client_id or not client_secret:
        return 500, {"error": "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET is not configured on the server"}

    query = params.get("query")
    if not query or not isinstance(query, str) or not query.strip():
        return 400, {"error": "query is required"}

    try:
        display = min(max(int(params.get("display", 10)), 1), 100)
        start = min(max(int(params.get("start", 1)), 1), 1000)
    except (TypeError, ValueError):
        return 400, {"error": "display and start must be numbers"}

    sort = "sim" if params.get("sort") == "sim" else "date"
    qs = urllib.parse.urlencode({
        "query": query.strip(),
        "display": display,
        "start": start,
        "sort": sort,
    })
    url = f"{NAVER_NEWS_URL}?{qs}"
    headers = {
        "X-Naver-Client-Id": client_id,
        "X-Naver-Client-Secret": client_secret,
        "User-Agent": "LIG-Dashboard/1.0 (naver-proxy)",
    }

    try:
        return 200, http_get_json_headers(url, headers)
    except RuntimeError as e:
        msg = str(e)
        if "401" in msg or "403" in msg or "Unauthorized" in msg:
            return 401, {"error": msg}
        return 502, {"error": msg}


def calc_pair_rates(usd_base: dict) -> dict:
    krw = usd_base.get("KRW")
    if not krw:
        raise RuntimeError("KRW rate unavailable")
    eur, jpy, cny = usd_base.get("EUR"), usd_base.get("JPY"), usd_base.get("CNY")
    return {
        "KRW": krw,
        "EUR": krw / eur if eur else None,
        "JPY": krw / jpy if jpy else None,
        "CNY": krw / cny if cny else None,
    }


def build_rate_rows(current: dict, previous: dict | None) -> list:
    pairs = [
        ("USD/KRW", "KRW", 2),
        ("EUR/KRW", "EUR", 2),
        ("JPY/KRW", "JPY", 2),
        ("CNY/KRW", "CNY", 2),
    ]
    rows = []
    for label, key, decimals in pairs:
        if current.get(key) is None:
            continue
        value = round(current[key], decimals)
        prev = previous.get(key) if previous else None
        change = round(value - prev, decimals) if prev is not None else 0
        change_pct = round((change / prev) * 100, 2) if prev else 0
        rows.append({
            "pair": label,
            "value": value,
            "change": change,
            "changePct": change_pct,
        })
    return rows


def fetch_fx_rates() -> tuple[int, dict]:
    cached = cache_get("fx_rates", 300)
    if cached:
        return cached

    usd_base = None
    source = "open.er-api"

    try:
        data = http_get_json(OPEN_ER_API_URL, timeout=12)
        if data.get("result") == "success":
            usd_base = data.get("rates")
    except RuntimeError as e:
        print(f"WARNING: open.er-api error ({e})", file=sys.stderr)

    fx_key = get_fx_key()
    if not usd_base and fx_key:
        try:
            data = http_get_json(f"{EXCHANGE_RATE_API_URL}/{fx_key}/latest/USD", timeout=5)
            if data.get("result") == "success":
                usd_base = data.get("conversion_rates")
                source = "exchangerate-api"
        except RuntimeError as e:
            print(f"WARNING: ExchangeRate-API error ({e})", file=sys.stderr)

    if not usd_base:
        try:
            data = http_get_json(f"{FRANKFURTER_URL}/latest?from=USD&to=KRW,EUR,JPY,CNY", timeout=12)
            usd_base = data.get("rates")
            source = "frankfurter"
        except RuntimeError as e:
            return 500, {"error": f"FX fetch failed: {e}"}

    try:
        current = calc_pair_rates(usd_base)
    except RuntimeError as e:
        return 502, {"error": str(e)}

    record_snapshot(current["KRW"])

    previous = None
    usd_trend = {"labels": [], "data": []}
    prev_date = (date.today() - timedelta(days=1)).isoformat()
    end = date.today()
    start = end - timedelta(days=6)

    def _fetch_prev():
        return http_get_json(
            f"{FRANKFURTER_URL}/{prev_date}?from=USD&to=KRW,EUR,JPY,CNY", timeout=8
        )

    def _fetch_hist():
        return http_get_json(
            f"{FRANKFURTER_URL}/{start}..{end}?from=USD&to=KRW", timeout=8
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {
            pool.submit(_fetch_prev): "prev",
            pool.submit(_fetch_hist): "hist",
        }
        for fut in as_completed(futures, timeout=10):
            kind = futures[fut]
            try:
                data = fut.result()
                if kind == "prev" and data.get("rates"):
                    previous = calc_pair_rates(data["rates"])
                elif kind == "hist":
                    for day in sorted(data.get("rates", {}).keys()):
                        d = date.fromisoformat(day)
                        usd_trend["labels"].append(f"{d.month}/{d.day}")
                        usd_trend["data"].append(data["rates"][day]["KRW"])
            except Exception:
                pass

    from datetime import datetime
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Asia/Seoul"))
    except Exception:
        now = datetime.now()
    updated = now.strftime("%Y-%m-%d %H:%M KST")

    result = (200, {
        "updated": updated,
        "source": source,
        "live": True,
        "rates": build_rate_rows(current, previous),
        "usdTrend": usd_trend,
    })
    cache_set("fx_rates", result)
    return result


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:
        path = self.path.split("?")[0]
        if path == "/api/tavily/search":
            self.handle_tavily_search()
            return
        if path == "/api/naver/search":
            self.handle_naver_search_post()
            return
        if path == "/api/gemini/analyze":
            self.handle_gemini_analyze()
            return
        self.send_error(404, "Not Found")

    def handle_gemini_analyze(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        if length > 500_000:
            self.send_json(413, {"error": "Payload too large"})
            return
        try:
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Invalid JSON"})
            return
        status, data = analyze_defense_news(body)
        self.send_json(status, data)

    def handle_naver_search_post(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        try:
            raw = self.rfile.read(length).decode("utf-8") if length else "{}"
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Invalid JSON"})
            return
        status, data = naver_news_search(body)
        self.send_json(status, data)

    def handle_tavily_search(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        if length > 1_000_000:
            self.send_json(413, {"error": "Payload too large"})
            return
        try:
            raw = self.rfile.read(length).decode("utf-8")
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Invalid JSON"})
            return
        status, data = tavily_search(body)
        self.send_json(status, data)

    def send_json(self, status: int, data: dict) -> None:
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self) -> None:
        path = self.path.split("?")[0]
        if path == "/api/health":
            client_id, client_secret = get_naver_credentials()
            self.send_json(200, {
                "ok": True,
                "runtime": "python",
                "tavilyConfigured": bool(get_tavily_key()),
                "fxConfigured": bool(get_fx_key()),
                "naverConfigured": bool(client_id and client_secret),
                "geminiConfigured": bool(get_gemini_key()),
            })
            return
        if path == "/api/naver/search":
            parsed = urllib.parse.urlparse(self.path)
            params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
            status, data = naver_news_search(params)
            self.send_json(status, data)
            return
        if path == "/api/fx/rates":
            status, data = fetch_fx_rates()
            self.send_json(status, data)
            return
        if path == "/api/fx/chart":
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            interval = (qs.get("interval", ["1d"])[0] or "1d").strip()
            if interval not in {"1m", "10m", "30m", "1d", "1M"}:
                self.send_json(400, {"error": "interval must be 1m, 10m, 30m, 1d, or 1M"})
                return
            chart = fetch_fx_chart(interval, http_get_json)
            self.send_json(200, chart)
            return
        if path == "/api/stats/worldbank":
            cached = cache_get("worldbank_stats", 900)
            if cached:
                self.send_json(200, cached)
                return
            try:
                data = fetch_worldbank_stats()
                cache_set("worldbank_stats", data)
                self.send_json(200, data)
            except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, KeyError, IndexError) as e:
                self.send_json(502, {"error": f"World Bank fetch failed: {e}"})
            return
        if path == "/":
            self.path = "/index.html"
        elif path == "/weather":
            self.path = "/weather/weather.html"
        super().do_GET()


def fx_snapshot_worker() -> None:
    while True:
        try:
            data = http_get_json(OPEN_ER_API_URL, timeout=10)
            if data.get("result") == "success":
                krw = (data.get("rates") or {}).get("KRW")
                if krw:
                    record_snapshot(krw)
                    time.sleep(60)
                    continue
        except Exception:
            pass
        time.sleep(60)


def main() -> None:
    load_env(ROOT / ".env")

    server = ThreadingHTTPServer(("127.0.0.1", PORT), DashboardHandler)
    print(f"Dashboard:  http://localhost:{PORT}")
    print(f"Tavily API: POST http://localhost:{PORT}/api/tavily/search")
    print(f"Naver API:  GET  http://localhost:{PORT}/api/naver/search?query=방산")
    print(f"FX API:     GET  http://localhost:{PORT}/api/fx/rates")
    print(f"FX Chart:   GET  http://localhost:{PORT}/api/fx/chart?interval=1d")
    print(f"Stats API:  GET  http://localhost:{PORT}/api/stats/worldbank")
    print(f"Gemini API: POST http://localhost:{PORT}/api/gemini/analyze")
    print(f"Prompts:    prompt/ ({', '.join(KNOWN_PROMPTS)})")

    if not get_tavily_key():
        print("WARNING: TAVILY_API_KEY not set", file=sys.stderr)
    client_id, client_secret = get_naver_credentials()
    if not client_id or not client_secret:
        print("WARNING: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET not set", file=sys.stderr)
    if not get_gemini_key():
        print("WARNING: GEMINI_API_KEY not set", file=sys.stderr)
    if not get_fx_key():
        print("WARNING: EXCHANGERATE_API_KEY not set — Frankfurter fallback for FX", file=sys.stderr)

    threading.Thread(target=fx_snapshot_worker, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
