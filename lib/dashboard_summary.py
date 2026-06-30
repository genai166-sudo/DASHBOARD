"""대시보드 환율·뉴스·입찰·AI 데이터 수집"""

from __future__ import annotations

import re


def _strip_html(value: str) -> str:
    return re.sub(r"<[^>]+>", "", value or "").strip()


def collect_dashboard_summary_data(
    *,
    fetch_fx_rates,
    tavily_search,
    naver_news_search,
    fetch_dapa_bids,
    analyze_defense_news,
    http_get_bytes,
    http_get_json,
) -> dict:
    fx_status, fx = fetch_fx_rates()
    if fx_status != 200:
        fx = None

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
            tavily_news.append({
                "title": item.get("title") or "",
                "summary": (item.get("content") or "")[:280],
                "url": item.get("url") or "",
                "source": item.get("url") or "Tavily",
            })

    n_status, n_data = naver_news_search({
        "query": "방산 수출 국방 KAI LIG",
        "display": 5,
        "sort": "date",
    })
    if n_status == 200:
        for item in (n_data.get("items") or [])[:5]:
            title = _strip_html(item.get("title") or "")
            desc = _strip_html(item.get("description") or "")
            naver_news.append({
                "title": title,
                "summary": desc[:280],
                "url": item.get("link") or item.get("originallink") or "",
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
            "tavilyNews": [
                {"title": n["title"], "summary": n["summary"], "source": n.get("url") or n.get("source")}
                for n in tavily_news
            ],
            "naverNews": [
                {"title": n["title"], "summary": n["summary"], "source": n.get("source")}
                for n in naver_news
            ],
        })
        if ai_status != 200:
            ai = None

    return {
        "fx": fx,
        "tavilyNews": tavily_news,
        "naverNews": naver_news,
        "bids": bids,
        "ai": ai,
        "tavilyCount": len(tavily_news),
        "naverCount": len(naver_news),
        "bidsCount": len(bids),
    }
