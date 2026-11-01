import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import { jsonError } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  try {
    await requireAdmin();
    const rows = await db.property.findMany({
      where: { paymentStatus: "PENDING_VERIFICATION" },
      select: {
        id: true, title: true, listingFeeSnapshot: true, paymentReference: true,
        paymentReceiptUrl: true, paymentSubmittedAt: true,
        user: { select: { name: true, email: true, phone: true } },
      },
      orderBy: { paymentSubmittedAt: "asc" },
    });
    return NextResponse.json(rows);
  } catch (error) {
    return jsonError(error);
  }
}
