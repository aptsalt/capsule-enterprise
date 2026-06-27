// EVAL — the REAL eval harness for CAPSULE.
//
// Replaces the single-sample A/B and the shallow regression check with a
// multi-sample, honestly-labelled harness that runs against the LOCAL Ollama
// model (qwen2.5-coder:14b). Every number here is one of:
//
//   MEASURED   — real prompt_eval + eval token counts returned by Ollama per run.
//   DERIVED    — arithmetic over the measured runs (mean, stdev, pass rate).
//   LLM-JUDGED — a local-Ollama judge verdict (regressionCheck), explicitly flagged.
//
// There is NO statistical-significance *claim* here: we report mean ± stdev and
// whether the sign of the per-run delta is consistent across all N runs. That is
// an honest direction-consistency signal, NOT a t-test or a p-value.
import { runOllama } from "@/lib/promote";
import { data } from "@/lib/data";
import { capsulesForSkill } from "@/lib/selectors";
import { OLLAMA_MODEL } from "@/lib/cerebras";
import type { Skill } from "@/lib/types";

// ------------------------------------------------------------------
// Small numeric helpers (DERIVED stats over MEASURED runs).
// ------------------------------------------------------------------
const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

// Population standard deviation (we measured the whole sample of N runs, not a
// draw from a larger population, so the population form is the honest one).
const stdev = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

const round = (n: number): number => Math.round(n * 100) / 100;

// Representative task for a skill — same shape as the dataset's recorded
// abTrials tasks and promote.ts's repTask, so measurements are comparable.
export const repTask = (skillName: string, project: string): string =>
  `Write a short TypeScript function and explain the key correctness consideration for this task: "${skillName}" in a ${project} codebase. Keep it under 20 lines.`;

// ------------------------------------------------------------------
// runAbTrial — the multi-sample paired A/B.
//
// For each of N runs we make a paired measurement on the SAME local model:
//   WITH    = capsule/skill guidance injected ahead of the task.
//   WITHOUT = the bare task (the next agent re-derives the approach cold).
// We capture the REAL prompt_eval + eval token totals for each arm.
//
// deltaPerRun = withTokens - withoutTokens  (negative = capsule arm is cheaper,
// matching the sign convention of the dataset's tokenDeltaPerUse). The trial is
// run sequentially because there is a single local GPU.
// ------------------------------------------------------------------
export interface AbTrialOpts {
  nRuns?: number; // default 5
}

export interface AbTrialResult {
  task: string;
  model: string;
  nRuns: number; // runs that actually completed (MEASURED)
  withMean: number; // mean WITH-capsule total tokens (MEASURED → DERIVED mean)
  withoutMean: number; // mean WITHOUT-capsule total tokens
  deltaMean: number; // mean(withTokens - withoutTokens); <0 = capsule cheaper
  deltaStdev: number; // population stdev of the per-run deltas
  consistentDirection: boolean; // do ALL N per-run deltas share one sign?
  passRate: number; // fraction of runs where WITH used fewer tokens than WITHOUT
  withTokens: number[]; // raw per-run MEASURED totals (WITH arm)
  withoutTokens: number[]; // raw per-run MEASURED totals (WITHOUT arm)
  deltas: number[]; // raw per-run deltas
  note: string; // honest mean ± stdev + direction note (NOT a significance claim)
}

