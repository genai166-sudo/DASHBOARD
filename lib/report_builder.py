"""HTML 브리핑 보고서 생성 · 저장 · 카카오 링크 메시지"""

from __future__ import annotations

import base64
import html
import json
import os
import random
import re
import string
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "reports"


def _is_serverless() -> bool:
    return bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))


def _can_persist_reports() -> bool:
    return not _is_serverless()


def _trunc(s: str, n: int) -> str:
    s = re.sub(r"\s+", " ", (s or "").strip())
    if len(s) <= n:
        return s
    return s[: n - 1] + "…"


def _format_updated() -> str:
    try:
        from zoneinfo import ZoneInfo

        now = datetime.now(ZoneInfo("Asia/Seoul"))
    except Exception:
        now = datetime.now()
    return now.strftime("%Y-%m-%d %H:%M KST")


def _generate_report_id() -> str:
    now = datetime.now()
    stamp = now.strftime("%Y%m%d-%H%M%S")
    rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=4))
    return f"{stamp}-{rand}"


def _encode_report_payload(payload: dict) -> str:
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return "e" + base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_report_payload(report_id: str) -> dict | None:
    if not report_id or not str(report_id).startswith("e"):
        return None
    try:
        padded = str(report_id)[1:]
        pad = "=" * (-len(padded) % 4)
        raw = base64.urlsafe_b64decode(padded + pad)
        return json.loads(raw.decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None


def normalize_report_payload(raw: dict | None) -> dict | None:
    if not raw or not isinstance(raw, dict):
        return None
    tavily = raw.get("tavilyNews") or []
    naver = raw.get("naverNews") or []
    bids = raw.get("bids") or []
    return {
        "generatedAt": raw.get("generatedAt") or _format_updated(),
        "fx": raw.get("fx"),
        "tavilyNews": tavily,
        "naverNews": naver,
        "bids": bids,
        "ai": raw.get("ai"),
        "tavilyCount": raw.get("tavilyCount", len(tavily)),
        "naverCount": raw.get("naverCount", len(naver)),
        "bidsCount": raw.get("bidsCount", len(bids)),
    }


def build_report_headline(data: dict) -> str:
    parts = ["◈ 방산 브리핑"]

    fx = data.get("fx") or {}
    usd = next((r for r in fx.get("rates", []) if r.get("pair") == "USD/KRW"), None)
    if usd:
        sign = "+" if usd.get("change", 0) >= 0 else ""
        parts.append(f"USD/KRW {usd['value']:,.2f}({sign}{usd.get('changePct', 0):.2f}%)")

    news_total = (data.get("tavilyCount") or 0) + (data.get("naverCount") or 0)
    if news_total:
        parts.append(f"뉴스 {news_total}건")

    if data.get("bidsCount"):
        parts.append(f"입찰 {data['bidsCount']}건")

    ai = data.get("ai") or {}
    if ai.get("sentimentLabel"):
        parts.append(ai["sentimentLabel"])

    return _trunc(" · ".join(parts), 120)


def build_report_html(data: dict) -> str:
    generated_at = html.escape(data.get("generatedAt") or _format_updated())
    insight_prefix = {"opportunity": "▲", "risk": "⚠", "watch": "◉"}

    fx_rows = []
    for r in (data.get("fx") or {}).get("rates") or []:
        sign = "+" if r.get("change", 0) >= 0 else ""
        direction = "up" if r.get("change", 0) >= 0 else "down"
        fx_rows.append(
            f"<tr><td>{html.escape(str(r.get('pair', '—')))}</td>"
            f"<td class='num'>{r.get('value', 0):,.2f}</td>"
            f"<td class='num {direction}'>{sign}{r.get('change', 0)} ({sign}{r.get('changePct', 0):.2f}%)</td></tr>"
        )

    tavily_items = []
    for n in data.get("tavilyNews") or []:
        url = html.escape(n.get("url") or n.get("source") or "#")
        title = html.escape(n.get("title") or "")
        summary = html.escape(n.get("summary") or "")
        block = f"<li><a href='{url}' target='_blank' rel='noopener'>{title}</a>"
        if summary:
            block += f"<p>{summary}</p>"
        block += "</li>"
        tavily_items.append(block)

    naver_items = []
    for n in data.get("naverNews") or []:
        title = html.escape(n.get("title") or "")
        summary = html.escape(n.get("summary") or "")
        block = f"<li><strong>{title}</strong>"
        if summary:
            block += f"<p>{summary}</p>"
        block += "</li>"
        naver_items.append(block)

    bid_rows = []
    for b in data.get("bids") or []:
        bid_rows.append(
            "<tr>"
            f"<td>{html.escape(str(b.get('title', '')))}</td>"
            f"<td>{html.escape(str(b.get('agency', '—')))}</td>"
            f"<td>{html.escape(str(b.get('deadline', '—')))}</td>"
            f"<td>{html.escape(str(b.get('budget', '—')))}</td>"
            "</tr>"
        )

    ai = data.get("ai")
    if ai:
        insights = []
        for ins in ai.get("insights") or []:
            prefix = insight_prefix.get(ins.get("type"), "•")
            insights.append(
                f"<li class='insight insight--{html.escape(str(ins.get('type', '')))}'>"
                f"{prefix} {html.escape(str(ins.get('text', '')))}</li>"
            )
        scores = [
            f"<span class='score'><b>{html.escape(str(s.get('name', '')))}</b> {html.escape(str(s.get('score', '')))}</span>"
            for s in ai.get("sectorScores") or []
        ]
        ai_section = (
            "<div class='ai-top'>"
            f"<span class='badge badge--{html.escape(str(ai.get('sentiment', 'neutral')))}'>"
            f"{html.escape(str(ai.get('sentimentLabel') or '분석'))}</span>"
            f"<span class='muted'>신뢰도 {html.escape(str(ai.get('confidence', '—')))}%</span>"
            "</div>"
            f"<p class='ai-summary'>{html.escape(str(ai.get('summary') or ''))}</p>"
            f"<ul class='insights'>{''.join(insights)}</ul>"
            f"<div class='scores'>{''.join(scores)}</div>"
        )
    else:
        ai_section = "<p class='muted'>AI 분석 데이터 없음</p>"

    fx_table = (
        f"<table><thead><tr><th>통화</th><th>환율</th><th>전일 대비</th></tr></thead><tbody>{''.join(fx_rows)}</tbody></table>"
        if fx_rows
        else "<p class='muted'>환율 데이터 없음</p>"
    )
    bid_table = (
        f"<table><thead><tr><th>공고명</th><th>기관</th><th>마감</th><th>예산</th></tr></thead><tbody>{''.join(bid_rows)}</tbody></table>"
        if bid_rows
        else "<p class='muted'>입찰공고 없음</p>"
    )

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>방산 동향 브리핑 · {generated_at}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet"/>
  <style>
    :root {{
      --bg: #0a0e14; --panel: #151c26; --border: #243044;
      --text: #e8edf4; --muted: #8b9cb3; --accent: #3dd68c;
      --warn: #f0a030; --danger: #e85555;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: "Noto Sans KR", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 1.5rem;
      max-width: 920px;
      margin: 0 auto;
    }}
    header {{
      border-bottom: 1px solid var(--border);
      padding-bottom: 1rem;
      margin-bottom: 1.5rem;
    }}
    h1 {{ font-size: 1.4rem; margin-bottom: 0.35rem; }}
    .meta {{ color: var(--muted); font-size: 0.85rem; font-family: "JetBrains Mono", monospace; }}
    section {{
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.1rem 1.25rem;
      margin-bottom: 1rem;
    }}
    h2 {{ font-size: 1rem; margin-bottom: 0.75rem; color: var(--accent); }}
    table {{ width: 100%; border-collapse: collapse; font-size: 0.9rem; }}
    th, td {{ padding: 0.5rem 0.4rem; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }}
    th {{ color: var(--muted); font-weight: 500; font-size: 0.8rem; }}
    .num {{ font-family: "JetBrains Mono", monospace; text-align: right; }}
    .up {{ color: var(--accent); }}
    .down {{ color: var(--danger); }}
    ul.news {{ list-style: none; }}
    ul.news li {{ padding: 0.65rem 0; border-bottom: 1px solid var(--border); }}
    ul.news li:last-child {{ border-bottom: none; }}
    ul.news a {{ color: var(--text); text-decoration: none; font-weight: 500; }}
    ul.news a:hover {{ color: var(--accent); }}
    ul.news p {{ color: var(--muted); font-size: 0.85rem; margin-top: 0.35rem; }}
    .ai-top {{ display: flex; gap: 1rem; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; }}
    .badge {{
      display: inline-block; padding: 0.2rem 0.55rem; border-radius: 4px;
      font-size: 0.8rem; font-weight: 600; background: rgba(61,214,140,0.15); color: var(--accent);
    }}
    .badge--negative {{ background: rgba(232,85,85,0.15); color: var(--danger); }}
    .badge--neutral {{ background: rgba(240,160,48,0.15); color: var(--warn); }}
    .ai-summary {{ margin-bottom: 0.75rem; }}
    .insights {{ list-style: none; margin-bottom: 0.75rem; }}
    .insights li {{ padding: 0.35rem 0; font-size: 0.9rem; }}
    .insight--risk {{ color: var(--danger); }}
    .insight--watch {{ color: var(--warn); }}
    .scores {{ display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; font-size: 0.85rem; color: var(--muted); }}
    .score b {{ color: var(--text); }}
    .muted {{ color: var(--muted); font-size: 0.85rem; }}
    footer {{ margin-top: 1.5rem; text-align: center; color: var(--muted); font-size: 0.8rem; }}
    footer a {{ color: var(--accent); }}
  </style>
</head>
<body>
  <header>
    <h1>◈ 방산 동향 브리핑 보고서</h1>
    <p class="meta">{generated_at} · Defense Trends Dashboard</p>
  </header>
  <section><h2>💱 환율</h2>{fx_table}</section>
  <section>
    <h2>📰 방산 뉴스</h2>
    <h3 class="muted" style="margin-bottom:0.5rem;font-size:0.85rem">국외 (Tavily)</h3>
    {f"<ul class='news'>{''.join(tavily_items)}</ul>" if tavily_items else "<p class='muted'>국외 뉴스 없음</p>"}
    <h3 class="muted" style="margin:1rem 0 0.5rem;font-size:0.85rem">국내 (Naver)</h3>
    {f"<ul class='news'>{''.join(naver_items)}</ul>" if naver_items else "<p class='muted'>국내 뉴스 없음</p>"}
  </section>
  <section><h2>📋 입찰 · 조달</h2>{bid_table}</section>
  <section><h2>🤖 AI 분석</h2>{ai_section}</section>
  <footer><p>LIG Defense Trends Dashboard · <a href="/">대시보드로 이동</a></p></footer>
</body>
</html>"""


def _save_report_payload(report_id: str, payload: dict) -> bool:
    if not _can_persist_reports():
        return False
    try:
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        (REPORTS_DIR / f"{report_id}.json").write_text(
            json.dumps(payload, ensure_ascii=False),
            encoding="utf-8",
        )
        return True
    except OSError:
        return False


def load_report_payload(report_id: str) -> dict | None:
    decoded = _decode_report_payload(report_id)
    if decoded:
        return normalize_report_payload(decoded)

    if not _can_persist_reports():
        return None
    path = REPORTS_DIR / f"{report_id}.json"
    if not path.is_file():
        return None
    try:
        return normalize_report_payload(json.loads(path.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, OSError):
        return None


def publish_report(detail: dict, public_url: str) -> dict:
    payload = normalize_report_payload({
        "generatedAt": _format_updated(),
        "fx": detail.get("fx"),
        "tavilyNews": detail.get("tavilyNews") or [],
        "naverNews": detail.get("naverNews") or [],
        "bids": detail.get("bids") or [],
        "ai": detail.get("ai"),
        "tavilyCount": detail.get("tavilyCount", 0),
        "naverCount": detail.get("naverCount", 0),
        "bidsCount": detail.get("bidsCount", 0),
    }) or {}

    base = public_url.rstrip("/")
    report_id = _generate_report_id()
    if _save_report_payload(report_id, payload):
        return {"id": report_id, "url": f"{base}/reports/{report_id}.html", "payload": payload}

    report_id = _encode_report_payload(payload)
    return {"id": report_id, "url": f"{base}/reports/{report_id}.html", "payload": payload}


def build_kakao_report_message(headline: str, report_url: str, dashboard_url: str) -> dict:
    link = {"web_url": report_url, "mobile_web_url": report_url}
    dash_link = {"web_url": dashboard_url, "mobile_web_url": dashboard_url}
    return {
        "object_type": "feed",
        "content": {
            "title": _trunc(headline, 80),
            "description": "방산·환율·뉴스·입찰·AI 분석 상세 보고서",
            "link": link,
        },
        "buttons": [
            {"title": "보고서 열기", "link": link},
            {"title": "대시보드", "link": dash_link},
        ],
    }
