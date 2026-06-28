# CAPSULE — 3-Minute Demo Script

**8090 Software Factory · CAPSULE module**
One root cause. Four compounding wins. A real pipeline — not a mockup.

> Run it: `cd relay && npm run dev` → `localhost:3010`
> Engine: local **Ollama `qwen2.5-coder:14b`** · Memory: **live Backboard** · Repo: real **git** (master + dee/ven/saim)

---

## 1 · The hook — one root cause, four wins (0:00–0:30)

> "Every coding session your team runs teaches something. And every time the session window closes, that lesson **dies at the session boundary**. The next developer — or the next agent — starts from zero and pays for the same mistake again.
>
> That single failure shows up as **four different problems** across the SDLC:
> - the **handoff** breaks,
> - **flow** stalls when you re-derive what someone already knew,
> - **quality and confidence** drop because nothing is verified or traceable,
> - and **juniors** are stuck re-learning what the team already paid to learn.
>
> CAPSULE fixes all four by fixing the one root cause: **we make context survive the session boundary.** Watch."

**The line to land:** *Context dies at the session boundary. Everything else is a symptom.*

---

## 2 · The live demo flow — minute by minute (0:30–2:00)

### Beat 1 — Capture a REAL session, locally (0:30–0:50)
- Left sidebar → **`Capture this session →`**. Pick a real `~/.claude/projects/*.jsonl` transcript.
- Watch **"Distilling locally… Ollama `qwen2.5-coder:14b` · on-device — No data leaves this machine."**
- **Say:** "This isn't a mock. A 14B model on *my* GPU reads a real Claude Code session and distills it. The bank's payment code never leaves the building — privacy and cost are solved because the *remembering* is free and local."

### Beat 2 — The agentic gate keeps or skips (0:50–1:05)
- The capsule comes back with a **transfer score** (6 dimensions) and a **novelty** score.
- **Say:** "An agentic gate decides automatically — **keep it if transfer ≥ threshold (default 50) OR novelty ≥ 80**, otherwise drop the noise. A smart spam filter for lessons. No human rubber-stamps every capture."

### Beat 3 — Capsule's TWO outputs (1:05–1:20)
- Every capsule produces two things:
  1. a proposed **skill update** — a version bump routed to a specific skill ("here's how to do this better next time"), and
  2. a **technique to learn** — the mental model a person/agent should internalize.
- **Say:** "One is for the machine — a versioned skill. One is for the human — a technique. Same lesson, both audiences. These are *lab notes*: the session took all afternoon; the entry is three lines that save the next person the afternoon."

### Beat 4 — Knowledge Graph provenance (1:20–1:35)
- Document header → **Knowledge Graph** icon. Click a skill node → read the **"why this version exists"** chain:
  **requirement → work order → agent → capsule → finding → skill version → Backboard.**
- **Say:** "In a bank, 'the AI changed something' isn't good enough — an auditor needs *why*. Every skill version traces back to the exact capsule, session, and business requirement that created it. And it's stored in **live Backboard** — real `thread_id`s, memory that belongs to the *tenant*, not whichever model produced it. Swap Opus → Sonnet → Haiku; the knowledge stays."

### Beat 5 — Promote to the enterprise repo (master) (1:35–1:50)
- This is real **git** — skills live on `master`, addressed like `capsule://skills/angular-upgrade`.
- **Say:** "A capsule that clears the gate becomes a **PROPOSED version on a `promotion/<skill>` ref — a pull request, never a push.** Then **agentic CI** runs the A/B harness (new vs current) and replays prior capsules. It merges to `master` **only if the measured reward improves** — tokens down, pass-rate up, transfer up, no regressions. CI-for-skills."

