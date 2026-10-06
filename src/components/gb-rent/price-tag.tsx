"use client";
import { formatPKR, formatPKRFull } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function PriceTag({
  price,
  className,
  full = false,
}: {
  price: number;
  className?: string;
  full?: boolean;
}) {
  return (
    <span className={cn("font-semibold tabular-nums", className)} title={formatPKRFull(price)}>
      {full ? formatPKRFull(price) : formatPKR(price)}
    </span>
  );
}
