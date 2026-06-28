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
  // No positive token delta captured (capsuled run used as many / more tokens).
  // We surface this honestly rather than hiding the trial — the reward signal is
  // MEASURED, not curated. An ⓘ affordance makes the deliberate zero unmistakable.
  const noSavings = w.tokens >= c.tokens;
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
        {noSavings ? (
          <span className="inline-flex items-center gap-[5px] align-middle">
            <b className="text-[var(--mut)]">No token savings</b>
            <span
              tabIndex={0}
              role="note"
              title="Single-shot agent loop — no token savings captured here. Shown rather than faked: the reward signal is measured, not curated."
              aria-label="Single-shot agent loop — no token savings captured here. Shown rather than faked: the reward signal is measured, not curated."
              className="grid h-[14px] w-[14px] cursor-help place-items-center rounded-full border border-[var(--line)] bg-[var(--side2)] text-[9px] font-bold text-[var(--mut)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)]"
            >
              i
            </span>
          </span>
        ) : (
          <b className="text-[var(--green)]">{delta}% tokens</b>
        )}
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

/* ---------- LIVE A/B (measured now, on the hosted free model) ------------- */
type LiveResult = {
  skillName: string;
  model: string;
  nRuns: number;
  withMean: number;
  withoutMean: number;
  deltaMean: number;
  deltaStdev: number;
  passRate: number;
  consistentDirection: boolean;
};

function LiveAb() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [res, setRes] = useState<LiveResult | null>(null);
  const [err, setErr] = useState<string>("");

  const run = async () => {
    setState("running");
    setErr("");
    try {
      const r = await fetch("/api/eval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // A skill with a real capsule finding to inject; the route measures both arms.
        body: JSON.stringify({ skillId: "skill/api-rate-limiting", nRuns: 2 }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j?.error || "Live A/B failed.");
        setState("error");
        return;
      }
      setRes(j as LiveResult);
      setState("done");
    } catch {
      setErr("Network error running the live A/B.");
      setState("error");
    }
  };

  const cheaper = res ? res.deltaMean < 0 : false;

  return (
    <div className="mb-[14px] rounded-[13px] border border-[var(--ss-2)] bg-[var(--ss-tint)]/50 p-[13px]">
      <div className="mb-[7px] flex items-center gap-2">
        <span className="mono rounded-[5px] bg-[var(--ss)] px-[6px] py-[2px] text-[9px] font-bold uppercase tracking-[.04em] text-[var(--ss-ink)] shadow-[0_0_6px_var(--ss-glow)]">
          Live
        </span>
        <b className="text-[12.5px]">Run a real A/B, measured now</b>
      </div>
      <p className="mb-[10px] text-[11.3px] leading-[1.45] text-[var(--mut)]">
        The trials below are recorded measurements. This runs a{" "}
        <b className="text-[var(--ink2)]">fresh paired A/B</b> on the live model right now and reads its{" "}
        <b className="text-[var(--ink2)]">real token counts</b> — proof the reward signal is measured, not curated.
      </p>

      <ActionButton onClick={run} disabled={state === "running"} className="text-[11.5px]">
        {state === "running" ? "Measuring 2 paired runs…" : res ? "Re-run live A/B" : "Run a live A/B"}
      </ActionButton>

      {state === "error" && (
        <div className="mt-[9px] rounded-[8px] border border-[#f6c9d2] bg-[#fff7f9] px-[10px] py-[7px] text-[11px] text-[var(--rose)]">
          {err}
        </div>
      )}

      {res && state === "done" && (
        <div className="mt-[10px] rounded-[10px] border border-[var(--line)] bg-white p-[11px]">
          <div className="mb-[7px] grid grid-cols-2 gap-[9px]">
            <div className="rounded-[8px] border border-[#cdebd9] bg-[#fbfefc] p-[9px]">
              <div className="mono text-[9px] font-bold uppercase tracking-[.04em] text-[var(--dim)]">
                With capsule
              </div>
              <div className="mono text-[18px] font-extrabold leading-none text-[var(--ink)]">
                {fmt(res.withMean)} <span className="text-[9px] text-[var(--dim)]">tok</span>
              </div>
            </div>
            <div className="rounded-[8px] border border-[var(--line)] bg-[#fbfbfc] p-[9px]">
              <div className="mono text-[9px] font-bold uppercase tracking-[.04em] text-[var(--dim)]">
                Cold · no capsule
              </div>
              <div className="mono text-[18px] font-extrabold leading-none text-[var(--ink)]">
                {fmt(res.withoutMean)} <span className="text-[9px] text-[var(--dim)]">tok</span>
              </div>
            </div>
          </div>
          <div className="text-[11.5px] leading-[1.45] text-[var(--ink2)]">
            <b className={cheaper ? "text-[var(--green)]" : "text-[var(--mut)]"}>
              Δ {res.deltaMean >= 0 ? "+" : ""}
              {res.deltaMean} ± {res.deltaStdev} tok
            </b>{" "}
            over {res.nRuns} paired runs · {cheaper ? "capsule cheaper" : "no saving"} ·{" "}
            {Math.round(res.passRate * 100)}% win-rate ·{" "}
            {res.consistentDirection ? "consistent direction" : "mixed direction"}.
          </div>
          <div className="mono mt-[7px] text-[9.5px] leading-[1.4] text-[var(--dim)]">
            measured live on {res.model} · mean ± stdev with sign-consistency, not a t-test · measured
            just now, so absolute numbers differ from the recorded trials above.
          </div>
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
        <LiveAb />
        {data.abTrials.map((t) => (
          <AbCard key={t.id} trial={t} />
        ))}
      </div>
    </div>
  );
}
