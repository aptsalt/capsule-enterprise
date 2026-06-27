"use client";

// CAPSULE — HANDOFF + WARM-START panel (the centerpiece for the Handoff & Flow themes).
// Two beats, one story:
//   (1) WARM-START card — pick a capsule/project and see EXACTLY what a brand-new
//       session/dev inherits: the distilled capsule context retrieved from Backboard
//       memory. The payoff line: "a new session starts oriented, not cold."
//   (2) RUN HANDOFF DEMO — POST /api/inherit { capsuleId } runs the SAME question
//       against two fresh local agents: one COLD (no capsule → flailing/generic) and
//       one WARM (with the capsule → oriented, continues exactly). We render both
//       side-by-side with the question shown and the contrast lit.
// The "You inherit" briefing is built client-side from the selected capsule so the
// card is instant and always populated — the same distilled shape the backend stores
// to Backboard and re-injects into the warm agent.

import { useCallback, useState, type ReactNode } from "react";
import { data } from "@/lib/data";
import type { Capsule } from "@/lib/types";
import { useStore } from "@/lib/store";
import { ActionButton, Badge, Card, Chip, SidePanel, cn } from "@/components/ui";
import { BrainIcon, SparkIcon } from "@/components/icons";

// POST /api/inherit response (the money demo): one question, two fresh agents.
type InheritResponse = {
  hasCapsule: boolean;
  score: number | null;
  cold: string;
  warm: string;
  error?: string;
};

type DemoResult = {
  question: string;
  cold: string;
  warm: string;
  hasCapsule: boolean;
  score: number | null;
};

// The handoff question a fresh session would ask — mirrors the /api/inherit default
// so the panel shows EXACTLY what was asked of both agents.
const handoffQuestion = (project: string): string =>
  `I'm picking up the "${project}" project. What's the state, what decisions were already made, and what should I do next? What should I NOT redo?`;

function scoreTone(score: number): "green" | "amber" | "muted" {
  if (score >= 55) return "green";
  if (score >= 40) return "amber";
  return "muted";
}

// Highest-transfer capsule = the strongest default handoff to showcase.
function bestCapsule(): Capsule {
  return data.capsules.reduce((best, c) =>
    c.transferScore > best.transferScore ? c : best,
  );
}

