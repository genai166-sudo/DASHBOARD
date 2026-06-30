"""대시보드 환율·뉴스·입찰·AI 요약 텍스트 생성"""

from __future__ import annotations

import re


def _trunc(s: str, n: int) -> str:
    s = re.sub(r"\s+", " ", (s or "").strip())
    if len(s) <= n:
        return s
    return s[: n - 1] + "…"


def format_kakao_summary(
    *,
    fx: dict | None = None,
    tavily_titles: list[str] | None = None,
    naver_titles: list[str] | None = None,
    bids: list[dict] | None = None,
    ai: dict | None = None,
) -> str:
    lines = ["◈ 방산 대시보드 요약"]

    if fx and fx.get("rates"):
        usd = next((r for r in fx["rates"] if r.get("pair") == "USD/KRW"), None)
        if usd:
            sign = "+" if usd.get("change", 0) >= 0 else ""
            lines.append(
                f"💱 USD/KRW {usd['value']:,.2f} ({sign}{usd.get('changePct', 0):.2f}%)"
            )

    news_bits = []
    if tavily_titles:
        news_bits.append(_trunc(tavily_titles[0], 22))
    if naver_titles:
        news_bits.append(_trunc(naver_titles[0], 22))
    if news_bits:
        extra = ""
        total = (len(tavily_titles or [])) + (len(naver_titles or []))
        if total > len(news_bits):
            extra = f" 외 {total - 1}건"
        lines.append(f"📰 {' / '.join(news_bits)}{extra}")

    if bids:
        b = bids[0]
        lines.append(f"📋 {_trunc(b.get('title', ''), 24)} ({b.get('deadline', '—')})")

    if ai:
        label = ai.get("sentimentLabel") or "분석"
        summary = _trunc(ai.get("summary", ""), 48)
        lines.append(f"🤖 {label} — {summary}")

    text = "\n".join(lines)
    if len(text) > 200:
        text = text[:197] + "…"
    return text


def collect_dashboard_summary_data(
    *,
    fetch_fx_rates,
    tavily_search,
    naver_news_search,
    fetch_dapa_bids,
    analyze_defense_news,
    http_get_bytes,
    http_get_json,
) -> tuple[dict, str]:
    """서버에서 데이터 수집 후 (상세 dict, 카카오 텍스트) 반환."""

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
                "summary": (item.get("content") or "")[:140],
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
                "summary": desc[:140],
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

    detail = {
        "fx": fx,
        "tavilyCount": len(tavily_titles),
        "naverCount": len(naver_titles),
        "bidsCount": len(bids),
        "ai": ai,
        "text": text,
    }
    return detail, text
