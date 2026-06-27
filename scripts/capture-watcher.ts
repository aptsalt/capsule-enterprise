// CAPTURE-WATCHER — the long-running, BACKGROUND half of CAPSULE Ambient Capture (#2).
//
// Sessions are captured automatically as they CLOSE — there is no manual button. This process:
//   1. Drains the queue file that the Stop hook's `capture-enqueue.js` appends to, AND
//   2. Scans ~/.claude/projects for sessions that have gone IDLE (no writes in ~10 min = "closed").
// It dedups every candidate against a persistent processed.json, then for each genuinely NEW session
// runs the REAL pipeline — capture -> distill (local Ollama) -> score -> finding -> route -> gate ->
// store(Backboard) -> bump(local registry) — exactly like scripts/capture-this-session.ts, but
// generalized to an arbitrary session and made idempotent + crash-safe + throttled (one at a time).
//
// NON-BLOCKING BY DESIGN: nothing here runs inside the user's Claude Code process. The Stop hook only
// appends a line (microseconds); all model/network/git work happens here, out-of-band.
//
// HONESTY (labels):
//   - transferScore is MEASURED by src/lib/scorer.ts over the distilled capsule.
//   - novelty is DERIVED from a heuristic (gotchas/tried-rejected/finding-length), NOT measured.
//   - the finding and the skill routing are LLM-JUDGED by the local Ollama model.
//   - only the DISTILLED briefing (never the raw transcript) is sent to Backboard; the transcript fed
//     to the local model is TRUNCATED to the last ~50KB and that truncation is reported.
//
// RUN (background):
//   cd C:/Users/deepc/relay && npx tsx scripts/capture-watcher.ts
// See the "OPERATIONS" block at the bottom of this file for Task Scheduler + disable instructions.
import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
} from "fs";
import { join } from "path";
import { captureSession, listSessions, type RawSession } from "../src/lib/capture";
import { distill, OLLAMA_MODEL } from "../src/lib/cerebras";
import { scoreCapsule } from "../src/lib/scorer";
import { capsuleMemoryBriefing, storeCapsuleMemory } from "../src/lib/backboard";
import { bumpSkillLocal, LOCAL_REGISTRY, LOCAL_BRANCH, currentVersionLocal } from "../src/lib/local-registry";
import type { Bump } from "../src/lib/types";

// ── paths & tunables ──────────────────────────────────────────────────────────
const ROOT = join(__dirname, "..");
const CAPSULE_DIR = "C:/Users/deepc/.capsule";
const QUEUE = join(CAPSULE_DIR, "capture-queue.txt");
const PROCESSED = join(CAPSULE_DIR, "processed.json");
const LOCK = join(CAPSULE_DIR, "watcher.lock");
const LOG = join(CAPSULE_DIR, "capture-watcher.log");

const OLLAMA = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_CAP_CHARS = 50_000; // ~16k tokens — safe for the local 14b model
const POLL_MS = Number(process.env.CAPSULE_POLL_MS || 30_000); // how often to scan
const IDLE_MS = Number(process.env.CAPSULE_IDLE_MS || 10 * 60_000); // "closed" = no writes for 10 min
const MAX_IDLE_AGE_MS = Number(process.env.CAPSULE_MAX_AGE_MS || 6 * 60 * 60_000); // ignore idle sessions older than 6h
const MIN_SESSION_KB = Number(process.env.CAPSULE_MIN_KB || 5); // skip trivial/empty transcripts
const LOCK_STALE_MS = POLL_MS * 6; // a lock not refreshed in this window is considered abandoned
const BACKBOARD_PROJECT_KEY = "relay-ambient-capture";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── logging ───────────────────────────────────────────────────────────────────
function log(s: string) {
  const line = `[${new Date().toISOString()}] ${s}\n`;
  try { appendFileSync(LOG, line); } catch { /* ignore */ }
  process.stdout.write(line);
}

