"use client";
/**
 * DashboardView — the regular user's own workspace.
 *
 * Three tabs:
 *   1. My listings   — GET /api/properties/mine  (own properties, ALL statuses,
 *                       with inquiryCount + favoriteCount per item). Dense
 *                       management rows with thumbnail / status / actions.
 *   2. Favorites     — GET /api/favorites         (PropertyDTO grid, reuses
 *                       the shared PropertyCard with its heart-toggle).
 *   3. Inquiries     — GET /api/inquiries         (inquiries ON the user's
 *                       properties — sender, message, click-to-call phone).
 *
 * Auth gate: if `useSession().status === "unauthenticated"`, render a sign-in
 * prompt Card. If loading, render a centered spinner. Tabs are accessible
 * (Radix Tabs) and scroll horizontally on mobile.
 */
import { useState, useEffect } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  Heart,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";

import { apiFetch, ApiError } from "@/lib/api-fetch";
import { useView } from "@/stores/view-store";
import { useUI } from "@/stores/ui-store";
import { formatPKR } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useRefreshNotifications } from "@/hooks/use-notifications";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { PropertyCard } from "@/components/gb-rent/property-card";
import { EmptyState } from "@/components/gb-rent/empty-state";
import { TypeBadge } from "@/components/gb-rent/type-badge";
import { PriceTag } from "@/components/gb-rent/price-tag";
import { ListingPaymentPanel } from "@/components/gb-rent/listing-payment-panel";

import type { PropertyDTO, FavoriteDTO, InquiryDTO } from "@/types";

// MinePropertyDTO is the same shape as PropertyDTO plus per-row counts.
// Re-declared locally so the client bundle doesn't pull in the route module.
type MinePropertyDTO = PropertyDTO & {
  inquiryCount: number;
  favoriteCount: number;
};

const FALLBACK_IMAGE = "/uploads/seed-house-2.jpg";

// ─── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PropertyDTO["status"] }) {
  if (status === "APPROVED") {
    return (
      <Badge className="gap-1 border-emerald-300/60 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
        <CheckCircle2 className="size-3" />
        Approved
      </Badge>
    );
  }
  if (status === "PENDING") {
    return (
      <Badge className="gap-1 border-amber-300/60 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
        <Clock className="size-3" />
        Pending
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 border-rose-300/60 bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200">
      <XCircle className="size-3" />
      Rejected
    </Badge>
  );
}

// ─── Auth gates ───────────────────────────────────────────────────────────────

function SignInPrompt() {
  const openAuth = useUI((s) => s.openAuth);
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <Card className="gap-4 text-center">
        <CardHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 className="size-6" />
          </div>
          <CardTitle className="text-xl">Sign in to view your dashboard</CardTitle>
          <CardDescription>
            Manage your listings, saved properties, and inquiries — all in one place.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => openAuth("login")} className="w-full sm:w-auto">
            Sign in
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function FullScreenSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

// ─── Tab 1: My listings ────────────────────────────────────────────────────────

