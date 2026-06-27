// DISTILL — turn a raw session transcript into a structured Handoff Capsule.
// Primary: LOCAL Ollama (qwen2.5-coder:14b, on-device — runs with no API key, no network).
// Optional cloud boost: Cerebras (only when CEREBRAS_API_KEY is set). Last resort: heuristic —
// so a capsule always renders, even fully offline.
import type { HandoffCapsule } from "./capsule";
import type { RawSession } from "./capture";

const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || "llama-3.3-70b";

// The LOCAL distiller model. Overridable via RELAY_OLLAMA_MODEL; the UI reads
// this resolved value back through /api/sessions so the picker/distilling chips
// never claim a model that isn't the one actually running.
export const OLLAMA_MODEL = process.env.RELAY_OLLAMA_MODEL || "qwen2.5-coder:14b";

const SYS = `You are CAPSULE, a context-handoff distiller. Given a raw AI coding-session transcript,
extract the knowledge the NEXT developer or agent needs so nothing is re-discovered.
Return STRICT JSON only, matching this shape:
{
 "title": string,                               // a 3-6 word headline naming this session (e.g. "API rate limiting setup"). No trailing period.
 "intent": string,                              // the goal of the session, one sentence
 "decisions": [{"what":string,"why":string,"file":string}],   // choices made + the reason
 "tried_and_rejected": [{"approach":string,"why_rejected":string}],
 "current_state": string,                       // where things stand right now
 "next_steps": string[],
 "gotchas": string[],                           // traps, footguns, env quirks discovered
 "mental_model": {string: string},              // key term -> plain explanation
 "open_questions": string[]
}
Be concrete and specific to THIS session. Capture the WHY, not just the what. No prose outside JSON.`;

type Distilled = Pick<HandoffCapsule,
  "title" | "intent" | "decisions" | "tried_and_rejected" | "current_state" | "next_steps" | "gotchas" | "mental_model" | "open_questions">;

function empty(): Distilled {
  return { title: "", intent: "", decisions: [], tried_and_rejected: [], current_state: "", next_steps: [], gotchas: [], mental_model: {}, open_questions: [] };
}

// Derive a short headline from a sentence when the model didn't supply a title —
// strip trailing punctuation and clamp to the first ~7 words.
function titleFrom(intent: string): string {
  const s = (intent || "").replace(/<\/?[a-z-]+>/gi, "").replace(/\s+/g, " ").trim();
  if (!s) return "Untitled session";
  const words = s.split(" ").slice(0, 7).join(" ").replace(/[.,;:]+$/, "");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function parseJson(text: string): Distilled | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return { ...empty(), ...JSON.parse(m[0]) }; } catch { return null; }
}

