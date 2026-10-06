/**
 * GB Rent AI microservice — HTTP entry point.
 *
 * Uses Bun's built-in `Bun.serve` (no Express, no extra deps). Listens on
 * port 3003 (hardcoded — the Caddyfile gateway forwards to this port).
 *
 * Endpoints (all JSON):
 *   GET  /api/health
 *        → { ok: true, models: { forest: <nTrees>, trained: true } }
 *
 *   POST /api/predict-price
 *        ← PricePredictionRequest
 *        → PricePredictionResponse
 *
 *   POST /api/similar
 *        ← SimilarPropertyRequest
 *        → SimilarPropertyResponse
 *
 * The service trains the forest ONCE at startup (synchronously, before
 * `Bun.serve`) and caches it in the module state of training-data.ts.
 *
 * CORS is wide-open (Access-Control-Allow-Origin: *) — this service is only
 * ever called server-to-server by the Next.js backend (see
 * `src/lib/ai-client.ts`), so the browser never reaches it directly. The
 * CORS headers exist purely for convenient `curl` testing.
 */

import { predictPrice, trainModels } from "./ml/training-data";
import { findSimilar } from "./ml/knn";
import type {
  PricePredictionRequest,
  SimilarPropertyRequest,
} from "./ml/types";

const PORT = 3003;

// ─── Train models BEFORE opening the server port ────────────────────────────
// (Synchronous — blocking — so the first request never hits an unbuilt forest.)
console.log("[ai-service] booting — training 30-tree RandomForest on 250 samples…");
const t0 = Date.now();
const models = trainModels();
const importances = models.forest.featureImportances();
const topDrivers = models.featureNames
  .map((name, idx) => ({ name, importance: importances[idx] ?? 0 }))
  .sort((a, b) => b.importance - a.importance)
  .slice(0, 5)
  .map((d) => `${d.name}=${d.importance.toFixed(3)}`)
  .join(", ");
const trainMs = Date.now() - t0;
console.log(
  `AI service ready on :3003 — 30 trees, 250 training samples ` +
  `(trained in ${trainMs} ms; top drivers: ${topDrivers}; OOB R² = ${
    models.forest.oobScore != null ? models.forest.oobScore.toFixed(3) : "n/a"
  })`,
);

// ─── HTTP server ─────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

function errorResponse(status: number, message: string): Response {
  return json({ error: message, status }, status);
}

async function readJson(req: Request): Promise<unknown | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isPriceRequest(b: any): b is PricePredictionRequest {
  return (
    b && typeof b === "object" &&
    typeof b.type === "string" &&
    typeof b.cityZone === "string" &&
    typeof b.rooms === "number" &&
    Array.isArray(b.amenities)
  );
}

function isSimilarRequest(b: any): b is SimilarPropertyRequest {
  return (
    b && typeof b === "object" &&
    typeof b.propertyId === "string" &&
    Array.isArray(b.candidates) &&
    b.target && typeof b.target === "object" &&
    typeof b.target.type === "string"
  );
}

const server = Bun.serve({
  port: PORT,
  fetch(req: Request): Response | Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ─── GET /api/health ─────────────────────────────────────────────────
    if (method === "GET" && path === "/api/health") {
      return json({
        ok: true,
        models: {
          forest: models.forest.nTrees,
          trained: true,
        },
        training: {
          samples: models.trainingData.length,
          topDrivers,
          oobR2: models.forest.oobScore,
        },
        version: "ai-service/1.0.0",
        port: PORT,
      });
    }

    // ─── POST /api/predict-price ─────────────────────────────────────────
    if (method === "POST" && path === "/api/predict-price") {
      const body = readJson(req);
      return body.then((raw) => {
        if (raw == null || !isPriceRequest(raw)) {
          return errorResponse(400, "Invalid PricePredictionRequest body.");
        }
        try {
          const resp = predictPrice(raw);
          return json(resp);
        } catch (err) {
          return errorResponse(500, `Prediction failed: ${(err as Error).message}`);
        }
      });
    }

    // ─── POST /api/similar ───────────────────────────────────────────────
    if (method === "POST" && path === "/api/similar") {
      return readJson(req).then((raw) => {
        if (raw == null || !isSimilarRequest(raw)) {
          return errorResponse(400, "Invalid SimilarPropertyRequest body.");
        }
        try {
          const resp = findSimilar(raw);
          return json(resp);
        } catch (err) {
          return errorResponse(500, `Similar search failed: ${(err as Error).message}`);
        }
      });
    }

    // ─── Root (handy for a browser hit) ──────────────────────────────────
    if (method === "GET" && (path === "/" || path === "")) {
      return json({
        service: "GB Rent AI microservice",
        version: "1.0.0",
        endpoints: [
          "GET  /api/health",
          "POST /api/predict-price",
          "POST /api/similar",
        ],
      });
    }

    // 404
    return errorResponse(404, `Not found: ${method} ${path}`);
  },
  error(err: Error): Response {
    return errorResponse(500, `Unhandled server error: ${err.message}`);
  },
});

console.log(`[ai-service] Bun.serve listening on http://localhost:${server.port}`);
