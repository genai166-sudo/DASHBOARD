"""대시보드 환율·뉴스·입찰·AI 요약 텍스트 생성"""

from __future__ import annotations

import re
from datetime import datetime


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


def _build_fx_description(fx: dict | None) -> str:
    if not fx or not fx.get("rates"):
        return "환율 데이터 없음"

    lines = []
    for r in fx["rates"]:
        sign = "+" if r.get("change", 0) >= 0 else ""
        lines.append(
            f"{r.get('pair', '—')} {r.get('value', 0):,.2f} ({sign}{r.get('changePct', 0):.2f}%)"
        )
    return "\n".join(lines)


def _build_news_description(
    tavily_titles: list[str] | None,
    naver_titles: list[str] | None,
) -> str:
    lines: list[str] = []

    for title in (tavily_titles or [])[:2]:
        if title:
            lines.append(f"🌍 {_trunc(title, 72)}")
    for title in (naver_titles or [])[:2]:
        if title:
            lines.append(f"🇰🇷 {_trunc(title, 72)}")

    total = len(tavily_titles or []) + len(naver_titles or [])
    if total > len(lines):
        lines.append(f"외 {total - len(lines)}건 더")

    return "\n".join(lines) if lines else "뉴스 수집 없음"


def _build_bid_ai_description(bids: list[dict] | None, ai: dict | None) -> str:
    lines: list[str] = []

    for bid in (bids or [])[:2]:
        lines.append(f"📋 {_trunc(bid.get('title', ''), 68)} ({bid.get('deadline', '—')})")
    if bids and len(bids) > 2:
        lines.append(f"입찰공고 외 {len(bids) - 2}건")

    if ai:
        conf = ai.get("confidence", "—")
        lines.append(f"🤖 {ai.get('sentimentLabel') or 'AI 분석'} (신뢰도 {conf}%)")
        if ai.get("summary"):
            lines.append(_trunc(ai["summary"], 180))
        insights = ai.get("insights") or []
        insight = next((i for i in insights if i.get("type") == "opportunity"), None)
        if not insight and insights:
            insight = insights[0]
        if insight and insight.get("text"):
            lines.append(f"💡 {_trunc(insight['text'], 100)}")

    return "\n".join(lines) if lines else "입찰·AI 데이터 없음"


def build_kakao_list_template(
    *,
    fx: dict | None = None,
    tavily_titles: list[str] | None = None,
    naver_titles: list[str] | None = None,
    bids: list[dict] | None = None,
    ai: dict | None = None,
    web_url: str = "http://localhost:3000",
) -> dict:
    link = {"web_url": web_url, "mobile_web_url": web_url}
    updated = _format_updated()

    header_title = f"◈ 방산 대시보드 브리핑 · {updated}"
    if ai and ai.get("sentimentLabel"):
        header_title += f" · {ai['sentimentLabel']}"

    return {
        "object_type": "list",
        "header_title": _trunc(header_title, 200),
        "header_link": link,
        "contents": [
            {
                "title": "💱 환율",
                "description": _trunc(_build_fx_description(fx), 280),
                "link": link,
            },
            {
                "title": "📰 방산 뉴스",
                "description": _trunc(
                    _build_news_description(tavily_titles, naver_titles), 320
                ),
                "link": link,
            },
            {
                "title": "📋 입찰 · AI",
                "description": _trunc(_build_bid_ai_description(bids, ai), 320),
                "link": link,
            },
        ],
        "buttons": [{"title": "대시보드 열기", "link": link}],
    }


def format_kakao_summary(
    *,
    fx: dict | None = None,
    tavily_titles: list[str] | None = None,
    naver_titles: list[str] | None = None,
    bids: list[dict] | None = None,
    ai: dict | None = None,
) -> str:
    sections = [
        "◈ 방산 대시보드 브리핑",
        "",
        "💱 환율",
        _build_fx_description(fx),
        "",
        "📰 방산 뉴스",
        _build_news_description(tavily_titles, naver_titles),
        "",
        "📋 입찰 · AI",
        _build_bid_ai_description(bids, ai),
    ]
    return "\n".join(sections).strip()


def collect_dashboard_summary_data(
    *,
    fetch_fx_rates,
    tavily_search,
    naver_news_search,
    fetch_dapa_bids,
    analyze_defense_news,
    http_get_bytes,
    http_get_json,
    web_url: str = "http://localhost:3000",
) -> tuple[dict, dict, str]:
    """서버에서 데이터 수집 후 (상세 dict, 카카오 템플릿, 평문 미리보기) 반환."""

    fx_status, fx = fetch_fx_rates()
    if fx_status != 200:
        fx = None

    tavily_titles: list[str] = []
    naver_titles: list[str] = []
    tavily_news: list[dict] = []
    naver_news: list[dict] = []

    t_status, t_data = tavily_search({
        "query": "defense industry NATO military export",
        "search_depth": "basic",
        "max_results": 5,
        "topic": "news",
        "days": 14,
    })
    if t_status == 200:
        for item in (t_data.get("results") or [])[:5]:
            title = item.get("title") or ""
            tavily_titles.append(title)
            tavily_news.append({
                "title": title,
                "summary": (item.get("content") or "")[:200],
                "source": item.get("url", ""),
            })

    n_status, n_data = naver_news_search({
        "query": "방산 수출 국방 KAI LIG",
        "display": 5,
        "sort": "date",
    })
    if n_status == 200:
        for item in (n_data.get("items") or [])[:5]:
            title = re.sub(r"<[^>]+>", "", item.get("title") or "")
            desc = re.sub(r"<[^>]+>", "", item.get("description") or "")
            naver_titles.append(title)
            naver_news.append({
                "title": title,
                "summary": desc[:200],
                "source": "Naver",
            })

    bids: list[dict] = []
    try:
        bid_data = fetch_dapa_bids(
            page_no=1,
            num_of_rows=5,
            days_back=30,
            http_get_bytes=http_get_bytes,
        )
        bids = bid_data.get("bids") or []
    except Exception:
        bids = []

    ai = None
    if tavily_news or naver_news:
        ai_status, ai = analyze_defense_news({
            "tavilyNews": tavily_news,
            "naverNews": naver_news,
        })
        if ai_status != 200:
            ai = None

    text = format_kakao_summary(
        fx=fx,
        tavily_titles=tavily_titles,
        naver_titles=naver_titles,
        bids=bids,
        ai=ai,
    )
    template = build_kakao_list_template(
        fx=fx,
        tavily_titles=tavily_titles,
        naver_titles=naver_titles,
        bids=bids,
        ai=ai,
        web_url=web_url,
    )

    detail = {
        "fx": fx,
        "tavilyCount": len(tavily_titles),
        "naverCount": len(naver_titles),
        "bidsCount": len(bids),
        "ai": ai,
        "text": text,
        "template": template,
    }
    return detail, template, text
