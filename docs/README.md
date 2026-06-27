# CAPSULE

**The enterprise RL loop for the 8090 Software Factory.**

Every Claude Code / agent session leaves behind what was *important and novel* — intent, decisions, gotchas, the mental model, the hard-won learnings. CAPSULE captures that as a **capsule**, compounds capsules into **versioned skills**, and feeds them back into every future session. It is the missing **capture + feedback** layer that turns one team's work into the whole enterprise's compounding advantage.

> 8090's Software Factory ships **Requirements → Blueprints → Work Orders → Tests → Knowledge Graph.** CAPSULE is the reinforcement loop that closes it: capture on the way out, reinforce on the way in.

CAPSULE is now a **real Next.js app with a real dataset**, not a static mock. The 8 capsules (`CAP-R001…R008`) were distilled from the user's **actual `~/.claude` sessions** by the local Ollama model `qwen2.5-coder:14b`; the 7 skills carry semver `learnedFrom` those real capsules; the 3 A/B trials report **measured Ollama token deltas**; and capsules are stored in **live Backboard memory** (real `thread_id`s). Distillation runs **on-device first** on the local model — private, free, offline-capable — with Cerebras as an optional cloud boost and a heuristic as the last-resort backfill.

> **What's measured vs derived.** `transferScore`, the A/B token counts, `thread_id`s, `createdAt`, and the session `model` are **measured**. `novelty`/`importance`, `reuses`, non-A/B `tokensSavedPerReuse`, `scoreDelta`/`adoptedBy`, and the requirements/work-orders scaffolding are **derived**. Only the **distilled briefings** are written to Backboard.

---

## Run the app

The shipping product is a Next.js App-Router app living in **`relay/`** (the directory name; the product is CAPSULE). The `factory.html` file at the repo root is the original design prototype the app was ported from — keep it for reference, but the app is the source of truth now.

```bash
cd relay
npm install
npm run dev          # → http://localhost:3010
```

Open **http://localhost:3010**. It runs against the real CAPSULE workspace (enterprise **CAPSULE** · project **Content Engine** · tenant assistant `capsule` · Backboard **Memory Pro** · 4 seats) out of the box — no keys required.

### Optional: the live capture pipeline (local + private)

The app can capture a *real* Claude Code session from `~/.claude/projects/**.jsonl`, distil it into a Handoff Capsule on your **local** model, score it, and store it in Backboard (or a local JSON fallback). This is **on-device by default**:

```bash
# Ollama is the PRIMARY distiller — runs locally, no API key, no network egress.
#   make sure Ollama is up:  ollama serve   (default http://localhost:11434)
#   and the model is pulled: ollama pull qwen2.5-coder:14b

# then, with the dev server running:
curl -X POST http://localhost:3010/api/capsule              # capture the most recent session
curl -X POST http://localhost:3010/api/capsule -d '{"index":1}'   # the 2nd-most-recent
```

Environment overrides (all optional):

| Var | Default | Purpose |
| --- | --- | --- |
| `RELAY_OLLAMA_MODEL` | `qwen2.5-coder:14b` | local distillation model (primary engine) |
| `OLLAMA_URL` | `http://localhost:11434` | local Ollama endpoint |
| `CEREBRAS_API_KEY` | *(unset)* | enables the optional Cerebras cloud boost |
| `CEREBRAS_MODEL` | `llama-3.3-70b` | Cerebras model when the key is set |
| `BACKBOARD_API_KEY` | *(unset)* | enables Backboard memory writes (else local `~/.relay` JSON) |

**Engine order in `distill()`** (`relay/src/lib/cerebras.ts`):
`ollama:qwen2.5-coder:14b (local)` → *(Cerebras only if `CEREBRAS_API_KEY` set)* → `heuristic`.
The returned `engine` label is shown in the UI so you can see distillation ran **on-device**.

---

## The side-panel UX (8090 workspace)

CAPSULE renders as an 8090-style document workspace: a top bar (CAPSULE / Content Engine org chip + doc tabs), a left sidebar (doc tree + **Capsules from today** + use-case search), the requirements editor, and a right rail. The defining interaction is a set of **top-level icons** that open animated **slide-in side panels** — exactly one at a time:

