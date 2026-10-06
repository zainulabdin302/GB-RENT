"use client";
/**
 * Lightweight SPA navigation store.
 *
 * GB Rent is a single-route SPA (only "/" is user-visible). This store drives
 * which "page" is rendered inside the page shell, preserving a back-stack so
 * the browser Back button still works conceptually within the app.
 *
 * For FYP: explain that a real production build would use Next.js file-based
 * routing (/properties/[id], /dashboard, /admin). The SPA-state approach here
 * keeps the sandbox to ONE user route per the platform constraint while still
 * demonstrating every page.
 */
import { create } from "zustand";

export type View =
  | { name: "home" }
  | { name: "detail"; propertyId: string }
  | { name: "create" }
  | { name: "edit"; propertyId: string }
  | { name: "dashboard" }
  | { name: "admin" };

interface NavState {
  stack: View[];
  current: View;
  go: (v: View) => void;
  back: () => void;
  reset: (v?: View) => void;
}

export const useView = create<NavState>((set, get) => ({
  stack: [{ name: "home" }],
  current: { name: "home" },
  go: (v) =>
    set((s) => ({ stack: [...s.stack, v], current: v })),
  back: () => {
    const stack = [...get().stack];
    if (stack.length > 1) stack.pop();
    set({ stack, current: stack[stack.length - 1] });
  },
  reset: (v = { name: "home" }) => set({ stack: [v], current: v }),
}));
