/**
 * POST /api/inquiries/mark-read — auth required.
 *
 * Marks ALL inquiries received by the current user (on their properties) as
 * read by setting `readAt = now()`. Called when the user opens the
 * "Inquiries received" tab in their dashboard.
 *
 * Idempotent: re-running on already-read inquiries is a no-op (readAt stays
 * the earlier timestamp; we only update rows where readAt IS NULL).
 *
 * Returns { marked: number } — how many inquiries were newly marked read.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import { jsonError } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/session";

export async function POST() {
  try {
    const ctx = await requireAuth();

    const result = await db.inquiry.updateMany({
      where: {
        property: { userId: ctx.user.id },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ marked: result.count });
  } catch (e) {
    return jsonError(e);
  }
}
