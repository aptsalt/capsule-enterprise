"use client";

// CAPSULE — DOCUMENT EDITOR shell (.center).
// Top DOC-TABS (Requirements / Product Overview / Technical Requirements)
// switch the active doc via store.setActiveDoc; the header carries a calm
// status pill + a segmented docStatus toggle; the formatting toolbar dims and
// the document surface goes read-only when docStatus !== 'editing'. The
// surface renders the ACTIVE doc's ACTIVE section body (from docs.ts). Panel
// state still flows through useStore: clicking a top-right icon toggles its
// panel (open if closed, close if already on).

import { useEffect, useRef, type ReactNode } from "react";
import { useStore, type PanelId } from "@/lib/store";
import { resolveDoc, type DocStatus } from "@/lib/docs";
import { cn } from "@/components/ui";
import { LinkIcon } from "@/components/icons";

// Calm status pill styling — single blue accent for the live state, neutral
// hairline tones for the frozen/archived states. No second accent colour.
const STATUS_PILL: Record<DocStatus, { label: string; pill: string; dot: string }> = {
  editing: {
    label: "Editing",
    pill: "border-[#cfe0fd] bg-[var(--activebg)] text-[var(--blue)]",
    dot: "bg-[var(--blue)]",
  },
  "read-only": {
    label: "Read only",
    pill: "border-[var(--line)] bg-[var(--side2)] text-[var(--mut)]",
    dot: "bg-[var(--mut)]",
  },
  inactive: {
    label: "Inactive",
    pill: "border-[var(--line)] bg-transparent text-[var(--dim)]",
    dot: "bg-[var(--dim)]",
  },
};

const SEGMENTS: { id: DocStatus; label: string; title: string }[] = [
  { id: "editing", label: "Edit", title: "Editing — live edit" },
  { id: "read-only", label: "Read", title: "Read only — frozen for review" },
  { id: "inactive", label: "Off", title: "Inactive — archived" },
];

type Tool = {
  id: Exclude<PanelId, null>;
  label: string;
  svg: ReactNode;
};

