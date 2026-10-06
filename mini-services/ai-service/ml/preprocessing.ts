/**
 * Feature engineering for the GB Rent AI service.
 *
 * Two distinct feature spaces are used:
 *
 * 1. `buildForestVector` — used by the RandomForestRegressor.
 *    Price is the *target* variable and is NOT a feature here.
 *
 * 2. `buildSimilarityVector` — used by the cosine-similarity k-NN.
 *    Price is a *feature* here, because for "find similar listings" the
 *    asking price of the listing is part of what makes two listings alike.
 *
 * Both spaces are produced in a FIXED, documented column order so that
 * tree splits (which reference feature indices) and cosine dot-products
 * remain consistent across all calls and across server restarts.
 *
 * ─── Forest feature vector (26 dims) ─────────────────────────────────────
 *   [0..3]   one-hot  PropertyType  : SHOP, HOUSE, ROOM, HOSTEL
 *   [4..13]  one-hot  CityZone      : Gilgit, Hunza, Skardu, Ghizer, Ghanche,
 *                                     Shigar, Kharmang, Nagar, Astore, Diamer
 *   [14..23] binary   AmenityKey   : FURNISHED, WATER, ELECTRICITY_BACKUP,
 *                                     PARKING, INTERNET, HEATING, KITCHEN,
 *                                     ATTACHED_BATH, SECURITY, GARDEN
 *   [24]     numeric  rooms         (as-is, integer count)
 *   [25]     numeric  size          (sq ft; null imputed to MEDIAN = 600)
 *
 * ─── Similarity feature vector (27 dims) ──────────────────────────────────
 *   Same one-hot/binary block as above (24 dims), then:
 *   [24]     numeric  rooms / 6     (normalised to ~0..1)
 *   [25]     numeric  size  / 2000  (normalised to ~0..1)
 *   [26]     numeric  price / 100000 (normalised to ~0..1, PKR/month)
 *
 *   Note: rooms and size are scaled differently in the two spaces. In the
 *   forest they are kept as raw counts/sqft because tree splits are
 *   invariant to monotonic rescaling (a threshold on raw size vs. size/2000
 *   yields the same partition). For cosine similarity, however, the scale
 *   absolutely matters — raw price (≈ 30,000) would dominate every binary
 *   amenity flag, so we normalise each numeric column into a 0..1 band so
 *   no single dimension dominates the dot-product.
 */

import {
  AMENITIES,
  CITY_ZONES,
  PROPERTY_TYPES,
  type AmenityKey,
  type CityZone,
  type PropertyType,
} from "./types";

/** Default imputation value for a missing `size` field (median sqft). */
export const SIZE_IMPUTE_MEDIAN = 600;

/** Feature column order — exported for debugging & feature-importance labels. */
export const FOREST_FEATURE_NAMES: string[] = [
  ...PROPERTY_TYPES.map((t) => `type_${t}`),
  ...CITY_ZONES.map((c) => `zone_${c}`),
  ...AMENITIES.map((a) => `amenity_${a}`),
  "rooms",
  "size",
];

/** Total number of forest-feature dimensions. */
export const FOREST_N_FEATURES = FOREST_FEATURE_NAMES.length; // 26

/**
 * Build the forest feature vector for one listing.
 * Price is NOT included — it is the regression target.
 */
export function buildForestVector(input: {
  type: PropertyType;
  cityZone: CityZone;
  rooms: number;
  size: number | null;
  amenities: AmenityKey[];
}): number[] {
  const v: number[] = new Array(FOREST_N_FEATURES).fill(0);

  // one-hot type
  const tIdx = PROPERTY_TYPES.indexOf(input.type);
  if (tIdx >= 0) v[tIdx] = 1;

  // one-hot city zone
  const cIdx = CITY_ZONES.indexOf(input.cityZone);
  if (cIdx >= 0) v[4 + cIdx] = 1;

  // binary amenities
  for (const a of input.amenities) {
    const aIdx = AMENITIES.indexOf(a);
    if (aIdx >= 0) v[14 + aIdx] = 1;
  }

  // numeric rooms
  v[24] = input.rooms;

  // numeric size (impute median if null/NaN/<=0)
  v[25] =
    input.size == null || !Number.isFinite(input.size) || input.size <= 0
      ? SIZE_IMPUTE_MEDIAN
      : input.size;

  return v;
}

/**
 * Build the similarity feature vector for one listing.
 * Price IS a feature here. Returns 27 dims (24 categorical + 3 numeric).
 */
export function buildSimilarityVector(input: {
  type: PropertyType;
  cityZone: CityZone;
  rooms: number;
  size: number | null;
  price: number;
  amenities: AmenityKey[];
}): number[] {
  // First 24 dims are identical to the forest categorical block.
  const v: number[] = buildForestVector({
    type: input.type,
    cityZone: input.cityZone,
    rooms: input.rooms,
    size: input.size,
    amenities: input.amenities,
  });

  // Overwrite the two numeric forest columns with NORMALISED versions so they
  // live on the same 0..1 scale as the price dimension we are about to append.
  // (See header comment: cosine is scale-sensitive; trees are not.)
  v[24] = input.rooms / 6; // rooms: 0..~1 for typical 0-6 room listings
  const size = input.size == null || !Number.isFinite(input.size) || input.size <= 0
    ? SIZE_IMPUTE_MEDIAN
    : input.size;
  v[25] = size / 2000; // sqft: 0..~1 for typical 0-2000 sqft listings

  // Append normalised price dimension.
  v[26] = input.price / 100000; // PKR/month: 0..~1.2 for typical 0-120k listings

  return v;
}

/**
 * Convenience: build the matrix of forest vectors for a dataset.
 * Used by RandomForestRegressor.fit().
 */
export function buildForestMatrix<X extends { type: PropertyType; cityZone: CityZone; rooms: number; size: number | null; amenities: AmenityKey[] }>(
  rows: X[],
): { X: number[][]; featureNames: string[] } {
  return {
    X: rows.map((r) => buildForestVector(r)),
    featureNames: FOREST_FEATURE_NAMES,
  };
}
