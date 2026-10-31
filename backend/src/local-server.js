process.env.LOCAL_DEV = "true";
process.env.JWT_SECRET = process.env.JWT_SECRET || "local-dev-secret-not-for-production";
process.env.CORS_ORIGINS =
  process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173";

const port = Number(process.env.PORT || 3001);
if (!process.env.LOCAL_BASE_URL) {
  process.env.LOCAL_BASE_URL = `http://localhost:${port}`;
}

const http = require("http");
const { URL } = require("url");
const { handler } = require("./handler");
const { writeLocalImage, readLocalImage } = require("./store");

const allowedOrigins = process.env.CORS_ORIGINS.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return;
  if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
    res.setHeader("access-control-allow-origin", allowedOrigins.includes("*") ? "*" : origin);
    res.setHeader("vary", "origin");
  }
  res.setHeader("access-control-allow-headers", "content-type, authorization");
  res.setHeader("access-control-allow-methods", "GET, POST, PUT, OPTIONS");
}

function send(res, status, body, contentType) {
  res.statusCode = status;
  if (contentType) res.setHeader("content-type", contentType);
  res.end(body);
}

function readBuffer(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(Object.assign(new Error("Payload too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const uploadKeyPattern = /^proofs\/[^/]+\/2026-11-\d{2}\/[0-9a-f-]{36}\.jpg$/i;

const server = http.createServer(async (req, res) => {
  applyCors(req, res);
  const url = new URL(req.url || "/", "http://localhost");

  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === "PUT" && url.pathname === "/__upload") {
      const key = url.searchParams.get("key") || "";
      if (!uploadKeyPattern.test(key)) {
        send(res, 400, JSON.stringify({ error: "Chiave immagine non valida" }), "application/json");
        return;
      }
      const body = await readBuffer(req, 5 * 1024 * 1024);
      if (!body.length) {
        send(res, 400, JSON.stringify({ error: "Immagine vuota" }), "application/json");
        return;
      }
      writeLocalImage(key, body);
      res.statusCode = 200;
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/__image") {
      const key = url.searchParams.get("key") || "";
      const image = readLocalImage(key);
      if (!image) {
        send(res, 404, "Not found", "text/plain; charset=utf-8");
        return;
      }
      res.setHeader("cache-control", "private, max-age=3600");
      res.setHeader("x-content-type-options", "nosniff");
      send(res, 200, image, "image/jpeg");
      return;
    }

    const body = await readBuffer(req, 64 * 1024);
    const result = await handler({
      rawPath: url.pathname,
      body: body.length ? body.toString("utf8") : null,
      isBase64Encoded: false,
      headers: req.headers,
      requestContext: { http: { method: req.method } },
    });

    res.statusCode = result.statusCode;
    const headers = result.headers || {};
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
    res.end(result.body || "");
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    const message = status === 413 ? "File troppo grande" : status === 500 ? "Errore del server" : err.message;
    send(res, status, JSON.stringify({ error: message }), "application/json");
  }
});

server.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

server.listen(port, () => {
  console.log(`API http://localhost:${port}`);
});
