/**
 * Google Gemini — GEMINI_API_KEY
 * 모델: gemini-2.5-flash-lite
 */

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
    sentimentLabel: { type: "string" },
    confidence: { type: "number" },
    summary: { type: "string" },
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["opportunity", "risk", "watch"] },
          text: { type: "string" },
        },
        required: ["type", "text"],
      },
    },
    sectorScores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          score: { type: "number" },
        },
        required: ["name", "score"],
      },
    },
  },
  required: ["sentiment", "sentimentLabel", "confidence", "summary", "insights", "sectorScores"],
};

function getGeminiApiKey() {
  const raw = process.env.GEMINI_API_KEY || "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

function formatUpdated() {
  return (
    new Date().toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Seoul",
    }) + " KST"
  );
}

function buildNewsContext(body) {
  const tavily = Array.isArray(body.tavilyNews) ? body.tavilyNews : [];
  const naver = Array.isArray(body.naverNews) ? body.naverNews : [];
  const lines = [];

  if (tavily.length) {
    lines.push("## 국외 뉴스 (Tavily)");
    tavily.slice(0, 8).forEach((item, i) => {
      lines.push(
        `${i + 1}. [${item.source || "해외"}] ${item.title}\n   ${item.summary || ""}`
      );
    });
  }

  if (naver.length) {
    lines.push("\n## 국내 뉴스 (Naver)");
    naver.slice(0, 8).forEach((item, i) => {
      lines.push(
        `${i + 1}. [${item.source || "국내"}] ${item.title}\n   ${item.summary || ""}`
      );
    });
  }

  if (!lines.length) {
    const err = new Error("분석할 뉴스가 없습니다. 먼저 뉴스 검색을 실행하세요.");
    err.status = 400;
    throw err;
  }

  return lines.join("\n");
}

function buildPrompt(newsContext) {
  return `당신은 방위산업·군수 동향 분석가입니다.
아래 뉴스 검색 결과만 근거로 방산 섹터 브리핑을 작성하세요.
추측은 최소화하고, 뉴스에 근거한 인사이트를 제시하세요.
모든 텍스트는 한국어로 작성하세요.

${newsContext}

다음 JSON 형식으로만 응답하세요:
- sentiment: positive | neutral | negative
- sentimentLabel: 한 줄 감성 라벨 (예: "방산 섹터 긍정")
- confidence: 0-100 정수 (뉴스 근거 충분도)
- summary: 2-3문장 핵심 요약
- insights: 정확히 3개 — type은 opportunity, risk, watch 각 1개씩
- sectorScores: 4개 섹터 점수 (0-100) — 지상장비, 방공·미사일, UAS·드론, 함정·해양`;
}

function extractJsonText(response) {
  const parts = response?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || "").join("").trim();
  if (!text) {
    const reason = response?.candidates?.[0]?.finishReason || "unknown";
    throw new Error(`Gemini empty response (${reason})`);
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : text;

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("Gemini JSON parse failed");
  }
}

function normalizeAnalysis(parsed) {
  const sentiment = ["positive", "neutral", "negative"].includes(parsed.sentiment)
    ? parsed.sentiment
    : "neutral";

  const insights = (parsed.insights || [])
    .filter((i) => i?.text && ["opportunity", "risk", "watch"].includes(i.type))
    .slice(0, 3);

  while (insights.length < 3) {
    const types = ["opportunity", "risk", "watch"];
    insights.push({ type: types[insights.length], text: "뉴스 근거 추가 분석 필요" });
  }

  const sectorScores = (parsed.sectorScores || [])
    .filter((s) => s?.name && typeof s.score === "number")
    .slice(0, 4)
    .map((s) => ({
      name: String(s.name),
      score: Math.min(100, Math.max(0, Math.round(s.score))),
    }));

  const defaults = [
    { name: "지상장비", score: 50 },
    { name: "방공·미사일", score: 50 },
    { name: "UAS·드론", score: 50 },
    { name: "함정·해양", score: 50 },
  ];
  while (sectorScores.length < 4) {
    sectorScores.push(defaults[sectorScores.length]);
  }

  return {
    sentiment,
    sentimentLabel: String(parsed.sentimentLabel || "중립"),
    confidence: Math.min(100, Math.max(0, Math.round(Number(parsed.confidence) || 70))),
    summary: String(parsed.summary || "요약을 생성하지 못했습니다."),
    insights,
    sectorScores,
    generatedAt: formatUpdated(),
    model: GEMINI_MODEL,
    source: "gemini",
    live: true,
  };
}

async function analyzeDefenseNews(body = {}) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    const err = new Error("GEMINI_API_KEY is not configured on the server");
    err.status = 500;
    throw err;
  }

  const newsContext = buildNewsContext(body);
  const prompt = buildPrompt(newsContext);

  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        responseSchema: ANALYSIS_SCHEMA,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `Gemini HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status === 401 || res.status === 403 ? 401 : 502;
    throw err;
  }

  const parsed = extractJsonText(data);
  return normalizeAnalysis(parsed);
}

module.exports = { analyzeDefenseNews, getGeminiApiKey, GEMINI_MODEL };
