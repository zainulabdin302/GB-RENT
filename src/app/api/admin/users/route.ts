/**
 * GET /api/admin/users  — list all users (without passwordHash).
 * requireAdmin → 401/403.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import { toUserDTO, jsonError } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  try {
    await requireAdmin();
    const users = await db.user.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(users.map((u) => toUserDTO(u)));
  } catch (e) {
    return jsonError(e);
  }
}
