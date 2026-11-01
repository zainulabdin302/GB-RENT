import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import { jsonError, ValidationError, NotFoundError } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/session";

export async function GET(_req: Request, ctx: { params: Promise<{ propertyId: string }> }) {
  try {
    const auth = await requireAuth();
    const { propertyId } = await ctx.params;
    const property = await db.property.findUnique({ where: { id: propertyId } });
    if (!property || property.userId !== auth.user.id) throw new NotFoundError("Listing not found");
    const settings = await db.platformSettings.upsert({
      where: { id: "default" }, create: { id: "default" }, update: {},
    });
    return NextResponse.json({
      paymentStatus: property.paymentStatus,
      amount: property.listingFeeSnapshot,
      jazzCashAccount: settings.jazzCashAccount,
      easypaisaAccount: settings.easypaisaAccount,
      receiptUrl: property.paymentReceiptUrl,
      reference: property.paymentReference,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ propertyId: string }> }) {
  try {
    const auth = await requireAuth();
    const { propertyId } = await ctx.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw new ValidationError("Invalid payment submission");
    const receiptUrl = (body as Record<string, unknown>).receiptUrl;
    const reference = (body as Record<string, unknown>).reference;
    if (typeof receiptUrl !== "string" || !/^\/uploads\/[A-Za-z0-9._-]+$/.test(receiptUrl)) {
      throw new ValidationError("Upload a valid payment receipt image");
    }
    if (typeof reference !== "string" || reference.trim().length < 4 || reference.trim().length > 100) {
      throw new ValidationError("Enter the transaction ID/reference (4–100 characters)");
    }
    const property = await db.property.findUnique({ where: { id: propertyId } });
    if (!property || property.userId !== auth.user.id) throw new NotFoundError("Listing not found");
    if (property.status !== "PENDING") throw new ValidationError("Payment can only be submitted while your listing is pending admin review");
    if (property.paymentStatus === "VERIFIED") throw new ValidationError("Payment is already verified");
    const duplicate = await db.property.findFirst({
      where: { paymentReference: reference.trim(), NOT: { id: propertyId } },
      select: { id: true },
    });
    if (duplicate) throw new ValidationError("This transaction reference has already been submitted");
    const updated = await db.property.update({
      where: { id: propertyId },
      data: {
        paymentStatus: "PENDING_VERIFICATION",
        paymentReceiptUrl: receiptUrl,
        paymentReference: reference.trim(),
        paymentSubmittedAt: new Date(),
        paymentVerifiedAt: null,
      },
      select: { id: true, paymentStatus: true, listingFeeSnapshot: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return jsonError(error);
  }
}
