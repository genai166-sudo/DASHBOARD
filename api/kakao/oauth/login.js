/** GET /api/kakao/oauth/login */

const { buildOAuthLoginUrl } = require("../../../lib/kakao-proxy");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const url = buildOAuthLoginUrl();
    res.writeHead(302, { Location: url });
    res.end();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
};
