"use client";
/**
 * UI store for cross-component ephemeral state (auth dialog open/close).
 * Keeps the auth dialog accessible from anywhere (header, protected-route
 * redirects, etc.) without prop drilling.
 */
import { create } from "zustand";

interface UIState {
  authOpen: boolean;
  authMode: "login" | "signup";
  openAuth: (mode?: "login" | "signup") => void;
  closeAuth: () => void;
  setAuthMode: (m: "login" | "signup") => void;
}

export const useUI = create<UIState>((set) => ({
  authOpen: false,
  authMode: "login",
  openAuth: (mode = "login") => set({ authOpen: true, authMode: mode }),
  closeAuth: () => set({ authOpen: false }),
  setAuthMode: (m) => set({ authMode: m }),
}));
