/**
 * Vercel 단일 API 엔트리 — /api/* 요청을 vercel.json rewrite로 수신
 */

const { dispatch } = require("../lib/vercel-router");

module.exports = async function handler(req, res) {
  try {
    return await dispatch(req, res);
  } catch (err) {
    console.error("API router error:", err);
    return res.status(500).json({ error: err.message || "Internal Server Error" });
  }
};
