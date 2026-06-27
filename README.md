# CAPSULE

**The capture + feedback (RL) layer for [8090](https://www.8090.ai/)'s Software Factory.**

> Every AI coding session creates knowledge — the *why*, the dead-ends, the gotchas, the intent.
> Today it evaporates the moment the session ends. **CAPSULE captures it, scores it, versions it into
> enterprise skills, and feeds it back** so the next developer or agent inherits full context instantly.

CAPSULE turns a finished coding session into a **Capsule** — a compressed, scored record of what was
learned — distilled **locally** (Ollama `qwen2.5-coder:14b`), stored in **portable Backboard memory**, and
promoted into a **versioned enterprise skills registry**. It's a reinforcement-learning loop for the
enterprise SDLC: every session makes the next one cheaper and better.

---

## One root cause → four hackathon themes

CAPSULE is built on a single thesis: **context dies at the session boundary.** That one root cause is the
source of all four "Build for Builders" themes — and CAPSULE solves them together:

| Theme | How CAPSULE serves it |
|---|---|
| **Handoff** | The capsule *is* the handoff artifact; the in-app **cold-vs-warm Handoff demo** shows an agent inherit it and continue. |
| **Productivity & flow** | **Warm-start** injection (real Backboard retrieval) + measured token savings — a new session starts oriented, not cold. |
| **Code quality & confidence** | Provenance trail (every skill version → the capsule/finding that produced it) + an agentic-CI gate before a version publishes. |
| **Junior developer** | Each capsule's **"technique to learn"** coaches the dev; adopting an enterprise skill hands a junior the senior's distilled knowledge. |

---

## The RL loop

```
coding session  →  capture (~/.claude/*.jsonl)  →  DISTILL (local Ollama 14b)  →  6-dim SCORE
        →  AGENTIC GATE (keep if score ≥ threshold OR novelty ≥ 80)  →  CAPSULE (stored in Backboard memory)
        →  promoted to the ENTERPRISE skills repo  →  SKILL VERSIONING (semver, learnedFrom capsule+finding)
        →  exposed via APIs  →  adopted/pinned by personal repos  →  token savings = the RL reward (feeds back)
```

Multi-developer at scale: capsules are **promoted as PRs**, **tested by an agentic CI** (A/B vs current),
**deduped** when devs find the same thing, and **conflict-resolved** (do/undo) by measured reward + recency.

---

## Run it

```bash
npm install
# Local model (primary distiller) — install Ollama, then:
ollama pull qwen2.5-coder:14b
# Optional: live Backboard memory + Cerebras cloud distill
cp .env.example .env.local   # add BACKBOARD_API_KEY (and optionally CEREBRAS_API_KEY)
npm run dev                  # http://localhost:3010
```

- **No keys required** to run: distillation falls back local-only (Ollama → heuristic), Backboard → local JSON store.
- With `BACKBOARD_API_KEY`, capsules are written to **live Backboard memory** (`app.backboard.io/api`, `X-API-Key`, `send_to_llm:false`).

### Or run the whole stack with Docker

```bash
docker compose up                                   # app + a containerized Ollama
docker compose exec ollama ollama pull qwen2.5-coder:14b   # one-time model pull
# → http://localhost:3010
```

Docker shows up in three places: the **app container** (`Dockerfile`), the **whole stack**
(`docker-compose.yml`, app + Ollama), and the **handoff devcontainer** (`.devcontainer/`) — *a capsule ships its
runtime, not just its notes.* See [`docs/TECH-STACK.html`](docs/TECH-STACK.html).

### Try the demo
Open the app → click the **Handoff** icon → **Run handoff demo** (real cold-vs-warm on your local model).
Then **Capture this session** (Agentic toggle on) to distill one of your real `~/.claude` sessions live.

---

## Architecture

- `src/app/page.tsx` — the 8090-style workspace shell (sidebar · editor · side panels · agent panel)
- `src/components/` — TopBar, Sidebar, DocumentEditor, RightPanel, ForceGraph, SkillCard, `ui.tsx`
- `src/components/panels/` — KnowledgeGraph · Skills · Versions · AbTrials · Capture · **Inherit (Handoff)**
- `src/lib/` —
  - `capture.ts` — read + compress real `~/.claude` session transcripts
  - `cerebras.ts` — distiller (**local Ollama primary** → Cerebras optional → heuristic)
  - `scorer.ts` — 6-dimension transfer score
  - `backboard.ts` — **live Backboard memory** (assistant-per-tenant, thread-per-project, `retrieveMemory`)
  - `data.ts` — the dataset (real capsules/skills; `data.mock.ts` is the seeded backup)
  - `selectors.ts` · `store.ts` (Zustand) · `types.ts`
- `src/app/api/` — `sessions` · `capsule` · `capsules` · `skills` · `graph` · `inherit`

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 · Zustand.

---

## Documentation (`/docs`)

Open any of these in a browser:

| Doc | What it is |
|---|---|
| [`docs/CAPSULE-LAUNCH.html`](docs/CAPSULE-LAUNCH.html) | The launch site — every feature with screenshots + video |
| [`docs/DEMO-SCRIPT.html`](docs/DEMO-SCRIPT.html) | The 3-minute pitch, mapped to the four themes + Q&A cheat-sheet |
| [`docs/RL-LOOP.html`](docs/RL-LOOP.html) | The full RL-loop architecture diagram |
| [`docs/TECH-STACK.html`](docs/TECH-STACK.html) | Full tech stack, where local LLM + Cerebras live in code, Docker, cloud roadmap |
| [`docs/BACKEND.html`](docs/BACKEND.html) | The working backend architecture (pipeline + APIs + Backboard) |
| [`docs/MULTI-DEV.html`](docs/MULTI-DEV.html) | Multi-dev flow: promotion, agentic CI, dedup, do/undo conflict |
| [`docs/AGENTIC-VS-MANUAL.html`](docs/AGENTIC-VS-MANUAL.html) | The two capsule-creation flows, side by side |
| [`docs/FEATURES.html`](docs/FEATURES.html) | Plain-language explainer of every feature |
| [`docs/REPO-FLOW.html`](docs/REPO-FLOW.html) | Enterprise registry vs personal repo flow |
| [`docs/DATA-REALITY.html`](docs/DATA-REALITY.html) | **Honest** what's-real-vs-derived breakdown |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/VALUE.md`](docs/VALUE.md) · [`docs/MEMORY-MODEL.md`](docs/MEMORY-MODEL.md) | Engineering notes |
| `docs/factory.html` · `docs/index.html` | Earlier standalone HTML prototypes |

**Enterprise skills registry (separate repo):** [github.com/aptsalt/capsule-enterprise-skills](https://github.com/aptsalt/capsule-enterprise-skills) — branches `master` (enterprise), `dee` / `ven` / `saim` (developers).

---

## What's real (honesty note)

The **pipeline is real**: CAPSULE reads your real sessions and distills + scores + stores capsules locally /
in live Backboard. The bundled dataset's capsules, skills, semver, A/B token deltas and Backboard writes are
**measured/real**; a thin layer (novelty/importance, non-A/B reuse estimates, requirements/work-order
scaffolding) is **derived**. See [`docs/DATA-REALITY.html`](docs/DATA-REALITY.html).

---
Deepak Singh Kandari · [github.com/aptsalt](https://github.com/aptsalt)
