"use client";

// CAPSULE — RIGHT PANEL shell (.right).
// Agent cards (Review capsule / Adopt skill) · Actions shortcut grid ·
// Composer with "Skills ▾ Recommended ▾" and the Capsule toggle.
// Ported 1:1 from factory.html. All wiring goes through useStore.

import { useMemo, useRef, useState } from "react";
import { data } from "@/lib/data";
import { capsulesForSkill } from "@/lib/selectors";
import { useStore, type PanelId } from "@/lib/store";
import { ActionButton, Toggle, cn } from "@/components/ui";
import { DocIcon, SendIcon } from "@/components/icons";

const REVIEW_CAPSULE_ID = "CAP-1008";
const ADOPT_SKILL_ID = "skill/sca-challenge";

const ACTIONS: { label: string; panel: Exclude<PanelId, null> }[] = [
  { label: "Graph", panel: "graph" },
  { label: "Skills", panel: "skills" },
  { label: "Versions", panel: "versions" },
  { label: "A/B trials", panel: "ab" },
  { label: "Diff", panel: "versions" },
];

// Σ capsule.reuses * tokensSavedPerReuse routed into a skill.
function savedForSkill(skillId: string): number {
  return capsulesForSkill(skillId).reduce(
    (sum, c) => sum + c.reuses * c.tokensSavedPerReuse,
    0,
  );
}

