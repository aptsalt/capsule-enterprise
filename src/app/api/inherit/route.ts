// THE MONEY DEMO — REAL cold-vs-warm handoff on the LOCAL model (qwen2.5-coder:14b, on-device).
// Pick a capsule, derive a concrete project question from its intent, then run the SAME question
// twice through Ollama:
//   COLD  — only the question, zero prior context (a fresh agent re-discovering the project).
//   WARM  — the distilled capsule briefing injected as context + the same question (an agent that
//           inherited the handoff).
// We also hit Backboard's live retrieval (retrieveMemory) so the warm start surfaces the tenant
// memories that follow the entity. Generations are capped (small num_predict) so this returns in a
// reasonable time, and the engine label is honest about what actually ran.
import { NextRequest, NextResponse } from "next/server";
import { data } from "@/lib/data";
import { retrieveMemory } from "@/lib/backboard";
import { OLLAMA_MODEL } from "@/lib/cerebras";
import type { Capsule } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const OLLAMA_BASE = process.env.OLLAMA_URL || "http://localhost:11434";
// Keep each generation small so cold+warm both return quickly on a 16GB laptop.
const MAX_TOKENS = 256;
const GEN_TIMEOUT_MS = 60_000;

type Msg = { role: "system" | "user"; content: string };

// One capped, on-device Ollama generation. Returns ok:false (never throws) so a degraded
// engine is reported honestly rather than 500-ing the demo.
async function generate(messages: Msg[]): Promise<{ text: string; ok: boolean }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEN_TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages,
        options: { temperature: 0.3, num_predict: MAX_TOKENS },
      }),
    });
    if (!res.ok) return { text: "", ok: false };
    const j = await res.json();
    return { text: (j.message?.content || "").trim(), ok: true };
  } catch {
    return { text: "", ok: false };
  } finally {
    clearTimeout(timer);
  }
}

// Strip Claude Code wrapper noise (caveat blocks, command tags) and clamp length so the derived
// question stays a clean, concrete sentence even when the source intent is messy.
function cleanIntent(intent: string): string {
  const s = (intent || "")
    .replace(/<local-command-caveat>[\s\S]*?(?=$|\n)/gi, "")
    .replace(/<\/?[a-z-]+>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > 200 ? `${s.slice(0, 200)}…` : s;
}

// Derive ONE concrete project question from the capsule's intent — the thing a developer newly
// assigned to this project would actually ask on day one.
function deriveQuestion(c: Capsule): string {
  const goal = cleanIntent(c.intent) || `continue the "${c.project}" work`;
  return (
    `I'm taking over the "${c.project}" project. The goal was: ${goal} ` +
    `What is the current state, what decisions were already made, and what are the exact next ` +
    `steps I should take — and what should I NOT redo?`
  );
}

// Render the data-layer capsule into a compact, distilled briefing to inject as warm context.
function capsuleBriefing(c: Capsule): string {
  const L: string[] = [];
  L.push(`# Handoff capsule — project "${c.project}" (session ${c.session})`);
  if (c.intent) L.push(`Intent: ${cleanIntent(c.intent)}`);
  if (c.summary) L.push(`Current state: ${c.summary}`);
  if (c.finding) L.push(`Key finding: ${c.finding}`);
  if (c.mentalModel && c.mentalModel !== c.summary) L.push(`Mental model: ${c.mentalModel}`);
  if (c.decisions?.length) {
    L.push(`Decisions already made (do NOT re-litigate):`);
    c.decisions.forEach((d) => {
      const why = d.why && d.why !== "(inferred from session)" ? ` — ${d.why}` : "";
      L.push(`- ${d.what}${why}`);
    });
  }
  if (c.gotchas?.length) {
    L.push(`Gotchas to avoid:`);
    c.gotchas.forEach((g) => L.push(`- ${g}`));
  }
  if (c.learnings?.length) {
    L.push(`Learnings carried forward:`);
    c.learnings.forEach((l) => L.push(`- ${l}`));
  }
  return L.join("\n");
}

// Resolve which capsule to inherit: explicit capsuleId wins; else latest capsule for the project;
// else the most recent capsule overall so the demo always has something to run.
function pickCapsule(capsuleId?: string, project?: string): Capsule | null {
  const all = data.capsules;
  if (capsuleId) {
    const byId = all.find((c) => c.id === capsuleId);
    if (byId) return byId;
  }
  const pool = project
    ? all.filter((c) => c.project.toLowerCase() === project.toLowerCase())
    : all;
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export async function POST(req: NextRequest) {
  let body: { capsuleId?: string; project?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const capsule = pickCapsule(body.capsuleId, body.project);
  if (!capsule) {
    return NextResponse.json({ error: "no capsule found for capsuleId/project" }, { status: 404 });
  }

  const t0 = Date.now();
  const question = deriveQuestion(capsule);
  const briefing = capsuleBriefing(capsule);

  const coldSys =
    "You are a developer agent newly assigned to a project. You have NO prior context on it. " +
    "Answer concisely.";
  const warmSys =
    "You are a developer agent inheriting a CAPSULE handoff capsule from the previous session. " +
    "Use the briefing as ground truth; do not re-decide settled decisions or repeat rejected work. " +
    "Answer concisely.";

  // COLD and WARM run the SAME question on the SAME local model — the only difference is the
  // injected capsule context. Run them in parallel with the live Backboard retrieval.
  const [cold, warm, retrieved] = await Promise.all([
    generate([
      { role: "system", content: coldSys },
      { role: "user", content: `${question}\n\n(You have no prior context on this project.)` },
    ]),
    generate([
      { role: "system", content: warmSys },
      { role: "user", content: `CAPSULE HANDOFF BRIEFING:\n${briefing}\n\n---\n${question}` },
    ]),
    retrieveMemory(question),
  ]);

  const ms = Date.now() - t0;
  const live = cold.ok || warm.ok;
  const engine = live
    ? `ollama:${OLLAMA_MODEL} (local, on-device)`
    : "unavailable (start Ollama to run the local demo)";

  return NextResponse.json({
    question,
    cold: cold.ok ? cold.text : "(local model unavailable — start Ollama)",
    warm: warm.ok ? warm.text : "(local model unavailable — start Ollama)",
    retrieved: retrieved.memories,
    engine,
    ms,
    capsuleId: capsule.id,
    project: capsule.project,
    retrievedFromBackboard: retrieved.ok,
  });
}
