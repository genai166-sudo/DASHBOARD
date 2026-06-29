/**
 * Tavily 클라이언트 — API 키 없음, 서버 프록시만 호출
 */

function parseApiError(data, status) {
  let raw = data?.error || data?.message || data?.detail || "Tavily search failed";
  if (typeof raw === "object") raw = raw.error || JSON.stringify(raw);

  let msg = String(raw)
    .replace(/^\{'error':\s*'/, "")
    .replace(/'\}$/, "")
    .replace(/^"|"$/g, "");

  if (status === 401 || /deactivated|invalid api key|unauthorized/i.test(msg)) {
    return "Tavily API 키가 비활성화되었거나 잘못됐습니다. app.tavily.com 에서 새 키 발급 후 .env / Vercel Env 갱신하세요.";
  }
  if (status === 500 && /not configured/i.test(msg)) {
    return "서버에 TAVILY_API_KEY 가 없습니다. .env 또는 Vercel 환경변수를 확인하세요.";
  }
  return msg;
}

async function tavilySearch(query, options = {}) {
  let res;
  try {
    res = await fetch("/api/tavily/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, ...options }),
    });
  } catch {
    throw new Error("서버에 연결할 수 없습니다. python server.py 로 실행 중인지 확인하세요.");
  }

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    throw new Error(parseApiError(data, res.status));
  }
  return data;
}
