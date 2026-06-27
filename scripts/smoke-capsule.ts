// Smoke: exercise distillChunked() + scoreCapsuleLLM() + noveltyLLM() on a sample.
// Run: cd C:/Users/deepc/relay && RELAY_OLLAMA_MODEL=gemma4:12b npx tsx scripts/smoke-capsule.ts
import { distillChunked, distill } from "../src/lib/cerebras";
import { scoreCapsuleLLM, scoreCapsule, noveltyLLM } from "../src/lib/scorer";
import type { RawSession } from "../src/lib/capture";

// Build an oversized synthetic transcript (> single-pass budget) so the
// chunked map-reduce path is forced.
function makeSession(): RawSession {
  const blocks: string[] = [];
  blocks.push("USER: Migrate the auth layer from NextAuth to Supabase Auth without downtime.");
  for (let i = 0; i < 220; i++) {
    blocks.push(`AI: Step ${i}: edited src/lib/auth-${i}.ts because the cookie domain must match the apex; chose RS256 over HS256 so edge can verify without the secret.`);
    blocks.push(`TOOL[Edit]: src/lib/auth-${i}.ts`);
    blocks.push(`AI: Gotcha ${i}: WinError EBUSY on .next during dev — close the watcher before swapping the middleware. Don't run two dev servers.`);
    blocks.push(`USER: also make sure refresh tokens rotate, that part keeps failing?`);
  }
  blocks.push("AI: Current state: middleware swapped, refresh rotation wired via supabase.auth.onAuthStateChange; sign-out across tabs still flaky.");
  const transcript = blocks.join("\n");
  return {
    sessionId: "smoke-1", project: "relay-smoke", path: "(synthetic)",
    messages: blocks.length, tools: 220, durationMin: 95,
    filesTouched: ["src/lib/auth-0.ts", "src/middleware.ts"],
    transcript,
  };
}

async function main() {
  const s = makeSession();
  console.log(`transcript chars=${s.transcript.length} (~${Math.ceil(s.transcript.length / 4)} est tokens)`);

  console.log("\n== distillChunked ==");
  const t0 = Date.now();
  const { capsule, engine, ms } = await distillChunked(s);
  console.log(`engine: ${engine}`);
  console.log(`distill ms (reported): ${ms}, wall ms: ${Date.now() - t0}`);
  console.log(`intent: ${capsule.intent.slice(0, 140)}`);
  console.log(`decisions: ${capsule.decisions.length}, gotchas: ${capsule.gotchas.length}, next_steps: ${capsule.next_steps.length}`);
  console.log(`current_state: ${capsule.current_state.slice(0, 140)}`);

  // sanity: distill() must delegate to the chunked path for this oversized input
  const viaPublic = await distill(s);
  console.log(`distill() delegated engine: ${viaPublic.engine}`);

  console.log("\n== scoreCapsule (heuristic, offline) ==");
  const h = scoreCapsule(capsule);
  console.log(`overall=${h.overall} verdict="${h.verdict}"`);

  console.log("\n== scoreCapsuleLLM (llm-judged) ==");
  const llm = await scoreCapsuleLLM(capsule);
  console.log(`overall=${llm.overall} dims=${JSON.stringify(llm.dimensions)}`);
  console.log(`verdict="${llm.verdict.slice(0, 160)}"`);
  console.log(`coaching: ${JSON.stringify(llm.coaching)}`);

  console.log("\n== noveltyLLM ==");
  const nov = await noveltyLLM(capsule);
  console.log(`novelty=${nov}`);

  // assertions
  const ok =
    !!capsule.intent &&
    typeof llm.overall === "number" && llm.overall >= 0 && llm.overall <= 100 &&
    typeof nov === "number" && nov >= 0 && nov <= 100 &&
    /chunked \d+x/.test(viaPublic.engine || engine);
  console.log(`\nSMOKE ${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
