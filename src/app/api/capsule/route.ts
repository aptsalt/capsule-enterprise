import { NextRequest, NextResponse } from "next/server";
import { captureSession, listSessions } from "@/lib/capture";
import { distillChunked } from "@/lib/cerebras";
import { scoreCapsuleLLM } from "@/lib/scorer";
import { storeCapsule } from "@/lib/backboard";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/capsule
// Body (all optional): { path?: string, index?: number }
//   • path  — capture this exact ~/.claude session jsonl
//   • index — pick the Nth most-recent real session (0 = latest)
//   • neither — default to the most recent real session
// Returns { capsule, engine, ms, score, store } where `engine` reflects the LOCAL Ollama run.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    let path: string | undefined = body?.path;
    if (!path) {
      const sessions = listSessions(50);
      if (sessions.length === 0) {
        return NextResponse.json({ error: "no ~/.claude sessions found" }, { status: 404 });
      }
      const index = Number.isInteger(body?.index) ? Math.max(0, body.index) : 0;
      const pick = sessions[Math.min(index, sessions.length - 1)];
      path = pick.path;
    }
    const raw = captureSession(path);
    // Prefer the chunked map-reduce distiller: it self-routes big sessions through
    // chunking and falls through to the single-pass distiller for small ones.
    const { capsule, engine, ms } = await distillChunked(raw);
    // LLM-judge the transfer score (local Ollama); falls back to the offline heuristic.
    const score = await scoreCapsuleLLM(capsule);
    capsule.handoff_score = score;
    const store = await storeCapsule(capsule);
    return NextResponse.json({ capsule, engine, ms, score, store });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
