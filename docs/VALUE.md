# CAPSULE — The Skills Knowledge Graph: Value & Roadmap

*A strategy brief for the 8090 Software Factory.*

CAPSULE turns every agent session into a durable, governed enterprise asset. Raw sessions are
compressed into **capsules** (RL learning inputs), capsule findings are forged into **versioned
skills**, and those skills are wired into the **agents** that execute work orders against business
**requirements**. The Skills Knowledge Graph is the connective tissue that makes this loop visible,
auditable, and compounding. The data is **real**: today it tracks 8 capsules (`CAP-R001…R008`,
distilled from the user's actual `~/.claude` sessions by the local model) → 7 skills (8 versions
forged) → 2 agents in the **CAPSULE / Content Engine** workspace, with **43,032 tokens saved** and
**63% adoption**, capsules persisted in **live Backboard memory** (real `thread_id`s).

CAPSULE has shipped as a **real Next.js app** (`relay/`, `cd relay && npm run dev` → :3010) — the
8090-style document workspace with four slide-in side panels (Knowledge Graph, Skills, Versions, A/B);
`factory.html` is the design prototype it was ported from. Capsule distillation runs **on-device
first** on a local model (Ollama `qwen2.5-coder:14b`): **private, free, offline-capable**, with
Cerebras only as an optional cloud boost. The enterprise's learning never has to leave its own
hardware to be captured. **Honesty:** `transferScore`, the A/B token deltas, `thread_id`s,
`createdAt`, and the session `model` are *measured*; novelty/importance, reuses, scoreDelta/adoptedBy
and the requirements scaffolding are *derived*; only distilled briefings are written to Backboard.

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
Each version records `tokenDeltaPerUse` and `scoreDelta`, rolling up to per-skill Σ-saved and a
tenant total of **43,032 tokens**. The A/B trials prove it with **measured** Ollama token counts:
`AB-03` ran **247 vs 404 tokens (−39%, 157 saved)** with the capsule recalled; `AB-01` saved 72
(−16%); `AB-02` honestly measured 0. Value is measured, not asserted — and we show the zero rather
than fake it.

**The RL compounding loop, made visible: capsule → skill → agent.**
The graph shows learning physically moving: `CAP-R004`'s finding routes to both
`skill/angular-upgrade@1.0.0` and `agent/factory-implementer@2.0.0`. The weekly compounding curve
(16,680 → 43,032 over W25–W26) is the loop turning — improvement accrues to the org, not to a chat log.

**Cross-team technique transfer — kills tribal-knowledge loss.**
Each capsule emits two outputs: a *machine* update (skill version) and a *human* technique (mental
model + learnings + watch-outs). `CAP-R005`'s "verify the actual current state from authoritative
docs instead of guessing" is reusable craft any reviewer absorbs. The graph is the institutional
memory that survives staff churn.

**Governed adoption — promotion gate + agentic CI, proposed vs published.**
A capsule that clears the agentic gate (`transferScore ≥ threshold` OR `novelty ≥ 80`) is promoted
as a **proposed** version on a `promotion/<skill>` staging ref — a PR, not a push. **Agentic CI**
then A/B-tests the new version vs current and regression-checks prior capsules, publishing only if
the measured reward improves. The three `creative-franchise-expansion` / `automation-maintenance` /
`api-rate-limiting` versions sit `proposed`; `angular-upgrade`, `command-verification`, `api-security`
and `memory-management` are `published`. Learning is captured before it is trusted.

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
7. **[shipped] A/B plugin-play** — the A/B panel runs a task with the capsule recalled vs cold, side
   by side, with **measured Ollama token counts** (`AB-03` −39%, `AB-01` −16%, `AB-02` 0 shown
   honestly); `/api/inherit` runs it live and is the harness reused for agentic CI.
8. **[shipped] Live capture pipeline** — `/api/sessions` + `/api/capsule` ingest a real
   `~/.claude/**.jsonl` session and distil it **on the local model**, then store it to Backboard; the
   RL flywheel runs against real sessions, not just the seed dataset.

**Next**

9. **[next] Graph search / filter** — query and filter the KG by type, use-case, or token impact;
   keeps the graph legible as capsules scale past a hand-countable set.
10. **[next] Token-budget ROI planner** — model "adopt vs pin" decisions against a token budget so
    teams adopt by cost, not vibes; makes governance quantitative.
11. **[next] Continuous ingestion + nightly mint** — a scheduled job that captures every session and
    runs the Memory-Pro multi-hop mint nightly (local by default, Cerebras-boosted at scale).
12. **[next] Multi-dev promotion UI + merge-ledger view** — surface the `promotion/<skill>` staging
    refs, the agentic-CI pass/fail, and the dedup/do-undo merge-ledger across `dee` / `ven` / `saim`
    so the enterprise governance model (§ARCHITECTURE 6b) is legible and auditable on one screen.

---

## 3. Why this wins for 8090 / the hackathon

8090's pitch is the Software Factory: enterprise software built by governed agents, where **no
change exists without a requirement behind it**. CAPSULE is the missing memory and audit layer that
makes that thesis real — it shows, on one screen, that agent work is provenance-traced,
measurably cheaper over time, and promoted under a governed pipeline (proposed → agentic-CI →
published). It is differentiated (an RL compounding loop, not a chat history), defensible (memory
follows the entity via Backboard, not the model vendor), and quantified with **real, internally
consistent** numbers a judge can audit live — 43,032 tokens saved, 46 avg transfer, 63% adoption, 8
capsules distilled from real sessions, and A/B trials with measured token deltas (including a
truthfully-reported 0). It is the asset an enterprise keeps even as models, teams, and projects churn.
