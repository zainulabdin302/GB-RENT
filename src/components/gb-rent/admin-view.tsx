"use client";
/**
 * AdminView — admin-only moderation + analytics panel.
 *
 * Three tabs:
 *   1. Overview  — GET /api/admin/stats. KPI cards + two recharts bar charts
 *                  (listings by type, listings by city zone) + average rent by
 *                  type table + recent-listings list (Review → jumps to tab 2).
 *   2. Listings — GET /api/admin/properties?status=… (filter Select).
 *                  Moderation queue table. Approve / Reject for PENDING rows
 *                  PATCHes /api/admin/properties/{id}.
 *   3. Users    — GET /api/admin/users. Table with role Select (USER ⇄ ADMIN)
 *                  PATCHing /api/admin/users/{id}. Self-demotion guard disables
 *                  the Select for the signed-in admin. Client-side search filter.
 *
 * Auth gates: unauthenticated → sign-in Card; authenticated but not ADMIN → 403 Card.
 */
import { useMemo, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  Building2,
  CheckCircle2,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Loader2,
  MapPin,
  Search,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";

import { apiFetch, ApiError, buildQuery } from "@/lib/api-fetch";
import { useView } from "@/stores/view-store";
import { useUI } from "@/stores/ui-store";
import {
  CITY_ZONES,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABEL,
  formatPKR,
  formatPKRFull,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
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

import { EmptyState } from "@/components/gb-rent/empty-state";
import { TypeBadge } from "@/components/gb-rent/type-badge";
import { AdminPaymentsView } from "@/components/gb-rent/admin-payments-view";

import type { Paginated, PropertyDTO, UserDTO } from "@/types";

const FALLBACK_IMAGE = "/uploads/seed-house-2.jpg";

// Stats shape returned by GET /api/admin/stats.
interface AdminStats {
  totalUsers: number;
  totalProperties: number;
  pending: number;
  approved: number;
  rejected: number;
  byType: Record<string, number>;
  byCity: Record<string, number>;
  avgPriceByType: Record<string, number | null>;
  avgPriceByCity: Record<string, number | null>;
  recentListings: PropertyDTO[];
}

// ─── Auth gates ───────────────────────────────────────────────────────────────

function AdminSignInPrompt() {
  const openAuth = useUI((s) => s.openAuth);
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <Card className="gap-4 text-center">
        <CardHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <CardTitle className="text-xl">Sign in to view the admin panel</CardTitle>
          <CardDescription>
            Admin access is required to moderate listings, manage users, and view analytics.
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

function ForbiddenCard() {
  const go = useView((s) => s.go);
  return (
    <div className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <Card className="gap-4 text-center">
        <CardHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200">
            <ShieldAlert className="size-6" />
          </div>
          <CardTitle className="text-xl">403 — Admin access required</CardTitle>
          <CardDescription>
            Your account does not have admin privileges. If you believe this is a mistake,
            contact the platform administrator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => go({ name: "home" })} variant="outline">
            Back to home
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

// ─── Status badge (shared) ────────────────────────────────────────────────────

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

function RoleBadge({ role }: { role: "USER" | "ADMIN" }) {
  if (role === "ADMIN") {
    return (
      <Badge className="gap-1 border-emerald-300/60 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
        <ShieldCheck className="size-3" />
        Admin
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Users className="size-3" />
      User
    </Badge>
  );
}

// ─── Overview tab ──────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  SHOP: "#f59e0b",
  HOUSE: "#10b981",
  ROOM: "#f43f5e",
  HOSTEL: "#a8a29e",
};

const CHART_CONFIG: ChartConfig = {
  SHOP: { label: "Shop", color: TYPE_COLORS.SHOP },
  HOUSE: { label: "House", color: TYPE_COLORS.HOUSE },
  ROOM: { label: "Room", color: TYPE_COLORS.ROOM },
  HOSTEL: { label: "Hostel", color: TYPE_COLORS.HOSTEL },
  city: { label: "Listings", color: "#10b981" },
};

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Users;
  tone: "emerald" | "amber" | "rose" | "stone" | "primary";
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
      : tone === "emerald"
        ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
        : tone === "rose"
          ? "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200"
          : tone === "primary"
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground";
  return (
    <Card className="gap-2 py-4">
      <CardContent className="flex items-center gap-3 px-4">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", toneClass)}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="text-2xl font-bold leading-none tabular-nums">{value}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiSkeleton() {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="flex items-center gap-3 px-4">
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-3 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

function TypeBarChart({ byType }: { byType: Record<string, number> }) {
  const data = PROPERTY_TYPES.map((t) => ({
    type: t,
    label: PROPERTY_TYPE_LABEL[t],
    count: byType[t] ?? 0,
  }));
  return (
    <ChartContainer config={CHART_CONFIG} className="h-[260px] w-full">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          fontSize={12}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={4} fontSize={12} width={28} />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--background))",
            fontSize: 12,
          }}
          formatter={(v: number) => [`${v} listings`, "Count"]}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={64}>
          {data.map((entry) => (
            <Cell key={entry.type} fill={TYPE_COLORS[entry.type]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function CityBarChart({ byCity }: { byCity: Record<string, number> }) {
  const data = CITY_ZONES.map((c) => ({
    city: c,
    count: byCity[c] ?? 0,
  }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count);
  return (
    <ChartContainer
      config={{ city: CHART_CONFIG.city }}
      className="h-[260px] w-full"
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border) / 0.5)" />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tickMargin={4} fontSize={12} />
        <YAxis
          type="category"
          dataKey="city"
          tickLine={false}
          axisLine={false}
          width={64}
          tickMargin={4}
          fontSize={12}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--background))",
            fontSize: 12,
          }}
          formatter={(v: number) => [`${v} listings`, "Count"]}
        />
        <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28} fill="#10b981" />
      </BarChart>
    </ChartContainer>
  );
}

function AvgPriceByTypeTable({ avgPriceByType }: { avgPriceByType: Record<string, number | null> }) {
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b">
        <CardTitle className="text-sm font-semibold">
          Average monthly rent by type
        </CardTitle>
        <CardDescription className="text-xs">
          Based on approved listings only.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Avg rent / month</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PROPERTY_TYPES.map((t) => {
              const v = avgPriceByType[t];
              return (
                <TableRow key={t}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: TYPE_COLORS[t] }}
                        aria-hidden
                      />
                      <span className="font-medium">{PROPERTY_TYPE_LABEL[t]}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {v == null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      formatPKRFull(v)
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RecentListings({ items, onReview }: { items: PropertyDTO[]; onReview: () => void }) {
  const go = useView((s) => s.go);
  if (items.length === 0) {
    return (
      <Card className="gap-0 py-0">
        <CardHeader className="border-b">
          <CardTitle className="text-sm font-semibold">Recent listings</CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-sm text-muted-foreground">
          No listings yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b">
        <CardTitle className="text-sm font-semibold">Recent listings</CardTitle>
        <CardDescription className="text-xs">
          The latest 5 properties submitted to the platform (any status).
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y">
          {items.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
            >
              <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                <Image
                  src={p.images[0]?.url ?? FALLBACK_IMAGE}
                  alt={p.title}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => go({ name: "detail", propertyId: p.id })}
                  className="block max-w-full truncate text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {p.title}
                </button>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" />
                    {p.area}, {p.cityZone}
                  </span>
                  <span className="inline-flex items-center gap-1 text-primary">
                    {formatPKR(p.price)}
                  </span>
                  <span
                    title={format(new Date(p.createdAt), "dd MMM yyyy")}
                    className="inline-flex items-center gap-1"
                  >
                    {formatDistanceToNow(new Date(p.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={p.status} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onReview}
                  className="gap-1.5"
                >
                  Review
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function OverviewTab({ onReview }: { onReview: () => void }) {
  const { data, isLoading, isError, error } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: () => apiFetch("/api/admin/stats"),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <KpiSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-[320px] rounded-xl" />
          <Skeleton className="h-[320px] rounded-xl" />
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Could not load analytics"
        description={
          error instanceof ApiError ? error.message : "Please try again in a moment."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPI cards */}
      <section
        aria-label="Key platform metrics"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5"
      >
        <KpiCard label="Total users" value={data.totalUsers} icon={Users} tone="primary" />
        <KpiCard label="Total listings" value={data.totalProperties} icon={Building2} tone="stone" />
        <KpiCard label="Pending approval" value={data.pending} icon={Clock} tone="amber" />
        <KpiCard label="Approved" value={data.approved} icon={CheckCircle2} tone="emerald" />
        <KpiCard label="Rejected" value={data.rejected} icon={XCircle} tone="rose" />
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Listings by type</CardTitle>
            <CardDescription className="text-xs">
              Distribution across shops, houses, rooms, and hostels.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TypeBarChart byType={data.byType} />
          </CardContent>
        </Card>
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              Listings by city zone
            </CardTitle>
            <CardDescription className="text-xs">
              Approved listings per GB city / valley.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CityBarChart byCity={data.byCity} />
          </CardContent>
        </Card>
      </section>

      {/* Avg rent table + recent listings */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AvgPriceByTypeTable avgPriceByType={data.avgPriceByType} />
        <RecentListings items={data.recentListings} onReview={onReview} />
      </section>
    </div>
  );
}

// ─── Listings tab ─────────────────────────────────────────────────────────────

type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

function useStatusMutation(propertyId: string, status: "APPROVED" | "REJECTED") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<PropertyDTO>(`/api/admin/properties/${propertyId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      toast.success(
        status === "APPROVED" ? "Listing approved" : "Listing rejected"
      );
      qc.invalidateQueries({ queryKey: ["admin-properties"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      // Refresh the admin pending-notification dot so it updates immediately.
      qc.invalidateQueries({ queryKey: ["notifications", "admin-pending"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not update listing");
    },
  });
}

/**
 * Delete mutation — admins can remove ANY property (approved, pending, or
 * rejected). Hits DELETE /api/properties/[id] which the backend allows for
 * the owner OR an admin. Cascade-deletes the property's images, favorites,
 * and inquiries (configured in the Prisma schema).
 */
function useDeletePropertyMutation(propertyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<null>(`/api/properties/${propertyId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Listing removed");
      qc.invalidateQueries({ queryKey: ["admin-properties"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      qc.invalidateQueries({ queryKey: ["properties"] });
      qc.invalidateQueries({ queryKey: ["property", propertyId] });
      // Refresh both notification dots: admin pending (deleting a PENDING
      // listing lowers the count) and user unread (deleting a property also
      // cascades its inquiries).
      qc.invalidateQueries({ queryKey: ["notifications", "admin-pending"] });
      qc.invalidateQueries({ queryKey: ["notifications", "user-unread"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not remove listing");
    },
  });
}

function ListingsTableRow({
  p,
  statusFilter,
}: {
  p: PropertyDTO;
  statusFilter: StatusFilter;
}) {
  const go = useView((s) => s.go);
  const approve = useStatusMutation(p.id, "APPROVED");
  const reject = useStatusMutation(p.id, "REJECTED");
  const del = useDeletePropertyMutation(p.id);

  return (
    <TableRow className="hover:bg-muted/40">
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
            <Image
              src={p.images[0]?.url ?? FALLBACK_IMAGE}
              alt={p.title}
              fill
              sizes="48px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <button
              onClick={() => go({ name: "detail", propertyId: p.id })}
              className="block max-w-[14rem] truncate text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title={p.title}
            >
              {p.title}
            </button>
            <div className="mt-0.5 flex items-center gap-1.5">
              <TypeBadge type={p.type} />
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5" />
          <span className="max-w-[10rem] truncate">
            {p.area}, {p.cityZone}
          </span>
        </span>
      </TableCell>
      <TableCell className="hidden sm:table-cell tabular-nums">
        {formatPKR(p.price)}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm">{p.user.name}</span>
          <span className="text-xs text-muted-foreground">{p.user.email}</span>
        </div>
      </TableCell>
      <TableCell>
        <StatusBadge status={p.status} />
      </TableCell>
      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
        {format(new Date(p.createdAt), "dd MMM yyyy")}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1.5">
          {p.status === "PENDING" ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => approve.mutate()}
                disabled={p.paymentStatus !== "VERIFIED" || approve.isPending || reject.isPending || del.isPending}
                className="gap-1.5 border-emerald-300/60 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
              >
                {approve.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                {p.paymentStatus === "VERIFIED" ? "Approve Property" : "Verify Payment First"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => reject.mutate()}
                disabled={approve.isPending || reject.isPending || del.isPending}
                className="gap-1.5 border-rose-300/60 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/30"
              >
                {reject.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <X className="size-4" />
                )}
                Reject
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => go({ name: "detail", propertyId: p.id })}
              className="gap-1.5"
              disabled={del.isPending}
            >
              <Eye className="size-4" />
              View
            </Button>
          )}
          {/* Admin delete — available on EVERY row regardless of status.
              Confirms via AlertDialog because the action is destructive and
              cascade-deletes images/favorites/inquiries. */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label="Delete listing"
                disabled={approve.isPending || reject.isPending || del.isPending}
                className="gap-1.5 border-rose-300/60 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/30"
              >
                {del.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Trash2 className="size-4" />
                )}
                <span className="hidden sm:inline">Delete</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this listing?</AlertDialogTitle>
                <AlertDialogDescription>
                  You are about to permanently delete <strong>“{p.title}”</strong> by{" "}
                  {p.user.name}. This also removes its{" "}
                  {p.images.length} photo{p.images.length === 1 ? "" : "s"}, any
                  favorites, and any inquiries. This action cannot be undone.
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
                  className="gap-1.5 bg-destructive text-white hover:bg-destructive/90"
                >
                  {del.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Delete listing
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ListingsTable({
  data,
  isLoading,
  statusFilter,
  page,
  onPage,
}: {
  data: Paginated<PropertyDTO> | undefined;
  isLoading: boolean;
  statusFilter: StatusFilter;
  page: number;
  onPage: (p: number) => void;
}) {
  if (isLoading) {
    return (
      <Card className="gap-0 py-0">
        <CardContent className="px-0">
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-12 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title={
          statusFilter === "PENDING"
            ? "No listings awaiting approval"
            : "No listings match this filter"
        }
        description={
          statusFilter === "PENDING"
            ? "New submissions will appear here for your review."
            : "Try switching to a different status filter."
        }
      />
    );
  }

  return (
    <Card className="gap-0 py-0">
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Listing</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead className="hidden sm:table-cell">Price</TableHead>
              <TableHead className="hidden lg:table-cell">Lister</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((p) => (
              <ListingsTableRow key={p.id} p={p} statusFilter={statusFilter} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          {total} {total === 1 ? "listing" : "listings"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="gap-1"
          >
            <ChevronLeft className="size-4" />
            Prev
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            Page {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages}
            className="gap-1"
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ListingsTab() {
  const [status, setStatus] = useState<StatusFilter>("PENDING");
  const [page, setPage] = useState(1);

  const query = buildQuery({ status, page, pageSize: 20 });
  const { data, isLoading } = useQuery<Paginated<PropertyDTO>>({
    queryKey: ["admin-properties", status, page],
    queryFn: () => apiFetch(`/api/admin/properties${query}`),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Moderation queue</h2>
          <p className="text-sm text-muted-foreground">
            Approve, reject, or remove any listing. As admin you have full
            delete access to every property on the platform.
          </p>
        </div>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as StatusFilter);
            setPage(1);
          }}
        >
          <SelectTrigger size="sm" className="w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="ALL">All statuses</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <ListingsTable
        data={data}
        isLoading={isLoading}
        statusFilter={status}
        page={page}
        onPage={setPage}
      />
    </div>
  );
}

// ─── Users tab ────────────────────────────────────────────────────────────────

function RoleSelect({
  user,
  currentAdminId,
}: {
  user: UserDTO;
  currentAdminId: string;
}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const isSelf = user.id === currentAdminId;
  const update = useMutation({
    mutationFn: (role: "USER" | "ADMIN") =>
      apiFetch<UserDTO>(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onMutate: () => setPending(true),
    onSuccess: (updated) => {
      toast.success(`${updated.name} is now ${updated.role}`);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not update role");
    },
    onSettled: () => setPending(false),
  });

  return (
    <Select
      value={user.role}
      disabled={isSelf || pending}
      onValueChange={(v) => update.mutate(v as "USER" | "ADMIN")}
    >
      <SelectTrigger size="sm" className="w-32" aria-label={`Change role for ${user.name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="USER">User</SelectItem>
        <SelectItem value="ADMIN">Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}

function UsersTab({ currentAdminId }: { currentAdminId: string }) {
  const [q, setQ] = useState("");
  const { data, isLoading, isError, error } = useQuery<UserDTO[]>({
    queryKey: ["admin-users"],
    queryFn: () => apiFetch("/api/admin/users"),
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (u) =>
        u.name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle)
    );
  }, [data, q]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm text-muted-foreground">
            Manage user roles. You cannot demote yourself.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or email"
            className="pl-9"
            aria-label="Search users"
          />
        </div>
      </div>

      {isLoading ? (
        <Card className="gap-0 py-0">
          <CardContent className="px-0">
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : isError ? (
        <EmptyState
          icon={Users}
          title="Could not load users"
          description={
            error instanceof ApiError ? error.message : "Please try again in a moment."
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q.trim() ? "No users match your search" : "No users yet"}
          description={
            q.trim()
              ? "Try a different name or email."
              : "Newly registered users will appear here."
          }
        />
      ) : (
        <Card className="gap-0 py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead className="hidden md:table-cell">Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden lg:table-cell">Joined</TableHead>
                  <TableHead className="text-right">Change role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id} className="hover:bg-muted/40">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary">
                          {u.name
                            .split(" ")
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <span className="font-medium">{u.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {u.email}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {u.phone ?? "—"}
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={u.role as "USER" | "ADMIN"} />
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {format(new Date(u.createdAt), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <RoleSelect user={u} currentAdminId={currentAdminId} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Root view ────────────────────────────────────────────────────────────────

export function AdminView() {
  const { status, data: session } = useSession();
  const [tab, setTab] = useState("overview");

  if (status === "loading") return <FullScreenSpinner label="Loading admin panel…" />;
  if (status === "unauthenticated") return <AdminSignInPrompt />;
  if (session?.user?.role !== "ADMIN") return <ForbiddenCard />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Admin panel</h1>
        <p className="text-sm text-muted-foreground">
          Moderate listings, manage users, and view platform analytics.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="overview" className="gap-1.5">
            <TrendingUp className="size-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="listings" className="gap-1.5">
            <Building2 className="size-4" />
            Listings
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5">\n            Payments\n          </TabsTrigger>\n          <TabsTrigger value="users" className="gap-1.5">
            <Users className="size-4" />
            Users
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab onReview={() => setTab("listings")} />
        </TabsContent>
        <TabsContent value="listings" className="mt-6">
          <ListingsTab />
        </TabsContent>
        <TabsContent value="payments" className="mt-6">\n          <AdminPaymentsView />\n        </TabsContent>\n        <TabsContent value="users" className="mt-6">
          <UsersTab currentAdminId={session.user.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
