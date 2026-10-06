"use client";
/**
 * useFavorite — toggle favorite on/off for a property.
 * Uses TanStack Query mutation + optimistic UI. Hits /api/favorites.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/api-fetch";
import { toast } from "sonner";

export function useFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      propertyId,
      add,
    }: {
      propertyId: string;
      add: boolean;
    }) => {
      if (add) {
        return apiFetch<{ id: string }>(`/api/favorites`, {
          method: "POST",
          body: JSON.stringify({ propertyId }),
        });
      }
      return apiFetch<{ ok: true }>(
        `/api/favorites/${encodeURIComponent(propertyId)}`,
        { method: "DELETE" }
      );
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.add ? "Saved to favorites" : "Removed from favorites");
      // Invalidate anything that might show favorites.
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["property", vars.propertyId] });
      qc.invalidateQueries({ queryKey: ["favorites"] });
    },
    onError: (e, vars) => {
      if (e instanceof ApiError && e.status === 401) {
        toast.error("Please sign in to save favorites");
      } else {
        toast.error(e instanceof Error ? e.message : "Could not update favorite");
      }
    },
  });
}
