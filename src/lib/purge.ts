// PURGE / RETIRE — the skill-retirement half of the CAPSULE RL loop.
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │  active  →  deprecated  →  archived  →  purged                             │
// └──────────────────────────────────────────────────────────────────────────┘
//
// PROMOTE forges new skill versions (src/lib/promote.ts). The registry would grow
// without bound — and accrue dead, deduped, superseded, or worthless skills — if
// nothing ever retired. This module is the opposite pole: it scans the ENTERPRISE
// registry on disk (registry.json + skills/<id>/ + MERGE-LEDGER.md + promotion/)
// and proposes the *removal* of skills that have stopped paying rent, mirroring the
// promotion governance exactly — staged, ledgered, reviewable, never silent.
//
// HONESTY (the labels matter):
//   • tokensSavedPerUse is a MEASURED proxy (Ollama prompt_eval+eval A/B), read
//     straight from registry.json / SKILL.md — surfaced as source:"measured".
//   • the dedup cosine + supersede relation come from MERGE-LEDGER.md, the
//     append-only human/agent record — surfaced as source:"ledger".
//   • adoption / value / age are arithmetic over those facts — source:"derived".
//   • nothing here is LLM-judged; the scanner makes no model calls.
//
// SAFETY:
//   • DEFAULT DRY-RUN. Every mutating function takes { apply }. When apply is false
//     (default) it computes and returns the plan and writes NOTHING.
//   • Every state transition (active→deprecated→archived→purged) is appended to
//     PURGE-LEDGER.md, mirroring MERGE-LEDGER. Nothing is hard-deleted silently:
//     archiveSkill MOVES skills/<id>/ → archive/<id>/ (recoverable), and even
//     purgeArchived records the deletion in the ledger before removing the folder.
//   • Backboard provenance is NEVER touched — the distilled briefings/threads that
//     back each skill stay in memory; only the on-disk registry artifact retires.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readFile,
  writeFile,
  appendFile,
  readdir,
  rename,
  rm,
  mkdir,
  access,
  stat,
} from "node:fs/promises";
import { join } from "node:path";
import { SKILLS_REPO } from "@/lib/promote";

const execFileP = promisify(execFile);

// ------------------------------------------------------------------
// Layout / tunables
// ------------------------------------------------------------------
export const PURGE_LEDGER = join(SKILLS_REPO, "PURGE-LEDGER.md");
export const ARCHIVE_DIR = join(SKILLS_REPO, "archive");
export const PROMOTION_DIR = join(SKILLS_REPO, "promotion");
export const SKILLS_DIR = join(SKILLS_REPO, "skills");
export const REGISTRY_JSON = join(SKILLS_REPO, "registry.json");
export const MERGE_LEDGER = join(SKILLS_REPO, "MERGE-LEDGER.md");

// Dedup cosine at/above which the MERGE-LEDGER counts a finding as ABSORBED.
export const ABSORB_COSINE = 0.9;
// Floor for measured value (tokensSavedPerUse × adoption). Below this and not
// improving → LOW_VALUE. Conservative: a skill saving ~157 tok with one consumer
// (value 157) is below it; a 600+ tok skill is not.
export const VALUE_FLOOR = 250;
// A candidate is only "old enough" to be called UNUSED after this many days with
// no route/agent/pin. Keeps a freshly-minted skill from being retired same-week.
export const UNUSED_GRACE_DAYS = 30;
// archive/<id>/ older than this many days is eligible for hard purge.
export const ARCHIVE_GRACE_DAYS = 30;

// ------------------------------------------------------------------
// Public types
// ------------------------------------------------------------------
export type PurgeReason =
  | "ABSORBED"
  | "SUPERSEDED"
  | "UNUSED"
  | "LOW_VALUE"
  | "ORPHANED";

// Where the retirement lifecycle currently sits for a skill.
export type Lifecycle = "active" | "deprecated" | "archived" | "purged";

// What the scanner recommends a human/CI do with the candidate. Deliberately
// conservative: "review"/"hold" never mutate; only "deprecate"/"archive" stage a
// transition, and only when the evidence is unambiguous.
export type RecommendedAction = "review" | "hold" | "deprecate" | "archive" | "none";

// Honest provenance of each piece of evidence.
export type SignalSource = "measured" | "derived" | "ledger";

export interface PurgeSignal {
  label: string;
  detail: string;
  source: SignalSource;
}

