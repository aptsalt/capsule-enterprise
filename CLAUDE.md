# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Next.js dev server on http://localhost:3010
npm run build    # production build (TS + eslint errors are IGNORED — see next.config.ts)
npm start        # serve the build on :3010
npm run capsule  # tsx scripts/make-capsule.ts — distill one ~/.claude session to stdout
```

There is **no test suite and no linter wired up**. `next.config.ts` sets `typescript.ignoreBuildErrors`
and `eslint.ignoreDuringBuilds` — type errors will NOT fail a build, so run `tsc --noEmit` manually if you
want type checking. Import alias: `@/*` → `src/*`.

To regenerate the bundled dataset from real sessions: `tsx scripts/build-real-dataset.ts` (needs Ollama
running; writes `src/lib/data.ts`). Optional `.env.local` keys: `BACKBOARD_API_KEY`, `CEREBRAS_API_KEY`,
`OLLAMA_URL`, `RELAY_OLLAMA_MODEL`. Everything runs with **no keys** via fallbacks.

## Naming note

The product is **CAPSULE** (README, UI, docs). The repo predates that name, so `package.json` is still
`relay`, env vars are `RELAY_*`, and many source headers say "RELAY". Treat RELAY/CAPSULE as the same thing.

## Architecture

A Next.js 15 App Router app that turns a finished AI coding session into a scored, stored **Handoff Capsule**.
Two halves: a real server-side pipeline (`src/lib` + `src/app/api`) and a single-page workspace UI.

### The pipeline (server-only, the actual product)

```
~/.claude/*.jsonl  →  capture.ts  →  cerebras.ts (distill)  →  scorer.ts  →  backboard.ts (store)
```

Each stage degrades gracefully, which is the key design constraint — **the demo must work offline with no keys**:

- **`capture.ts`** — reads real Claude Code transcripts from `~/.claude/projects/<proj>/<id>.jsonl`,
  compresses them into a `RawSession`. Uses Node `fs`, so it is **server-only** (API routes / scripts).
- **`cerebras.ts`** (`distill`) — fallback chain: **local Ollama `qwen2.5-coder:14b` is primary** →
  Cerebras cloud only if `CEREBRAS_API_KEY` set → heuristic last resort. Always returns a `HandoffCapsule`.
- **`scorer.ts`** — `scoreCapsule` rates 6 fixed cognitive dimensions (see `DIMENSIONS` in `capsule.ts`),
  pure heuristic, no LLM.
- **`backboard.ts`** (`storeCapsule`) — writes the **distilled briefing only** (never raw transcripts) to
  live Backboard.io if keyed, else a local JSON store under `~/.relay`. Memory is addressed by `assistant_id`
  (tenant) + per-project `thread_id` (cached after first write). Read the file header for the memory model.
- **`capsule.ts`** — defines `HandoffCapsule`, the `DIMENSIONS` constant, and briefing serializers. The
  shared type backbone of the pipeline.

API routes in `src/app/api/` (`capsule`, `capsules`, `sessions`, `skills`, `graph`, `inherit`) are thin
wrappers that chain these lib functions. `POST /api/capsule` runs the full capture→distill→score→store flow.

### The dataset

`src/lib/data.ts` is **generated** by `scripts/build-real-dataset.ts` — do not hand-edit it. Its header
documents exactly what is MEASURED vs DERIVED (honesty contract). `data.mock.ts` is the seeded backup.
`types.ts` defines the `Dataset` shape both must satisfy.

### The UI

- `src/app/page.tsx` — the workspace shell (sidebar · editor · resizable side panel · agent panel).
- `src/lib/store.ts` — **single Zustand store; ALL local/UI state goes through `useStore`.** The `data`
  module is treated as immutable — skill adoption is an *overlay* (`skillId → version`) in the store, not a
  mutation of the dataset. `openPanel` drives which panel `page.tsx` renders.
- `src/components/panels/` — one panel per pipeline concept: KnowledgeGraph · Skills · Versions · AbTrials ·
  Capture · Inherit (the cold-vs-warm Handoff demo).

### Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict, but build-unchecked) · Tailwind v4 · Zustand 5.
No other runtime dependencies.

## Docs

`/docs` holds the launch site and engineering notes as standalone HTML/MD (open in a browser).
`docs/DATA-REALITY.html` and the `data.ts` header are the source of truth for what's real vs derived.