function ListingsSummary({
  total,
  pending,
  approved,
}: {
  total: number;
  pending: number;
  approved: number;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      <SummaryTile label="Total listings" value={total} icon={Building2} tone="neutral" />
      <SummaryTile label="Pending" value={pending} icon={Clock} tone="amber" />
      <SummaryTile label="Approved" value={approved} icon={CheckCircle2} tone="emerald" />
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Building2;
  tone: "neutral" | "amber" | "emerald";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
      : tone === "emerald"
        ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
        : "bg-primary/10 text-primary";
  return (
    <Card className="gap-2 py-4">
      <CardContent className="flex items-center gap-3 px-4">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            toneClass
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-xl font-semibold leading-tight tabular-nums">{value}</div>
          <div className="truncate text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ListingRow({ item }: { item: MinePropertyDTO }) {
  const go = useView((s) => s.go);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const del = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: true }>(`/api/properties/${item.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Listing deleted");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["mine-properties"] });
      qc.invalidateQueries({ queryKey: ["properties"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 401) {
        toast.error("Please sign in again");
      } else {
        toast.error(e instanceof Error ? e.message : "Could not delete listing");
      }
    },
  });

  const cover = item.images[0]?.url ?? FALLBACK_IMAGE;

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5">
        {/* Thumbnail */}
        <button
          onClick={() => go({ name: "detail", propertyId: item.id })}
          className="group relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-lg bg-muted sm:h-20 sm:w-28 sm:aspect-auto"
          aria-label={`View ${item.title}`}
        >
          <Image
            src={cover}
            alt={item.title}
            fill
            sizes="(max-width: 640px) 100vw, 112px"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </button>

        {/* Body */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={item.type} />
            <StatusBadge status={item.status} />
          </div>
          <button
            onClick={() => go({ name: "detail", propertyId: item.id })}
            className="text-left text-base font-semibold leading-tight hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="line-clamp-1">{item.title}</span>
          </button>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5 shrink-0" />
              <span className="line-clamp-1">{item.area}, {item.cityZone}</span>
            </span>
            <PriceTag price={item.price} className="text-primary" />
            <span className="inline-flex items-center gap-1" title={format(new Date(item.createdAt), "dd MMM yyyy")}>
              <Clock className="size-3.5 shrink-0" />
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="size-3.5 shrink-0" />
              {item.inquiryCount} {item.inquiryCount === 1 ? "inquiry" : "inquiries"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3.5 shrink-0" />
              {item.favoriteCount} {item.favoriteCount === 1 ? "favorite" : "favorites"}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 flex-row gap-2 sm:flex-col sm:items-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => go({ name: "detail", propertyId: item.id })}
            className="gap-1.5"
          >
            <Eye className="size-4" />
            View
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => go({ name: "edit", propertyId: item.id })}
            className="gap-1.5"
          >
            <Pencil className="size-4" />
            Edit
          </Button>
          <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this listing?</AlertDialogTitle>
                <AlertDialogDescription>
                  &ldquo;{item.title}&rdquo; will be permanently removed along with its
                  images, favorites, and inquiries. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    del.mutate();
                  }}
                  disabled={del.isPending}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {del.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    "Delete"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {item.status === "APPROVED" && item.paymentStatus !== "VERIFIED" && <ListingPaymentPanel propertyId={item.id} />}
    </Card>
  );
}

function ListingsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="gap-0 py-0">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5">
            <Skeleton className="aspect-[4/3] w-full sm:h-20 sm:w-28 sm:aspect-auto" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="flex gap-2 sm:flex-col">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function MyListingsTab() {
  const go = useView((s) => s.go);
  const { data, isLoading, isError, error } = useQuery<{ items: MinePropertyDTO[]; total: number }>({
    queryKey: ["mine-properties"],
    queryFn: () => apiFetch("/api/properties/mine"),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <ListingsSummary total={0} pending={0} approved={0} />
        <ListingsSkeleton />
      </div>
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon={Building2}
        title="Could not load your listings"
        description={
          error instanceof ApiError ? error.message : "Please try again in a moment."
        }
      />
    );
  }

  const items = data?.items ?? [];
  const pending = items.filter((i) => i.status === "PENDING").length;
  const approved = items.filter((i) => i.status === "APPROVED").length;

  return (
    <div className="flex flex-col gap-4">
      <ListingsSummary total={items.length} pending={pending} approved={approved} />

      {items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="You haven't listed any properties yet"
          description="List a shop, house, room, or hostel — it goes live after a quick admin review."
          action={
            <Button onClick={() => go({ name: "create" })} className="gap-2">
              <Plus className="size-4" />
              List a property
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((it) => (
            <ListingRow key={it.id} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: Favorites ─────────────────────────────────────────────────────────

function FavoritesGrid() {
  const go = useView((s) => s.go);
  const { data, isLoading, isError, error } = useQuery<FavoriteDTO[]>({
    queryKey: ["favorites"],
    queryFn: () => apiFetch("/api/favorites"),
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="gap-0 overflow-hidden py-0">
            <Skeleton className="aspect-[4/3] w-full" />
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </Card>
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon={Heart}
        title="Could not load your favorites"
        description={
          error instanceof ApiError ? error.message : "Please try again in a moment."
        }
      />
    );
  }

  const items = data ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="No saved properties yet"
        description="Tap the heart on any listing to save it here for later."
        action={
          <Button onClick={() => go({ name: "home" })} className="gap-2">
            Browse listings
          </Button>
        }
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((f) => (
        <PropertyCard key={f.id} property={f.property} />
      ))}
    </div>
  );
}

// ─── Tab 3: Inquiries received ────────────────────────────────────────────────

function InquiryRow({ inquiry }: { inquiry: InquiryDTO }) {
  const go = useView((s) => s.go);
  const isUnread = inquiry.readAt === null;
  return (
    <Card className={cn("gap-3", isUnread && "border-amber-300/70 bg-amber-50/40 dark:bg-amber-900/10")}>
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <button
            onClick={() => go({ name: "detail", propertyId: inquiry.property.id })}
            className="text-left text-base font-semibold leading-tight hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {inquiry.property.title}
          </button>
          {isUnread && (
            <Badge className="bg-amber-500 text-white hover:bg-amber-500">New</Badge>
          )}
        </div>
        <CardDescription className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" />
            {inquiry.property.area}, {inquiry.property.cityZone}
          </span>
          <span className="inline-flex items-center gap-1">
            <Building2 className="size-3.5" />
            {inquiry.property.type}
          </span>
          <span className="inline-flex items-center gap-1 text-primary">
            {formatPKR(inquiry.property.price)}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-medium">{inquiry.user.name}</span>
          <span className="text-muted-foreground">{inquiry.user.email}</span>
        </div>
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm leading-relaxed">
          {inquiry.message}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a
            href={`tel:${inquiry.phone.replace(/\s+/g, "")}`}
            className="inline-flex items-center gap-2 rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900 transition-colors hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-200"
          >
            <Phone className="size-4" />
            {inquiry.phone}
          </a>
          <time
            dateTime={inquiry.createdAt}
            className="text-xs text-muted-foreground"
            title={format(new Date(inquiry.createdAt), "dd MMM yyyy, HH:mm")}
          >
            {formatDistanceToNow(new Date(inquiry.createdAt), { addSuffix: true })}
          </time>
        </div>
      </CardContent>
    </Card>
  );
}

function InquiriesTab() {
  const qc = useQueryClient();
  const refreshNotifications = useRefreshNotifications();
  const { data, isLoading, isError, error } = useQuery<InquiryDTO[]>({
    queryKey: ["inquiries"],
    queryFn: () => apiFetch("/api/inquiries"),
  });

  // When the inquiries list loads and contains any unread inquiry, mark
  // them all as read. This clears the header notification dot the moment
  // the user actually opens the "Inquiries received" tab. Runs once per
  // load, only when there are unread items (avoids a redundant POST when
  // everything is already read). Uses a flag in the query cache to avoid
  // re-running on every refetch.
  const items = data ?? [];
  const hasUnread = items.some((i) => i.readAt === null);
  const [marked, setMarked] = useState(false);
  useEffect(() => {
    if (!hasUnread || marked) return;
    let cancelled = false;
    (async () => {
      try {
        await apiFetch<{ marked: number }>("/api/inquiries/mark-read", {
          method: "POST",
        });
        if (cancelled) return;
        qc.invalidateQueries({ queryKey: ["inquiries"] });
        refreshNotifications();
        setMarked(true);
      } catch {
        // Silently ignore — the dot will clear on the next poll anyway.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasUnread, marked, qc, refreshNotifications]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="gap-3">
            <CardHeader className="gap-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="Could not load inquiries"
        description={
          error instanceof ApiError ? error.message : "Please try again in a moment."
        }
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="No inquiries yet"
        description="Once you list a property, interested tenants will reach out here."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((i) => (
        <InquiryRow key={i.id} inquiry={i} />
      ))}
    </div>
  );
}

// ─── Root view ────────────────────────────────────────────────────────────────

export function DashboardView() {
  const { status } = useSession();

  if (status === "loading") return <FullScreenSpinner label="Loading dashboard…" />;
  if (status === "unauthenticated") return <SignInPrompt />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Manage your listings, saved properties, and inquiries from tenants across Gilgit-Baltistan.
        </p>
      </header>

      <Tabs defaultValue="listings" className="w-full">
        <TabsList className="flex w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="listings" className="gap-1.5">
            <Building2 className="size-4" />
            My listings
          </TabsTrigger>
          <TabsTrigger value="favorites" className="gap-1.5">
            <Heart className="size-4" />
            Favorites
          </TabsTrigger>
          <TabsTrigger value="inquiries" className="gap-1.5">
            <MessageCircle className="size-4" />
            Inquiries received
          </TabsTrigger>
        </TabsList>

        <TabsContent value="listings" className="mt-6">
          <MyListingsTab />
        </TabsContent>
        <TabsContent value="favorites" className="mt-6">
          <FavoritesGrid />
        </TabsContent>
        <TabsContent value="inquiries" className="mt-6">
          <InquiriesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