export interface PurgeCandidate {
  id: string; // skill/<short>
  name: string;
  currentVersion: string;
  reason: PurgeReason; // primary (highest-precedence rule that fired)
  alsoMatched: PurgeReason[]; // secondary rules that also fired
  recommended: RecommendedAction;
  lifecycle: Lifecycle; // current on-disk lifecycle state
  tokensSavedPerUse: number; // MEASURED proxy
  adoption: number; // DERIVED: pins + usedByAgents
  value: number; // DERIVED: tokensSavedPerUse × adoption
  ageDays: number | null; // DERIVED from CHANGELOG date
  signals: PurgeSignal[]; // honest evidence trail
  note: string; // one-line human summary
}

export interface PurgeRunOptions {
  apply?: boolean; // default false → DRY-RUN (compute + return, write nothing)
}

export interface ProposePurgeResult {
  applied: boolean;
  proposals: { id: string; path: string; recommended: RecommendedAction }[];
  ledgerEntries: number;
}

export interface ArchiveResult {
  applied: boolean;
  id: string;
  from: string;
  to: string;
  droppedFromRegistry: boolean;
  note: string;
}

export interface PurgeArchivedResult {
  applied: boolean;
  graceDays: number;
  purged: { id: string; path: string; ageDays: number }[];
  kept: { id: string; ageDays: number }[];
}

export interface RetirementPrResult {
  pushed: boolean;
  prUrl: string | null;
  branch: string;
}

// ------------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------------
const shortName = (skillId: string): string => skillId.replace(/^skill\//, "");
const fullId = (short: string): string => (short.startsWith("skill/") ? short : `skill/${short}`);
const nowIso = (): string => new Date().toISOString();

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await readFile(p, "utf8")) as T;
}

// ------------------------------------------------------------------
// Registry / SKILL.md / CHANGELOG readers
// ------------------------------------------------------------------
interface RegistrySkill {
  name: string;
  currentVersion: string;
  group?: string;
  pinnedBy?: string[];
  category?: string;
  tokensSavedPerUse?: number;
}

interface RegistryFile {
  totalSkills?: number;
  counts?: Record<string, number>;
  skills: Record<string, RegistrySkill>;
  // archive set this module maintains (additive; absent in a pristine registry).
  archived?: Record<string, { archivedAt: string; reason: PurgeReason; from: string }>;
  [k: string]: unknown;
}

