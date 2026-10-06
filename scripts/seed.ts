import bcrypt from "bcryptjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { AMENITIES } from "../src/lib/constants";
import type { AmenityKey, PropertyType, CityZone } from "../src/lib/constants";
import { uploadDirectory } from "../src/lib/uploads";
const prisma = new PrismaClient();
// ─── Placeholder image bytes (1x1 PNG, base64) ───────────────────────────────
// A 1x1 transparent PNG. We write this content to a small set of placeholder
// files under public/uploads so the frontend can render <img src="/uploads/seed-X.jpg">
// without the file 404'ing. Browsers detect the actual format via the PNG
// magic bytes, so the `.jpg` extension is cosmetic.
const PLACEHOLDER_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const PLACEHOLDER_FILES = [
  "seed-shop-1.jpg",
  "seed-shop-2.jpg",
  "seed-house-1.jpg",
  "seed-house-2.jpg",
  "seed-house-3.jpg",
  "seed-room-1.jpg",
  "seed-room-2.jpg",
  "seed-hostel-1.jpg",
  "seed-hostel-2.jpg",
];

async function ensurePlaceholderImages() {
  const dir = uploadDirectory();
  await fs.mkdir(dir, { recursive: true });
  const buf = Buffer.from(PLACEHOLDER_PNG_BASE64, "base64");
  await Promise.all(
    PLACEHOLDER_FILES.map((name) => fs.writeFile(path.join(dir, name), buf, { flag: "wx" }).catch((e: NodeJS.ErrnoException) => { if (e.code !== "EEXIST") throw e; }))
  );
}

// ─── Seed data ───────────────────────────────────────────────────────────────

interface SeedUser {
  email: string;
  name: string;
  password: string;
  phone: string;
  role: "USER" | "ADMIN";
}

const USERS: SeedUser[] = [
  { email: "admin@gbrent.pk", name: "GB Admin", password: "admin123", phone: "+92-301-1000001", role: "ADMIN" },
  { email: "ali@gbrent.pk", name: "Ali Raza", password: "user123", phone: "+92-301-2000001", role: "USER" },
  { email: "sara@gbrent.pk", name: "Sara Karim", password: "user123", phone: "+92-301-2000002", role: "USER" },
  { email: "khan@gbrent.pk", name: "Khan Bahadur", password: "user123", phone: "+92-301-2000003", role: "USER" },
];

interface SeedProperty {
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
  status: "PENDING" | "APPROVED" | "REJECTED";
  ownerEmail: string;
  images: string[];
}

const A = (k: AmenityKey) => k;
const ALL_AMENITY_KEYS: AmenityKey[] = AMENITIES.map((a) => a.key);

// Validates our amenity literals at compile time. (Strips unused-const warning.)
void ALL_AMENITY_KEYS;

