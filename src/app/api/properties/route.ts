import { validImageUrls } from "@/lib/uploads";
/**
 * GET  /api/properties        — public search (APPROVED only)
 * POST /api/properties        — auth: create a new PENDING property (owner only)
 *
 * GET search query params:
 *   q          — ILIKE title/description/area/address
 *   type       — SHOP | HOUSE | ROOM | HOSTEL (or ALL / omitted)
 *   cityZone   — one of CITY_ZONES (or ALL / omitted)
 *   minPrice   — int PKR
 *   maxPrice   — int PKR
 *   rooms      — exact match (>=0)
 *   amenities  — comma-separated AmenityKey list (AND filter)
 *   sort       — newest | price_asc | price_desc (default: newest)
 *   page       — 1-based (default 1)
 *   pageSize   — default 12, capped at 48
 *
 * Returns Paginated<PropertyDTO> with images (position ASC) and user
 * (id/name/email/phone). If the request is authenticated (cookie session),
 * each item has `favorited: boolean` stamped from the Favorites table.
 *
 * POST body: PropertyInput. Validates and creates with status PENDING,
 * plus PropertyImage rows from `images: string[]` (relative URLs from /api/upload).
 */
import { NextResponse } from "next/server";
import { db, Prisma } from "@/lib/api-helpers";
import {
  toPropertyDTO,
  buildFavoritedSet,
  jsonError,
  ValidationError,
  isNonEmptyString,
  toInt,
  toFloat,
} from "@/lib/api-helpers";
import { requireAuth, getAuth } from "@/lib/session";
import {
  PROPERTY_TYPES,
  CITY_ZONES,
  AMENITIES,
} from "@/lib/constants";
import type { AmenityKey, PropertyType, CityZone } from "@/lib/constants";
import type { Paginated, PropertyDTO, PropertyInput } from "@/types";

const AMENITY_KEYS = new Set<string>(AMENITIES.map((a) => a.key));
const PROPERTY_TYPE_SET = new Set<string>(PROPERTY_TYPES);
const CITY_ZONE_SET = new Set<string>(CITY_ZONES);

