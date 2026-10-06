"use client";
import Link from "next/link";
import Image from "next/image";
import { Heart, MapPin, BedSingle, Maximize, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { PriceTag } from "@/components/gb-rent/price-tag";
import { TypeBadge } from "@/components/gb-rent/type-badge";
import { useFavorite } from "@/hooks/use-favorite";
import { useView } from "@/stores/view-store";
import { useUI } from "@/stores/ui-store";
import { useSession } from "next-auth/react";
import type { PropertyDTO } from "@/types";
import { cn } from "@/lib/utils";

/** Property card used in home grid, dashboard, and similar-properties. */
export function PropertyCard({
  property,
  className,
  showActions = false,
  onEdit,
  onDelete,
}: {
  property: PropertyDTO;
  className?: string;
  showActions?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const go = useView((s) => s.go);
  const openAuth = useUI((s) => s.openAuth);
  const { status } = useSession();
  const fav = useFavorite();
  const isFav = !!property.favorited;

  const cover = property.images[0]?.url ?? "/uploads/seed-house-2.jpg";

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => go({ name: "detail", propertyId: property.id })}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go({ name: "detail", propertyId: property.id });
        }
      }}
      className={cn(
        "group cursor-pointer overflow-hidden p-0 transition-all hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <div className="relative">
        <AspectRatio ratio={4 / 3} className="bg-muted">
          <Image
            src={cover}
            alt={property.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </AspectRatio>
        <div className="absolute left-3 top-3 flex gap-2">
          <TypeBadge type={property.type} className="bg-background/85 backdrop-blur" />
        </div>
        {status === "authenticated" && !showActions && (
          <Button
            variant="secondary"
            size="icon"
            aria-label={isFav ? "Remove from favorites" : "Save to favorites"}
            className={cn(
              "absolute right-3 top-3 size-9 rounded-full bg-background/85 backdrop-blur shadow-sm hover:bg-background",
              isFav && "text-rose-600"
            )}
            onClick={(e) => {
              e.stopPropagation();
              fav.mutate({ propertyId: property.id, add: !isFav });
            }}
          >
            <Heart className={cn("size-4", isFav && "fill-current")} />
          </Button>
        )}
        {showActions && (
          <div className="absolute right-3 top-3 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="bg-background/85 backdrop-blur"
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.();
              }}
            >
              Edit
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Delete listing"
              className="bg-background/85 backdrop-blur text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-base font-semibold leading-tight">
            {property.title}
          </h3>
          <PriceTag price={property.price} className="text-primary whitespace-nowrap" />
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="line-clamp-1">
            {property.area}, {property.cityZone}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BedSingle className="size-4" /> {property.rooms} {property.rooms === 1 ? "room" : "rooms"}
          </span>
          {property.size != null && (
            <span className="inline-flex items-center gap-1">
              <Maximize className="size-4" /> {property.size.toLocaleString()} ft²
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

export { Link };