// ── env loader (BACKBOARD_API_KEY etc. from .env.local) — same shape as the sibling script ──
function loadEnv() {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) { log("WARN no .env.local found — Backboard store will be a local fallback"); return; }
  for (const raw of readFileSync(p, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
  process.env.BACKBOARD_ASSISTANT_NAME = process.env.BACKBOARD_ASSISTANT_NAME || "capsule";
}

// ── atomic JSON write (temp + rename) so a crash never leaves a half-written file ──
function writeJsonAtomic(file: string, data: unknown) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmp, file);
}

// ── processed ledger: sessionId -> record. Presence (any status) == skip (at-most-once). ──
type ProcRecord = {
  sessionId: string;
  path: string;
  status: "processing" | "kept" | "skipped" | "error";
  claimedAt: string;
  finishedAt?: string;
  transferScore?: number;
  novelty?: number;
  skill?: string;
  newVersion?: string;
  commit?: string;
  error?: string;
};
type Ledger = Record<string, ProcRecord>;

function loadLedger(): Ledger {
  if (!existsSync(PROCESSED)) return {};
  try { return JSON.parse(readFileSync(PROCESSED, "utf8")) as Ledger; }
  catch { log(`WARN processed.json unreadable — starting a fresh ledger (old file left intact)`); return {}; }
}
function saveLedger(l: Ledger) { writeJsonAtomic(PROCESSED, l); }

// ── single-instance lock (best-effort, Windows-friendly) ──────────────────────
function acquireLock(): boolean {
  try {
    if (existsSync(LOCK)) {
      const age = Date.now() - statSync(LOCK).mtimeMs;
      if (age < LOCK_STALE_MS) {
        log(`another watcher appears to hold the lock (age ${Math.round(age / 1000)}s < ${Math.round(LOCK_STALE_MS / 1000)}s) — exiting.`);
        return false;
      }
      log(`stale lock (age ${Math.round(age / 1000)}s) — taking over.`);
    }
    refreshLock();
    return true;
  } catch (e) {
    log(`lock check failed (${String(e)}) — continuing without a hard lock.`);
    return true;
  }
}
function refreshLock() {
  try { writeFileSync(LOCK, `${process.pid} ${new Date().toISOString()}\n`, "utf8"); } catch { /* ignore */ }
}

// ── local-Ollama chat helper (json mode) ──────────────────────────────────────
async function ollamaChat(system: string, user: string, numPredict = 220): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL, stream: false, format: "json",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        options: { temperature: 0.2, num_predict: numPredict },
      }),
    });
    if (!res.ok) return "";
    const j = (await res.json()) as { message?: { content?: string } };
    return j.message?.content || "";
  } catch (e) { log(`ollamaChat error: ${String(e)}`); return ""; }
  finally { clearTimeout(timer); }
}

function parseJsonLoose<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

