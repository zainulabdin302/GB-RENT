/**
 * GET /api/admin/pending-count — admin only.
 *
 * Returns the count of listings awaiting approval (status = PENDING).
 * Drives the notification dot on the "Admin" nav button in the header.
 *
 * Lighter than /api/admin/stats (which aggregates the full dashboard) —
 * this endpoint just returns a single integer for the badge, so the header
 * can poll it cheaply every ~30s.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import { jsonError } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  try {
    await requireAdmin();

    const count = await db.property.count({
      where: { status: "PENDING" },
    });

    return NextResponse.json({ count });
  } catch (e) {
    return jsonError(e);
  }
}
