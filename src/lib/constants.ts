/**
 * GB Rent — domain constants for Gilgit-Baltistan.
 * Centralised so the frontend dropdowns and backend validation agree.
 * (For FYP defense: this single source of truth prevents enum drift
 *  between client, server, and AI feature engineering.)
 */

export const PROPERTY_TYPES = ["SHOP", "HOUSE", "ROOM", "HOSTEL"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  SHOP: "Shop",
  HOUSE: "House",
  ROOM: "Room",
  HOSTEL: "Hostel",
};

export const PROPERTY_TYPE_ICON: Record<PropertyType, string> = {
  SHOP: "Shop",
  HOUSE: "Home",
  ROOM: "BedSingle",
  HOSTEL: "Building2",
};

/** GB cities / valleys — the "city zone" filter dimension. */
export const CITY_ZONES = [
  "Gilgit",
  "Hunza",
  "Skardu",
  "Ghizer",
  "Ghanche",
  "Shigar",
  "Kharmang",
  "Nagar",
  "Astore",
  "Diamer",
] as const;
export type CityZone = (typeof CITY_ZONES)[number];

/**
 * Amenities — boolean feature flags per listing.
 * These are also the categorical features used by the AI service
 * (one-hot encoded for the RandomForest + cosine similarity models).
 */
export const AMENITIES = [
  { key: "FURNISHED", label: "Furnished" },
  { key: "WATER", label: "Water supply" },
  { key: "ELECTRICITY_BACKUP", label: "Electricity backup" },
  { key: "PARKING", label: "Parking" },
  { key: "INTERNET", label: "Internet" },
  { key: "HEATING", label: "Heating" },
  { key: "KITCHEN", label: "Kitchen" },
  { key: "ATTACHED_BATH", label: "Attached bath" },
  { key: "SECURITY", label: "Security guard" },
  { key: "GARDEN", label: "Garden / lawn" },
] as const;
export type AmenityKey = (typeof AMENITIES)[number]["key"];

export const PROPERTY_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type PropertyStatus = (typeof PROPERTY_STATUS)[keyof typeof PROPERTY_STATUS];

export const USER_ROLES = {
  USER: "USER",
  ADMIN: "ADMIN",
} as const;
export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

/** Format PKR amounts for display. */
export function formatPKR(amount: number): string {
  if (amount >= 100000) {
    return `PKR ${(amount / 100000).toFixed(amount % 100000 === 0 ? 0 : 1)}L /mo`;
  }
  if (amount >= 1000) {
    return `PKR ${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k /mo`;
  }
  return `PKR ${amount.toLocaleString()} /mo`;
}

export function formatPKRFull(amount: number): string {
  return `PKR ${amount.toLocaleString()}`;
}
