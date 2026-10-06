/**
 * Server-side helper: get the authenticated user row from the DB using
 * the NextAuth JWT in the incoming request. Returns null when not logged in.
 *
 * This is the single entry point every API route uses to enforce auth.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export interface AuthContext {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    phone: string | null;
  };
}

export async function getAuth(): Promise<AuthContext | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      phone: session.user.phone,
    },
  };
}

/** Returns auth context or throws a 401-shaped error for the API route to map. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuth();
  if (!ctx) throw new AuthError("UNAUTHORIZED", "You must be signed in.");
  return ctx;
}

export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.user.role !== "ADMIN")
    throw new AuthError("FORBIDDEN", "Admin access required.");
  return ctx;
}

export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
