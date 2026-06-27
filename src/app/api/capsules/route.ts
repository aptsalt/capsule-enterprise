// GET /api/capsules — the durable capsules captured on THIS machine, read back from the
// local store (~/.relay/capsules/*.json) that storeCapsule() always writes. This is what
// lets "Capsules from today" survive a reload: the sidebar hydrates from here on mount.
// (The bundled demo dataset, data.capsules, is rendered separately by the sidebar.)
import { NextResponse } from "next/server";
import { listLocalCapsules } from "@/lib/backboard";
import { OLLAMA_MODEL } from "@/lib/cerebras";
import type { HandoffCapsule } from "@/lib/capsule";

export const dynamic = "force-dynamic";

// Map an on-disk HandoffCapsule to the client overlay shape (store.CapturedCapsule).
// engine/model/ms aren't persisted on disk, so we label with the configured local
// distiller — an honest default for a capsule that was distilled on-device.
const clean = (s: string) => (s || "").replace(/<\/?[a-z-]+>/gi, "").replace(/\s+/g, " ").trim();

// Headline for capsules captured before the distiller emitted a `title`: take the
// first ~8 words of the intent, drop trailing punctuation, capitalize.
function headline(intent: string): string {
  const s = clean(intent);
  if (!s) return "";
  const w = s.split(" ").slice(0, 8).join(" ").replace(/[.,;:]+$/, "");
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function toOverlay(c: HandoffCapsule) {
  const overall = c.handoff_score?.overall ?? 0;
  const idTail = (c.session_id || "").slice(0, 6);
  const intent = clean(c.intent);
  return {
    id: `CAP-LOCAL-${idTail}`,
    sessionId: c.session_id,
    project: c.project,
    model: OLLAMA_MODEL,
    engine: `ollama:${OLLAMA_MODEL} (local)`,
    local: true,
    createdAt: c.generated_at,
    finding: clean(c.title) || headline(intent) || `Captured session ${idTail}`,
    summary: clean(c.current_state) || intent,
    transferScore: overall,
    intent,
    decisions: c.decisions ?? [],
    gotchas: c.gotchas ?? [],
    nextSteps: c.next_steps ?? [],
    dimensions: c.handoff_score?.dimensions ?? {},
    verdict: c.handoff_score?.verdict ?? "",
    storedIn: "local" as const,
    ms: 0,
    stats: c.stats ?? { messages: 0, tools: 0, durationMin: 0 },
  };
}

export function GET() {
  const capsules = listLocalCapsules()
    .map(toOverlay)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first
  return NextResponse.json({ capsules });
}
