/**
 * GET /reports/:id.html — HTML 브리핑 보고서
 */

const { buildReportHtml, loadReportPayload } = require("../../lib/report-builder");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let id = req.query?.id;
  if (Array.isArray(id)) id = id[0];
  if (!id) {
    const url = req.url || "";
    const match = url.match(/\/reports\/([^/?]+)/);
    id = match?.[1]?.replace(/\.html$/, "");
  }
  if (!id) {
    return res.status(400).send("Report id required");
  }

  id = String(id).replace(/\.html$/, "");
  const payload = loadReportPayload(id);
  if (!payload) {
    return res.status(404).send("보고서를 찾을 수 없습니다.");
  }

  const html = buildReportHtml(payload);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).send(html);
};
