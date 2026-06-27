// RELAY — the Handoff Capsule: the portable, structured record of an AI coding session.
// This is the unit of context that survives the session boundary.

export type Decision = { what: string; why: string; file?: string };
export type Rejected = { approach: string; why_rejected: string };

export const DIMENSIONS = [
  "intent_clarity",
  "decision_traceability",
  "reasoning_explicitness",
  "gotcha_coverage",
  "next_step_actionability",
  "mental_model_transfer",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABEL: Record<Dimension, string> = {
  intent_clarity: "Intent Clarity",
  decision_traceability: "Decision Traceability",
  reasoning_explicitness: "Reasoning Explicitness",
  gotcha_coverage: "Gotcha Coverage",
  next_step_actionability: "Next-Step Actionability",
  mental_model_transfer: "Mental-Model Transfer",
};

export type HandoffScore = {
  overall: number; // 0-100
  dimensions: Record<Dimension, number>; // each 0-100
  verdict: string;
  coaching: string[]; // how the author could improve the handoff
};

export type HandoffCapsule = {
  project: string;
  session_id: string;
  generated_at: string;
  source: "claude-jsonl" | "bridge" | "manual";
  intent: string;
  decisions: Decision[];
  tried_and_rejected: Rejected[];
  current_state: string;
  next_steps: string[];
  gotchas: string[];
  mental_model: Record<string, string>;
  open_questions: string[];
  files_touched: string[];
  stats: { messages: number; tools: number; durationMin: number };
  handoff_score?: HandoffScore;
};

// A compact, agent-ready briefing rendered from the capsule — what we inject into the next agent.
export function capsuleToBriefing(c: HandoffCapsule): string {
  const L: string[] = [];
  L.push(`# Handoff briefing — project "${c.project}"`);
  L.push(`Intent: ${c.intent}`);
  if (c.current_state) L.push(`\nWhere it stands: ${c.current_state}`);
  if (c.decisions.length) {
    L.push(`\nDecisions already made (do NOT re-litigate):`);
    c.decisions.forEach((d) => L.push(`- ${d.what} — because ${d.why}${d.file ? ` (${d.file})` : ""}`));
  }
  if (c.tried_and_rejected.length) {
    L.push(`\nAlready tried and rejected (do NOT repeat):`);
    c.tried_and_rejected.forEach((r) => L.push(`- ${r.approach} — rejected: ${r.why_rejected}`));
  }
  if (c.gotchas.length) {
    L.push(`\nGotchas to avoid:`);
    c.gotchas.forEach((g) => L.push(`- ${g}`));
  }
  if (Object.keys(c.mental_model).length) {
    L.push(`\nMental model:`);
    Object.entries(c.mental_model).forEach(([k, v]) => L.push(`- ${k}: ${v}`));
  }
  if (c.next_steps.length) {
    L.push(`\nNext steps:`);
    c.next_steps.forEach((s) => L.push(`- ${s}`));
  }
  if (c.open_questions.length) {
    L.push(`\nOpen questions:`);
    c.open_questions.forEach((q) => L.push(`- ${q}`));
  }
  if (c.files_touched.length) L.push(`\nFiles touched: ${c.files_touched.join(", ")}`);
  return L.join("\n");
}
