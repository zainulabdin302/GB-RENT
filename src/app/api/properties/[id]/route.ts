import { validImageUrls } from "@/lib/uploads";
/**
 * GET    /api/properties/[id]  — public if APPROVED; owner/admin otherwise (404 otherwise)
 * PUT    /api/properties/[id]  — owner or admin; owner edits reset status to PENDING
 * DELETE /api/properties/[id]  — owner or admin (cascade deletes images/favorites/inquiries)
 *
 * In Next.js 16, route-handler `params` is async — we await it before use.
 */
import { NextResponse } from "next/server";
import { db, Prisma } from "@/lib/api-helpers";
import {
  toPropertyDTO,
  buildFavoritedSet,
  jsonError,
  ValidationError,
  NotFoundError,
  isNonEmptyString,
  toFloat,
  toInt,
} from "@/lib/api-helpers";
import { getAuth, requireAuth } from "@/lib/session";
import {
  PROPERTY_TYPES,
  CITY_ZONES,
  AMENITIES,
} from "@/lib/constants";
import type { AmenityKey, PropertyType, CityZone } from "@/lib/constants";

const AMENITY_KEYS = new Set<string>(AMENITIES.map((a) => a.key));
const PROPERTY_TYPE_SET = new Set<string>(PROPERTY_TYPES);
const CITY_ZONE_SET = new Set<string>(CITY_ZONES);

