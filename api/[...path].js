/**
 * Vercel catch-all API — 단일 Serverless Function
 * /api/* 모든 경로를 lib/vercel-router.js 로 라우팅
 */

const { dispatch } = require("../lib/vercel-router");

module.exports = async function handler(req, res) {
  return dispatch(req, res);
};
