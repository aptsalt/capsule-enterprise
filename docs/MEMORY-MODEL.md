# CAPSULE — Memory Model Spec (Backboard-backed)

> Engineering reference for CAPSULE's durable memory layer.
> CAPSULE is the **CAPTURE + FEEDBACK (reinforcement) layer** that sits on top of
> 8090's Software Factory (Requirements → Blueprints → Work Orders → Tests → Knowledge Graph).
> Every Claude Code / agent session produces a **capsule** (a compressed summary of what is
> *important and novel*), and capsules compound into versioned skills. The memory substrate is
> **Backboard**.
>
> **Implemented in the app.** This spec is realised in `relay/` (GitHub `aptsalt/capsule`, `main` =
> merge `5968a51`; `cd relay && npm run dev` → :3010). The Backboard envelope mapping below is
> `relay/src/lib/backboard.ts`; the capsule is distilled **on-device first** by a local Ollama
> model (`qwen2.5-coder:14b`) in `relay/src/lib/cerebras.ts` (chunked map-reduce for big sessions),
> and scored by an **LLM-judge** (`scoreCapsuleLLM`) — so the *production* of a capsule costs no cloud
> tokens and leaks no data off the machine, and the *write* of it costs no model tokens at all
> (`send_to_llm:"false"`, §4). The merged **AGENT CHAT** (PR #1) is also memory-backed: every chat
> turn lands in one Backboard thread under the same `capsule` assistant, and prior turns resurface via
> semantic recall rather than being resent (§5a).

---

## 0. One-paragraph mental model

A **capsule** is the unit of learning. Memory in CAPSULE is **attached to an entity** (a user, a
team, or a workflow), never to a session or a model. The entity is represented inside Backboard as
an **assistant**; durable facts hang off that assistant via `assistant_id`. Because there is exactly
**one assistant per enterprise workspace/tenant**, memory is naturally **tenant-siloed**. A
**project** is a Backboard **thread**. A **skill's accumulated learnings** are durable memories
**tagged by skill id + semver**. Writes are made with `send_to_llm:"false"` (store context, no
generation). Retrieval is **semantic + LLM-guided**, fired at session-open and again at model/MCP
selection. The number of tokens an injected memory *saves downstream* is the **RL reward**.

---

## 1. Entity model — assistant-per-tenant isolation

Backboard is organized around two primitives: **assistants** and **threads**. Durable memory is
attached to an **entity** through `assistant_id`. CAPSULE maps its domain onto these primitives as
follows.

| CAPSULE concept | Backboard primitive | Identifier |
| --- | --- | --- |
| Enterprise workspace / tenant | **Assistant** | `assistant_id` = `capsule-<enterprise>` |
| Project / repo | **Thread** | `thread_id` |
| Session capsule | **Message** (memory write) on a thread | message id |
| Skill's accumulated learnings | **Durable memory** | tagged `skill:<id>@<semver>` |

**The tenant boundary is the assistant.** Each enterprise gets exactly one assistant,
`capsule-<enterprise>` (e.g. `capsule-acme`). All of that enterprise's memories — every capsule,
every skill learning — live under that one `assistant_id`. There is **no cross-assistant read path**,
so tenant A can never retrieve tenant B's memory. Isolation is structural, not a filter applied after
the fact:

```
assistant_id = capsule-acme         assistant_id = capsule-globex
   |                                    |
   +-- thread: repo/web-app            +-- thread: repo/billing
   +-- thread: repo/data-pipeline      +-- thread: repo/mobile
   +-- durable mem: skill:pr-review@2.3.1
   +-- durable mem: skill:migrations@1.4.0
        (none of these are visible to capsule-globex)
```

Memories **persist across threads** for the same assistant: a gotcha learned in
`repo/web-app` is retrievable when working in `repo/data-pipeline`, because both threads resolve to
`capsule-acme`. Thread scoping is a *retrieval hint*, not an isolation wall — the wall is the
assistant.

### Identifier conventions

- `assistant_id`: in the shipped app there is **one** tenant assistant, created once via
  `POST /assistants` with `name: "capsule"` and cached in `~/.capsule/backboard.json` — stable for the
  life of the tenant. (Conceptually `capsule-<enterprise-slug>` when running multiple tenants.)
- `thread_id`: a real Backboard **uuid** (e.g. `d877861b-0ec9-4fe8-afe8-69ccbd74d775`), one per
  project/repo. **Auto-created** by Backboard on the first write (we omit `thread_id`), then cached and
  reused. A stable local key `projectThreadKey(enterprise, project)` → `<ent-slug>__<proj-slug>` maps a
  project to its cached uuid.
- Skill tag: `<skill-id>@<major>.<minor>.<patch>` — attached to every durable memory derived from that
  skill's learnings.

---

## 2. Project-as-thread

A **project = a thread**. Opening a project in CAPSULE opens (or creates) the corresponding Backboard
thread under the tenant's assistant.

- The thread is the **conversational spine** of the project: capsules are appended to it as messages.
- The thread carries **project-local recency** (what happened most recently *here*), while the
  assistant carries **cross-project durability** (what this tenant knows everywhere).
- Retrieval at session-open queries **the assistant** (all of the tenant's memory) but **biases
  toward the current thread** — project-local capsules rank higher, cross-project durable skills are
  still reachable.

Practically: a developer who switches from `web-app` to `billing` keeps the enterprise's skill
memory but sees the *billing* thread's own decisions surfaced first.

---

## 3. Skill memories — tagged by id + semver

Each enterprise skill is an entry in the **enterprise-level skill repository**. A skill's
*accumulated learnings* are stored as **durable memories on the tenant's assistant**, every one
**tagged with the skill's id and semantic version**.

```
durable_memory {
  assistant_id: "capsule-acme",
  tags: ["skill:pr-review", "skill:pr-review@2.3.1", "kind:gotcha"],
  body: "When reviewing Terraform PRs, require a plan output diff; reject if
         `apply` is run before review (caused prod drift on 2026-05-04).",
  provenance: { thread_id: "proj-...", capsule_id: "...", session_id: "..." }
}
```

### Semantic versioning of skills (how a capsule mints a version)

Daily, learned capsules are distilled and used to **mint a new skill version**:

| Bump | Trigger | Example |
| --- | --- | --- |
| **patch** (x.y.**Z**) | a gotcha / refinement | "add retry on 429 from the migrations API" |
| **minor** (x.**Y**.0) | a new backward-compatible capability or pattern | "skill now also generates rollback scripts" |
| **major** (**X**.0.0) | changes how the skill is **invoked**, or supersedes prior guidance | "skill no longer takes a raw SQL arg; takes a migration plan object" |

- Each minted version is an **immutable** record. Older versions remain queryable (a teammate may
  have **pinned** an older version into their repo).
- The semver tag on the durable memory is what lets retrieval return *the version the user adopted*,
  not just "the latest."
- Memory tagged `skill:pr-review@2.3.1` is **additive** over `@2.3.0` — adopting `@2.3.1` injects the
  superset of learnings; adopting a **major** may *replace* superseded guidance (the prior major's
  memories are tagged `superseded_by:<id>` and excluded when the new major is adopted).

### 3a. Multi-developer dedup & do/undo conflict

The registry is shared across developers (branches `dee`, `ven`, `saim`). Two governance rules keep
the durable memory clean when several people capture overlapping lessons:

- **Dedup — one canonical capsule, many contributors.** Every capsule carries a **semantic
  signature**. Near-identical capsules from different developers **merge into one canonical capsule**;
  provenance keeps *all* authors. Backboard's semantic memory (`memory:"Auto"`) merges the underlying
  facts, so the assistant never stores two copies of the same lesson.
- **Conflict — do/undo resolution.** When capsule A says "do X" and capsule B says "undo X / do Y"
  against the **same skill**, the pipeline flags a **do/undo conflict** and resolves it by
  **measured reward + recency**, escalating ties to human review. The resolution drives the bump:
  **contradictory ⇒ major** (supersede), **additive ⇒ minor**, **refinement ⇒ patch**. Every
  resolution is written to a **merge-ledger** so the registry's history stays auditable.

This is where promotion happens: a capsule clearing the agentic gate becomes a **proposed** version
on a `promotion/<skill>` staging ref, and **agentic CI** (the multi-sample A/B harness vs the current
version + regression-checks of prior capsules) merges it only if the measured reward improves. The
inverse pole, **PURGE/RETIRE** (`active → deprecated → archived → purged`, logged in a PURGE-LEDGER),
retires skills that stop paying rent — but it only retires the **on-disk registry artifact**; the
distilled briefings and threads that back each skill **stay in Backboard memory**, so durable memory
and its provenance are never touched. Full model in `ARCHITECTURE.md` §6b, §19.

---

## 4. `send_to_llm:"false"` writes (store context, no generation)

Capsule writes are **pure memory writes**. They use Backboard's `send_to_llm:"false"` semantics: the
content is **persisted and indexed for future retrieval**, but **no LLM generation is triggered** and
**no model tokens are billed** for the write itself. This is what makes capture cheap enough to run on
*every* session.

- A capsule write is **idempotent-ish per session**: re-writing the same session capsule updates,
  not duplicates (dedup on `session_id`).
- The write still costs the (small, measured) tokens of *producing* the compressed capsule summary
  upstream — that cost is recorded as the **debit** side of the RL reward ledger (§6). In the app
  that summary is produced by the **local** model (`qwen2.5-coder:14b`) by default, so the debit is
  paid in free on-device compute rather than metered cloud inference (engine order:
  local Ollama → optional Cerebras → heuristic; see `ARCHITECTURE.md` §15).

The verified-live Backboard API shape (`relay/src/lib/backboard.ts`):

```
POST https://app.backboard.io/api/threads/messages
X-API-Key: <key>
Content-Type: application/json

{
  "content": "<distilled briefing>",   // the DISTILLED capsule, never the raw transcript
  "assistant_id": "<capsule assistant>", // the single tenant assistant, named "capsule"
  "memory": "Auto",                     // Backboard decides what is durable vs ephemeral
  "send_to_llm": "false"                // store-only; no generation, no model tokens
  // thread_id is OMITTED on the FIRST write for a project so Backboard auto-creates one;
  // the returned real thread_id (a uuid) is cached and reused for every later write.
}
```

> `memory: "Auto"` lets Backboard's memory engine extract and promote durable facts from the capsule
> body automatically — and **merge** semantically-equivalent facts from different developers (the
> dedup substrate behind §3a); CAPSULE additionally attaches explicit skill/semver tags for
> deterministic recall. The tenant assistant is created once via `POST /assistants` and cached in
> `~/.capsule/backboard.json`.

---

## 5. Semantic, LLM-guided retrieval (two fire points)

Retrieval is **not plain vector nearest-neighbor**. Backboard runs **semantic + LLM-guided**
retrieval: a model reasons over candidate memories to select what is *relevant to the current intent*
(handles multi-hop, disambiguation, recency-vs-importance trade-offs). CAPSULE fires retrieval at two
moments:

### Fire point A — session-open
When a project/thread opens, CAPSULE retrieves the capsules and skill memories most relevant to the
project's current state (open work orders, recent blueprints, the files in play) and injects them as
context. This is the **"start where the last session left off + everything the tenant has learned that
applies here"** moment.

### Fire point B — model-selection & MCP-selection
When the user picks a model or an MCP server, CAPSULE retrieves the skill memories tagged for that
capability and shows **which capsule/skill version applies**, plus the **value of adopting the latest
version** (token savings, transfer-score lift). The user **chooses** whether to adopt the latest or
keep a pinned version (§7). Retrieval here is scoped by the *capability* the model/MCP provides, so a
user selecting a "migrations" MCP is offered the `skill:migrations@*` memories.

### Memory Lite vs Memory Pro

CAPSULE selects the retrieval depth per fire point:

| Mode | What it does | Used for |
| --- | --- | --- |
| **Memory Lite** | fast single-hop recall, low latency | session-open quick context, autocomplete-grade injection, model/MCP hover previews |
| **Memory Pro** | deep **multi-hop** reasoning over the memory graph | "why did we decide X", cross-project synthesis, mint-a-version distillation, conflict resolution between skill versions |

Both modes read the **same** assistant-scoped store; they differ only in retrieval effort. Lite is the
default; Pro is invoked explicitly (deep questions) or by the nightly version-minting job.

### 5a. Agent-chat memory (the in-app composer)

The merged **AGENT CHAT** (`POST /api/chat`, lib `relay/src/lib/chatContext.ts`) is the third place
memory is read and written. All chat turns share **one** Backboard thread (`CHAT_THREAD_KEY =
"relay-chat"`) under the `capsule` assistant. On each turn:

- **Read.** When *Capsule context* is on, `retrieveMemory(lastUser)` pulls the most relevant prior
  capsules + past chat turns from Backboard and `buildSystemPrompt()` injects them (plus the latest
  capsule briefing and any composer-attached skills) as the system prompt — so the agent answers warm.
- **Bounded.** Only the last `MAX_CONTEXT_MSGS` turns are sent to the model; older turns are *not*
  lost — they live in Backboard and resurface via semantic recall when relevant, keeping token cost
  flat as a conversation grows.
- **Observable.** `POST /api/chat/context` returns the exact prompt + recalled memory that *would* be
  sent, without generating — the observability seam.
- **Durable.** Each conversation is also mirrored to `~/.relay/chats/<id>.json` with an LLM-generated
  title, so a chat session can itself later be distilled into a capsule.

### Adaptive Context Management
After retrieval, **Adaptive Context Management** trims/summarizes the selected memories to fit the
**chosen model's context window**. Because memory follows the entity (§6), the *same* memory set is
re-fit to whatever model is selected — a 200k-window model gets more verbatim capsules; an 8k-window
model gets a tighter summary. The fit step never changes *which* facts are eligible, only their
verbosity.

---

## 6. "Memory follows the entity, not the model"

The durable store is keyed by `assistant_id` (the entity), **never** by model id. Consequences:

- A tenant can **swap among 17,000+ LLMs (BYOK)** — change provider, change model, mid-project — and
  **lose zero facts**. The capsule that taught "our auth uses rotating JWKS" is just as available to
  GPT-class, Gemini-class, Llama-class, or Claude-class models.
- Model choice affects only **Adaptive Context Management** (how much of the memory is injected, §5),
  not **what exists**.
- This is the property that lets §7's "adopt latest version?" prompt be model-agnostic: the version
  you adopt rides with you across model switches.

```
                 ENTITY (assistant_id = capsule-acme)
                 +---------------------------------+
                 |  capsules + skill memories      |   <-- the durable truth
                 +----------------+----------------+
                                  |
        +-------------+-----------+-----------+-------------+
        v             v                       v             v
   Model A        Model B                 Model C       Model N
  (Claude)       (GPT-x)                 (Gemini)      (BYOK ...)
   same facts,    same facts,             same facts,   same facts,
   re-fit to A's  re-fit to B's           re-fit to C's re-fit to N's
   window         window                  window        window
```

---

## 7. Adoption at selection time + token usage everywhere

At model/MCP selection (Fire point B), the user is shown, per applicable skill:

- current pinned version vs latest minted version,
- **token savings** projected from adopting (median downstream tokens saved by injecting this
  version's memory),
- **transfer-score lift** (how well this version's learnings have transferred to other projects).

The user **self-justifies**: adopt latest, keep pinned, or pull a *specific* version into their repo
(skills are an **enterprise-level repository**; any teammate can **pin a version** or **adopt latest**).

**Token usage is shown everywhere** so value is self-evident:

- **Debit:** tokens spent *producing* a capsule (the compression summary) at write time.
- **Credit:** tokens *saved downstream* when that capsule/skill memory is injected instead of
  re-deriving the knowledge.

```
RL reward (per capsule, per reuse) = tokens_saved_downstream − tokens_spent_to_create
```

This **token delta is the RL reward signal** that drives the enterprise reinforcement loop: capsules
with high positive reward get promoted/minted into skill versions; low/negative-reward capsules decay
and are not surfaced. Token reduction from injected memory is the **measurable** reward — no human
labels required.

---

## 8. Write sequence (capture)

A session ends (or checkpoints). CAPSULE compresses what is important/novel and writes it as a
store-only memory.

```
 Claude Code / agent session
        |
        | 1. session ends or checkpoints
        v
 +--------------------+
 | CAPSULE capturer   |  2. distill IMPORTANT + NOVEL only
 |  (intent,          |     -> compressed capsule body
 |   decisions,       |  3. measure tokens_spent_to_create  (DEBIT)
 |   gotchas,         |
 |   mental model,    |
 |   learnings)       |
 +---------+----------+
           | 4. resolve tenant -> assistant_id = the "capsule" assistant
           |    resolve project -> thread_id (omit on first write -> auto-created)
           |    attach tags: <id>@<semver>, kind:*, provenance
           v
 +----------------------------------------------------+
 | POST https://app.backboard.io/api/threads/messages |
 | X-API-Key: <key>                                   |
 | { content:<distilled briefing>, assistant_id,      |
 |   memory:"Auto", send_to_llm:"false" }             |   5. STORE-ONLY: no generation, no model tokens
 +-----------------------+----------------------------+
                         |
                         v
            Backboard durable memory
            (keyed by assistant_id = ENTITY)
                         |
                         | 6. capsule now visible across ALL threads
                         |    of this assistant; eligible for nightly
                         v    version-minting (patch/minor/major)
            Knowledge-Graph panel (on top of 8090 Software Factory)
```

## 9. Read sequence (retrieve + inject + reward)

Two fire points share one pipeline; the difference is the query scope and the Lite/Pro depth.

```
 Session-open  OR  model/MCP-selection
        |
        | 1. build query intent
        |    (A: project state, open work orders, files)
        |    (B: capability of the chosen model/MCP)
        v
 +-----------------------------+
 | Backboard retrieval          |  2. scope = assistant_id (tenant)  <-- ISOLATION
 |  semantic + LLM-guided       |     bias  = current thread_id      <-- project recency
 |  (NOT plain vector NN)       |     filter= skill:<id>@<adopted-semver>
 |  Memory Lite | Memory Pro    |
 +--------------+--------------+
                |
                | 3. candidate capsules + skill memories ranked by relevance
                v
 +-----------------------------+
 | Adaptive Context Management  |  4. trim/summarize to fit CHOSEN model window
 |                              |     (memory follows ENTITY, re-fit per model)
 +--------------+--------------+
                |
                | 5. inject context into the session / show in selection UI
                v
        Session proceeds with prior knowledge
                |
                | 6. measure tokens_saved_downstream (CREDIT)
                |    reward = tokens_saved - tokens_spent_to_create
                v
 +-----------------------------+
 | RL ledger                    |  7. high-reward capsules -> promote / mint skill version
 |  (token delta = reward)      |     low/neg-reward       -> decay, stop surfacing
 +-----------------------------+
        |
        | 8. (selection only) show user: latest vs pinned,
        |    token savings + transfer-score lift -> user adopts / pins
        v
   Self-justified adoption
```

---

## 10. Invariants (must always hold)

1. **No memory is keyed by model id.** Every durable memory is keyed by `assistant_id`.
2. **One assistant per tenant.** `assistant_id = capsule-<enterprise>` is the only tenant boundary;
   retrieval never crosses it.
3. **Every capture is `send_to_llm:"false"`.** Writes never trigger generation and never bill model
   tokens for the write, and only the distilled briefing (never the raw transcript) is stored.
4. **Skill memories are always tagged `skill:<id>@<semver>`.** Untagged skill learnings are not
   minted.
5. **Versions are immutable and additive within a major.** A major may supersede; it never mutates a
   prior version in place.
6. **Retrieval is semantic + LLM-guided**, fired at session-open and at model/MCP selection — never a
   bare vector lookup as the final ranker.
7. **The token delta is the only reward.** `tokens_saved_downstream − tokens_spent_to_create`. No
   capsule is promoted on anything but measured reward.
8. **Memory follows the entity across all 17,000+ BYOK models.** Switching models re-fits, never
   re-derives.

---

## 11. Reference: API shape (relay lib, unchanged)

```http
POST https://app.backboard.io/api/threads/messages
X-API-Key: <backboard-key>
Content-Type: application/json

{
  "content": "<distilled briefing>",
  "assistant_id": "<capsule assistant>",
  "memory": "Auto",
  "send_to_llm": "false"
  // thread_id omitted on first write → Backboard auto-creates + returns a real uuid, then cached
}
```

- `content` — the **distilled briefing** (never the raw transcript).
- `thread_id` — the project. Omitted on the first write so Backboard auto-creates it; reused after.
- `memory: "Auto"` — Backboard auto-extracts durable facts; CAPSULE adds explicit skill/semver tags.
- `send_to_llm: "false"` — store-only write (no generation).
- Assistant scoping (the single `capsule` assistant) is bound at the credential level so every write
  and read for the project resolves to the correct tenant assistant.

In code (`relay/src/lib/backboard.ts`) the envelope is built by `capsuleToBackboardEnvelope()`, with
helpers `getAssistantId()` (create-or-reuse the cached `capsule` assistant),
`projectThreadKey(enterprise, project)` → `<ent-slug>__<proj-slug>`, and
`skillMemoryTag({id, version})` → `<id>@<semver>`. `storeCapsuleMemory()` posts to Backboard when
`BACKBOARD_API_KEY` is set (omitting `thread_id` on the first write per project, then caching the
returned uuid) and `storeCapsule()` always mirrors a local JSON copy under `~/.relay/capsules` so the
demo runs keyless.

> Backboard ranks #1 on LoCoMo and LongMemEval — the retrieval-quality basis for trusting LLM-guided
> recall over plain vector NN.
