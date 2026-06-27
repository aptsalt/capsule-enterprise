// LOCAL REGISTRY — the personal, local-only half of the CAPSULE RL loop.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │  LOCAL  →  END-OF-DAY  →  ENTERPRISE   (the CAPSULE promotion model)        │
// └──────────────────────────────────────────────────────────────────────────┘
//
//   DURING THE DAY (continuous, local-only)
//   ---------------------------------------
//   The RL pipeline — capture (real Claude Code session) → distill (LOCAL Ollama
//   qwen2.5-coder:14b, see src/lib/cerebras.ts) → gate (transfer/novelty + the
//   honesty guards in scripts/upgrade-dee.ts) — writes every skill upgrade it
//   earns into THIS developer's LOCAL registry via `bumpSkillLocal`. That bumps
//   skills/<id>/SKILL.md, prepends a CHANGELOG entry citing the source capsule,
//   and makes a REAL local git commit on the `local-deepak` branch. It does NOT
//   push — the day's learning accumulates privately, branch ahead of origin/master.
//
//   AT DAY'S END (the EOD job — scripts/eod-promote.ts, cron / Task Scheduler)
//   -------------------------------------------------------------------------
//   `promoteEndOfDay` pushes `local-deepak` to origin and opens (or updates) a
//   single PR `local-deepak → master` against the ENTERPRISE registry
//   (github.com/aptsalt/capsule-enterprise-skills). That PR is CI-gated and
//   human-reviewed; merging it is what actually PUBLISHES the day's upgrades to
//   the shared enterprise registry. Nothing here force-lands on master head.
//
//   HONEST LABELS: commits/changelog entries written here are marked LOCAL and
//   "pending end-of-day promotion" — they are NOT enterprise-published until the
//   EOD PR is merged. The capsule app keeps working unchanged; this module is a
//   parallel, additive write path.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import type { Bump } from "@/lib/types";
import { applyBump } from "@/lib/promote";
import { OLLAMA_MODEL } from "@/lib/cerebras";

const execFileP = promisify(execFile);

// ------------------------------------------------------------------
// Config — the user's PERSONAL/LOCAL registry clone and its working branch.
// Overridable so CI or another machine can point elsewhere.
// ------------------------------------------------------------------
export const LOCAL_REGISTRY =
  process.env.CAPSULE_LOCAL_REGISTRY || "C:/Users/deepc/.capsule/local-registry";
export const LOCAL_BRANCH = "local-deepak";

