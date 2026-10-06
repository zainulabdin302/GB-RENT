/**
 * Client to the GB Rent AI microservice.
 *
 * The Next.js backend calls this microservice for two ML tasks:
 *   1. Price prediction (RandomForestRegressor)
 *   2. Similar-property matching (k-NN + cosine similarity)
 *
 * ARCHITECTURE NOTE (for FYP defense):
 *   The AI service runs as a SEPARATE process (mini-services/ai-service).
 *   This separation mirrors the original Python FastAPI design — the ML
 *   logic is isolated from the web server, language-agnostic, and
 *   horizontally scalable. In production you can swap this Bun/TS
 *   implementation for a Python FastAPI + scikit-learn service by
 *   changing only the AI_SERVICE_URL env var.
 *
 * CONNECTIVITY:
 *   - Local dev: AI_SERVICE_URL defaults to http://localhost:3003
 *   - Docker:    set AI_SERVICE_URL=http://ai-service:3003 (Docker DNS)
 *   - The browser never calls the AI service directly; only the Next
 *     backend does, server-to-server.
 */
import type {
  PricePredictionRequest,
  PricePredictionResponse,
  SimilarPropertyRequest,
  SimilarPropertyResponse,
} from "@/types";

const AI_SERVICE_URL = (
  process.env.AI_SERVICE_URL || "http://localhost:3003"
).replace(/\/$/, "");

/**
 * Calls the AI service. Server-to-server only — never called from the
 * browser. In Docker Compose this resolves to http://ai-service:3003 via
 * the internal Docker network; locally it's http://localhost:3003.
 */
async function callAI<T>(path: string, body: unknown): Promise<T> {
  const url = `${AI_SERVICE_URL}${path}`;
  const res = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AI service error ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function predictPrice(
  req: PricePredictionRequest
): Promise<PricePredictionResponse> {
  return callAI<PricePredictionResponse>("/api/predict-price", req);
}

export async function findSimilarProperties(
  req: SimilarPropertyRequest
): Promise<SimilarPropertyResponse> {
  return callAI<SimilarPropertyResponse>("/api/similar", req);
}
