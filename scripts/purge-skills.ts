// purge-skills.ts — THE SKILL PURGE/RETIRE JOB for the CAPSULE enterprise registry.
//
// Counterpart to eod-promote.ts. Promotion forges new skill versions; left alone,
// the registry only ever grows and silts up with deduped, superseded, orphaned,
// unused, and low-value skills. This job scans the enterprise registry and proposes
// the retirements — staged, ledgered, and reviewable, never a silent delete.
//
// DRY-RUN BY DEFAULT (this is the safe default; it writes NOTHING):
//   cd C:/Users/deepc/relay && npx tsx scripts/purge-skills.ts
//   → prints the candidate table (skill · reason · recommended · measured value),
//     plus what an --apply run WOULD stage. No files touched.
//
// APPLY (stages an enterprise retirement PR, like promotion):
//   cd C:/Users/deepc/relay && npx tsx scripts/purge-skills.ts --apply
//   → writes purge/<skill>/DEPRECATION-*.md, appends PURGE-LEDGER.md, and opens a
//     `retire/<date> → master` PR. Optionally also performs the archive/purge
//     transitions when explicitly asked:
//       --archive=<skill-id>     move skills/<id> → archive/<id>, drop from registry
//       --purge-archived         hard-delete archive/* folders older than the grace
//                                window (ledgered first; --grace=<days> to override)
//
// SCHEDULE IT (weekly is the right cadence — retirement is a slow, deliberate sweep
// that should trail promotion, not race it):
//   • Windows Task Scheduler (every Monday 02:00, DRY-RUN report only):
//       schtasks /Create /SC WEEKLY /D MON /TN "capsule-purge-scan" /ST 02:00 ^
//         /TR "cmd /c cd /d C:\Users\deepc\relay && npx tsx scripts\purge-skills.ts"
//   • cron (Unix), Mondays 02:00 dry-run report:
//       0 2 * * 1  cd /path/to/relay && npx tsx scripts/purge-skills.ts
//   Promote the report to --apply only after a human reviews the candidates (run it
//   guarded behind review/approval; do NOT cron --apply blindly).
//
// Requires for --apply: git push creds for origin and `gh` authenticated.

import {
  scanPurgeCandidates,
  proposePurge,
  archiveSkill,
  purgeArchived,
  openRetirementPr,
  ARCHIVE_GRACE_DAYS,
  type PurgeCandidate,
} from "../src/lib/purge";

interface Args {
  apply: boolean;
  archiveId: string | null;
  purgeArchived: boolean;
  grace: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, archiveId: null, purgeArchived: false, grace: ARCHIVE_GRACE_DAYS };
  for (const a of argv) {
    if (a === "--apply") args.apply = true;
    else if (a === "--purge-archived") args.purgeArchived = true;
    else if (a.startsWith("--archive=")) args.archiveId = a.slice("--archive=".length);
    else if (a.startsWith("--grace=")) {
      const n = Number(a.slice("--grace=".length));
      if (!Number.isNaN(n)) args.grace = n;
    }
  }
  return args;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function printTable(candidates: PurgeCandidate[]): void {
  if (candidates.length === 0) {
    console.log("\n  (no retirement candidates — registry is clean)\n");
    return;
  }
  const head = `  ${pad("SKILL", 34)}${pad("VER", 7)}${pad("REASON", 12)}${pad("RECMD", 10)}${pad("TOK/USE", 9)}${pad("VALUE", 8)}AGE`;
  console.log("\n" + head);
  console.log("  " + "-".repeat(head.length));
  for (const c of candidates) {
    const also = c.alsoMatched.length ? `+${c.alsoMatched.join(",")}` : "";
    console.log(
      `  ${pad(c.id, 34)}${pad(c.currentVersion, 7)}${pad(c.reason, 12)}${pad(c.recommended, 10)}${pad(
        String(c.tokensSavedPerUse),
        9,
      )}${pad(String(c.value), 8)}${c.ageDays ?? "?"}d` + (also ? `   ${also}` : ""),
    );
  }
  console.log("");
  // Per-candidate honest note + evidence sources.
  for (const c of candidates) {
    console.log(`  • ${c.note}`);
    for (const s of c.signals.filter((s) => s.label !== "metrics")) {
      console.log(`      - (${s.source}) ${s.label}: ${s.detail}`);
    }
  }
  console.log("");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[purge] CAPSULE skill PURGE/RETIRE — ${args.apply ? "APPLY" : "DRY-RUN (report only)"}`);

  const candidates = await scanPurgeCandidates();
  const byReason = candidates.reduce<Record<string, number>>((acc, c) => {
    acc[c.reason] = (acc[c.reason] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `[purge] scanned enterprise registry → ${candidates.length} candidate(s): ${
      Object.entries(byReason)
        .map(([r, n]) => `${r}×${n}`)
        .join(", ") || "none"
    }`,
  );
  printTable(candidates);

  if (!args.apply) {
    console.log("[purge] DRY-RUN — no files written. Re-run with --apply (after review) to stage the retirement PR.");
    // Show what apply WOULD stage.
    const plan = await proposePurge(candidates, { apply: false });
    for (const p of plan.proposals) {
      console.log(`        would write ${p.path}  (recommended: ${p.recommended})`);
    }
    return;
  }

  // APPLY: stage deprecation proposals + PURGE-LEDGER, then open the retirement PR.
  const proposed = await proposePurge(candidates, { apply: true });
  console.log(`[purge] staged ${proposed.proposals.length} deprecation proposal(s); ${proposed.ledgerEntries} PURGE-LEDGER entr(ies) appended.`);

  if (args.archiveId) {
    const res = await archiveSkill(args.archiveId, { apply: true });
    console.log(`[purge] archive ${res.id}: ${res.note}`);
  }

  if (args.purgeArchived) {
    const res = await purgeArchived(args.grace, { apply: true });
    console.log(`[purge] purgeArchived(grace=${res.graceDays}d): purged ${res.purged.length}, kept ${res.kept.length}.`);
    for (const p of res.purged) console.log(`        purged archive/${p.id.replace(/^skill\//, "")} (age ${p.ageDays}d)`);
  }

  const pr = await openRetirementPr(candidates, { apply: true });
  if (pr.prUrl) {
    console.log(`[purge] retirement PR (${pr.branch} → master): ${pr.prUrl}`);
    console.log("[purge] DONE — retirements staged for enterprise review (governance-gated; merge retires).");
    return;
  }
  if (!pr.pushed) {
    console.error(`[purge] FAILED to push ${pr.branch} — offline or missing git credentials. Proposals + ledger remain on disk locally.`);
    process.exitCode = 1;
    return;
  }
  console.error(`[purge] pushed ${pr.branch}, but no PR url returned — check \`gh auth status\` and re-run (idempotent).`);
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(`[purge] FATAL ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 1;
});