// ── load the LOCAL registry's skills (id + name + short description) for routing ──
type SkillCard = { id: string; name: string; description: string };
function loadRegistrySkills(): SkillCard[] {
  const dir = join(LOCAL_REGISTRY, "skills");
  const out: SkillCard[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const md = join(dir, name, "SKILL.md");
    if (!existsSync(md)) continue;
    try {
      const text = readFileSync(md, "utf-8");
      const idM = text.match(/^id:\s*(.+)$/m);
      const nameM = text.match(/^name:\s*(.+)$/m);
      const descM = text.match(/^description:\s*(.+)$/m);
      const id = (idM ? idM[1].trim() : `skill/${name}`).replace(/^skill\//, "");
      let description = descM ? descM[1].trim() : "";
      if (!description) {
        const body = text.split(/\n---\n/).slice(1).join("\n---\n") || text;
        const lines = body.split("\n").map((l) => l.trim());
        const h1 = lines.findIndex((l) => l.startsWith("# "));
        for (let i = h1 + 1; i < lines.length; i++) {
          if (lines[i] && !lines[i].startsWith("#") && !lines[i].startsWith(">")) { description = lines[i]; break; }
        }
      }
      out.push({ id, name: nameM ? nameM[1].trim() : name, description: description.slice(0, 160) });
    } catch { /* skip unreadable skill */ }
  }
  return out;
}

// ── scaffold a brand-new skill (currentVersion 0.0.0) so bumpSkillLocal can bump it ──
function scaffoldNewSkill(id: string, name: string, finding: string, capsuleRef: string, sessionId: string, project: string) {
  const dir = join(LOCAL_REGISTRY, "skills", id);
  mkdirSync(dir, { recursive: true });
  const md = `---
name: ${name}
id: skill/${id}
currentVersion: 0.0.0
scope: enterprise
adoptionPolicy: auto
optedIn: true
description: ${finding.replace(/\n/g, " ").slice(0, 200)}
useCases: [ "Multi-agent coding workflows", "Context handoff between sessions/agents", "Local RL skill-evolution loops" ]
---

# ${name}  \`skill/${id}@0.0.0\`

${finding}

## Use cases

- Multi-agent coding workflows
- Context handoff between sessions/agents
- Local RL skill-evolution loops

## Capsule provenance (minted version)

Minted from a **real Claude Code coding session** (ambient-captured on close), capsule \`${capsuleRef}\`
(session \`${sessionId.slice(0, 8)}\`, project \`${project}\`), distilled locally via Ollama \`${OLLAMA_MODEL}\`.
This is the genesis version; the first bump publishes it.
`;
  writeFileSync(join(dir, "SKILL.md"), md, "utf8");
}

// ── THE PIPELINE for a single session (mirrors capture-this-session.ts, generalized) ──
async function processSession(sessionPath: string, ledger: Ledger): Promise<void> {
  const sessionId = sessionPath.split(/[\\/]/).pop()!.replace(/\.jsonl$/, "");
  const project = sessionPath.split(/[\\/]/).slice(-2, -1)[0] || "unknown";
  const capsuleRef = `CAP-SESSION-${sessionId.slice(0, 8)}`;

  // CLAIM FIRST (at-most-once): persist a "processing" record before any git/model work so a crash
  // mid-pipeline can never cause a duplicate skill bump on restart.
  ledger[sessionId] = { sessionId, path: sessionPath, status: "processing", claimedAt: new Date().toISOString() };
  saveLedger(ledger);
  log(`=== processing ${sessionId.slice(0, 8)} (project=${project}) ===`);

  try {
    if (!existsSync(sessionPath)) { throw new Error(`session jsonl not found: ${sessionPath}`); }
    const sizeKB = Math.round(readFileSync(sessionPath).length / 1024);
    if (sizeKB < MIN_SESSION_KB) {
      ledger[sessionId] = { ...ledger[sessionId], status: "skipped", finishedAt: new Date().toISOString(), error: `too small (${sizeKB}KB < ${MIN_SESSION_KB}KB)` };
      saveLedger(ledger);
      log(`skip ${sessionId.slice(0, 8)}: too small (${sizeKB}KB)`);
      return;
    }

    // 1) CAPTURE — compress, then CAP the model input to the last ~50KB (honest truncation).
    const fullRaw = captureSession(sessionPath, 1_000_000);
    let fedTranscript = fullRaw.transcript;
    let truncated = false;
    if (fedTranscript.length > OLLAMA_CAP_CHARS) { fedTranscript = fullRaw.transcript.slice(-OLLAMA_CAP_CHARS); truncated = true; }
    log(`captured: messages=${fullRaw.messages} tools=${fullRaw.tools} durationMin=${fullRaw.durationMin} files=${fullRaw.filesTouched.length}; fed=${fedTranscript.length} chars${truncated ? ` (TRUNCATED to last ${OLLAMA_CAP_CHARS})` : ""}`);
    const raw: RawSession = { ...fullRaw, project, transcript: fedTranscript };

    // 2) DISTILL (local Ollama) -> capsule, then SCORE (measured).
    const { capsule, engine, ms } = await distill(raw);
    capsule.project = project;
    capsule.session_id = sessionId.slice(0, 8);
    const score = scoreCapsule(capsule);
    const transferScore = score.overall;
    log(`distilled via ${engine} in ${ms}ms; transferScore(MEASURED)=${transferScore} verdict="${score.verdict}"`);

    // 3) FINDING — one reusable, non-obvious lesson (LLM-judged).
    const fres = await ollamaChat(
      'You distill engineering sessions. Output STRICT JSON {"finding": string}: ONE concrete sentence stating the single most important, reusable, non-obvious lesson a future engineer/agent should remember from this work.',
      `Intent: ${capsule.intent}\nState: ${capsule.current_state}\nDecisions: ${capsule.decisions.map((d) => `${d.what} (because ${d.why})`).join("; ")}\nGotchas: ${capsule.gotchas.join("; ")}\nMental model: ${Object.entries(capsule.mental_model).map(([k, v]) => `${k}=${v}`).join("; ")}`,
      200,
    );
    let finding = (parseJsonLoose<{ finding: string }>(fres)?.finding || "").trim();
    if (!finding) finding = capsule.decisions[0]?.what || capsule.intent || `Reusable insight from ${project}`;
    log(`finding(LLM-judged): ${finding}`);

    // novelty — DERIVED heuristic (NOT measured), same shape as build-real-dataset.
    const lenBonus = (Math.min(finding.length, 160) / 160) * 20;
    const novelty = clamp(38 + capsule.gotchas.length * 7 + capsule.tried_and_rejected.length * 6 + lenBonus + (100 - transferScore) * 0.18);
    log(`novelty(DERIVED)=${novelty}`);

    // 4) ROUTE — local-Ollama classification against the LOCAL registry's real skills (LLM-judged).
    const skills = loadRegistrySkills();
    const skillList = skills.map((s) => `${s.id} :: ${s.name} — ${s.description}`).join("\n");
    const cres = await ollamaChat(
      'You curate a library of reusable enterprise engineering SKILLS. Given a lesson from a coding session and the EXISTING skills, decide where it belongs. Return STRICT JSON {"match":"existing"|"new","skillId":kebab-case string (no "skill/" prefix),"skillName":string under 4 words,"bump":"major"|"minor"|"patch","changelog":string}. If the lesson genuinely fits an existing skill, set match="existing", REUSE that exact skillId, and pick minor or patch. Only if NO existing skill is a genuine fit, set match="new", invent a precise kebab skillId, and use major.',
      `Lesson: ${finding}\nSession is about: building a Next.js app via a multi-agent CAPSULE pipeline that captures Claude Code sessions, distills them with a local model, routes findings into versioned skills, and commits skill upgrades to a local git registry.\n\nExisting skills:\n${skillList}`,
      280,
    );
    const routed = parseJsonLoose<{ match: string; skillId: string; skillName: string; bump: Bump; changelog: string }>(cres);
    let skillId = (routed?.skillId || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^skill-?/, "");
    const known = new Set(skills.map((s) => s.id));
    let isNew = routed?.match === "new" || !known.has(skillId);
    if (!skillId) { skillId = "multi-agent-orchestration"; isNew = true; }
    if (isNew && known.has(skillId)) isNew = false;
    let bump: Bump = (routed?.bump === "major" || routed?.bump === "minor" || routed?.bump === "patch") ? routed.bump : (isNew ? "major" : "minor");
    if (isNew) bump = "major";
    const skillName = (routed?.skillName || skillId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())).slice(0, 40);
    const changelog = (routed?.changelog || finding).replace(/\n/g, " ").slice(0, 180);
    log(`routed -> skill/${skillId} (${skillName}) match=${isNew ? "NEW(minted)" : "EXISTING"} bump=${bump}`);

    // 5) STORE — distilled briefing to LIVE Backboard (never the raw transcript).
    const briefing = `${capsuleMemoryBriefing(capsule)}\n\nFINDING: ${finding}\nTransferScore(MEASURED): ${transferScore}/100 · novelty(DERIVED): ${novelty} · routed -> skill/${skillId} (${bump})\nCapsuleRef: ${capsuleRef} · ambient-capture`;
    const store = await storeCapsuleMemory(BACKBOARD_PROJECT_KEY, briefing);
    log(`backboard: ok=${store.ok} thread_id=${store.thread_id || "(none)"} message_id=${store.message_id || "(none)"}`);

    // 6) GATE + BUMP — keep if transferScore>=50 OR novelty>=80; bump the LOCAL registry.
    const kept = transferScore >= 50 || novelty >= 80;
    log(`GATE: transfer=${transferScore} novelty=${novelty} -> ${kept ? "KEEP" : "SKIP"} (rule: transfer>=50 OR novelty>=80)`);

    let bumpResult: { skillId: string; newVersion: string; commit: string } | null = null;
    let bumpError = "";
    if (kept) {
      try {
        if (isNew) {
          scaffoldNewSkill(skillId, skillName, finding, capsuleRef, sessionId, project);
          log(`minted NEW skill scaffold skills/${skillId}/SKILL.md @0.0.0`);
        } else {
          const cv = await currentVersionLocal(skillId);
          log(`existing skill skill/${skillId} currentVersion=${cv}`);
        }
        const r = await bumpSkillLocal(skillId, bump, changelog, capsuleRef);
        bumpResult = r;
        log(`LOCAL bump: skill/${r.skillId} -> v${r.newVersion} commit=${r.commit} branch=${LOCAL_BRANCH} (NOT pushed)`);
      } catch (e) {
        bumpError = String(e);
        log(`bumpSkillLocal FAILED: ${bumpError}`);
      }
    }

    ledger[sessionId] = {
      ...ledger[sessionId],
      status: kept ? "kept" : "skipped",
      finishedAt: new Date().toISOString(),
      transferScore, novelty,
      skill: `skill/${skillId}`,
      newVersion: bumpResult?.newVersion,
      commit: bumpResult?.commit,
      error: bumpError || undefined,
    };
    saveLedger(ledger);
    log(`=== done ${sessionId.slice(0, 8)}: ${kept ? "KEPT" : "skipped-by-gate"} ===`);
  } catch (e) {
    ledger[sessionId] = { ...ledger[sessionId], status: "error", finishedAt: new Date().toISOString(), error: String(e) };
    saveLedger(ledger);
    log(`ERROR processing ${sessionId.slice(0, 8)}: ${String(e)}`);
  }
}

