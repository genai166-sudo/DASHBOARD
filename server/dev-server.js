/**
 * 로컬 개발 서버
 * - 정적 파일(대시보드) 제공
 * - /api/tavily/search 프록시 (키는 .env 에서만 로드)
 *
 * 실행: npm run dev
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { tavilySearch } = require("./lib/tavily-proxy");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(new Error("Payload too large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function handleTavilySearch(req, res) {
  try {
    const body = await readBody(req);
    const data = await tavilySearch(body);
    sendJson(res, 200, data);
  } catch (err) {
    sendJson(res, err.status || 500, { error: err.message });
  }
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/tavily/search") {
    await handleTavilySearch(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
});

server.listen(PORT, () => {
  console.log(`Dashboard: http://localhost:${PORT}`);
  console.log(`Tavily proxy: POST http://localhost:${PORT}/api/tavily/search`);
  if (!process.env.TAVILY_API_KEY) {
    console.warn("⚠ TAVILY_API_KEY not set — copy .env.example to .env and add your key");
  }
});
