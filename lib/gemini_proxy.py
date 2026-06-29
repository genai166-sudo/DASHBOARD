"""Google Gemini — 방산 뉴스 분석 (gemini-2.5-flash-lite)"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

from prompt_loader import load_all_prompts, render_prompt

load_all_prompts()

GEMINI_MODEL = "gemini-2.5-flash-lite"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "sentiment": {"type": "string", "enum": ["positive", "neutral", "negative"]},
        "sentimentLabel": {"type": "string"},
        "confidence": {"type": "number"},
        "summary": {"type": "string"},
        "insights": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {"type": "string", "enum": ["opportunity", "risk", "watch"]},
                    "text": {"type": "string"},
                },
                "required": ["type", "text"],
            },
        },
        "sectorScores": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "score": {"type": "number"},
                },
                "required": ["name", "score"],
            },
        },
    },
    "required": ["sentiment", "sentimentLabel", "confidence", "summary", "insights", "sectorScores"],
}


def get_gemini_key() -> str:
    return os.environ.get("GEMINI_API_KEY", "").strip().strip('"').strip("'")


def _format_updated() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M KST")


def _build_news_context(body: dict) -> str:
    tavily = body.get("tavilyNews") or []
    naver = body.get("naverNews") or []
    lines: list[str] = []

    if tavily:
        lines.append("## 국외 뉴스 (Tavily)")
        for i, item in enumerate(tavily[:8], 1):
            lines.append(
                f"{i}. [{item.get('source') or '해외'}] {item.get('title', '')}\n"
                f"   {item.get('summary', '')}"
            )

    if naver:
        lines.append("\n## 국내 뉴스 (Naver)")
        for i, item in enumerate(naver[:8], 1):
            lines.append(
                f"{i}. [{item.get('source') or '국내'}] {item.get('title', '')}\n"
                f"   {item.get('summary', '')}"
            )

    if not lines:
        raise ValueError("분석할 뉴스가 없습니다. 먼저 뉴스 검색을 실행하세요.")
    return "\n".join(lines)


def _build_prompt(news_context: str) -> str:
    return render_prompt("defense-analysis", NEWS_CONTEXT=news_context)


def _extract_json(text: str) -> dict:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    raw = fenced.group(1).strip() if fenced else text
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start >= 0 and end > start:
            return json.loads(raw[start : end + 1])
        raise ValueError("Gemini JSON parse failed") from None


def _normalize(parsed: dict) -> dict:
    sentiment = parsed.get("sentiment") if parsed.get("sentiment") in {"positive", "neutral", "negative"} else "neutral"

    insights = [
        i for i in (parsed.get("insights") or [])
        if i.get("text") and i.get("type") in {"opportunity", "risk", "watch"}
    ][:3]
    for t in ("opportunity", "risk", "watch"):
        if len(insights) >= 3:
            break
        if not any(i.get("type") == t for i in insights):
            insights.append({"type": t, "text": "뉴스 근거 추가 분석 필요"})

    defaults = [
        {"name": "지상장비", "score": 50},
        {"name": "방공·미사일", "score": 50},
        {"name": "UAS·드론", "score": 50},
        {"name": "함정·해양", "score": 50},
    ]
    sector_scores = []
    for s in (parsed.get("sectorScores") or [])[:4]:
        if s.get("name") and isinstance(s.get("score"), (int, float)):
            sector_scores.append({
                "name": str(s["name"]),
                "score": max(0, min(100, round(s["score"]))),
            })
    while len(sector_scores) < 4:
        sector_scores.append(defaults[len(sector_scores)])

    confidence = parsed.get("confidence", 70)
    try:
        confidence = max(0, min(100, round(float(confidence))))
    except (TypeError, ValueError):
        confidence = 70

    return {
        "sentiment": sentiment,
        "sentimentLabel": str(parsed.get("sentimentLabel") or "중립"),
        "confidence": confidence,
        "summary": str(parsed.get("summary") or "요약을 생성하지 못했습니다."),
        "insights": insights[:3],
        "sectorScores": sector_scores,
        "generatedAt": _format_updated(),
        "model": GEMINI_MODEL,
        "source": "gemini",
        "live": True,
    }


def analyze_defense_news(body: dict) -> tuple[int, dict]:
    api_key = get_gemini_key()
    if not api_key:
        return 500, {"error": "GEMINI_API_KEY is not configured on the server"}

    try:
        news_context = _build_news_context(body)
    except ValueError as e:
        return 400, {"error": str(e)}

    payload = json.dumps({
        "contents": [{"parts": [{"text": _build_prompt(news_context)}]}],
        "generationConfig": {
            "temperature": 0.35,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
            "responseSchema": ANALYSIS_SCHEMA,
        },
    }).encode("utf-8")

    url = f"{GEMINI_URL}?key={urllib.parse.quote(api_key)}"
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
            message = detail.get("error", {}).get("message") or raw
        except json.JSONDecodeError:
            message = raw or "Gemini API request failed"
        code = 401 if e.code in (401, 403) else 502
        return code, {"error": str(message)}
    except urllib.error.URLError as e:
        return 502, {"error": f"Gemini connection failed: {e.reason}"}

    try:
        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts).strip()
        if not text:
            reason = data.get("candidates", [{}])[0].get("finishReason", "unknown")
            return 502, {"error": f"Gemini empty response ({reason})"}
        parsed = _extract_json(text)
        return 200, _normalize(parsed)
    except (ValueError, json.JSONDecodeError, KeyError, IndexError) as e:
        return 502, {"error": f"Gemini response parse failed: {e}"}
