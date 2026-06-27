// upgrade-dee.ts — upgrade dee's pinned enterprise skills from the user's REAL recent sessions.
//
// Pipeline (all distillation/classification is LOCAL Ollama qwen2.5-coder:14b):
//   1. List real ~/.claude sessions and take a BROADER window — the LAST 90 DAYS, sampled
//      PROJECT-BALANCED (top few per project) so app/backend sessions actually get distilled
//      instead of the corpus collapsing onto a handful of giant home-dir content mega-sessions.
//      Distill the most substantial ~10-14 across the corpus.
//   2. Distill each -> real Handoff Capsules + 6-dim transfer scores + one crisp one-line finding
//      (a second local-LLM pass).
//   3. Classify each finding against dee's 5 PINNED skills (rest-api-design, oauth2-jwt-auth,
//      idempotency-keys, cursor-pagination, redis-caching) with a STRICT local-Ollama classifier.
//      Two honesty guards on top of the classifier:
//        (a) a DOMAIN-KEYWORD gate — the finding text must actually mention the matched skill's
//            domain, else the match is rejected as a hallucination;
//        (b) an ALREADY-LEARNED guard — a finding that re-states a lesson the skill already minted
//            (same source session, or near-duplicate finding) is dropped so we don't redo work.
//      A finding that fits none is SKIPPED honestly.
//   4. For EVERY dee skill with >=1 GENUINE match (1..5 of them — no artificial cap), mint a NEW
//      version (minor/patch via the bump rule) carrying learnedFrom {capsule, finding}, and STORE
//      the capsule briefing to live Backboard (X-API-Key from .env.local).
//   5. Emit scripts/upgrade-dee.result.json for the repo-update step. Log to scripts/upgrade-dee.log,
//      final line "DONE".
//
// Run in background:  npx tsx scripts/upgrade-dee.ts   (poll scripts/upgrade-dee.log for "DONE")

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { listSessions, captureSession, type RawSession, type SessionMeta } from "../src/lib/capture";
import { distill, OLLAMA_MODEL } from "../src/lib/cerebras";
import { scoreCapsule } from "../src/lib/scorer";
import { capsuleToBriefing, type HandoffCapsule } from "../src/lib/capsule";
import { storeCapsuleMemory } from "../src/lib/backboard";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RELAY_ROOT = join(__dirname, "..");
const LOG = join(__dirname, "upgrade-dee.log");
const RESULT = join(__dirname, "upgrade-dee.result.json");

// ── tiny logger ──────────────────────────────────────────────────────────────
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOG, line + "\n"); } catch { /* never throw on log */ }
}

