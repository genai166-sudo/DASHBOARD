/**
 * GET /api/fx/rates — 환율 (EXCHANGERATE_API_KEY)
 */

const { fetchFxRates, getFxApiKey } = require("../../lib/fx-proxy");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = await fetchFxRates();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};
