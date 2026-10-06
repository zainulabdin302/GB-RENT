/**
 * GET /api/properties/mine  — auth: current user's own properties (ALL statuses,
 * including PENDING and REJECTED, which the public /api/properties endpoint
 * hides). Used by the dashboard "My listings" tab.
 *
 * Each item extends PropertyDTO with two extra counts so the dashboard can
 * show "3 inquiries · 5 favorites" without an extra round-trip:
 *   - inquiryCount  — number of Inquiries rows on this property
 *   - favoriteCount — number of Favorites rows on this property
 *
 * Returns { items: MinePropertyDTO[]; total: number }.
 * Items are ordered newest-first (matches the dashboard convention).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import { toPropertyDTO, jsonError } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/session";
import type { PropertyDTO } from "@/types";

export type MinePropertyDTO = PropertyDTO & {
  inquiryCount: number;
  favoriteCount: number;
};

export async function GET() {
  try {
    const ctx = await requireAuth();

    const rows = await db.property.findMany({
      where: { userId: ctx.user.id },
      include: {
        images: { orderBy: { position: "asc" } },
        user: { select: { id: true, name: true, email: true, phone: true } },
        _count: { select: { inquiries: true, favorites: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const items: MinePropertyDTO[] = rows.map((r) => {
      // Strip the Prisma `_count` helper before handing to the DTO mapper
      // (toPropertyDTO expects the PropertyWithRelations shape).
      const { _count, ...rest } = r;
      return {
        ...toPropertyDTO(rest),
        inquiryCount: _count.inquiries,
        favoriteCount: _count.favorites,
      };
    });

    return NextResponse.json({ items, total: items.length });
  } catch (e) {
    return jsonError(e);
  }
}
