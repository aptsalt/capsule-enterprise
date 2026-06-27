// CAPTURE-THIS-SESSION — run the REAL CAPSULE pipeline over the *currently live*
// Claude Code session and land the upgrade in the LOCAL registry.
//
//   capture (this session jsonl)            -> src/lib/capture.ts
//     -> cap to a safe local-context budget (last ~50KB of the compressed transcript)
//   distill (LOCAL Ollama qwen2.5-coder:14b) -> src/lib/cerebras.ts  (real Handoff Capsule)
//   score   (6-dim transfer)                 -> src/lib/scorer.ts     (transferScore)
//   finding (one line, local Ollama)
//   route   (local-Ollama classify against the LOCAL registry's skills; mint if none fits)
//   gate    (keep if transferScore>=50 OR novelty>=80)
//   store   (DISTILLED briefing -> LIVE Backboard thread) -> src/lib/backboard.ts
//   bump    (if kept) bumpSkillLocal(...) -> src/lib/local-registry.ts (local-deepak commit, NOT pushed)
//
// Honest: novelty is DERIVED (not measured); only the distilled briefing (never the raw
// transcript) is sent to Backboard; the transcript fed to the local model is TRUNCATED to
// the last ~50KB and that truncation is reported.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { captureSession, type RawSession } from "../src/lib/capture";
import { distillChunked, OLLAMA_MODEL } from "../src/lib/cerebras";
import { scoreCapsuleLLM } from "../src/lib/scorer";
import { capsuleMemoryBriefing, storeCapsuleMemory } from "../src/lib/backboard";
import { bumpSkillLocal, LOCAL_REGISTRY, LOCAL_BRANCH, currentVersionLocal } from "../src/lib/local-registry";
import type { Bump } from "../src/lib/types";

// ── constants ───────────────────────────────────────────────────────────────────
const ROOT = join(__dirname, "..");
const LOG = join(ROOT, "scripts", "capture-this-session.log");
const OLLAMA = process.env.OLLAMA_URL || "http://localhost:11434";
const SESSION_ID = "1a6fcc9b-b319-4ccf-b50e-3a6e31f968fc";
const SESSION_PATH = `C:/Users/deepc/.claude/projects/C--Users-deepc/${SESSION_ID}.jsonl`;
const CAPSULE_REF = "CAP-SESSION-1a6fcc9b";
const PROJECT = "relay";
const BACKBOARD_PROJECT_KEY = "relay-self-capture";
const OLLAMA_CAP_CHARS = 50_000; // ~16k tokens — safe for the local 14b model

// ── logging ───────────────────────────────────────────────────────────────────
writeFileSync(LOG, "");
function log(s: string) {
  const line = `[${new Date().toISOString()}] ${s}\n`;
  appendFileSync(LOG, line);
  process.stdout.write(line);
}

// ── load .env.local (BACKBOARD_API_KEY) — same loader shape as build-real-dataset ──
function loadEnv() {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) { log("WARN no .env.local found"); return; }
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

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// ── local-Ollama chat helper (json mode, small num_predict) ───────────────────────
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
    const j = await res.json();
    return j.message?.content || "";
  } catch (e) { log(`ollamaChat error: ${String(e)}`); return ""; }
  finally { clearTimeout(timer); }
}

function parseJsonLoose<T>(text: string): T | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

// ── load the LOCAL registry's skills (id + name + short description) for routing ───
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
        // first non-empty body line after the H1 heading
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
function scaffoldNewSkill(id: string, name: string, finding: string) {
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

Minted from a **real Claude Code coding session**, capsule \`${CAPSULE_REF}\`
(session \`${SESSION_ID.slice(0, 8)}\`, project \`${PROJECT}\`), distilled locally
via Ollama \`${OLLAMA_MODEL}\`. This is the genesis version; the first bump publishes it.
`;
  writeFileSync(join(dir, "SKILL.md"), md, "utf-8");
}

