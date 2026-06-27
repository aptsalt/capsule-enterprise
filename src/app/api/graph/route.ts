// GET /api/graph — the connected knowledge graph (entities + derived 'learns' edges).
import { NextResponse } from "next/server";
import { buildGraph } from "@/lib/selectors";

export const dynamic = "force-dynamic";

export async function GET() {
  // Wrapped envelope for consistency with the sibling routes ({skills}, {capsules}, …).
  return NextResponse.json({ graph: buildGraph() });
}
