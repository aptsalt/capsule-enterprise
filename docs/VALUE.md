# CAPSULE — The Skills Knowledge Graph: Value & Roadmap

*A strategy brief for the 8090 Software Factory.*

CAPSULE is the **capture + feedback (RL) layer** for the 8090 Software Factory: it turns every agent
session into a durable, governed enterprise asset. Raw sessions are compressed into **capsules** (RL
learning inputs), capsule findings are forged into **versioned skills**, and those skills are wired
into the **agents** that execute work orders against business **requirements**. The Skills Knowledge
Graph is the connective tissue that makes this loop visible, auditable, and compounding. The data is
**real**: capsules (`CAP-R001…R008` plus the self-captured `CAP-SESSION-1a6fcc9b`) are distilled from
the user's actual `~/.claude` sessions by the local model and **scored by an LLM judge**, forged into a
**28-skill enterprise registry** (`aptsalt/capsule-enterprise-skills`, master — 13 real + 15 popular),
with **43,032 tokens saved** (computed) and **63% adoption**, capsules persisted in **live Backboard
memory** (real `thread_id`s).

CAPSULE has shipped as a **real Next.js app** (GitHub `aptsalt/capsule`, main = merge `5968a51`;
`cd relay && npm run dev` → :3010) — a Next 15 / React 19 / TS / Tailwind / Zustand workspace with
slide-in side panels (Knowledge Graph, Skills, Versions, A/B) **plus an in-app agent chat + skills
composer** (PR #1, merged). Capsule distillation runs **on-device first** on a local model (Ollama
`qwen2.5-coder:14b`, chunked map-reduce over whole sessions): **private, free, offline-capable**, with
Cerebras only as an optional cloud boost. The enterprise's learning never has to leave its own
hardware to be captured. **Honesty:** the A/B token deltas (multi-sample), `thread_id`s, `createdAt`,
and the session `model` are *measured*; `transferScore` and `novelty` are **LLM-judged** (not trained);
reuses, scoreDelta/adoptedBy, non-A/B `tokensSaved`, and the requirements scaffolding are *derived*;
only distilled briefings are written to Backboard. DATA-REALITY.html is the canonical honesty note.

---

## 1. The value the Skills Knowledge Graph provides

**Provenance & auditability — no change without a Requirement behind it.**
Every edge is traceable end to end: `requirement → work order → agent → skill version → capsule →
session/model → Backboard`. The 8090 thesis is that nothing enters the system unattributed; the
graph enforces it. `skill/command-verification@2.0.0` resolves to `CAP-R005`, a real session
(`52cdf3c2`), Opus 4.8, and the WO/REQ it served. That is a regulator-grade audit trail.

**Best-skill discovery by use-case.**
Skills carry use-case tags (angular-upgrade → version migration / local bridges; api-rate-limiting →
third-party API retries; command-verification → verify state before acting). An engineer searching
"how do I upgrade Angular safely" lands on the right skill at its best version instead of re-deriving
it — discovery replaces tribal memory.

**Impact visibility — tokens saved + transfer-score lift.**
Each version records `tokenDeltaPerUse` and `scoreDelta`, computed by `src/lib/metrics.ts` into
per-skill Σ-saved and a tenant total of **43,032 tokens** — no hand-set dashboard numbers. The A/B
eval (`src/lib/eval.ts`) proves it with **measured, multi-sample** Ollama token counts (mean ± stdev,
consistent-direction): `AB-03` ran **247 vs 404 tokens (−39%, 157 saved)** with the capsule recalled;
`AB-01` saved 72 (−16%); `AB-02` honestly measured 0. Value is measured, not asserted — and we show
the zero rather than fake it.

**The RL compounding loop, made visible: capsule → skill → agent.**
The graph shows learning physically moving: `CAP-R004`'s finding routes to both
`skill/angular-upgrade@1.0.0` and `agent/factory-implementer@2.0.0`. The weekly compounding curve
(16,680 → 43,032 over W25–W26) is the loop turning — improvement accrues to the org, not to a chat log.