// ── main ───────────────────────────────────────────────────────────────────────
async function main() {
  loadEnv();
  const keyLen = (process.env.BACKBOARD_API_KEY || "").length;
  log(`START capture-this-session  model=${OLLAMA_MODEL}  backboard=${keyLen ? `key-present(${keyLen})` : "NO-KEY"}`);

  if (!existsSync(SESSION_PATH)) { log(`FATAL session jsonl not found: ${SESSION_PATH}`); log("DONE"); return; }
  const sizeKB = Math.round(readFileSync(SESSION_PATH).length / 1024);
  log(`session jsonl = ${sizeKB}KB`);

  // 1) CAPTURE — compress the live transcript, then CAP the model input to the last ~50KB.
  log(`[1/6] capturing live session ${SESSION_ID} ...`);
  const fullRaw = captureSession(SESSION_PATH, 1_000_000); // large budget -> near-full compressed transcript
  const fullLen = fullRaw.transcript.length;
  let fedTranscript = fullRaw.transcript;
  let truncated = false;
  if (fedTranscript.length > OLLAMA_CAP_CHARS) {
    fedTranscript = fullRaw.transcript.slice(-OLLAMA_CAP_CHARS); // keep the TAIL = latest handoff state
    truncated = true;
  }
  log(`captured: messages=${fullRaw.messages} tools=${fullRaw.tools} durationMin=${fullRaw.durationMin} filesTouched=${fullRaw.filesTouched.length}`);
  log(`compressed transcript=${fullLen} chars; fed to Ollama=${fedTranscript.length} chars (${truncated ? `TRUNCATED to last ${OLLAMA_CAP_CHARS} chars (~16k tokens) — honest cap for the local 14b` : "no truncation needed"})`);

  const raw: RawSession = { ...fullRaw, project: PROJECT, transcript: fedTranscript };

  // 2) DISTILL (local Ollama) -> capsule, then SCORE.
  log(`[2/6] distilling locally via ${OLLAMA_MODEL} (may take up to ~120s) ...`);
  const { capsule, engine, ms } = await distillChunked(raw);
  capsule.project = PROJECT;
  capsule.session_id = SESSION_ID.slice(0, 8);
  const score = await scoreCapsuleLLM(capsule);
  const transferScore = score.overall;
  log(`distilled via ${engine} in ${ms}ms`);
  log(`intent: ${capsule.intent}`);
  log(`decisions=${capsule.decisions.length} gotchas=${capsule.gotchas.length} tried_rejected=${capsule.tried_and_rejected.length} mental_model=${Object.keys(capsule.mental_model).length}`);
  log(`transferScore=${transferScore}  verdict="${score.verdict}"`);

  // 3) FINDING — one reusable, non-obvious lesson (local model).
  log(`[3/6] extracting one-line finding ...`);
  const fres = await ollamaChat(
    'You distill engineering sessions. Output STRICT JSON {"finding": string}: ONE concrete sentence stating the single most important, reusable, non-obvious lesson a future engineer/agent should remember from this work.',
    `Intent: ${capsule.intent}\nState: ${capsule.current_state}\nDecisions: ${capsule.decisions.map((d) => `${d.what} (because ${d.why})`).join("; ")}\nGotchas: ${capsule.gotchas.join("; ")}\nMental model: ${Object.entries(capsule.mental_model).map(([k, v]) => `${k}=${v}`).join("; ")}`,
    200,
  );
  let finding = (parseJsonLoose<{ finding: string }>(fres)?.finding || "").trim();
  if (!finding) finding = capsule.decisions[0]?.what || capsule.intent || `Reusable insight from ${PROJECT}`;
  log(`finding: ${finding}`);

  // DERIVED novelty (honest: not measured) — same heuristic as build-real-dataset.
  const lenBonus = Math.min(finding.length, 160) / 160 * 20;
  const novelty = clamp(38 + capsule.gotchas.length * 7 + capsule.tried_and_rejected.length * 6 + lenBonus + (100 - transferScore) * 0.18);
  log(`novelty(DERIVED)=${novelty}`);

  // 4) ROUTE — local-Ollama classification against the LOCAL registry's real skills.
  log(`[4/6] routing finding against LOCAL registry skills ...`);
  const skills = loadRegistrySkills();
  log(`registry skills available: ${skills.length}`);
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
  // Guard: if the model said "existing" but gave an unknown id, fall back to a sensible mint.
  if (!skillId) { skillId = "multi-agent-orchestration"; isNew = true; }
  if (isNew && known.has(skillId)) isNew = false;
  let bump: Bump = (routed?.bump === "major" || routed?.bump === "minor" || routed?.bump === "patch") ? routed.bump : (isNew ? "major" : "minor");
  if (isNew) bump = "major"; // genesis version of a brand-new skill
  const skillName = (routed?.skillName || skillId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())).slice(0, 40);
  const changelog = (routed?.changelog || finding).replace(/\n/g, " ").slice(0, 180);
  log(`routed -> skill/${skillId} (${skillName}) match=${isNew ? "NEW (minted)" : "EXISTING"} bump=${bump}`);
  log(`changelog: ${changelog}`);

  // 5) STORE — distilled briefing to LIVE Backboard (never the raw transcript).
  log(`[5/6] storing distilled briefing to Backboard ...`);
  const briefing = `${capsuleMemoryBriefing(capsule)}\n\nFINDING: ${finding}\nTransferScore: ${transferScore}/100 · novelty(DERIVED): ${novelty} · routed -> skill/${skillId} (${bump})\nCapsuleRef: ${CAPSULE_REF}`;
  const store = await storeCapsuleMemory(BACKBOARD_PROJECT_KEY, briefing);
  const threadId = store.ok ? (store.thread_id || "(no-id)") : `local-fallback`;
  log(`backboard: ok=${store.ok} thread_id=${store.thread_id || "(none)"} message_id=${store.message_id || "(none)"}`);

  // 6) GATE + BUMP — keep if transferScore>=50 OR novelty>=80; bump the LOCAL registry.
  const kept = transferScore >= 50 || novelty >= 80;
  log(`[6/6] GATE: transferScore=${transferScore} novelty=${novelty} -> ${kept ? "KEEP" : "SKIP"} (rule: transfer>=50 OR novelty>=80)`);

  let bumpResult: { skillId: string; newVersion: string; commit: string } | null = null;
  let bumpError = "";
  if (kept) {
    try {
      if (isNew) {
        log(`minting NEW skill scaffold skills/${skillId}/SKILL.md @0.0.0 before bump ...`);
        scaffoldNewSkill(skillId, skillName, finding);
      } else {
        const cv = await currentVersionLocal(skillId);
        log(`existing skill skill/${skillId} currentVersion=${cv}`);
      }
      const r = await bumpSkillLocal(skillId, bump, changelog, CAPSULE_REF);
      bumpResult = r;
      log(`LOCAL bump: skill/${r.skillId} -> v${r.newVersion}  commit=${r.commit}  branch=${LOCAL_BRANCH} (NOT pushed)`);
    } catch (e) {
      bumpError = String(e);
      log(`bumpSkillLocal FAILED: ${bumpError}`);
    }
  } else {
    log(`gate skipped the bump — capsule stored to Backboard only, no skill upgrade.`);
  }

  // ── final honest report block ──
  log("==== REPORT ====");
  log(JSON.stringify({
    capsuleRef: CAPSULE_REF,
    project: PROJECT,
    session: SESSION_ID.slice(0, 8),
    intent: capsule.intent,
    finding,
    transferScore,
    novelty_DERIVED: novelty,
    kept,
    truncatedTranscript: truncated,
    fedChars: fedTranscript.length,
    compressedChars: fullLen,
    distillEngine: engine,
    backboard: { ok: store.ok, threadId: store.thread_id || null, messageId: store.message_id || null },
    route: { skillId: `skill/${skillId}`, skillName, isNew, bump },
    localRegistry: bumpResult
      ? { branch: LOCAL_BRANCH, skill: `skill/${bumpResult.skillId}`, newVersion: bumpResult.newVersion, commit: bumpResult.commit, pushed: false }
      : (kept ? { error: bumpError } : "skipped-by-gate"),
  }, null, 2));
  void threadId;
  log("DONE");
}

main().catch((e) => { log(`FATAL ${String(e)}\n${e?.stack || ""}`); log("DONE"); });
