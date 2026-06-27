// SCORE — handoff transfer quality across 6 cognitive dimensions.
// A handoff isn't notes; it's whether understanding transfers. Ported from NavikLab's scorer idea.
// Two engines: (1) scoreCapsule() — a fast, fully-offline HEURISTIC; (2) scoreCapsuleLLM() —
// an LLM-JUDGE (local Ollama). The LLM path is a model RATING a capsule, NOT a trained reward
// model; labels below say "llm-judged" so the provenance stays honest.
import { DIMENSIONS, DIMENSION_LABEL, type Dimension, type HandoffCapsule, type HandoffScore } from "./capsule";
import { OLLAMA_MODEL } from "./cerebras";
import { capsuleToBriefing } from "./capsule";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function richness(s: string, ideal = 120): number {
  if (!s) return 0;
  const len = Math.min(s.length, ideal) / ideal;            // length up to ideal
  const specific = /[A-Za-z]+\.(ts|tsx|js|py|css|json|md)|:\d+|\b\d+\b|`[^`]+`|because|so that|instead/i.test(s) ? 1 : 0.55;
  return clamp(len * 70 + specific * 30);
}

export function scoreCapsule(c: HandoffCapsule): HandoffScore {
  const dims = {} as Record<Dimension, number>;

  dims.intent_clarity = richness(c.intent, 140);

  dims.decision_traceability = c.decisions.length === 0 ? 25
    : clamp(40 + Math.min(c.decisions.length, 4) * 10
        + (c.decisions.filter((d) => d.file).length / Math.max(c.decisions.length, 1)) * 20);

  dims.reasoning_explicitness = c.decisions.length === 0 ? 30
    : clamp(c.decisions.reduce((a, d) => a + (d.why && d.why.length > 12 && !/inferred/.test(d.why) ? 25 : 6), 0)
        + c.tried_and_rejected.length * 8);

  dims.gotcha_coverage = clamp(c.gotchas.length * 26 + (c.tried_and_rejected.length ? 18 : 0));

  dims.next_step_actionability = c.next_steps.length === 0 ? 20
    : clamp(c.next_steps.reduce((a, s) => a + richness(s, 80) * 0.3, 0) + Math.min(c.next_steps.length, 4) * 10);

  dims.mental_model_transfer = clamp(Object.keys(c.mental_model).length * 28 + (c.open_questions.length ? 14 : 0));

  const overall = clamp(DIMENSIONS.reduce((a, d) => a + dims[d], 0) / DIMENSIONS.length);

  const weakest = [...DIMENSIONS].sort((a, b) => dims[a] - dims[b]).slice(0, 2);
  const tip: Record<Dimension, string> = {
    intent_clarity: "State the goal in one concrete sentence — what shipped and why it mattered.",
    decision_traceability: "Attach a file:line to each decision so the next dev can find it.",
    reasoning_explicitness: "Write the WHY behind each choice, not just the what — that's the tribal knowledge.",
    gotcha_coverage: "List the footguns you hit (env quirks, flaky steps) so they aren't re-hit.",
    next_step_actionability: "Make next steps verbs with targets — 'wire X to Y', not 'continue'.",
    mental_model_transfer: "Define the 2–3 terms a newcomer wouldn't know; leave open questions explicit.",
  };
  const verdict = overall >= 80 ? "Senior-grade handoff — an agent could continue cold."
    : overall >= 60 ? "Solid handoff — a few gaps before it's drop-in."
    : overall >= 40 ? "Partial — the next dev will still re-discover things."
    : "Thin — most context would be lost.";

  return { overall, dimensions: dims, verdict, coaching: weakest.map((d) => tip[d]) };
}

// ---------------------------------------------------------------------------
// LLM-JUDGE scoring (local Ollama). This is a model JUDGING a capsule on the
// same 6 transfer dimensions — it is NOT a trained scorer. The heuristic
// scoreCapsule() above remains the fast, offline fallback.
// ---------------------------------------------------------------------------

// Low-level local-Ollama JSON call. Returns parsed JSON or null on any failure
// (offline, model missing, bad JSON) so callers can fall back to the heuristic.
async function ollamaJson<T>(system: string, user: string): Promise<T | null> {
  const base = process.env.OLLAMA_URL || "http://localhost:11434";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL, stream: false, format: "json",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        options: { temperature: 0.1, num_ctx: 8_192 },
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const text: string = j.message?.content || "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]) as T; } catch { return null; }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const JUDGE_SYS = `You are CAPSULE-JUDGE, a strict evaluator of AI coding-session HANDOFFS.
You are given a rendered handoff briefing. Rate how well it transfers UNDERSTANDING to the next
developer/agent on each of these 6 dimensions, 0-100 (be strict; reserve >85 for genuinely
senior-grade handoffs):
- intent_clarity: is the goal stated concretely in one sentence?
- decision_traceability: are choices recorded with where to find them (file/line)?
- reasoning_explicitness: is the WHY behind each choice captured, not just the what?
- gotcha_coverage: are footguns / env quirks / dead-ends recorded?
- next_step_actionability: are next steps concrete verbs with targets?
- mental_model_transfer: are the key terms / mental model a newcomer needs explained?
Return STRICT JSON only:
{
 "intent_clarity": number,
 "decision_traceability": number,
 "reasoning_explicitness": number,
 "gotcha_coverage": number,
 "next_step_actionability": number,
 "mental_model_transfer": number,
 "justification": string,
 "coaching": string[]
}
No prose outside JSON.`;

type JudgeRaw = Partial<Record<Dimension, number>> & { justification?: string; coaching?: string[] };

// LLM-JUDGE the capsule across the 6 transfer dimensions. Falls back to the
// heuristic scoreCapsule() when the local model is unavailable or returns junk.
export async function scoreCapsuleLLM(capsule: HandoffCapsule): Promise<HandoffScore> {
  const raw = await ollamaJson<JudgeRaw>(JUDGE_SYS, capsuleToBriefing(capsule));
  const heur = scoreCapsule(capsule);
  // Validate the judge actually returned the 6 dimension KEYS with sane numbers. A
  // non-compliant model (wrong keys like "intent_100", all-zero, or out-of-range) must
  // fall back to the heuristic instead of silently scoring 0 on every dimension.
  const validCount = raw
    ? DIMENSIONS.filter((d) => {
        const v = Number(raw[d]);
        return Number.isFinite(v) && v > 0 && v <= 100;
      }).length
    : 0;
  if (validCount < 4) return heur; // offline / model-missing / non-compliant -> heuristic

  const dims = {} as Record<Dimension, number>;
  for (const d of DIMENSIONS) {
    const v = Number(raw![d]);
    dims[d] = Number.isFinite(v) && v > 0 && v <= 100 ? clamp(v) : heur.dimensions[d]; // backfill a missing dim from heuristic
  }
  const overall = clamp(DIMENSIONS.reduce((a, d) => a + dims[d], 0) / DIMENSIONS.length);

  const weakest = [...DIMENSIONS].sort((a, b) => dims[a] - dims[b]).slice(0, 2);
  const coaching = Array.isArray(raw!.coaching) && raw!.coaching.length
    ? raw!.coaching.filter((c) => typeof c === "string" && c.trim()).slice(0, 3)
    : weakest.map((d) => `Improve ${DIMENSION_LABEL[d]}.`);

  const just = (raw!.justification || "").trim();
  const verdict = `LLM-judged (${OLLAMA_MODEL}): ${just || "rated across the 6 transfer dimensions."}`;

  return { overall, dimensions: dims, verdict, coaching };
}

const NOVELTY_SYS = `You are CAPSULE-NOVELTY. Given a handoff briefing, rate how NOVEL and NON-OBVIOUS
the core finding is, 0-100. 0 = trivial / common-knowledge / boilerplate any developer already knows;
100 = a genuinely surprising, hard-won insight that would NOT be re-derived without this session.
Return STRICT JSON only: {"novelty": number, "why": string}. No prose outside JSON.`;

type NoveltyRaw = { novelty?: number; why?: string };

// Cheap offline novelty estimate — used as the noveltyLLM() fallback. Rewards
// specific gotchas, reasoned/rejected approaches, and a defined mental model.
function noveltyHeuristic(c: HandoffCapsule): number {
  const reasoned = c.decisions.filter((d) => d.why && d.why.length > 12 && !/inferred/.test(d.why)).length;
  return clamp(
    c.gotchas.length * 14 +
    c.tried_and_rejected.length * 12 +
    reasoned * 8 +
    Object.keys(c.mental_model).length * 8,
  );
}

// LLM-JUDGE how novel / non-obvious the capsule's finding is (0-100). Falls back
// to a heuristic estimate when the local model is unavailable.
export async function noveltyLLM(capsule: HandoffCapsule): Promise<number> {
  const raw = await ollamaJson<NoveltyRaw>(NOVELTY_SYS, capsuleToBriefing(capsule));
  // Fall back when the model is offline, returns the wrong key (-> undefined), NaN, or a
  // degenerate <=0 (non-compliant) value, instead of reporting a false 0.
  if (!raw || typeof raw.novelty !== "number" || !Number.isFinite(raw.novelty) || raw.novelty <= 0)
    return noveltyHeuristic(capsule);
  return clamp(raw.novelty);
}
