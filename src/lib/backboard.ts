// STORE — persist a distilled Handoff Capsule as portable memory in Backboard.io.
// Primary: Backboard.io (memory that follows the project across sessions/models/people).
// Fallback: local JSON store under ~/.relay so the demo works without a key / when offline.
//
// ── CAPSULE × Backboard: the tenant-assistant memory model ───────────────────────────
// Backboard is CAPSULE's MEMORY COMPONENT. Capsules persist here and compound across the
// enterprise. The governing rules:
//
//   • Memory follows the ENTITY (the assistant / tenant), NOT the model. Switching the
//     underlying model (Opus → Sonnet → Haiku) keeps every capsule — the assistant carries
//     its own learned context. The capsule does not live in the model's weights, it lives
//     here, addressed by `assistant_id`.
//   • TENANT ISOLATION is the assistant. One "capsule" assistant owns its thread namespace;
//     each project maps to one thread under it, so a write/read only ever touches its own
//     project namespace.
//   • Writes use `send_to_llm:"false"` semantics: we STORE context for later retrieval, we
//     do NOT trigger a generation on write. A capsule write is a MEMORY op, not inference —
//     it costs storage, not completion tokens.
//   • We store ONLY DISTILLED capsule briefings (never raw transcripts) to limit
//     sensitive-data exposure in the durable substrate.
//
// ── REAL Backboard API (verified live) ───────────────────────────────────────────────
//   base   : https://app.backboard.io/api
//   auth   : header  X-API-Key: <key>
//   create : POST /assistants            {name, system_prompt}            -> {assistant_id}
//   write  : POST /threads/messages      {content, assistant_id,
//                                          memory:"Auto", send_to_llm:"false"
//                                          [, thread_id]}                  -> {thread_id, message_id}
//   On the FIRST write for a project we OMIT thread_id so Backboard auto-creates one, then we
//   cache + REUSE the returned thread_id for every subsequent write to that project.
// ─────────────────────────────────────────────────────────────────────────────────────
import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { HandoffCapsule } from "./capsule";
import { capsuleToBriefing } from "./capsule";

// ── Config ────────────────────────────────────────────────────────────────────────────
const BACKBOARD_BASE = process.env.BACKBOARD_BASE_URL || "https://app.backboard.io/api";
const ASSISTANT_NAME = process.env.BACKBOARD_ASSISTANT_NAME || "capsule";
const ASSISTANT_SYSTEM_PROMPT =
  "CAPSULE tenant memory assistant. Stores DISTILLED context-handoff capsules " +
  "(intent, decisions, gotchas, next steps) so the next session/agent inherits them. " +
  "Memory-only: writes never trigger a generation.";

const apiKey = (): string | undefined => process.env.BACKBOARD_API_KEY;
const bbHeaders = (): Record<string, string> => ({
  "content-type": "application/json",
  "X-API-Key": apiKey() || "",
});

// ── Local persistence ───────────────────────────────────────────────────────────────────
// Capsule snapshots (the existing demo store) + a robust fallback log of every Backboard write.
const LOCAL_DIR = join(homedir(), ".relay", "capsules");
// Assistant id + per-project thread ids — so we DON'T recreate the assistant every run.
const CACHE_DIR = join(homedir(), ".capsule");
const CACHE_FILE = join(CACHE_DIR, "backboard.json");
const FALLBACK_LOG = join(CACHE_DIR, "fallback-writes.jsonl");

type BackboardCache = { assistant_id?: string; threads: Record<string, string> };

function ensureDir(dir: string) { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); }

function readCache(): BackboardCache {
  try {
    if (existsSync(CACHE_FILE)) {
      const c = JSON.parse(readFileSync(CACHE_FILE, "utf-8")) as Partial<BackboardCache>;
      return { assistant_id: c.assistant_id, threads: c.threads || {} };
    }
  } catch { /* corrupt cache — start fresh */ }
  return { threads: {} };
}

function writeCache(c: BackboardCache) {
  ensureDir(CACHE_DIR);
  writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2));
}