async function loadProperty(id: string) {
  return db.property.findUnique({
    where: { id },
    include: {
      images: { orderBy: { position: "asc" } },
      user: { select: { id: true, name: true, email: true, phone: true } },
    },
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const property = await loadProperty(id);
    if (!property) throw new NotFoundError("Property not found");

    if (property.status !== "APPROVED") {
      // Only owner or admin may see non-approved listings.
      const auth = await getAuth();
      const isOwner = auth?.user.id === property.userId;
      const isAdmin = auth?.user.role === "ADMIN";
      if (!isOwner && !isAdmin) throw new NotFoundError("Property not found");
    }

    const auth = await getAuth();
    const favoritedSet = await buildFavoritedSet(auth?.user.id ?? null, [property.id]);
    return NextResponse.json(toPropertyDTO(property, favoritedSet));
  } catch (e) {
    return jsonError(e);
  }
}

interface UpdateFields {
  title?: string;
  type?: PropertyType;
  address?: string;
  area?: string;
  cityZone?: CityZone;
  price?: number;
  rooms?: number;
  size?: number | null;
  amenities?: AmenityKey[];
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  images?: string[];
}

function validateUpdate(body: unknown): UpdateFields {
  if (!body || typeof body !== "object") throw new ValidationError("Invalid JSON body");
  const b = body as Record<string, unknown>;
  const out: UpdateFields = {};

  if (b.title !== undefined) {
    if (!isNonEmptyString(b.title)) throw new ValidationError("Title cannot be empty");
    out.title = (b.title as string).trim();
  }
  if (b.type !== undefined) {
    if (typeof b.type !== "string" || !PROPERTY_TYPE_SET.has(b.type))
      throw new ValidationError("Invalid property type");
    out.type = b.type as PropertyType;
  }
  if (b.address !== undefined) {
    if (!isNonEmptyString(b.address)) throw new ValidationError("Address cannot be empty");
    out.address = (b.address as string).trim();
  }
  if (b.area !== undefined) {
    if (!isNonEmptyString(b.area)) throw new ValidationError("Area cannot be empty");
    out.area = (b.area as string).trim();
  }
  if (b.cityZone !== undefined) {
    if (typeof b.cityZone !== "string" || !CITY_ZONE_SET.has(b.cityZone))
      throw new ValidationError("Invalid city zone");
    out.cityZone = b.cityZone as CityZone;
  }
  if (b.price !== undefined) {
    const price = toFloat(b.price);
    if (price === undefined || price < 1 || price > 2147483647)
      throw new ValidationError("Price must be a positive number");
    out.price = Math.round(price);
  }
  if (b.rooms !== undefined) {
    const rooms = toInt(b.rooms);
    if (rooms === undefined || rooms < 0)
      throw new ValidationError("Rooms must be a non-negative integer");
    out.rooms = rooms;
  }
  if (b.size !== undefined && b.size !== null && b.size !== "") {
    const s = toInt(b.size);
    if (s === undefined || s <= 0) throw new ValidationError("Size must be a positive whole number");
    out.size = s;
  } else if (b.size === null || b.size === "") {
    out.size = null;
  }
  if (b.description !== undefined) {
    if (!isNonEmptyString(b.description))
      throw new ValidationError("Description cannot be empty");
    out.description = (b.description as string).trim();
  }
  if (b.amenities !== undefined) {
    if (!Array.isArray(b.amenities)) throw new ValidationError("Amenities must be an array");
    const seen = new Set<string>();
    const arr: AmenityKey[] = [];
    for (const a of b.amenities) {
      if (typeof a === "string" && AMENITY_KEYS.has(a) && !seen.has(a)) {
        seen.add(a);
        arr.push(a as AmenityKey);
      }
    }
    out.amenities = arr;
  }
  if (b.latitude !== undefined && b.latitude !== null) {
    const lat = toFloat(b.latitude);
    if (lat === undefined || lat < -90 || lat > 90)
      throw new ValidationError("Invalid latitude");
    out.latitude = lat;
  } else if (b.latitude === null) {
    out.latitude = null;
  }
  if (b.longitude !== undefined && b.longitude !== null) {
    const lng = toFloat(b.longitude);
    if (lng === undefined || lng < -180 || lng > 180)
      throw new ValidationError("Invalid longitude");
    out.longitude = lng;
  } else if (b.longitude === null) {
    out.longitude = null;
  }
  if (b.images !== undefined) {
    const images = validImageUrls(b.images);
    if (!images) throw new ValidationError("Add 1–10 uploaded photos");
    out.images = images;
  }
  return out;
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const authCtx = await requireAuth();

    const existing = await loadProperty(id);
    if (!existing) throw new NotFoundError("Property not found");

    const isOwner = authCtx.user.id === existing.userId;
    const isAdmin = authCtx.user.role === "ADMIN";
    if (!isOwner && !isAdmin) throw new NotFoundError("Property not found");

    const body = await req.json().catch(() => null);
    const fields = validateUpdate(body);

    // Build the property update data (only the scalar fields).
    const data: Prisma.PropertyUpdateInput = {};
    if (fields.title !== undefined) data.title = fields.title;
    if (fields.type !== undefined) data.type = fields.type;
    if (fields.address !== undefined) data.address = fields.address;
    if (fields.area !== undefined) data.area = fields.area;
    if (fields.cityZone !== undefined) data.cityZone = fields.cityZone;
    if (fields.price !== undefined) data.price = fields.price;
    if (fields.rooms !== undefined) data.rooms = fields.rooms;
    if (fields.size !== undefined) data.size = fields.size;
    if (fields.amenities !== undefined)
      data.amenities = JSON.stringify(fields.amenities);
    if (fields.description !== undefined) data.description = fields.description;
    if (fields.latitude !== undefined) data.latitude = fields.latitude;
    if (fields.longitude !== undefined) data.longitude = fields.longitude;

    // Non-admin edits must reset status to PENDING (re-approval needed).
    if (!isAdmin && (Object.keys(data).length > 0 || fields.images !== undefined)) {
      data.status = "PENDING";
    }

    if (fields.images !== undefined) {
      data.images = {
        deleteMany: {},
        create: [...new Set(fields.images)].map((url, position) => ({ url, position })),
      };
    }
    if (Object.keys(data).length > 0) {
      await db.property.update({ where: { id }, data });
    }

    const refreshed = await loadProperty(id);
    if (!refreshed) throw new NotFoundError("Property not found");
    return NextResponse.json(toPropertyDTO(refreshed));
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const authCtx = await requireAuth();

    const existing = await db.property.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!existing) throw new NotFoundError("Property not found");

    const isOwner = authCtx.user.id === existing.userId;
    const isAdmin = authCtx.user.role === "ADMIN";
    if (!isOwner && !isAdmin) throw new NotFoundError("Property not found");

    // Cascade delete is configured in Prisma schema — one delete cascades
    // images, favorites, and inquiries.
    await db.property.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return jsonError(e);
  }
}
