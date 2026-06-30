/** GET /api/kakao/status */

const { isKakaoConfigured, getRestApiKey } = require("../../lib/kakao-proxy");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  return res.status(200).json({
    configured: isKakaoConfigured(),
    hasAppKey: Boolean(getRestApiKey()),
    hasRefreshToken: isKakaoConfigured(),
    loginUrl: "/api/kakao/oauth/login",
  });
};