// Parse usedByAgents from a SKILL.md frontmatter line. Missing line → [].
function parseUsedByAgents(md: string): string[] {
  const m = md.match(/^usedByAgents:\s*\[(.*)\]\s*$/m);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

interface SkillFront {
  usedByAgents: string[];
  currentVersion: string | null;
}

async function readSkillFront(short: string): Promise<SkillFront | null> {
  const p = join(SKILLS_DIR, short, "SKILL.md");
  if (!(await exists(p))) return null;
  const md = await readFile(p, "utf8");
  const cv = md.match(/^currentVersion:\s*(.+)$/m);
  return { usedByAgents: parseUsedByAgents(md), currentVersion: cv ? cv[1].trim() : null };
}

// Newest CHANGELOG entry → { dateIso, status }. Used for age + published/proposed.
async function readChangelogHead(
  short: string,
): Promise<{ dateIso: string | null; status: string | null }> {
  const p = join(SKILLS_DIR, short, "CHANGELOG.md");
  if (!(await exists(p))) return { dateIso: null, status: null };
  const md = await readFile(p, "utf8");
  // e.g. "## 2.0.0 — major — 2026-06-24T03:59:25.437Z  [published]"
  const m = md.match(/^##\s+\S+\s+—\s+\S+\s+—\s+(\S+)\s*(?:\[(\w[\w-]*)\])?/m);
  if (!m) return { dateIso: null, status: null };
  return { dateIso: m[1] ?? null, status: m[2] ?? null };
}

function ageDaysFrom(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const t = Date.parse(dateIso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000));
}

// ------------------------------------------------------------------
// MERGE-LEDGER parsing — DEDUP (ABSORBED) + SUPERSEDE evidence
// ------------------------------------------------------------------
interface DedupHit {
  ref: string; // ML-001
  cosine: number | null;
}
interface SupersedeHit {
  ref: string;
  toVersion: string | null;
}

interface MergeLedgerFacts {
  dedup: Map<string, DedupHit>; // short skill id → dedup evidence
  supersede: Map<string, SupersedeHit>; // short skill id → supersede evidence
}

async function parseMergeLedger(): Promise<MergeLedgerFacts> {
  const dedup = new Map<string, DedupHit>();
  const supersede = new Map<string, SupersedeHit>();
  if (!(await exists(MERGE_LEDGER))) return { dedup, supersede };
  const md = await readFile(MERGE_LEDGER, "utf8");

  // Split on ANY markdown heading (## … ######) so a "### Ledger invariants"
  // subsection becomes its own block instead of bleeding into the entry above it
  // (that bleed previously made a CONFLICT entry look like a DEDUP).
  const blocks = md.split(/\n(?=#{2,6}\s)/);
  for (const block of blocks) {
    const header = block.split("\n", 1)[0] ?? "";
    const refMatch = header.match(/\b(ML-\d+)\b/);
    const ref = refMatch ? refMatch[1] : header.replace(/^#+\s*/, "").slice(0, 40).trim();
    const skillMatch = block.match(/skill\/([a-z0-9-]+)/);
    if (!skillMatch) continue;
    const short = skillMatch[1];

    // DEDUP is a relation declared in the ENTRY HEADER ("## ML-xxx — DEDUP — …"),
    // never inferred from prose elsewhere in the body.
    if (/\bDEDUP\b/.test(header)) {
      const cos = block.match(/cosine[^0-9]*([01]?\.\d+)/i);
      const cosine = cos ? Number(cos[1]) : null;
      if (cosine === null || cosine >= ABSORB_COSINE) {
        dedup.set(short, { ref, cosine });
      }
    }
    if (/\bsupersede\b/i.test(block)) {
      // Target version: prefer the one on the "SUPERSEDE → …@x.y.z" line itself so
      // we don't grab the OLD version mentioned earlier in the entry.
      const ver =
        block.match(/supersede[^\n]*?(\d+\.\d+\.\d+)/i) ??
        block.match(/(?:@|→\s*|to\s+)(\d+\.\d+\.\d+)/);
      supersede.set(short, { ref, toVersion: ver ? ver[1] : null });
    }
  }
  return { dedup, supersede };
}

// ------------------------------------------------------------------
// promotion/<short>/ parsing — staged proposals (SUPERSEDED / ORPHANED)
// ------------------------------------------------------------------
interface ProposalFacts {
  proposedVersion: string | null;
  supersedes: string | null;
  bump: string | null;
  status: string | null;
  ciImproved: boolean | null;
  ciDelta: number | null;
  relation: string | null;
  file: string;
}

async function readProposals(short: string): Promise<ProposalFacts[]> {
  const dir = join(PROMOTION_DIR, short);
  if (!(await exists(dir))) return [];
  const files = (await readdir(dir)).filter(
    (f) => /\.SKILL\.md$/i.test(f) || /canonical-merge\.md$/i.test(f),
  );
  const out: ProposalFacts[] = [];
  for (const f of files) {
    const md = await readFile(join(dir, f), "utf8");
    const pick = (re: RegExp): string | null => {
      const m = md.match(re);
      return m ? m[1].trim() : null;
    };
    const improvedRaw = pick(/^ciImproved:\s*(\w+)\s*$/m);
    const deltaRaw = pick(/^ciDelta:\s*(-?\d+)\s*$/m);
    out.push({
      proposedVersion: pick(/^proposedVersion:\s*(.+)$/m),
      supersedes: pick(/^supersedes:\s*(.+)$/m),
      bump: pick(/^bump:\s*(.+)$/m),
      status: pick(/^status:\s*([^\s#]+)/m),
      ciImproved: improvedRaw === null ? null : improvedRaw === "true",
      ciDelta: deltaRaw === null ? null : Number(deltaRaw),
      relation: pick(/^relation:\s*(.+)$/m),
      file: join("promotion", short, f),
    });
  }
  return out;
}

// ------------------------------------------------------------------
// scanPurgeCandidates — the read-only heart. Builds the candidate list from the
// enterprise registry, applying the five rules with precedence. Pure scan: no
// writes, no model calls, deterministic given the on-disk state.
//
// Precedence (primary reason = first to fire): ABSORBED > SUPERSEDED > ORPHANED >
// UNUSED > LOW_VALUE. Lower-precedence matches are recorded in `alsoMatched` so the
// full picture is preserved without double-counting.
// ------------------------------------------------------------------
export async function scanPurgeCandidates(): Promise<PurgeCandidate[]> {
  const registry = await readJson<RegistryFile>(REGISTRY_JSON);
  const { dedup, supersede } = await parseMergeLedger();
  const archived = registry.archived ?? {};

  const candidates: PurgeCandidate[] = [];

  for (const [id, reg] of Object.entries(registry.skills)) {
    const short = shortName(id);
    const front = await readSkillFront(short);
    const usedByAgents = front?.usedByAgents ?? [];
    const pins = reg.pinnedBy ?? [];
    const tokensSavedPerUse = reg.tokensSavedPerUse ?? 0;
    const adoption = pins.length + usedByAgents.length;
    const value = tokensSavedPerUse * adoption;
    const { dateIso } = await readChangelogHead(short);
    const ageDays = ageDaysFrom(dateIso);
    const proposals = await readProposals(short);
    const lifecycle: Lifecycle = id in archived ? "archived" : "active";

    const matched: PurgeReason[] = [];
    const signals: PurgeSignal[] = [];

    // --- ABSORBED: a DEDUP in the MERGE-LEDGER folded a re-discovery into this
    //     canonical skill at cosine ≥ threshold. The duplicate contribution was
    //     absorbed; the canonical itself may still be live (so default to REVIEW,
    //     never a blind archive). ---
    const dh = dedup.get(short);
    const mergeProposal = proposals.find((p) => p.relation === "dedup" || /merged-provenance/.test(p.status ?? ""));
    if (dh) {
      matched.push("ABSORBED");
      signals.push({
        label: "absorbed",
        detail: `MERGE-LEDGER ${dh.ref} deduped a re-discovery into this canonical skill${
          dh.cosine !== null ? ` at cosine ${dh.cosine}` : ""
        } (≥ ${ABSORB_COSINE} threshold).${
          mergeProposal ? ` Staged: ${mergeProposal.file}.` : ""
        }`,
        source: "ledger",
      });
    }

    // --- SUPERSEDED: a major/supersede bump targets this skill, either recorded in
    //     the MERGE-LEDGER or staged as a major proposal in promotion/. HONEST: if
    //     the supersede is still `proposed` (not on master head), the OLD version
    //     cannot be retired yet → HOLD, not archive. ---
    const sh = supersede.get(short);
    const majorProposal = proposals.find(
      (p) => p.bump === "major" && p.supersedes !== null && p.relation !== "dedup",
    );
    if (sh || majorProposal) {
      matched.push("SUPERSEDED");
      const proposedStill =
        majorProposal?.status === "proposed" || (sh !== undefined && majorProposal?.status !== "merged");
      signals.push({
        label: "superseded",
        detail: `${
          sh ? `MERGE-LEDGER ${sh.ref} supersedes → ${sh.toVersion ?? "major"}` : ""
        }${sh && majorProposal ? "; " : ""}${
          majorProposal
            ? `staged ${majorProposal.file} (${majorProposal.bump}, supersedes ${majorProposal.supersedes}, status ${majorProposal.status})`
            : ""
        }. ${
          proposedStill
            ? "Supersede is STILL PROPOSED — old version stays on master until publish; cannot retire yet."
            : "Supersede published."
        }`,
        source: "ledger",
      });
    }

    // --- ORPHANED: a proposal that is stuck `proposed` with measured reward NOT
    //     improved (ciImproved:false) — it will never publish as-is, so the
    //     candidate version is an orphan held in promotion/. ---
    const orphanProposal = proposals.find(
      (p) => p.status === "proposed" && p.ciImproved === false,
    );
    if (orphanProposal) {
      matched.push("ORPHANED");
      signals.push({
        label: "orphaned",
        detail: `${orphanProposal.file} is held \`proposed\` with measured reward worse (ciImproved=false, ciDelta=${
          orphanProposal.ciDelta ?? "?"
        }). The agentic-CI A/B never cleared; the proposal is orphaned pending rework or rejection.`,
        source: "measured",
      });
    }

    // --- UNUSED: no agent uses it, nothing pins it, no live capsule route stages a
    //     proposal against it, and it is older than the grace window. ---
    const routed = proposals.length > 0 || dedup.has(short) || supersede.has(short);
    const unused =
      usedByAgents.length === 0 &&
      pins.length === 0 &&
      !routed &&
      ageDays !== null &&
      ageDays > UNUSED_GRACE_DAYS;
    if (unused) {
      matched.push("UNUSED");
      signals.push({
        label: "unused",
        detail: `No agent uses it (usedByAgents empty), pinnedBy empty, no staged route, age ${ageDays}d > grace ${UNUSED_GRACE_DAYS}d.`,
        source: "derived",
      });
    }

    // --- LOW_VALUE: measured tokensSaved × adoption below the floor, and not
    //     improving (a single current version, no recent bump that raised it). ---
    const improving = (ageDays ?? Infinity) <= UNUSED_GRACE_DAYS && tokensSavedPerUse >= VALUE_FLOOR;
    const lowValue = value < VALUE_FLOOR && !improving;
    if (lowValue) {
      matched.push("LOW_VALUE");
      signals.push({
        label: "low-value",
        detail: `Measured value ${value} = ${tokensSavedPerUse} tok/use × ${adoption} adopter(s) < floor ${VALUE_FLOOR}; not improving.`,
        source: "derived",
      });
    }

    if (matched.length === 0) continue;

    // Always record the measured/derived baseline alongside the firing rules.
    signals.push({
      label: "metrics",
      detail: `tokensSavedPerUse=${tokensSavedPerUse} (measured proxy); adoption=${adoption} (pins ${pins.length} + agents ${usedByAgents.length}); value=${value}; age=${
        ageDays ?? "?"
      }d.`,
      source: tokensSavedPerUse > 0 ? "measured" : "derived",
    });

    // Precedence pick.
    const order: PurgeReason[] = ["ABSORBED", "SUPERSEDED", "ORPHANED", "UNUSED", "LOW_VALUE"];
    const primary = order.find((r) => matched.includes(r)) as PurgeReason;
    const alsoMatched = order.filter((r) => r !== primary && matched.includes(r));

    candidates.push({
      id,
      name: reg.name,
      currentVersion: reg.currentVersion,
      reason: primary,
      alsoMatched,
      recommended: recommend(primary, { unused, value, adoption, supersedeProposed: proposalsAreProposed(proposals) }),
      lifecycle,
      tokensSavedPerUse,
      adoption,
      value,
      ageDays,
      signals,
      note: noteFor(primary, reg.name, { dh, sh, majorProposal, orphanProposal, value, adoption, ageDays }),
    });
  }

  // Most-actionable first: by recommended severity, then lowest value.
  const sev: Record<RecommendedAction, number> = { archive: 0, deprecate: 1, hold: 2, review: 3, none: 4 };
  candidates.sort((a, b) => sev[a.recommended] - sev[b.recommended] || a.value - b.value);
  return candidates;
}

function proposalsAreProposed(proposals: ProposalFacts[]): boolean {
  const major = proposals.find((p) => p.bump === "major" && p.relation !== "dedup");
  return major ? major.status === "proposed" : false;
}

// Conservative recommendation. We only ever recommend a real transition
// (deprecate/archive) when the evidence is unambiguous AND the skill is not still
// load-bearing. Everything else is review/hold — surfaced, never auto-mutated.
function recommend(
  primary: PurgeReason,
  ctx: { unused: boolean; value: number; adoption: number; supersedeProposed: boolean },
): RecommendedAction {
  switch (primary) {
    case "ABSORBED":
      // The canonical absorbed a duplicate; canonical itself stays. Review only.
      return "review";
    case "SUPERSEDED":
      // Can't retire the old version while the supersede is only proposed.
      return ctx.supersedeProposed ? "hold" : "review";
    case "ORPHANED":
      // The proposal is dead weight; recommend clearing the staged candidate.
      return "deprecate";
    case "UNUSED":
      // Genuinely dead and past grace → safe to archive.
      return ctx.adoption === 0 ? "archive" : "deprecate";
    case "LOW_VALUE":
      return ctx.adoption === 0 ? "deprecate" : "review";
    default:
      return "review";
  }
}

function noteFor(
  primary: PurgeReason,
  name: string,
  ctx: {
    dh?: DedupHit;
    sh?: SupersedeHit;
    majorProposal?: ProposalFacts;
    orphanProposal?: ProposalFacts;
    value: number;
    adoption: number;
    ageDays: number | null;
  },
): string {
  switch (primary) {
    case "ABSORBED":
      return `${name}: a re-discovery was deduped into this canonical skill${
        ctx.dh?.cosine != null ? ` (cosine ${ctx.dh.cosine})` : ""
      } — provenance merged, canonical retained; review only, do not purge.`;
    case "SUPERSEDED":
      return `${name}: superseded by ${
        ctx.majorProposal?.proposedVersion ?? ctx.sh?.toVersion ?? "a major bump"
      } (${ctx.majorProposal?.status ?? "proposed"}) — hold until the supersede publishes, then retire the old version.`;
    case "ORPHANED":
      return `${name}: staged proposal held \`proposed\` with reward worse — orphan candidate, clear or rework.`;
    case "UNUSED":
      return `${name}: no agent/pin/route for ${ctx.ageDays ?? "?"}d — safe to archive.`;
    case "LOW_VALUE":
      return `${name}: measured value ${ctx.value} across ${ctx.adoption} adopter(s) below floor — deprecate or fold in.`;
    default:
      return name;
  }
}

// ------------------------------------------------------------------
// PURGE-LEDGER (mirror of MERGE-LEDGER: append-only, never edited in place)
// ------------------------------------------------------------------
const PURGE_LEDGER_HEADER = `# PURGE-LEDGER — append-only skill retirement audit trail

Mirror of \`MERGE-LEDGER.md\`, for the **other** direction of the RL loop: how skills
**leave** the enterprise registry. Lifecycle is \`active → deprecated → archived →
purged\`; **every** transition is recorded here and **nothing is hard-deleted
silently**. \`archive\` MOVES the skill folder (recoverable); \`purge\` deletes an
archived folder only after its grace window, and records the deletion below first.
Backboard provenance (distilled briefings/threads) is **never** touched.

**Rule → recommended transition**

| Scanner reason | Meaning | Default action |
|---|---|---|
| ABSORBED | deduped into a canonical skill (cosine ≥ 0.90) | review (keep canonical) |
| SUPERSEDED | replaced by a major/supersede bump | hold until publish, then deprecate |
| ORPHANED | proposal stuck \`proposed\`, reward worse | deprecate the staged candidate |
| UNUSED | no agent/pin/route, age > grace | archive |
| LOW_VALUE | measured value below floor, not improving | deprecate or fold in |

Decisions are made by **measured reward + ledger evidence**, not opinion. Removal is
**proposed**, not force-deleted — a human/CI signs off, exactly like promotion.

---
`;

async function ensurePurgeLedger(): Promise<void> {
  if (!(await exists(PURGE_LEDGER))) {
    await writeFile(PURGE_LEDGER, PURGE_LEDGER_HEADER, "utf8");
  }
}

function deprecationLedgerEntry(c: PurgeCandidate): string {
  const ev = c.signals.map((s) => `  - _(${s.source})_ **${s.label}:** ${s.detail}`).join("\n");
  return `
## DEPRECATE — ${c.id}@${c.currentVersion} — ${c.reason}

- **Date:** ${nowIso()}
- **Skill:** \`${c.id}\` (${c.name}) currentVersion ${c.currentVersion}
- **Lifecycle:** ${c.lifecycle} → **deprecated** (proposed)
- **Primary reason:** ${c.reason}${c.alsoMatched.length ? ` · also: ${c.alsoMatched.join(", ")}` : ""}
- **Recommended action:** ${c.recommended}
- **Measured:** tokensSavedPerUse ${c.tokensSavedPerUse} (proxy) · adoption ${c.adoption} · value ${c.value} · age ${c.ageDays ?? "?"}d
- **Evidence:**
${ev}
- **Note:** ${c.note}
- **Backboard:** provenance untouched (briefings/threads retained).
- **Source of record:** purge scan via scripts/purge-skills.ts (CAPSULE relay)
`;
}

function transitionLedgerEntry(
  kind: "ARCHIVE" | "PURGE",
  id: string,
  detail: string,
): string {
  return `
## ${kind} — ${id}

- **Date:** ${nowIso()}
- **Skill:** \`${id}\`
- **Transition:** ${kind === "ARCHIVE" ? "deprecated → **archived** (folder moved to archive/)" : "archived → **purged** (folder deleted after grace)"}
- **Detail:** ${detail}
- **Backboard:** provenance untouched.
- **Source of record:** purge ${kind === "ARCHIVE" ? "archiveSkill" : "purgeArchived"} via scripts/purge-skills.ts
`;
}

// ------------------------------------------------------------------
// proposePurge — stage deprecation/archive PROPOSALS for the candidates and append
// the PURGE-LEDGER, mirroring how promote.ts stages promotion candidates. DRY-RUN
// by default: returns the plan and writes nothing unless { apply:true }.
//
// Writes (apply): purge/<short>/DEPRECATION-<version>.md per candidate, and one
// PURGE-LEDGER DEPRECATE entry each. It does NOT move folders or edit registry.json
// — that is archiveSkill's job, behind a second explicit step.
// ------------------------------------------------------------------
export async function proposePurge(
  candidates: PurgeCandidate[],
  opts: PurgeRunOptions = {},
): Promise<ProposePurgeResult> {
  const apply = opts.apply === true;
  const proposals = candidates.map((c) => ({
    id: c.id,
    path: join("purge", shortName(c.id), `DEPRECATION-${c.currentVersion}.md`),
    recommended: c.recommended,
  }));

  if (!apply) {
    return { applied: false, proposals, ledgerEntries: 0 };
  }

  await ensurePurgeLedger();
  let ledgerEntries = 0;
  for (const c of candidates) {
    const dir = join(SKILLS_REPO, "purge", shortName(c.id));
    await mkdir(dir, { recursive: true });
    const path = join(dir, `DEPRECATION-${c.currentVersion}.md`);
    await writeFile(path, deprecationProposalBody(c), "utf8");
    await appendFile(PURGE_LEDGER, deprecationLedgerEntry(c), "utf8");
    ledgerEntries++;
  }
  return { applied: true, proposals, ledgerEntries };
}

function deprecationProposalBody(c: PurgeCandidate): string {
  const ev = c.signals.map((s) => `- **${s.label}** _(${s.source})_ — ${s.detail}`).join("\n");
  return `---
id: ${c.id}
name: ${c.name}
currentVersion: ${c.currentVersion}
proposedLifecycle: deprecated
reason: ${c.reason}
alsoMatched: [ ${c.alsoMatched.map((r) => `"${r}"`).join(", ")} ]
recommended: ${c.recommended}
tokensSavedPerUse: ${c.tokensSavedPerUse}
adoption: ${c.adoption}
value: ${c.value}
ageDays: ${c.ageDays ?? "null"}
status: proposed
---

# Retirement proposal — ${c.name}  \`${c.id}@${c.currentVersion}\`  *(DEPRECATE)*

> **STAGED RETIREMENT PROPOSAL — NOT a deletion.** This marks \`${c.id}\` for the
> \`active → deprecated\` transition. It lands only if review signs off, exactly
> like a promotion candidate. archive/purge are separate, later steps. Backboard
> provenance is retained regardless.

**Primary reason:** ${c.reason}${c.alsoMatched.length ? ` · also: ${c.alsoMatched.join(", ")}` : ""}
**Recommended action:** ${c.recommended}

## Evidence (honest provenance)

${ev}

## Note

${c.note}

## Lifecycle

\`\`\`
active → deprecated (this proposal) → archived (archiveSkill, moves folder) → purged (purgeArchived, after grace)
\`\`\`
`;
}

// ------------------------------------------------------------------
// archiveSkill — the deprecated → archived transition. MOVES skills/<short>/ to
// archive/<short>/ (recoverable, not deleted), drops the skill from registry.json's
// active `skills` set into an additive `archived` block, and appends a PURGE-LEDGER
// ARCHIVE entry. DRY-RUN by default.
// ------------------------------------------------------------------
export async function archiveSkill(id: string, opts: PurgeRunOptions = {}): Promise<ArchiveResult> {
  const apply = opts.apply === true;
  const short = shortName(fullId(id));
  const from = join(SKILLS_DIR, short);
  const to = join(ARCHIVE_DIR, short);

  if (!apply) {
    return {
      applied: false,
      id: fullId(id),
      from,
      to,
      droppedFromRegistry: false,
      note: `DRY-RUN: would move ${from} → ${to} and drop ${fullId(id)} from registry.json active set.`,
    };
  }

  if (!(await exists(from))) {
    return {
      applied: false,
      id: fullId(id),
      from,
      to,
      droppedFromRegistry: false,
      note: `skills/${short} not found — already archived or never existed; no-op.`,
    };
  }

  await mkdir(ARCHIVE_DIR, { recursive: true });
  await rename(from, to);

  // Drop from active set; record in additive archived block. Keep registry.json
  // self-consistent (counts/totalSkills follow the active set).
  const registry = await readJson<RegistryFile>(REGISTRY_JSON);
  const reg = registry.skills[fullId(id)];
  let droppedFromRegistry = false;
  if (reg) {
    delete registry.skills[fullId(id)];
    registry.archived = registry.archived ?? {};
    registry.archived[fullId(id)] = { archivedAt: nowIso(), reason: "UNUSED", from: `skills/${short}` };
    if (typeof registry.totalSkills === "number") registry.totalSkills = Object.keys(registry.skills).length;
    await writeFile(REGISTRY_JSON, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    droppedFromRegistry = true;
  }

  await ensurePurgeLedger();
  await appendFile(
    PURGE_LEDGER,
    transitionLedgerEntry("ARCHIVE", fullId(id), `moved skills/${short} → archive/${short}; dropped from registry.json active set (${droppedFromRegistry ? "ok" : "key absent"}).`),
    "utf8",
  );

  return {
    applied: true,
    id: fullId(id),
    from,
    to,
    droppedFromRegistry,
    note: `archived: skills/${short} → archive/${short}.`,
  };
}

// ------------------------------------------------------------------
// purgeArchived — the archived → purged transition. Hard-deletes archive/<short>/
// folders whose ARCHIVE happened more than graceDays ago (folder mtime as the
// archived timestamp), recording each deletion in the PURGE-LEDGER FIRST. DRY-RUN
// by default. Backboard provenance stays — only the on-disk archived artifact goes.
// ------------------------------------------------------------------
export async function purgeArchived(
  graceDays: number = ARCHIVE_GRACE_DAYS,
  opts: PurgeRunOptions = {},
): Promise<PurgeArchivedResult> {
  const apply = opts.apply === true;
  const purged: { id: string; path: string; ageDays: number }[] = [];
  const kept: { id: string; ageDays: number }[] = [];

  if (!(await exists(ARCHIVE_DIR))) {
    return { applied: apply, graceDays, purged, kept };
  }

  const entries = await readdir(ARCHIVE_DIR, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = join(ARCHIVE_DIR, e.name);
    const st = await stat(dir);
    const ageDays = Math.max(0, Math.round((Date.now() - st.mtimeMs) / 86_400_000));
    if (ageDays <= graceDays) {
      kept.push({ id: fullId(e.name), ageDays });
      continue;
    }
    purged.push({ id: fullId(e.name), path: dir, ageDays });
    if (apply) {
      await ensurePurgeLedger();
      // Ledger FIRST, then delete — never a silent removal.
      await appendFile(
        PURGE_LEDGER,
        transitionLedgerEntry("PURGE", fullId(e.name), `deleted archive/${e.name} after ${ageDays}d > grace ${graceDays}d.`),
        "utf8",
      );
      await rm(dir, { recursive: true, force: true });
    }
  }

  return { applied: apply, graceDays, purged, kept };
}

// ------------------------------------------------------------------
// git/gh — scoped to SKILLS_REPO, child_process execFile only (no shell).
// ------------------------------------------------------------------
async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileP("git", ["-C", SKILLS_REPO, ...args], {
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

async function gh(args: string[]): Promise<string> {
  const { stdout } = await execFileP("gh", args, {
    cwd: SKILLS_REPO,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

// ------------------------------------------------------------------
// openRetirementPr — stage the retirement as an enterprise PR, mirroring promotion.
// Branches `retire/<date>`, commits the working-tree purge/* + registry.json +
// PURGE-LEDGER changes, pushes, and opens (or reuses) a PR into master. Robust:
// any failure degrades to {pushed:false}/{prUrl:null} rather than throwing.
// ------------------------------------------------------------------
export async function openRetirementPr(
  candidates: PurgeCandidate[],
  opts: PurgeRunOptions = {},
): Promise<RetirementPrResult> {
  const date = new Date().toISOString().slice(0, 10);
  const branch = `retire/${date}`;
  if (opts.apply !== true) {
    return { pushed: false, prUrl: null, branch };
  }

  let pushed = false;
  try {
    await git(["checkout", "-B", branch]);
    await git(["add", "-A", "--", "purge", "PURGE-LEDGER.md", "registry.json", "archive"]);
    const title = `retire(${date}): ${candidates.length} skill retirement candidate${candidates.length === 1 ? "" : "s"}`;
    await git(["commit", "-m", title]).catch(() => undefined); // nothing staged → skip
    await git(["push", "-u", "origin", branch]);
    pushed = true;
  } catch {
    return { pushed: false, prUrl: null, branch };
  }

  const body = retirementPrBody(candidates, date);
  const title = `retire(${date}): ${candidates.length} skill retirement candidate${candidates.length === 1 ? "" : "s"}`;
  try {
    const existing = await gh([
      "pr", "list", "--head", branch, "--base", "master", "--state", "open", "--json", "url,number",
    ]);
    const list = JSON.parse(existing || "[]") as { url: string; number: number }[];
    if (list.length) return { pushed, prUrl: list[0].url, branch };
    const prUrl = await gh(["pr", "create", "--base", "master", "--head", branch, "--title", title, "--body", body]);
    return { pushed, prUrl, branch };
  } catch {
    return { pushed, prUrl: null, branch };
  }
}

function retirementPrBody(candidates: PurgeCandidate[], date: string): string {
  const rows = candidates
    .map(
      (c) =>
        `| \`${c.id}\` | ${c.currentVersion} | ${c.reason}${c.alsoMatched.length ? ` (+${c.alsoMatched.join(",")})` : ""} | ${c.recommended} | ${c.tokensSavedPerUse} | ${c.value} |`,
    )
    .join("\n");
  return `## Skill retirement — proposed (${date})

Staged by the PURGE/RETIRE job (scripts/purge-skills.ts). **Proposals only** — the
\`active → deprecated\` transition lands when review signs off; archive/purge are
separate, grace-gated steps. Backboard provenance retained throughout.

| Skill | Version | Reason | Recommended | tok/use (measured) | value |
|---|---|---|---|---|---|
${rows}

See \`PURGE-LEDGER.md\` for the append-only audit trail and \`purge/<skill>/\` for
each deprecation proposal.

🤖 Generated with [Claude Code](https://claude.com/claude-code)`;
}
