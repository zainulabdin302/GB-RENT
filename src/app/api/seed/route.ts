// Database initialization is local-only: bun run db:seed.
import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
