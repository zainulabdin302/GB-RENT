/**
 * NextAuth route handler — re-exports the GET/POST handlers from the
 * configured NextAuth(authOptions). This is the only file NextAuth needs.
 *
 * In Next.js 16 (App Router) route handlers export named HTTP verbs.
 * `NextAuth(authOptions)` returns an object with `GET` / `POST` that we
 * re-export here.
 */
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
