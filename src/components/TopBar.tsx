"use client";

// CAPSULE — TOPBAR shell.
// Org chip (CAPSULE) + document tabs + action icons + "New Agent".
// Ported 1:1 from factory.html (.top). Tabs are local view state; every
// other piece of app state flows through useStore elsewhere.

import { type ComponentType } from "react";
import { data } from "@/lib/data";
import { docs, resolveDoc, TAB_LABEL } from "@/lib/docs";
import { fmt } from "@/lib/selectors";
import { DEFAULT_ENGINE, useStore } from "@/lib/store";
import { Toggle, cn } from "@/components/ui";
import {
  BrainIcon,
  CommentIcon,
  ExportIcon,
  HistoryIcon,
  ShareIcon,
  SparkIcon,
} from "@/components/icons";

const ACTION_ICONS: { label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { label: "Export", Icon: ExportIcon },
  { label: "Share", Icon: ShareIcon },
  { label: "History", Icon: HistoryIcon },
  { label: "Comments", Icon: CommentIcon },
];

// Render an engine label ("ollama:qwen2.5-coder:14b (local)") as a friendly pill
// caption + locality tag, so the bar always shows whether analysis ran on-device.
function engineCaption(engine: string): { label: string; local: boolean } {
  if (/ollama:/i.test(engine)) {
    const model = engine.replace(/^ollama:/i, "").replace(/\s*\(local\)\s*$/i, "");
    return { label: `Ollama ${model}`, local: true };
  }
  if (/gemini:/i.test(engine)) {
    const m = engine
      .replace(/^gemini:/i, "")
      .replace(/\s*\(.*\)\s*$/, "")
      .replace(/^gemini-?/i, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return { label: `Gemini ${m}`.trim(), local: false };
  }
  if (/cerebras:/i.test(engine)) {
    return { label: `Cerebras ${engine.replace(/^cerebras:/i, "")}`, local: false };
  }
  if (/heuristic/i.test(engine)) return { label: "heuristic", local: true };
  return { label: engine, local: !/cerebras|cloud/i.test(engine) };
}

export function TopBar() {
  const lastEngine = useStore((s) => s.lastEngine);
  const openPanelFor = useStore((s) => s.openPanelFor);
  const agenticMode = useStore((s) => s.agenticMode);
  const toggleAgentic = useStore((s) => s.toggleAgentic);
  const activeDocId = useStore((s) => s.activeDocId);
  const setActiveDoc = useStore((s) => s.setActiveDoc);
  const setActiveSection = useStore((s) => s.setActiveSection);
  const engine = engineCaption(lastEngine ?? DEFAULT_ENGINE);
  // Drive the tab strip off the SAME store the editor reads, so the two doc-tab
  // rows can never disagree. Selecting a tab also resets to that doc's first
  // section — identical to the editor's selectDoc — keeping the canvas in sync.
  const activeDoc = resolveDoc(activeDocId);

  return (
    <div className="grid h-[46px] grid-cols-[248px_1fr_auto] items-center border-b border-[var(--line)] bg-white">
      {/* org chip */}
      <div className="flex h-full items-center gap-[9px] border-r border-[var(--line)] px-3">
        <div className="mono grid h-[22px] w-[22px] place-items-center rounded-[6px] bg-gradient-to-br from-[#11141a] to-[#2b313c] text-[10px] font-extrabold tracking-[-.5px] text-white">
          80
        </div>
        <b className="text-[13px] font-semibold">CAPSULE</b>
        <span className="text-[11px] text-[var(--dim)]">▾</span>
      </div>

      {/* document tabs */}
      <div className="flex h-full items-center gap-1 px-2">
        {docs.map((doc) => {
          const on = doc.id === activeDoc.id;
          return (
            <button
              key={doc.id}
              type="button"
              aria-current={on ? "page" : undefined}
              onClick={() => {
                setActiveDoc(doc.id);
                setActiveSection(doc.sections[0]?.id ?? null);
              }}
              className={cn(
                "rounded-[7px] px-[11px] py-[6px] text-[13px] transition-colors",
                on
                  ? "bg-[var(--side2)] font-semibold text-[var(--ink)]"
                  : "font-medium text-[var(--mut)] hover:bg-[var(--hover)] hover:text-[var(--ink2)]",
              )}
            >
              {TAB_LABEL[doc.id]}
            </button>
          );
        })}
      </div>

      {/* action icons + New Agent */}
      <div className="flex items-center gap-[6px] px-3">
        {/* Agentic auto-distill toggle — the SHARED <Toggle>, so it looks exactly
            like the Capsule toggle: super-saiyan fluorescent green-yellow ON fill
            with the soft glow + dark inner track + white knob. ON keeps a small
            "AUTO" label as the active affordance. Drives the AGENTIC capture flow
            in the Capture panel: distil every session locally, keep only if it
            clears the bar (score ≥ threshold or novelty ≥ 80). */}
        <Toggle
          checked={agenticMode}
          onChange={toggleAgentic}
          title="Agentic: every session is auto-distilled locally; the capsule is kept only if it clears the bar (score ≥ threshold or novelty ≥ 80)."
          className="mono mr-1"
          label={
            <span className="inline-flex items-center gap-[5px]">
              <BrainIcon size={12} />
              Agentic
              {agenticMode && (
                <span className="rounded-full bg-black/10 px-[5px] py-[1px] text-[8.5px] font-bold uppercase tracking-[.09em] text-[var(--ss-ink)]">
                  AUTO
                </span>
              )}
            </span>
          }
        />
        {/* Token-value ledger — CAPSULE's differentiated metric, kept as quiet as
            8090's status pill: hairline, mono, no fill color. Opens the Skills panel. */}
        <button
          type="button"
          onClick={() => openPanelFor("skills")}
          title="Tokens saved across all capsules · adoption rate"
          className="mono mr-1 hidden items-center gap-[6px] rounded-full border border-[var(--line)] bg-white px-[10px] py-[4px] text-[10.5px] font-semibold text-[var(--ink2)] transition-colors hover:bg-[var(--hover)] lg:inline-flex"
        >
          <span className="text-[var(--blue)]">
            <SparkIcon size={12} />
          </span>
          Σ {fmt(data.metrics.tokensSavedTotal)} saved
          <span className="text-[var(--dim)]">· {data.metrics.adoptionRate}% adopted</span>
        </button>
        {/* Distiller engine — demoted to a muted gray chip (no accent, no status
            dot) so it never competes with the primary chrome. */}
        <span
          title={`Distiller engine: ${engine.label}${engine.local ? " (local / on-device)" : " (cloud)"}`}
          className="mono mr-1 hidden items-center rounded-full border border-[var(--line)] bg-[var(--side2)] px-[9px] py-[4px] text-[10.5px] font-semibold text-[var(--mut)] lg:inline-flex"
        >
          {engine.label}
        </span>
        {ACTION_ICONS.map((a) => (
          <button
            key={a.label}
            type="button"
            title={a.label}
            aria-label={a.label}
            className="grid h-[30px] w-[30px] place-items-center rounded-[7px] text-[var(--mut)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          >
            <a.Icon size={16} />
          </button>
        ))}
        <button
          type="button"
          className="flex items-center gap-[6px] rounded-[8px] bg-[var(--ink)] px-3 py-[6px] text-[12.5px] font-semibold text-white transition-colors hover:bg-black"
        >
          ＋ New Agent
        </button>
      </div>
    </div>
  );
}
