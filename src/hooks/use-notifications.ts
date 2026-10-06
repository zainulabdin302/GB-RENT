"use client";
/**
 * useNotifications — polls the backend for unread counts that drive the
 * small notification dots in the header.
 *
 * Two independent signals:
 *   1. adminPending  — number of listings awaiting admin approval.
 *                      Drives the dot on the "Admin" nav button (admins only).
 *   2. userUnread    — number of unread inquiries received on the user's
 *                      own listings. Drives the dot on the "Dashboard" nav
 *                      button (any authenticated user with listings).
 *
 * Polls every 30s via TanStack Query. Auth-gated: only fires when the user
 * is authenticated, and only fetches the admin endpoint when the user is
 * an admin. The header calls this hook; the dashboard invalidates the
 * user-unread query after marking inquiries as read.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api-fetch";

interface CountResponse {
  count: number;
}

export const NOTIFICATION_KEYS = {
  adminPending: ["notifications", "admin-pending"] as const,
  userUnread: ["notifications", "user-unread"] as const,
};

export function useNotifications() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  const isAdmin = session?.user?.role === "ADMIN";

  // Admin pending count — admins only.
  const adminQ = useQuery<CountResponse>({
    queryKey: NOTIFICATION_KEYS.adminPending,
    queryFn: () => apiFetch<CountResponse>("/api/admin/pending-count"),
    enabled: isAuthenticated && isAdmin,
    refetchInterval: 30_000, // poll every 30s
    staleTime: 15_000,
  });

  // User unread inquiry count — any authenticated user.
  const userQ = useQuery<CountResponse>({
    queryKey: NOTIFICATION_KEYS.userUnread,
    queryFn: () => apiFetch<CountResponse>("/api/inquiries/unread-count"),
    enabled: isAuthenticated,
    refetchInterval: 30_000, // poll every 30s
    staleTime: 15_000,
  });

  return {
    adminPending: adminQ.data?.count ?? 0,
    userUnread: userQ.data?.count ?? 0,
    adminLoading: adminQ.isLoading,
    userLoading: userQ.isLoading,
  };
}

/**
 * Small helper for the dashboard to invalidate the unread count after it
 * marks inquiries as read. Call this after a successful mark-read POST so
 * the header dot clears immediately instead of waiting for the next poll.
 */
export function useRefreshNotifications() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.userUnread });
    qc.invalidateQueries({ queryKey: NOTIFICATION_KEYS.adminPending });
  };
}
