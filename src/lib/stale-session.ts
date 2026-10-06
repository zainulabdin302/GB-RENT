"use client";
/**
 * Stale-session handler. Anywhere in the app that a fetch returns 401, we
 * want to (a) clear the cached NextAuth session so the header stops showing
 * the user's name, and (b) pop the sign-in dialog so the user can re-auth.
 *
 * This handles the scenario where the DB was re-seeded or the user was
 * deleted while the browser still holds an old JWT cookie — the backend
 * returns 401 instead of P2003, and this handler turns that into a clean
 * "please sign in again" UX.
 */
import { signOut } from "next-auth/react";
import { useUI } from "@/stores/ui-store";

let handled = false;

export function handleStaleSession() {
  if (handled) return;
  handled = true;
  // Clear the cached session client-side (no network round-trip needed).
  void signOut({ redirect: false });
  // Pop the sign-in dialog so the user can re-authenticate immediately.
  useUI.getState().openAuth("login");
  // Reset the flag after a short delay so a future stale-session can re-trigger.
  setTimeout(() => {
    handled = false;
  }, 2000);
}
