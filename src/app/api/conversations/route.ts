import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, NotFoundError, ValidationError } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/session";

export async function GET() {
  try {
    const { user } = await requireAuth();
    const rows = await db.conversation.findMany({
      where: { OR: [{ renterId: user.id }, { ownerId: user.id }] },
      orderBy: { updatedAt: "desc" },
      include: {
        property: { select: { id: true, title: true, price: true, cityZone: true, area: true, status: true, images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } } },
        renter: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, content: true, senderId: true, createdAt: true } },
      },
    });
    const ids = rows.map((row) => row.id);
    const unread = ids.length ? await db.message.groupBy({
      by: ["conversationId"],
      where: { conversationId: { in: ids }, senderId: { not: user.id }, readAt: null },
      _count: { _all: true },
    }) : [];
    const counts = new Map(unread.map((row) => [row.conversationId, row._count._all]));
    return NextResponse.json(rows.map((row) => ({
      id: row.id, updatedAt: row.updatedAt, property: row.property,
      otherUser: user.id === row.renterId ? row.owner : row.renter,
      lastMessage: row.messages[0] ?? null, unreadCount: counts.get(row.id) ?? 0,
    })));
  } catch (error) { return jsonError(error); }
}

export async function POST(req: Request) {
  try {
    const { user } = await requireAuth();
    let body: unknown;
    try { body = await req.json(); } catch { throw new ValidationError("Invalid JSON body"); }
    const propertyId = body && typeof body === "object" ? (body as Record<string, unknown>).propertyId : undefined;
    if (typeof propertyId !== "string" || !propertyId.trim() || propertyId.length > 128) throw new ValidationError("A valid propertyId is required");
    const property = await db.property.findUnique({ where: { id: propertyId.trim() }, select: { id: true, userId: true, status: true } });
    if (!property || property.status !== "APPROVED") throw new NotFoundError("Property not found or not available");
    if (property.userId === user.id) throw new ValidationError("You cannot start a conversation with yourself");
    const conversation = await db.conversation.upsert({
      where: { propertyId_renterId: { propertyId: property.id, renterId: user.id } },
      create: { propertyId: property.id, renterId: user.id, ownerId: property.userId },
      update: {},
      select: { id: true },
    });
    return NextResponse.json(conversation);
  } catch (error) { return jsonError(error); }
}
