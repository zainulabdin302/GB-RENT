/**
 * k-Nearest-Neighbours retrieval using COSINE similarity.
 *
 * For "find similar listings" we treat a listing as a 27-dim feature vector
 * (see preprocessing.ts → buildSimilarityVector). Cosine similarity between
 * two vectors a, b is:
 *
 *      cos(a, b) = (a · b) / (||a|| · ||b||)
 *
 * which measures the cosine of the angle between them. Two listings with
 * identical one-hot/binary encodings and identical normalised numeric
 * columns have cos = 1. Orthogonal listings (no shared categories, no
 * shared amenities, exactly inverse numeric scales) have cos ≈ 0. There
 * is no negative cosine in this problem because all feature values are
 * ≥ 0, so the dot product is non-negative.
 *
 * Distance used for ranking is `1 - similarity` (range 0..1). Lower is
 * closer. The endpoint returns results sorted by similarity DESCENDING.
 *
 * Because all dimensions here are non-negative and most are binary flags,
 * cosine is essentially a "soft overlap coefficient" weighted by the
 * magnitude of the numeric dims — listings that share more amenity flags
 * and live in the same zone with a similar size and price will rise to
 * the top.
 */

import { buildSimilarityVector } from "./preprocessing";
import type {
  AmenityKey,
  CityZone,
  PropertyType,
  SimilarPropertyCandidate,
  SimilarPropertyRequest,
  SimilarPropertyResponse,
} from "./types";

/** Dot product. */
function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** L2 norm. */
function norm(a: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}

/**
 * Cosine similarity in [0, 1] for non-negative vectors.
 * Returns 0 when either vector is degenerate (zero norm).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

/**
 * Rank `candidates` by cosine similarity to `target`.
 *
 * @returns top-k matches sorted by similarity descending; `distance` = 1 - similarity.
 *          Default k = 5.
 */
export function findSimilar(request: SimilarPropertyRequest): SimilarPropertyResponse {
  const k = Math.max(1, Math.min(request.candidates.length, request.k ?? 5));
  const targetVec = buildSimilarityVector({
    type: request.target.type as PropertyType,
    cityZone: request.target.cityZone as CityZone,
    rooms: request.target.rooms,
    size: request.target.size,
    price: request.target.price,
    amenities: (request.target.amenities ?? []) as AmenityKey[],
  });

  const scored = request.candidates.map((c: SimilarPropertyCandidate) => {
    const v = buildSimilarityVector({
      type: c.type as PropertyType,
      cityZone: c.cityZone as CityZone,
      rooms: c.rooms,
      size: c.size,
      price: c.price,
      amenities: (c.amenities ?? []) as AmenityKey[],
    });
    const similarity = cosineSimilarity(targetVec, v);
    return { id: c.id, similarity, distance: 1 - similarity };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return {
    matches: scored.slice(0, k),
    method: "cosine-knn-27dim",
  };
}

/**
 * Generic top-k cosine against a pre-built matrix — used internally by the
 * price-explanation helper (find the 5 nearest TRAINING rows to a query).
 */
export function topKCosine(
  candidateMatrix: number[][],
  candidateIds: string[],
  query: number[],
  k: number,
): Array<{ id: string; similarity: number; distance: number }> {
  const scored = candidateMatrix.map((v, i) => {
    const sim = cosineSimilarity(v, query);
    return { id: candidateIds[i], similarity: sim, distance: 1 - sim };
  });
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}
