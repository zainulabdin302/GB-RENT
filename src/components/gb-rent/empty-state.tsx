"use client";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/** Reusable empty-state block for "no results" / "no listings yet" etc. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-accent/40 text-accent-foreground">
        <Icon className="size-6" aria-hidden />
      </div>
      <div>
        <p className="text-base font-semibold">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground max-w-md">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
