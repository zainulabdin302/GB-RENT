/**
 * DELETE /api/favorites/[propertyId]  — remove favorite by propertyId for current user
 *
 * Returns 204 on success (even if the favorite did not exist — idempotent).
 * Auth required.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import { jsonError } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/session";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ propertyId: string }> }
) {
  try {
    const { propertyId } = await ctx.params;
    const authCtx = await requireAuth();

    // Idempotent delete — if the favorite didn't exist, we still return 204.
    await db.favorite.deleteMany({
      where: { userId: authCtx.user.id, propertyId },
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return jsonError(e);
  }
}
