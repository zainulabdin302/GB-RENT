/**
 * GET /api/inquiries/unread-count — auth required.
 *
 * Returns the count of UNREAD inquiries received by the current user
 * (i.e. inquiries on properties the user owns, where `readAt` is null).
 *
 * Drives the notification dot on the "Dashboard" nav button in the header.
 * Polled by the frontend every ~30s via TanStack Query (useNotifications hook).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import { jsonError } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/session";

export async function GET() {
  try {
    const ctx = await requireAuth();

    // Count inquiries ON this user's properties that are still unread.
    const count = await db.inquiry.count({
      where: {
        property: { userId: ctx.user.id },
        readAt: null,
      },
    });

    return NextResponse.json({ count });
  } catch (e) {
    return jsonError(e);
  }
}