export function InheritPanel() {
  const closePanel = useStore((s) => s.closePanel);
  const selectedCapsuleId = useStore((s) => s.selectedCapsuleId);
  const selectCapsule = useStore((s) => s.selectCapsule);

  const capsules = data.capsules;
  const selected =
    capsules.find((c) => c.id === selectedCapsuleId) ?? bestCapsule();

  const [running, setRunning] = useState(false);
  const [demo, setDemo] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Picking a different capsule resets the demo so the contrast always matches
  // the capsule currently shown in the warm-start card.
  const pick = useCallback(
    (id: string) => {
      selectCapsule(id);
      setDemo(null);
      setError(null);
    },
    [selectCapsule],
  );

  const runDemo = useCallback(async () => {
    const question = handoffQuestion(selected.project);
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/inherit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          capsuleId: selected.id,
          project: selected.project,
          question,
        }),
      });
      const j = (await res.json()) as InheritResponse;
      if (!res.ok || j.error) throw new Error(j.error || `inherit ${res.status}`);
      setDemo({
        question,
        cold: j.cold,
        warm: j.warm,
        hasCapsule: j.hasCapsule,
        score: j.score,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }, [selected.id, selected.project]);

  return (
    <SidePanel
      title="Handoff & warm start"
      onClose={closePanel}
      icon={
        <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-[#eef4ff] text-[var(--blue)]">
          <HandoffGlyph size={15} />
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        {/* framing: the flow / handoff payoff */}
        <div className="rounded-[11px] border border-[var(--line)] bg-[#fbfcfe] p-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[.05em] text-[var(--mut)]">
              Warm start
            </span>
            <Badge tone="blue" className="ml-auto">
              Flow
            </Badge>
          </div>
          <p className="mt-2 text-[12px] leading-[1.55] text-[var(--ink2)]">
            When a session ends, its capsule stays in{" "}
            <b className="font-semibold text-[var(--ink)]">Backboard memory</b>. The
            next session — a new agent, or a junior dev — inherits that context the
            moment it opens. The handoff is solved:{" "}
            <b className="font-semibold text-[var(--ink)]">
              a new session starts oriented, not cold.
            </b>
          </p>
        </div>

        {/* capsule / project picker — reuses store.selectedCapsuleId */}
        <div className="flex flex-col gap-[6px]">
          <label
            htmlFor="inherit-capsule"
            className="text-[11px] font-bold uppercase tracking-[.04em] text-[var(--mut)]"
          >
            Inherit from capsule
          </label>
          <div className="relative">
            <select
              id="inherit-capsule"
              value={selected.id}
              onChange={(e) => pick(e.target.value)}
              className="w-full appearance-none rounded-[9px] border border-[var(--line)] bg-white px-[11px] py-[9px] pr-8 text-[12.5px] font-semibold text-[var(--ink)] outline-none transition-colors hover:border-[#cfe0fd] focus:border-[var(--blue)]"
            >
              {capsules.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.project} · {c.finding.slice(0, 56)}
                  {c.finding.length > 56 ? "…" : ""} (transfer {c.transferScore})
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[var(--dim)]">
              ▾
            </span>
          </div>
        </div>

        {/* (1) WARM-START card — "You inherit" = the capsule context the new session gets */}
        <InheritBriefing capsule={selected} />

        {/* (2) run-handoff-demo action (super-saiyan) */}
        <ActionButton
          onClick={runDemo}
          disabled={running}
          className="w-full py-[9px] text-[12.5px]"
        >
          <SparkIcon size={14} />
          {running ? "Running both agents locally…" : "Run handoff demo"}
        </ActionButton>

        {running && <RunningState />}

        {error && !running && (
          <Card className="border-[#f3c6cf] bg-[#fdf6f7]">
            <div className="text-[12px] font-semibold text-[var(--ink)]">
              Handoff demo didn’t finish
            </div>
            <p className="mt-1 text-[11.5px] leading-[1.45] text-[var(--mut)]">
              Couldn’t reach a model. Set CEREBRAS_API_KEY or run Ollama, then try
              again.
            </p>
            <div className="mt-[10px]">
              <ActionButton onClick={runDemo}>Try again</ActionButton>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer select-none text-[10.5px] font-semibold text-[var(--dim)]">
                Details
              </summary>
              <div className="mono mt-1 break-words text-[10.5px] text-[var(--mut)]">
                {error}
              </div>
            </details>
          </Card>
        )}

        {demo && !running && <Contrast demo={demo} capsule={selected} />}

        {/* caption tying it to the themes */}
        <p className="mt-1 border-t border-[var(--line2)] pt-3 text-[11px] leading-[1.6] text-[var(--dim)]">
          <b className="font-semibold text-[var(--ink2)]">Handoff solved.</b> The
          capsule turns a cold restart into a warm start — the next agent picks up
          exactly where the last one left off, and a junior inherits senior context
          for free. That’s the flow: knowledge compounds across sessions instead of
          being re-discovered every time.
        </p>
      </div>
    </SidePanel>
  );
}

/* ---------- (1) "You inherit" briefing ---------------------------------- */
// Built client-side from the selected capsule — the same distilled shape stored
// to Backboard and re-injected into the warm agent. Instant + always populated.
function InheritBriefing({ capsule }: { capsule: Capsule }) {
  return (
    <Card className="border-[#cfe0fd] bg-[var(--activebg)]">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 flex-none place-items-center rounded-[7px] bg-white text-[var(--blue)]">
          <HandoffGlyph size={14} />
        </span>
        <span className="text-[12.5px] font-bold text-[var(--ink)]">You inherit</span>
        <Badge tone={scoreTone(capsule.transferScore)} className="ml-auto">
          transfer {capsule.transferScore}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-[6px]">
        <Chip tone="fed">from Backboard · {capsule.project}</Chip>
        <Chip tone="default">{capsule.id}</Chip>
      </div>

      {/* the transferable lesson — the lede of the handoff */}
      <p className="mt-[10px] text-[12.5px] font-semibold leading-[1.5] text-[var(--ink)]">
        {capsule.finding}
      </p>

      <BriefRow label="Intent">
        <p className="text-[11.5px] leading-[1.5] text-[var(--ink2)]">
          {capsule.intent}
        </p>
      </BriefRow>

      {capsule.decisions.length > 0 && (
        <BriefRow label={`Decisions · don’t re-litigate`}>
          <ul className="flex flex-col gap-[5px]">
            {capsule.decisions.map((d, i) => (
              <li
                key={i}
                className="flex gap-2 text-[11.5px] leading-[1.45] text-[var(--ink2)]"
              >
                <span className="flex-none text-[var(--blue)]">›</span>
                <span className="min-w-0">{d.what}</span>
              </li>
            ))}
          </ul>
        </BriefRow>
      )}

      {capsule.gotchas.length > 0 && (
        <BriefRow label="Gotchas to avoid">
          <ul className="flex flex-col gap-[5px]">
            {capsule.gotchas.map((g, i) => (
              <li
                key={i}
                className="flex gap-2 text-[11.5px] leading-[1.45] text-[var(--ink2)]"
              >
                <span className="flex-none text-[var(--amber)]">▲</span>
                <span className="min-w-0">{g}</span>
              </li>
            ))}
          </ul>
        </BriefRow>
      )}

      {capsule.mentalModel && (
        <BriefRow label="Mental model">
          <p className="text-[11.5px] leading-[1.5] text-[var(--ink2)]">
            {capsule.mentalModel}
          </p>
        </BriefRow>
      )}

      <p className="mt-[12px] rounded-[8px] bg-white/70 px-[10px] py-[7px] text-[11px] leading-[1.5] text-[var(--mut)]">
        This is what a brand-new session/dev sees on open — no re-reading the
        transcript, no re-deriving decisions. Oriented, not cold.
      </p>
    </Card>
  );
}

function BriefRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-[10px]">
      <div className="pb-[5px] text-[10px] font-bold uppercase tracking-[.05em] text-[var(--mut)]">
        {label}
      </div>
      {children}
    </div>
  );
}

