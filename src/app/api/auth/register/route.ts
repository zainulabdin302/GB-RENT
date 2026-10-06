/**
 * POST /api/auth/register
 * Body: { name, email, password, phone? }
 * Creates a new USER-role account. Returns the UserDTO (no passwordHash).
 *
 * Validation:
 *   - name non-empty
 *   - email non-empty / well-formed
 *   - password >= 6 chars
 *   - email unique → 409 on conflict
 *
 * On success, the client is expected to call NextAuth's signIn("credentials")
 * to obtain a session JWT separately.
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { toUserDTO, jsonError, ValidationError, isNonEmptyString } from "@/lib/api-helpers";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new ValidationError("Invalid JSON body");
    }
    const { name, email, password, phone } = body as Record<string, unknown>;

    if (!isNonEmptyString(name)) throw new ValidationError("Name is required");
    if (!isNonEmptyString(email) || !EMAIL_RE.test(email.trim()))
      throw new ValidationError("A valid email is required");
    if (typeof password !== "string" || password.length < 6)
      throw new ValidationError("Password must be at least 6 characters");
    if (typeof password === "string" && Buffer.byteLength(password, "utf8") > 72)
      throw new ValidationError("Password must be 72 bytes or shorter");
    if (phone !== undefined && phone !== null && typeof phone !== "string")
      throw new ValidationError("Phone must be a string");

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "An account with that email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
        role: USER_ROLES.USER,
      },
    });

    return NextResponse.json(toUserDTO(user), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