const PROPERTIES: SeedProperty[] = [
  {
    title: "Spacious shop on Airport Road, Gilgit",
    type: "SHOP",
    address: "Shop #12, Airport Road, near City Shopping Centre",
    area: "Airport Road",
    cityZone: "Gilgit",
    price: 45000,
    rooms: 1,
    size: 480,
    amenities: [A("ELECTRICITY_BACKUP"), A("WATER"), A("SECURITY")],
    description:
      "Ground-floor commercial shop with wide frontage on busy Airport Road. Excellent footfall, suitable for retail or office use. Includes metered electricity backup and 24/7 security.",
    status: "APPROVED",
    ownerEmail: "ali@gbrent.pk",
    images: ["/uploads/seed-shop-1.jpg", "/uploads/seed-shop-2.jpg"],
  },
  {
    title: "Main-bazaar shop in Karimabad, Hunza",
    type: "SHOP",
    address: "Shop #4, Karimabad Bazaar, near Baltit Inn",
    area: "Karimabad Bazaar",
    cityZone: "Hunza",
    price: 35000,
    rooms: 1,
    size: 360,
    amenities: [A("WATER"), A("ELECTRICITY_BACKUP")],
    description:
      "Tourist-footfall shop on Karimabad main bazaar, perfect for souvenir/handicraft retail. Two large display windows, internal storage room.",
    status: "APPROVED",
    ownerEmail: "sara@gbrent.pk",
    images: ["/uploads/seed-shop-2.jpg", "/uploads/seed-shop-1.jpg"],
  },
  {
    title: "4-bed family house in Jutial, Gilgit",
    type: "HOUSE",
    address: "House #22, Street 4, Jutial Phase 2",
    area: "Jutial",
    cityZone: "Gilgit",
    price: 85000,
    rooms: 4,
    size: 1800,
    amenities: [
      A("FURNISHED"),
      A("WATER"),
      A("ELECTRICITY_BACKUP"),
      A("PARKING"),
      A("KITCHEN"),
      A("ATTACHED_BATH"),
      A("GARDEN"),
      A("HEATING"),
    ],
    description:
      "Spacious 4-bedroom house in quiet Jutial neighbourhood. Fully furnished, two attached baths, modern kitchen, front lawn, car porch for 2 vehicles. Heating for harsh winters.",
    status: "APPROVED",
    ownerEmail: "khan@gbrent.pk",
    images: [
      "/uploads/seed-house-1.jpg",
      "/uploads/seed-house-2.jpg",
      "/uploads/seed-house-3.jpg",
    ],
  },
  {
    title: "Modern 3-bed house in Skardu Main Bazaar",
    type: "HOUSE",
    address: "House #8, near Manthal Buddha Road",
    area: "Main Bazaar",
    cityZone: "Skardu",
    price: 72000,
    rooms: 3,
    size: 1400,
    amenities: [
      A("WATER"),
      A("ELECTRICITY_BACKUP"),
      A("PARKING"),
      A("KITCHEN"),
      A("ATTACHED_BATH"),
      A("INTERNET"),
    ],
    description:
      "3-bedroom house near Skardu Main Bazaar. Ideal for small family. Internet-ready, water tanker access, backup electricity. Walking distance to market.",
    status: "APPROVED",
    ownerEmail: "ali@gbrent.pk",
    images: ["/uploads/seed-house-2.jpg", "/uploads/seed-house-1.jpg"],
  },
  {
    title: "Riverside 5-bed house in Aliabad, Hunza",
    type: "HOUSE",
    address: "House #3, Hunza River View, Aliabad",
    area: "Aliabad",
    cityZone: "Hunza",
    price: 95000,
    rooms: 5,
    size: 2200,
    amenities: [
      A("FURNISHED"),
      A("WATER"),
      A("ELECTRICITY_BACKUP"),
      A("PARKING"),
      A("KITCHEN"),
      A("ATTACHED_BATH"),
      A("GARDEN"),
      A("HEATING"),
      A("INTERNET"),
      A("SECURITY"),
    ],
    description:
      "Premium riverside house with stunning mountain views. 5 bedrooms, landscaped lawn, secure gated compound. Perfect for expat tenants or guesthouse conversion.",
    status: "PENDING", // awaiting admin approval for demo
    ownerEmail: "sara@gbrent.pk",
    images: [
      "/uploads/seed-house-3.jpg",
      "/uploads/seed-house-1.jpg",
      "/uploads/seed-house-2.jpg",
    ],
  },
  {
    title: "Single room near Karakoram University, Gilgit",
    type: "ROOM",
    address: "Room #2, Street 7, Konodas",
    area: "Konodas",
    cityZone: "Gilgit",
    price: 9000,
    rooms: 1,
    size: 180,
    amenities: [A("WATER"), A("ATTACHED_BATH"), A("ELECTRICITY_BACKUP")],
    description:
      "Furnished single room ideal for university students. Walking distance to Karakoram International University. Attached bath, water supply, electricity backup.",
    status: "APPROVED",
    ownerEmail: "khan@gbrent.pk",
    images: ["/uploads/seed-room-1.jpg", "/uploads/seed-room-2.jpg"],
  },
  {
    title: "Shared room for working professional, Skardu",
    type: "ROOM",
    address: "Room #5, near Civil Hospital",
    area: "Hospital Road",
    cityZone: "Skardu",
    price: 7500,
    rooms: 1,
    size: 150,
    amenities: [A("WATER"), A("INTERNET"), A("HEATING")],
    description:
      "Shared room for working professional or student. Heating included. Internet available. Walking distance to Civil Hospital and Skardu Bazaar.",
    status: "APPROVED",
    ownerEmail: "ali@gbrent.pk",
    images: ["/uploads/seed-room-2.jpg", "/uploads/seed-room-1.jpg"],
  },
  {
    title: "Co-ed hostel for students, Gilgit",
    type: "HOSTEL",
    address: "GB Hostel #1, University Road",
    area: "University Road",
    cityZone: "Gilgit",
    price: 12000,
    rooms: 8,
    size: 1200,
    amenities: [
      A("WATER"),
      A("ELECTRICITY_BACKUP"),
      A("INTERNET"),
      A("KITCHEN"),
      A("ATTACHED_BATH"),
      A("SECURITY"),
      A("HEATING"),
    ],
    description:
      "8-bed hostel block near university. Shared kitchen, separate baths, fast internet, generator backup, 24/7 security. Monthly rate per bed.",
    status: "APPROVED",
    ownerEmail: "sara@gbrent.pk",
    images: [
      "/uploads/seed-hostel-1.jpg",
      "/uploads/seed-hostel-2.jpg",
    ],
  },
  {
    title: "Backpacker hostel in Karimabad, Hunza",
    type: "HOSTEL",
    address: "Hunza Backpackers Hostel, near Altit Fort Road",
    area: "Altit",
    cityZone: "Hunza",
    price: 15000,
    rooms: 6,
    size: 900,
    amenities: [
      A("WATER"),
      A("INTERNET"),
      A("KITCHEN"),
      A("HEATING"),
      A("GARDEN"),
    ],
    description:
      "Backpacker hostel with mountain-view garden. 6 private rooms, shared kitchen, free Wi-Fi. Suitable for tour operators or co-living tenants.",
    status: "REJECTED", // rejected for admin dashboard demo
    ownerEmail: "khan@gbrent.pk",
    images: ["/uploads/seed-hostel-2.jpg", "/uploads/seed-hostel-1.jpg"],
  },
];

