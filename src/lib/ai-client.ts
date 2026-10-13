/** Server-side client for similar-listing matching. Price estimates use live DB records in rent-estimate.ts. */
import type {
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

export async function findSimilarProperties(
  req: SimilarPropertyRequest
): Promise<SimilarPropertyResponse> {
  return callAI<SimilarPropertyResponse>("/api/similar", req);
}
