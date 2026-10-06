/**
 * GET  /api/inquiries  — auth: inquiries RECEIVED by the current user
 *                         (inquiries on properties the user owns), newest first,
 *                         with property + sender info. Used in the dashboard
 *                         "inquiries received" view.
 * POST /api/inquiries  — auth: { propertyId, message, phone } → InquiryDTO
 *                         Validates property exists & is APPROVED.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/api-helpers";
import {
  jsonError,
  ValidationError,
  NotFoundError,
  isNonEmptyString,
} from "@/lib/api-helpers";
import { requireAuth } from "@/lib/session";
import type { InquiryDTO } from "@/types";

export async function GET() {
  try {
    const ctx = await requireAuth();

    // Inquiries on properties owned by the current user.
    const inquiries = await db.inquiry.findMany({
      where: { property: { userId: ctx.user.id } },
      orderBy: { createdAt: "desc" },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            cityZone: true,
            area: true,
            price: true,
            type: true,
          },
        },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const items: InquiryDTO[] = inquiries.map((i) => ({
      id: i.id,
      message: i.message,
      phone: i.phone,
      createdAt: i.createdAt.toISOString(),
      readAt: i.readAt ? i.readAt.toISOString() : null,
      property: {
        id: i.property.id,
        title: i.property.title,
        cityZone: i.property.cityZone as InquiryDTO["property"]["cityZone"],
        area: i.property.area,
        price: i.property.price,
        type: i.property.type as InquiryDTO["property"]["type"],
      },
      user: { id: i.user.id, name: i.user.name, email: i.user.email },
    }));

    return NextResponse.json(items);
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireAuth();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new ValidationError("Invalid JSON body");
    }
    const { propertyId, message, phone } = body as Record<string, unknown>;

    if (!isNonEmptyString(propertyId))
      throw new ValidationError("propertyId is required");
    if (!isNonEmptyString(message))
      throw new ValidationError("message is required");
    if (!isNonEmptyString(phone))
      throw new ValidationError("phone is required");

    const property = await db.property.findUnique({
      where: { id: propertyId },
      select: { id: true, status: true, userId: true },
    });
    if (!property) throw new NotFoundError("Property not found");
    if (property.status !== "APPROVED") {
      return NextResponse.json(
        { error: "Property is not available for inquiries" },
        { status: 400 }
      );
    }

    const inquiry = await db.inquiry.create({
      data: {
        propertyId,
        userId: ctx.user.id,
        message: (message as string).trim(),
        phone: (phone as string).trim(),
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            cityZone: true,
            area: true,
            price: true,
            type: true,
          },
        },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const dto: InquiryDTO = {
      id: inquiry.id,
      message: inquiry.message,
      phone: inquiry.phone,
      createdAt: inquiry.createdAt.toISOString(),
      readAt: inquiry.readAt ? inquiry.readAt.toISOString() : null,
      property: {
        id: inquiry.property.id,
        title: inquiry.property.title,
        cityZone: inquiry.property.cityZone as InquiryDTO["property"]["cityZone"],
        area: inquiry.property.area,
        price: inquiry.property.price,
        type: inquiry.property.type as InquiryDTO["property"]["type"],
      },
      user: {
        id: inquiry.user.id,
        name: inquiry.user.name,
        email: inquiry.user.email,
      },
    };
    return NextResponse.json(dto, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
