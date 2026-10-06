/**
 * POST /api/ai/predict-price  — auth required.
 * Body: PricePredictionRequest → calls AI service `predictPrice()` →
 * returns PricePredictionResponse.
 *
 * On AI service error → 502.
 */
import { NextResponse } from "next/server";
import { jsonError, ValidationError } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/session";
import { predictPrice } from "@/lib/ai-client";
import {
  PROPERTY_TYPES,
  CITY_ZONES,
  AMENITIES,
} from "@/lib/constants";
import type {
  AmenityKey,
  PropertyType,
  CityZone,
} from "@/lib/constants";
import type { PricePredictionRequest } from "@/types";

const AMENITY_KEYS = new Set<string>(AMENITIES.map((a) => a.key));
const PROPERTY_TYPE_SET = new Set<string>(PROPERTY_TYPES);
const CITY_ZONE_SET = new Set<string>(CITY_ZONES);

export async function POST(req: Request) {
  try {
    await requireAuth();

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new ValidationError("Invalid JSON body");
    }
    const b = body as Record<string, unknown>;

    if (typeof b.type !== "string" || !PROPERTY_TYPE_SET.has(b.type))
      throw new ValidationError("Invalid property type");
    if (typeof b.cityZone !== "string" || !CITY_ZONE_SET.has(b.cityZone))
      throw new ValidationError("Invalid city zone");
    if (typeof b.area !== "string" || b.area.trim().length === 0)
      throw new ValidationError("area is required");
    const rooms = Number(b.rooms);
    if (!Number.isFinite(rooms) || rooms < 0)
      throw new ValidationError("rooms must be a non-negative number");

    let size: number | null = null;
    if (b.size !== undefined && b.size !== null && b.size !== "") {
      const s = Number(b.size);
      if (!Number.isFinite(s) || s <= 0)
        throw new ValidationError("size must be a positive number");
      size = s;
    }

    if (!Array.isArray(b.amenities)) throw new ValidationError("amenities must be an array");
    const amenities: AmenityKey[] = [];
    const seen = new Set<string>();
    for (const a of b.amenities) {
      if (typeof a === "string" && AMENITY_KEYS.has(a) && !seen.has(a)) {
        seen.add(a);
        amenities.push(a as AmenityKey);
      }
    }

    const request: PricePredictionRequest = {
      type: b.type as PropertyType,
      cityZone: b.cityZone as CityZone,
      area: b.area.trim(),
      rooms,
      size,
      amenities,
    };

    try {
      const response = await predictPrice(request);
      return NextResponse.json(response);
    } catch (e) {
      console.error("[api/predict-price] AI service error:", e);
      return NextResponse.json(
        { error: "AI service unavailable. Please try again later." },
        { status: 502 }
      );
    }
  } catch (e) {
    return jsonError(e);
  }
}
