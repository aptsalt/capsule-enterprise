// CLI: generate a Handoff Capsule from a real Claude session and print it.
// Usage: npx tsx scripts/make-capsule.ts [sessionPathOrIndex]
import { listSessions, captureSession } from "../src/lib/capture";
import { distill } from "../src/lib/cerebras";
import { scoreCapsule } from "../src/lib/scorer";
import { storeCapsule } from "../src/lib/backboard";
import { capsuleToBriefing } from "../src/lib/capsule";

async function main() {
  const arg = process.argv[2];
  let path: string;
  if (arg && arg.includes(".jsonl")) path = arg;
  else {
    const sessions = listSessions(10);
    if (!sessions.length) { console.error("No Claude sessions found in ~/.claude/projects"); process.exit(1); }
    const idx = arg ? parseInt(arg) : 0;
    console.log("Recent sessions:");
    sessions.forEach((s, i) => console.log(`  [${i}] ${s.project}/${s.sessionId.slice(0, 8)}  ${s.sizeKB}KB`));
    path = sessions[Math.min(idx, sessions.length - 1)].path;
  }
  console.log(`\nCapturing ${path}\n`);
  const raw = captureSession(path);
  console.log(`  messages=${raw.messages} tools=${raw.tools} files=${raw.filesTouched.length} dur=${raw.durationMin}min`);

  const t0 = Date.now();
  const { capsule, engine, ms } = await distill(raw);
  capsule.handoff_score = scoreCapsule(capsule);
  const store = await storeCapsule(capsule);

  console.log(`\n  distilled by ${engine} in ${ms || (Date.now() - t0)}ms`);
  console.log(`  handoff score: ${capsule.handoff_score.overall}/100 — ${capsule.handoff_score.verdict}`);
  console.log(`  stored: ${store.store}${store.thread_id ? ` (${store.thread_id})` : ""}\n`);
  console.log("================ HANDOFF BRIEFING ================\n");
  console.log(capsuleToBriefing(capsule));
  console.log("\n=================================================");
  console.log("\ncoaching:");
  capsule.handoff_score.coaching.forEach((c) => console.log("  • " + c));
}
main().catch((e) => { console.error(e); process.exit(1); });