// ── load .env.local so the standalone script has the Backboard key ─────────────
function loadEnv() {
  const p = join(RELAY_ROOT, ".env.local");
  if (!existsSync(p)) { log(`WARN: ${p} not found`); return; }
  for (const raw of readFileSync(p, "utf-8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
}

const OLLAMA_BASE = process.env.OLLAMA_URL || "http://localhost:11434";

// generic local-Ollama JSON call (used for finding + classification passes)
async function ollamaJson<T>(system: string, user: string, timeoutMs = 90_000): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL, stream: false, format: "json",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        options: { temperature: 0.1 },
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const content: string = j.message?.content || "";
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]) as T;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// ── dee's 5 PINNED skills (from my-project/capsule.lock) ───────────────────────
// NOTE: rest-api-design is ALREADY at 1.0.1 from a prior real session (12560ca4 / CAP-DEE-01).
// Its current version below reflects that so any further bump starts from 1.0.1 — and the
// already-learned guard prevents re-minting the same rate-limit lesson.
type PinnedSkill = { id: string; name: string; version: string; description: string; keywords: RegExp };
const DEE_PINNED: PinnedSkill[] = [
  { id: "rest-api-design", name: "REST API Design", version: "1.0.1",
    description: "Resource-oriented HTTP API design: correct verbs/status codes, versioning at the edge, consistent error envelopes, rate-limit (429/Retry-After) handling, pagination of collections.",
    keywords: /\b(rest|http|api endpoint|endpoint|route|verb|status code|404|409|422|429|retry-after|rate[ -]?limit|throttl|error envelope|openapi|resource-oriented|versioning)\b/i },
  { id: "oauth2-jwt-auth", name: "OAuth2 / JWT Auth", version: "1.0.0",
    description: "OAuth2 flows (Auth Code+PKCE, Client Credentials) and full JWT validation: signature via JWKS, iss/aud/exp checks, short-lived access + rotated refresh tokens, auth/login/session security.",
    keywords: /\b(oauth|jwt|json web token|jwks|access token|refresh token|bearer|pkce|auth(entication|orization)?|login|sign-?in|session|credential|claims|scope|rbac)\b/i },
  { id: "idempotency-keys", name: "Idempotency Keys", version: "1.0.0",
    description: "Make unsafe POST/payment/mutation operations safe to retry by deduplicating on a client-supplied Idempotency-Key; store and replay first response; exactly-once effects.",
    keywords: /\b(idempoten|idempotency-key|dedupe|deduplicat|exactly-once|at-least-once|safe to retry|replay|double[- ]?charge|double[- ]?submit|retry the same)\b/i },
  { id: "cursor-pagination", name: "Cursor Pagination", version: "1.0.0",
    description: "Keyset/cursor pagination over large mutating datasets instead of LIMIT/OFFSET: opaque cursors, stable sort tuple, indexed range scans, avoid deep-page drift/slowdown.",
    keywords: /\b(paginat|cursor|keyset|offset|limit\/offset|page token|next page|seek method|deep page|infinite scroll|load more)\b/i },
  { id: "redis-caching", name: "Redis Caching", version: "1.0.0",
    description: "Redis cache layer: cache-aside reads, TTLs + key namespacing, explicit invalidation on write, stampede protection, atomic counters; any caching/performance/memoization work.",
    keywords: /\b(redis|cache|caching|cache-aside|ttl|invalidat|memoiz|stampede|key namespac|eviction|warm cache|cold cache|hit rate|in-memory store)\b/i },
];