const TOOLS: Tool[] = [
  {
    id: "inherit",
    label: "Handoff",
    svg: (
      <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
        <circle cx="3.8" cy="8.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="13.2" cy="8.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M6.2 8.5h4.4M8.9 6.6l2 1.9-2 1.9"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    id: "graph",
    label: "Knowledge Graph",
    svg: (
      <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
        <circle cx="3.5" cy="3.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="13" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="5" cy="13.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5.5 4.7 11 6.9M11 9.8 6.6 12" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
  {
    id: "skills",
    label: "Skills",
    svg: (
      <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
        <path d="M8.5 1.8 14.5 5 8.5 8.2 2.5 5 8.5 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M2.5 8.5 8.5 11.7 14.5 8.5M2.5 11.8 8.5 15 14.5 11.8" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "versions",
    label: "Versions",
    svg: (
      <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
        <path d="M2.5 8.5a6 6 0 1 0 1.9-4.4M2.4 2v2.4h2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.5 5.2V8.6l2.3 1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "ab",
    label: "A/B Trials",
    svg: (
      <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
        <rect x="2" y="8" width="4" height="7" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="7" y="3.5" width="4" height="11.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        <rect x="12" y="6" width="3" height="9" rx="1" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    ),
  },
];

type FmtButton = {
  cmd?: string;
  val?: string;
  label: string;
  icon?: ReactNode;
  title?: string;
  emphasis?: "b" | "i" | "u" | "s";
  caret?: boolean;
  divider?: boolean;
};

const FMT_BUTTONS: FmtButton[] = [
  { cmd: "formatBlock", val: "p", label: "Paragraph", caret: true },
  { divider: true, label: "" },
  { cmd: "bold", label: "B", title: "Bold", emphasis: "b" },
  { cmd: "italic", label: "I", title: "Italic", emphasis: "i" },
  { cmd: "underline", label: "U", title: "Underline", emphasis: "u" },
  { cmd: "strikeThrough", label: "S", title: "Strikethrough", emphasis: "s" },
  { divider: true, label: "" },
  { cmd: "insertUnorderedList", label: "•", title: "Bullet list" },
  { cmd: "insertOrderedList", label: "1.", title: "Numbered list" },
  { cmd: "createLink", label: "", icon: <LinkIcon size={15} />, title: "Link" },
  { divider: true, label: "" },
  { label: "…", title: "More" },
];

const EMPHASIS: Record<NonNullable<FmtButton["emphasis"]>, string> = {
  b: "font-extrabold",
  i: "italic",
  u: "underline",
  s: "line-through",
};

export function DocumentEditor() {
  const openPanel = useStore((s) => s.openPanel);
  const openPanelFor = useStore((s) => s.openPanelFor);
  const closePanel = useStore((s) => s.closePanel);
  const activeDocId = useStore((s) => s.activeDocId);
  const activeSectionId = useStore((s) => s.activeSectionId);
  const docStatus = useStore((s) => s.docStatus);
  const setDocStatus = useStore((s) => s.setDocStatus);

  const bodyRef = useRef<HTMLDivElement>(null);

  const activeDoc = resolveDoc(activeDocId);
  const activeSection =
    activeDoc.sections.find((s) => s.id === activeSectionId) ?? activeDoc.sections[0];
  const editing = docStatus === "editing";
  const pill = STATUS_PILL[docStatus];

  // Per-tool button refs + the last tool that opened a panel, so focus can be
  // returned to the triggering icon when its panel closes (focus restoration).
  const toolRefs = useRef<Partial<Record<Exclude<PanelId, null>, HTMLButtonElement | null>>>({});
  const lastOpenerRef = useRef<Exclude<PanelId, null> | null>(null);
  const prevPanelRef = useRef<PanelId>(openPanel);

  useEffect(() => {
    const prev = prevPanelRef.current;
    if (prev && !openPanel) {
      // Panel just closed — restore focus to the icon that opened it.
      toolRefs.current[lastOpenerRef.current ?? prev]?.focus();
      lastOpenerRef.current = null;
    }
    prevPanelRef.current = openPanel;
  }, [openPanel]);

  // Each doc carries a default status (technical-requirements opens read-only);
  // sync docStatus to that default when the active doc changes — but only on a
  // genuine doc switch, so a manual toggle on the current doc is never clobbered.
  const prevDocRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevDocRef.current !== activeDoc.id) {
      prevDocRef.current = activeDoc.id;
      setDocStatus(activeDoc.status ?? "editing");
    }
  }, [activeDoc.id, activeDoc.status, setDocStatus]);

  const toggle = (id: Exclude<PanelId, null>) => {
    if (openPanel === id) {
      closePanel();
    } else {
      lastOpenerRef.current = id;
      openPanelFor(id);
    }
  };


  const runCmd = (btn: FmtButton) => {
    if (!editing || !btn.cmd) return;
    bodyRef.current?.focus();
    try {
      if (btn.cmd === "createLink") {
        const url = window.prompt("Link URL", "https://");
        if (url) document.execCommand(btn.cmd, false, url);
      } else if (btn.cmd === "formatBlock") {
        document.execCommand(btn.cmd, false, btn.val ?? "p");
      } else {
        document.execCommand(btn.cmd, false);
      }
    } catch {
      /* execCommand is best-effort */
    }
  };

  const paragraphs = activeSection.body.split("\n\n");

  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-[#fbfcfd]">
      {/* header + status controls + top-level icon toolbar
          (the document tabs live once, in the TopBar) */}
      <div className="flex items-center gap-3 border-b border-[var(--line)] bg-white px-4 py-[11px]">
        <div className="grid h-6 w-6 flex-none place-items-center rounded-[7px] bg-[#eef4ff] text-[var(--blue)]">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="2.5" y="1.5" width="9" height="11" rx="1.5" stroke="currentColor" />
            <path d="M5 5h4M5 7.5h4" stroke="currentColor" strokeLinecap="round" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="m-0 truncate text-[14.5px] font-bold">{activeDoc.label}</h1>
          <div className="mt-px truncate text-[11.5px] text-[var(--dim)]">
            {activeSection.label} · CAPSULE · the capture + feedback layer for 8090 Software Factory
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* calm status pill */}
          <span
            aria-live="polite"
            className={cn(
              "inline-flex items-center gap-[6px] rounded-full border px-[9px] py-[3px] text-[11px] font-semibold",
              pill.pill,
            )}
          >
            <span className={cn("h-[6px] w-[6px] rounded-full", pill.dot)} />
            {pill.label}
          </span>

          {/* docStatus segmented toggle */}
          <div
            role="group"
            aria-label="Document mode"
            className="inline-flex items-center rounded-[8px] border border-[var(--line)] bg-[var(--side2)] p-[2px]"
          >
            {SEGMENTS.map((seg) => {
              const on = docStatus === seg.id;
              return (
                <button
                  key={seg.id}
                  type="button"
                  title={seg.title}
                  aria-pressed={on}
                  onClick={() => setDocStatus(seg.id)}
                  className={cn(
                    "rounded-[6px] px-[8px] py-[3px] text-[11px] font-semibold transition-colors",
                    on
                      ? "bg-white text-[var(--blue)] shadow-[0_1px_2px_#0000000f]"
                      : "text-[var(--mut)] hover:text-[var(--ink)]",
                  )}
                >
                  {seg.label}
                </button>
              );
            })}
          </div>

          <span className="h-[18px] w-px bg-[var(--line)]" />

          {TOOLS.map((t) => {
            const on = openPanel === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  toolRefs.current[t.id] = el;
                }}
                type="button"
                title={t.label}
                aria-label={t.label}
                aria-pressed={on}
                onClick={() => toggle(t.id)}
                className={cn(
                  "tip-host relative grid h-8 w-[34px] place-items-center rounded-[8px] border transition-colors",
                  on
                    ? "border-[#cfe0fd] bg-[var(--activebg)] text-[var(--blue)]"
                    : "border-transparent text-[var(--mut)] hover:bg-[var(--hover)] hover:text-[var(--ink)]",
                )}
              >
                {t.svg}
                <span className="tip">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* formatting toolbar — dimmed + inert when not editing */}
      <div
        aria-disabled={!editing}
        className={cn(
          "flex flex-wrap items-center gap-[3px] border-b border-[var(--line)] bg-white px-4 py-[7px] transition-opacity",
          !editing && "opacity-45",
        )}
      >
        {FMT_BUTTONS.map((b, i) =>
          b.divider ? (
            <span key={`d${i}`} className="mx-[5px] h-[18px] w-px bg-[var(--line)]" />
          ) : (
            <button
              key={b.title ?? b.label}
              type="button"
              title={b.title}
              disabled={!editing}
              onClick={() => runCmd(b)}
              className={cn(
                "inline-flex h-[29px] min-w-[29px] items-center gap-[5px] rounded-[7px] px-2 text-[13px] text-[var(--ink2)] hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:hover:bg-transparent",
                b.emphasis && EMPHASIS[b.emphasis],
              )}
            >
              {b.icon ?? b.label}
              {b.caret && <span className="text-[10px] text-[var(--dim)]">▾</span>}
            </button>
          ),
        )}
      </div>

      {/* editor surface — renders the ACTIVE doc's ACTIVE section */}
      <div className="flex-1 overflow-y-auto px-[30px] py-[26px]">
        <div className="mx-auto min-h-[calc(100%-8px)] max-w-[760px] rounded-[12px] border border-[var(--line)] bg-white px-[42px] pb-[60px] pt-[34px] shadow-[0_1px_2px_#0000000a]">
          <div className="mono text-[10.5px] font-bold uppercase tracking-[.08em] text-[var(--dim)]">
            {activeDoc.label}
          </div>
          <h2
            key={`h-${activeSection.id}`}
            contentEditable={editing}
            suppressContentEditableWarning
            spellCheck={false}
            className="my-[6px] mb-[2px] text-[25px] font-extrabold tracking-[-.02em] outline-none"
          >
            {activeSection.label}
          </h2>
          <div className="mono mb-[18px] text-[11px] font-semibold text-[var(--dim)]">
            {activeSection.id} · {editing ? "last edited by you" : pill.label.toLowerCase()}
          </div>
          <div
            ref={bodyRef}
            key={`b-${activeSection.id}`}
            contentEditable={editing}
            suppressContentEditableWarning
            spellCheck={false}
            data-ph="Write document content here…"
            aria-readonly={!editing}
            className={cn(
              "min-h-[200px] text-[14px] leading-[1.7] text-[var(--ink2)] outline-none empty:before:text-[var(--dim)] empty:before:content-[attr(data-ph)]",
              !editing && "cursor-default select-text",
            )}
          >
            {paragraphs.map((para, i) => (
              <p key={i} className={i === paragraphs.length - 1 ? "mb-0 mt-0" : "mb-4 mt-0"}>
                {para}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