export async function runAbTrial(
  task: string,
  skillGuidance: string,
  opts: AbTrialOpts = {},
): Promise<AbTrialResult> {
  const nRuns = Math.max(1, opts.nRuns ?? 5);
  const withPrompt = `Guidance you must follow:\n${skillGuidance}\n\n${task}`;
  const withoutPrompt = task;

  const withTokens: number[] = [];
  const withoutTokens: number[] = [];

  for (let i = 0; i < nRuns; i++) {
    // Paired and sequential on the single local GPU: WITH then WITHOUT.
    const w = await runOllama(withPrompt);
    const wo = await runOllama(withoutPrompt);
    withTokens.push(w.totalTokens);
    withoutTokens.push(wo.totalTokens);
  }

  if (withTokens.length === 0) {
    throw new Error("runAbTrial: no runs completed (local Ollama unreachable)");
  }

  const deltas = withTokens.map((w, i) => w - withoutTokens[i]);
  const withMean = round(mean(withTokens));
  const withoutMean = round(mean(withoutTokens));
  const deltaMean = round(mean(deltas));
  const deltaStdev = round(stdev(deltas));

  // Direction consistency: every paired run moves the same way (all cheaper or
  // all costlier with the capsule). This is the ONLY "significance" signal we
  // report — honest, and explicitly not a t-test.
  const signs = deltas.map((d) => Math.sign(d));
  const consistentDirection = signs.every((s) => s === signs[0]);
  const passRate = round(deltas.filter((d) => d < 0).length / deltas.length);

  const dir =
    deltaMean < 0 ? "fewer" : deltaMean > 0 ? "more" : "equal";
  const note =
    `Over ${withTokens.length} paired runs the capsule arm used a mean of ` +
    `${withMean} tokens vs ${withoutMean} without (Δ ${deltaMean >= 0 ? "+" : ""}${deltaMean} ± ${deltaStdev}, ${dir}). ` +
    `Direction was ${consistentDirection ? "consistent across all runs" : "NOT consistent across runs"}; ` +
    `pass rate ${Math.round(passRate * 100)}%. Reported as mean ± stdev with sign-consistency — not a t-test.`;

  return {
    task,
    model: OLLAMA_MODEL,
    nRuns: withTokens.length,
    withMean,
    withoutMean,
    deltaMean,
    deltaStdev,
    consistentDirection,
    passRate,
    withTokens,
    withoutTokens,
    deltas,
    note,
  };
}

// ------------------------------------------------------------------
// regressionCheck — does the NEW guidance still honour every PRIOR learned
// pattern of the capsules that already touched this skill?
//
// For each prior capsule we RE-RUN its representative prompt through the local
// model with the NEW guidance injected, then ask a local-Ollama JUDGE whether
// the produced answer still reflects that prior capsule's learned finding.
// This is LLM-JUDGED (clearly flagged), not a measured number.
// ------------------------------------------------------------------
export interface RegressionPrior {
  capsuleId: string;
  skillId: string;
  pattern: string; // the prior learned finding we must not regress on
  pass: boolean; // LLM-JUDGED
  reason: string; // judge's one-line justification (LLM-JUDGED)
}

export interface RegressionResult {
  skillId: string;
  judge: string; // which local model judged (for honesty in labels)
  priors: RegressionPrior[];
  pass: boolean; // overall: every prior preserved (or no priors → vacuously true)
  note: string;
}

interface JudgeVerdict {
  pass: boolean;
  reason: string;
}

// Parse the judge's strict-JSON verdict, tolerant of surrounding prose.
function parseJudge(text: string): JudgeVerdict | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { pass?: unknown; reason?: unknown };
    return {
      pass: j.pass === true || j.pass === "true",
      reason: typeof j.reason === "string" ? j.reason : "(no reason given)",
    };
  } catch {
    return null;
  }
}

