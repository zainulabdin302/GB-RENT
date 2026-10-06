"use client";
import { Badge } from "@/components/ui/badge";
import { AMENITIES, type AmenityKey } from "@/lib/constants";
import { AMENITY_ICON } from "@/components/gb-rent/amenity-icon";
import { cn } from "@/lib/utils";

const LABEL: Record<AmenityKey, string> = Object.fromEntries(
  AMENITIES.map((a) => [a.key, a.label])
) as Record<AmenityKey, string>;

/** Pill showing an amenity with its icon. */
export function AmenityChip({
  amenity,
  className,
  withLabel = true,
}: {
  amenity: AmenityKey;
  className?: string;
  withLabel?: boolean;
}) {
  const Icon = AMENITY_ICON[amenity];
  return (
    <Badge
      variant="secondary"
      className={cn("gap-1 rounded-full bg-secondary/70", className)}
    >
      <Icon className="size-3 text-primary" aria-hidden />
      {withLabel && <span>{LABEL[amenity]}</span>}
    </Badge>
  );
}
