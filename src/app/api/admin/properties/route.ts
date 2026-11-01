/**
 * GET /api/admin/properties?status=PENDING|APPROVED|REJECTED|ALL
 *
 * Returns all properties (with user + first image) paginated.
 * Default pageSize = 20, page = 1, status = ALL (no filter).
 *
 * requireAdmin → 401 if not authed, 403 if not ADMIN.
 */
import { NextResponse } from "next/server";
import { db, Prisma } from "@/lib/api-helpers";
import { jsonError, toInt } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/session";
import type { Paginated, PropertyDTO } from "@/types";

const VALID_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "ALL"]);

export async function GET(req: Request) {
  try {
    await requireAdmin();

    const url = new URL(req.url);
    const params = url.searchParams;

    const statusParam = (params.get("status") ?? "ALL").toUpperCase();
    if (!VALID_STATUSES.has(statusParam)) {
      return NextResponse.json(
        { error: "Invalid status. Use PENDING, APPROVED, REJECTED, or ALL." },
        { status: 400 }
      );
    }

    const page = Math.max(1, toInt(params.get("page"), 1) ?? 1);
    let pageSize = toInt(params.get("pageSize"), 20) ?? 20;
    if (pageSize < 1) pageSize = 20;
    if (pageSize > 100) pageSize = 100;

    const where: Prisma.PropertyWhereInput =
      statusParam === "ALL" ? {} : { status: statusParam };

    const [total, rows] = await Promise.all([
      db.property.count({ where }),
      db.property.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          images: { orderBy: { position: "asc" }, take: 1 },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Map to PropertyDTO shape (with whatever images each row has).
    const items: PropertyDTO[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type as PropertyDTO["type"],
      address: r.address,
      area: r.area,
      cityZone: r.cityZone as PropertyDTO["cityZone"],
      price: r.price,
      rooms: r.rooms,
      size: r.size,
      amenities: safeParseAmenities(r.amenities),
      description: r.description,
      latitude: r.latitude,
      longitude: r.longitude,
      status: r.status as PropertyDTO["status"],
      paymentStatus: r.paymentStatus as PropertyDTO["paymentStatus"],
      listingFeeSnapshot: r.listingFeeSnapshot,
      paymentReceiptUrl: r.paymentReceiptUrl,
      paymentReference: r.paymentReference,
      paymentSubmittedAt: r.paymentSubmittedAt?.toISOString() ?? null,
      paymentVerifiedAt: r.paymentVerifiedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      userId: r.userId,
      user: {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        phone: r.user.phone,
      },
      images: r.images.map((img) => ({
        id: img.id,
        url: img.url,
        position: img.position,
      })),
    }));

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

function safeParseAmenities(raw: string): PropertyDTO["amenities"] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PropertyDTO["amenities"]) : [];
  } catch {
    return [];
  }
}
