"use client";

// CAPSULE — first-load onboarding coachmark.
// A lightweight, non-blocking welcome card shown ONCE (persisted in
// localStorage). Points the user at the three demo-worthy panels and offers a
// one-click jump into the Knowledge Graph. Gated behind a mounted check so the
// server render and first client paint match (no hydration mismatch).

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { ActionButton } from "@/components/ui";

const STORAGE_KEY = "capsule-onboarded";

const STEPS: { n: number; label: string; hint: string }[] = [
  { n: 1, label: "Knowledge Graph", hint: "trace any skill to its origin" },
  { n: 2, label: "Skills", hint: "the enterprise capsule-maxxed set" },
  { n: 3, label: "A/B Trials", hint: "capsule vs cold, measured" },
];

export function Onboarding() {
  const openPanelFor = useStore((s) => s.openPanelFor);
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    let onboarded = false;
    try {
      onboarded = window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      onboarded = false;
    }
    setShow(!onboarded);
  }, []);

  const dismiss = () => {
    setShow(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const start = () => {
    openPanelFor("graph");
    dismiss();
  };

  if (!show) return null;

  return (
    <div className="pointer-events-auto fixed bottom-5 right-5 z-50 w-[300px] rounded-[14px] border border-[var(--line)] bg-white p-[15px] shadow-[0_12px_40px_#0000001f]">
      <div className="mb-[3px] flex items-start gap-2">
        <h4 className="m-0 flex-1 text-[13.5px] font-bold text-[var(--ink)]">
          Welcome to CAPSULE
        </h4>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss welcome"
          className="grid h-[22px] w-[22px] flex-none place-items-center rounded-[6px] text-[var(--mut)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]"
        >
          ✕
        </button>
      </div>
      <p className="mb-[11px] text-[12px] leading-[1.45] text-[var(--mut)]">
        Finished AI coding sessions become scored, reusable Handoff Capsules.
        Three places to look first:
      </p>
      <ul className="mb-[12px] space-y-[7px]">
        {STEPS.map((s) => (
          <li key={s.n} className="flex items-start gap-[8px]">
            <span className="mono grid h-[18px] w-[18px] flex-none place-items-center rounded-full bg-[var(--blue-bg)] text-[10px] font-bold text-[var(--blue)]">
              {s.n}
            </span>
            <span className="min-w-0 text-[12px] leading-[1.4] text-[var(--ink2)]">
              <b className="font-semibold text-[var(--ink)]">{s.label}</b>
              <span className="text-[var(--dim)]"> — {s.hint}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-[7px]">
        <ActionButton onClick={start} className="flex-1">
          Start here — open the Knowledge Graph
        </ActionButton>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-[8px] border border-transparent px-[10px] py-[6px] text-[11.5px] font-semibold text-[var(--mut)] hover:bg-[var(--hover)]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
