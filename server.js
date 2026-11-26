import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import aliceHandler from "./api/alice.js";

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY_BYTES = 1024 * 1024;

// Load secrets from .env only when they are not already supplied by Passenger.
function loadEnvFile() {
  const envPath = path.join(APP_ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
       (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

function sendJson(res, statusCode, payload) {
  if (res.writableEnded) return;
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (total === 0) return {};

  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      const error = new Error("JSON body must be an object");
      error.statusCode = 400;
      throw error;
    }
    return parsed;
  } catch (error) {
    if (error.statusCode) throw error;
    const invalidJson = new Error("Invalid JSON request body");
    invalidJson.statusCode = 400;
    throw invalidJson;
  }
}

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    sendJson(res, 400, { error: "Invalid request URL" });
    return;
  }

  if (pathname === "/health" && req.method === "GET") {
    sendJson(res, 200, {
      status: "ok",
      service: "alice-ai-assistant",
      runtime: process.version
    });
    return;
  }

  if (pathname !== "/api/alice" && pathname !== "/api/alice/") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    req.body = req.method === "POST" ? await readJsonBody(req) : {};

    let statusCode = 200;
    const responseAdapter = {
      status(code) {
        statusCode = Number(code) || 200;
        return this;
      },
      json(payload) {
        sendJson(res, statusCode, payload);
        return this;
      }
    };

    await aliceHandler(req, responseAdapter);

    if (!res.writableEnded) {
      sendJson(res, 500, {
        version: "1.0",
        response: {
          text: "Нейросеть временно недоступна. Попробуй позже.",
          end_session: false
        },
        session_state: { h: [] }
      });
    }
  } catch (error) {
    console.error("HTTP handler error:", error?.name || "Error", error?.message || "");
    sendJson(res, error.statusCode || 500, {
      error: error.statusCode === 400
        ? "Invalid request"
        : error.statusCode === 413
          ? "Request too large"
          : "Internal server error"
    });
  }
});

server.keepAliveTimeout = 5000;
server.headersTimeout = 10000;

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => {
  console.log("Alice AI Assistant listening on port", port);
});
