/** Shared TypeScript types for GB Rent. Mirrors the Prisma models + API contracts. */
import type {
  PropertyType,
  CityZone,
  AmenityKey,
  PropertyStatus,
  UserRole,
} from "@/lib/constants";

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  createdAt: string;
}

export interface PropertyImageDTO {
  id: string;
  url: string;
  position: number;
}

export interface PropertyDTO {
  id: string;
  title: string;
  type: PropertyType;
  address: string;
  area: string;
  cityZone: CityZone;
  price: number;
  rooms: number;
  size: number | null;
  amenities: AmenityKey[];
  description: string;
  latitude: number | null;
  longitude: number | null;
  status: PropertyStatus;
  createdAt: string;
  updatedAt: string;
  userId: string;
  user: Pick<UserDTO, "id" | "name" | "email" | "phone">;
  images: PropertyImageDTO[];
  favorited?: boolean; // present when requested by a logged-in user
}

export interface FavoriteDTO {
  id: string;
  createdAt: string;
  property: PropertyDTO;
}

export interface InquiryDTO {
  id: string;
  message: string;
  phone: string;
  createdAt: string;
  readAt: string | null; // null = unread → drives the notification dot
  property: Pick<PropertyDTO, "id" | "title" | "cityZone" | "area" | "price" | "type">;
  user: Pick<UserDTO, "id" | "name" | "email">;
}

/** Search query params. */
export interface PropertySearchParams {
  q?: string;
  type?: PropertyType | "ALL";
  cityZone?: CityZone | "ALL";
  minPrice?: number;
  maxPrice?: number;
  rooms?: number;
  amenities?: AmenityKey[];
  sort?: "newest" | "price_asc" | "price_desc";
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** AI service contracts (mirrors mini-services/ai-service). */
export interface PricePredictionRequest {
  propertyId?: string;
  type: PropertyType;
  cityZone: CityZone;
  area: string;
  rooms: number;
  size: number | null;
  amenities: AmenityKey[];
}

export interface PriceComparable {
  id: string;
  title: string;
  cityZone: string;
  area: string;
  price: number;
  rooms: number;
  size: number | null;
}
export type PricePredictionResponse = {
  explanation: string;
  comparables: PriceComparable[];
  evidence: "insufficient" | "limited" | "moderate";
  method: "similar-listings";
} & ({
  available: true;
  predictedPrice: number;
  low: number;
  high: number;
} | {
  available: false;
  predictedPrice: null;
  low: null;
  high: null;
});

export interface SimilarPropertyRequest {
  propertyId: string;
  candidates: Array<{
    id: string;
    type: PropertyType;
    cityZone: CityZone;
    price: number;
    rooms: number;
    size: number | null;
    amenities: AmenityKey[];
  }>;
  target: {
    type: PropertyType;
    cityZone: CityZone;
    price: number;
    rooms: number;
    size: number | null;
    amenities: AmenityKey[];
  };
  k?: number;
}

export interface SimilarPropertyResponse {
  matches: Array<{
    id: string;
    similarity: number; // 0..1
    distance: number;
  }>;
  method: string;
}

/** Create/update payload. */
export interface PropertyInput {
  title: string;
  type: PropertyType;
  address: string;
  area: string;
  cityZone: CityZone;
  price: number;
  rooms: number;
  size?: number | null;
  amenities: AmenityKey[];
  description: string;
  latitude?: number | null;
  longitude?: number | null;
  images: string[]; // relative URLs returned by /api/upload
}
