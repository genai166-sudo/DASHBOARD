/** POST /api/kakao/send-summary */

const { sendMemoTemplate, isKakaoConfigured, getPublicUrl } = require("../../lib/kakao-proxy");
const { collectDashboardSummaryData } = require("../../lib/dashboard-summary");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!isKakaoConfigured()) {
    return res.status(401).json({
      error: "Kakao not linked — open /api/kakao/oauth/login first",
      loginUrl: "/api/kakao/oauth/login",
    });
  }

  try {
    const detail = await collectDashboardSummaryData(getPublicUrl());
    await sendMemoTemplate(detail.template);
    return res.status(200).json({
      ok: true,
      sent: true,
      text: detail.text,
      summary: {
        tavilyCount: detail.tavilyCount,
        naverCount: detail.naverCount,
        bidsCount: detail.bidsCount,
        hasAi: Boolean(detail.ai),
      },
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};
