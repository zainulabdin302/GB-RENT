"use client";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { apiFetch } from "@/lib/api-fetch";
export function useChatNotifications() {
  const { status } = useSession();
  const query = useQuery({
    queryKey: ["chat-unread-count"],
    queryFn: () => apiFetch<{ count: number }>("/api/conversations/unread-count"),
    enabled: status === "authenticated",
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  return query.data?.count ?? 0;
}
