/**
 * Tavily 클라이언트 — API 키 없음, 서버 프록시만 호출
 * 사용: const result = await tavilySearch("방산 수출 동향");
 */

async function tavilySearch(query, options = {}) {
  const res = await fetch("/api/tavily/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, ...options }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Tavily search failed");
  return data;
}
