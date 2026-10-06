"use client";
/**
 * Amenity icon mapping — uses lucide-react. Centralised so the listing form,
 * the detail page, and the card all render the same icon per amenity key.
 */
import {
  Sofa,
  Droplets,
  Zap,
  Car,
  Wifi,
  Flame,
  ChefHat,
  Bath,
  ShieldCheck,
  Trees,
  type LucideIcon,
} from "lucide-react";
import type { AmenityKey } from "@/lib/constants";

export const AMENITY_ICON: Record<AmenityKey, LucideIcon> = {
  FURNISHED: Sofa,
  WATER: Droplets,
  ELECTRICITY_BACKUP: Zap,
  PARKING: Car,
  INTERNET: Wifi,
  HEATING: Flame,
  KITCHEN: ChefHat,
  ATTACHED_BATH: Bath,
  SECURITY: ShieldCheck,
  GARDEN: Trees,
};
