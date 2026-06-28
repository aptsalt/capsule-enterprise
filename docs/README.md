# CAPSULE — documentation index

**The capture + feedback (RL) layer for [8090](https://www.8090.ai/)'s Software Factory.**

The product overview and quickstart live in the [root `README.md`](../README.md). This folder is the
engineering and presentation record. `.html` files are self-contained — open them in a browser.

## Start here

- **[`FOR-8090.md`](FOR-8090.md)** — the one-page case study: why CAPSULE exists, the gap it closes in the
  Software Factory, how it maps to the role, and what it demonstrates.

## System design

| Doc | What it is |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) · [`ARCHITECTURE.html`](ARCHITECTURE.html) | Full system design — data model, the RL loop, governance/audit, 8090 integration points, invariants. |
| [`RL-LOOP.html`](RL-LOOP.html) | The end-to-end reinforcement loop as a diagram. |
| [`BACKEND.html`](BACKEND.html) | The backend as it runs — pipeline, API routes, the Backboard write envelope. |
| [`PIPELINE.html`](PIPELINE.html) | The capture → distill → score → gate → store → promote pipeline, stage by stage. |
| [`MEMORY-MODEL.md`](MEMORY-MODEL.md) | The durable-memory engineering reference (Backboard, tenant isolation, dedup). |

## Multi-developer & registry model

| Doc | What it is |
|---|---|
| [`MULTI-DEV.html`](MULTI-DEV.html) | Promotion, agentic CI, dedup, and do/undo conflict resolution. |
| [`REPO-FLOW.html`](REPO-FLOW.html) | Enterprise registry vs personal-repo branching. |
| [`REGISTRY-MAP.html`](REGISTRY-MAP.html) | Map of the enterprise skills registry. |
| [`AGENTIC-VS-MANUAL.html`](AGENTIC-VS-MANUAL.html) | The two capsule-creation flows, side by side. |

## Product, stack & honesty

| Doc | What it is |
|---|---|
| [`FEATURES.html`](FEATURES.html) | Plain-language explainer of every feature. |
| [`TECH-STACK.html`](TECH-STACK.html) | Full stack — where the local LLM + Cerebras live in code, Docker, cloud roadmap. |
| [`DATA-REALITY.html`](DATA-REALITY.html) | **Canonical** what's-real-vs-derived breakdown. |
| [`DEMO-SCRIPT.md`](DEMO-SCRIPT.md) · [`DEMO-SCRIPT.html`](DEMO-SCRIPT.html) | A 3-minute guided walkthrough of the running app. |
| [`VALUE.md`](VALUE.md) | Strategy brief — the value of the skills knowledge graph and the roadmap. |

The enterprise skills registry CAPSULE promotes into is a separate component:
**[github.com/aptsalt/capsule-enterprise-skills](https://github.com/aptsalt/capsule-enterprise-skills)**.
