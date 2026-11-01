/**
 * PATCH /api/admin/properties/[id]  — { status: "APPROVED" | "REJECTED" }
 *
 * Updates property status. Returns PropertyDTO. 400 on invalid status.
 * requireAdmin → 401/403.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import {
  toPropertyDTO,
  jsonError,
  ValidationError,
  NotFoundError,
} from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/session";

const VALID_STATUSES = new Set(["APPROVED", "REJECTED"]);

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new ValidationError("Invalid JSON body");
    }
    const { status } = body as Record<string, unknown>;
    if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
      throw new ValidationError(
        'status must be "APPROVED" or "REJECTED"'
      );
    }

    const existing = await db.property.findUnique({
      where: { id },
      select: { id: true, paymentStatus: true },
    });
    if (!existing) throw new NotFoundError("Property not found");

    if (status === "APPROVED" && existing.paymentStatus !== "VERIFIED") {
      throw new ValidationError("Verify the listing payment before approving this property");
    }

    const updated = await db.property.update({
      where: { id },
      data: status === "APPROVED" ? { status: "APPROVED" } : { status: "REJECTED" },
      include: {
        images: { orderBy: { position: "asc" } },
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    return NextResponse.json(toPropertyDTO(updated));
  } catch (e) {
    return jsonError(e);
  }
}
