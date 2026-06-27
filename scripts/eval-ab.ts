// eval-ab.ts — CLI for the REAL multi-sample A/B eval harness.
//
// Runs the paired WITH-capsule vs WITHOUT-capsule A/B for a skill on the LOCAL
// Ollama model N times and prints the measured stats (mean ± stdev, direction
// consistency, pass rate). Optionally runs the full agentic-CI gate (A/B +
// regression check) with --ci.
//
// Usage:
//   npx tsx scripts/eval-ab.ts [skillId] [--n=5] [--ci]
//   npx tsx scripts/eval-ab.ts skill/api-rate-limiting --n=3
//   npx tsx scripts/eval-ab.ts skill/command-verification --n=3 --ci
//
// With no skillId it picks the first skill in the dataset.
import { data } from "../src/lib/data";
import { capsulesForSkill } from "../src/lib/selectors";
import { runAbTrial, agenticCI, repTask, type AbTrialResult } from "../src/lib/eval";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=")[1];
}
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

function printAb(ab: AbTrialResult): void {
  console.log(`\n  task:    ${ab.task}`);
  console.log(`  model:   ${ab.model}  (Ollama, local)`);
  console.log(`  runs:    ${ab.nRuns}`);
  console.log(`  WITH     tokens/run: [${ab.withTokens.join(", ")}]  mean ${ab.withMean}`);
  console.log(`  WITHOUT  tokens/run: [${ab.withoutTokens.join(", ")}]  mean ${ab.withoutMean}`);
  console.log(`  delta/run (with-without): [${ab.deltas.join(", ")}]`);
  console.log(`  deltaMean: ${ab.deltaMean >= 0 ? "+" : ""}${ab.deltaMean}   deltaStdev: ${ab.deltaStdev}`);
  console.log(`  consistentDirection: ${ab.consistentDirection}   passRate: ${ab.passRate}`);
  console.log(`  note: ${ab.note}`);
}

async function main(): Promise<void> {
  const positional = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const skillId = positional ?? data.skills[0]?.id;
  const nRuns = Number(arg("n")) || 3;

  const skill = data.skills.find((s) => s.id === skillId);
  if (!skill) {
    console.error(`[eval-ab] skill not found: ${skillId}`);
    console.error(`[eval-ab] available: ${data.skills.map((s) => s.id).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  // Guidance under test = the skill's latest learned finding (what a capsule injects).
  const guidance =
    skill.versions[skill.versions.length - 1]?.learnedFrom?.finding ?? skill.description;
  const priors = capsulesForSkill(skill.id);
  const project = priors[priors.length - 1]?.project ?? "Workspace";
  const task = repTask(skill.name, project);

  console.log(`[eval-ab] skill: ${skill.id} (${skill.name})`);
  console.log(`[eval-ab] guidance under test: ${guidance.slice(0, 120)}${guidance.length > 120 ? "…" : ""}`);
  console.log(`[eval-ab] running multi-sample A/B on local Ollama, N=${nRuns} (this re-runs the model ${nRuns * 2} times)…`);

  try {
    if (hasFlag("ci")) {
      const version =
        skill.versions[skill.versions.length - 1]?.version ?? skill.currentVersion;
      console.log(`[eval-ab] --ci: full agentic gate for ${skill.id}@${version}`);
      const ci = await agenticCI(skill.id, version, { nRuns });
      printAb(ci.ab);
      console.log(`\n  regression (LLM-judged by ${ci.regression.judge}): ${ci.regression.note}`);
      for (const p of ci.regression.priors) {
        console.log(`    - ${p.capsuleId}: ${p.pass ? "PASS" : "FAIL"} — ${p.reason}`);
      }
      console.log(`\n  improved=${ci.improved}  regressionsPass=${ci.regressionsPass}  VERDICT=${ci.verdict}`);
      console.log(`  summary: ${ci.summary}`);
    } else {
      const ab = await runAbTrial(task, guidance, { nRuns });
      printAb(ab);
    }
  } catch (err) {
    console.error(`[eval-ab] FAILED — ${err instanceof Error ? err.message : String(err)}`);
    console.error(`[eval-ab] is Ollama running? (curl http://localhost:11434/api/tags)`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(`[eval-ab] FATAL ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 1;
});
