"use client";

/**
 * GB Rent — Home / Browse / Search view.
 *
 * Renders the public marketplace: hero + search, filter sidebar (desktop) /
 * filter sheet (mobile), results grid with pagination, and a quick stats
 * strip. Fetches from `GET /api/properties` via TanStack Query keyed on the
 * full filter state so any change refetches.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  ListPlus,
  MapPin,
  RotateCw,
  Search,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";

import { apiFetch, buildQuery } from "@/lib/api-fetch";
import {
  AMENITIES,
  CITY_ZONES,
  PROPERTY_TYPE_LABEL,
  PROPERTY_TYPES,
  type AmenityKey,
  type CityZone,
  type PropertyType,
} from "@/lib/constants";
import type { Paginated, PropertyDTO } from "@/types";

import { useView } from "@/stores/view-store";
import { useUI } from "@/stores/ui-store";

import { PropertyCard } from "@/components/gb-rent/property-card";
import { EmptyState } from "@/components/gb-rent/empty-state";
import { TypeBadge } from "@/components/gb-rent/type-badge";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------- */
/* Filter domain types & defaults                                     */
/* ----------------------------------------------------------------- */

type SortKey = "newest" | "price_asc" | "price_desc";
type RoomFilter = "Any" | "1" | "2" | "3" | "4+";
type TypeFilter = "ALL" | PropertyType;
type ZoneFilter = "ALL" | CityZone;

interface Filters {
  q: string;
  type: TypeFilter;
  cityZone: ZoneFilter;
  priceRange: [number, number];
  rooms: RoomFilter;
  amenities: AmenityKey[];
  sort: SortKey;
}

const MAX_PRICE = 300_000;
const PRICE_STEP = 1_000;
const PAGE_SIZE = 9;

const DEFAULT_FILTERS: Filters = {
  q: "",
  type: "ALL",
  cityZone: "ALL",
  priceRange: [0, MAX_PRICE],
  rooms: "Any",
  amenities: [],
  sort: "newest",
};

const TYPE_PILLS: TypeFilter[] = ["ALL", ...PROPERTY_TYPES];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "price_asc", label: "Price: Low → High" },
  { value: "price_desc", label: "Price: High → Low" },
];

const ROOM_OPTIONS: RoomFilter[] = ["Any", "1", "2", "3", "4+"];

function formatPriceRange([min, max]: [number, number]): string {
  if (min === 0 && max === MAX_PRICE) return "Any price";
  if (min === 0) return `Up to PKR ${max.toLocaleString()}`;
  if (max === MAX_PRICE) return `PKR ${min.toLocaleString()}+`;
  return `PKR ${min.toLocaleString()} – ${max.toLocaleString()}`;
}

/** Page-number list for the pagination nav (with ellipses when many pages). */
function getPageRange(current: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: (number | "ellipsis")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) pages.push("ellipsis");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages - 1) pages.push("ellipsis");
  pages.push(totalPages);
  return pages;
}

/* ----------------------------------------------------------------- */
/* Main view                                                          */
/* ----------------------------------------------------------------- */

