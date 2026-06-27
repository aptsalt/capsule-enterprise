"use client";

// CAPSULE — A/B Trials side panel ("A/B Trials — Capsule vs Cold").
// Ports the `renderAbPanel()` surface from factory.html 1:1 into React:
// data.abTrials rendered side-by-side WITHOUT vs WITH the capsule recalled.
// Each trial shows tokens, steps, pass/fail, transferScore, duration and the
// outcome line; the capsuled side wins and the token delta + verdict are
// highlighted. State (closing the panel) flows ONLY through useStore.

import { useEffect, useRef, useState } from "react";
import { data } from "@/lib/data";
import { fmt } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import type { AbRun, AbTrial } from "@/lib/types";
import { ActionButton } from "@/components/ui";

/* The green bar-chart glyph from the factory `.ti` head (color var(--green)). */
function BarChartIcon() {
  return (
    <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-[#eef9f0] text-[var(--green)]">
      <svg width="15" height="15" viewBox="0 0 17 17" fill="none" aria-hidden>
        <rect x="2" y="8" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="7" y="3.5" width="4" height="11.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <rect x="12" y="6" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </span>
  );
}

/* One run column. `kind` drives the win / cold / fail border + badge tone. */
function AbCol({
  heading,
  run,
  kind,
}: {
  heading: string;
  run: AbRun;
  kind: "win" | "cold" | "fail";
}) {
  const colTone =
    kind === "win"
      ? "border-[#cdebd9] bg-[#fbfefc]"
      : kind === "fail"
        ? "border-[#f6c9d2] bg-[#fff7f9]"
        : "border-[var(--line)] bg-[#fbfbfc]";

  // Badge: capsuled PASS = ok(green); cold PASS = warn(muted); FAIL = bad(rose).
  const badgeTone =
    kind === "win"
      ? "bg-[var(--green-bg)] text-[var(--green)]"
      : run.passed
        ? "bg-[var(--side2)] text-[var(--mut)]"
        : "bg-[#fdecef] text-[var(--rose)]";

  return (
    <div className={`min-w-0 rounded-[10px] border p-[10px] ${colTone}`}>
      <div className="mono mb-[6px] text-[9px] font-bold uppercase tracking-[.04em] text-[var(--dim)]">
        {heading}
      </div>
      <div className="mono text-[19px] font-extrabold leading-none text-[var(--ink)]">
        {fmt(run.tokens)}{" "}
        <span className="text-[10px] font-semibold text-[var(--dim)]">tok</span>
      </div>
      <div className="mono mb-[7px] mt-[4px] text-[10.5px] font-semibold text-[var(--mut)]">
        {run.steps} steps · transfer {run.transferScore}
      </div>
      <span
        className={`mono inline-block rounded-[5px] px-[7px] py-[2px] text-[9px] font-bold uppercase tracking-[.04em] ${badgeTone}`}
      >
        {run.passed ? "PASS" : "FAIL"}
      </span>
    </div>
  );
}

/* One labelled metric row inside the per-trial Details drawer. */
function AbStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-[.04em] text-[var(--dim)]">
        {label}
      </span>
      <span className="mono text-[10.5px] font-semibold text-[var(--ink2)]">{value}</span>
    </div>
  );
}

/* The fuller per-run readout (durations, full outcome, metric breakdown)
   that lives behind the collapsed Details expander. */
function AbDetailCol({ heading, run }: { heading: string; run: AbRun }) {
  return (
    <div className="min-w-0">
      <div className="mono mb-[6px] text-[9px] font-bold uppercase tracking-[.04em] text-[var(--dim)]">
        {heading}
      </div>
      <div className="space-y-[3px]">
        <AbStat label="Tokens" value={`${fmt(run.tokens)} tok`} />
        <AbStat label="Steps" value={`${run.steps}`} />
        <AbStat label="Duration" value={`${run.durationS}s`} />
        <AbStat label="Transfer" value={`${run.transferScore}`} />
        <AbStat label="Result" value={run.passed ? "PASS" : "FAIL"} />
      </div>
      <div className="mt-[7px] text-[11px] leading-[1.4] text-[var(--mut)]">{run.outcome}</div>
    </div>
  );
}

function AbCard({ trial }: { trial: AbTrial }) {
  const w = trial.withCapsule;
  const c = trial.withoutCapsule;
  // Negative %: how much the capsuled run cut tokens vs the cold run.
  const delta = c.tokens ? Math.round(((w.tokens - c.tokens) / c.tokens) * 100) : 0;
  const stepsSaved = c.steps - w.steps;
  // Finer detail (durations, full outcomes, per-metric breakdown) is collapsed
  // by default so the headline comparison stays crisp.
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-[11px] rounded-[13px] border border-[var(--line)] bg-white p-[13px]">
      <div className="mb-[10px] flex flex-wrap items-center gap-2 text-[12.8px] font-bold">
        {trial.task}
        <span className="mono rounded-[6px] bg-[#f1e9fe] px-[7px] py-[2px] text-[9.5px] font-semibold text-[var(--violet)]">
          {trial.skillId.replace("skill/", "")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-[9px]">
        <AbCol heading="With capsule" run={w} kind="win" />
        <AbCol heading="Cold · no capsule" run={c} kind={c.passed ? "cold" : "fail"} />
      </div>
      <div className="mt-[9px] border-t border-[var(--line2)] pt-[9px] text-[11.5px] leading-[1.45] text-[var(--ink2)]">
        <b className="text-[var(--green)]">{delta}% tokens</b>
        {stepsSaved > 0 && (
          <>
            {" · "}
            <b className="text-[var(--green)]">−{stepsSaved} steps</b>
          </>
        )}{" "}
        · {trial.verdict}
      </div>

      <ActionButton
        variant="secondary"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-[9px] px-[10px] py-[5px] text-[11px]"
      >
        {open ? "Hide details" : "Details"}
        <span className={`text-[9px] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </ActionButton>

      {open && (
        <div className="mt-[9px] grid grid-cols-2 gap-[9px] border-t border-[var(--line2)] pt-[10px]">
          <AbDetailCol heading="With capsule" run={w} />
          <AbDetailCol heading="Cold · no capsule" run={c} />
        </div>
      )}
    </div>
  );
}

export function AbTrialsPanel() {
  const closePanel = useStore((s) => s.closePanel);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus into the panel on open (focus-follows-panel for keyboard/AT).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col border-l border-[var(--line)] bg-white">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-[13px] pb-[11px] pt-3">
        <BarChartIcon />
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="m-0 flex-1 text-[14px] font-bold outline-none"
        >
          A/B Trials — Capsule vs Cold
        </h3>
        <button
          type="button"
          aria-label="Close panel"
          onClick={closePanel}
          className="grid h-[26px] w-[26px] flex-none place-items-center rounded-[7px] text-[var(--mut)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-[13px] pb-[18px] pt-3">
        <p className="mx-[2px] mb-[12px] text-[11.5px] leading-[1.45] text-[var(--mut)]">
          Same task, run <b className="text-[var(--ink2)]">with the capsule recalled</b> vs a{" "}
          <b className="text-[var(--ink2)]">cold</b> run with no memory. Capsuled runs win on
          tokens and steps — and the cold runs sometimes{" "}
          <b className="text-[var(--rose)]">fail validation outright</b>.
        </p>
        {data.abTrials.map((t) => (
          <AbCard key={t.id} trial={t} />
        ))}
      </div>
    </div>
  );
}
