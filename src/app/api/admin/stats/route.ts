/**
 * GET /api/admin/stats  — admin dashboard statistics.
 *
 * Returns:
 *   totalUsers, totalProperties, pending, approved, rejected,
 *   byType: { SHOP, HOUSE, ROOM, HOSTEL } counts,
 *   byCity: { Gilgit: n, Hunza: n, ... } for APPROVED only,
 *   avgPriceByType: { SHOP: avg, HOUSE: avg, ... } for APPROVED,
 *   avgPriceByCity: { Gilgit: avg, Hunza: avg, ... } for APPROVED,
 *   recentListings: PropertyDTO[] (last 5 created, any status)
 *
 * We use group-by queries where possible; for averages SQLite's Prisma
 * `aggregate` supports `_avg.price` but only on a single where clause, so
 * we run several aggregates grouped by type/city and merge them.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import { toPropertyDTO, jsonError } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/session";
import {
  PROPERTY_TYPES,
  CITY_ZONES,
} from "@/lib/constants";
import type { PropertyDTO } from "@/types";

export async function GET() {
  try {
    await requireAdmin();

    // Counts
    const [
      totalUsers,
      totalProperties,
      pendingCount,
      approvedCount,
      rejectedCount,
      byTypeRows,
      byCityRowsApproved,
      recentListingsRaw,
    ] = await Promise.all([
      db.user.count(),
      db.property.count(),
      db.property.count({ where: { status: "PENDING" } }),
      db.property.count({ where: { status: "APPROVED" } }),
      db.property.count({ where: { status: "REJECTED" } }),
      // byType: counts per type (any status)
      db.property.groupBy({
        by: ["type"],
        _count: { _all: true },
      }),
      // byCity: counts per city (APPROVED only)
      db.property.groupBy({
        by: ["cityZone"],
        where: { status: "APPROVED" },
        _count: { _all: true },
      }),
      // recentListings: last 5 created, any status
      db.property.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          images: { orderBy: { position: "asc" } },
          user: { select: { id: true, name: true, email: true, phone: true } },
        },
      }),
    ]);

    // Average price by type (APPROVED only) — single groupBy with _avg.price.
    const avgByTypeRows = await db.property.groupBy({
      by: ["type"],
      where: { status: "APPROVED" },
      _avg: { price: true },
    });
    // Average price by city (APPROVED only)
    const avgByCityRows = await db.property.groupBy({
      by: ["cityZone"],
      where: { status: "APPROVED" },
      _avg: { price: true },
    });

    // Build the typed result objects, defaulting every known enum to 0.
    const byType: Record<string, number> = {};
    for (const t of PROPERTY_TYPES) byType[t] = 0;
    for (const r of byTypeRows) byType[r.type] = r._count._all;

    const byCity: Record<string, number> = {};
    for (const c of CITY_ZONES) byCity[c] = 0;
    for (const r of byCityRowsApproved) byCity[r.cityZone] = r._count._all;

    const avgPriceByType: Record<string, number | null> = {};
    for (const t of PROPERTY_TYPES) avgPriceByType[t] = null;
    for (const r of avgByTypeRows) {
      avgPriceByType[r.type] = r._avg.price !== null ? Math.round(r._avg.price) : null;
    }

    const avgPriceByCity: Record<string, number | null> = {};
    for (const c of CITY_ZONES) avgPriceByCity[c] = null;
    for (const r of avgByCityRows) {
      avgPriceByCity[r.cityZone] =
        r._avg.price !== null ? Math.round(r._avg.price) : null;
    }

    const recentListings: PropertyDTO[] = recentListingsRaw.map((p) =>
      toPropertyDTO(p)
    );

    return NextResponse.json({
      totalUsers,
      totalProperties,
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
      byType,
      byCity,
      avgPriceByType,
      avgPriceByCity,
      recentListings,
    });
  } catch (e) {
    return jsonError(e);
  }
}
