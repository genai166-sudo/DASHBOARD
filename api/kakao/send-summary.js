/** POST /api/kakao/send-summary — HTML 보고서 생성 후 카카오톡 링크 전송 */

const { sendMemoTemplate, isKakaoConfigured, getPublicUrl } = require("../../lib/kakao-proxy");
const { collectDashboardSummaryData } = require("../../lib/dashboard-summary");
const {
  publishReport,
  buildReportHeadline,
  buildKakaoReportMessage,
} = require("../../lib/report-builder");

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
    const publicUrl = getPublicUrl();
    const detail = await collectDashboardSummaryData();
    const report = publishReport(detail, publicUrl);
    const headline = buildReportHeadline(detail);
    const template = buildKakaoReportMessage(headline, report.url, publicUrl);
    await sendMemoTemplate(template);

    return res.status(200).json({
      ok: true,
      sent: true,
      reportUrl: report.url,
      headline,
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
