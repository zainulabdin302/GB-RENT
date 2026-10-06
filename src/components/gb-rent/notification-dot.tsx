"use client";
import { cn } from "@/lib/utils";

/**
 * NotificationDot — a small coloured dot shown next to a nav item when there
 * is unread activity. Two sizes:
 *   - default: a 2rem pill with the count (used on desktop nav buttons when count > 0)
 *   - compact: a bare 8px dot (used on mobile menu items and when count is "some")
 *
 * Colour: emerald for admin (pending approvals), amber for user (unread
 * inquiries). Both follow the GB theme palette.
 */
export function NotificationDot({
  count,
  tone = "amber",
  className,
}: {
  count: number;
  tone?: "amber" | "emerald";
  className?: string;
}) {
  if (count <= 0) return null;
  const display = count > 9 ? "9+" : String(count);
  const toneCls =
    tone === "amber"
      ? "bg-amber-500 text-white ring-amber-500/30"
      : "bg-emerald-600 text-white ring-emerald-600/30";
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold leading-none ring-2 ring-background tabular-nums",
        toneCls,
        className
      )}
      aria-label={`${count} unread`}
    >
      {display}
    </span>
  );
}