### Beat 6 — Multi-dev dedup & conflict (dee / ven / saim) (1:50–2:05)
- Three real dev branches fan off `master`.
- **Dedup (ML-001):** `ven`'s `CAP-V001` re-discovers the same lesson as `dee`'s `CAP-R007` (`command-verification`). Cosine **0.94 ≥ 0.90** → **merge into one canonical capsule, both authors credited, no duplicate version forged.**
- **Conflict (ML-002):** `saim`'s `CAP-S001` says *undo* what `CAP-R003` said *do* on `api-rate-limiting` (fail-fast + `Retry-After` vs backoff+retry). Flagged **do/undo contradiction → SUPERSEDE 2.0.0 (major), escalated to human review**, logged in the append-only merge-ledger.
- **Say:** "Three developers, overlapping work. CAPSULE keeps one clean, authoritative registry — re-discoveries merge, contradictions escalate. Governance that makes 'everyone shares learning' safe at scale."

### Beat 7 — THE HANDOFF MONEY MOMENT: cold vs warm (2:05–2:20)
- Document header → **A/B Trials**. Show **`AB-03` (API Rate Limiting):**
  - **With capsule: 247 tokens · passed · transfer 37** — applied the finding directly.
  - **Cold, no capsule: 404 tokens · passed · transfer 7** — re-derived from scratch.
  - **→ 157 fewer tokens, −39%, measured on the local model.**
- **Say:** "This is the whole thesis in one card. Same task, two runs. The cold run re-derives what we already knew. The warm run *inherits* it. That gap — 39% — **is** the session boundary, made visible. And it's honest: `AB-02` measured **0** on a single-shot task. We kept the zero instead of faking a win."

### Beat 8 — The token-savings reward (2:20–2:30)
- Top bar pill: **Σ 43,032 saved · 63% adopted.** Skills panel → the **compounding sparkline**.
- **Say:** "Tokens saved is the reward signal the whole loop optimizes. The weekly curve bends **16,680 → 43,032** in one week. That rising line *is* the compounding effect — one company, learning, for real."

---

## 3 · Map each beat to the theme it nails (2:30–2:45)

| Beat | Theme it nails | Why |
|---|---|---|
| 7 · Cold vs warm A/B (247 vs 404) | **Handoff** | The next worker *inherits* the lesson instead of restarting cold. The 39% gap is the broken handoff, fixed and measured. Backboard makes memory follow the team, not the model. |
| 1–3 · Capture → gate → two outputs | **Flow** | The lesson is captured *in the loop*, locally, with no interruption. The agentic gate keeps flow moving — good lessons compound, noise is dropped, nobody stalls re-deriving. |
| 4–6 · Provenance · agentic CI · dedup/conflict | **Quality & Confidence** | Nothing ships unverified: promotion-as-PR, A/B-gated CI ("merge only if reward improves"), full audit trail, and dedup/conflict governance keep the registry trustworthy. |
| 3 (technique) · Skills registry · Enterprise toggle | **Junior** | A junior flips **ENTERPRISE · BEST** and instantly works from the most-learned, capsule-maxxed playbook — plus the human-readable "technique to learn." One agent's discovery lifts everyone. |

**The unifying line:** four wins, one fix — *make context survive the session boundary.*

---

## 4 · Why we win (2:45–2:55)

- **It's a real pipeline, not a mockup.** 8 capsules (`CAP-R001…R008`) distilled from *my actual* `~/.claude` sessions by a **local 14B model**. 7 skills carry real semver learned from those capsules.
- **Real Backboard.** Every capsule is a **live write** to `app.backboard.io/api` with real `thread_id`s, `send_to_llm:false` — storage, not inference; tenant-isolated by `assistant_id`.
- **Real repos.** An actual git repo: `master` + `dee` + `ven` + `saim` branches pushed, with the promotion / merge-ledger / agentic-CI gate as real commits.
- **Honest about what's measured.** The 3 A/B trials are **measured Ollama token deltas** (`prompt_eval + eval`) — including the one that saved nothing. Novelty/importance scores and non-A/B `tokensSaved` estimates are clearly labeled **derived** (see DATA-REALITY.html). We tell you exactly where the real line is.

