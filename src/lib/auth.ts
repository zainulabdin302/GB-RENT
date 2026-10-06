/**
 * GB Rent — NextAuth.js v4 configuration.
 * Strategy: JWT (stateless, matches the FYP requirement of "JWT-based auth").
 * Provider: Credentials (email + password) with bcrypt hash verification.
 * No Prisma adapter is needed because we use the JWT strategy — sessions are
 * signed tokens, not DB rows. (For FYP: this is the standard stateless JWT
 * approach; the JWT is sent via the `next-auth.session-token` cookie.)
 */
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 days
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    // We do not use separate auth pages — login/signup are dialogs in the SPA.
    // This URL is only used if NextAuth needs to redirect unexpectedly.
    signIn: "/",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = credentials.email.toLowerCase().trim();
        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;
        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as "USER" | "ADMIN",
          phone: user.phone ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? USER_ROLES.USER;
        token.phone = (user as { phone?: string }).phone ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      // STALE-SESSION GUARD: verify the user encoded in the JWT still exists
      // in the DB. If the DB was re-seeded (or the user was deleted by an
      // admin) while the browser still holds the old JWT cookie, the user ID
      // in the token points to a deleted row. Returning an empty session
      // makes the frontend treat the user as signed-out, so any subsequent
      // API call that requires auth fails with a clean 401 ("You must be
      // signed in.") instead of a confusing P2003 foreign-key error.
      if (token.id) {
        const exists = await db.user.findUnique({
          where: { id: token.id as string },
          select: { id: true, name: true, email: true, phone: true, role: true },
        });
        if (!exists) {
          // User no longer exists — return a session with no user object.
          // NextAuth treats this as unauthenticated on the client.
          return { expires: session.expires } as unknown as typeof session;
        }
        if (session.user) {
          (session.user as { id?: string }).id = exists.id;
          (session.user as { role?: string }).role = exists.role;
          (session.user as { phone?: string | null }).phone = exists.phone;
          // Keep name/email fresh in case the admin changed them.
          (session.user as { name?: string }).name = exists.name;
          (session.user as { email?: string }).email = exists.email;
        }
      }
      return session;
    },
  },
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      phone: string | null;
    };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    phone?: string | null;
  }
}
