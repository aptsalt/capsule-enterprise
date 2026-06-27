# CAPSULE vs 8090 — UI/UX Audit

> Scope: the CAPSULE chrome and panels (`C:/Users/deepc/relay/src`) measured against the 8090 Software Factory reference — a calm, single-blue-accent, document-centric enterprise surface (Linear/Notion grade).

---

## Verdict

CAPSULE is **~70% of the way** to the 8090 look. The information architecture, the document canvas, the five side panels and the shared primitives are all in place, and the editor's own SVG tool-icons already prove the team can hit 8090's icon quality. But three systemic regressions keep it reading as a "hackathon dashboard" rather than calm enterprise SaaS:

**Top 3 gaps**

1. **Two accents, not one.** A full violet (`--violet #7c3aed`) — plus the entire knowledge-graph entity palette (cyan/green/amber/rose) — has leaked out of data-viz and into everyday *chrome*: the default `Switch` tone, the active `Pill`, the Adopt CTA, the composer Capsule toggle, the TopBar engine pill, sidebar dots/badges, and the avatar gradient. The single biggest "calm enterprise vs hackathon" tell.
2. **Dead document-centric navigation.** The center tabs and the sidebar file-tree are inert facades — the tabs flip local state with no downstream effect, the tree rows have no `onClick`, and the active doc is a hardcoded constant. You can select "Requirements" while the tree and editor both stay pinned to "Technical Requirements." Document-centric navigation is *the* core 8090 quality, and here it visibly contradicts itself.
3. **Full-color emoji as icons.** Throughout the primary chrome (💬 ↗ ⤓ ⟳ 🔍 🚀 ⚙ ➤ 🔗 🧠 📄 🎓) emoji render multicolor at inconsistent baselines, shattering 8090's one monochrome line-icon family and quietly introducing ~6 uncontrolled colors.

Fix those three and CAPSULE jumps to ~90%. The rest are quick wins and a handful of "make the differentiator real" bets (a live composer, a token-savings ledger pill, a provenance link on the doc) that let CAPSULE feel like a premium-native 8090 *module that does something 8090 cannot*.

---

## CAPSULE vs 8090 — comparison

