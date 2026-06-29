/**
 * Naver 뉴스 검색 클라이언트 — API 키 없음, 서버 프록시만 호출
 */

function parseNaverApiError(data, status) {
  let msg = data?.error || data?.errorMessage || data?.message || "Naver search failed";
  if (typeof msg === "object") msg = JSON.stringify(msg);
  msg = String(msg);

  if (status === 401 || status === 403 || /unauthorized|invalid|인증/i.test(msg)) {
    return "Naver API 인증 실패. NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 을 .env 또는 Vercel Env 에 확인하세요.";
  }
  if (status === 500 && /not configured/i.test(msg)) {
    return "서버에 Naver API 키가 없습니다. .env 또는 Vercel 환경변수를 확인하세요.";
  }
  return msg;
}

async function naverNewsSearch(query, options = {}) {
  const params = new URLSearchParams({ query, ...options });
  let res;
  try {
    res = await fetch(`/api/naver/search?${params.toString()}`);
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
    throw new Error(parseNaverApiError(data, res.status));
  }
  return data;
}