// ── candidate collection: drain the queue + scan for idle ("closed") sessions ──
function drainQueue(): string[] {
  if (!existsSync(QUEUE)) return [];
  let lines: string[] = [];
  try {
    lines = readFileSync(QUEUE, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  } catch { return []; }
  // Claim the queue by truncating it now. Anything lost here is recovered by the idle scan, so this
  // is safe even if we crash before processing.
  try { writeFileSync(QUEUE, "", "utf8"); } catch { /* ignore */ }
  return lines.map((l) => l.replace(/\\/g, "/"));
}

function idleCandidates(): string[] {
  const now = Date.now();
  const out: string[] = [];
  try {
    for (const s of listSessions(80)) {
      const age = now - s.mtime;
      if (age >= IDLE_MS && age <= MAX_IDLE_AGE_MS && s.sizeKB >= MIN_SESSION_KB) {
        out.push(s.path.replace(/\\/g, "/"));
      }
    }
  } catch (e) { log(`idle scan failed: ${String(e)}`); }
  return out;
}

// ── one watcher tick ───────────────────────────────────────────────────────────
async function tick(ledger: Ledger): Promise<void> {
  refreshLock();
  const fromQueue = drainQueue();
  const fromIdle = idleCandidates();

  // Merge + dedup by sessionId; queue entries take priority but both go through the same ledger gate.
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const p of [...fromQueue, ...fromIdle]) {
    const sid = p.split(/[\\/]/).pop()!.replace(/\.jsonl$/, "");
    if (seen.has(sid)) continue;
    seen.add(sid);
    if (ledger[sid]) continue; // already processed/claimed — at-most-once
    candidates.push(p);
  }

  if (candidates.length === 0) return;
  log(`tick: ${candidates.length} new session(s) (queue=${fromQueue.length} idle=${fromIdle.length})`);

  // THROTTLE — one at a time, sequentially, so we never hammer Ollama or the git registry.
  for (const p of candidates) {
    await processSession(p, ledger);
  }
}