export async function regressionCheck(
  skillId: string,
  newGuidance: string,
): Promise<RegressionResult> {
  const skill = data.skills.find((s) => s.id === skillId);
  const skillName = skill?.name ?? skillId.replace(/^skill\//, "");

  // Prior capsules whose findings already route to / produced this skill.
  const priorCapsules = capsulesForSkill(skillId).filter((c) => c.finding.trim());

  const priors: RegressionPrior[] = [];
  for (const cap of priorCapsules) {
    const task = repTask(skillName, cap.project);
    // (1) RE-RUN the representative prompt with the NEW guidance injected.
    const gen = await runOllama(
      `Guidance you must follow:\n${newGuidance}\n\n${task}`,
    );
    // (2) JUDGE: does the answer still reflect this prior learned pattern?
    const judgePrompt =
      `You are a strict regression judge for an enterprise skill registry.\n` +
      `PRIOR LEARNED PATTERN (must still be honoured):\n"${cap.finding}"\n\n` +
      `NEW GUIDANCE under test:\n"${newGuidance}"\n\n` +
      `ANSWER PRODUCED under the new guidance:\n"""${gen.content.slice(0, 1500)}"""\n\n` +
      `Does the new guidance + answer still reflect / preserve the PRIOR learned pattern ` +
      `(i.e. it has not been forgotten or contradicted)? ` +
      `Reply with STRICT JSON only: {"pass": boolean, "reason": "one short sentence"}.`;
    const verdict = await runOllama(judgePrompt);
    const parsed = parseJudge(verdict.content);
    priors.push({
      capsuleId: cap.id,
      skillId,
      pattern: cap.finding,
      pass: parsed?.pass ?? false,
      reason: parsed
        ? parsed.reason
        : "judge output unparseable — treated as FAIL (conservative)",
    });
  }

  const pass = priors.every((p) => p.pass);
  const note =
    priors.length === 0
      ? `No prior capsules touched ${skillId}; regression set is empty (vacuously pass).`
      : `${priors.filter((p) => p.pass).length}/${priors.length} prior learned patterns preserved under the new guidance (LLM-judged by ${OLLAMA_MODEL}).`;

  return { skillId, judge: OLLAMA_MODEL, priors, pass, note };
}

// ------------------------------------------------------------------
// agenticCI — the REAL CI gate. Combines a multi-sample A/B (improvement
// signal) with the regression check (no prior pattern forgotten). promote.ts
// can call this before staging a proposed version.
//
//   improved        = capsule arm is cheaper on average AND the direction is
//                     consistent (or wins a majority of paired runs).
//   regressionsPass = every prior learned pattern survives (LLM-judged).
//   verdict         = PASS only when BOTH hold.
// ------------------------------------------------------------------
export interface AgenticCiResult {
  skillId: string;
  proposedVersion: string;
  guidance: string; // the new guidance under test (the capsule finding)
  ab: AbTrialResult;
  regression: RegressionResult;
  improved: boolean; // DERIVED from the measured A/B
  regressionsPass: boolean; // LLM-judged
  verdict: "PASS" | "HELD";
  summary: string;
}

function resolveGuidance(skill: Skill, proposedVersion: string): string {
  const ver = skill.versions.find((v) => v.version === proposedVersion);
  // Prefer the proposed version's learned finding; fall back to the skill's
  // current published description so the gate can still run.
  return ver?.learnedFrom?.finding ?? skill.description;
}

export async function agenticCI(
  skillId: string,
  proposedVersion: string,
  opts: AbTrialOpts = {},
  guidanceOverride?: string,
): Promise<AgenticCiResult> {
  const skill = data.skills.find((s) => s.id === skillId);
  if (!skill) throw new Error(`agenticCI: skill not found: ${skillId}`);

  // The new guidance under test. promote.ts passes the live capsule's finding
  // (a not-yet-published version that resolveGuidance can't see); other callers
  // let it resolve from the proposed skill version.
  const guidance = guidanceOverride?.trim()
    ? guidanceOverride.trim()
    : resolveGuidance(skill, proposedVersion);
  // Use the most recent capsule's project for the representative task so the
  // A/B task context matches what this skill actually sees.
  const priors = capsulesForSkill(skillId);
  const project = priors[priors.length - 1]?.project ?? "Workspace";
  const task = repTask(skill.name, project);

  const ab = await runAbTrial(task, guidance, opts);
  const regression = await regressionCheck(skillId, guidance);

  // Improvement: cheaper on average, and the win is directionally credible.
  const improved =
    ab.deltaMean < 0 && (ab.consistentDirection || ab.passRate > 0.5);
  const regressionsPass = regression.pass;
  const verdict: "PASS" | "HELD" =
    improved && regressionsPass ? "PASS" : "HELD";

  const summary =
    `${skillId}@${proposedVersion}: A/B ${improved ? "improved" : "no improvement"} ` +
    `(Δ ${ab.deltaMean >= 0 ? "+" : ""}${ab.deltaMean} ± ${ab.deltaStdev} tok over ${ab.nRuns} runs, ` +
    `pass ${Math.round(ab.passRate * 100)}%); regressions ${regressionsPass ? "PASS" : "FAIL"} ` +
    `(${regression.priors.filter((p) => p.pass).length}/${regression.priors.length} priors preserved). Verdict: ${verdict}.`;

  return {
    skillId,
    proposedVersion,
    guidance,
    ab,
    regression,
    improved,
    regressionsPass,
    verdict,
    summary,
  };
}
