// /api/promote — LIVE, on-demand promotion of a capsule into a PROPOSED skill version.
// POST { capsuleId } -> runs real local-Ollama agentic CI, writes staged artifacts +
// merge-ledger into the enterprise-skills repo, and makes a REAL git commit + push.
// Honest: this triggers a real VCS write; it stages a proposal, it does not auto-publish.
import { NextRequest, NextResponse } from "next/server";
import { promoteCapsule } from "@/lib/promote";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { capsuleId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const { capsuleId } = body;
  if (!capsuleId) {
    return NextResponse.json({ ok: false, error: "capsuleId is required" }, { status: 400 });
  }

  try {
    const result = await promoteCapsule(capsuleId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "promotion failed";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