> **Closing line (2:55–3:00):** "Context dies at the session boundary. CAPSULE makes it survive — locally, auditably, for the whole company. That's the handoff, the flow, the confidence, and the junior — all from one root cause."

---

## 5 · Q&A cheat-sheet

**Q: How does a local lesson actually reach the enterprise repo?**
A capsule clearing the gate (`transferScore ≥ threshold` **OR** `novelty ≥ 80`) is **proposed**, not pushed — staged as a PR on a `promotion/<skill>` ref of `master` (writes `PROPOSED-<version>.SKILL.md` + a `CI-<version>.md` report). `master` head only advances when review merges it. No dev and no agent force-pushes a version.

**Q: What stops a bad skill version from publishing?**
**Agentic CI.** It runs the A/B harness (new vs current published) on representative tasks plus a regression replay of prior capsules. It merges **only if measured reward improves** (tokens ↓ / pass-rate ↑ / transfer ↑) with no regressions; otherwise the version stays `proposed` or is `rejected`. Worked example: `api-rate-limiting@2.0.0` went 6/10 → 9/10 pass, −35% tokens, +24 transfer — PASS — but because it's a do/undo contradiction, policy still routes it to human review before it lands.

**Q: Two developers discover the same thing — do we get duplicate skills?**
No. **Dedup.** Each capsule carries a semantic signature matched against the registry + Backboard semantic memory. Cosine ≥ **0.90** ⇒ re-discovery ⇒ **merge into one canonical capsule, all authors credited, no new version forged.** Live: `ven`'s CAP-V001 + `dee`'s CAP-R007 on `command-verification`, cosine 0.94 → merged (ML-001).

**Q: What if two lessons contradict each other?**
**Conflict resolution.** "do X" vs "undo X / do Y" is flagged a do/undo conflict and resolved by **measured reward + recency** — contradictory ⇒ major supersede (or reject), additive ⇒ minor, refinement ⇒ patch. Ties escalate to a human. Live: `saim`'s CAP-S001 supersedes `api-rate-limiting` to 2.0.0 (escalated) — ML-002. Every call is appended to the **immutable merge-ledger**.

**Q: Why a local model? Isn't a 70B better?**
**Privacy + cost.** The expensive cloud model does the *building*; the cheap local model does the *remembering*, so capturing a lesson never costs more than it saves, and sensitive code never leaves the machine. Pipeline is **local-first**, with an optional Cerebras `llama-3.3-70b` boost (only if `CEREBRAS_API_KEY` is set) and a heuristic last resort so a capsule always renders — even fully offline. Trade-off: a 14B on a laptop is slow (we allow up to 120s).

**Q: What's actually real vs mock?**
Real & measured: session reading, local distillation, the 8 capsules, the 7 skills + semver, the 3 A/B token deltas, the live Backboard writes, and the git repo. Derived (clearly labeled): novelty/importance scores, non-A/B per-capsule `tokensSaved` estimates, and the requirements/work-orders scaffolding. Full breakdown in **DATA-REALITY.html**.

**Q: Is 43,032 a real measurement?**
It's a **derived roll-up** (reuses × per-reuse estimate). The token deltas *behind* it — the 3 A/B trials — are **measured** on Ollama. Next step is to meter every skill through the agentic-CI runner so the whole scoreboard is grounded.

**Q: Where does Backboard fit?**
Backboard is the shared memory store — memory belongs to the **tenant** (`assistant_id: capsule`), one thread per project, skill memories tagged `<skillId>@<semver>`. It's also what powers **dedup** (semantic recall) and what makes the knowledge **model-independent**. Without a key it falls back to local JSON (`~/.relay/capsules`) so the demo always works.

---

*Numbers from `relay/src/lib/data.ts`. Behavior from FEATURES.html · MULTI-DEV.html · DATA-REALITY.html.*
