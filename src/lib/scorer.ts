// SCORE — handoff transfer quality across 6 cognitive dimensions.
// A handoff isn't notes; it's whether understanding transfers. Ported from NavikLab's scorer idea.
import { DIMENSIONS, type Dimension, type HandoffCapsule, type HandoffScore } from "./capsule";

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