export function HomeView() {
  const go = useView((s) => s.go);
  const openAuth = useUI((s) => s.openAuth);
  const { status } = useSession();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState(DEFAULT_FILTERS.q);
  const [sheetOpen, setSheetOpen] = useState(false);

  /** Apply a partial filter patch and reset pagination to page 1. */
  const update = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.q === qInput ? f : { ...f, q: qInput }));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [qInput]);

  // Build the URL query string for /api/properties from the current filters.
  // buildQuery skips empty values; we also skip "ALL" / "Any" sentinels and
  // default price bounds.
  const queryString = useMemo(() => {
    const params: Record<string, unknown> = {
      page,
      pageSize: PAGE_SIZE,
      sort: filters.sort,
    };
    if (filters.q.trim()) params.q = filters.q.trim();
    if (filters.type !== "ALL") params.type = filters.type;
    if (filters.cityZone !== "ALL") params.cityZone = filters.cityZone;
    if (filters.priceRange[0] > 0) params.minPrice = filters.priceRange[0];
    if (filters.priceRange[1] < MAX_PRICE) params.maxPrice = filters.priceRange[1];
    if (filters.rooms !== "Any") {
      params.rooms = filters.rooms === "4+" ? 4 : Number(filters.rooms);
    }
    if (filters.amenities.length > 0) params.amenities = filters.amenities;
    return buildQuery(params);
  }, [filters, page]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["properties", queryString],
    queryFn: () => apiFetch<Paginated<PropertyDTO>>(`/api/properties${queryString}`),
    staleTime: 30_000,
  });

  // If the dataset shrinks (e.g. an admin rejected a listing) and our
  // current page is now past the end, jump back to the last valid page.
  // This is React's recommended "set state during render" pattern for
  // adjusting state when external data changes — we own `page`, and the
  // guard means the condition becomes false on the next render so there
  // is no infinite loop. (See https://react.dev/learn/you-might-not-need-an-effect)
  const totalPages = data?.totalPages ?? 0;
  if (data && totalPages > 0 && page > totalPages) {
    setPage(totalPages);
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const activePage = Math.min(page, Math.max(1, totalPages));

  const setActivePage = (p: number) => {
    setPage(Math.max(1, Math.min(p, totalPages || 1)));
    if (typeof window !== "undefined") {
      // Bring the grid back into view after paginating.
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleClearAll = () => {
    setFilters(DEFAULT_FILTERS);
    setQInput("");
    setPage(1);
    setSheetOpen(false);
  };

  const handleListProperty = () => {
    if (status === "authenticated") {
      go({ name: "create" });
    } else {
      openAuth("signup");
    }
  };

  /* Active-filter chips (clickable to remove). */
  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.q.trim()) {
    const q = filters.q.trim();
    activeChips.push({
      key: "q",
      label: q.length > 24 ? `"${q.slice(0, 24)}…"` : `"${q}"`,
      onRemove: () => {
        setQInput("");
        update({ q: "" });
      },
    });
  }
  if (filters.type !== "ALL") {
    activeChips.push({
      key: "type",
      label: PROPERTY_TYPE_LABEL[filters.type],
      onRemove: () => update({ type: "ALL" }),
    });
  }
  if (filters.cityZone !== "ALL") {
    activeChips.push({
      key: "cityZone",
      label: filters.cityZone,
      onRemove: () => update({ cityZone: "ALL" }),
    });
  }
  if (filters.priceRange[0] > 0 || filters.priceRange[1] < MAX_PRICE) {
    activeChips.push({
      key: "price",
      label: formatPriceRange(filters.priceRange),
      onRemove: () => update({ priceRange: [0, MAX_PRICE] }),
    });
  }
  if (filters.rooms !== "Any") {
    const r = filters.rooms;
    activeChips.push({
      key: "rooms",
      label: r === "4+" ? "4+ rooms" : `${r} room${r === "1" ? "" : "s"}`,
      onRemove: () => update({ rooms: "Any" }),
    });
  }
  for (const a of filters.amenities) {
    const label = AMENITIES.find((x) => x.key === a)?.label ?? a;
    activeChips.push({
      key: `amen-${a}`,
      label,
      onRemove: () => update({ amenities: filters.amenities.filter((x) => x !== a) }),
    });
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      {/* ===== HERO ===== */}
      <section className="gb-hero -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-10 pb-8 rounded-b-2xl">
        <div className="mx-auto max-w-3xl text-center">
          <Badge variant="secondary" className="mb-3 gap-1 bg-background/70 backdrop-blur">
            <Sparkles className="size-3 text-primary" aria-hidden />
            <span>GB Rent · Gilgit-Baltistan rentals</span>
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-foreground">
            Find your home in the valleys of Gilgit-Baltistan
          </h1>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            Shops, houses, rooms, and hostels across Gilgit, Hunza, Skardu and beyond — with
            AI-assisted fair-price hints on every listing.
          </p>

          {/* Search + CTA */}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <div className="relative flex-1 sm:max-w-xl">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setFilters((f) => (f.q === qInput ? f : { ...f, q: qInput }));
                    setPage(1);
                  }
                }}
                placeholder="Search by title, area, or address — e.g. “Hunza”, “shop”, “Karimabad”"
                aria-label="Search listings"
                className="h-11 bg-background/95 pl-9"
              />
            </div>
            <Button
              size="lg"
              onClick={handleListProperty}
              className="h-11"
              aria-label="List a property"
            >
              <ListPlus className="size-4" aria-hidden />
              <span>List a property</span>
            </Button>
          </div>

          {/* Type pills */}
          <div
            className="mt-4 flex flex-wrap justify-center gap-2"
            role="group"
            aria-label="Filter by property type"
          >
            {TYPE_PILLS.map((t) => {
              const active = filters.type === t;
              if (t === "ALL") {
                return (
                  <Button
                    key="all"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="rounded-full"
                    onClick={() => update({ type: "ALL" })}
                    aria-pressed={active}
                  >
                    All
                  </Button>
                );
              }
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => update({ type: t })}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full transition-all",
                    active
                      ? "ring-2 ring-ring ring-offset-1 ring-offset-background"
                      : "opacity-70 hover:opacity-100"
                  )}
                >
                  <TypeBadge type={t} className="px-3 py-1 text-[11px]" />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== STATS STRIP ===== */}
      <section
        className="mt-6 grid grid-cols-3 gap-2 sm:gap-4"
        aria-label="Marketplace stats"
      >
        <StatBlock
          icon={<ListPlus className="size-4" aria-hidden />}
          value={total > 0 ? `${total} active listings` : "— active listings"}
        />
        <StatBlock
          icon={<MapPin className="size-4" aria-hidden />}
          value={`${CITY_ZONES.length} districts covered`}
        />
        <StatBlock
          icon={<Sparkles className="size-4" aria-hidden />}
          value="AI fair-price assisted"
        />
      </section>

      {/* ===== BODY: filters + grid ===== */}
      <div className="mt-6 flex gap-6">
        {/* Desktop filter sidebar */}
        <aside
          className="hidden md:block w-64 shrink-0"
          aria-label="Listing filters"
        >
          <FilterPanel filters={filters} update={update} onClear={handleClearAll} />
        </aside>

        <section className="min-w-0 flex-1">
          {/* Toolbar */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-semibold">
                {isLoading
                  ? "Loading…"
                  : `${total} ${total === 1 ? "listing" : "listings"}`}
              </h2>
              {isFetching && !isLoading && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <RotateCw className="size-3 animate-spin" aria-hidden /> updating
                </span>
              )}
            </div>

            {/* Mobile filter trigger */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="md:hidden">
                  <SlidersHorizontal className="size-4" aria-hidden />
                  <span>Filters</span>
                  {activeChips.length > 0 && (
                    <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">
                      {activeChips.length}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0 sm:max-w-sm">
                <SheetHeader className="px-5 pt-5 pb-2">
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="gb-scroll overflow-y-auto px-5 pb-8">
                  <FilterPanel
                    filters={filters}
                    update={update}
                    onClear={handleClearAll}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Active filter chips */}
          {activeChips.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {activeChips.map((chip) => (
                <Badge
                  key={chip.key}
                  variant="secondary"
                  className="gap-1 py-1 pl-2.5 pr-1"
                >
                  <span>{chip.label}</span>
                  <button
                    type="button"
                    aria-label={`Remove filter ${chip.label}`}
                    onClick={chip.onRemove}
                    className="rounded-full p-0.5 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </Badge>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleClearAll}
              >
                Clear all
              </Button>
            </div>
          )}

          {/* Results body */}
          {isLoading ? (
            <ResultsSkeleton />
          ) : isError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Couldn&apos;t load listings</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-4">
                <span>
                  {error instanceof Error
                    ? error.message
                    : "Something went wrong. Please try again."}
                </span>
                <Button size="sm" variant="outline" onClick={() => refetch()}>
                  <RotateCw className="size-4" aria-hidden /> Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : items.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="No listings match your filters"
              description="Try widening your price range, removing a filter, or searching a different area of Gilgit-Baltistan."
              action={
                <Button onClick={handleClearAll} variant="default">
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
                {items.map((p) => (
                  <PropertyCard key={p.id} property={p} />
                ))}
              </div>

              {totalPages > 1 && (
                <Pagination className="mt-8" aria-label="Listings pages">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (activePage > 1) setActivePage(activePage - 1);
                        }}
                        aria-disabled={activePage <= 1}
                        className={
                          activePage <= 1
                            ? "pointer-events-none opacity-50"
                            : "cursor-pointer"
                        }
                      />
                    </PaginationItem>
                    {getPageRange(activePage, totalPages).map((p, i) =>
                      p === "ellipsis" ? (
                        <PaginationItem key={`e-${i}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={p}>
                          <PaginationLink
                            href="#"
                            isActive={p === activePage}
                            aria-label={
                              p === activePage
                                ? `Page ${p}, current page`
                                : `Go to page ${p}`
                            }
                            onClick={(e) => {
                              e.preventDefault();
                              setActivePage(p);
                            }}
                            className="cursor-pointer"
                          >
                            {p}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    )}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (activePage < totalPages) setActivePage(activePage + 1);
                        }}
                        aria-disabled={activePage >= totalPages}
                        className={
                          activePage >= totalPages
                            ? "pointer-events-none opacity-50"
                            : "cursor-pointer"
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Sub-components                                                     */
/* ----------------------------------------------------------------- */

function StatBlock({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 sm:px-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent/40 text-accent-foreground">
        {icon}
      </div>
      <span className="text-xs font-medium leading-tight sm:text-sm">{value}</span>
    </div>
  );
}

function FilterPanel({
  filters,
  update,
  onClear,
}: {
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Filters</h3>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClear}>
          Clear
        </Button>
      </div>

      {/* Property type */}
      <div className="space-y-2">
        <Label htmlFor="f-type">Property type</Label>
        <Select
          value={filters.type}
          onValueChange={(v) => update({ type: v as TypeFilter })}
        >
          <SelectTrigger id="f-type" className="w-full">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {PROPERTY_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {PROPERTY_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* City zone */}
      <div className="space-y-2">
        <Label htmlFor="f-zone">City zone</Label>
        <Select
          value={filters.cityZone}
          onValueChange={(v) => update({ cityZone: v as ZoneFilter })}
        >
          <SelectTrigger id="f-zone" className="w-full">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All zones</SelectItem>
            {CITY_ZONES.map((z) => (
              <SelectItem key={z} value={z}>
                {z}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Price range */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Price range / month</Label>
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatPriceRange(filters.priceRange)}
          </span>
        </div>
        <Slider
          value={filters.priceRange}
          onValueChange={(v) =>
            update({ priceRange: [v[0] ?? 0, v[1] ?? MAX_PRICE] as [number, number] })
          }
          min={0}
          max={MAX_PRICE}
          step={PRICE_STEP}
          aria-label="Minimum and maximum price in Pakistani rupees per month"
          className="py-2"
        />
        <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>PKR 0</span>
          <span>PKR {(MAX_PRICE / 1000).toFixed(0)}k+</span>
        </div>
      </div>

      {/* Rooms */}
      <div className="space-y-2">
        <Label htmlFor="f-rooms">Rooms</Label>
        <Select
          value={filters.rooms}
          onValueChange={(v) => update({ rooms: v as RoomFilter })}
        >
          <SelectTrigger id="f-rooms" className="w-full">
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            {ROOM_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r === "Any"
                  ? "Any"
                  : r === "4+"
                    ? "4 or more"
                    : `${r} room${r === "1" ? "" : "s"}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Amenities */}
      <div className="space-y-2">
        <Label>Amenities</Label>
        <div className="grid grid-cols-1 gap-2">
          {AMENITIES.map((a) => {
            const id = `f-amen-${a.key}`;
            const checked = filters.amenities.includes(a.key);
            return (
              <div key={a.key} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={(v) => {
                    if (v) {
                      update({ amenities: [...filters.amenities, a.key] });
                    } else {
                      update({
                        amenities: filters.amenities.filter((x) => x !== a.key),
                      });
                    }
                  }}
                />
                <Label htmlFor={id} className="cursor-pointer font-normal text-sm">
                  {a.label}
                </Label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sort */}
      <div className="space-y-2">
        <Label htmlFor="f-sort">Sort by</Label>
        <Select
          value={filters.sort}
          onValueChange={(v) => update({ sort: v as SortKey })}
        >
          <SelectTrigger id="f-sort" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button variant="outline" className="w-full" onClick={onClear}>
        Clear all filters
      </Button>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
      {Array.from({ length: 9 }).map((_, i) => (
        <Card key={i} className="gap-0 overflow-hidden p-0">
          <AspectRatio ratio={4 / 3} className="bg-muted">
            <Skeleton className="size-full" />
          </AspectRatio>
          <div className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/4" />
            </div>
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </Card>
      ))}
    </div>
  );
}
