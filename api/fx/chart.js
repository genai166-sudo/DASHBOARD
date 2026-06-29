/**
 * GET /api/fx/chart?interval=1m|10m|30m|1d|1M
 */

const { fetchFxChart, recordFxSnapshot, fetchUsdBaseRates, calcPairRates } = require("../../lib/fx-proxy");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const interval = String(req.query?.interval || "1d");

  try {
    try {
      const { usdBase } = await fetchUsdBaseRates();
      const current = calcPairRates(usdBase);
      recordFxSnapshot(current.KRW);
    } catch {
      /* snapshot optional */
    }

    const chart = await fetchFxChart(interval);
    return res.status(200).json(chart);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};
