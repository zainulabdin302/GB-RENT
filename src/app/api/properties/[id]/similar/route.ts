/**
 * GET /api/properties/[id]/similar
 *
 * Flow:
 *   1. Load the target property (404 if missing; visibility rules same as
 *      the detail GET — APPROVED, or owner/admin).
 *   2. Build a candidate set: up to 50 APPROVED properties of the SAME type,
 *      excluding the target itself. If fewer than 5 same-type candidates,
 *      fall back to ALL types so the model has enough signal.
 *   3. Build a SimilarPropertyRequest and call the AI service via the
 *      ai-client (`findSimilarProperties`).
 *   4. Hydrate the returned match IDs back into full PropertyDTOs (preserve
 *      AI order, attach `similarity: number`). Auth optional — if authed,
 *      stamp `favorited: boolean` on each match.
 *
 * On AI service error → 502.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import {
  toPropertyDTO,
  buildFavoritedSet,
  jsonError,
  NotFoundError,
} from "@/lib/api-helpers";
import { getAuth } from "@/lib/session";
import { findSimilarProperties } from "@/lib/ai-client";
import type { AmenityKey } from "@/lib/constants";
import type { PropertyDTO, SimilarPropertyRequest } from "@/types";

function parseAmenities(raw: string): AmenityKey[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AmenityKey[]) : [];
  } catch {
    return [];
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const target = await db.property.findUnique({
      where: { id },
      include: {
        images: { orderBy: { position: "asc" } },
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });
    if (!target) throw new NotFoundError("Property not found");

    // Visibility: non-APPROVED visible only to owner/admin.
    if (target.status !== "APPROVED") {
      const auth = await getAuth();
      const isOwner = auth?.user.id === target.userId;
      const isAdmin = auth?.user.role === "ADMIN";
      if (!isOwner && !isAdmin) throw new NotFoundError("Property not found");
    }

    // Step 2: build candidate set — same type first.
    let candidates = await db.property.findMany({
      where: {
        id: { not: id },
        status: "APPROVED",
        type: target.type,
      },
      take: 50,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        cityZone: true,
        price: true,
        rooms: true,
        size: true,
        amenities: true,
      },
    });

    // Fall back to all types if we have fewer than 5 same-type matches.
    if (candidates.length < 5) {
      const more = await db.property.findMany({
        where: {
          id: { not: id },
          status: "APPROVED",
          NOT: { type: target.type },
        },
        take: 50 - candidates.length,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          cityZone: true,
          price: true,
          rooms: true,
          size: true,
          amenities: true,
        },
      });
      candidates = [...candidates, ...more];
    }

    if (candidates.length === 0) {
      // No candidates at all → return empty matches.
      return NextResponse.json({ matches: [] });
    }

    // Step 3: build request and call the AI service.
    const request: SimilarPropertyRequest = {
      propertyId: target.id,
      target: {
        type: target.type as SimilarPropertyRequest["target"]["type"],
        cityZone: target.cityZone as SimilarPropertyRequest["target"]["cityZone"],
        price: target.price,
        rooms: target.rooms,
        size: target.size,
        amenities: parseAmenities(target.amenities),
      },
      candidates: candidates.map((c) => ({
        id: c.id,
        type: c.type as SimilarPropertyRequest["candidates"][number]["type"],
        cityZone: c.cityZone as SimilarPropertyRequest["candidates"][number]["cityZone"],
        price: c.price,
        rooms: c.rooms,
        size: c.size,
        amenities: parseAmenities(c.amenities),
      })),
    };

    let aiResponse;
    try {
      aiResponse = await findSimilarProperties(request);
    } catch (e) {
      console.error("[api/similar] AI service error:", e);
      return NextResponse.json(
        { error: "AI service unavailable. Please try again later." },
        { status: 502 }
      );
    }

    // Step 4: hydrate match IDs into PropertyDTOs, preserving AI order.
    const matchIds = aiResponse.matches.map((m) => m.id);
    const similarityById = new Map<string, number>(
      aiResponse.matches.map((m) => [m.id, m.similarity])
    );

    const rows = await db.property.findMany({
      where: { id: { in: matchIds } },
      include: {
        images: { orderBy: { position: "asc" } },
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    // Sort rows in the same order returned by the AI service.
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const orderedRows = matchIds
      .map((mid) => rowById.get(mid))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));

    const auth = await getAuth();
    const favoritedSet = await buildFavoritedSet(
      auth?.user.id ?? null,
      orderedRows.map((r) => r.id)
    );

    const matches = orderedRows.map((r) => {
      const dto = toPropertyDTO(r, favoritedSet) as PropertyDTO & {
        similarity: number;
      };
      dto.similarity = similarityById.get(r.id) ?? 0;
      return dto;
    });

    return NextResponse.json({ matches });
  } catch (e) {
    return jsonError(e);
  }
}
