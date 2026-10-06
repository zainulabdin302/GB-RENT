"use client";
/**
 * Auth store — mirrors the NextAuth session into Zustand for components that
 * don't want to use the SessionProvider context. Also exposes login/signup/
 * logout helpers that hit our own API routes (which wrap NextAuth + bcrypt).
 */
import { create } from "zustand";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api-fetch";
import type { UserDTO } from "@/types";

interface SignupInput {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export function useAuth() {
  const { data: session, status, update } = useSession();
  return {
    status, // "loading" | "authenticated" | "unauthenticated"
    user: session?.user ?? null,
    async refresh() {
      await update();
    },
    async signup(input: SignupInput) {
      const u = await apiFetch<UserDTO>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(input),
      });
      return u;
    },
  };
}
