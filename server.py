#!/usr/bin/env python3
"""
로컬 개발 서버 (Python 표준 라이브러리만 사용)
- 정적 파일 제공 (index.html, weather/ 등)
- POST /api/tavily/search → Tavily 프록시 (.env 의 TAVILY_API_KEY)

실행: python server.py
접속: http://localhost:3000
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORT", "3000"))
TAVILY_URL = "https://api.tavily.com/search"

ALLOWED_BODY_KEYS = frozenset({
    "query",
    "search_depth",
    "topic",
    "days",
    "max_results",
    "include_images",
    "include_answer",
    "include_raw_content",
    "include_domains",
    "exclude_domains",
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
        if key and key not in os.environ:
            os.environ[key] = value


def pick_allowed_fields(body: dict) -> dict:
    return {k: body[k] for k in ALLOWED_BODY_KEYS if k in body}


def tavily_search(body: dict) -> tuple[int, dict]:
    api_key = os.environ.get("TAVILY_API_KEY", "").strip()
    if not api_key:
        return 500, {"error": "TAVILY_API_KEY is not configured on the server"}

    query = body.get("query")
    if not query or not isinstance(query, str):
        return 400, {"error": "query is required"}

    payload = {"api_key": api_key, **pick_allowed_fields(body)}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        TAVILY_URL,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            return 200, result
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
            message = detail.get("detail") or detail.get("error") or raw
        except json.JSONDecodeError:
            message = raw or "Tavily API request failed"
        return e.code, {"error": str(message)}
    except urllib.error.URLError as e:
        return 502, {"error": f"Tavily connection failed: {e.reason}"}


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
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:
        if self.path.split("?")[0] == "/api/tavily/search":
            self.handle_tavily_search()
            return
        self.send_error(404, "Not Found")

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

    if not os.environ.get("TAVILY_API_KEY"):
        print("WARNING: TAVILY_API_KEY not set — copy .env.example to .env and add your key", file=sys.stderr)
    else:
        print("TAVILY_API_KEY loaded from .env")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
