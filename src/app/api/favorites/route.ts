/**
 * GET  /api/favorites       — list current user's favorites with full PropertyDTOs
 * POST /api/favorites       — { propertyId } create favorite (409 on duplicate)
 *
 * Auth required. The Favorite model has a unique composite on
 * (userId, propertyId), so duplicates are guarded at the DB layer.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import {
  toPropertyDTO,
  buildFavoritedSet,
  jsonError,
  ValidationError,
  NotFoundError,
  isNonEmptyString,
} from "@/lib/api-helpers";
import { requireAuth } from "@/lib/session";
import type { FavoriteDTO } from "@/types";

export async function GET() {
  try {
    const ctx = await requireAuth();

    const favorites = await db.favorite.findMany({
      where: { userId: ctx.user.id, property: ctx.user.role === "ADMIN" ? {} : {
        OR: [{ status: "APPROVED" }, { userId: ctx.user.id }],
      } },
      orderBy: { createdAt: "desc" },
      include: {
        property: {
          include: {
            images: { orderBy: { position: "asc" } },
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
      },
    });

    // Favorites show the user's OWN saved properties, so by definition every
    // item is "favorited" — we still set the flag explicitly so the frontend
    // can use a uniform shape.
    const favoritedSet = new Set(favorites.map((f) => f.property.id));

    const items: FavoriteDTO[] = favorites.map((f) => ({
      id: f.id,
      createdAt: f.createdAt.toISOString(),
      property: toPropertyDTO(f.property, favoritedSet),
    }));

    return NextResponse.json(items);
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new ValidationError("Invalid JSON body");
    }
    const { propertyId } = body as Record<string, unknown>;
    if (!isNonEmptyString(propertyId)) {
      throw new ValidationError("propertyId is required");
    }

    // Apply the same visibility rules as the property detail endpoint.
    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { id: true, status: true, userId: true },
    });
    if (!property || (property.status !== "APPROVED" && property.userId !== ctx.user.id && ctx.user.role !== "ADMIN")) throw new NotFoundError("Property not found");

    // Check existing favorite first to give a clean 409 (Prisma P2002 also
    // works, but we get a nicer message this way).
    const existing = await db.favorite.findUnique({
      where: {
        userId_propertyId: {
          userId: ctx.user.id,
          propertyId,
        },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Property already saved to favorites" },
        { status: 409 }
      );
    }

    const favorite = await db.favorite.create({
      data: { userId: ctx.user.id, propertyId },
      include: {
        property: {
          include: {
            images: { orderBy: { position: "asc" } },
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
      },
    });

    const dto: FavoriteDTO = {
      id: favorite.id,
      createdAt: favorite.createdAt.toISOString(),
      property: toPropertyDTO(favorite.property, new Set([favorite.property.id])),
    };
    return NextResponse.json(dto, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
