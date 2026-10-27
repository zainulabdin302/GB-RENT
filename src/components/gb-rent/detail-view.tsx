"use client";
/**
 * GB Rent — Listing Detail view (Task 3-c).
 *
 * Layout:
 *   - Breadcrumb (Browse › {cityZone} › {title})
 *   - Two-column on lg+:
 *       LEFT (≈65%): gallery, main info, amenities, description,
 *                    posted-by, Similar-listing rent estimate, map
 *       RIGHT (≈35%, sticky): contact / inquiry card + favorites
 *   - Similar listings — full-width AI-matched section below.
 *
 * AI features:
 *   1. Similar-listing rent estimate — POST /api/ai/predict-price (auto-fires when
 *      authenticated). Shows predicted price, [low–high] range, a confidence
 *      meter (Progress bar), the model's explanation, and a colored comparison
 *      badge (good deal / near estimate / above estimate).
 *   2. Similar listings — GET /api/properties/{id}/similar — wraps the shared
 *      <PropertyCard> with a "Match %" overlay badge (emerald / amber / muted
 *      by similarity band).
 *
 * Patterns:
 *   - useQuery for property fetch (key ["property", propertyId]) and for similar
 *     (key ["property", propertyId, "similar"]). The AI predict query uses
 *     key ["property", propertyId, "predict"] with retry: 1, auto-fires on
 *     mount only when the viewer is authenticated (the predict-price API
 *     requires auth — see src/app/api/ai/predict-price/route.ts).
 *   - useMutation for the inquiry submit (POST /api/inquiries).
 *   - Skeleton for the whole detail while the property query is pending.
 *   - Friendly EmptyState on 404.
 */
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  BedSingle,
  CheckCircle2,
  Heart,
  Loader2,
  MapPin,
  Maximize,
  MessageSquare,
  Mountain,
  Pencil,
  Phone,
  RefreshCw,
  Share2,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { PropertyCard } from "@/components/gb-rent/property-card";
import { TypeBadge } from "@/components/gb-rent/type-badge";
import { PriceTag } from "@/components/gb-rent/price-tag";
import { AmenityChip } from "@/components/gb-rent/amenity-chip";
import { EmptyState } from "@/components/gb-rent/empty-state";
import { useFavorite } from "@/hooks/use-favorite";
import { useView } from "@/stores/view-store";
import { useUI } from "@/stores/ui-store";
import { apiFetch, ApiError } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

import type {
  InquiryDTO,
  PricePredictionRequest,
  PricePredictionResponse,
  PropertyDTO,
  PropertyImageDTO,
} from "@/types";

// ─── helpers ──────────────────────────────────────────────────────────────

function formatMonthYear(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

type LucideIcon = typeof CheckCircle2;

function similarityBadge(sim: number): { label: string; className: string } {
  const pct = Math.round(sim * 100);
  let className =
    "bg-muted text-muted-foreground border-border";
  if (sim > 0.85) {
    className =
      "bg-emerald-100 text-emerald-900 border-emerald-300/70 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800/60";
  } else if (sim >= 0.7) {
    className =
      "bg-amber-100 text-amber-900 border-amber-300/70 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800/60";
  }
  return { label: `Match ${pct}%`, className };
}

function priceComparison(
  listed: number,
  low: number,
  high: number
): { label: string; className: string; Icon: LucideIcon } {
  if (listed < low) {
    return {
      label: "Below comparable asking rents",
      className:
        "bg-emerald-100 text-emerald-900 border-emerald-300/70 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800/60",
      Icon: TrendingDown,
    };
  }
  if (listed > high) {
    return {
      label: "Above estimate",
      className:
        "bg-rose-100 text-rose-900 border-rose-300/70 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-800/60",
      Icon: TrendingUp,
    };
  }
  return {
    label: "Listed near estimate",
    className:
      "bg-amber-100 text-amber-900 border-amber-300/70 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800/60",
    Icon: CheckCircle2,
  };
}

// ─── Skeleton ─────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <Skeleton className="h-4 w-56" />
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_minmax(320px,400px)]">
        <div className="flex flex-col gap-6">
          <Skeleton className="aspect-[4/3] w-full rounded-2xl" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="size-20 rounded-lg" />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    </div>
  );
}

// ─── 404 ────────────────────────────────────────────────────────────────────

function DetailNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <EmptyState
        icon={Mountain}
        title="Listing not found"
        description="This property may have been removed, rejected, or is no longer available. Browse other rentals across Gilgit-Baltistan."
        action={
          <Button onClick={onBack}>
            <ArrowLeft className="size-4" /> Back to browse
          </Button>
        }
      />
    </div>
  );
}

// ─── Photo gallery ────────────────────────────────────────────────────────────

function PhotoGallery({
  images,
  title,
}: {
  images: PropertyImageDTO[];
  title: string;
}) {
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setActive(api.selectedScrollSnap());
    api.on("select", onSelect);
    onSelect();
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  // Empty — graceful placeholder.
  if (images.length === 0) {
    return (
      <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-emerald-50 via-amber-50 to-rose-50 dark:from-emerald-950/40 dark:via-amber-950/30 dark:to-rose-950/30">
        <AspectRatio ratio={4 / 3}>
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-background/80 backdrop-blur">
              <Mountain className="size-7 text-primary" aria-hidden />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No photos yet
            </p>
          </div>
        </AspectRatio>
      </div>
    );
  }

  // Single image — no carousel controls.
  if (images.length === 1) {
    return (
      <div className="overflow-hidden rounded-2xl border bg-muted">
        <AspectRatio ratio={4 / 3}>
          <Image
            src={images[0].url}
            alt={title}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 60vw"
            className="object-cover"
          />
        </AspectRatio>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Carousel
        opts={{ align: "start", loop: false }}
        setApi={setApi}
        className="overflow-hidden rounded-2xl border bg-muted"
        aria-label={`Photos of ${title}`}
      >
        <CarouselContent>
          {images.map((img, i) => (
            <CarouselItem key={img.id}>
              <AspectRatio ratio={4 / 3}>
                <Image
                  src={img.url}
                  alt={`${title} — photo ${i + 1} of ${images.length}`}
                  fill
                  priority={i === 0}
                  sizes="(max-width: 1024px) 100vw, 60vw"
                  className="object-cover"
                />
              </AspectRatio>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious
          aria-label="Previous photo"
          className="left-3 size-9 bg-background/85 backdrop-blur hover:bg-background"
        />
        <CarouselNext
          aria-label="Next photo"
          className="right-3 size-9 bg-background/85 backdrop-blur hover:bg-background"
        />
      </Carousel>

      {/* filmstrip */}
      <div
        role="tablist"
        aria-label="Choose photo"
        className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
      >
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Photo ${i + 1}`}
            onClick={() => api?.scrollTo(i)}
            className={cn(
              "relative size-16 shrink-0 overflow-hidden rounded-lg border transition-all sm:size-20",
              i === active
                ? "border-primary ring-2 ring-primary/40"
                : "border-border opacity-70 hover:opacity-100 hover:border-primary/50"
            )}
          >
            <Image
              src={img.url}
              alt={`${title} — thumbnail ${i + 1}`}
              fill
              sizes="80px"
              className="object-cover"
            />
          </button>
        ))}
      </div>

      {/* dots */}
      <div className="flex justify-center gap-1.5" aria-hidden>
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => api?.scrollTo(i)}
            aria-label={`Go to photo ${i + 1}`}
            tabIndex={-1}
            className={cn(
              "h-1.5 rounded-full transition-all",
              i === active ? "w-6 bg-primary" : "w-1.5 bg-border"
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Map block ──────────────────────────────────────────────────────────────

function MapBlock({ property }: { property: PropertyDTO }) {
  const hasCoords =
    property.latitude != null && property.longitude != null;
  const lat = property.latitude;
  const lng = property.longitude;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="size-4 text-primary" /> Location
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="text-sm font-medium text-foreground">
            {property.address}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {property.area}, {property.cityZone}
          </p>
        </div>
        {hasCoords && lat != null && lng != null ? (
          <iframe
            title={`Map of ${property.title}`}
            src={`https://www.google.com/maps?q=${lat},${lng}&z=14&output=embed`}
            className="mt-3 aspect-[16/10] w-full rounded-xl border"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div className="mt-3 flex items-start gap-3 rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
            <MapPin className="size-5 shrink-0 text-primary/70" aria-hidden />
            <p>
              Map preview available for listings with coordinates. The lister
              didn&apos;t provide exact coordinates, but the address above shows
              the area.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Posted-by block ────────────────────────────────────────────────────────

function PostedByBlock({
  property,
  isOwner,
  onEdit,
}: {
  property: PropertyDTO;
  isOwner: boolean;
  onEdit: () => void;
}) {
  const initial = property.user.name.trim().slice(0, 1).toUpperCase() || "?";
  // NOTE: PropertyDTO.user is a Pick without `createdAt` (see src/types/index.ts),
  // so we surface the property's createdAt as "Posted on …" instead of a true
  // "Member since" — semantically equivalent for the viewer.
  const posted = formatMonthYear(property.createdAt);

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {initial}
        </div>
        <div className="flex flex-col">
          <p className="text-sm font-medium leading-tight">
            {property.user.name}
          </p>
          <p className="text-xs text-muted-foreground">Posted {posted}</p>
        </div>
      </div>
      {isOwner && (
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="size-4" /> Edit
        </Button>
      )}
    </div>
  );
}

// ─── AI: price prediction ─────────────────────────────────────────────────

function AIPriceCard({ property }: { property: PropertyDTO }) {
  const { status } = useSession();
  const openAuth = useUI((s) => s.openAuth);

  const query = useQuery({
    queryKey: ["property", property.id, "predict", property.updatedAt],
    staleTime: 0,
    refetchOnWindowFocus: true,
    enabled: status === "authenticated",
    retry: 1,
    queryFn: () => {
      const body: PricePredictionRequest = {
        propertyId: property.id,
        type: property.type,
        cityZone: property.cityZone,
        area: property.area,
        rooms: property.rooms,
        size: property.size,
        amenities: property.amenities,
      };
      return apiFetch<PricePredictionResponse>("/api/ai/predict-price", {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
  });

  // Card chrome — reused across all states.
  const cardClass =
    "border-primary/30 bg-gradient-to-br from-primary/5 via-amber-50/40 to-rose-50/30 dark:from-primary/10 dark:via-amber-950/20 dark:to-rose-950/20";

  const headerEl = (
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <Sparkles className="size-4 text-primary" aria-hidden />
        Similar-listing rent estimate
      </CardTitle>
      <CardDescription>
        A comparison with similar approved listings in this district.
      </CardDescription>
    </CardHeader>
  );

  // Unauthenticated — nudge to sign in (predict-price requires auth).
  // (While NextAuth session is still resolving ("loading"), show a tiny
  // loading hint instead of misleading the user with a "Sign in" prompt.)
  if (status !== "authenticated") {
    if (status === "loading") {
      return (
        <Card className={cardClass}>
          {headerEl}
          <CardContent className="flex items-center gap-2 pt-0 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Checking session…
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className={cardClass}>
        {headerEl}
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            Sign in to compare asking rents for similar listings.
          </p>
          <Button
            onClick={() => openAuth("login")}
            className="mt-3 w-full sm:w-auto"
          >
            <Sparkles className="size-4" /> Sign in to estimate
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Loading
  if (query.isLoading) {
    return (
      <Card className={cardClass}>
        {headerEl}
        <CardContent className="flex flex-col gap-3 pt-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Estimating fair price…
          </div>
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Error
  if (query.isError) {
    const err = query.error;
    const isUnavailable =
      err instanceof ApiError && (err.status === 502 || err.status === 500);
    return (
      <Card className={cardClass}>
        {headerEl}
        <CardContent className="flex flex-col gap-3 pt-0">
          <p className="text-sm text-muted-foreground">
            {isUnavailable
              ? "Rent estimate unavailable right now. Please retry in a moment."
              : err instanceof ApiError
                ? err.message
                : "Could not load the AI estimate."}
          </p>
          <Button
            variant="outline"
            onClick={() => query.refetch()}
            className="w-full sm:w-auto"
            disabled={query.isFetching}
          >
            <RefreshCw
              className={cn("size-4", query.isFetching && "animate-spin")}
            />{" "}
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Success
  const data = query.data;
  if (!data) return null;

  if (!data.available) return (
    <Card className={cardClass}>{headerEl}<CardContent>
      <p className="text-sm text-muted-foreground">{data.explanation}</p>
    </CardContent></Card>
  );
  const cmp = priceComparison(property.price, data.low, data.high);
  const CmpIcon = cmp.Icon;

  return (
    <Card className={cardClass}>
      {headerEl}
      <CardContent className="flex flex-col gap-4 pt-0">
        {/* Big predicted price + comparison badge */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Estimated asking rent
            </p>
            <PriceTag
              price={data.predictedPrice}
              full
              className="text-3xl text-foreground"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Observed range:{" "}
              <span className="font-medium text-foreground">
                PKR {data.low.toLocaleString()}
              </span>{" "}
              –{" "}
              <span className="font-medium text-foreground">
                PKR {data.high.toLocaleString()}
              </span>{" "}
              /mo
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "gap-1 rounded-full border px-3 py-1 text-xs font-semibold",
              cmp.className
            )}
          >
            <CmpIcon className="size-3.5" aria-hidden />
            {cmp.label}
          </Badge>
        </div>

        <p className="text-sm">Evidence: <strong>{data.evidence === "limited" ? "Limited — small or varied sample" : "Moderate"}</strong></p>
        <div className="text-sm">
          <p className="mb-2 font-medium">Listings used ({data.comparables.length})</p>
          <ul className="space-y-2">
            {data.comparables.map(p => <li key={p.id} className="rounded-lg border p-2">
              <span className="font-medium">{p.title}</span><br />
              <span className="text-xs text-muted-foreground">{p.area}, {p.cityZone} · {p.rooms} rooms{p.size ? ` · ${p.size} sqft` : ""} · PKR {p.price.toLocaleString()}/mo</span>
            </li>)}
          </ul>
        </div>

        {/* Explanation callout */}
        <div className="rounded-xl border border-primary/20 bg-background/70 p-3 text-sm leading-relaxed text-muted-foreground">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <MessageSquare className="size-3.5" aria-hidden /> Why this price?
          </p>
          <p>{data.explanation}</p>
        </div>

        {/* Listed vs estimate */}
        <div className="flex items-center justify-between rounded-xl border bg-background/60 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Listed at</span>
          <PriceTag price={property.price} full className="text-foreground" />
        </div>

        {/* Footnote — FYP defense talking point */}
        <p className="text-[11px] italic text-muted-foreground">
          Based on similar listings in GB RENT. This is not a verified market valuation.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Similar listings (AI) ─────────────────────────────────────────────────

type SimilarMatch = PropertyDTO & { similarity: number };

function SimilarListings({ propertyId }: { propertyId: string }) {
  const query = useQuery({
    queryKey: ["property", propertyId, "similar"],
    queryFn: () =>
      apiFetch<{ matches: SimilarMatch[] }>(
        `/api/properties/${encodeURIComponent(propertyId)}/similar`
      ),
  });

  const matches = query.data?.matches ?? [];

  // Hide section entirely while silent (e.g. AI down) — only show on success
  // with at least one match.
  if (query.isLoading || query.isError || matches.length === 0) return null;

  return (
    <section className="mt-10" aria-label="Similar listings">
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Sparkles className="size-5 text-primary" aria-hidden />
          Similar listings
        </h2>
        <p className="text-sm text-muted-foreground">
          AI-matched by type, area, size &amp; price (cosine k-NN)
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {matches.slice(0, 6).map((m) => {
          const badge = similarityBadge(m.similarity);
          return (
            <Tooltip key={m.id}>
              <TooltipTrigger asChild>
                <div className="relative">
                  {/* Match overlay — wraps the shared PropertyCard unchanged. */}
                  <Badge
                    variant="outline"
                    className={cn(
                      "pointer-events-none absolute left-3 top-3 z-10 rounded-full border px-2 py-0.5 text-[11px] font-semibold shadow-sm",
                      badge.className
                    )}
                  >
                    {badge.label}
                  </Badge>
                  <PropertyCard property={m} />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                Cosine similarity: {Math.round(m.similarity * 100)}%
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </section>
  );
}

// ─── Contact / inquiry card ───────────────────────────────────────────────

function ContactCard({ property }: { property: PropertyDTO }) {
  const { data: session, status } = useSession();
  const openAuth = useUI((s) => s.openAuth);
  const fav = useFavorite();
  const qc = useQueryClient();
  const go = useView((s) => s.go);

  // Phone prefill: derive from session until the user types — no setState-in-effect.
  const [message, setMessage] = useState("");
  const [phoneEdited, setPhoneEdited] = useState(false);
  const [phoneValue, setPhoneValue] = useState("");
  const phone = phoneEdited
    ? phoneValue
    : (session?.user?.phone ?? "");

  const isOwner = !!session?.user?.id && session.user.id === property.userId;
  const isFav = !!property.favorited;
  const isAuthed = status === "authenticated";

  const startChat = useMutation({
    mutationFn: () => apiFetch<{ id: string }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ propertyId: property.id }),
    }),
    onSuccess: (conversation) => go({ name: "chat", conversationId: conversation.id }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Couldn't start chat"),
  });

  const inquiry = useMutation({
    mutationFn: (vars: { message: string; phone: string }) =>
      apiFetch<InquiryDTO>("/api/inquiries", {
        method: "POST",
        body: JSON.stringify({
          propertyId: property.id,
          message: vars.message,
          phone: vars.phone,
        }),
      }),
    onSuccess: () => {
      toast.success("Inquiry sent — the lister will contact you");
      setMessage("");
      // Reset the phone back to the session prefill after a successful send.
      setPhoneEdited(false);
      setPhoneValue("");
      qc.invalidateQueries({ queryKey: ["inquiries"] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 401) {
        openAuth("login");
      } else {
        toast.error(
          e instanceof Error ? e.message : "Could not send inquiry"
        );
      }
    },
  });

  const onSubmit = () => {
    if (!isAuthed) {
      openAuth("login");
      return;
    }
    const trimmedMessage = message.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedMessage) {
      toast.error("Please add a short message for the lister");
      return;
    }
    if (!trimmedPhone) {
      toast.error("Please add a phone number so the lister can reach you");
      return;
    }
    inquiry.mutate({ message: trimmedMessage, phone: trimmedPhone });
  };

  const onShare = async () => {
    const url =
      typeof window !== "undefined" ? window.location.href : property.id;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied — share it with anyone interested");
      } else {
        toast.message(url);
      }
    } catch {
      toast.message(url);
    }
  };

  const onSaveFav = () => {
    if (!isAuthed) {
      openAuth("login");
      return;
    }
    fav.mutate({ propertyId: property.id, add: !isFav });
  };

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="size-4 text-primary" /> Contact lister
        </CardTitle>
        <CardDescription className="sr-only">
          Send a message to {property.user.name}.
        </CardDescription>
        <div className="mt-1 flex items-baseline gap-1.5">
          <PriceTag price={property.price} full className="text-2xl text-foreground" />
          <span className="text-sm text-muted-foreground">/ month</span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-0">
        {isOwner ? (
          <div className="flex flex-col gap-3 rounded-xl border border-dashed bg-muted/40 p-4 text-sm">
            <p className="font-medium">This is your listing.</p>
            <p className="text-muted-foreground">
              Manage it from your dashboard or edit the details here.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => go({ name: "edit", propertyId: property.id })}
              >
                <Pencil className="size-4" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => go({ name: "dashboard" })}
              >
                Open dashboard
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`msg-${property.id}`}
                className="text-xs font-medium text-muted-foreground"
              >
                Message
              </label>
              <Textarea
                id={`msg-${property.id}`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={`Hi ${property.user.name.split(" ")[0]}, I'm interested in "${property.title}". Is it still available?`}
                rows={4}
                aria-label="Message to lister"
                disabled={!isAuthed}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`phone-${property.id}`}
                className="text-xs font-medium text-muted-foreground"
              >
                Your phone
              </label>
              <Input
                id={`phone-${property.id}`}
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => {
                  setPhoneEdited(true);
                  setPhoneValue(e.target.value);
                }}
                placeholder="03XX-XXXXXXX"
                disabled={!isAuthed}
              />
            </div>
            <Button
              onClick={onSubmit}
              disabled={inquiry.isPending}
              className="w-full"
              aria-label={
                isAuthed ? "Send inquiry to lister" : "Sign in to contact lister"
              }
            >
              {!isAuthed ? (
                <>
                  <Phone className="size-4" /> Sign in to contact
                </>
              ) : inquiry.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <MessageSquare className="size-4" /> Send inquiry
                </>
              )}
            </Button>
          </>
        )}

        {!isOwner && (
          <Button className="w-full" disabled={startChat.isPending} onClick={() => { if (!isAuthed) { openAuth("login"); return; } startChat.mutate(); }}>
            {startChat.isPending ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />}
            Chat with owner
          </Button>
        )}

        <Separator />

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant={isFav ? "secondary" : "outline"}
            onClick={onSaveFav}
            disabled={fav.isPending}
            className="flex-1"
            aria-label={isFav ? "Remove from favorites" : "Save to favorites"}
          >
            <Heart
              className={cn("size-4", isFav && "fill-rose-500 text-rose-500")}
            />
            {isFav ? "Saved to favorites" : "Save to favorites"}
          </Button>
          <Button
            variant="ghost"
            onClick={onShare}
            className="flex-1"
            aria-label="Copy link to share"
          >
            <Share2 className="size-4" /> Copy link
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main DetailView ────────────────────────────────────────────────────────

export function DetailView({ propertyId }: { propertyId: string }) {
  const go = useView((s) => s.go);
  const { data: session, status } = useSession();

  const query = useQuery({
    queryKey: ["property", propertyId],
    queryFn: () =>
      apiFetch<PropertyDTO>(`/api/properties/${encodeURIComponent(propertyId)}`),
  });

  // Loading
  if (query.isLoading) return <DetailSkeleton />;

  // 404 (or other not-found)
  if (query.isError) {
    const err = query.error;
    if (err instanceof ApiError && err.status === 404) {
      return <DetailNotFound onBack={() => go({ name: "home" })} />;
    }
    // other errors — also show not-found style
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <EmptyState
          icon={Mountain}
          title="Couldn't load this listing"
          description={
            err instanceof Error ? err.message : "Please try again later."
          }
          action={
            <Button onClick={() => query.refetch()}>
              <RefreshCw className="size-4" /> Retry
            </Button>
          }
        />
      </div>
    );
  }

  const property = query.data;
  if (!property) return <DetailSkeleton />;

  const isOwner = !!session?.user?.id && session.user.id === property.userId;
  const images = property.images;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              asChild
              className="cursor-pointer"
            >
              <button
                type="button"
                onClick={() => go({ name: "home" })}
              >
                Browse
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              asChild
              className="cursor-pointer"
            >
              <button
                type="button"
                onClick={() => go({ name: "home" })}
              >
                {property.cityZone}
              </button>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="line-clamp-1 max-w-[60vw] sm:max-w-xs">
              {property.title}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Two-column grid */}
      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_minmax(320px,400px)] lg:items-start">
        {/* LEFT: gallery + main info + amenities + description + posted-by + AI price + map */}
        <div className="flex flex-col gap-6">
          <PhotoGallery images={images} title={property.title} />

          {/* Main info panel */}
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <TypeBadge type={property.type} />
                {property.status !== "APPROVED" && (
                  <Badge
                    variant="outline"
                    className="rounded-full border-amber-300/70 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800/60"
                  >
                    {property.status === "PENDING"
                      ? "Pending review"
                      : "Rejected"}
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
                {property.title}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-4 text-primary" aria-hidden />
                  {property.area}, {property.cityZone}
                </span>
                <span className="inline-flex items-center gap-1">
                  <BedSingle className="size-4 text-primary" aria-hidden />
                  {property.rooms} {property.rooms === 1 ? "room" : "rooms"}
                </span>
                {property.size != null && (
                  <span className="inline-flex items-center gap-1">
                    <Maximize className="size-4 text-primary" aria-hidden />
                    {property.size.toLocaleString()} ft²
                  </span>
                )}
              </div>
              <div className="mt-1">
                <PriceTag
                  price={property.price}
                  full
                  className="text-2xl text-primary"
                />
                <span className="ml-1.5 text-sm text-muted-foreground">
                  / month
                </span>
              </div>
            </div>

            <Separator />

            {/* Amenities */}
            {property.amenities.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Amenities
                </h2>
                <div className="flex flex-wrap gap-2">
                  {property.amenities.map((a) => (
                    <AmenityChip key={a} amenity={a} />
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Description
              </h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                {property.description}
              </p>
            </div>

            {/* Posted by */}
            <PostedByBlock
              property={property}
              isOwner={isOwner}
              onEdit={() => go({ name: "edit", propertyId: property.id })}
            />

            {/* Similar-listing rent estimate */}
            <AIPriceCard property={property} />

            {/* Map */}
            <MapBlock property={property} />
          </div>
        </div>

        {/* RIGHT: contact card (sticky on desktop) */}
        <ContactCard property={property} />
      </div>

      {/* SIMILAR (full-width below) */}
      <SimilarListings propertyId={property.id} />
    </div>
  );
}
