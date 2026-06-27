"use client";

// CAPSULE — SIDEBAR shell.
// Breadcrumb · use-case search · Product Overview doc tree · Feature
// Requirements · "Capsules from today" · capture button · user chip.
// Ported 1:1 from factory.html (.side). The search box drives the skills
// recommender (store.recommendQuery + skills panel); each capsule row
// selects the capsule and focuses its node in the Knowledge Graph panel.

import { useEffect, useRef } from "react";
import { data } from "@/lib/data";
import { docs, type Doc } from "@/lib/docs";
import { useStore } from "@/lib/store";
import { ActionButton, cn } from "@/components/ui";
import {
  CapsuleIcon,
  GearIcon,
  GraphIcon,
  SearchIcon,
  SparkIcon,
} from "@/components/icons";

// Resolve the store's free-form activeDocId against either a doc id or its
// label, matching the editor's resolver so the tree and the canvas agree.
function resolveDoc(activeDocId: string): Doc {
  return (
    docs.find((d) => d.id === activeDocId || d.label === activeDocId) ?? docs[0]
  );
}

function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-none opacity-70">
      <rect x="2.5" y="1.5" width="9" height="11" rx="1.5" stroke="currentColor" />
      <path d="M5 5h4M5 7.5h4" stroke="currentColor" strokeLinecap="round" />
    </svg>
  );
}

function shortFinding(text: string): string {
  return text.length > 62 ? `${text.slice(0, 60)}…` : text;
}

type CapsuleRow = {
  id: string;
  title: string;
  meta: string; // mono sub-line: id · model
  score: number;
  local: boolean;
  onClick: () => void;
};

