/** GET /api/kakao/oauth/callback?code= */

const {
  exchangeCodeForToken,
  saveRefreshToken,
  getRedirectUri,
} = require("../../../lib/kakao-proxy");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const code = req.query?.code;
  const error = req.query?.error;
  if (error) {
    return res.status(400).send(`<h1>카카오 로그인 실패</h1><p>${error}</p>`);
  }
  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }

  try {
    const tokens = await exchangeCodeForToken(code);
    if (tokens.refresh_token) {
      saveRefreshToken(tokens.refresh_token);
    }

    const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"/><title>카카오 연동 완료</title>
<style>body{font-family:sans-serif;background:#0a0e14;color:#e8edf4;padding:2rem;max-width:640px;margin:auto}
code{background:#151c26;padding:2px 6px;border-radius:4px;word-break:break-all}</style></head><body>
<h1>✅ 카카오톡 연동 완료</h1>
<p>이제 대시보드에서 <strong>카카오톡 요약 전송</strong> 버튼을 사용할 수 있습니다.</p>
${tokens.refresh_token ? `<p>Refresh Token이 서버에 저장되었습니다.</p>
<p>Vercel 배포 시 Environment Variables에 추가하세요:</p>
<pre><code>KAKAO_REFRESH_TOKEN=${tokens.refresh_token}</code></pre>` : `<p>Refresh Token이 없습니다. 동의 항목 talk_message 확인 후 다시 로그인하세요.</p>`}
<p>Redirect URI: <code>${getRedirectUri()}</code></p>
<p><a href="/">대시보드로 돌아가기</a></p></body></html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (err) {
    return res.status(err.status || 500).send(`<h1>토큰 발급 실패</h1><p>${err.message}</p>`);
  }
};
