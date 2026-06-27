// eod-promote.ts — THE END-OF-DAY JOB for the CAPSULE LOCAL→ENTERPRISE loop.
//
// During the day the RL pipeline writes skill upgrades into the LOCAL registry
// (branch `local-deepak`) via bumpSkillLocal — local git commits, no push.
// This script runs ONCE at day's end to promote that day's batch: it pushes
// `local-deepak` to origin and opens/updates a single PR `local-deepak → master`
// against the enterprise registry (CI-gated; merge publishes). It prints the PR url.
//
// SCHEDULE IT (it is meant to be cron'd — run unattended at day's end):
//   • Windows Task Scheduler (daily, e.g. 23:30):
//       schtasks /Create /SC DAILY /TN "capsule-eod-promote" /ST 23:30 ^
//         /TR "cmd /c cd /d C:\Users\deepc\relay && npx tsx scripts\eod-promote.ts"
//   • cron (Unix):  30 23 * * *  cd /path/to/relay && npx tsx scripts/eod-promote.ts
//
// Manual run:  cd C:/Users/deepc/relay && npx tsx scripts/eod-promote.ts
//
// Requires: `gh` authenticated (gh auth status) and git push creds for origin.

import { promoteEndOfDay, LOCAL_BRANCH, LOCAL_REGISTRY } from "../src/lib/local-registry";

async function main(): Promise<void> {
  console.log(`[eod-promote] registry=${LOCAL_REGISTRY} branch=${LOCAL_BRANCH}`);
  console.log(`[eod-promote] pushing ${LOCAL_BRANCH} and opening/updating enterprise PR…`);

  const { pushed, prUrl } = await promoteEndOfDay();

  console.log(`[eod-promote] pushed: ${pushed ? "yes" : "no"}`);
  if (prUrl) {
    console.log(`[eod-promote] PR (local-deepak → master): ${prUrl}`);
    console.log("[eod-promote] DONE — day's upgrades staged for enterprise review (CI-gated).");
    return;
  }

  if (!pushed) {
    console.error(
      "[eod-promote] FAILED to push — offline or missing git credentials. " +
        "Nothing promoted; the day's local commits remain on the branch.",
    );
    process.exitCode = 1;
    return;
  }

  console.error(
    "[eod-promote] pushed, but no PR url returned — check `gh auth status`. " +
      "Re-run after authenticating; the push is idempotent.",
  );
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(`[eod-promote] FATAL ${err instanceof Error ? err.stack : String(err)}`);
  process.exitCode = 1;
});