**Cross-team technique transfer — kills tribal-knowledge loss.**
Each capsule emits two outputs: a *machine* update (skill version) and a *human* technique (mental
model + learnings + watch-outs). `CAP-R005`'s "verify the actual current state from authoritative
docs instead of guessing" is reusable craft any reviewer absorbs. The graph is the institutional
memory that survives staff churn.

**Governed adoption — local-first → end-of-day promotion + agentic CI.**
A kept capsule first writes its skill bump to a **local registry** (`~/.capsule/local-registry`,
branch `local-deepak`) — instant and private. End-of-day, `scripts/eod-promote.ts` batches the day's
bumps into **one CI-gated PR** against enterprise `master` — a PR, not a push. **Agentic CI**
(`promote.ts`, gating on the multi-sample `eval.ts`) A/B-tests the new version vs current and
regression-checks prior capsules, publishing only if the measured reward improves. Landed this way:
`dee`'s `rest-api-design@1.0.1` + `oauth2-jwt-auth@1.0.1` (PR #3), and CAPSULE's **self-captured**
`ui-modularity@1.0.0` (PR #4). Learning is captured before it is trusted.

**Scoring is LLM-judged, not a black box.**
`scoreCapsuleLLM` rates each capsule's six transfer dimensions and `noveltyLLM` derives the novelty
signal (heuristic fallback when Ollama is unreachable). It's an honest **LLM-judged proxy** — not a
trained benchmark and not an authored heuristic — and it's what the agentic gate runs on.

**Retirement, not just accretion — purge with a ledger.**
`scripts/purge-skills.ts` + `src/lib/purge.ts` move a skill `active → deprecated → archived →
purged`, flagging `ABSORBED` / `SUPERSEDED` / `UNUSED` / `LOW_VALUE` / `ORPHANED` into an append-only
**PURGE-LEDGER** (dry-run by default). The registry stays a curated 28, not an ever-growing junk drawer.

**Recall surface — in-app agent chat with memory.**
The **agent chat** (PR #1) lets a developer converse with a **local-Ollama agent** that carries
**Backboard memory**, and the **skills composer** loads enterprise skills into that chat context on
demand. It closes the loop the other way: captured knowledge flows straight back into the next piece
of work, privately and at zero marginal cost (`/api/chat`, `/api/chat/context`, `/api/chats[/save]`).

**Multi-developer dedup & conflict resolution.**
Across developers (`dee`, `ven`, `saim`), near-identical capsules carry a **semantic signature** and
**dedup into one canonical capsule** with all authors kept as contributors. When one capsule says
"do X" and another "undo X / do Y" against the same skill, the pipeline flags a **do/undo conflict**
and resolves by measured reward + recency (contradictory ⇒ major, additive ⇒ minor, refinement ⇒
patch), logging every resolution in a **merge-ledger**. The registry never carries duplicate or
silently-contradictory knowledge.

**Memory follows the entity, not the model (Backboard).**
Capsules live in live Backboard memory under the `capsule` tenant assistant (real `thread_id`s,
`X-API-Key`, `send_to_llm:"false"`), and every model reads from that same hub. Swap Opus for Sonnet
or Llama and the accumulated knowledge stays — value accrues to the enterprise's memory layer, not to
any one model vendor. That is the moat.

**Private & free by default — distillation is on-device.**
The capsule that compresses a session is produced by a **local** model (`qwen2.5-coder:14b` via
Ollama), not a metered cloud API. Capture costs free compute and leaks no source/transcript off the
machine — so an enterprise can run the RL loop on *every* session without a per-token bill or a
data-egress review. Cerebras is an optional accelerator for the nightly cross-tenant job, never a
requirement. Privacy and zero marginal cost are what make "capture everything" actually defensible.

---

## 2. Enhancements, ranked by value

**Shipped (in the app)**

1. **[shipped] Side-panel KG / Skills / Versions explorer** — four slide-in panels (Graph, Skills,
   Versions, A/B) over the 8090 workspace; the daily entry point that makes the whole asset usable.
2. **[shipped] Version History + compare/diff** — the Versions panel groups semver bumps by day with
   Latest/Proposed badges; tick two to get a word-level changelog diff. Semver as a reviewable log.
3. **[shipped] Provenance trace** — click any Knowledge-Graph node and walk it back to the capsule,
   finding, session, model, and originating requirement; the auditability story in one click.
4. **[shipped] Best-skill recommender** — the sidebar use-case search ranks the highest-value skill
   version for a task by token savings + transfer score; collapses discovery to a single choice.
5. **[shipped] Impact / ROI view** — the Skills panel rolls up tokens saved, adoption %, and transfer
   lift, with the compounding sparkline; the slide that proves the loop pays for itself (43,032 / 63%).
6. **[shipped] Technique coaching** — each capsule emits the human-facing finding (mental model +
   watch-outs) alongside the machine skill update; people level up, not just agents.
7. **[shipped] A/B eval — multi-sample** — `src/lib/eval.ts` runs a task with the capsule recalled vs
   cold over **several samples** (mean ± stdev, consistent-direction, real token counts) plus a
   regression replay (`AB-03` −39%, `AB-01` −16%, `AB-02` 0 shown honestly); it's the harness
   `promote.ts` gates on for agentic CI.
8. **[shipped] Live capture + ambient pipeline** — `/api/sessions` + `/api/capsule` ingest a real
   `~/.claude/**.jsonl` session and distil it **on the local model** (chunked map-reduce), then store
   it to Backboard. A non-blocking **Stop-hook** (`settings.json`) + `scripts/capture-watcher.ts`
   auto-distil closed sessions, so the flywheel runs hands-off, not just on a click.
9. **[shipped] Agent chat + skills composer** — the in-app chat (PR #1) talks to a **local-Ollama
   agent with Backboard memory**; the composer loads enterprise skills into context. Routes
   `/api/chat`, `/api/chat/context`, `/api/chats[/save]`; UI in RightPanel (react-markdown). The recall
   surface that feeds learning back into the next session.
10. **[shipped] End-of-day promotion + purge lifecycle** — `scripts/eod-promote.ts` opens one CI-gated
    PR per day into `master` (dee's two upgrades + self-captured `ui-modularity` landed via PR #3/#4);
    `scripts/purge-skills.ts` + `src/lib/purge.ts` retire stale skills through a PURGE-LEDGER. Real
    governance, not just accretion.

**Next**

11. **[next] Graph search / filter** — query and filter the KG by type, use-case, or token impact;
    keeps the graph legible as capsules scale past a hand-countable set.
12. **[next] Token-budget ROI planner** — model "adopt vs pin" decisions against a token budget so
    teams adopt by cost, not vibes; makes governance quantitative.
13. **[next] Chat → capsule write-back** — let a useful chat exchange mint a capsule directly, so the
    recall surface also feeds the capture loop.
14. **[next] Governance viewer — merge-ledger + purge-ledger UI** — surface the `promotion/<skill>`
    staging refs, the agentic-CI pass/fail, the dedup/do-undo MERGE-LEDGER and the PURGE-LEDGER across
    `dee` / `ven` / `saim` so the enterprise governance model is legible and auditable on one screen.

---

## 3. Why this wins for 8090

8090's pitch is the Software Factory: enterprise software built by governed agents, where **no
change exists without a requirement behind it**. CAPSULE is the **capture + feedback (RL) layer** that
makes that thesis real — it shows, on one screen, that agent work is provenance-traced, measurably
cheaper over time, and promoted under a governed pipeline (local registry → end-of-day CI-gated PR →
published, with dedup, do/undo conflict resolution and a purge lifecycle). It is differentiated (an
RL compounding loop, not a chat history), defensible (memory follows the entity via Backboard, not
the model vendor), and quantified with **real, internally consistent** numbers a judge can audit live
— a 28-skill enterprise registry (13 real + 15 popular), 43,032 tokens saved (computed), 46 avg
transfer, 63% adoption, LLM-judged scoring, and a multi-sample A/B eval with measured token deltas
(including a truthfully-reported 0). The clincher: CAPSULE **captured its own build session** and
promoted `ui-modularity@1.0.0` into the enterprise registry — the loop demonstrably closes on itself.
It is the asset an enterprise keeps even as models, teams, and projects churn.
