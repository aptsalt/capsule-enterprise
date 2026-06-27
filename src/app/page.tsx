"use client";

// CAPSULE — the composed workspace.
// App shell is a 2-row grid (46px TopBar + 1fr body). The BODY is a 4-column
// css-grid: sidebar 248 · editor 1fr · side-panel 0→360 (animated, only when
// store.openPanel != null) · right rail 322. Exactly one side panel renders at
// a time, chosen by store.openPanel. Column animation is ported from
// factory.html (.body / .body.panel-open).

import { useEffect, useRef, useState, type ComponentType, type PointerEvent } from "react";
import { useStore, type PanelId } from "@/lib/store";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { DocumentEditor } from "@/components/DocumentEditor";
import { RightPanel } from "@/components/RightPanel";
import { Toast } from "@/components/ui";
import { KnowledgeGraphPanel } from "@/components/panels/KnowledgeGraphPanel";
import { SkillsPanel } from "@/components/panels/SkillsPanel";
import { VersionsPanel } from "@/components/panels/VersionsPanel";
import { AbTrialsPanel } from "@/components/panels/AbTrialsPanel";
import { CapturePanel } from "@/components/panels/CapturePanel";
import { InheritPanel } from "@/components/panels/InheritPanel";

// One panel component per openPanel id. Exactly one shows at a time.
const PANELS: Record<Exclude<PanelId, null>, ComponentType> = {
  graph: KnowledgeGraphPanel,
  skills: SkillsPanel,
  versions: VersionsPanel,
  ab: AbTrialsPanel,
  capture: CapturePanel,
  inherit: InheritPanel,
};

// Body columns: sidebar 248 · editor 1fr · side-panel (panelWidth, 0 when closed)
// · right rail 322. panelWidth is store-owned and clamped to [PANEL_MIN, PANEL_MAX],
// so it survives panel swaps and never collapses the canvas.
const columns = (open: boolean, width: number) =>
  `248px 1fr ${open ? width : 0}px 322px`;

export default function Page() {
  const openPanel = useStore((s) => s.openPanel);
  const closePanel = useStore((s) => s.closePanel);
  const panelWidth = useStore((s) => s.panelWidth);
  const setPanelWidth = useStore((s) => s.setPanelWidth);
  const Panel = openPanel ? PANELS[openPanel] : null;

  // True only while the resize handle is being dragged. We freeze the grid
  // transition during the drag so the column tracks the pointer 1:1 (the
  // .24s ease would otherwise lag every frame and feel rubbery).
  const [dragging, setDragging] = useState(false);
  // Pointer-down anchor: where the drag started and the width at that moment.
  // The panel grows to the LEFT, so dragging left (clientX shrinks) widens it.
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  // Escape dismisses the open side panel (approved keyboard affordance).
  useEffect(() => {
    if (!openPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openPanel, closePanel]);

  const onHandleDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    drag.current = { startX: e.clientX, startWidth: panelWidth };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onHandleMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    // Left edge: moving the pointer left increases width. setPanelWidth clamps.
    setPanelWidth(drag.current.startWidth + (drag.current.startX - e.clientX));
  };

  const onHandleUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div className="grid h-screen grid-rows-[46px_1fr] overflow-hidden bg-[var(--bg)]">
      <TopBar />

      <div
        className="grid min-h-0"
        style={{
          gridTemplateColumns: columns(!!Panel, panelWidth),
          transition: dragging
            ? "none"
            : "grid-template-columns .24s cubic-bezier(.4,0,.2,1)",
        }}
      >
        <Sidebar />
        <DocumentEditor />

        {/* animated side-panel column — clips its panelWidth child down to 0 when closed */}
        <div className="relative min-w-0 overflow-hidden">
          {Panel && (
            <>
              {/* drag handle straddling the panel's left seam with the editor */}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize panel"
                onPointerDown={onHandleDown}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none hover:bg-[var(--blue)]/20"
              />
              <Panel />
            </>
          )}
        </div>

        <RightPanel />
      </div>

      <Toast />
    </div>
  );
}
