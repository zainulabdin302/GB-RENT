import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { uploadDirectory, uploadNamePattern } from "@/lib/uploads";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_req: Request, ctx: { params: Promise<{ filename: string }> }) {
  const { filename } = await ctx.params;
  if (!uploadNamePattern.test(filename)) return new NextResponse(null, { status: 404 });
  try {
    const bytes = await readFile(path.join(uploadDirectory(), filename));
    const type = bytes[0] === 137 ? "image/png" : bytes[0] === 255 ? "image/jpeg" : bytes.toString("ascii", 0, 3) === "GIF" ? "image/gif" : "image/webp";
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return new NextResponse(null, { status: 404 });
    console.error("Photo read failed", e);
    return new NextResponse(null, { status: 500 });
  }
}
