import type { PricePredictionRequest, PricePredictionResponse } from "@/types";

export interface RentalCandidate {
  id: string;
  userId: string;
  title: string;
  type: string;
  cityZone: string;
  area: string;
  price: number;
  rooms: number;
  size: number | null;
  amenities: string;
  status: string;
  images: { url: string }[];
}

const norm = (value: string) =>
  value.trim().toLowerCase().replace(/\\s+/g, " ");

function parseAmenities(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((item): item is string => typeof item === "string"))]
      : [];
  } catch {
    return [];
  }
}

function amenitySimilarity(left: string[], right: string[]): number {
  const a = new Set(left);
  const b = new Set(right);
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;

  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  return intersection / union.size;
}

/**
 * Estimates asking rent from approved, non-demo listings in the same city
 * and property category. Room count is a similarity signal, not a hard
 * exclusion, so useful nearby examples are still considered when the market
 * has few listings. Missing size data is treated as unknown, not a mismatch.
 *
 * This is a comparison-based indication, not a valuation or confirmed rent.
 */
export function estimateRent(
  target: PricePredictionRequest,
  candidates: RentalCandidate[],
): PricePredictionResponse {
  const targetAmenities = target.amenities ?? [];

  const scored = candidates
    .filter(
      (property) =>
        property.id !== target.propertyId &&
        property.status === "APPROVED" &&
        norm(property.cityZone) === norm(target.cityZone) &&
        property.type === target.type &&
        Number.isFinite(property.price) &&
        property.price > 0 &&
        Number.isFinite(property.rooms) &&
        property.rooms >= 0 &&
        !property.images.some((image) =>
          image.url.startsWith("/uploads/seed-"),
        ),
    )
    .map((property) => {
      const amenities = parseAmenities(property.amenities);
      const roomSimilarity = 1 / (1 + Math.abs(property.rooms - target.rooms));
      const sizeSimilarity =
        property.size && target.size
          ? Math.min(property.size, target.size) /
            Math.max(property.size, target.size)
          : 0.5;
      const sameArea = norm(property.area) === norm(target.area);
      const amenitiesScore = amenitySimilarity(
        amenities,
        targetAmenities,
      );

      // Rooms and amenities matter even when older listings have no size data.
      const weight =
        0.35 * roomSimilarity +
        0.2 * sizeSimilarity +
        0.2 * Number(sameArea) +
        0.25 * amenitiesScore;

      return {
        property,
        weight,
        sameArea,
        hasSize: property.size !== null && target.size !== null,
      };
    })
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        a.property.id.localeCompare(b.property.id),
    );

  // Prefer local neighbourhood listings when there are enough to compare.
  // Otherwise include the best matches from elsewhere in the same city.
  const local = scored.filter((item) => item.sameArea);
  const pool = local.length >= 2 ? local : scored;
  const selected = pool.slice(0, 10);

  const comparables = selected.map(({ property }) => ({
    id: property.id,
    title: property.title,
    cityZone: property.cityZone,
    area: property.area,
    price: property.price,
    rooms: property.rooms,
    size: property.size,
  }));

  if (selected.length === 0) {
    return {
      available: false,
      predictedPrice: null,
      low: null,
      high: null,
      evidence: "insufficient",
      method: "similar-listings",
      comparables,
      explanation:
        `No other approved, non-demo ${target.type.toLowerCase()} listings were found in ${target.cityZone}. Try again when more real listings are available.`,
    };
  }

  const totalWeight = selected.reduce(
    (total, item) => total + item.weight,
    0,
  );
  const predictedPrice =
    totalWeight > 0
      ? Math.round(
          selected.reduce(
            (total, item) =>
              total + item.property.price * item.weight,
            0,
          ) / totalWeight,
        )
      : Math.round(
          selected.reduce(
            (total, item) => total + item.property.price,
            0,
          ) / selected.length,
        );

  const prices = selected.map((item) => item.property.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const owners = new Set(
    selected.map((item) => item.property.userId),
  ).size;
  const sizeCoverage =
    selected.filter((item) => item.hasSize).length / selected.length;

  const evidence =
    selected.length >= 5 &&
    owners >= 3 &&
    high / low <= 2 &&
    sizeCoverage >= 0.6
      ? "moderate"
      : "limited";

  const locationText =
    local.length >= 2
      ? `in ${target.cityZone}, ${target.area}`
      : `in ${target.cityZone}; the comparison includes other neighbourhoods`;

  const explanation =
    selected.length === 1
      ? `Only one other approved real listing could be compared ${locationText}. Its asking rent is PKR ${predictedPrice.toLocaleString("en-PK")}. This is a very limited reference, not a reliable market estimate.`
      : `Based on ${selected.length} approved real listings ${locationText}, from ${owners} account(s). Their asking rents range from PKR ${low.toLocaleString("en-PK")} to PKR ${high.toLocaleString("en-PK")}. Room count, neighbourhood and amenities influence the comparison; size is considered when available. ${evidence === "limited" ? "Evidence is limited, so treat this as a rough guide. " : ""}These are advertised rents, not confirmed rental agreements.`;

  return {
    available: true,
    predictedPrice,
    low,
    high,
    evidence,
    method: "similar-listings",
    comparables,
    explanation,
  };
}