| Panel | Opens | What it shows |
| --- | --- | --- |
| **Knowledge Graph** | `graph` | the connected graph (requirements → work orders → agents → skills → capsules → models) anchored on the Backboard hub; click any node for a provenance trace. |
| **Skills** | `skills` | the enterprise skill registry, use-case recommender, impact roll-up (Σ tokens saved + adoption %), compounding sparkline, per-skill cards. |
| **Versions** | `versions` | semver version history per skill (Latest / Proposed badges) + tick two to get a word-level changelog diff. |
| **A/B** | `ab` | each task run **with the capsule recalled vs cold**, side by side — tokens, steps, pass/fail, transfer score. |

The body is a 4-column grid (`sidebar 248 · editor 1fr · side-panel 0→360 animated · right rail 322`); the side-panel column animates from 0 → 360px when a panel opens (ported from `factory.html`'s `.body.panel-open`). Triggers live in the right-rail **Actions** grid, the sidebar search, capsule rows, and the composer. **Esc** closes the panel.

---

## What's in this repo

| File / dir | What it is |
| --- | --- |
| **`relay/`** | **The shipping Next.js app** (App Router, TypeScript strict, Zustand, Tailwind v4). Run it with `npm run dev` → `:3010`. |
| **`factory.html`** | The original design prototype the app was ported from — kept for reference. |
| **`ARCHITECTURE.md`** / **`ARCHITECTURE.html`** | System design — the capture → capsule → version → reinforce loop, data model, API routes, local-model pipeline, semver rules, Backboard mapping, and the multi-dev **promotion / agentic-CI / dedup / conflict** model. Markdown to read, HTML to present. |
| **`BACKEND.html`** | The backend as it actually runs — `src/lib/*.ts` engine, the six API routes, the local-model distill chain, the Backboard write envelope. |
| **`RL-LOOP.html`** | The reinforcement loop end to end: capture → distill → score → gate → store → promote → reuse → reward, each stage a real module/route. |
| **`REPO-FLOW.html`** | The enterprise registry vs personal repos — `master` plus developer branches **`dee` / `ven` / `saim`**, `promotion/<skill>` staging refs, pin/adopt, dedup and do/undo conflict resolution. |
| **`AGENTIC-VS-MANUAL.html`** | Two postures for making a capsule — human-curated vs the agentic gate that promotes a clearing capsule as a **proposed** skill version. |
| **`FEATURES.html`** | Every feature in plain English — what it does, why it's needed, where in the app, what to improve. |
| **`PITCH.html`** | The story for judges and sponsors: the problem (enterprise context evaporates every session), the wedge, the demo, sponsor fit. |
| **`VALUE.md`** | Strategy brief — the value of the Skills Knowledge Graph and the roadmap (what's shipped vs next). |
| **`MEMORY-MODEL.md`** | Engineering reference for the durable memory layer on **Backboard** — assistant-per-tenant isolation, capsules as memory writes, skills as semver-tagged durable memory, `send_to_llm:"false"` writes, semantic retrieval, semantic-signature dedup. |

### App layout (`relay/src`)

```
app/
  page.tsx            # the 4-column workspace shell + animated side-panel column
  api/
    sessions/route.ts # GET  — list real ~/.claude sessions available to capture
    capsule/route.ts  # POST — capture+distil (LOCAL Ollama)+score+store one session
    capsules/route.ts # GET  — the enterprise's captured capsules (tenant memory)
    skills/route.ts   # GET registry · POST adopt a version (metadata op, no mutation)
    graph/route.ts    # GET  — the connected knowledge graph
    inherit/route.ts  # POST — the money demo: cold agent vs capsule-warmed agent
components/
  TopBar · Sidebar · DocumentEditor · RightPanel · ForceGraph · SkillCard
  panels/ KnowledgeGraphPanel · SkillsPanel · VersionsPanel · AbTrialsPanel
lib/
  cerebras.ts   # distill(): LOCAL Ollama → (optional) Cerebras → heuristic
  capture.ts    # read ~/.claude/**.jsonl → RawSession
  capsule.ts    # HandoffCapsule type + capsuleToBriefing()
  backboard.ts  # storeCapsule() + assistant-per-tenant Backboard envelope mapping
  scorer.ts     # handoff quality score (6 dimensions)
  data.ts       # the real CAPSULE / Content Engine dataset (8 CAP-R0* capsules, drives the panels)
  selectors.ts · store.ts · types.ts
```

---

## The 3-minute money demo

The workspace is **CAPSULE → Content Engine**, tenant assistant `capsule`, memory on **Backboard** (Memory Pro), distillation **local-first** on `qwen2.5-coder:14b`. Everything is distilled from the user's real `~/.claude` sessions.

**0:00 — Overview.**
"This is the 8090 Software Factory with the CAPSULE module. The top bar shows the tenant; the right rail shows **43,032 tokens saved** and `memory: Backboard`. That number is the RL loop paying for itself — rolled up from **8 real capsules** across **10 captured sessions**, compounding 16,680 → 43,032 over two weeks."

**0:40 — Knowledge Graph (the centerpiece).**
Click the **Graph** icon → the side panel slides in. "Every requirement, work order, capsule, and skill is one connected graph — the hub at the center is **memory / Backboard**. When an agent finishes a work order, the learning doesn't evaporate. It lands here as a node, wired to the requirement it served and the skill it will become." Click a node for the provenance trace.

**1:30 — A capsule produces a skill version.**
Click a **capsule** in the sidebar (it focuses the node) — `CAP-R004`, distilled live on the local model: *"When upgrading Angular versions, ensure local bridges and WebSocket servers are correctly configured to avoid connection issues."* "CAPSULE compressed that real session into a capsule and **minted `skill/angular-upgrade@1.0.0`** — now **published**, adopted by 3. Open **Versions**: `skill/command-verification` even shows two real versions, `@1.0.0` (from `CAP-R007`) and `@2.0.0` (from `CAP-R005`); tick two to diff them."

**2:15 — A/B, measured on the local model.**
Open **A/B** → these are **measured Ollama token counts**, not a story. `AB-03` (API Rate Limiting): **247 tokens with the capsule vs 404 cold — 157 fewer (−39%)**. `AB-01` cut 72 (−16%). `AB-02` honestly measured **0** — single-shot agent-loop savings aren't captured there, and we show that rather than fake it. "The reward signal is real arithmetic."

**2:35 — Promotion, the enterprise model.**
"A capsule that clears the agentic gate (`transferScore ≥ threshold` **OR** `novelty ≥ 80`) isn't pushed straight to the registry — it's promoted as a **proposed** version on a `promotion/<skill>` staging ref of `master`. Agentic CI then runs the A/B harness (new vs current) and regression-checks prior capsules; the bump merges **only if measured reward improves**. Near-identical capsules from `dee`, `ven`, and `saim` dedup into one canonical capsule with all authors kept; a 'do X' / 'undo X' clash is a do/undo conflict resolved by reward + recency in the merge-ledger."

**2:50 — Close.** "Capture on the way out. Reinforce on the way in. Distilled **on your own hardware**, for free, from real sessions. The Software Factory stops forgetting — and starts compounding."

---

## Sponsor alignment

CAPSULE is built natively across the sponsor surfaces — not bolted on:

- **8090** — CAPSULE *is* the Software Factory's missing layer. It adds **capture + feedback (reinforcement)** on top of Requirements → Blueprints → Work Orders → Tests → Knowledge Graph, turning a one-way pipeline into a closed RL loop, and renders inside 8090's own document/Knowledge-Graph surface rather than competing with it.
- **Backboard** — the durable memory substrate. Capsules and skill memory persist in Backboard; memory follows the **entity** (`assistant_id`), not the model, with tenant isolation and `send_to_llm=false` context writes. **#1 on LoCoMo and LongMemEval** — the long-horizon recall the compounding loop depends on.
- **Local model (Ollama · qwen2.5-coder:14b)** — distillation runs **on-device first**: private, free, no network egress, works offline. The reward signal is real because capture is cheap enough to run on *every* session without paying per-token cloud inference.
- **Cerebras** — an *optional* cloud boost for the nightly multi-hop distillation + version-minting job, used only when a key is present. Wafer-scale inference makes "learn from every session, every night, across every tenant" fast when you want to scale past the laptop.

---

*Capture what's novel. Version what's learned. Reinforce on every session — locally, for free.*