function appendFallbackLog(entry: Record<string, unknown>) {
  try {
    ensureDir(CACHE_DIR);
    writeFileSync(FALLBACK_LOG, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n", { flag: "a" });
  } catch { /* logging must never throw */ }
}

// ── Briefing helper ─────────────────────────────────────────────────────────────────────
// Render a capsule into a compact, DISTILLED memory string (never the raw transcript).
export function capsuleMemoryBriefing(c: HandoffCapsule): string {
  return `CAPSULE handoff — project "${c.project}" (session ${c.session_id})\n\n${capsuleToBriefing(c)}`;
}

// ── Assistant: create-or-reuse ────────────────────────────────────────────────────────────
// Returns the cached tenant assistant id, creating the "capsule" assistant once and caching it.
// Returns null when there is no API key or creation fails (callers degrade to local store).
export async function getAssistantId(): Promise<string | null> {
  const cache = readCache();
  if (cache.assistant_id) return cache.assistant_id;
  if (!apiKey()) return null;
  try {
    const res = await fetch(`${BACKBOARD_BASE}/assistants`, {
      method: "POST",
      headers: bbHeaders(),
      body: JSON.stringify({ name: ASSISTANT_NAME, system_prompt: ASSISTANT_SYSTEM_PROMPT }),
    });
    if (!res.ok) {
      appendFallbackLog({ op: "create_assistant", ok: false, status: res.status, body: await res.text().catch(() => "") });
      return null;
    }
    const j = (await res.json().catch(() => ({}))) as { assistant_id?: string };
    if (!j.assistant_id) return null;
    cache.assistant_id = j.assistant_id;
    writeCache(cache);
    return j.assistant_id;
  } catch (e) {
    appendFallbackLog({ op: "create_assistant", ok: false, error: String(e) });
    return null;
  }
}

// ── Store a distilled capsule briefing as Backboard memory ────────────────────────────────
// One thread per projectKey: omit thread_id on the first write (Backboard auto-creates),
// then cache + reuse the returned thread_id for every later write. Never throws.
export type StoreMemoryResult = { ok: boolean; thread_id?: string; message_id?: string };

export async function storeCapsuleMemory(projectKey: string, briefing: string): Promise<StoreMemoryResult> {
  try {
    const assistant_id = await getAssistantId();
    if (!assistant_id) {
      appendFallbackLog({ op: "store_memory", ok: false, reason: "no_assistant", projectKey, briefing });
      return { ok: false };
    }
    const cache = readCache();
    const cachedThread = cache.threads[projectKey];

    const body: Record<string, unknown> = {
      content: briefing,
      assistant_id,
      memory: "Auto",
      send_to_llm: "false",
    };
    if (cachedThread) body.thread_id = cachedThread; // omit on first write -> auto-create

    const res = await fetch(`${BACKBOARD_BASE}/threads/messages`, {
      method: "POST",
      headers: bbHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      appendFallbackLog({ op: "store_memory", ok: false, status: res.status, projectKey, body: await res.text().catch(() => "") });
      return { ok: false };
    }
    const j = (await res.json().catch(() => ({}))) as { thread_id?: string; message_id?: string };
    const thread_id = j.thread_id || cachedThread;
    if (thread_id && thread_id !== cachedThread) {
      cache.threads[projectKey] = thread_id;
      writeCache(cache);
    }
    return { ok: true, thread_id, message_id: j.message_id };
  } catch (e) {
    appendFallbackLog({ op: "store_memory", ok: false, error: String(e), projectKey, briefing });
    return { ok: false };
  }
}

// ── Retrieve: read live Backboard memory (the warm-start path) ──────────────────────────────
// The READ side of the tenant memory. POST /threads/messages with memory:"Auto" and
// send_to_llm:"false" asks Backboard to surface the distilled memories it has stored for this
// assistant that are relevant to `query` — WITHOUT triggering a generation (send_to_llm:"false"
// means this is a memory op, never billed inference). The response carries `retrieved_memories`;
// because memory follows the ENTITY (the "capsule" assistant), these come back regardless of
// which model is driving. Robust: returns {ok:false,memories:[]} on any failure — never throws.
export type RetrieveMemoryResult = { ok: boolean; memories: string[] };

// Pull memory strings out of Backboard's response shape defensively — `retrieved_memories`
// may be plain strings or objects ({content|memory|text|summary|...}); unknown shapes -> [].
function extractRetrievedMemories(j: unknown): string[] {
  if (!j || typeof j !== "object") return [];
  const obj = j as Record<string, unknown>;
  const raw = obj.retrieved_memories ?? obj.retrievedMemories ?? obj.memories ?? obj.memory;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const s = item.trim();
      if (s) out.push(s);
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const v = o.content ?? o.memory ?? o.text ?? o.value ?? o.summary ?? o.briefing;
      if (typeof v === "string" && v.trim()) out.push(v.trim());
    }
  }
  return out;
}