async function viaCerebras(transcript: string): Promise<{ d: Distilled; engine: string; ms: number } | null> {
  const key = process.env.CEREBRAS_API_KEY;
  if (!key) return null;
  const t0 = Date.now();
  const res = await fetch(CEREBRAS_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: CEREBRAS_MODEL,
      messages: [{ role: "system", content: SYS }, { role: "user", content: transcript }],
      temperature: 0.2, max_tokens: 2000, response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  const d = parseJson(j.choices?.[0]?.message?.content || "");
  return d ? { d, engine: `cerebras:${CEREBRAS_MODEL}`, ms: Date.now() - t0 } : null;
}

// PRIMARY engine — local Ollama (qwen2.5-coder:14b on-device). Local models are slower than
// wafer-scale cloud, so we allow up to ~120s via an AbortController rather than hard-failing.
async function viaOllama(transcript: string): Promise<{ d: Distilled; engine: string; ms: number } | null> {
  const base = process.env.OLLAMA_URL || "http://localhost:11434";
  const model = OLLAMA_MODEL;
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model, stream: false, format: "json",
        messages: [{ role: "system", content: SYS }, { role: "user", content: transcript }],
        options: { temperature: 0.2 },
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const d = parseJson(j.message?.content || "");
    // Label makes it explicit to the UI that distillation ran locally / on-device.
    return d ? { d, engine: `ollama:${model} (local)`, ms: Date.now() - t0 } : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// Engine availability snapshot for the UI. `ollama` is true only when the
// configured model is actually present (so distill() will really run it rather
// than fall back to the heuristic); `cerebras` reflects whether the optional
// cloud boost is configured. Used by /api/sessions to keep the capture chips
// honest about which engine will run BEFORE the first distillation.
export type EngineHealth = { ollama: boolean; cerebras: boolean; model: string };

export async function ollamaHealth(): Promise<EngineHealth> {
  const base = process.env.OLLAMA_URL || "http://localhost:11434";
  const cerebras = !!process.env.CEREBRAS_API_KEY;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(`${base}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) return { ollama: false, cerebras, model: OLLAMA_MODEL };
    const j = await res.json().catch(() => null);
    const names: string[] = Array.isArray(j?.models)
      ? j.models.map((m: { name?: string }) => m?.name).filter((n: unknown): n is string => typeof n === "string")
      : [];
    const family = OLLAMA_MODEL.split(":")[0];
    // Present if the exact tag is pulled, or any tag of the same model family.
    const present = names.some((n) => n === OLLAMA_MODEL || n.startsWith(`${family}:`) || n === family);
    return { ollama: present, cerebras, model: OLLAMA_MODEL };
  } catch {
    return { ollama: false, cerebras, model: OLLAMA_MODEL };
  } finally {
    clearTimeout(timer);
  }
}

// Last-resort heuristic so a capsule always renders (e.g. offline, no models).
function heuristic(s: RawSession): Distilled {
  const lines = s.transcript.split("\n");
  const users = lines.filter((l) => l.startsWith("USER:")).map((l) => l.slice(6).trim());
  const ais = lines.filter((l) => l.startsWith("AI:")).map((l) => l.slice(3).trim());
  const gotchas = ais.filter((l) => /error|fail|gotcha|careful|note:|winerror|don't|do not/i.test(l)).slice(0, 5);
  const intent = users[0]?.slice(0, 200) || `Work on ${s.project}`;
  return {
    title: titleFrom(intent),
    intent,
    decisions: ais.filter((l) => /because|instead of|chose|use .* over|decided/i.test(l)).slice(0, 4)
      .map((l) => ({ what: l.slice(0, 120), why: "(inferred from session)", file: "" })),
    tried_and_rejected: ais.filter((l) => /reject|didn't work|failed|abandon|paid/i.test(l)).slice(0, 3)
      .map((l) => ({ approach: l.slice(0, 100), why_rejected: "(see transcript)" })),
    current_state: ais[ais.length - 1]?.slice(0, 220) || "",
    next_steps: users.slice(-3).map((u) => u.slice(0, 120)),
    gotchas: gotchas.map((g) => g.slice(0, 140)),
    mental_model: {},
    open_questions: users.filter((u) => u.trim().endsWith("?")).slice(-3),
  };
}

// Assemble the final capsule from a Distilled payload + the source session.
function buildCapsule(session: RawSession, d: Distilled): HandoffCapsule {
  // Always ensure a clean headline, even if the model omitted/garbled "title".
  const title = d.title?.trim() ? titleFrom(d.title) : titleFrom(d.intent);
  return {
    project: session.project,
    session_id: session.sessionId,
    generated_at: new Date().toISOString(),
    source: "claude-jsonl",
    title,
    intent: d.intent, decisions: d.decisions, tried_and_rejected: d.tried_and_rejected,
    current_state: d.current_state, next_steps: d.next_steps, gotchas: d.gotchas,
    mental_model: d.mental_model, open_questions: d.open_questions,
    files_touched: session.filesTouched,
    stats: { messages: session.messages, tools: session.tools, durationMin: session.durationMin },
  };
}

// Backfill any empty fields from the heuristic so a capsule is never blank.
// Returns the (possibly amended) engine label.
function backfill(session: RawSession, d: Distilled, engine: string): string {
  const h = heuristic(session);
  let e = engine;
  if (!d.intent?.trim()) { d.intent = h.intent; e += "+heuristic"; }
  if (!d.current_state?.trim()) d.current_state = h.current_state;
  if (!d.decisions?.length) d.decisions = h.decisions;
  if (!d.gotchas?.length) d.gotchas = h.gotchas;
  if (!d.next_steps?.length) d.next_steps = h.next_steps;
  return e;
}

// Single-pass distill core — the original behavior. Used for normal-sized
// transcripts and as the MAP/REDUCE fallback path when chunking can't run.
async function distillOnce(session: RawSession): Promise<{ capsule: HandoffCapsule; engine: string; ms: number }> {
  // PRIMARY: local Ollama (qwen2.5-coder:14b, on-device). Cerebras is an OPTIONAL cloud boost —
  // only attempted when CEREBRAS_API_KEY is set. Heuristic is the last-resort backfill.
  const r = (await viaOllama(session.transcript))
    || (process.env.CEREBRAS_API_KEY ? await viaCerebras(session.transcript) : null);
  const d = r?.d || heuristic(session);
  const engine = r ? backfill(session, d, r.engine) : "heuristic";
  return { capsule: buildCapsule(session, d), engine, ms: r?.ms || 0 };
}

// ---------------------------------------------------------------------------
// CHUNKED (map-reduce) distillation for oversized transcripts.
// The local model (qwen2.5-coder:14b) runs with a bounded working context; a
// transcript that would overflow it is split into N sequential chunks, each
// distilled to a PARTIAL capsule (MAP), then merged into one coherent
// whole-session capsule (REDUCE). NOTE: token counts here are ESTIMATED
// (chars/4), NOT tokenizer-measured — the engine label says "(chunked Nx)" so
// the provenance is honest about how the capsule was produced.
// ---------------------------------------------------------------------------
const estTokens = (s: string) => Math.ceil(s.length / 4);
const MODEL_CTX_TOKENS = 16_000;                               // working context we target for the local model
const RESERVE_TOKENS = 2_600;                                  // headroom for SYS prompt + JSON generation
const SINGLE_PASS_BUDGET = MODEL_CTX_TOKENS - RESERVE_TOKENS;  // ~13.4k input tokens before we must chunk
const CHUNK_BUDGET_TOKENS = 6_000;                             // safe per-chunk input budget
const CHUNK_CHARS = CHUNK_BUDGET_TOKENS * 4;                   // ~24k chars per chunk
const REDUCE_INPUT_CAP = 12_000;                               // est. tokens of partials the model can merge in one pass

const REDUCE_SYS = `You are CAPSULE's REDUCE stage. You are given an ordered JSON array of PARTIAL
handoff capsules, each distilled from a sequential CHUNK of ONE long coding session (chunk 0 first).
Merge them into ONE coherent capsule covering the WHOLE session. Rules:
- Deduplicate decisions and gotchas — drop near-duplicates, keep the most specific phrasing.
- Synthesize a SINGLE 'intent' for the whole session and a unified 'mental_model'.
- 'current_state' must reflect the END of the session (favor the LAST chunk).
- Merge 'next_steps' and 'open_questions'; dedupe; keep only what is still unresolved.
Return STRICT JSON only, matching this shape:
{
 "intent": string,
 "decisions": [{"what":string,"why":string,"file":string}],
 "tried_and_rejected": [{"approach":string,"why_rejected":string}],
 "current_state": string,
 "next_steps": string[],
 "gotchas": string[],
 "mental_model": {string: string},
 "open_questions": string[]
}
No prose outside JSON.`;

// Split a transcript into chunks of at most `budgetChars`, preferring line boundaries.
function chunkTranscript(transcript: string, budgetChars = CHUNK_CHARS): string[] {
  const lines = transcript.split("\n");
  const chunks: string[] = [];
  let cur = "";
  for (const line of lines) {
    if (line.length > budgetChars) {
      // a single oversized line — hard-split it
      if (cur) { chunks.push(cur); cur = ""; }
      for (let i = 0; i < line.length; i += budgetChars) chunks.push(line.slice(i, i + budgetChars));
      continue;
    }
    if (cur && cur.length + line.length + 1 > budgetChars) { chunks.push(cur); cur = ""; }
    cur = cur ? `${cur}\n${line}` : line;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// Generic local-Ollama JSON distill call (used by both MAP and REDUCE stages).
// numCtx bounds the model's working context for the call.
async function ollamaDistill(system: string, user: string, numCtx: number): Promise<{ d: Distilled; ms: number } | null> {
  const base = process.env.OLLAMA_URL || "http://localhost:11434";
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL, stream: false, format: "json",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        options: { temperature: 0.2, num_ctx: numCtx },
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const d = parseJson(j.message?.content || "");
    return d ? { d, ms: Date.now() - t0 } : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// Deterministic, model-free merge of partial capsules — the REDUCE fallback
// when Ollama is unavailable or the partials are too large to merge in one pass.
function mergePartials(parts: Distilled[]): Distilled {
  const out = empty();
  const seenDec = new Set<string>();
  const seenRej = new Set<string>();
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const pushUniq = (arr: string[], seen: Set<string>, v: string) => {
    const k = norm(v);
    if (v && k && !seen.has(k)) { seen.add(k); arr.push(v); }
  };
  const nextSeen = new Set<string>();
  const gotchaSeen = new Set<string>();
  const oqSeen = new Set<string>();
  for (const p of parts) {
    if (!out.intent && p.intent?.trim()) out.intent = p.intent; // first non-empty intent
    if (p.current_state?.trim()) out.current_state = p.current_state; // last non-empty wins (ordered)
    for (const d of p.decisions || []) {
      const k = norm(d.what);
      if (k && !seenDec.has(k)) { seenDec.add(k); out.decisions.push(d); }
    }
    for (const r of p.tried_and_rejected || []) {
      const k = norm(r.approach);
      if (k && !seenRej.has(k)) { seenRej.add(k); out.tried_and_rejected.push(r); }
    }
    for (const s of p.next_steps || []) pushUniq(out.next_steps, nextSeen, s);
    for (const g of p.gotchas || []) pushUniq(out.gotchas, gotchaSeen, g);
    for (const q of p.open_questions || []) pushUniq(out.open_questions, oqSeen, q);
    for (const [k, v] of Object.entries(p.mental_model || {})) if (!(k in out.mental_model)) out.mental_model[k] = v;
  }
  return out;
}

// CHUNKED distill: MAP each chunk -> partial capsule, then REDUCE -> one capsule.
// Small sessions fall through to the single-pass distillOnce(). Exposed so callers
// can force the chunked path; distill() delegates here automatically when oversized.
export async function distillChunked(session: RawSession): Promise<{ capsule: HandoffCapsule; engine: string; ms: number }> {
  if (estTokens(session.transcript) <= SINGLE_PASS_BUDGET) return distillOnce(session);

  const chunks = chunkTranscript(session.transcript);
  // MAP: distill each chunk into a partial capsule.
  const partials: Distilled[] = [];
  let mapMs = 0;
  for (const chunk of chunks) {
    const r = await ollamaDistill(SYS, chunk, 8_192);
    if (r) { partials.push(r.d); mapMs += r.ms; }
  }
  // If the local model couldn't process any chunk, fall back to the single-pass
  // path (which itself degrades to the heuristic) rather than emit nothing.
  if (partials.length === 0) {
    const once = await distillOnce(session);
    return { ...once, engine: `${once.engine} (chunk-fallback)` };
  }

  // REDUCE: merge partials into one whole-session capsule.
  const n = chunks.length;
  const partialsJson = JSON.stringify(partials);
  let d: Distilled;
  let reduceMode: "ollama" | "local-merge";
  let reduceMs = 0;
  if (estTokens(partialsJson) <= REDUCE_INPUT_CAP) {
    const rr = await ollamaDistill(REDUCE_SYS, partialsJson, 16_384);
    if (rr) { d = rr.d; reduceMode = "ollama"; reduceMs = rr.ms; }
    else { d = mergePartials(partials); reduceMode = "local-merge"; }
  } else {
    d = mergePartials(partials); reduceMode = "local-merge";
  }

  let engine = `ollama:${OLLAMA_MODEL} (local, chunked ${n}x${reduceMode === "local-merge" ? ", local-merge" : ""})`;
  engine = backfill(session, d, engine);
  return { capsule: buildCapsule(session, d), engine, ms: mapMs + reduceMs };
}

// PUBLIC entry — unchanged signature. Oversized transcripts route through the
// chunked map-reduce path; everything else uses the single-pass core.
export async function distill(session: RawSession): Promise<{ capsule: HandoffCapsule; engine: string; ms: number }> {
  if (estTokens(session.transcript) > SINGLE_PASS_BUDGET) return distillChunked(session);
  return distillOnce(session);
}
