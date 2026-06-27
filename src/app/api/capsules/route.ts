// GET /api/capsules — the enterprise's captured session capsules (Backboard memory).
import { NextResponse } from "next/server";
import { data } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ capsules: data.capsules });
}
