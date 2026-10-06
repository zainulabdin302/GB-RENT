/**
 * GB Rent — shared API helpers.
 *
 * Centralises:
 *   - error mapping (AuthError / Prisma errors / generic) to JSON responses
 *   - PropertyDTO mapping (Prisma row + includes → flat DTO with JSON-parsed amenities)
 *   - batched "favorited" flag attachment for the logged-in user
 *   - light-weight input validation helpers
 *
 * Routes keep their own try/catch boundaries; they `throw new AuthError(...)`,
 * `throw new ValidationError(...)` etc. and call `jsonError(e)` at the catch
 * site. This mirrors the documented pattern in the worklog.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AuthError } from "@/lib/session";
import { db } from "@/lib/db";
import type { PropertyDTO, PropertyImageDTO, UserDTO } from "@/types";
import type { AmenityKey, PropertyType, CityZone } from "@/lib/constants";

// Re-export the client class so routes can do `instanceof Prisma.PrismaClientKnownRequestError`.
export { Prisma };
export { db };

// ─── Typed Prisma payloads (for the mapper) ──────────────────────────────────

export type PropertyWithRelations = Prisma.PropertyGetPayload<{
  include: {
    images: { orderBy: { position: "asc" } };
    user: { select: { id: true; name: true; email: true; phone: true } };
  };
}>;

// ─── Errors ───────────────────────────────────────────────────────────────────

/** Thrown for 400-shaped validation problems. Caught by jsonError(). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Thrown for 404s — used by routes that look up resources. */
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Thrown for 409s — e.g. duplicate email / duplicate favorite. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Map any thrown error to a JSON NextResponse. Routes wrap their handlers
 * in `try { ... } catch (e) { return jsonError(e); }`.
 */
export function jsonError(e: unknown) {
  if (e instanceof AuthError) {
    const status = e.code === "UNAUTHORIZED" ? 401 : 403;
    return NextResponse.json({ error: e.message }, { status });
  }
  if (e instanceof ValidationError) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  if (e instanceof NotFoundError) {
    return NextResponse.json({ error: e.message }, { status: 404 });
  }
  if (e instanceof ConflictError) {
    return NextResponse.json({ error: e.message }, { status: 409 });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 = unique constraint violation → 409
    if (e.code === "P2002") {
      return NextResponse.json(
        { error: "Resource already exists" },
        { status: 409 }
      );
    }
    // P2025 = record not found (from update/delete with where) → 404
    if (e.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // P2003 = foreign key constraint violation. In this app the most common
    // cause is a stale JWT session: the user signed in, then the DB was
    // re-seeded (or the user was deleted), so the user ID in the token no
    // longer exists. Give the user an actionable message instead of the
    // cryptic "Database error: P2003".
    if (e.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "Your session is no longer valid. Please sign out and sign in again, then retry.",
        },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: `Database error: ${e.code}` },
      { status: 400 }
    );
  }
  console.error("[api] unhandled error:", e);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// ─── DTO mappers ─────────────────────────────────────────────────────────────

export function toUserDTO(u: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  createdAt: Date;
}): UserDTO {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role as UserDTO["role"],
    createdAt: u.createdAt.toISOString(),
  };
}

function parseAmenities(raw: string): AmenityKey[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AmenityKey[]) : [];
  } catch {
    return [];
  }
}

export function toPropertyDTO(
  p: PropertyWithRelations,
  favoritedSet?: Set<string>
): PropertyDTO {
  const images: PropertyImageDTO[] = p.images.map((img) => ({
    id: img.id,
    url: img.url,
    position: img.position,
  }));
  const dto: PropertyDTO = {
    id: p.id,
    title: p.title,
    type: p.type as PropertyType,
    address: p.address,
    area: p.area,
    cityZone: p.cityZone as CityZone,
    price: p.price,
    rooms: p.rooms,
    size: p.size,
    amenities: parseAmenities(p.amenities),
    description: p.description,
    latitude: p.latitude,
    longitude: p.longitude,
    status: p.status as PropertyDTO["status"],
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    userId: p.userId,
    user: {
      id: p.user.id,
      name: p.user.name,
      email: p.user.email,
      phone: p.user.phone,
    },
    images,
  };
  if (favoritedSet) {
    dto.favorited = favoritedSet.has(p.id);
  }
  return dto;
}

/**
 * Batch-fetch the current user's favorite property IDs and return a Set,
 * so toPropertyDTO() can stamp `favorited: boolean` per item in one pass.
 * Returns undefined if `userId` is null.
 */
export async function buildFavoritedSet(
  userId: string | null,
  propertyIds: string[]
): Promise<Set<string> | undefined> {
  if (!userId || propertyIds.length === 0) return undefined;
  const rows = await db.favorite.findMany({
    where: { userId, propertyId: { in: propertyIds } },
    select: { propertyId: true },
  });
  return new Set(rows.map((r) => r.propertyId));
}

// ─── Validation helpers ───────────────────────────────────────────────────────

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function toInt(v: unknown, fallback?: number): number | undefined {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < -2147483648 || n > 2147483647) return undefined;
  return n;
}

export function toFloat(v: unknown, fallback?: number): number | undefined {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}