export function Sidebar() {
  const recommendQuery = useStore((s) => s.recommendQuery);
  const setRecommendQuery = useStore((s) => s.setRecommendQuery);
  const openPanelFor = useStore((s) => s.openPanelFor);
  const selectCapsule = useStore((s) => s.selectCapsule);
  const selectNode = useStore((s) => s.selectNode);
  const selectedCapsuleId = useStore((s) => s.selectedCapsuleId);
  const capturedCapsules = useStore((s) => s.capturedCapsules);
  const selectedCapturedId = useStore((s) => s.selectedCapturedId);
  const selectCaptured = useStore((s) => s.selectCaptured);
  const activeDocId = useStore((s) => s.activeDocId);
  const activeSectionId = useStore((s) => s.activeSectionId);
  const setActiveSection = useStore((s) => s.setActiveSection);

  const activeDoc = resolveDoc(activeDocId);
  // null section falls back to the doc's first section, matching the editor.
  const currentSectionId = activeSectionId ?? activeDoc.sections[0]?.id ?? null;

  // Ctrl/Cmd-K focuses the use-case search, matching its visible shortcut pill.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const onMockCapsuleClick = (id: string) => {
    selectCapsule(id);
    selectNode(id); // capsule id === graph node id → focuses that node
    openPanelFor("graph");
  };

  // Real captures (overlay, newest first) sit ABOVE the mock dataset capsules.
  const localRows: CapsuleRow[] = capturedCapsules.map((c) => ({
    id: c.id,
    title: shortFinding(c.finding || c.summary),
    meta: `${c.id} · ${c.model}`,
    score: c.transferScore,
    local: true,
    onClick: () => {
      selectCaptured(c.id);
      openPanelFor("capture");
    },
  }));

  const mockRows: CapsuleRow[] = [...data.capsules]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((c) => ({
      id: c.id,
      title: shortFinding(c.finding || c.summary),
      meta: `${c.id} · ${c.model}`,
      score: c.transferScore,
      local: false,
      onClick: () => onMockCapsuleClick(c.id),
    }));

  const rows = [...localRows, ...mockRows];

  const openCapture = () => {
    selectCaptured(null);
    openPanelFor("capture");
  };

  return (
    <aside className="flex min-h-0 flex-col border-r border-[var(--line)] bg-[var(--side)]">
      {/* breadcrumb */}
      <div className="flex items-center gap-[7px] px-[14px] pb-[6px] pt-[11px] text-[12.5px] font-semibold text-[var(--mut)]">
        <span className="text-[var(--dim)]">‹</span> {activeDoc.label}
      </div>

      {/* search → recommender */}
      <div className="mx-3 mb-2 mt-1 flex items-center gap-2 rounded-[8px] border border-[var(--line)] bg-white px-[10px] py-[7px] text-[12.5px] text-[var(--dim)]">
        <SearchIcon size={15} />
        <input
          ref={searchRef}
          value={recommendQuery}
          onChange={(e) => setRecommendQuery(e.target.value)}
          onFocus={() => openPanelFor("skills")}
          onKeyDown={(e) => {
            if (e.key === "Enter") openPanelFor("skills");
          }}
          placeholder="Search skills by use-case…"
          autoComplete="off"
          aria-label="Search skills by use-case"
          className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-[var(--ink)] outline-none"
        />
        <span className="mono ml-auto rounded-[5px] border border-[var(--line)] bg-[var(--side2)] px-[5px] py-px text-[10px] font-semibold text-[var(--dim)]">
          Ctrl K
        </span>
      </div>

      {/* Scroll body — split into two ~50% halves. The TOP (document/feature
          tree) and the BOTTOM ("Capsules from today") each own half the
          available height and scroll INDEPENDENTLY, so a long capsule list
          never pushes the tree off-screen. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* active doc section tree — top half, independently scrollable */}
        <div className="min-h-0 flex-1 basis-0 overflow-y-auto px-2 pb-2 pt-[2px]">
          <div className="flex items-center gap-[6px] px-2 pb-1 pt-[10px] text-[12px] font-bold text-[var(--ink2)]">
            {activeDoc.label}
            <span className="ml-auto text-[15px] leading-none text-[var(--dim)] hover:text-[var(--ink)]">
              ＋
            </span>
          </div>
          {activeDoc.sections.map((section) => {
            const on = section.id === currentSectionId;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-[9px] rounded-[7px] px-[9px] py-[6px] text-left text-[13px]",
                  on
                    ? "bg-[var(--activebg)] font-semibold text-[var(--blue)] [&_svg]:opacity-100"
                    : "text-[var(--ink2)] hover:bg-[var(--hover)]",
                )}
              >
                <DocIcon />
                {section.label}
              </button>
            );
          })}
        </div>

        {/* Capsules from today — bottom half. Pinned header + independently
            scrollable list, so the list grows within its 50% slice. */}
        <div className="flex min-h-0 flex-1 basis-0 flex-col border-t border-[var(--line2)]">
          <div className="flex flex-none items-center gap-[6px] px-[18px] pb-1 pt-[10px] text-[12px] font-bold text-[var(--ink2)]">
            Capsules from today
            <span className="mono ml-auto text-[10px] font-bold text-[var(--mut)]">
              {rows.length}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {rows.map((c) => {
            const on = c.local
              ? c.id === selectedCapturedId
              : c.id === selectedCapsuleId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={c.onClick}
                title={
                  c.local
                    ? "Local capsule — opens capture detail"
                    : "Opens in the Knowledge Graph"
                }
                className={cn(
                  "flex w-full items-center gap-[9px] rounded-[8px] px-[9px] py-[7px] text-left",
                  on
                    ? "bg-[var(--activebg)] outline outline-1 outline-[#cfe0fd]"
                    : "hover:bg-[var(--hover)]",
                )}
              >
                <span className="h-2 w-2 flex-none rounded-[3px] bg-[var(--dim)]" />
                <span className="min-w-0">
                  <span className="flex items-center gap-[5px]">
                    <span className="block text-[12.6px] font-medium leading-[1.25] text-[var(--ink)]">
                      {c.title}
                    </span>
                    {c.local && (
                      <span className="mono flex-none rounded-[4px] bg-[var(--side2)] px-[4px] py-px text-[8.5px] font-bold uppercase tracking-[.04em] text-[var(--mut)]">
                        local
                      </span>
                    )}
                  </span>
                  <span className="mono block text-[10px] font-semibold text-[var(--dim)]">
                    {c.meta}
                  </span>
                </span>
                <span className="mono ml-auto rounded-[6px] bg-[var(--side2)] px-[6px] py-[2px] text-[10px] font-bold text-[var(--mut)]">
                  {c.score}
                </span>
                {/* destination affordance — makes the click target legible
                    before clicking (capsule detail vs knowledge graph). */}
                <span className="flex-none text-[var(--dim)]">
                  {c.local ? <CapsuleIcon size={13} /> : <GraphIcon size={13} />}
                </span>
              </button>
            );
            })}
          </div>
        </div>
      </div>

      {/* capture session — super-saiyan ACTION button: fluorescent
          green-yellow border + glow on hover, dark ink, arrow affordance. */}
      <ActionButton
        onClick={openCapture}
        className="mx-3 my-2 w-[calc(100%-1.5rem)] py-[9px] text-[13px]"
      >
        <SparkIcon size={15} />
        Capture this session
        <span aria-hidden className="text-[15px] leading-none">
          ⟶
        </span>
      </ActionButton>

      {/* user chip */}
      <div className="flex items-center gap-[9px] border-t border-[var(--line)] px-[14px] py-[9px] text-[12px] text-[var(--mut)]">
        <span className="mono grid h-6 w-6 place-items-center rounded-full bg-[var(--blue)] text-[10px] font-bold text-white">
          DK
        </span>
        deepchand89k@gmail…
        <span className="ml-auto text-[var(--dim)]">
          <GearIcon size={15} />
        </span>
      </div>
    </aside>
  );
}
