import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, NotFoundError, ValidationError } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/session";

type RouteContext = { params: Promise<{ id: string }> };

async function getParticipantConversation(id: string, userId: string) {
  const conversation = await db.conversation.findFirst({
    where: { id, OR: [{ renterId: userId }, { ownerId: userId }] },
    include: {
      property: { select: { id: true, title: true, price: true, cityZone: true, area: true, status: true, images: { orderBy: { position: "asc" }, take: 1, select: { url: true } } } },
      renter: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
    },
  });
  if (!conversation) throw new NotFoundError("Conversation not found");
  return conversation;
}

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    const { user } = await requireAuth();
    const { id } = await ctx.params;
    const conversation = await getParticipantConversation(id, user.id);
    await db.message.updateMany({
      where: { conversationId: id, senderId: { not: user.id }, readAt: null },
      data: { readAt: new Date() },
    });
    const messages = await db.message.findMany({
      where: { conversationId: id }, orderBy: { createdAt: "desc" }, take: 100,
      include: { sender: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ conversation, messages: messages.reverse() });
  } catch (error) { return jsonError(error); }
}

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const { user } = await requireAuth();
    const { id } = await ctx.params;
    const conversation = await getParticipantConversation(id, user.id);
    let body: unknown;
    try { body = await req.json(); } catch { throw new ValidationError("Invalid JSON body"); }
    const content = body && typeof body === "object" ? (body as Record<string, unknown>).content : undefined;
    if (typeof content !== "string" || !content.trim()) throw new ValidationError("Message cannot be empty");
    if (content.trim().length > 2000) throw new ValidationError("Messages must be 2,000 characters or fewer");
    const message = await db.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: { conversationId: id, senderId: user.id, content: content.trim() },
        include: { sender: { select: { id: true, name: true } } },
      });
      await tx.conversation.update({ where: { id }, data: { updatedAt: new Date() } });
      return created;
    });
    return NextResponse.json({ message, propertyId: conversation.propertyId }, { status: 201 });
  } catch (error) { return jsonError(error); }
}