/* ---------- running state (both agents, local) -------------------------- */
function RunningState() {
  return (
    <div className="flex flex-col items-center gap-3 px-2 py-6 text-center">
      <span className="relative grid h-12 w-12 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[var(--blue)] opacity-20" />
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[#eef4ff] text-[var(--blue)]">
          <BrainIcon size={22} />
        </span>
      </span>
      <div className="text-[13px] font-bold text-[var(--ink)]">
        Running both agents locally…
      </div>
      <p className="max-w-[280px] text-[11.5px] leading-[1.5] text-[var(--mut)]">
        Asking the same question to a <b className="font-semibold">cold</b> agent
        (no capsule) and a <b className="font-semibold">warm</b> agent (with the
        capsule). Same model, same prompt — only the inherited context differs.
      </p>
    </div>
  );
}

/* ---------- (2) cold vs warm contrast ----------------------------------- */
function Contrast({ demo, capsule }: { demo: DemoResult; capsule: Capsule }) {
  return (
    <div className="flex flex-col gap-3">
      {/* the question both agents were asked */}
      <Card className="bg-[#fbfcfe]">
        <div className="text-[10px] font-bold uppercase tracking-[.05em] text-[var(--mut)]">
          Same question · both agents
        </div>
        <p className="mt-[5px] text-[12px] font-semibold leading-[1.5] text-[var(--ink)]">
          “{demo.question}”
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-[6px]">
          <Chip tone="default">{capsule.project}</Chip>
          {demo.hasCapsule ? (
            <Chip tone="fed">
              capsule retrieved{demo.score != null ? ` · transfer ${demo.score}` : ""}
            </Chip>
          ) : (
            <Chip tone="default">capsule injected from {capsule.id}</Chip>
          )}
        </div>
      </Card>

      {/* side-by-side outcomes */}
      <div className="grid grid-cols-2 gap-2">
        <OutcomeCard
          tone="cold"
          tag="Cold · no capsule"
          subtitle="flailing / generic"
          body={demo.cold}
        />
        <OutcomeCard
          tone="warm"
          tag="Warm · with capsule"
          subtitle="oriented, continues exactly"
          body={demo.warm}
        />
      </div>

      <p className="rounded-[9px] border border-[#bfe3c8] bg-[var(--green-bg)] px-[11px] py-[9px] text-[11.5px] leading-[1.55] text-[var(--ink2)]">
        <b className="font-semibold text-[var(--green)]">The contrast:</b> the cold
        agent re-asks what’s already known and guesses at the state; the warm agent
        skips the re-discovery and continues from the decisions, gotchas, and next
        steps it inherited. Same model — the capsule is the only difference.
      </p>
    </div>
  );
}

function OutcomeCard({
  tone,
  tag,
  subtitle,
  body,
}: {
  tone: "cold" | "warm";
  tag: string;
  subtitle: string;
  body: string;
}) {
  const warm = tone === "warm";
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col rounded-[11px] border p-[11px]",
        warm
          ? "border-[#bfe3c8] bg-[var(--green-bg)]"
          : "border-[var(--line)] bg-[var(--side2)]",
      )}
    >
      <div className="flex items-center gap-[6px]">
        <span
          className={cn(
            "grid h-5 w-5 flex-none place-items-center rounded-full text-[11px] font-bold text-white",
            warm ? "bg-[var(--green)]" : "bg-[#b3b8c0]",
          )}
        >
          {warm ? "✓" : "?"}
        </span>
        <span
          className={cn(
            "text-[11px] font-bold",
            warm ? "text-[var(--green)]" : "text-[var(--mut)]",
          )}
        >
          {tag}
        </span>
      </div>
      <div
        className={cn(
          "mt-[3px] text-[10.5px] font-semibold uppercase tracking-[.03em]",
          warm ? "text-[var(--green)]" : "text-[var(--dim)]",
        )}
      >
        {subtitle}
      </div>
      <p
        className={cn(
          "mt-2 whitespace-pre-wrap break-words text-[11.5px] leading-[1.55]",
          warm ? "text-[var(--ink)]" : "text-[var(--ink2)]",
        )}
      >
        {body}
      </p>
    </div>
  );
}

/* ---------- handoff glyph (monochrome, icon-family weight) --------------- */
function HandoffGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 17 17"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="3.8" cy="8.5" r="2.2" />
      <circle cx="13.2" cy="8.5" r="2.2" />
      <path d="M6.2 8.5h4.4M8.9 6.6l2 1.9-2 1.9" />
    </svg>
  );
}
