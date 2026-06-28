# CAPSULE

**The capture + feedback (RL) layer for [8090](https://www.8090.ai/)'s Software Factory.**

> Every AI coding session creates knowledge — the *why*, the dead-ends, the gotchas, the intent.
> Today it evaporates the moment the session ends. **CAPSULE captures it, scores it, versions it into
> enterprise skills, and feeds it back** so the next developer or agent inherits full context instantly.

CAPSULE turns a finished coding session into a **Capsule** — a compressed, scored record of what was
learned — distilled **locally** (Ollama `qwen2.5-coder:14b`), judged by an **LLM scorer**, stored in
**portable Backboard memory**, versioned into a **local skill registry**, and promoted at end-of-day into a
**versioned enterprise skills registry**. It's a reinforcement-learning loop for the enterprise SDLC: every
session makes the next one cheaper and better. There's also an **in-app agent chat** so you can feel the
warm-start directly — talk to a local model that already remembers.

> **Reviewing this as part of my 8090 application?** Start with **[`docs/FOR-8090.md`](docs/FOR-8090.md)** —
> why I built CAPSULE, the exact gap it closes in the Software Factory, how it maps to the role, and what it
> says about how I'd work on the team. Everything below is the engineering detail behind that.

---

## One root cause → four compounding wins

CAPSULE is built on a single thesis: **context dies at the session boundary.** That one root cause quietly
taxes every stage of the enterprise SDLC — and closing it compounds in four directions at once:

| Value pillar | How CAPSULE delivers it |
|---|---|
| **Handoff** | The capsule *is* the handoff artifact. The in-app **agent chat** lets the next dev/agent inherit it and keep going — warm, not cold. |
| **Productivity & flow** | **Warm-start** injection (real Backboard retrieval) + measured token savings — a new session starts oriented, not from scratch. |
| **Code quality & confidence** | Provenance trail (every skill version → the capsule/finding that produced it) + a measured **agentic-CI gate** before a version publishes. |
| **Onboarding & leverage** | Each capsule's distilled finding coaches the next engineer; loading an enterprise skill into the chat hands a newcomer a senior's hard-won knowledge instantly. |

---

## The full RL loop

```
   coding session
        │  ambient capture (Stop-hook → queue → watcher)   ~/.claude/*.jsonl
        ▼
   CAPTURE              compress the real transcript (src/lib/capture.ts)
        ▼
   DISTILL             LOCAL Ollama qwen2.5-coder:14b · CHUNKED map-reduce for big
                        sessions so the WHOLE session is distilled (src/lib/cerebras.ts)
        ▼
   SCORE               LLM-JUDGE transfer score (scoreCapsuleLLM, heuristic fallback)
                        + noveltyLLM                            (src/lib/scorer.ts)
        ▼
   GATE                keep if transferScore ≥ threshold  OR  novelty ≥ 80
        ▼
   BACKBOARD           store the DISTILLED briefing only — live memory
                        (X-API-Key, send_to_llm:false)         (src/lib/backboard.ts)
        ▼
   LOCAL REGISTRY      write the skill bump to ~/.capsule/local-registry on branch
                        `local-deepak` — REAL local git commit, no push
                        (src/lib/local-registry.ts)
        ▼
   END-OF-DAY PROMOTE  one CI-gated PR `local-deepak → master`
                        (scripts/eod-promote.ts)
        ▼
   ENTERPRISE master   published after agentic CI + review
                        (github.com/aptsalt/capsule-enterprise-skills)
        │
        └──────────────►  token savings = the RL reward, feeding the next session
```

Multi-developer at scale: upgrades are **promoted as PRs**, **tested by an agentic CI** (multi-sample A/B vs
the current version), **deduped** when two devs find the same thing, and **conflict-resolved** (do/undo) by
measured reward + recency. The registry also has an opposite pole — **purge/retire** — so it never silts up.

---

## In-app agent chat + skills composer

A real chat panel (it lives in `RightPanel`, rendered with `react-markdown`) lets you **talk to a local
Ollama agent that has Backboard memory** — the whole point of CAPSULE made tangible:

- **Warm by default** — when context is on, the latest capsule briefing is injected as ground truth and
  relevant tenant memory (prior capsules + past chat turns) is recalled from Backboard, so the agent answers
  oriented instead of cold.
- **Skills composer** — a `Skills ▾` dropdown (8090 categories: Requirements · Blueprints · Work Orders ·
  Feedback · General, see `src/lib/skillCatalog.ts`) loads enterprise skills into the chat's system prompt.
- **Context inspector** — `POST /api/chat/context` shows *exactly* what the agent would see and what touches
  Backboard, without running a generation. The observability seam for the whole feature.
- **Durable + capturable** — every conversation is saved under `~/.relay/chats/<id>.json` with an
  LLM-generated title, so a chat can later be distilled into a capsule just like a Claude Code session.

Routes: `POST /api/chat` (streamed) · `POST /api/chat/context` · `GET /api/chats` · `POST /api/chats/save`.
Libs: `src/lib/chatContext.ts` · `chats.ts` · `skillCatalog.ts`. Shipped as **PR #1 (merged)**.

---

## Quickstart

```bash
npm install
# Local model (primary distiller + chat agent) — install Ollama, then:
ollama pull qwen2.5-coder:14b
# Optional: live Backboard memory + Cerebras cloud distill
cp .env.example .env.local   # add BACKBOARD_API_KEY (and optionally CEREBRAS_API_KEY)
npm run dev                  # http://localhost:3010
```

- **No keys required** to run: distillation falls back local-only (Ollama → heuristic), Backboard → local
  JSON store under `~/.relay`.
- With `BACKBOARD_API_KEY`, capsules and chat turns are written to **live Backboard memory**
  (`app.backboard.io/api`, `X-API-Key`, `send_to_llm:false`).
- Env keys (all optional): `BACKBOARD_API_KEY`, `CEREBRAS_API_KEY`, `OLLAMA_URL`, `RELAY_OLLAMA_MODEL`.

### Or run the whole stack with Docker

```bash
docker compose up                                          # app + a containerized Ollama
docker compose exec ollama ollama pull qwen2.5-coder:14b   # one-time model pull
# → http://localhost:3010
```

Docker shows up in three places: the **app container** (`Dockerfile`), the **whole stack**
(`docker-compose.yml`, app + Ollama), and the **handoff devcontainer** (`.devcontainer/`) — *a capsule ships
its runtime, not just its notes.* See [`docs/TECH-STACK.html`](docs/TECH-STACK.html).

---

## Ambient capture (Stop-hook + watcher)

Sessions are captured automatically as they **close** — no manual button.

1. **Stop hook** (in `~/.claude/settings.json`) fires the instant a session turn finishes and runs the
   fast, non-blocking enqueuer:

   ```json
   { "Stop": [ { "hooks": [
     { "type": "command",
       "command": "cmd /c start /b node \"C:/Users/deepc/relay/scripts/capture-enqueue.js\"" }
   ] } ] }
   ```

   `capture-enqueue.js` only appends the just-finished transcript path to a queue and exits in microseconds —
   it never calls a model, never touches Backboard, never does git, so it can never slow Claude Code down.

2. **Watcher** (long-running, out-of-band) drains the queue and also scans `~/.claude/projects` for sessions
   gone idle (~10 min = "closed"), dedups against a persistent `processed.json`, and runs the **real**
   pipeline (capture → distill → score → gate → store → bump) for each genuinely new session:

   ```bash
   cd C:/Users/deepc/relay && npx tsx scripts/capture-watcher.ts
   ```

   See the `OPERATIONS` block at the bottom of `scripts/capture-watcher.ts` for Task Scheduler setup + how to
   disable. Manual single-session capture: `npm run capsule` (`scripts/make-capsule.ts`).

---

## Architecture

A Next.js 15 App Router app. Two halves: a real server-side pipeline (`src/lib` + `src/app/api`) and a
single-page workspace UI. Each pipeline stage **degrades gracefully** — the demo must work offline with no
keys.

**`src/lib/`**

| File | Role |
|---|---|
| `capture.ts` | Read + compress real `~/.claude` session transcripts (server-only). |
| `cerebras.ts` | Distiller — **local Ollama primary** → Cerebras optional → heuristic. **Chunked map-reduce** for big sessions. |
| `scorer.ts` | LLM-judge transfer score (`scoreCapsuleLLM`, heuristic fallback) + `noveltyLLM`. |
| `backboard.ts` | **Live Backboard memory** — assistant-per-tenant, thread-per-project, `retrieveMemory`. |
| `chatContext.ts` · `chats.ts` · `skillCatalog.ts` | The in-app agent chat: shared context builder, durable chat store, composer menu. |
| `promote.ts` | Live, on-demand promotion of a capsule into a **proposed** enterprise skill version (staged, not force-merged). |
| `local-registry.ts` | The local half of the loop — `bumpSkillLocal` writes SKILL.md + CHANGELOG + a real git commit on `local-deepak`. |
| `eval.ts` | The real eval harness — **multi-sample paired A/B** (mean ± stdev, consistent-direction, real token counts) + regression check. |
| `purge.ts` | Skill retirement — `active → deprecated → archived → purged` with a PURGE-LEDGER. Dry-run default. |
| `metrics.ts` | Dashboard roll-up **computed** from real entities (no hand-set numbers). |
| `data.ts` | The generated dataset (`data.mock.ts` is the seeded backup). |
| `capsule.ts` · `selectors.ts` · `store.ts` (Zustand) · `types.ts` · `docs.ts` | Type backbone, selectors, UI state, doc model. |

**`src/app/api/`** — `capsule` · `capsules` · `sessions` · `skills` · `graph` · `inherit` · `promote` ·
**`chat`** · **`chat/context`** · **`chats`** · **`chats/save`**. `POST /api/capsule` runs the full
capture→distill→score→store flow.

**`src/components/`** — TopBar · Sidebar · DocumentEditor · **RightPanel** (the agent chat) · ForceGraph ·
SkillCard · `ui.tsx`, plus `panels/` (KnowledgeGraph · Skills · Versions · AbTrials · Capture · Inherit).

**`scripts/`** — `capture-enqueue.js` (Stop-hook) · `capture-watcher.ts` (ambient) · `eod-promote.ts`
(end-of-day PR) · `purge-skills.ts` (retire) · `eval-ab.ts` · `build-real-dataset.ts` · `make-capsule.ts`.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 · Zustand 5 ·
react-markdown. Local Ollama primary, Cerebras optional, live Backboard.

---

## Enterprise registry + multi-dev link

The published skills live in a separate, public repo:
**[github.com/aptsalt/capsule-enterprise-skills](https://github.com/aptsalt/capsule-enterprise-skills)**.

- `master` = the enterprise head: **28 skills** (13 capsule-distilled + 15 popular engineering seeds).
- `dee` / `ven` / `saim` = personal/local developer repos, each **pinning a unique role-aligned set of 5**.
- **Promotion** is by PR + agentic CI (multi-sample A/B + regression), recorded in `MERGE-LEDGER.md` and
  governed by `PROMOTION.md`. Multi-dev reconciliation is real: **dedup** (`ML-001`) and **do/undo conflict**
  (`ML-002`) are in the ledger.
- **Purge/retire** mirrors promotion in reverse, ledgered in `PURGE-LEDGER.md`.

Pull a pinned, reproducible version:

```bash
capsule pull skill/<id>@<ver>     # exact version
capsule pull skill/<id>           # latest on master
```

---

## What's real (honesty note)

The **pipeline is real**: CAPSULE reads your real sessions, distills + scores + stores capsules locally / in
live Backboard, bumps a real local git registry, and opens a real enterprise PR. But the labels matter:

- **Scoring is LLM-judged, not trained** — `scoreCapsuleLLM` asks the local model; it is not a learned reward
  model.
- **Eval is a multi-sample *measured proxy*** — mean ± stdev over real Ollama token counts with a
  consistent-direction signal, **not** a t-test or p-value claim.
- **A thin layer is derived** — novelty/importance heuristics, non-A/B reuse estimates, and
  requirements/work-order scaffolding.

[`docs/DATA-REALITY.html`](docs/DATA-REALITY.html) is the canonical, line-by-line what's-real-vs-derived
breakdown.

### Self-capture proof

CAPSULE captured its **own** build session: capsule `CAP-SESSION-1a6fcc9b` (session `1a6fcc9b`, project
`relay`), distilled locally on `qwen2.5-coder:14b`, became `skill/ui-modularity@1.0.0` and was **promoted
into enterprise `master` (PR #4)**. Independently, `dee` promoted `rest-api-design@1.0.1` +
`oauth2-jwt-auth@1.0.1`. The loop closed on itself — that is the proof it runs.

---

## Documentation (`/docs`)

Start with **[`FOR-8090.md`](docs/FOR-8090.md)**; the rest is the engineering record. Open the `.html` files in a browser.

| Doc | What it is |
|---|---|
| [`FOR-8090.md`](docs/FOR-8090.md) | **Start here** — why CAPSULE exists, the gap it closes in the Software Factory, role fit, and what it demonstrates |
| [`ARCHITECTURE.html`](docs/ARCHITECTURE.html) · [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Full system design — data model, RL loop, governance, 8090 integration points |
| [`RL-LOOP.html`](docs/RL-LOOP.html) | The end-to-end RL-loop architecture diagram |
| [`BACKEND.html`](docs/BACKEND.html) | The working backend — pipeline + API routes + Backboard write envelope |
| [`PIPELINE.html`](docs/PIPELINE.html) | The capture → distill → score → gate → store → promote pipeline, stage by stage |
| [`MULTI-DEV.html`](docs/MULTI-DEV.html) | Multi-dev flow: promotion, agentic CI, dedup, do/undo conflict |
| [`REPO-FLOW.html`](docs/REPO-FLOW.html) | Enterprise registry vs personal-repo branching model |
| [`AGENTIC-VS-MANUAL.html`](docs/AGENTIC-VS-MANUAL.html) | The two capsule-creation flows, side by side |
| [`REGISTRY-MAP.html`](docs/REGISTRY-MAP.html) | The enterprise skills registry map |
| [`FEATURES.html`](docs/FEATURES.html) | Plain-language explainer of every feature |
| [`TECH-STACK.html`](docs/TECH-STACK.html) | Full stack — where the local LLM + Cerebras live in code, Docker, cloud roadmap |
| [`DATA-REALITY.html`](docs/DATA-REALITY.html) | **Honest** what's-real-vs-derived breakdown (canonical) |
| [`DEMO-SCRIPT.html`](docs/DEMO-SCRIPT.html) · [`DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md) | A 3-minute guided walkthrough of the running app |
| [`VALUE.md`](docs/VALUE.md) · [`MEMORY-MODEL.md`](docs/MEMORY-MODEL.md) | Strategy brief + the durable-memory engineering reference |

---

## Roadmap

- **Hosted Backboard tenants** — per-org assistant isolation + SSO, so a real team shares one warm memory.
- **Trained reward model** — replace the LLM-judge with a model fine-tuned on accepted-vs-rejected capsules.
- **Real agentic CI runner** — move the multi-sample A/B into GitHub Actions on the enterprise repo.
- **`capsule` CLI** — first-class `capsule pull / status / promote` instead of git plumbing.
- **IDE surface** — warm-start injection inside the editor, not just the in-app chat.

---
Deepak Singh Kandari · [github.com/aptsalt](https://github.com/aptsalt)
