"use client";
import { Badge } from "@/components/ui/badge";
import { PROPERTY_TYPE_LABEL, type PropertyType } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Color + label per property type. Used on cards and detail header. */
const TYPE_STYLE: Record<PropertyType, string> = {
  SHOP: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 border-amber-300/60",
  HOUSE:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-300/60",
  ROOM: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200 border-rose-300/60",
  HOSTEL:
    "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200 border-violet-300/60",
};

export function TypeBadge({
  type,
  className,
}: {
  type: PropertyType;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full border font-semibold uppercase tracking-wide text-[10px]",
        TYPE_STYLE[type],
        className
      )}
    >
      {PROPERTY_TYPE_LABEL[type]}
    </Badge>
  );
}