// ── main loop ──────────────────────────────────────────────────────────────────
let running = true;
async function main() {
  mkdirSync(CAPSULE_DIR, { recursive: true });
  if (!acquireLock()) process.exit(0);
  loadEnv();
  const keyLen = (process.env.BACKBOARD_API_KEY || "").length;
  log(`START capture-watcher  model=${OLLAMA_MODEL}  poll=${POLL_MS}ms idle=${IDLE_MS}ms  backboard=${keyLen ? `key-present(${keyLen})` : "NO-KEY(local-fallback)"}`);
  log(`queue=${QUEUE}  processed=${PROCESSED}  registry=${LOCAL_REGISTRY}`);

  const shutdown = (sig: string) => { log(`received ${sig} — shutting down after current tick.`); running = false; };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  while (running) {
    const ledger = loadLedger(); // reload each tick so a manual processed.json edit is honored
    try { await tick(ledger); }
    catch (e) { log(`tick error (continuing): ${String(e)}`); }
    if (!running) break;
    await sleep(POLL_MS);
  }
  log("STOPPED capture-watcher.");
  process.exit(0);
}

main().catch((e) => { log(`FATAL ${String(e)}\n${(e as Error)?.stack || ""}`); process.exit(1); });

// ════════════════════════════════════════════════════════════════════════════════
// OPERATIONS — run / autostart / disable
// ════════════════════════════════════════════════════════════════════════════════
//
// RUN IN BACKGROUND (manual, simplest):
//   cd C:/Users/deepc/relay
//   start /b npx tsx scripts/capture-watcher.ts        (Windows cmd — detaches)
//   # or keep a window open:  npx tsx scripts/capture-watcher.ts
//   Logs stream to C:/Users/deepc/.capsule/capture-watcher.log
//
// AUTOSTART via Windows Task Scheduler (survives reboot, runs at logon):
//   schtasks /Create /TN "CapsuleCaptureWatcher" /SC ONLOGON /RL LIMITED /F ^
//     /TR "cmd /c cd /d C:/Users/deepc/relay && npx tsx scripts/capture-watcher.ts >> C:/Users/deepc/.capsule/capture-watcher.log 2>&1"
//   Start it now without waiting for next logon:  schtasks /Run /TN "CapsuleCaptureWatcher"
//
// DISABLE / STOP:
//   - Stop the running watcher: Ctrl+C in its window, or kill the `node`/`tsx` process,
//     or delete the lock + end task:  schtasks /End /TN "CapsuleCaptureWatcher"
//   - Remove autostart entirely:   schtasks /Delete /TN "CapsuleCaptureWatcher" /F
//   - Disable AMBIENT enqueue (stop new sessions being queued): remove the capture-enqueue
//     entry from hooks.Stop in C:/Users/deepc/.claude/settings.json (see that file). The
//     watcher then only processes whatever is already queued / still idle-scannable.
//   - Re-process a specific session: delete its sessionId key from
//     C:/Users/deepc/.capsule/processed.json and re-enqueue it (or wait for the idle scan).
//
// SINGLE INSTANCE: a lock file C:/Users/deepc/.capsule/watcher.lock prevents two watchers running
// at once; it is refreshed every tick and considered stale after ~6 polls. Delete it if a crashed
// instance left it behind and a new one refuses to start.
