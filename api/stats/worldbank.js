/**
 * GET /api/stats/worldbank — World Bank 군사비 통계 (키 불필요)
 */

const { fetchWorldBankStats } = require("../../lib/worldbank-proxy");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = await fetchWorldBankStats();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.message });
  }
};
