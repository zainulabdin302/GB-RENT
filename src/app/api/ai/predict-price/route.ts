/** Compare live, approved listings from the same district and property type. */
import { NextResponse } from "next/server";
import { jsonError, ValidationError } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/session";
import { estimateRent } from "@/lib/rent-estimate";
import { db } from "@/lib/db";
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
    if (!Number.isSafeInteger(rooms) || rooms < 0 || rooms > 2147483647)
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

    if (b.propertyId !== undefined && (typeof b.propertyId !== "string" || !b.propertyId.trim()))
      throw new ValidationError("Invalid property ID");
    const request: PricePredictionRequest = {
      propertyId: b.propertyId as string | undefined,
      type: b.type as PropertyType,
      cityZone: b.cityZone as CityZone,
      area: b.area.trim(),
      rooms,
      size,
      amenities,
    };

    // Read live records on every request; no synthetic training set or stale model.
    const candidates = await db.property.findMany({
      where: { status: "APPROVED", cityZone: request.cityZone, type: request.type,
        ...(request.propertyId ? { id: { not: request.propertyId } } : {}),
        NOT: { images: { some: { url: { startsWith: "/uploads/seed-" } } } },
      },
      select: { id:true,userId:true,title:true,type:true,cityZone:true,area:true,price:true,rooms:true,size:true,amenities:true,status:true,images:{select:{url:true}} },
    });
    return NextResponse.json(estimateRent(request, candidates), { headers: { "Cache-Control":"no-store" } });
  } catch (e) {
    return jsonError(e);
  }
}