export async function retrieveMemory(query: string): Promise<RetrieveMemoryResult> {
  try {
    const assistant_id = await getAssistantId();
    if (!assistant_id) {
      appendFallbackLog({ op: "retrieve_memory", ok: false, reason: "no_assistant" });
      return { ok: false, memories: [] };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    let res: Response;
    try {
      res = await fetch(`${BACKBOARD_BASE}/threads/messages`, {
        method: "POST",
        headers: bbHeaders(),
        signal: ctrl.signal,
        body: JSON.stringify({
          content: query,
          assistant_id,
          memory: "Auto",
          send_to_llm: "false",
        }),
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      appendFallbackLog({ op: "retrieve_memory", ok: false, status: res.status });
      return { ok: false, memories: [] };
    }
    const j = (await res.json().catch(() => ({}))) as unknown;
    return { ok: true, memories: extractRetrievedMemories(j) };
  } catch (e) {
    appendFallbackLog({ op: "retrieve_memory", ok: false, error: String(e) });
    return { ok: false, memories: [] };
  }
}

// ── Backwards-compatible capsule store ────────────────────────────────────────────────────
// Persists the full capsule snapshot locally (demo store) AND pushes the DISTILLED briefing
// to Backboard memory under a per-project thread.
const keyFor = (c: HandoffCapsule) => `${c.project}__${c.session_id}`.replace(/[^\w.-]/g, "_");
const projectKeyFor = (c: HandoffCapsule) => `relay-${c.project}`.replace(/[^\w.-]/g, "_");

export async function storeCapsule(c: HandoffCapsule): Promise<{ store: "backboard" | "local"; thread_id?: string }> {
  const bb = await storeCapsuleMemory(projectKeyFor(c), capsuleMemoryBriefing(c));
  ensureDir(LOCAL_DIR);
  writeFileSync(join(LOCAL_DIR, `${keyFor(c)}.json`), JSON.stringify(c, null, 2));
  return bb.ok ? { store: "backboard", thread_id: bb.thread_id } : { store: "local" };
}

export function listLocalCapsules(): HandoffCapsule[] {
  ensureDir(LOCAL_DIR);
  return readdirSync(LOCAL_DIR).filter((f) => f.endsWith(".json")).map((f) => {
    try { return JSON.parse(readFileSync(join(LOCAL_DIR, f), "utf-8")) as HandoffCapsule; } catch { return null; }
  }).filter(Boolean) as HandoffCapsule[];
}

export function latestCapsuleForProject(project: string): HandoffCapsule | null {
  const all = listLocalCapsules().filter((c) => c.project === project);
  return all.sort((a, b) => b.generated_at.localeCompare(a.generated_at))[0] || null;
}

// ── CAPSULE → Backboard mapping (typed contract) ──────────────────────────────────────────
// The domain model that maps a capsule (and the skill memory it mints) onto a Backboard write.
//
//   • ASSISTANT-PER-TENANT — every enterprise gets ONE assistant. The assistant_id is the
//     tenant-isolation boundary: a write/read can only touch its own namespace.
//   • PROJECT = THREAD — each project is one Backboard thread under that assistant. Memory
//     follows the ENTITY (tenant + project), never the model.
//   • SKILL MEMORIES ARE TAGGED by `<skillId>@<semver>` so a recalled memory is pinned to the
//     exact skill version that minted it.
//   • send_to_llm:"false" — a capsule write is a MEMORY op, not an inference op.
// ─────────────────────────────────────────────────────────────────────────────────────────

// A Backboard write envelope — the wire shape CAPSULE serialises a memory into.
export type BackboardEnvelope = {
  assistant_id: string;       // tenant isolation key
  thread_id?: string;         // one thread per project — omitted on the first write
  tags: string[];             // skill memories tagged `<skillId>@<semver>`
  send_to_llm: "false";       // a memory write is never an inference
  memory: "Auto";
  content: string;
};

// A skill memory reference: the id + semver that pins a memory to a skill version.
export type SkillMemoryRef = { id: string; version: string };

// Slugify an arbitrary tenant/project label into a stable Backboard key segment.
const bbSlug = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// A stable per-project thread key under the single "capsule" assistant.
export const projectThreadKey = (enterprise: string, project: string): string =>
  `${bbSlug(enterprise)}__${bbSlug(project)}`;

// Tag a skill memory by id + semver: `<skillId>@<semver>`.
export const skillMemoryTag = (ref: SkillMemoryRef): string => `${ref.id}@${ref.version}`;

export type CapsuleMemoryInput = {
  assistant_id: string;
  enterprise: string;
  project: string;
  content: string;            // the DISTILLED briefing to persist
  skills?: SkillMemoryRef[];  // skill versions this memory mints/relates to
};

// Map a CAPSULE memory onto the Backboard write envelope (thread_id omitted on first write).
export function capsuleToBackboardEnvelope(input: CapsuleMemoryInput): BackboardEnvelope {
  return {
    assistant_id: input.assistant_id,
    tags: (input.skills ?? []).map(skillMemoryTag),
    send_to_llm: "false",
    memory: "Auto",
    content: input.content,
  };
}
