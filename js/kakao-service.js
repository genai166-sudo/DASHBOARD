/**
 * 카카오톡 — 대시보드 요약 전송
 */

async function fetchKakaoStatus() {
  const res = await fetch("/api/kakao/status");
  return res.json().catch(() => ({}));
}

function setKakaoButtonState(btn, state) {
  if (!btn) return;
  btn.disabled = state === "loading";
  btn.classList.toggle("header__kakao--loading", state === "loading");
  if (state === "loading") {
    btn.textContent = "전송 중…";
  } else {
    btn.textContent = "📲 카카오톡 보고서 전송";
  }
}

async function initKakaoSend() {
  const btn = document.getElementById("kakao-send-btn");
  if (!btn) return;

  try {
    const status = await fetchKakaoStatus();
    if (!status.configured) {
      btn.title = "카카오 연동 필요 — 클릭 시 로그인";
    }
  } catch {
    /* ignore */
  }

  btn.addEventListener("click", async () => {
    setKakaoButtonState(btn, "loading");
    try {
      const res = await fetch("/api/kakao/send-summary", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401 && data.loginUrl) {
        const go = confirm(
          "카카오톡 연동이 필요합니다.\n카카오 로그인 페이지로 이동할까요?"
        );
        if (go) window.location.href = data.loginUrl;
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "전송 실패");
      }

      alert(`카카오톡으로 보고서 링크를 보냈습니다.\n\n${data.headline || ""}\n${data.reportUrl || ""}`);
    } catch (err) {
      alert(`전송 실패: ${err.message}`);
    } finally {
      setKakaoButtonState(btn, "idle");
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initKakaoSend();
});
