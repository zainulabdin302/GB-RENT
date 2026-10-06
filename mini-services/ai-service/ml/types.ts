/**
 * GB Rent AI service — local type definitions.
 *
 * This file is a SELF-CONTAINED copy of the subset of the Next.js project's
 * DTOs that this microservice needs. We deliberately DO NOT import from
 * `@/lib/constants` or `@/types` (this service runs as a standalone Bun
 * process on port 3003 and must remain deployable / language-swappable
 * without any dependency on the Next.js codebase).
 *
 * If the canonical types change in `src/types/index.ts`, update both files
 * in lock-step. The string-literal unions below mirror exactly:
 *   - PROPERTY_TYPES, CITY_ZONES, AMENITIES from src/lib/constants.ts
 *   - PricePredictionRequest/Response, SimilarPropertyRequest/Response
 *     from src/types/index.ts
 */

// ─── Enumerations (mirror src/lib/constants.ts) ──────────────────────────────

export const PROPERTY_TYPES = ["SHOP", "HOUSE", "ROOM", "HOSTEL"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const CITY_ZONES = [
  "Gilgit",
  "Hunza",
  "Skardu",
  "Ghizer",
  "Ghanche",
  "Shigar",
  "Kharmang",
  "Nagar",
  "Astore",
  "Diamer",
] as const;
export type CityZone = (typeof CITY_ZONES)[number];

export const AMENITIES = [
  "FURNISHED",
  "WATER",
  "ELECTRICITY_BACKUP",
  "PARKING",
  "INTERNET",
  "HEATING",
  "KITCHEN",
  "ATTACHED_BATH",
  "SECURITY",
  "GARDEN",
] as const;
export type AmenityKey = (typeof AMENITIES)[number];

// ─── REST contract (mirror src/types/index.ts) ────────────────────────────────

export interface PricePredictionRequest {
  type: PropertyType;
  cityZone: CityZone;
  area: string; // free-text neighbourhood (not used as an ML feature)
  rooms: number;
  size: number | null;
  amenities: AmenityKey[];
}

export interface PricePredictionResponse {
  predictedPrice: number;
  low: number;
  high: number;
  confidence: number; // 0..1
  features: Record<string, number | string>;
  explanation: string;
}

export interface SimilarPropertyCandidate {
  id: string;
  type: PropertyType;
  cityZone: CityZone;
  price: number;
  rooms: number;
  size: number | null;
  amenities: AmenityKey[];
}

export interface SimilarPropertyTarget {
  type: PropertyType;
  cityZone: CityZone;
  price: number;
  rooms: number;
  size: number | null;
  amenities: AmenityKey[];
}

export interface SimilarPropertyRequest {
  propertyId: string;
  candidates: SimilarPropertyCandidate[];
  target: SimilarPropertyTarget;
  k?: number;
}

export interface SimilarPropertyMatch {
  id: string;
  similarity: number; // 0..1
  distance: number;
}

export interface SimilarPropertyResponse {
  matches: SimilarPropertyMatch[];
  method: string;
}

// ─── Internal training-row shape ─────────────────────────────────────────────

export interface TrainingListing {
  id: string;
  type: PropertyType;
  cityZone: CityZone;
  area: string;
  price: number; // PKR / month — TARGET for the forest
  rooms: number;
  size: number; // sq ft (imputed, never null after preprocessing)
  amenities: AmenityKey[];
}