function buildSearchWhere(params: URLSearchParams) {
  const where: Prisma.PropertyWhereInput = { status: "APPROVED", paymentStatus: "VERIFIED" };

  const q = params.get("q");
  if (q && q.trim()) {
    const needle = q.trim();
    where.OR = [
      { title: { contains: needle } },
      { description: { contains: needle } },
      { area: { contains: needle } },
      { address: { contains: needle } },
    ];
  }

  const type = params.get("type");
  if (type && type !== "ALL" && PROPERTY_TYPE_SET.has(type)) {
    where.type = type;
  }

  const cityZone = params.get("cityZone");
  if (cityZone && cityZone !== "ALL" && CITY_ZONE_SET.has(cityZone)) {
    where.cityZone = cityZone;
  }

  const minPrice = toInt(params.get("minPrice"));
  if (minPrice !== undefined && minPrice >= 0) where.price = { gte: minPrice };
  const maxPrice = toInt(params.get("maxPrice"));
  if (maxPrice !== undefined && maxPrice >= 0) {
    where.price = { ...(where.price as object | undefined), lte: maxPrice };
  }

  const rooms = toInt(params.get("rooms"));
  if (rooms !== undefined && rooms >= 0) where.rooms = rooms;

  // Amenities — SQLite stores them as a JSON string array (TEXT column).
  // Prisma has no native JSON-array-contains for SQLite, so we use the
  // "string contains quoted token" trick: the array ["PARKING","WATER"]
  // is stored as the literal text '["PARKING","WATER"]' and a substring
  // search for `"PARKING"` matches. We AND multiple contains clauses so
  // every requested amenity must be present. (Acceptable for dev dataset
  // size; for production, swap to Postgres + a GIN index on a JSONB column.)
  const amenitiesParam = params.get("amenities");
  if (amenitiesParam) {
    const keys = amenitiesParam
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && AMENITY_KEYS.has(s)) as AmenityKey[];
    if (keys.length > 0) {
      where.AND = keys.map((k) => ({
        amenities: { contains: `"${k}"` },
      }));
    }
  }

  return where;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const params = url.searchParams;

    const page = Math.max(1, toInt(params.get("page"), 1) ?? 1);
    let pageSize = toInt(params.get("pageSize"), 12) ?? 12;
    if (pageSize < 1) pageSize = 12;
    if (pageSize > 48) pageSize = 48;

    const sort = params.get("sort") ?? "newest";
    const orderBy: Prisma.PropertyOrderByWithRelationInput[] =
      sort === "price_asc"
        ? [{ price: "asc" }]
        : sort === "price_desc"
          ? [{ price: "desc" }]
          : [{ createdAt: "desc" }];

    const where = buildSearchWhere(params);

    const [total, rows] = await Promise.all([
      db.property.count({ where }),
      db.property.findMany({
        where,
        include: {
          images: { orderBy: { position: "asc" } },
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Stamp favorited flags if the request is authenticated (cookie session).
    const auth = await getAuth();
    const favoritedSet = await buildFavoritedSet(
      auth?.user.id ?? null,
      rows.map((r) => r.id)
    );

    const items: PropertyDTO[] = rows.map((r) => toPropertyDTO(r, favoritedSet));

    const result: Paginated<PropertyDTO> = {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e);
  }
}

function validatePropertyInput(body: unknown): PropertyInput {
  if (!body || typeof body !== "object") throw new ValidationError("Invalid JSON body");
  const b = body as Record<string, unknown>;

  if (!isNonEmptyString(b.title)) throw new ValidationError("Title is required");
  if (typeof b.type !== "string" || !PROPERTY_TYPE_SET.has(b.type))
    throw new ValidationError("Invalid property type");
  if (!isNonEmptyString(b.address)) throw new ValidationError("Address is required");
  if (!isNonEmptyString(b.area)) throw new ValidationError("Area is required");
  if (typeof b.cityZone !== "string" || !CITY_ZONE_SET.has(b.cityZone))
    throw new ValidationError("Invalid city zone");
  const price = toFloat(b.price);
  if (price === undefined || price < 1 || price > 2147483647)
    throw new ValidationError("Price must be a positive number");
  const rooms = toInt(b.rooms);
  if (rooms === undefined || rooms < 0)
    throw new ValidationError("Rooms must be a non-negative integer");
  if (!isNonEmptyString(b.description))
    throw new ValidationError("Description is required");

  // Amenities: must be an array of valid AmenityKey strings (dedupe + filter).
  let amenities: AmenityKey[] = [];
  if (Array.isArray(b.amenities)) {
    const seen = new Set<string>();
    for (const a of b.amenities) {
      if (typeof a === "string" && AMENITY_KEYS.has(a) && !seen.has(a)) {
        seen.add(a);
        amenities.push(a as AmenityKey);
      }
    }
  } else {
    throw new ValidationError("Amenities must be an array");
  }

  const images = validImageUrls(b.images);
  if (!images) throw new ValidationError("Add 1–10 uploaded photos");

  let size: number | null = null;
  if (b.size !== undefined && b.size !== null && b.size !== "") {
    const s = toInt(b.size);
    if (s === undefined || s <= 0) throw new ValidationError("Size must be a positive whole number");
    size = s;
  }

  let latitude: number | null = null;
  let longitude: number | null = null;
  if (b.latitude !== undefined && b.latitude !== null) {
    const lat = toFloat(b.latitude);
    if (lat === undefined || lat < -90 || lat > 90)
      throw new ValidationError("Invalid latitude");
    latitude = lat;
  }
  if (b.longitude !== undefined && b.longitude !== null) {
    const lng = toFloat(b.longitude);
    if (lng === undefined || lng < -180 || lng > 180)
      throw new ValidationError("Invalid longitude");
    longitude = lng;
  }

  return {
    title: (b.title as string).trim(),
    type: b.type as PropertyType,
    address: (b.address as string).trim(),
    area: (b.area as string).trim(),
    cityZone: b.cityZone as CityZone,
    price: Math.round(price as number),
    rooms: rooms as number,
    size,
    amenities,
    description: (b.description as string).trim(),
    latitude,
    longitude,
    images,
  };
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json().catch(() => null);
    const input = validatePropertyInput(body);

    const settings = await db.platformSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
    });

    const property = await db.property.create({
      data: {
        title: input.title,
        type: input.type,
        address: input.address,
        area: input.area,
        cityZone: input.cityZone,
        price: input.price,
        rooms: input.rooms,
        size: input.size,
        amenities: JSON.stringify(input.amenities),
        description: input.description,
        latitude: input.latitude,
        longitude: input.longitude,
        status: "PENDING",
        paymentStatus: "UNPAID",
        listingFeeSnapshot: settings.listingFee,
        userId: ctx.user.id,
        images: {
          create: input.images.map((url, i) => ({
            url,
            position: i,
          })),
        },
      },
      include: {
        images: { orderBy: { position: "asc" } },
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    return NextResponse.json(toPropertyDTO(property), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
