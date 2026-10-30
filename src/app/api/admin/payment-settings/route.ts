import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import { jsonError, ValidationError } from "@/lib/api-helpers";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  try {
    await requireAdmin();
    const settings = await db.platformSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
    });
    return NextResponse.json(settings);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw new ValidationError("Invalid settings payload");
    const value = body as Record<string, unknown>;
    const fee = Number(value.listingFee);
    if (!Number.isSafeInteger(fee) || fee < 0 || fee > 10000000) {
      throw new ValidationError("Listing fee must be a whole PKR amount between 0 and 10,000,000");
    }
    const jazzCashAccount = typeof value.jazzCashAccount === "string" ? value.jazzCashAccount.trim() : "";
    const easypaisaAccount = typeof value.easypaisaAccount === "string" ? value.easypaisaAccount.trim() : "";
    if (jazzCashAccount.length > 40 || easypaisaAccount.length > 40) {
      throw new ValidationError("Wallet account details are too long");
    }
    const settings = await db.platformSettings.upsert({
      where: { id: "default" },
      create: { id: "default", listingFee: fee, jazzCashAccount, easypaisaAccount },
      update: { listingFee: fee, jazzCashAccount, easypaisaAccount },
    });
    return NextResponse.json(settings);
  } catch (error) {
    return jsonError(error);
  }
}
