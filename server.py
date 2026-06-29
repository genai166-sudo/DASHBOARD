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
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "3000"))
TAVILY_URL = "https://api.tavily.com/search"
NAVER_NEWS_URL = "https://openapi.naver.com/v1/search/news.json"
EXCHANGE_RATE_API_URL = "https://v6.exchangerate-api.com/v6"
FRANKFURTER_URL = "https://api.frankfurter.app"

ALLOWED_BODY_KEYS = frozenset({
    "query", "search_depth", "topic", "days", "max_results",
    "include_images", "include_answer", "include_raw_content",
    "include_domains", "exclude_domains",
})


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
        with urllib.request.urlopen(req, timeout=30) as resp:
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
    usd_base = None
    source = "exchangerate-api"

    fx_key = get_fx_key()
    if fx_key:
        try:
            data = http_get_json(f"{EXCHANGE_RATE_API_URL}/{fx_key}/latest/USD")
            if data.get("result") == "success":
                usd_base = data.get("conversion_rates")
            else:
                print(
                    f"WARNING: ExchangeRate-API failed ({data.get('error-type', 'unknown')}) — Frankfurter fallback",
                    file=sys.stderr,
                )
        except RuntimeError as e:
            print(f"WARNING: ExchangeRate-API error ({e}) — Frankfurter fallback", file=sys.stderr)

    if not usd_base:
        try:
            data = http_get_json(f"{FRANKFURTER_URL}/latest?from=USD&to=KRW,EUR,JPY,CNY")
            usd_base = data.get("rates")
            source = "frankfurter"
        except RuntimeError as e:
            return 500, {"error": f"FX fetch failed: {e}"}

    try:
        current = calc_pair_rates(usd_base)
    except RuntimeError as e:
        return 502, {"error": str(e)}

    previous = None
    try:
        prev_date = (date.today() - timedelta(days=1)).isoformat()
        prev_data = http_get_json(f"{FRANKFURTER_URL}/{prev_date}?from=USD&to=KRW,EUR,JPY,CNY")
        if prev_data.get("rates"):
            previous = calc_pair_rates(prev_data["rates"])
    except RuntimeError:
        pass

    usd_trend = {"labels": [], "data": []}
    try:
        end = date.today()
        start = end - timedelta(days=6)
        hist = http_get_json(f"{FRANKFURTER_URL}/{start}..{end}?from=USD&to=KRW")
        for day in sorted(hist.get("rates", {}).keys()):
            d = date.fromisoformat(day)
            usd_trend["labels"].append(f"{d.month}/{d.day}")
            usd_trend["data"].append(hist["rates"][day]["KRW"])
    except RuntimeError:
        pass

    from datetime import datetime
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Asia/Seoul"))
    except Exception:
        now = datetime.now()
    updated = now.strftime("%Y-%m-%d %H:%M KST")

    return 200, {
        "updated": updated,
        "source": source,
        "rates": build_rate_rows(current, previous),
        "usdTrend": usd_trend,
    }


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
        self.send_error(404, "Not Found")

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
        if path == "/":
            self.path = "/index.html"
        elif path == "/weather":
            self.path = "/weather/weather.html"
        super().do_GET()


def main() -> None:
    load_env(ROOT / ".env")

    server = ThreadingHTTPServer(("127.0.0.1", PORT), DashboardHandler)
    print(f"Dashboard:  http://localhost:{PORT}")
    print(f"Tavily API: POST http://localhost:{PORT}/api/tavily/search")
    print(f"Naver API:  GET  http://localhost:{PORT}/api/naver/search?query=방산")
    print(f"FX API:     GET  http://localhost:{PORT}/api/fx/rates")

    if not get_tavily_key():
        print("WARNING: TAVILY_API_KEY not set", file=sys.stderr)
    client_id, client_secret = get_naver_credentials()
    if not client_id or not client_secret:
        print("WARNING: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET not set", file=sys.stderr)
    if not get_fx_key():
        print("WARNING: EXCHANGERATE_API_KEY not set — Frankfurter fallback for FX", file=sys.stderr)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
