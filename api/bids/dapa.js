/**
 * GET /api/bids/dapa — 방위사업청 조달 입찰공고
 */

const { fetchDapaBids } = require("../../lib/dapa-bids-proxy");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const pageNo = Number(req.query?.pageNo) || 1;
    const numOfRows = Number(req.query?.numOfRows) || 10;
    const daysBack = Number(req.query?.daysBack) || 30;
    const data = await fetchDapaBids({ pageNo, numOfRows, daysBack });
    return res.status(200).json(data);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};