export function RightPanel() {
  const openPanelFor = useStore((s) => s.openPanelFor);
  const selectCapsule = useStore((s) => s.selectCapsule);
  const selectNode = useStore((s) => s.selectNode);
  const selectSkill = useStore((s) => s.selectSkill);
  const adoptLatest = useStore((s) => s.adoptLatest);
  const capsuleOn = useStore((s) => s.capsuleOn);
  const toggleCapsule = useStore((s) => s.toggleCapsule);
  const showToast = useStore((s) => s.showToast);

  const [capsuleCardOpen, setCapsuleCardOpen] = useState(true);
  const [skillCardOpen, setSkillCardOpen] = useState(true);
  const [prompt, setPrompt] = useState("");

  // @-mention state: the popover opens while an unbroken "@token" sits to the
  // left of the caret; mentionQuery filters the requirement list live.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  // Requirements matching the active "@token" (by id or title). Empty token
  // shows the full list.
  const mentionMatches = useMemo(() => {
    const q = mentionQuery.toLowerCase();
    return data.requirements.filter(
      (r) =>
        !q ||
        r.id.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q),
    );
  }, [mentionQuery]);

  // Recompute the active "@token" from the caret position on every edit.
  // "/" as the sole character keeps the existing Skills affordance.
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setPrompt(next);
    if (next === "/") {
      openPanelFor("skills");
      return;
    }
    const caret = e.target.selectionStart ?? next.length;
    const token = /(?:^|\s)@(\S*)$/.exec(next.slice(0, caret));
    if (token) {
      setMentionOpen(true);
      setMentionQuery(token[1]);
    } else {
      setMentionOpen(false);
      setMentionQuery("");
    }
  };

  // Replace the active "@token" with "@REQ-00x " and return focus to the input.
  const insertMention = (id: string) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? prompt.length;
    const before = prompt.slice(0, caret).replace(/@(\S*)$/, `@${id} `);
    const next = before + prompt.slice(caret);
    setPrompt(next);
    setMentionOpen(false);
    setMentionQuery("");
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const sendPrompt = () => {
    const text = prompt.trim();
    if (!text) return;
    showToast(
      capsuleOn
        ? "Sent to agent with capsule context."
        : "Sent to agent.",
    );
    setPrompt("");
    setMentionOpen(false);
  };

  const reviewCapsule = () => {
    selectCapsule(REVIEW_CAPSULE_ID);
    selectNode(REVIEW_CAPSULE_ID); // capsule id === graph node id
    openPanelFor("graph");
  };

  const adoptSca = () => {
    adoptLatest(ADOPT_SKILL_ID);
    setSkillCardOpen(false);
  };

  const auditTrail = () => {
    // Provenance graph focused on the highest-value skill.
    const best = data.skills.reduce((top, s) =>
      savedForSkill(s.id) > savedForSkill(top.id) ? s : top,
    );
    selectSkill(best.id);
    selectNode(best.id);
    openPanelFor("graph");
  };

  return (
    <aside className="flex min-h-0 flex-col border-l border-[var(--line)] bg-[#fcfcfd]">
      <div className="flex-1 overflow-y-auto p-[14px]">
        {/* Capsules — review CTA */}
        <div className="mono mx-[2px] mb-2 mt-[6px] text-[10.5px] font-bold uppercase tracking-[.06em] text-[var(--dim)]">
          Capsules
        </div>
        {capsuleCardOpen && (
          <div className="mb-[10px] rounded-[11px] border border-[var(--line)] bg-white p-3">
            <h4 className="mb-1 text-[12.8px] font-bold">
              New capsule ready — CAP-1008
            </h4>
            <p className="mb-[10px] text-[12px] leading-[1.45] text-[var(--mut)]">
              SCA passkey device-binding. Proposes{" "}
              <b className="mono">skill/sca-challenge@1.1.0</b>. Awaiting human
              adoption.
            </p>
            <div className="flex gap-[7px]">
              <button
                type="button"
                onClick={() => setCapsuleCardOpen(false)}
                className="flex-1 rounded-[8px] border border-transparent p-[6px] text-[11.5px] font-semibold text-[var(--mut)] hover:bg-[var(--hover)]"
              >
                Dismiss
              </button>
              <ActionButton onClick={reviewCapsule} className="flex-1">
                Review
              </ActionButton>
            </div>
          </div>
        )}

        {/* Skill updates — adopt CTA */}
        <div className="mono mx-[2px] mb-2 mt-[6px] text-[10.5px] font-bold uppercase tracking-[.06em] text-[var(--dim)]">
          Skill updates
        </div>
        {skillCardOpen && (
          <div className="mb-[10px] rounded-[11px] border border-[var(--line)] bg-white p-3">
            <h4 className="mb-1 text-[12.8px] font-bold">
              Adopt SCA Challenge v1.1.0?
            </h4>
            <p className="mb-[10px] text-[12px] leading-[1.45] text-[var(--mut)]">
              Enterprise has a newer, capsule-maxxed version.{" "}
              <b className="text-[var(--green)]">saves 2,600 tokens/use</b>.
            </p>
            <div className="flex gap-[7px]">
              <button
                type="button"
                onClick={() => setSkillCardOpen(false)}
                className="flex-1 rounded-[8px] border border-transparent p-[6px] text-[11.5px] font-semibold text-[var(--mut)] hover:bg-[var(--hover)]"
              >
                Keep current
              </button>
              <ActionButton onClick={adoptSca} className="flex-1">
                Adopt
              </ActionButton>
            </div>
          </div>
        )}

        {/* Actions grid */}
        <div className="mono mx-[2px] mb-2 mt-[6px] text-[10.5px] font-bold uppercase tracking-[.06em] text-[var(--dim)]">
          Actions
        </div>
        <div className="my-[6px] mb-[14px] grid grid-cols-2 gap-[6px]">
          {ACTIONS.map((a, i) => (
            <button
              key={`${a.label}-${i}`}
              type="button"
              onClick={() => openPanelFor(a.panel)}
              className="flex items-center gap-2 rounded-[9px] border border-[var(--line)] bg-white px-[9px] py-2 text-[12px] text-[var(--ink2)] hover:bg-[var(--hover)]"
            >
              <span className="h-[6px] w-[6px] rounded-full bg-[var(--blue)]" />
              {a.label}
            </button>
          ))}
          <button
            type="button"
            onClick={auditTrail}
            className="flex items-center gap-2 rounded-[9px] border border-[var(--line)] bg-white px-[9px] py-2 text-[12px] text-[var(--ink2)] hover:bg-[var(--hover)]"
          >
            <span className="h-[6px] w-[6px] rounded-full bg-[var(--blue)]" />
            Audit trail
          </button>
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-[var(--line)] bg-white px-3 py-[11px]">
        <div className="mb-2 text-[11px] text-[var(--dim)]">
          Use <b>@</b> to mention requirements, <b>/</b> to use skills
        </div>
        <div
          className={cn(
            "relative min-w-0 rounded-[11px] border px-[10px] py-[9px] transition-[border-color]",
            capsuleOn ? "capsule-aura" : "border-[var(--line)]",
          )}
        >
          {/* @-mention popover — requirements (id + title). Stays open even on
              an empty match so the user gets a "no matches" affordance instead
              of the popover silently vanishing with mentionOpen left dangling. */}
          {mentionOpen && (
            <div
              role="listbox"
              aria-label="Mention a requirement"
              className="absolute bottom-[calc(100%+6px)] left-0 z-20 max-w-full overflow-hidden rounded-[10px] border border-[var(--line)] bg-white shadow-[0_8px_28px_#00000022]"
            >
              <div className="mono border-b border-[var(--line)] px-[10px] py-[6px] text-[10px] font-bold uppercase tracking-[.06em] text-[var(--dim)]">
                Requirements
              </div>
              {mentionMatches.length === 0 && (
                <div className="px-[10px] py-[9px] text-[11.5px] text-[var(--dim)]">
                  No matching requirements
                </div>
              )}
              <ul className="max-h-[208px] overflow-y-auto py-1">
                {mentionMatches.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      // mousedown (not click) so the textarea keeps focus and
                      // its caret position survives the insertion.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(r.id);
                      }}
                      className="flex w-full items-start gap-2 px-[10px] py-[7px] text-left hover:bg-[var(--hover)]"
                    >
                      <DocIcon
                        size={14}
                        className="mt-[2px] flex-none text-[var(--dim)]"
                      />
                      <span className="min-w-0">
                        <span className="mono block text-[11px] font-bold text-[var(--blue)]">
                          {r.id}
                        </span>
                        <span className="block truncate text-[12px] text-[var(--ink2)]">
                          {r.title}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={handleChange}
            onBlur={() => setMentionOpen(false)}
            onKeyDown={(e) => {
              if (mentionOpen && mentionMatches.length > 0) {
                if (e.key === "Enter") {
                  e.preventDefault();
                  insertMention(mentionMatches[0].id);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMentionOpen(false);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendPrompt();
              }
            }}
            rows={1}
            placeholder="Ask the agent to build with your enterprise skills…"
            aria-label="Message the agent"
            className="min-h-[30px] w-full resize-none border-0 bg-transparent text-[12.5px] leading-[1.5] text-[var(--ink)] outline-none placeholder:text-[var(--dim)]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-[6px]">
            <button
              type="button"
              onClick={() => openPanelFor("skills")}
              className="flex shrink-0 items-center gap-[4px] rounded-[8px] border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--ink2)] hover:bg-[var(--hover)]"
            >
              Skills <span className="text-[10px] text-[var(--dim)]">▾</span>
            </button>
            <button
              type="button"
              onClick={() => openPanelFor("skills")}
              className="flex shrink-0 items-center gap-[4px] rounded-[8px] border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--ink2)] hover:bg-[var(--hover)]"
            >
              Recommended{" "}
              <span className="text-[10px] text-[var(--dim)]">▾</span>
            </button>
            <Toggle
              checked={capsuleOn}
              onChange={() => toggleCapsule()}
              label="Capsule"
              title="Inject the latest capsule context"
            />
            <button
              type="button"
              onClick={sendPrompt}
              title="Send"
              aria-label="Send"
              className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[var(--blue)] text-white hover:bg-[var(--blue-d)]"
            >
              <SendIcon size={16} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
