/**
 * PATCH /api/admin/users/[id]  — { role: "USER" | "ADMIN" }
 *
 * Updates user role. 400 on invalid role.
 * Prevents self-demotion (if admin demotes themselves → 400 with message)
 * to avoid lockout.
 *
 * requireAdmin → 401/403.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import { toUserDTO, jsonError, ValidationError, NotFoundError } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/session";

const VALID_ROLES = new Set(["USER", "ADMIN"]);

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const authCtx = await requireAdmin();
    const { id } = await ctx.params;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new ValidationError("Invalid JSON body");
    }
    const { role } = body as Record<string, unknown>;
    if (typeof role !== "string" || !VALID_ROLES.has(role)) {
      throw new ValidationError('role must be "USER" or "ADMIN"');
    }

    // Prevent self-demotion to avoid lockout.
    if (id === authCtx.user.id && role !== "ADMIN") {
      return NextResponse.json(
        { error: "You cannot demote yourself — assign another admin first." },
        { status: 400 }
      );
    }

    const existing = await db.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError("User not found");

    const updated = await db.user.update({
      where: { id },
      data: { role: role as "USER" | "ADMIN" },
    });

    return NextResponse.json(toUserDTO(updated));
  } catch (e) {
    return jsonError(e);
  }
}
