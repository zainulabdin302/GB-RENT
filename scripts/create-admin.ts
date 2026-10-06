import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const db = new PrismaClient();
try {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12 || Buffer.byteLength(password) > 72) {
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (12 characters minimum, 72 bytes maximum).");
  }
  if (await db.user.findUnique({ where: { email } })) throw new Error("Account already exists; no changes made.");
  await db.user.create({ data: { email, name: process.env.ADMIN_NAME || "GB Rent Admin", passwordHash: await bcrypt.hash(password, 12), role: "ADMIN" } });
  console.log("Administrator created.");
} finally { await db.$disconnect(); }