// Short repo-folder name for a skill id ("skill/rest-api-design" -> "rest-api-design"),
// matching the on-disk skills/<name>/ layout in the registry.
const shortName = (skillId: string): string => skillId.replace(/^skill\//, "");

// ------------------------------------------------------------------
// Results
// ------------------------------------------------------------------
export interface BumpLocalResult {
  skillId: string;
  newVersion: string;
  commit: string;
}

export interface PromoteEodResult {
  pushed: boolean;
  prUrl: string | null;
}

// ------------------------------------------------------------------
// git/gh helpers — always scoped to LOCAL_REGISTRY, child_process only.
// ------------------------------------------------------------------
async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileP("git", ["-C", LOCAL_REGISTRY, ...args], {
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

async function gh(args: string[]): Promise<string> {
  const { stdout } = await execFileP("gh", args, {
    cwd: LOCAL_REGISTRY,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

// Ensure we are on LOCAL_BRANCH before mutating the working tree.
async function ensureBranch(): Promise<void> {
  const cur = await git(["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "");
  if (cur !== LOCAL_BRANCH) {
    // Create/switch to the local branch tracking origin/master if needed.
    await git(["checkout", "-B", LOCAL_BRANCH]).catch(async () => {
      await git(["checkout", LOCAL_BRANCH]);
    });
  }
}

// ------------------------------------------------------------------
// currentVersionLocal — read the published `currentVersion` from a skill's
// SKILL.md frontmatter in the LOCAL registry. Returns null if absent.
// ------------------------------------------------------------------
export async function currentVersionLocal(skillId: string): Promise<string | null> {
  try {
    const path = join(LOCAL_REGISTRY, "skills", shortName(skillId), "SKILL.md");
    const md = await readFile(path, "utf8");
    const m = md.match(/^currentVersion:\s*(.+)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

// Build the CHANGELOG entry. Honest label: marked LOCAL + pending EOD promotion.
function changelogEntry(
  newVersion: string,
  bump: Bump,
  changelog: string,
  capsuleRef: string,
): string {
  return `## ${newVersion} — ${bump} — ${new Date().toISOString()}  [local · pending EOD promotion]
- **Learned from:** ${capsuleRef} (session capsule, distilled locally via \`ollama:${OLLAMA_MODEL}\`)
- **Change:** ${changelog}
- **Registry:** LOCAL (\`${LOCAL_BRANCH}\`) — committed on this developer's local branch, NOT yet on enterprise master. Promoted to enterprise via the end-of-day PR (see scripts/eod-promote.ts).

`;
}

// Prepend the new entry just above the first `## ` version heading (keeping the
// changelog's header paragraph on top, newest-version-first below it). Falls back
// to creating a minimal changelog when one does not yet exist.
function prependChangelog(existing: string | null, entry: string): string {
  if (!existing) {
    return `# Changelog\n\nRL audit trail — newest first. LOCAL entries are committed on \`${LOCAL_BRANCH}\` and promoted to the enterprise registry by the end-of-day job.\n\n${entry}`;
  }
  const idx = existing.indexOf("\n## ");
  if (idx === -1) {
    // No version headings yet — append after whatever header text exists.
    return `${existing.replace(/\s*$/, "")}\n\n${entry}`;
  }
  return `${existing.slice(0, idx + 1)}${entry}${existing.slice(idx + 1)}`;
}

// ------------------------------------------------------------------
// bumpSkillLocal — the DURING-THE-DAY write path. In LOCAL_REGISTRY on
// LOCAL_BRANCH: read the skill's current version, compute the next version,
// rewrite SKILL.md (frontmatter `currentVersion` + the `id@version` heading),
// prepend a CHANGELOG.md entry citing the source capsule, then git add + commit.
// NO push — local-only. Robust: any failure is caught and surfaced.
// ------------------------------------------------------------------
export async function bumpSkillLocal(
  skillId: string,
  bump: Bump,
  changelog: string,
  capsuleRef: string,
): Promise<BumpLocalResult> {
  const name = shortName(skillId);
  try {
    await ensureBranch();

    const skillPath = join(LOCAL_REGISTRY, "skills", name, "SKILL.md");
    const changelogPath = join(LOCAL_REGISTRY, "skills", name, "CHANGELOG.md");

    const md = await readFile(skillPath, "utf8");
    const cur = md.match(/^currentVersion:\s*(.+)$/m);
    if (!cur) throw new Error(`no currentVersion in ${skillPath}`);
    const currentVersion = cur[1].trim();
    const newVersion = applyBump(currentVersion, bump);

    // Rewrite SKILL.md: frontmatter version + any `@<currentVersion>` in the body
    // (e.g. the `skill/<id>@1.0.1` heading). Escape the version for the regex.
    const esc = currentVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const updatedMd = md
      .replace(/^currentVersion:\s*.+$/m, `currentVersion: ${newVersion}`)
      .replace(new RegExp(`@${esc}\\b`, "g"), `@${newVersion}`);
    await writeFile(skillPath, updatedMd, "utf8");

    // Prepend the changelog entry (create the file if missing).
    let existing: string | null = null;
    try {
      existing = await readFile(changelogPath, "utf8");
    } catch {
      existing = null;
    }
    await writeFile(
      changelogPath,
      prependChangelog(existing, changelogEntry(newVersion, bump, changelog, capsuleRef)),
      "utf8",
    );

    // Stage + commit locally. NO push.
    await git(["add", "--", skillPath, changelogPath]);
    await git([
      "commit",
      "-m",
      `feat(local): ${name} ${newVersion} from ${capsuleRef}`,
    ]);
    const commit = await git(["rev-parse", "HEAD"]);

    return { skillId, newVersion, commit };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`bumpSkillLocal(${skillId}) failed: ${reason}`);
  }
}

// Summarize the day's local upgrades (commits on LOCAL_BRANCH ahead of
// origin/master) into a PR title + body. Falls back gracefully if the range
// can't be computed (e.g. origin/master unknown locally).
async function summarizeDay(): Promise<{ title: string; body: string; count: number }> {
  const date = new Date().toISOString().slice(0, 10);
  let lines: string[] = [];
  try {
    const out = await git([
      "log",
      "origin/master..HEAD",
      "--pretty=format:%h %s",
    ]);
    lines = out ? out.split("\n").filter(Boolean) : [];
  } catch {
    lines = [];
  }
  const count = lines.length;
  const title = `EOD promote (${date}): ${count} local skill upgrade${count === 1 ? "" : "s"} → enterprise`;
  const body = `## End-of-day promotion — \`${LOCAL_BRANCH}\` → \`master\`

Promotes the day's LOCAL skill upgrades (RL pipeline: capture → distill via local Ollama \`${OLLAMA_MODEL}\` → gate) to the enterprise registry. **CI-gated; merge publishes.**

### Upgrades in this batch (${count})
${count ? lines.map((l) => `- ${l}`).join("\n") : "_No new commits ahead of origin/master._"}

---
Generated by the end-of-day job (scripts/eod-promote.ts). Honest label: these were committed locally during the day and are NOT enterprise-published until this PR is reviewed and merged.

🤖 Generated with [Claude Code](https://claude.com/claude-code)`;
  return { title, body, count };
}

// ------------------------------------------------------------------
// promoteEndOfDay — the END-OF-DAY job. Pushes LOCAL_BRANCH to origin, then
// creates a PR `local-deepak → master` against the enterprise registry — or, if
// an open PR already exists for the branch, updates its title/body. Returns
// {pushed, prUrl}. Robust: a failure at any step degrades to {pushed:false} /
// {prUrl:null} rather than throwing.
// ------------------------------------------------------------------
export async function promoteEndOfDay(): Promise<PromoteEodResult> {
  let pushed = false;
  let prUrl: string | null = null;

  try {
    await ensureBranch();
    await git(["push", "-u", "origin", LOCAL_BRANCH]);
    pushed = true;
  } catch {
    // Offline / no creds — branch stays local; no PR possible this run.
    return { pushed: false, prUrl: null };
  }

  const { title, body } = await summarizeDay();

  // Is there already an open PR for this head branch?
  try {
    const existing = await gh([
      "pr",
      "list",
      "--head",
      LOCAL_BRANCH,
      "--base",
      "master",
      "--state",
      "open",
      "--json",
      "url,number",
    ]);
    const list = JSON.parse(existing || "[]") as { url: string; number: number }[];
    if (list.length) {
      const pr = list[0];
      try {
        await gh([
          "pr",
          "edit",
          String(pr.number),
          "--title",
          title,
          "--body",
          body,
        ]);
      } catch {
        // Edit failed — still return the existing PR url so the EOD job reports it.
      }
      return { pushed, prUrl: pr.url };
    }
  } catch {
    // gh unavailable / not authed — fall through to attempt create (which will
    // also fail the same way and yield prUrl:null).
  }

  // No existing PR — create one.
  try {
    prUrl = await gh([
      "pr",
      "create",
      "--base",
      "master",
      "--head",
      LOCAL_BRANCH,
      "--title",
      title,
      "--body",
      body,
    ]);
  } catch {
    prUrl = null;
  }

  return { pushed, prUrl };
}