| Dimension | 8090 | CAPSULE | Gap |
|---|---|---|---|
| **Accent system** | Exactly one blue (~#2b6cf0); everything else neutral gray/ink | Blue **+** violet **+** cyan/green/amber/rose pushed into chrome | P0 — two competing accents |
| **Navigation** | Tabs + file-tree are real; clicking swaps the doc, active row tints blue | Tabs flip local state only; tree rows have no onClick; active doc hardcoded | P0 — inert, self-contradicting |
| **Iconography** | One family of ~14–16px monochrome 1.3px-stroke line-icons | Clean SVG set in the editor, but emoji/unicode everywhere else | P0 — mixed, multicolor |
| **TopBar status** | Calm neutral "Inactive / Read Only" pill center-right | No status pill; a loud violet "engine: Ollama · local" pill in that slot | P1 — required state missing |
| **Composer** | Real focusable input, `@`/`/` mentions, round blue send | Static `<div>` placeholder; send has no handler | P1 — broken affordance |
| **Sidebar** | Quiet gray column; only color is the blue active row | Blue + cyan + violet selections + green/amber/red score chips | P1 — loudest region |
| **Cards / density** | ~6–8px radii, no elevation, hairline separators | 11–13px radii + floaty hover shadows | P2 — soft consumer feel |
| **Buttons** | One blue primary; secondaries understated/monochrome | Near-black + blue + violet primaries competing; gradient avatar | P2 — no single CTA |
| **Empty states** | Centered icon + one muted line | Icon-less, over-explained marketing copy | P1/P2 — thinner, off-brand |
| **Differentiator surface** | N/A (8090 has no economic value to show) | Token-savings / provenance buried inside panels, never in chrome | P1 — killer metric invisible |

---

## Findings

### P0 — Brand-defining regressions

#### P0-1 · One-blue-accent rule broken: violet (and the entity palette) used as interactive chrome
**8090:** exactly ONE accent (~#2b6cf0) lights active nav, primary buttons, badges and the send button; everything else is neutral. **CAPSULE:** `--violet #7c3aed` (plus cyan/green/amber from the KG palette) is promoted into everyday controls — the shared `Switch` *defaults* to tone `violet`, the active `Pill` is violet, the Adopt CTA is a solid violet button, the composer Capsule toggle is a violet track+border+bg, `SkillCard` ships a violet icon chip / version pill / `BTN_VIO`, the Skills panel ENTERPRISE switch + "ENTERPRISE · BEST" badge are violet, and version rows carry violet name badges + bump pills. The eye reads a two-accent (blue+violet) product — the single biggest hackathon tell.
**Fix:** Reserve the entity colors (`--violet/--cap/--agent/...`) **strictly** for ForceGraph nodes + legend dots. Recolor all interactive chrome to blue: change `Switch` default to `tone='blue'` (ui.tsx:126) and make `violet` a graph-only override; `Pill` active → blue tint (`border-[#cfe0fd] bg-[var(--activebg)] text-[var(--blue)]`); delete `BTN_VIO`, render Adopt/Update with `BTN_PRI`; make the composer Capsule toggle a neutral/blue switch; switch the SkillCard icon chip/version pill and the ENTERPRISE switch/badge to blue or neutral gray. One accent, everywhere.
**File:** `ui.tsx` (Switch tone :106-126, Pill :30-47); `RightPanel.tsx:123-129,185-206`; `SkillCard.tsx:58-59,139,153,173,191`; `panels/SkillsPanel.tsx:124-128,196-204`; `panels/VersionsPanel.tsx:119`; `app/globals.css:31-46`

#### P0-2 · Document-centric navigation is an inert facade and falls out of sync
**8090:** the center tabs (Requirements / Product Overview / Technical Requirements) and the left file rows (Business Problem, Current State, Personas…) are real navigation — clicking swaps the document in the canvas and the active row tints light-blue. **CAPSULE:** the top tabs only flip a local `useState` with zero downstream effect; the sidebar rows render `cursor-pointer` + hover but have **no `onClick`**; `ACTIVE_DOC` is a hardcoded const `'Technical Requirements'` that never changes. You can click "Requirements" while the tree and the editor headline both stay pinned to "Technical Requirements" — a visibly contradictory, dead navigation that breaks premium-enterprise trust.
**Fix:** Lift the active document into the store (`activeDocId`) and drive three things from it: the top-tab highlight, the sidebar row tint, and the editor headline/body. Wire `onClick` on each `DOC_TREE` row and each `DOC_TAB` to set it. Even with placeholder bodies per doc, selection must be a single source of truth so tab + tree + canvas always agree.
**File:** `TopBar.tsx` (DOC_TABS/activeTab); `Sidebar.tsx` (DOC_TREE rows, ACTIVE_DOC); `DocumentEditor.tsx` (hardcoded headline)

#### P0-3 · Full-color emoji glyphs break the monochrome line-icon language
**8090:** a single family of small, monochrome, hairline line-icons (export/share/history/comments, graph glyph, file rows) all reading as one neutral gray weight with one blue accent. **CAPSULE:** OS emoji throughout the primary chrome — 💬 Comments + ↗ ⤓ ⟳ in the TopBar action row, 🔍 sidebar search, 🚀 "Capture this session" CTA + Capture panel, ➤ composer send, ⚙ user chip, 🔗 formatting toolbar, plus 🧠 📄 🎓 inside panels. Emoji render multicolor at inconsistent baselines/sizes — instantly a prototype tell, and it injects ~6 uncontrolled colors that violate the one-accent rule.
**Fix:** Replace every emoji with the inline 16–17px stroke SVGs the codebase already authors (DocumentEditor `TOOLS`, ForceGraph). Build a tiny `Icon` set — search, export, share, history, comment, send/arrow, rocket→"spark/bolt", gear, link — all `stroke-width 1.3`, `currentColor`, `color: var(--mut)`, rendered inside the existing `IconButton` so they inherit gray→ink hover. Net: one consistent gray icon weight + the single blue accent. Replace the colored 💬 and ➤ first — they read most like a consumer chat app.
**File:** `TopBar.tsx:21-26,101-111`; `Sidebar.tsx:110,228,237`; `RightPanel.tsx:213`; `DocumentEditor.tsx:85`; `panels/CapturePanel.tsx:186,213,224,272,316,327`; `SkillCard.tsx:169-175,191,200`

---

### P1 — High-impact gaps

#### P1-1 · No "Inactive / Read Only" status pill; a loud engine telemetry pill occupies its slot
**8090:** a small, understated neutral status pill near center-right tells the user the document's edit state. **CAPSULE:** no status pill at all; the slot holds a violet "engine: Ollama … · local" pill (violet bg/text/dot, lg+ only) — and meanwhile the headline, intro and body are all `contentEditable` with `execCommand`, so the doc is silently always-editable with no affordance. This both omits a required 8090 state and replaces it with a louder, off-brand infra chip.
**Fix:** Add a small neutral status pill (`border-[var(--line)] bg-[var(--side2)] text-[var(--mut)]`) bound to a store flag `docStatus: 'editing' | 'read-only' | 'inactive'`; when read-only, drop `contentEditable` and dim the toolbar. Keep the local-engine signal as a *differentiator* but demote it to a monochrome gray pill (hairline border, white bg, `--mut` text, single small blue dot when local — no violet fill) sitting **with** the right-side action icons, not in the document-status slot.
**File:** `TopBar.tsx:82-100`; `DocumentEditor.tsx` (contentEditable surfaces)

#### P1-2 · Right-panel composer is a dead placeholder div, not a real input
**8090:** the right agent-panel composer is a real focusable input with "`@` to mention requirements, `/` to use skills," Skills▾/Recommended▾ pills and a round blue send. **CAPSULE:** reproduces the chrome but the input is a static `<div>` reading "Ask the agent to build with your enterprise skills…" — it cannot be typed into, and the send button has no handler. The `@`/`/` hint promises an interaction that doesn't exist — exactly what an enterprise reviewer catches first.
**Fix:** Replace the placeholder div with a real autosizing `<textarea>` (1–3 rows, `var(--ink)` text, `var(--dim)` placeholder). Wire the round send + Enter to push the typed prompt into the existing toast/store flow; make `/` open the Skills panel and `@` a requirements mention list (you already have `data.requirements` + the recommender). Even a minimal "Sent to agent with capsule context" toast closes the credibility gap and lets the "Capsule ON" toggle visibly change what gets sent.
**File:** `RightPanel.tsx:162-216`

#### P1-3 · Sidebar mixes three accent families plus traffic-light score chips
**8090:** a quiet light-gray column whose only color is the blue-tinted active row. **CAPSULE:** the nav stacks three accent systems — doc-tree active row is blue (good), but "Capsules from today" selected rows are a **cyan** tint+outline, mock capsules carry a cyan dot while local ones carry a **violet** dot + violet "local" badge, and every row ends in a **green/amber/red** traffic-light score chip. The effect is a colorful dashboard sidebar, not 8090's restrained file tree — the loudest region on screen.
**Fix:** Unify selection to the blue family (reuse `--activebg` + blue text for capsule rows). Make the capsule status dot a single neutral/blue 6px dot (drop the per-source cyan/violet split and the colored glow shadow). Replace the tri-color score chip with one calm treatment — a mono number in `--mut`, or one subtle blue/gray pill — so the nav carries at most one accent.
**File:** `Sidebar.tsx:38-42,181,186-215,233`

#### P1-4 · Identical-looking capsule rows open two different panels
**8090:** a row's affordance is predictable — a list item resolves to one consistent destination. **CAPSULE:** the "Capsules from today" rows look identical (same shape, same score chip) but a "local" (violet) row calls `selectCaptured + openPanelFor('capture')` while a "mock" (blue) row calls `selectNode + openPanelFor('graph')`. The only differentiator is a 4px dot color and a tiny "local" badge, so the user can't predict whether a click lands in Capture detail or the Knowledge Graph.
**Fix:** Make the destination legible before the click — either route both row types to the same panel (open the capsule/provenance detail with a "View in graph" link inside), or add an explicit trailing affordance per type (a small graph glyph vs a capsule glyph) plus a tooltip.
**File:** `Sidebar.tsx` (onMockCapsuleClick vs localRows.onClick)

#### P1-5 · Search hijacks the open panel on every keystroke; "Ctrl K" is decorative
**8090:** "Search in 8090hacks  Ctrl K" is a calm command affordance — Ctrl/Cmd-K focuses it and results appear without yanking your view. **CAPSULE:** the search `onChange` fires `openPanelFor('skills')` on **every keystroke**, so typing mid-task in Versions or the Graph forcibly swaps the side panel to Skills; and the "Ctrl K" pill has no keydown handler, so the advertised shortcut does nothing.
**Fix:** Only open Skills on an explicit commit (Enter / field focus), not per keystroke — or debounce and only open when the field is the active trigger. Add a global keydown for `(e.metaKey||e.ctrlKey)&&e.key==='k'` that focuses the input and `preventDefault`s, so Ctrl K matches its label.
**File:** `Sidebar.tsx` (search input onChange); `app/page.tsx` (no Ctrl/Cmd-K handler)

#### P1-6 · Capture failures surface raw exception strings with no in-place retry
**8090:** restraint extends to copy — failure states read like product language and offer a clear next action. **CAPSULE:** both the list-error and capture-error cards render `String(e)` verbatim ("Error: sessions 500", "Error: capsule 503") in mono red — developer-facing and off-brand; the only retry is a tiny ⟳ glyph in the picker header, and on a capture failure nothing marks WHICH session row failed.
**Fix:** Replace `String(e)` with a friendly line ("Couldn't reach the local model. Make sure Ollama is running.") and keep the raw detail behind a collapsible "Details." Put a primary "Try again" button inside the error card (re-invoking `loadSessions` / re-capturing the last session), and mark the failed session row with an inline error state.
**File:** `panels/CapturePanel.tsx` (listError / captureError Cards, ~282-297)

#### P1-7 · Version-history rows are over-decorated vs 8090's calm single-badge row
**8090:** restrained — friendly label "Version 1", one small blue "Latest" badge, a timestamp. **CAPSULE:** the row stacks a mono semver chip + optional violet name badge + blue Latest badge + amber Proposed badge + a rose/blue/violet bump pill, then a second line with green "adopted by N teams," gray tok/use, and a Compare checkbox — up to 3–4 colored chips competing in one card.
**Fix:** Keep version chip + timestamp + single blue Latest badge as primary; demote bump, adoption count and tok/use into one muted meta line (`var(--dim)`, no colored pills) or reveal on hover; recolor amber Proposed and rose/violet bump pills to a single neutral/blue treatment; keep the Compare checkbox subtle and right-aligned.
**File:** `panels/VersionsPanel.tsx:97-147`

#### P1-8 · Knowledge-Graph empty state omits 8090's centered icon + "Select to view details" pattern
**8090:** a centered muted document icon above "Select a feature to view details" — terse and calm. **CAPSULE:** the ProvenanceDetail empty state is icon-less and over-explains: "Select a node to view its provenance — why each skill version exists."
**Fix:** Wrap the empty state in a centered column — a ~28px muted document/graph line-icon (`stroke var(--dim)`) above a single muted line "Select a node to view details" (drop the em-dash clause), with `py-8` so it centers like 8090's explorer column.
**File:** `panels/KnowledgeGraphPanel.tsx:106-111`

#### P1-9 · ADD: a calm token-value "ledger" pill in the top bar — CAPSULE's killer metric, absent from chrome
**8090:** the top bar has no economic surface because it has no economic value to show. **CAPSULE:** the entire thesis (capsules compounding into token savings) lives buried in the Skills panel (`Σ tokens saved`, adoptionRate, the compounding sparkline) — the most differentiated number in the product is invisible until a panel is opened. The single highest-leverage way to feel like a premium-native 8090 module that does something 8090 can't.
**Fix:** Add one understated neutral-hairline mono pill before the action icons: a tiny blue spark/coin line-icon + "Σ 1.2M saved · 73% adopted" (`data.metrics.tokensSavedTotal` + `adoptionRate`), `border var(--line)`, white bg, `var(--ink2)` text, **no fill color**. Click opens the Skills panel scrolled to the impact note + sparkline. Keep it as quiet as 8090's "Inactive" pill — the restraint is what makes the number credible rather than salesy.
**File:** `TopBar.tsx:81-100` (reuse `data.metrics` from `panels/SkillsPanel.tsx:161-169`)

---

### P2 — Polish & consistency

#### P2-1 · Three competing button weights + gradient avatar dilute the single-CTA hierarchy
**8090:** one clear blue primary; secondaries understated/monochrome; "New Agent" restrained and followed by a small "+"; flat avatars. **CAPSULE:** runs three solid button colors at once — near-black "New Agent" (`bg-[var(--ink)]`), blue primaries, and violet Adopt — so no weight reads as THE action; the trailing "+" is missing; the avatar uses a violet→blue gradient and the org mark a dark gradient.
**Fix:** Pick one primary — make "New Agent" a quiet hairline-ghost button (`border-[var(--line)] text-[var(--ink2)] bg-white hover:bg-[var(--hover)]`) so the editor's blue actions win, and add the small standalone "+" icon-button after it (same 30×30 ghost style). Flatten the avatar to a solid neutral/blue fill; keep the org mark a single flat dark square. Combine with P0-1 to remove the violet primary.
**File:** `TopBar.tsx:51,112-118`; `Sidebar.tsx:233`

#### P2-2 · Card "Dismiss" is a full equal-width button, not a small text button
**8090:** the card secondary is a small low-weight text button beside a single blue primary, so the primary dominates. **CAPSULE:** Dismiss is `flex-1` — half the card width and the same height as the primary — so the two read with equal weight and the card feels dense/heavy.
**Fix:** Make Dismiss / "Keep current" an auto-width borderless text button (drop `flex-1`; `px-2 text-[var(--mut)] hover:text-[var(--ink)]`) and let the primary keep priority. Apply to both the Capsule and Skill-updates cards.
**File:** `RightPanel.tsx:84-98,116-130`

#### P2-3 · Shortcut grid uses generic blue dots instead of per-action line-icons
**8090:** the 2-col shortcut grid uses a distinct small line-icon per shortcut (Plan, Resolve Flags, Quick Q&A…). **CAPSULE:** prefixes each (Graph, Skills, Versions, A/B trials, Diff, Audit trail) with a 6px solid blue dot — a generic bullet that adds repeated blue spots and drops per-action legibility, so the grid reads as filler rather than a launcher.
**Fix:** Replace the blue dot (`h-[6px] w-[6px] rounded-full bg-[var(--blue)]`) with a real 14–16px monochrome line-icon per action — reuse the graph/skills/versions/bar-chart SVGs from DocumentEditor `TOOLS`. Keep CAPSULE's verbs but phrase them in 8090's task language: "Explore graph," "Recommend skill," "Version history," "A/B vs cold," "Diff versions," "Audit provenance."
**File:** `RightPanel.tsx:17-23,138-158`

#### P2-4 · Composer send is a rounded-square glyph, not 8090's round blue send
**8090:** ends the composer with a round (circular) blue send button. **CAPSULE:** a 32×32 `rounded-[9px]` squircle containing a ➤ unicode glyph — neither fully round nor a clean paper-plane.
**Fix:** Switch to `rounded-full` and replace ➤ with a small paper-plane/arrow SVG (`stroke=currentColor`) to match 8090's round blue send.
**File:** `RightPanel.tsx:207-214`

#### P2-5 · Panel close affordance is a raw unicode glyph instead of a line-icon
**8090:** closes panels with a thin line-icon consistent with its set. **CAPSULE:** renders a literal text close glyph in both the shared `SidePanel` header and the hand-rolled `AbTrialsPanel` header — heavier/uneven vs the surrounding SVGs.
**Fix:** Replace with a 13px SVG x-icon (two strokes, `strokeWidth 1.3`, `stroke=currentColor`, `strokeLinecap round`) inside the existing 26px hover target.
**File:** `ui.tsx:293-300`; `panels/AbTrialsPanel.tsx:123-130`

#### P2-6 · AbTrialsPanel re-implements chrome instead of using the shared SidePanel
**8090:** all panels share identical chrome. **CAPSULE:** four panels route through the shared `SidePanel` primitive but `AbTrialsPanel` duplicates the header by hand (re-declares border, padding, title, close; no toolbar slot) and risks drift.
**Fix:** Render through `SidePanel` (`title='A/B Trials — Capsule vs Cold'`, `icon=BarChartIcon`, `onClose=closePanel`) and move the intro + cards into its children, deleting the hand-rolled header/scroll wrapper so all five panels share one chrome implementation.
**File:** `panels/AbTrialsPanel.tsx:103-145`

#### P2-7 · Inflated radii + hover drop-shadows give a soft consumer feel
**8090:** Linear/Notion-like — ~6–8px radii, no card elevation, structure carried by ~#e6e8eb hairlines. **CAPSULE:** inflates radii (Card `rounded-[11px]`, SkillCard/AbCard `rounded-[13px]`, composer/doc 11–12px) and adds floaty hover shadows (`hover:shadow-[0_4px_18px_#0000000a]`, `0_3px_14px` on cards/version rows) — stacking into a "web app" look.
**Fix:** Tighten radii to ~8–10px (cards 10px, buttons/pills/chips 7–8px) and drop hover box-shadows in favor of a hairline border-color shift (`hover:border-[#d4d8de]`). Keep selection as the existing 1px inset ring so hairlines do the work.
**File:** `ui.tsx:89,93`; `SkillCard.tsx:131`; `panels/AbTrialsPanel.tsx:85`; `panels/VersionsPanel.tsx:110-115`

#### P2-8 · Top-bar Export/Share/History/Comments icons are inert despite full button affordances
**8090:** the right-side action row is understated but real. **CAPSULE:** renders them as proper buttons (title + aria-label + hover) that invite clicks, yet every one is a no-op — and History (⟳) is an especially missed mapping since a full Versions panel already exists.
**Fix:** Wire History → `openPanelFor('versions')`, Comments → a comments panel or a "Comments coming soon" toast, and either implement or *visibly disable* (opacity + `cursor-default` + remove aria-label) Export/Share so they don't masquerade as live controls.
**File:** `TopBar.tsx` (ACTION_ICONS map, no onClick)

#### P2-9 · Panel active-state feedback only fires from the editor icon row
**8090:** a control that opened a surface shows it's active. **CAPSULE:** a panel can be opened from four places (editor toolbar, right-panel Actions grid, composer Skills/Recommended pills, sidebar) but only the editor icons set `aria-pressed` + the blue active tint — open Versions from the Actions grid and nothing in the right panel shows it's open.
**Fix:** Compare each trigger's target panel against `store.openPanel` and apply the same active tint + `aria-pressed` the editor icons use, so the Actions grid buttons and the Skills/Recommended pills highlight when their panel is open.
**File:** `RightPanel.tsx` (ACTIONS grid + composer pills); `DocumentEditor.tsx` (TOOLS)

#### P2-10 · Focus restoration on panel close misfires for non-editor openers
**8090-grade a11y:** focus returns to the control the user came from. **CAPSULE:** the restore logic only tracks `lastOpenerRef` for editor icon buttons; opening a panel from the sidebar, Actions grid, or a composer pill and then closing it still calls `toolRefs.current[...]?.focus()`, jumping focus to an arbitrary editor icon the user never touched.
**Fix:** Track the opener globally (store a ref to `document.activeElement` at open time, or record the opener in the store) and restore focus to that exact element on close; fall back to the editor icon only when the opener was an editor icon.
**File:** `DocumentEditor.tsx` (lastOpenerRef / prevPanelRef focus effect)

#### P2-11 · Composer "Capsule" toggle hand-rolls a switch that diverges from the shared Switch
**8090:** restraint relies on one consistent control vocabulary. **CAPSULE:** already has a `Switch` primitive (38×22 track, 18px knob, `role='switch'`, `aria-checked`) used by ENTERPRISE, but the composer's Capsule toggle re-implements a different inline switch (30×17 track, 13px knob) inside a button with no `role`/`aria-checked` — two visually different toggles for the same concept.
**Fix:** Replace the hand-rolled track/knob with the shared `<Switch checked={capsuleOn} onChange={toggleCapsule} aria-label='Inject latest capsule context' />` (blue tone per P0-1), so both toggles share size, motion and a11y semantics.
**File:** `RightPanel.tsx` (inline capsule toggle, ~187-206)

#### P2-12 · Escape always closes the whole panel — even mid-comparison or mid-distill
**8090-layered UI:** Escape steps back one level before tearing down the surface. **CAPSULE:** the page-level handler unconditionally calls `closePanel()` on Escape — in Versions compare mode it nukes the panel instead of exiting comparison; during a Capture distill it abandons the panel while the fetch keeps running with no cancel and no busy feedback.
**Fix:** Make Escape context-aware: if Versions is comparing, exit comparison first; if a capture is distilling, ignore Escape (or offer a Cancel that aborts via `AbortController`); only close the panel when there's no sub-mode to back out of.
**File:** `app/page.tsx` (Escape useEffect); `panels/CapturePanel.tsx` (Distilling state, no cancel)

#### P2-13 · Editor lacks 8090's persistent "Knowledge Graph Explorer" rail + a provenance link on the doc
**8090:** a persistent "Knowledge Graph Explorer" header (tiny graph glyph + "KG Explorer" toggle) docked right of the toolbar, with an always-visible calm empty state — the affordance is never hidden. **CAPSULE:** the graph only appears as a slide-in panel behind a small unlabeled toolbar icon, so a first-time user never sees that the provenance explorer exists — the strongest differentiator is hidden. The doc itself ("Technical Requirements," subtitle "REQ · Payments Copilot") also has no link into the full provenance chain it already computes. The toolbar additionally omits 8090's trailing pencil/edit affordance and orders link after the lists.
**Fix:** Either label the graph toggle with a visible "KG Explorer" text affordance + the muted "Select a feature to view details" resting empty-state, or render a slim collapsed KG-rail teaser in the open-column slot. Add a quiet "View provenance" text-link / small graph line-icon next to the doc subtitle that calls `selectNode(REQ id) + openPanelFor('graph')`, optionally with a mono "fed by N capsules" chip — styled as one blue text-link on neutral. Append a pencil/edit SVG to `FMT_BUTTONS` and move link ahead of the list buttons.
**File:** `DocumentEditor.tsx:75-88,155-160,162-212`; `app/page.tsx:32-33,50-72`; `panels/KnowledgeGraphPanel.tsx` (provenanceFor)

---

## Quick wins (apply now)

These are low-risk, high-signal edits — mostly token/markup swaps that move the needle on the "calm enterprise" read:

1. **Kill violet in chrome** — flip `Switch` default to `tone='blue'`, delete `BTN_VIO`, recolor the active `Pill`, Adopt CTA, Capsule toggle, sidebar dots/badges and avatar to the blue/neutral family. *(P0-1)*
2. **Swap emoji → SVG line-icons** — start with the colored 💬 (Comments) and ➤ (send); reuse the editor `TOOLS` SVG family everywhere. *(P0-3)*
3. **Restore the neutral status pill** and demote the engine pill to a monochrome gray chip beside the action icons. *(P1-1)*
4. **Add the Ctrl/Cmd-K handler** and stop opening Skills on every keystroke. *(P1-5)*
5. **Friendly capture-error copy + "Try again" button**, raw detail behind "Details." *(P1-6)*
6. **Unify the sidebar to one accent** — blue selection, single neutral dot, one calm score treatment. *(P1-3)*
7. **De-decorate version rows** — version chip + timestamp + one blue Latest badge; rest to a muted meta line. *(P1-7)*
8. **Tighten radii to 8–10px and drop hover shadows** — hairline border shift only. *(P2-7)*
9. **Centered-icon empty state** for the KG explorer. *(P1-8)*
10. **Quiet "New Agent" ghost button + add the "+"**; flatten the avatar. *(P2-1)*
11. **Per-action line-icons in the shortcut grid**, round-full blue send, line-icon close glyph. *(P2-3, P2-4, P2-5)*

## Bigger bets

Structural work that makes CAPSULE *function* like 8090 — and then out-do it:

1. **Make document-centric navigation real** — lift `activeDocId` into the store; drive tabs, tree tint, and the canvas from one source of truth. The single biggest trust fix. *(P0-2)*
2. **Make the composer a live input** — real `<textarea>`, working send + Enter, `@`/`/` mentions, with the "Capsule ON" toggle visibly changing what's sent. *(P1-2)*
3. **Surface the differentiator in chrome** — a calm token-savings "ledger" pill in the top bar and a "View provenance" link on the document, both opening the relevant panel. This is what lets CAPSULE feel like a premium-native 8090 module that does something 8090 cannot. *(P1-9, P2-13)*
4. **Make panel state and a11y consistent** — active-state feedback from every trigger, correct focus restoration, and context-aware Escape (exit sub-mode before closing). *(P2-9, P2-10, P2-12)*
5. **Consolidate chrome** — route AbTrialsPanel through the shared `SidePanel`, and the Capsule toggle through the shared `Switch`, so there's one chrome and one control vocabulary. *(P2-6, P2-11)*
