import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import { jsonError, ValidationError, NotFoundError } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/session";

export async function PATCH(req: Request, ctx: { params: Promise<{ propertyId: string }> }) {
  try {
    await requireAdmin();
    const { propertyId } = await ctx.params;
    const body = await req.json().catch(() => null);
    const action = body && typeof body === "object" ? (body as Record<string, unknown>).action : null;
    if (action !== "VERIFY" && action !== "REJECT") {
      throw new ValidationError('action must be "VERIFY" or "REJECT"');
    }
    const property = await db.property.findUnique({ where: { id: propertyId }, select: { id: true, paymentStatus: true } });
    if (!property) throw new NotFoundError("Listing not found");
    if (property.paymentStatus !== "PENDING_VERIFICATION") {
      throw new ValidationError("This payment is not awaiting verification");
    }
    const updated = await db.property.update({
      where: { id: propertyId },
      data: action === "VERIFY"
        ? { paymentStatus: "VERIFIED", paymentVerifiedAt: new Date() }
        : { paymentStatus: "REJECTED", paymentVerifiedAt: null },
      select: { id: true, paymentStatus: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return jsonError(error);
  }
}
