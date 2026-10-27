import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/session";

export async function GET() {
  try {
    const { user } = await requireAuth();
    const count = await db.message.count({
      where: {
        senderId: { not: user.id }, readAt: null,
        conversation: { OR: [{ renterId: user.id }, { ownerId: user.id }] },
      },
    });
    return NextResponse.json({ count });
  } catch (error) { return jsonError(error); }
}