export async function seedDemo() {
  await ensurePlaceholderImages();
  return prisma.$transaction(async (db) => {
    if (await db.user.count() || await db.property.count()) {
      console.log("Database already contains records; seed skipped.");
      return;
    }
    // 2. Create users (hash passwords with bcrypt).
    const userIdByEmail = new Map<string, string>();
    for (const u of USERS) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      const created = await db.user.create({
        data: {
          email: u.email.toLowerCase(),
          name: u.name,
          passwordHash,
          phone: u.phone,
          role: u.role,
        },
      });
      userIdByEmail.set(u.email, created.id);
    }

    // 3. Create properties + their images.
    const propertyIdByIndex: string[] = [];
    for (let i = 0; i < PROPERTIES.length; i++) {
      const p = PROPERTIES[i];
      const userId = userIdByEmail.get(p.ownerEmail);
      if (!userId) throw new Error(`Seed user not found for ${p.ownerEmail}`);
      const property = await db.property.create({
        data: {
          title: p.title,
          type: p.type,
          address: p.address,
          area: p.area,
          cityZone: p.cityZone,
          price: p.price,
          rooms: p.rooms,
          size: p.size,
          amenities: JSON.stringify(p.amenities),
          description: p.description,
          status: p.status,
          userId,
          images: {
            create: p.images.map((url, idx) => ({ url, position: idx })),
          },
        },
      });
      propertyIdByIndex.push(property.id);
    }

    // 4. Favorites: 3 cross-user favorites for demo richness.
    const favoritesPlan: Array<{ user: string; propertyIdx: number }> = [
      { user: "ali@gbrent.pk", propertyIdx: 1 }, // Ali favours the Karimabad shop
      { user: "sara@gbrent.pk", propertyIdx: 0 }, // Sara saves the Airport Road shop
      { user: "khan@gbrent.pk", propertyIdx: 6 }, // Khan saves the student room
    ];
    let favoritesCount = 0;
    for (const f of favoritesPlan) {
      const userId = userIdByEmail.get(f.user)!;
      const propertyId = propertyIdByIndex[f.propertyIdx];
      await db.favorite.create({ data: { userId, propertyId } });
      favoritesCount++;
    }

    // 5. Inquiries: 3 inquiries on APPROVED listings, cross-user.
    const inquiriesPlan: Array<{
      fromUser: string;
      propertyIdx: number;
      message: string;
      phone: string;
    }> = [
      {
        fromUser: "khan@gbrent.pk",
        propertyIdx: 0,
        message: "I am interested in renting this shop for a small clothing business. When can I visit?",
        phone: "+92-301-2000003",
      },
      {
        fromUser: "ali@gbrent.pk",
        propertyIdx: 3,
        message: "Is the 3-bed house still available? I need it for my family of 5.",
        phone: "+92-301-2000001",
      },
      {
        fromUser: "sara@gbrent.pk",
        propertyIdx: 6,
        message: "Looking for two rooms for university students. Is this one still open?",
        phone: "+92-301-2000002",
      },
    ];
    let inquiriesCount = 0;
    for (let idx = 0; idx < inquiriesPlan.length; idx++) {
      const inq = inquiriesPlan[idx];
      const userId = userIdByEmail.get(inq.fromUser)!;
      const propertyId = propertyIdByIndex[inq.propertyIdx];
      // Mark the FIRST inquiry as read (so the lister has "seen" it) and
      // leave the rest unread (readAt = null) so the dashboard notification
      // dot shows up in the demo for the property owner.
      await db.inquiry.create({
        data: {
          userId,
          propertyId,
          message: inq.message,
          phone: inq.phone,
          // Only set readAt for the first inquiry; omit it otherwise so the
          // column defaults to NULL (unread) at the DB level.
          ...(idx === 0 ? { readAt: new Date() } : {}),
        },
      });
      inquiriesCount++;
    }

    console.log("Demo seed complete (4 users, 9 properties).");
  }, { timeout: 30000 });
}
try { await seedDemo(); } finally { await prisma.$disconnect(); }