// ── already-learned guard ──────────────────────────────────────────────────────
// Lessons a skill has ALREADY minted in a prior real run. A new match is dropped if it
// re-uses the same source session for that skill, or its finding is a near-duplicate.
const ALREADY_LEARNED: Record<string, { sessions: string[]; findings: string[] }> = {
  "rest-api-design": {
    sessions: ["12560ca4-a543-4cec-9ef6-a07c2e116054"],
    findings: ["Implement rate limiting handling in your application to gracefully manage API errors due to server limitations."],
  },
};
function tokenize(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3));
}
function jaccard(a: string, b: string): number {
  const A = tokenize(a), B = tokenize(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
function alreadyLearned(skillId: string, sessionId: string, finding: string): boolean {
  const al = ALREADY_LEARNED[skillId];
  if (!al) return false;
  if (al.sessions.includes(sessionId)) return true;
  return al.findings.some((f) => jaccard(f, finding) >= 0.5);
}

// ── bump rule ──────────────────────────────────────────────────────────────────
// MINOR when the finding adds genuinely NEW, transferable guidance to the skill
// (clear classifier fit AND a solid transfer score) — a new behaviour the skill should teach.
// PATCH otherwise — a refinement/clarification of existing guidance.
function bumpFor(confidence: number, transferScore: number): "minor" | "patch" {
  return confidence >= 0.66 && transferScore >= 55 ? "minor" : "patch";
}
function applyBump(version: string, bump: "minor" | "patch"): string {
  const [maj, min, pat] = version.split(".").map(Number);
  return bump === "minor" ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
}

type Distilled = {
  session: RawSession;
  capsule: HandoffCapsule;
  transferScore: number;
  engine: string;
  finding: string;
};
type Match = {
  skill: PinnedSkill;
  confidence: number;
  reason: string;
  d: Distilled;
  matchStrength: number;
};

// ── project-balanced candidate selection over a broad window ────────────────────
// Round-robin across projects (largest session first within each) so one giant project
// can't crowd out the app/backend sessions where dee's API/auth/caching/pagination/
// idempotency lessons would live — BUT keep topping up until we reach `target` so a corpus
// concentrated in one project still yields a broad ~10-14-session sample rather than collapsing.
function pickCandidates(recent: SessionMeta[], target: number): SessionMeta[] {
  const byProject = new Map<string, SessionMeta[]>();
  for (const s of recent) {
    const arr = byProject.get(s.project) || [];
    arr.push(s);
    byProject.set(s.project, arr);
  }
  // each project's sessions, largest first; projects ordered by their biggest session.
  const queues = [...byProject.values()].map((arr) => arr.sort((a, b) => b.sizeKB - a.sizeKB));
  queues.sort((a, b) => (b[0]?.sizeKB || 0) - (a[0]?.sizeKB || 0));
  const out: SessionMeta[] = [];
  let drained = false;
  while (out.length < target && !drained) {
    drained = true;
    for (const q of queues) {
      const next = q.shift();
      if (next) { out.push(next); drained = false; if (out.length >= target) break; }
    }
  }
  return out;
}

async function main() {
  writeFileSync(LOG, "");
  loadEnv();
  log(`upgrade-dee start · distiller=${OLLAMA_MODEL} · backboard_key=${process.env.BACKBOARD_API_KEY ? "loaded" : "MISSING"}`);

  // 1) real sessions, BROADER window: last 90 days by mtime
  const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - NINETY_DAYS;
  const all = listSessions(2000);
  const recent = all.filter((s) => s.mtime >= cutoff);
  const projectsSeen = new Set(recent.map((s) => s.project));
  log(`sessions: ${recent.length}/${all.length} within last 90 days across ${projectsSeen.size} projects (cutoff ${new Date(cutoff).toISOString()})`);
  if (!recent.length) { log("no recent sessions — nothing to do"); writeResult([], []); log("DONE"); return; }

  // project-balanced round-robin sampling -> capture -> rank by substance -> most-substantial ~14
  const TARGET = 14;
  const candidates = pickCandidates(recent, TARGET);
  log(`project-balanced candidates: ${candidates.length} (round-robin across ${projectsSeen.size} project(s), target ${TARGET})`);
  const captured = candidates
    .map((m) => { try { return captureSession(m.path); } catch { return null; } })
    .filter((r): r is RawSession => !!r && r.messages > 4)
    .map((r) => ({ r, substance: r.messages + r.tools * 2 }))
    .sort((a, b) => b.substance - a.substance)
    .slice(0, TARGET)
    .map((x) => x.r);
  const projDist = captured.reduce<Record<string, number>>((acc, c) => { acc[c.project] = (acc[c.project] || 0) + 1; return acc; }, {});
  log(`distilling ${captured.length} most-substantial sessions across ${Object.keys(projDist).length} projects: ${Object.entries(projDist).map(([p, n]) => `${p}×${n}`).join(", ")}`);
  log(`  -> ${captured.map((c) => `${c.project}/${c.sessionId.slice(0, 8)}(${c.messages}m/${c.tools}t)`).join(", ")}`);

  // 2) distill + score + one-line finding
  const distilled: Distilled[] = [];
  for (const session of captured) {
    log(`  distilling ${session.project}/${session.sessionId.slice(0, 8)} (${session.transcript.length} chars)…`);
    const { capsule, engine } = await distill(session);
    capsule.handoff_score = scoreCapsule(capsule);
    const transferScore = capsule.handoff_score.overall;

    const findingObj = await ollamaJson<{ finding: string }>(
      "You distill ONE reusable engineering lesson from a coding-session capsule. Return STRICT JSON only.",
      `Capsule (JSON):\n${JSON.stringify({
        intent: capsule.intent, decisions: capsule.decisions, gotchas: capsule.gotchas,
        tried_and_rejected: capsule.tried_and_rejected, mental_model: capsule.mental_model,
        files: capsule.files_touched.slice(0, 12),
      })}\n\nReturn {"finding": "<one imperative sentence, concrete and reusable, <=240 chars, the single most transferable backend/API/engineering lesson from this session>"}.`,
    );
    const finding = (findingObj?.finding || capsule.intent || `Work on ${session.project}`).trim().slice(0, 240);
    log(`    engine=${engine} transfer=${transferScore}/100 finding="${finding}"`);
    distilled.push({ session, capsule, transferScore, engine, finding });
  }

  // 3) classify each finding -> best of dee's 5 pinned skills (or none), then honesty guards
  const skillList = DEE_PINNED.map((s) => `- ${s.id}: ${s.description}`).join("\n");
  const matches: Match[] = [];
  for (const d of distilled) {
    const cls = await ollamaJson<{ skillId: string; confidence: number; reason: string }>(
      "You are a STRICT classifier mapping an engineering lesson to AT MOST ONE skill. Only match when the lesson genuinely and specifically belongs to that skill's domain; when the fit is loose, generic, or off-topic, return skillId \"none\". Do NOT force a match. Return STRICT JSON only.",
      `Skills:\n${skillList}\n- none: the lesson does not clearly belong to any skill above.\n\nLesson: "${d.finding}"\n\nReturn {"skillId": "<one id from the list or 'none'>", "confidence": <0..1>, "reason": "<short why>"}.`,
    );
    const skillId = (cls?.skillId || "none").trim();
    const confidence = Math.max(0, Math.min(1, Number(cls?.confidence) || 0));
    const reason = (cls?.reason || "").slice(0, 200);
    const skill = DEE_PINNED.find((s) => s.id === skillId);

    if (!skill || skillId === "none" || confidence < 0.5) {
      log(`  MATCH ${d.session.sessionId.slice(0, 8)} -> none (skillId=${skillId} conf=${confidence.toFixed(2)}) — skipped honestly`);
      continue;
    }
    // honesty guard (a): the finding must actually mention the skill's domain vocabulary.
    if (!skill.keywords.test(d.finding)) {
      log(`  MATCH ${d.session.sessionId.slice(0, 8)} -> ${skillId} REJECTED (conf=${confidence.toFixed(2)}) — finding has no ${skillId} domain keywords (classifier over-reach)`);
      continue;
    }
    // honesty guard (b): don't re-mint a lesson the skill already learned.
    if (alreadyLearned(skillId, d.session.sessionId, d.finding)) {
      log(`  MATCH ${d.session.sessionId.slice(0, 8)} -> ${skillId} SKIPPED — already learned (same session or near-duplicate finding); not redoing`);
      continue;
    }
    // matchStrength blends classifier confidence with the real transfer score of the capsule
    const matchStrength = Math.round(confidence * 70 + d.transferScore * 0.3);
    log(`  MATCH ${d.session.sessionId.slice(0, 8)} -> ${skillId} conf=${confidence.toFixed(2)} strength=${matchStrength} :: ${reason}`);
    matches.push({ skill, confidence, reason, d, matchStrength });
  }

  // keep each skill's STRONGEST match (a skill is upgraded at most once). NO artificial cap —
  // upgrade EVERY skill that earned a genuine match (the count may honestly be 0..5).
  const bestPerSkill = new Map<string, Match>();
  for (const m of matches.sort((a, b) => b.matchStrength - a.matchStrength)) {
    if (!bestPerSkill.has(m.skill.id)) bestPerSkill.set(m.skill.id, m);
  }
  const chosen = [...bestPerSkill.values()].sort((a, b) => b.matchStrength - a.matchStrength);
  log(`chosen ${chosen.length} skill(s) to upgrade: ${chosen.map((c) => `${c.skill.id}(${c.matchStrength})`).join(", ") || "(none)"}`);
  const noMatch = DEE_PINNED.filter((s) => !bestPerSkill.has(s.id)).map((s) => `${s.id}@${s.version}`);
  log(`no genuine match (left as-is): ${noMatch.join(", ") || "(none)"}`);

  // 4) mint a new version per chosen skill + store briefing to live Backboard
  const upgrades: Record<string, unknown>[] = [];
  let seq = 1;
  for (const m of chosen) {
    const bump = bumpFor(m.confidence, m.d.transferScore);
    const newVersion = applyBump(m.skill.version, bump);
    const capsuleId = `CAP-DEE-${String(seq).padStart(2, "0")}`;
    seq++;

    const briefing =
      `SKILL UPGRADE — ${m.skill.id}@${newVersion} (was ${m.skill.version}, ${bump})\n` +
      `Capsule ${capsuleId} · real session ${m.d.session.sessionId} · project ${m.d.session.project}\n` +
      `Distilled locally via ${m.d.engine} · transfer ${m.d.transferScore}/100 · match conf ${m.confidence.toFixed(2)}\n\n` +
      `FINDING: ${m.d.finding}\n\n` +
      capsuleToBriefing(m.d.capsule);

    const projectKey = `dee-skill-${m.skill.id}`;
    log(`  storing ${capsuleId} briefing to Backboard (thread key ${projectKey})…`);
    const store = await storeCapsuleMemory(projectKey, briefing);
    log(`    backboard: ok=${store.ok} thread=${store.thread_id ?? "-"} msg=${store.message_id ?? "-"}`);

    // proxy A/B metrics (labeled as proxy in the changelog)
    const scoreDelta = Math.max(2, Math.min(18, Math.round((m.d.transferScore - 50) / 4)));
    const tokenDeltaPerUse = Math.max(200, Math.round(m.d.transferScore * 12));

    upgrades.push({
      skillId: m.skill.id,
      skillName: m.skill.name,
      fromVersion: m.skill.version,
      newVersion,
      bump,
      capsuleId,
      finding: m.d.finding,
      session: m.d.session.sessionId,
      project: m.d.session.project,
      model: `${m.d.engine}`,
      transferScore: m.d.transferScore,
      confidence: Number(m.confidence.toFixed(2)),
      matchStrength: m.matchStrength,
      reason: m.reason,
      scoreDelta,
      tokenDeltaPerUse,
      backboard: { ok: store.ok, thread_id: store.thread_id ?? null, message_id: store.message_id ?? null },
      learnedFrom: { capsule: capsuleId, finding: m.d.finding },
      publishedAt: new Date().toISOString(),
      filesTouched: m.d.capsule.files_touched.slice(0, 10),
    });
  }

  writeResult(upgrades, distilled.map((d) => ({
    session: d.session.sessionId, project: d.session.project,
    messages: d.session.messages, tools: d.session.tools, durationMin: d.session.durationMin,
    transferScore: d.transferScore, engine: d.engine, finding: d.finding,
  })), noMatch);
  log(`wrote ${RESULT}`);
  log("DONE");
}

function writeResult(upgrades: Record<string, unknown>[], distilled: unknown[], noMatch: string[] = []) {
  writeFileSync(RESULT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    distiller: OLLAMA_MODEL,
    windowDays: 90,
    deePinned: DEE_PINNED.map((s) => `${s.id}@${s.version}`),
    skillsWithNoGenuineMatch: noMatch,
    distilled,
    upgrades,
  }, null, 2));
}

main().catch((e) => { log(`FATAL ${String(e?.stack || e)}`); log("DONE"); process.exit(1); });
