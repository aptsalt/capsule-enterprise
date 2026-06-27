# CAPSULE — Architecture

> The CAPTURE + FEEDBACK (reinforcement) layer for the enterprise Software Factory.
> Engineering + judge reference. Companion docs: `MEMORY-MODEL.md` (Backboard memory layer).
>
> **Implementation status.** CAPSULE is a **real Next.js App-Router app** at `relay/`
> (`cd relay && npm run dev` → http://localhost:3010). `factory.html` is the original design
> prototype it was ported from. The canonical mock dataset is `relay/src/lib/data.ts` (typed by
> `relay/src/lib/types.ts`) — all schema fields and numbers below resolve to it. Live capture/
> distillation runs **on-device first** on a local Ollama model (`qwen2.5-coder:14b`); see §14.

---

## 1. Problem

Context dies at the session boundary.

Every Claude Code / agent session builds a rich, expensive mental model — the intent behind a
change, the decisions taken and rejected, the gotchas discovered the hard way, the way the system
*actually* fits together. When the session ends, **all of it evaporates.** The next session (next
day, next teammate, next model) re-derives the same knowledge from scratch, paying the same tokens
to relearn what was already learned. Knowledge does not compound; it is continuously re-bought.

8090's Software Factory captures intent **BEFORE building**: Requirements → Blueprints → Work Orders
→ Tests → Knowledge Graph. That is the forward plan. What it does not have is a loop that captures
what is learned **DURING building** and feeds it back so the factory gets smarter every session.

**CAPSULE is that missing layer.** It captures the important, novel learning *during* each session,
compresses it into a **capsule**, stores it in durable memory, and feeds it back into the next
session — turning a one-way pipeline into a **reinforcement loop**. 8090 plans; CAPSULE remembers
and compounds.

```
  8090 Software Factory  (captures intent BEFORE building)
  Requirements -> Blueprints -> Work Orders -> Tests -> Knowledge Graph
                                                              ^
                                                              | feedback
  CAPSULE  (captures learning DURING building, feeds it back) |
  session -> capsule -> Backboard memory -> versioned skill --+
```

---

## 2. System Overview

CAPSULE is a panel that lives **on top of** 8090's native Knowledge Graph. It adds three things the
factory lacks: a **capturer** (turns sessions into capsules), a **distiller/version-minter** (turns
capsules into versioned skills/agents), and a **reward ledger** (measures token value so the loop is
self-justifying). Memory is held in **Backboard**, keyed to the enterprise entity, never to a model.

```
                         +-------------------------------------------------+
                         |              8090 SOFTWARE FACTORY              |
                         |  Requirements -> Blueprints -> Work Orders ->   |
                         |                Tests -> Knowledge Graph         |
                         +--------------------+----------------------------+
                                              |  (CAPSULE panel sits on top
                                              |   of the Knowledge Graph)
   +------------------+   capture (DURING)    v   inject (session-open / select)
   | Claude Code /    |---------------------> +------------------+ <----------------+
   | agent SESSION    |   intent, decisions,  |    CAPSULE       |  retrieve +      |
   | (any of 17,000+  |   gotchas, model,     |    capturer +    |  re-fit to model |
   |  BYOK models)    |   learnings           |    distiller +   |                  |
   +------------------+                       |    RL ledger     |                  |
            ^                                 +---------+--------+                   |
            |  inject prior knowledge                   | mint version              |
            |  (Adaptive Context Mgmt re-fits)          v (patch/minor/major)       |
            |                                +--------------------------+           |
            |                                |  ENTERPRISE SKILL REPO   |           |
            |                                |  skill/<id>@<semver>     |           |
            |                                |  pull / pin / adopt      |           |
            |                                +-----------+--------------+           |
            |                                            |                          |
            +--------------------------------------------+--------------------------+
                                                         |
                                          send_to_llm=false (store-only writes)
                                                         v
                              +--------------------------------------------+
                              |   BACKBOARD  (durable memory substrate)    |
                              |   assistant_id = capsule-<enterprise>      |  <- tenant boundary
                              |   threads = projects | durable mem = skills|
                              |   #1 LoCoMo / LongMemEval                  |
                              +--------------------------------------------+
```

The workspace (`relay/src/lib/data.ts`) is the **CAPSULE** enterprise, project **Content Engine**,
tenant assistant `capsule`, on **Memory Pro**, 4 seats. The dataset is **real**: 8 capsules
(`CAP-R001…R008`) were distilled from the user's actual `~/.claude` sessions by the local Ollama
model `qwen2.5-coder:14b`, and have compounded into **7 versioned enterprise skills** (8 versions
forged), saving **43,032 tokens** to date. **Honesty line:** `transferScore`, the A/B token deltas,
`thread_id`s, `createdAt`, and the session `model` are **measured**; `novelty`/`importance`,
`reuses`, non-A/B `tokensSavedPerReuse`, `scoreDelta`/`adoptedBy`, and the requirements/work-order
scaffolding are **derived**. Only the **distilled briefings** are written to live Backboard memory.

---

## 3. The RL Loop

CAPSULE is a six-stage reinforcement loop. The reward signal is **tokens** — no human labels.

```
  CAPTURE --> DISTILL --> SCORE --> VERSION --> ADOPT --> COMPOUND
     ^                                                       |
     +-------------------------------------------------------+
            every session feeds the next; value accrues to the entity
```

1. **CAPTURE.** A session ends or checkpoints. The capturer distills only what is *important AND
   novel* — intent, decisions (`what`/`why`/`file`), gotchas, mental model, learnings — into a
   compressed capsule and writes it store-only to Backboard. The tokens spent producing that
   summary are the **DEBIT** (`capsule.tokensSpent`).
2. **DISTILL.** Each session transcript is distilled into a structured capsule. Distillation runs
   **on the LOCAL model first** — Ollama `qwen2.5-coder:14b`, on-device, private, free, offline-
   capable — so capture is cheap enough to run on *every* session with no per-token cloud cost and
   no data egress. The nightly job (Memory Pro, multi-hop) reads the day's capsules, deduplicates
   against existing skill memory, and decides what is genuinely new versus a refinement of known
   guidance. Cerebras is an **optional cloud boost** (only when `CEREBRAS_API_KEY` is set) when you
   want wafer-scale speed for the cross-tenant nightly job; a heuristic is the last-resort backfill.
   Full engine pipeline in §15.
3. **SCORE.** Each capsule carries `novelty`, `importance`, and `transferScore` (how well its
   learning generalizes to other projects). These rank what is worth minting and what should decay.
4. **VERSION.** A qualifying capsule **mints a new semantic version** of a skill/agent
   (`capsule.producedVersion`, e.g. `skill/angular-upgrade@1.0.0`). Patch/minor/major rules in §5.
5. **ADOPT.** At model-selection and MCP-selection time the user is shown the value of the new
   version (token savings, transfer-score lift) and **chooses** to adopt latest, keep a pinned
   version, or pull a specific version into their repo. Human adoption is the promotion gate.
6. **COMPOUND.** Each adopted version is injected into future sessions; the tokens it **saves**
   downstream are the **CREDIT** (`capsule.tokensSavedPerReuse × capsule.reuses`). Saved tokens
   accumulate per the entity and feed the next capture cycle.

### Token reward signal

```
RL reward (per capsule, per reuse) = tokens_saved_downstream  -  tokens_spent_to_create
                                   = tokensSavedPerReuse       -  (tokensSpent / lifetime reuses)
```

High positive-reward capsules are promoted into skill versions and surfaced first. Low or negative
reward capsules **decay** and stop being surfaced. The token delta is the *only* promotion currency —
no human labelling, no synthetic score. In the dataset, the rolled-up lifetime credit is
**43,032** tokens (`metrics.tokensSavedTotal`), and the three A/B trials carry **measured** Ollama
deltas: `AB-01` saved 72 (−16%), `AB-03` saved 157 (−39%), and `AB-02` honestly measured **0** (a
single-shot task where agent-loop savings aren't captured — shown rather than faked).

---

## 4. Capsule Data Model

A capsule is the unit of learning. Canonical shape (`DATA.capsules[]` in `data.js`):

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Capsule id, e.g. `CAP-R001`. |
| `session` | string | Originating session id, e.g. `2535b3ad` (a real `~/.claude` session). Dedup key for store-only writes. |
| `project` | string | Project name (e.g. `Content Engine`; resolves to a Backboard thread). |
| `author` | string | Agent or human author, e.g. `agent/factory-implementer`, `agent/quality-reviewer`. |
| `model` | string | **Measured** — model that ran the session, parsed from the jsonl (`claude-opus-4-8`). Provenance only — memory is **not** keyed by it. |
| `createdAt` | ISO 8601 | Capture timestamp. |
| `novelty` | 0–100 | How new this is versus existing memory. Gates minting. |
| `importance` | 0–100 | Business/operational weight. |
| `transferScore` | 0–100 | How well the learning generalizes to other projects. |
| `summary` | string | One-paragraph compressed mental model. |
| `learnings` | string[] | Durable facts worth carrying forward. |
| `gotchas` | string[] | Traps discovered; the highest-value, hardest-won content. |
| `decisions` | `{what, why, file}[]` | Decisions with rationale and the file they touched. |
| `tokensSpent` | int | DEBIT — tokens to produce this capsule. |
| `tokensSavedPerReuse` | int | CREDIT per downstream injection. |
| `reuses` | int | Times injected downstream. |
| `finding` | string | The one novel, durable insight distilled from the session. |
| `routedTo` | `{entity, learns, proposes, proposedVersion, status}[]` | The skills/agents the finding is routed to, each proposing a semver bump. |
| `storedIn` | string | Memory substrate (`Backboard`). |
| `threadId` | string | **Measured** — the real Backboard `thread_id` returned on first write, e.g. `d877861b-0ec9-4fe8-afe8-69ccbd74d775`. |
| `producedVersion` | string | Skill version this capsule minted, e.g. `skill/creative-franchise-expansion@1.0.0`. |

A capsule with `reuses: 0` (e.g. `CAP-R001`, whose `skill/creative-franchise-expansion@1.0.0` is
still `proposed`) has not yet earned downstream reward and is **not promoted** to a published skill
version — it sits at `proposed`, awaiting review. By contrast `CAP-R004` → `skill/angular-upgrade@1.0.0`
is `published`, adopted by 3.

Egress rule: only the **distilled briefing** is ever written to Backboard — never the raw transcript.
The distillation runs on-device on the local model, so source/session content never leaves the machine
to be summarised, and the store-only write (`send_to_llm:"false"`) never triggers a generation.

---

## 5. Semantic Versioning of Skills & Agents

Capsules mint versions. The bump encodes how the consumer must react.

| Bump | Trigger | Backward compatible? | Example (from `data.ts`) |
| --- | --- | --- | --- |
| **patch** (x.y.**Z**) | a gotcha / refinement of existing guidance | yes | a refinement that tightens an existing skill's advice without changing its contract. |
| **minor** (x.**Y**.0) | a new backward-compatible capability or pattern | yes | `agent/quality-reviewer@1.2.0` — reviews against the most recent capsule findings. |
| **major** (**X**.0.0) | changes how the skill is **invoked**, or supersedes prior guidance | **no** | `skill/command-verification@2.0.0` (from `CAP-R005`) supersedes `@1.0.0` (from `CAP-R007`). |

Rules:

- **Immutable & additive within a major.** Each minted version is an immutable record; older
  versions stay queryable because teammates may have pinned them. Adopting `@2.0.0` injects the
  *superset* of `command-verification`'s learnings.
- **Majors may supersede.** A major can *replace* prior guidance; superseded memories are tagged
  `superseded_by:<id>` and excluded when the new major is adopted. (`command-verification@1.0.0`'s
  "inspect system state" guidance is generalised by `@2.0.0`'s "check authoritative docs" — the
  `@1.0.0` → `@2.0.0` lineage, both `published`.)
- **Promotion gate.** A minted version is `proposed` until review promotes it; only measured positive
  token reward + adoption moves it to `published`. The three `skill/creative-franchise-expansion`,
  `skill/automation-maintenance`, and `skill/api-rate-limiting` versions sit at `proposed`; the
  `angular-upgrade`, `command-verification`, `api-security`, and `memory-management` versions are
  `published`. Promotion goes through a `promotion/<skill>` staging ref + agentic CI (§6b).
- **Version fields** (`DATA.skills[].versions[]`): `version`, `bump`, `derivedFromCapsule`,
  `changelog`, `tokenDeltaPerUse` (negative = tokens **saved** per use), `scoreDelta`, `adoptedBy`,
  `publishedAt`, `status` (`published` | `proposed`).
- **Agents version the same way** (`DATA.agents[].versions[]`): when a skill they depend on mines a
  new pattern, the agent mints a version that wires it into the default toolchain
  (e.g. `agent/factory-implementer@2.0.0` from `CAP-R002`, which adopted the latest skill versions
  into its toolchain; `agent/quality-reviewer@1.2.0` from `CAP-R008`).

---

## 6. The Enterprise Skill Repository

Skills are **enterprise-scoped** (`scope: "enterprise"`), not per-developer. The repository is the
shared, versioned library every teammate draws from. Each skill (`DATA.skills[]`) has an `id`,
`name`, `description`, `repoPath` (`capsule://skills/<id>`), `currentVersion`, `usedByAgents`, and a
full `versions[]` history.

Pin a specific version into a repo:

```
capsule pull skill/command-verification@2.0.0    # pin an exact, reproducible version
capsule pull skill/angular-upgrade@latest        # always track current
capsule adopt skill/api-security                  # adopt latest published into this project
```

- **Pin** = reproducible builds: the repo is locked to `@x.y.z` and is unaffected by later mints.
- **Adopt latest** = ride the compounding curve, accept new majors when they land.
- Any teammate, on any project/thread under the same tenant assistant, can pull any published
  version. Cross-tenant pulls are impossible — the repository is scoped by `assistant_id` (§9).

---

## 6b. Multi-Developer Promotion, Agentic CI, Dedup & Conflict

The enterprise registry is shared across developers (branches `dee`, `ven`, `saim`; §REPO-FLOW).
A capsule does not edit the registry directly — it goes through a governed promotion pipeline.

**Promotion (PR, not push).** A capsule that clears the **agentic gate**
(`transferScore >= threshold` **OR** `novelty >= 80`) is promoted as a **proposed** skill version —
i.e. a PR / a commit on a **`promotion/<skill>` staging ref** of the enterprise repo (`master`), *not*
a direct push. Human or agentic review merges it. A `proposed` version is visible but never
auto-injected until merged.

**Agentic CI — testing before upgrade.** Before publishing the proposed version, the agentic pipeline
runs the **A/B harness (new version vs current)** on representative tasks *and* regression-checks the
prior capsules the skill already serves. It merges the version bump **only if the measured reward
improves** (token savings / pass-rate / transfer lift); otherwise the version stays `proposed` or is
**rejected**. This is **CI-for-skills**: the same A/B machinery that proves a single capsule
(`data.abTrials`, measured on Ollama) is the gate that lets a version graduate.

**Dedup — one canonical capsule, many contributors.** Each capsule carries a **semantic signature**.
Near-identical capsules captured by different developers **merge into one canonical capsule** with
multiple contributors; provenance keeps *all* authors. Backboard's semantic memory merges the
underlying facts so the registry never carries two copies of the same lesson.

**Conflict — do/undo resolution.** When capsule A says "do X" and capsule B says "undo X / do Y"
against the **same skill**, the pipeline flags a **do/undo conflict** and resolves it by
**measured reward + recency**, escalating ties to human review. The resolution sets the bump:
**contradictory ⇒ major** (supersede), **additive ⇒ minor**, **refinement ⇒ patch**. Every
resolution is recorded in a **merge-ledger** so the registry's history stays auditable.

---

## 7. Backboard Memory Layer (summary of `MEMORY-MODEL.md`)

Capsules and skill memory persist in **Backboard**. Full spec in `MEMORY-MODEL.md`; the load-bearing
points:

- **Memory follows the ENTITY, not the model.** Durable memory hangs off an *assistant* via
  `assistant_id`, never a session or model id. Swap among 17,000+ BYOK LLMs mid-project and lose
  zero facts; only Adaptive Context Management changes (how much is injected per window).
- **One assistant per tenant** = structural isolation. The single tenant assistant is named
  `capsule` (created once via `POST /assistants`, then cached). There is no cross-assistant read path.
- **Project = thread.** On the **first** write for a project the `thread_id` is **omitted** so
  Backboard auto-creates one; the returned real `thread_id` (a uuid like
  `d877861b-0ec9-4fe8-afe8-69ccbd74d775`) is cached and reused. Memory persists across threads of the
  same assistant; thread scope is a *retrieval bias*, not a wall.
- **Skill memory = durable memory tagged `<id>@<semver>`** plus `kind:*` and `provenance`.
- **Store-only writes.** Every capture is `send_to_llm:"false"`: persisted and indexed, **no
  generation, no model tokens billed for the write**. Only the **distilled briefing** is stored,
  never the raw transcript. That is what makes capturing *every* session affordable and private.
- **Retrieval is semantic + LLM-guided** (not bare vector NN), fired at two points: **session-open**
  (project state) and **model/MCP selection** (capability scope). **Memory Lite** = fast single-hop;
  **Memory Pro** = deep multi-hop (used for "why did we decide X", nightly version minting, and the
  semantic-signature **dedup/merge** of near-identical capsules across developers, §6b).
- **API shape (verified live — `relay/src/lib/backboard.ts`):**
  ```http
  POST https://app.backboard.io/api/threads/messages
  X-API-Key: <key>
  { "content": "<distilled briefing>", "assistant_id": "<capsule assistant>",
    "memory": "Auto", "send_to_llm": "false" }   // thread_id omitted on first write → auto-created
  ```
- Backboard ranks **#1 on LoCoMo and LongMemEval** — the retrieval-quality basis for trusting
  LLM-guided recall over plain vector lookup.

---

## 8. Token Accounting & Self-Value

Token usage is shown **everywhere** so adoption is self-justifying — no mandate required.

- **DEBIT** — `capsule.tokensSpent`: tokens to produce the capsule summary at write time.
- **CREDIT** — `capsule.tokensSavedPerReuse × capsule.reuses`: tokens saved downstream by injecting
  the capsule instead of re-deriving the knowledge.
- **Per-version** — `tokenDeltaPerUse` (negative = saved) and `scoreDelta` (transfer-score lift)
  are surfaced at selection time so the user can self-justify adopting latest vs keeping a pin.
- **Roll-up** (`DATA.metrics`): `tokensSavedTotal: 43032`, `sessionsCaptured: 10`, `capsules: 8`,
  `skillsEvolved: 7`, `avgTransfer: 46`, `adoptionRate: 63`, plus a weekly `compounding[]` curve
  (2026-W25 16,680 → 2026-W26 43,032) that *visibly bends upward* — the picture of an enterprise that
  is learning. `avgTransfer` is the mean of the eight **measured** capsule transfer scores
  ((40+29+37+57+55+54+47+50)/8 ≈ 46).

The token delta is simultaneously the **user's ROI display** and the **system's RL reward**. One
number does both jobs.

---

## 9. Knowledge-Graph Schema

CAPSULE renders a connected graph on top of 8090's Knowledge Graph. `mem/backboard` is the central
hub through which all memory flows (`DATA.graph`).

**Node types** (`type`): `requirement`, `workorder`, `agent`, `skill`, `capsule`, `model`, `mcp`,
`memory`. Each node: `{ id, type, label, sub, refId }` (`sub` is a status/metric subtitle,
`refId` links back into the typed collections).

**Link types** (`kind`):

| `kind` | From → To | Meaning |
| --- | --- | --- |
| `implements` | workorder → requirement | a unit of work satisfies a business intent |
| `executes` | agent → workorder | an agent runs the work order |
| `uses` | agent → skill | an agent depends on a versioned skill |
| `produces` | capsule → skill | a capsule minted a skill version |
| `derives` | capsule → model | the session/model the capsule came from (provenance) |
| `stores` | capsule → memory **and** mcp → memory | capsule/MCP persists into Backboard |
| `reads` | model → memory | a model reads injected memory at session-open |

Topology rule: the graph is fully connected with `mem/backboard` as hub — every capsule `stores`
into it, every model `reads` from it, every skill is `produced` by a capsule and `used` by an agent
that `executes` a work order that `implements` a requirement. That single connected picture is the
"reinforcement loop made visible" for judges.

---

## 10. 8090 Software Factory Integration Points

CAPSULE binds to each native factory component rather than replacing any:

| 8090 component | CAPSULE integration |
| --- | --- |
| **Requirements** | Capsules and skills are traceable to the requirement they serve (`requirementId` on work orders; e.g. `REQ-003` *Prove token savings* ↔ the A/B harness). Retrieval at session-open biases toward the active requirement's context. |
| **Blueprints** | Mental-model capsules inform the next blueprint — prior decisions/gotchas surface before a new design is drafted, so blueprints stop re-litigating solved questions. |
| **Work Orders** | The capturer is wired to work-order checkpoints. When a WO completes, its session capsule is minted; open WOs drive session-open retrieval scope (`WO-101` distil → `WO-102` route → `WO-103` A/B → `WO-104` persist). |
| **Tests** | Gotchas become regression guards, and the A/B harness (`WO-103`, `agent/quality-reviewer`) is the **agentic-CI** gate that regression-checks prior capsules before a skill version is published (§6b). Test failures feed back as new capsules. |
| **Knowledge Graph** | CAPSULE's panel *is* an overlay on the native Knowledge Graph, adding `capsule`, `skill`-version, and `memory` nodes plus the `produces`/`stores`/`reads` edges that close the loop the factory was missing. |

MCP surface (`DATA.mcps`): `backboard-memory` (memory), `ollama-local` (the local distiller /
validator), `claude-code` (work-order / session source). All three are `connected`.

---

## 11. Governance, Audit & Multi-Tenant Isolation

- **Tenant isolation is structural.** One assistant per enterprise (the `capsule` tenant assistant)
  is the only tenant boundary. There is no cross-assistant read path; tenant A can never retrieve
  tenant B's capsules or skills. Isolation is a property of the store layout, not a filter applied
  after the fact (`MEMORY-MODEL.md` §1, Invariant 2).
- **Provenance on every memory.** Each durable memory carries `provenance { thread_id, capsule_id,
  session_id }` and `<id>@<semver>` tags, so any injected fact is traceable to the exact session and
  capsule that produced it. After **dedup**, a canonical capsule keeps *all* contributing authors (§6b).
- **Immutable version history + merge-ledger.** Minted versions are immutable and append-only; majors
  mark prior guidance `superseded_by` rather than mutating it. The full `versions[]` history is an
  auditable changelog (`derivedFromCapsule`, `learnedFrom`, `publishedAt`, `adoptedBy`, `status`), and
  every do/undo conflict resolution is recorded in the **merge-ledger** (§6b).
- **Promotion gate + agentic CI.** Nothing auto-publishes on tokens alone: a clearing capsule is
  promoted as a `proposed` version on a `promotion/<skill>` staging ref, and **agentic CI** only
  merges the bump if the measured A/B reward improves — giving compliance a sign-off checkpoint. The
  three `creative-franchise-expansion` / `automation-maintenance` / `api-rate-limiting` versions sit
  at `proposed`.
- **Data-egress control.** Distillation runs on-device on the local model and only the **distilled
  briefing** is stored — never the raw transcript — so source content never leaves the machine to be
  summarised.
- **Store-only writes never generate**, so capture cannot exfiltrate via an LLM round-trip
  (`send_to_llm:"false"`, Invariant 3).

---

## 12. Sponsor Alignment

| Sponsor | Role in CAPSULE |
| --- | --- |
| **8090** | The Software Factory CAPSULE extends. CAPSULE is the missing CAPTURE + FEEDBACK layer on top of Requirements → Blueprints → Work Orders → Tests → Knowledge Graph — turning the one-way pipeline into a compounding RL loop. |
| **Local model (Ollama · qwen2.5-coder:14b)** | **On-device distillation — the default engine.** Capsules are distilled locally first: private, free, no network egress, offline-capable. This is what makes capturing *every* session affordable, so the token-reward signal is real rather than aspirational. |
| **Cerebras** | **Optional distill boost.** When `CEREBRAS_API_KEY` is set, the nightly Memory-Pro distillation + version-minting job can run multi-hop reasoning over every tenant's day of capsules at wafer-scale speed — for when you scale the nightly job past a single machine. |
| **Backboard** | **Memory.** The durable substrate — assistant-per-tenant isolation, entity-not-model persistence across 17,000+ BYOK LLMs, semantic + LLM-guided recall, `send_to_llm=false` store-only writes. #1 on LoCoMo / LongMemEval. |
| **Docker** | **Reproducible handoff.** `capsule pull skill/<id>@x.y.z` pins an exact, immutable skill version into a repo — the same way a Docker image pins an environment. Capsules + pinned skill versions package an agent's learned context for byte-reproducible handoff between teammates, machines, and models. |

---

## 13. Invariants (must always hold)

1. No memory is keyed by model id — every durable memory is keyed by `assistant_id` (the `capsule` tenant assistant).
2. One assistant per tenant; retrieval never crosses the assistant boundary.
3. Every capture is `send_to_llm:"false"` — writes never generate, never bill model tokens.
4. Skill memories are always tagged `<id>@<semver>`; untagged learnings are never minted.
5. Versions are immutable and additive within a major; a major may supersede, never mutate in place.
6. Retrieval is semantic + LLM-guided at session-open and at model/MCP selection — never a bare
   vector lookup as the final ranker.
7. The token delta (`tokens_saved_downstream − tokens_spent_to_create`) is the only reward; nothing
   promotes on anything else.
8. Memory follows the entity across all 17,000+ BYOK models — switching models re-fits, never re-derives.
9. The rolled-up `metrics.tokensSavedTotal` is **43,032**; the three `abTrials` token deltas are **measured** on the local model.
10. A clearing capsule is promoted as a `proposed` version on a `promotion/<skill>` ref; **agentic CI** publishes it only if the measured A/B reward improves (§6b).
11. Distillation defaults to the **local** model, and only the distilled briefing is stored — no per-token cloud cost or transcript egress is required to capture a session.
12. Near-identical capsules from different developers **dedup** into one canonical capsule (all authors kept); do/undo conflicts resolve by measured reward + recency and are logged in the merge-ledger (§6b).

---

## 14. The App — workspace shell, side-panel UX & API routes

CAPSULE ships as a Next.js App-Router app (`relay/`, TypeScript strict, React 19, Zustand, Tailwind v4;
`cd relay && npm run dev` → `http://localhost:3010`). It mirrors 8090's document-editor identity:
a top bar (CAPSULE / Content Engine org chip + doc tabs), a left sidebar (doc tree, *Capsules from
today*, use-case search), the requirements editor, and a right rail.

### Side-panel UX

The body is a four-column CSS grid that animates:

```
sidebar 248px · editor 1fr · side-panel 0→360px (animated) · right rail 322px
```

Exactly **one** side panel renders at a time, chosen by `store.openPanel` (`PanelId =
'graph' | 'skills' | 'versions' | 'ab' | null`). The side-panel column animates from `0` → `360px`
when a panel opens (the `.body.panel-open` transition ported from `factory.html`). **Esc** closes it.
The four top-level panels:

| Panel (`openPanel`) | Component | Surface |
| --- | --- | --- |
| **Knowledge Graph** (`graph`) | `KnowledgeGraphPanel` + `ForceGraph` | the connected graph; click any node for a provenance trace (`selectors.provenanceFor`). |
| **Skills** (`skills`) | `SkillsPanel` + `SkillCard` | enterprise registry, use-case recommender, impact roll-up (Σ saved + adoption %), compounding sparkline, per-skill cards. |
| **Versions** (`versions`) | `VersionsPanel` | day-grouped semver history (Latest / Proposed badges); tick two to diff changelog + guidance word-by-word. |
| **A/B** (`ab`) | `AbTrialsPanel` | each `data.abTrials` task run **with the capsule recalled vs cold**, side by side: tokens, steps, pass/fail, transfer, duration. |

Triggers: the right-rail **Actions** grid (Graph / Skills / Versions / A/B / Diff / Audit trail), the
sidebar use-case search (→ Skills), each *Capsules from today* row (→ Graph, focusing that node), and
the composer's *Skills ▾ / Recommended ▾* buttons. All UI state flows through a single Zustand store
(`store.ts`); the canonical `data` module stays immutable and **adoption is modelled as an overlay**
(`adopted: skillId → version`), never a dataset mutation.

### API routes (`relay/src/app/api`)

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/sessions` | GET | list real `~/.claude/projects/**.jsonl` sessions available to capture (`capture.listSessions`). |
| `/api/capsule` | POST | capture one real session → **distil on the local model** → score → store. Body `{ path? , index? }`; returns `{ capsule, engine, ms, score, store }`, where `engine` reflects the local Ollama run. `maxDuration = 120`. |
| `/api/capsules` | GET | the enterprise's captured session capsules (tenant memory; `data.capsules`). |
| `/api/skills` | GET / POST | GET the enterprise skill registry; POST `{ skillId, version }` simulates **adopting** a version — a metadata op echoed back, never a dataset mutation. |
| `/api/graph` | GET | the connected knowledge graph (`selectors.buildGraph` — canonical nodes/links plus deduped capsule→skill `learns` edges). |
| `/api/inherit` | POST | **the money demo** — same question to a fresh agent **cold vs capsule-warmed**; returns `{ hasCapsule, score, cold, warm }`. Uses Cerebras if keyed, else the local Ollama model. |

---

## 15. Local-model distillation pipeline (`relay/src/lib/cerebras.ts`)

`distill(session)` turns a raw transcript into a `HandoffCapsule`. The engine order is **local first**:

```
distill():
  1. viaOllama(transcript)            // PRIMARY — local, on-device, qwen2.5-coder:14b
  2. viaCerebras(transcript)          // OPTIONAL — only if process.env.CEREBRAS_API_KEY
  3. heuristic(session)               // LAST RESORT — regex backfill, always renders
```

- **`viaOllama` (primary).** `POST http://localhost:11434/api/chat` with
  `{ model, stream:false, format:"json", messages:[{system},{user}], options:{ temperature:0.2 } }`;
  the result is read from `j.message.content`. A local model is slower than wafer-scale cloud, so the
  call is given up to ~120s via an `AbortController` rather than hard-failing. The engine label is
  **`ollama:qwen2.5-coder:14b (local)`** so the UI can show distillation ran on-device.
- **`viaCerebras` (optional boost).** Returns `null` immediately unless `CEREBRAS_API_KEY` is set;
  otherwise `POST https://api.cerebras.ai/v1/chat/completions` (`CEREBRAS_MODEL`, default
  `llama-3.3-70b`, `response_format: json_object`). Label `cerebras:<model>`.
- **`heuristic` (backfill).** Pure regex over `USER:`/`AI:`/`TOOL[...]` lines — guarantees a capsule
  renders even fully offline with no model. After any LLM run, empty fields are backfilled from the
  heuristic so a capsule is never blank (label gets a `+heuristic` suffix when used).

Env overrides: `RELAY_OLLAMA_MODEL` (default `qwen2.5-coder:14b`), `OLLAMA_URL`
(default `http://localhost:11434`), `CEREBRAS_API_KEY`, `CEREBRAS_MODEL`.

The capture path that feeds this: `capture.captureSession()` reads a Claude Code `.jsonl`, extracts
user intents + assistant text + tool actions (head + tail kept, middle trimmed to ~28k chars where
the handoff signal lives), and yields a `RawSession`. `scorer.scoreCapsule()` then rates the capsule
on six handoff dimensions (intent clarity, decision traceability, reasoning explicitness, gotcha
coverage, next-step actionability, mental-model transfer).

---

## 16. Backboard mapping in code (`relay/src/lib/backboard.ts`)

`storeCapsule(capsule)` persists a capsule to Backboard (when `BACKBOARD_API_KEY` is set) **and**
always mirrors it to a local JSON store under `~/.relay/capsules` so the demo works keyless. The
single tenant assistant (`capsule`) is created once via `POST /assistants` and cached in
`~/.capsule/backboard.json`; per-project `thread_id`s are cached there too. The typed mapping from
CAPSULE's domain onto a Backboard write envelope:

```ts
capsuleToBackboardEnvelope({ assistant_id, enterprise, project, content, skills }) => {
  assistant_id,                              // the cached `capsule` assistant — tenant wall
  tags:        (skills ?? []).map(skillMemoryTag), // `<skillId>@<semver>` — pins memory to a version
  send_to_llm: "false",                      // store-only — no generation, no model tokens
  memory:      "Auto",                       // Backboard auto-extracts durable facts
  content,                                   // the DISTILLED briefing (never the raw transcript)
}
// the wire write (storeCapsuleMemory): POST https://app.backboard.io/api/threads/messages
//   { content, assistant_id, memory:"Auto", send_to_llm:"false" [, thread_id] }
//   thread_id is OMITTED on the first write per project so Backboard auto-creates + returns it.
```

This is the code realisation of §7 and `MEMORY-MODEL.md`: the `capsule` assistant is the structural
tenant boundary, a project is a thread under that assistant (auto-created on first write), skill
memories are tagged `<id>@<semver>`, and every write is `send_to_llm:"false"`.
`latestCapsuleForProject()` powers the `/api/inherit` money demo by recalling the most recent capsule
for a project and rendering it through `capsuleToBriefing()` into the warmed agent's context.
