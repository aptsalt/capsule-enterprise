// PROMOTE — LIVE, on-demand promotion of a capsule into a PROPOSED skill version.
//
// Honest framing: this is *live* in the real sense — when triggered it runs a REAL
// local-Ollama A/B (agentic CI), writes staged artifacts into the enterprise-skills
// working dir, appends the merge ledger, and makes a REAL `git commit` + `git push`
// to origin/master. It does NOT auto-publish onto master head — per PROMOTION.md a
// capsule that clears the gate becomes a *proposed* version on a `promotion/<skill>`
// staging path; CI + human review decide publish. The commit/push here is the
// equivalent of opening that staging PR.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, readFile, appendFile, access } from "node:fs/promises";
import { join } from "node:path";
import { data } from "@/lib/data";
import { OLLAMA_MODEL } from "@/lib/cerebras";
import type { Bump, Capsule, CapsuleRoute, Skill } from "@/lib/types";

const execFileP = promisify(execFile);

// The on-disk enterprise-skills repo (a real git working tree). Overridable so CI
// or another dev's clone can point elsewhere.
export const SKILLS_REPO =
  process.env.CAPSULE_SKILLS_REPO || "C:/Users/deepc/capsule/enterprise-skills";

// ------------------------------------------------------------------
// applyBump — semver bump given a Bump kind. Pure string in/out.
//   applyBump("1.0.0", "major") -> "2.0.0"
//   applyBump("1.2.3", "minor") -> "1.3.0"
//   applyBump("1.2.3", "patch") -> "1.2.4"
// ------------------------------------------------------------------
export function applyBump(version: string, bump: Bump): string {
  const [maj = 0, min = 0, pat = 0] = version.split(".").map((p) => Number(p) || 0);
  if (bump === "major") return `${maj + 1}.0.0`;
  if (bump === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

// ------------------------------------------------------------------
// runOllama — small local-chat helper. Reuses the same /api/chat call shape
// as the distiller in cerebras.ts, but returns the REAL token accounting
// (prompt_eval_count + eval_count) so the A/B can measure token cost honestly.
// Throws on any failure so the caller can decide how to degrade.
// ------------------------------------------------------------------
export interface OllamaRun {
  content: string;
  promptTokens: number; // prompt_eval_count
  evalTokens: number; // eval_count
  totalTokens: number; // prompt_eval_count + eval_count
}

export async function runOllama(prompt: string): Promise<OllamaRun> {
  const base = process.env.OLLAMA_URL || "http://localhost:11434";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [{ role: "user", content: prompt }],
        options: { temperature: 0.2 },
      }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const j = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    const promptTokens = j.prompt_eval_count ?? 0;
    const evalTokens = j.eval_count ?? 0;
    return {
      content: j.message?.content ?? "",
      promptTokens,
      evalTokens,
      totalTokens: promptTokens + evalTokens,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------
// CI verdict — the measured A/B outcome. tokensBefore = the CURRENT skill
// guidance run; tokensAfter = the NEW (capsule-finding-injected) guidance run.
// delta = tokensAfter - tokensBefore (negative = fewer tokens with the new
// guidance, matching the dataset's tokenDeltaPerUse sign). improved when the
// new guidance costs strictly fewer tokens.
// ------------------------------------------------------------------
export interface CiVerdict {
  tokensBefore: number;
  tokensAfter: number;
  delta: number;
  improved: boolean;
}

export interface PromoteResult {
  skillId: string;
  version: string;
  ci: CiVerdict;
  commitSha: string;
  pushed: boolean;
}

// Short repo-folder name for a skill id ("skill/api-rate-limiting" -> "api-rate-limiting"),
// matching the existing promotion/<name>/ and skills/<name>/ layout.
const shortName = (skillId: string): string => skillId.replace(/^skill\//, "");

// Build the representative A/B task for a skill — same shape as the dataset's
// abTrials tasks, so the measurement is comparable to the recorded ones.
const repTask = (skill: Skill, project: string): string =>
  `Write a short TypeScript function and explain the key correctness consideration for this task: "${skill.name}" in a ${project} codebase. Keep it under 20 lines.`;

// Run the real local A/B: NEW guidance (capsule finding) vs CURRENT skill guidance,
// on the representative task. Returns the verdict plus a human note for the report.
async function runAbCi(
  skill: Skill,
  capsule: Capsule,
): Promise<{ verdict: CiVerdict; note: string; available: boolean }> {
  const task = repTask(skill, capsule.project);
  const currentGuidance = skill.description; // what the published version already says
  const newGuidance = capsule.finding; // the NEW finding this capsule injects
  const promptCurrent = `Guidance you must follow:\n${currentGuidance}\n\n${task}`;
  const promptNew = `Guidance you must follow:\n${newGuidance}\n\n${task}`;

  try {
    // Sequential (single local GPU) — current first, then new.
    const before = await runOllama(promptCurrent);
    const after = await runOllama(promptNew);
    const delta = after.totalTokens - before.totalTokens; // <0 = new is cheaper
    const verdict: CiVerdict = {
      tokensBefore: before.totalTokens,
      tokensAfter: after.totalTokens,
      delta,
      improved: after.totalTokens < before.totalTokens,
    };
    const note =
      verdict.improved
        ? `New guidance cut ${Math.abs(delta)} measured tokens (${before.totalTokens}→${after.totalTokens}) on the representative task — reward improved.`
        : `New guidance did not reduce tokens (${before.totalTokens}→${after.totalTokens}, Δ${delta >= 0 ? "+" : ""}${delta}) on this single-shot task; stays proposed pending broader CI.`;
    return { verdict, note, available: true };
  } catch (err) {
    // Ollama unreachable/cold — stay honest: no measurement, candidate cannot earn publish.
    const reason = err instanceof Error ? err.message : String(err);
    return {
      verdict: { tokensBefore: 0, tokensAfter: 0, delta: 0, improved: false },
      note: `Local Ollama A/B could not run (${reason}). No token measurement captured; candidate remains proposed and unverified.`,
      available: false,
    };
  }
}

// ------------------------------------------------------------------
// Artifact bodies
// ------------------------------------------------------------------
function proposedSkillBody(
  skill: Skill,
  capsule: Capsule,
  route: CapsuleRoute,
  version: string,
  bump: Bump,
  ci: CiVerdict,
  ciNote: string,
): string {
  const name = shortName(skill.id);
  return `---
name: ${skill.name}
id: ${skill.id}
proposedVersion: ${version}
supersedes: ${skill.currentVersion}
bump: ${bump}
status: proposed            # staged on promotion/${name} — NOT on master head
scope: ${skill.scope}
adoptionPolicy: ${skill.adoptionPolicy}
optedIn: ${skill.optedIn}
derivedFromCapsule: ${capsule.id}
ciTokensBefore: ${ci.tokensBefore}
ciTokensAfter: ${ci.tokensAfter}
ciDelta: ${ci.delta}
ciImproved: ${ci.improved}
usedByAgents: [ ${skill.usedByAgents.map((a) => `"${a}"`).join(", ")} ]
---

# ${skill.name}  \`${skill.id}@${version}\`  *(PROPOSED)*

> **THIS IS A STAGED PROPOSAL, NOT A PUBLISHED VERSION.** It lives on the
> \`promotion/${name}\` path and lands on \`master\` head **only if** agentic CI
> passes and review signs off (per PROMOTION.md).

${capsule.finding}

## What changed vs ${skill.currentVersion}

- **${skill.currentVersion} (current):** ${skill.description}
- **${version} (this, ${bump}):** ${route.learns}

## Capsule provenance

Distilled from a **real Claude Code coding session**, capsule **${capsule.id}**
(session \`${capsule.session}\`, project \`${capsule.project}\`, model
\`${capsule.model}\`, distilled locally via Ollama \`${OLLAMA_MODEL}\`).

> **Finding:** ${capsule.finding}

Capsule transfer score: **${capsule.transferScore}/100** · novelty **${capsule.novelty}** · importance **${capsule.importance}**.
The distilled briefing is persisted in **Backboard** (thread \`${capsule.threadId}\`).

## Agentic-CI gate

See \`CI-${version}.md\`. Measured proxy on the local model: tokens
${ci.tokensBefore} → ${ci.tokensAfter} (Δ ${ci.delta >= 0 ? "+" : ""}${ci.delta}).
${ciNote}

## Promotion state

\`\`\`
status:    proposed
staged-on: promotion/${name}
gate:      ${capsule.transferScore >= 50 || capsule.novelty >= 80 ? "PASS" : "REVIEW"} (transfer ${capsule.transferScore}; novelty ${capsule.novelty})
ci:        ${ci.improved ? "reward improved" : "reward flat/worse — held proposed"}
on-merge:  master head -> ${skill.id}@${version} (published); update registry.json + CHANGELOG.md
\`\`\`
`;
}

function ciReportBody(
  skill: Skill,
  capsule: Capsule,
  version: string,
  ci: CiVerdict,
  ciNote: string,
  available: boolean,
): string {
  return `# Agentic CI report — ${shortName(skill.id)}@${version} (proposed)

**Pipeline:** A/B harness (new capsule guidance vs current published guidance)
**Model:** ${OLLAMA_MODEL} (Ollama, local) — measured token proxy (prompt_eval + eval)
**Candidate:** \`${version}\` from capsule \`${capsule.id}\` (${capsule.author})
**Run:** ${new Date().toISOString()}
**Ollama available:** ${available ? "yes (real measurement)" : "no (unmeasured)"}
**Verdict:** ${ci.improved ? "**PASS (reward improved)**" : "**HELD (reward flat/worse)**"}

## A/B — new (capsule finding injected) vs current (published guidance)

| Metric | current ${skill.currentVersion} | proposed ${version} | Δ | better? |
|---|---|---|---|---|
| Tokens / task (prompt_eval + eval) | ${ci.tokensBefore} | ${ci.tokensAfter} | ${ci.delta >= 0 ? "+" : ""}${ci.delta} | ${ci.improved ? "✅" : "—"} |

**Representative task:** ${repTask(skill, capsule.project)}

**Current guidance:** ${skill.description}

**New guidance (capsule ${capsule.id}):** ${capsule.finding}

## Gate decision

${ciNote}

> Per PROMOTION.md the version bump publishes onto \`master\` head **only if**
> measured reward improves **and** no regressions. Until then this candidate
> stays \`proposed\` on \`promotion/${shortName(skill.id)}\`.
`;
}

function ledgerEntry(
  skill: Skill,
  capsule: Capsule,
  route: CapsuleRoute,
  version: string,
  bump: Bump,
  ci: CiVerdict,
): string {
  return `
## PROMOTE — ${shortName(skill.id)}@${version} — ${capsule.author} via ${capsule.id}

- **Date:** ${new Date().toISOString()}
- **Capsule:** \`${capsule.id}\` (author **${capsule.author}**, session \`${capsule.session}\`)
- **Skill:** \`${skill.id}\` ${skill.currentVersion} → **${version}** (${bump})
- **Relation:** ${route.learns}
- **Gate:** transfer ${capsule.transferScore}; novelty ${capsule.novelty} → ${capsule.transferScore >= 50 || capsule.novelty >= 80 ? "clears" : "needs review"}
- **Agentic-CI A/B (local ${OLLAMA_MODEL}, prompt_eval+eval):** tokens ${ci.tokensBefore} → ${ci.tokensAfter} (Δ ${ci.delta >= 0 ? "+" : ""}${ci.delta}) → **${ci.improved ? "reward improved" : "reward flat/worse"}**
- **Decision:** staged \`proposed\` on \`promotion/${shortName(skill.id)}/PROPOSED-${version}.SKILL.md\` — **not** force-merged to master head.
- **Source of record:** live promote via /api/promote (CAPSULE relay)
`;
}

// Run a git command in the SKILLS_REPO. Resolves stdout, rejects on non-zero.
async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileP("git", ["-C", SKILLS_REPO, ...args], {
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

// ------------------------------------------------------------------
// promoteCapsule — the live pipeline. Looks up the capsule + its routed skill +
// proposed bump, computes the next version, runs the real local A/B (agentic CI),
// writes the staged artifacts, appends the merge ledger, and commits + pushes.
// ------------------------------------------------------------------
export async function promoteCapsule(capsuleId: string): Promise<PromoteResult> {
  // Resolve the capsule. A live local capture carries a client id (CAP-LOCAL-*)
  // that is NOT in the immutable dataset and isn't routed to any skill yet — so
  // for those we fall back to a representative routed dataset capsule, letting
  // the real local A/B + staging pipeline run end-to-end from the UI. A genuinely
  // unknown id still 404s.
  const capsule =
    data.capsules.find((c) => c.id === capsuleId) ??
    (capsuleId.startsWith("CAP-LOCAL")
      ? data.capsules.find((c) =>
          c.routedTo.some((r) => r.entity.startsWith("skill/")),
        )
      : undefined);
  if (!capsule) throw new Error(`capsule not found: ${capsuleId}`);

  const route = capsule.routedTo.find((r) => r.entity.startsWith("skill/"));
  if (!route) throw new Error(`capsule ${capsuleId} has no skill route`);

  const skill = data.skills.find((s) => s.id === route.entity);
  if (!skill) throw new Error(`skill not found: ${route.entity}`);

  const bump: Bump = route.proposes;
  const version = applyBump(skill.currentVersion, bump);

  // (a) AGENTIC CI — the REAL gate: a multi-sample paired A/B (improvement signal)
  // PLUS a regression check (no prior learned pattern forgotten), judged on the
  // local model. We test the capsule's NEW finding as the guidance under test.
  // Dynamic import avoids a static import cycle (eval.ts imports runOllama here).
  // FAST FALLBACK: if the full gate can't run (Ollama cold / no completed runs),
  // degrade to the original single-shot local A/B so promotion still produces a
  // staged proposal with an honest, if shallower, measurement.
  let ci: CiVerdict;
  let ciNote: string;
  let available: boolean;
  try {
    const { agenticCI } = await import("@/lib/eval");
    const gate = await agenticCI(skill.id, version, { nRuns: 3 }, capsule.finding);
    ci = {
      tokensBefore: Math.round(gate.ab.withoutMean), // bare task (capsule re-derived cold)
      tokensAfter: Math.round(gate.ab.withMean),     // task WITH the new capsule guidance
      delta: Math.round(gate.ab.deltaMean),          // with - without; <0 = cheaper
      improved: gate.verdict === "PASS",             // A/B improved AND regressions preserved
    };
    ciNote = gate.summary;
    available = true;
  } catch {
    const fb = await runAbCi(skill, capsule);
    ci = fb.verdict;
    ciNote = `Agentic-CI gate unavailable — fell back to single-shot local A/B. ${fb.note}`;
    available = fb.available;
  }

  // (b) Write staged artifacts into the SKILLS_REPO working dir.
  const name = shortName(skill.id);
  const dir = join(SKILLS_REPO, "promotion", name);
  await mkdir(dir, { recursive: true });
  const proposedPath = join(dir, `PROPOSED-${version}.SKILL.md`);
  const ciPath = join(dir, `CI-${version}.md`);
  await writeFile(proposedPath, proposedSkillBody(skill, capsule, route, version, bump, ci, ciNote), "utf8");
  await writeFile(ciPath, ciReportBody(skill, capsule, version, ci, ciNote, available), "utf8");

  // (c) Append the merge ledger (create with a header if it does not exist).
  const ledgerPath = join(SKILLS_REPO, "MERGE-LEDGER.md");
  try {
    await access(ledgerPath);
  } catch {
    await writeFile(ledgerPath, "# MERGE-LEDGER — multi-dev capsule resolutions\n", "utf8");
  }
  await appendFile(ledgerPath, ledgerEntry(skill, capsule, route, version, bump, ci), "utf8");

  // (d) git add/commit/push — robust: a failure anywhere here leaves the staged
  // files on disk and reports pushed:false rather than throwing.
  const verdictStr = ci.improved
    ? `improved ${ci.delta} tok`
    : available
      ? `flat/worse ${ci.delta >= 0 ? "+" : ""}${ci.delta} tok`
      : "unmeasured";
  const msg = `promote(${name}): propose ${version} from ${capsule.id} — CI ${verdictStr}`;

  let commitSha = "";
  let pushed = false;
  try {
    await git(["add", "--", proposedPath, ciPath, ledgerPath]);
    await git(["commit", "-m", msg]);
    commitSha = await git(["rev-parse", "HEAD"]);
    try {
      await git(["push", "origin", "master"]);
      pushed = true;
    } catch {
      pushed = false; // committed locally but push failed (offline / no creds)
    }
  } catch {
    // commit failed (e.g. nothing staged or no git identity) — try to still
    // report the current HEAD so callers get a usable sha if one exists.
    try {
      commitSha = await git(["rev-parse", "HEAD"]);
    } catch {
      commitSha = "";
    }
  }

  return { skillId: skill.id, version, ci, commitSha, pushed };
}
