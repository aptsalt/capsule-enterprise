"use client";

// CAPSULE — RIGHT PANEL shell (.right).
// Agent cards (Review capsule / Adopt skill) · Actions shortcut grid ·
// Composer with "Skills ▾ Recommended ▾" and the Capsule toggle.
// Ported 1:1 from factory.html. All wiring goes through useStore.

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { data } from "@/lib/data";
import { capsulesForSkill } from "@/lib/selectors";
import { useStore, type PanelId } from "@/lib/store";
import { ActionButton, Toggle, cn } from "@/components/ui";
import {
  CommentIcon,
  DocIcon,
  GearIcon,
  GraphIcon,
  HistoryIcon,
  SendIcon,
  SparkIcon,
} from "@/components/icons";
import {
  SKILL_CATALOG,
  SKILL_CATEGORIES,
  type SkillCategory,
} from "@/lib/skillCatalog";

// Reuse existing glyphs per category — drives both the menu rows and the chips.
const CATEGORY_ICON: Record<SkillCategory, typeof DocIcon> = {
  Requirements: DocIcon,
  Blueprints: GraphIcon,
  "Work Orders": GearIcon,
  Feedback: CommentIcon,
  General: SparkIcon,
};

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
  const chat = useStore((s) => s.chat);
  const chatBusy = useStore((s) => s.chatBusy);
  const pushChat = useStore((s) => s.pushChat);
  const appendChat = useStore((s) => s.appendChat);
  const setChatBusy = useStore((s) => s.setChatBusy);
  const clearChat = useStore((s) => s.clearChat);
  const ensureChatSession = useStore((s) => s.ensureChatSession);

  const [capsuleCardOpen, setCapsuleCardOpen] = useState(true);
  const [skillCardOpen, setSkillCardOpen] = useState(true);
  const [prompt, setPrompt] = useState("");

  // @-mention state: the popover opens while an unbroken "@token" sits to the
  // left of the caret; mentionQuery filters the requirement list live.
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  // Skills dropdown: which category is expanded, and the attached-skill chips.
  const [skillsMenuOpen, setSkillsMenuOpen] = useState(false);
  const [openCategory, setOpenCategory] = useState<SkillCategory | null>(null);
  const [chips, setChips] = useState<{ name: string; category: SkillCategory }[]>([]);

  const addChip = (name: string, category: SkillCategory) => {
    setChips((prev) =>
      prev.some((c) => c.name === name) ? prev : [...prev, { name, category }],
    );
    setSkillsMenuOpen(false);
    inputRef.current?.focus();
  };
  const removeChip = (name: string) =>
    setChips((prev) => prev.filter((c) => c.name !== name));

  // "/" inline skill picker: a popover that opens on a "/token" at the caret and
  // filters the skill catalog live (mirrors the "@" requirement mention).
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  // All skills: the 8090 category catalog PLUS the real skills registry, deduped by
  // name (real skills not already in the catalog land under "General").
  const skillItems = useMemo(() => {
    const items = SKILL_CATEGORIES.flatMap((cat) =>
      SKILL_CATALOG[cat].map((name) => ({ name, category: cat })),
    );
    const seen = new Set(items.map((s) => s.name.toLowerCase()));
    for (const s of data.skills) {
      if (!seen.has(s.name.toLowerCase())) {
        items.push({ name: s.name, category: "General" });
        seen.add(s.name.toLowerCase());
      }
    }
    return items;
  }, []);
  const slashMatches = useMemo(() => {
    const q = slashQuery.trim().toLowerCase();
    return skillItems.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    );
  }, [slashQuery, skillItems]);

  // Strip the active "/token" and attach the picked skill as a chip.
  const pickSkill = (name: string, category: SkillCategory) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? prompt.length;
    const before = prompt.slice(0, caret).replace(/\/(\S*)$/, "");
    const next = before + prompt.slice(caret);
    setPrompt(next);
    setSlashOpen(false);
    setSlashQuery("");
    addChip(name, category);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  // Keep the thread pinned to the newest message as it streams in.
  const threadEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [chat]);

  // Gate persisted-chat rendering until after mount so the first client render
  // matches the (empty) server render — sessionStorage rehydration is client-only.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
    const caret = e.target.selectionStart ?? next.length;
    const left = next.slice(0, caret);
    // "@token" → requirement mention; "/token" → skill picker. Mutually exclusive.
    const mention = /(?:^|\s)@(\S*)$/.exec(left);
    const slash = /(?:^|\s)\/(\S*)$/.exec(left);
    if (slash) {
      setSlashOpen(true);
      setSlashQuery(slash[1]);
      setMentionOpen(false);
    } else if (mention) {
      setMentionOpen(true);
      setMentionQuery(mention[1]);
      setSlashOpen(false);
    } else {
      setMentionOpen(false);
      setMentionQuery("");
      setSlashOpen(false);
      setSlashQuery("");
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

  // Send to the local model and stream the reply into the last assistant turn.
  const sendPrompt = async () => {
    const text = prompt.trim();
    if ((!text && chips.length === 0) || chatBusy) return;
    const skills = chips.map((c) => c.name);
    const content = text || `Use the ${skills.join(", ")} skill.`;
    const sessionId = ensureChatSession(); // durable id for ~/.relay/chats

    // Snapshot the thread BEFORE mutating, so the request carries prior turns.
    const history = [...chat, { role: "user" as const, content }];
    pushChat({ role: "user", content, skills: skills.length ? skills : undefined });
    pushChat({ role: "assistant", content: "" });
    setPrompt("");
    setChips([]);
    setMentionOpen(false);
    setSkillsMenuOpen(false);
    setChatBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history, capsuleOn, skills }),
      });
      if (!res.ok || !res.body) {
        appendChat(
          (await res.text().catch(() => "")) ||
            "Local model unavailable — start Ollama (ollama serve).",
        );
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        reply += chunk;
        appendChat(chunk);
      }
      // Persist the completed turn as a durable chat session (fire-and-forget) so it
      // shows up — meaningfully named — in Capture. Server generates the title once.
      if (reply.trim()) {
        void fetch("/api/chats/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: sessionId,
            messages: [...history, { role: "assistant", content: reply }],
          }),
        }).catch(() => {});
      }
    } catch {
      appendChat("\n\n(Connection interrupted.)");
    } finally {
      setChatBusy(false);
    }
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
      {mounted && chat.length > 0 ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header — 8090 style: project title + new-chat / history actions */}
          <div className="flex items-center justify-between border-b border-[var(--line)] px-[14px] py-[10px]">
            <span className="truncate text-[13.5px] font-bold text-[var(--ink)]">
              {data.workspace.project}
            </span>
            <div className="flex items-center gap-[4px]">
              {capsuleOn && (
                <span className="rounded-full bg-[var(--blue-bg)] px-[7px] py-[2px] text-[10px] font-bold uppercase tracking-[.04em] text-[var(--blue)]">
                  warm
                </span>
              )}
              <button
                type="button"
                onClick={clearChat}
                title="New chat"
                aria-label="New chat"
                className="grid h-[26px] w-[26px] place-items-center rounded-[7px] text-[17px] leading-none text-[var(--ink2)] hover:bg-[var(--hover)]"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => showToast("No saved chats yet.")}
                title="History"
                aria-label="History"
                className="grid h-[26px] w-[26px] place-items-center rounded-[7px] text-[var(--dim)] hover:bg-[var(--hover)]"
              >
                <HistoryIcon size={15} />
              </button>
            </div>
          </div>

          {/* Thread — flat document flow (user = card, agent = plain text) */}
          <div className="flex-1 space-y-[12px] overflow-y-auto px-[14px] py-[14px]">
            {chat.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="space-y-[6px]">
                  <div className="rounded-[10px] border border-[var(--line)] bg-white px-[11px] py-[9px] text-[13px] leading-[1.5] text-[var(--ink)]">
                    {m.skills?.length ? (
                      <span className="mr-[6px] inline-flex flex-wrap gap-[5px] align-middle">
                        {m.skills.map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center gap-[4px] rounded-full bg-[var(--blue-bg)] px-[8px] py-[2px] text-[11.5px] font-semibold text-[var(--blue)]"
                          >
                            <SparkIcon size={12} className="text-[var(--blue)]" />
                            {s}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    {m.content}
                  </div>
                  {m.skills?.map((s) => (
                    <div
                      key={s}
                      className="flex items-center gap-[6px] px-[2px] text-[12px] text-[var(--dim)]"
                    >
                      <DocIcon size={13} className="text-[var(--dim)]" />
                      {s} skill loaded
                    </div>
                  ))}
                </div>
              ) : (
                <div key={i} className="md px-[2px]">
                  {m.content ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content}
                    </ReactMarkdown>
                  ) : chatBusy ? (
                    <span className="text-[var(--dim)]">Thinking…</span>
                  ) : null}
                </div>
              ),
            )}
            <div ref={threadEndRef} />
          </div>
        </div>
      ) : (
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
      )}

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
          {/* "/" skill picker — filters the catalog live; selecting attaches a chip. */}
          {slashOpen && (
            <div
              role="listbox"
              aria-label="Insert a skill"
              className="absolute bottom-[calc(100%+6px)] left-0 z-20 w-[260px] max-w-full overflow-hidden rounded-[10px] border border-[var(--line)] bg-white shadow-[0_8px_28px_#00000022]"
            >
              <div className="mono border-b border-[var(--line)] px-[10px] py-[6px] text-[10px] font-bold uppercase tracking-[.06em] text-[var(--dim)]">
                Skills{slashQuery ? ` · "${slashQuery}"` : ""}
              </div>
              {slashMatches.length === 0 && (
                <div className="px-[10px] py-[9px] text-[11.5px] text-[var(--dim)]">
                  No matching skills
                </div>
              )}
              <ul className="max-h-[208px] overflow-y-auto py-1">
                {slashMatches.map((s) => {
                  const Icon = CATEGORY_ICON[s.category];
                  return (
                    <li key={s.name}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pickSkill(s.name, s.category);
                        }}
                        className="flex w-full items-center gap-2 px-[10px] py-[7px] text-left hover:bg-[var(--hover)]"
                      >
                        <Icon size={14} className="flex-none text-[var(--dim)]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-semibold text-[var(--ink)]">
                            {s.name}
                          </span>
                          <span className="block text-[10px] uppercase tracking-[.03em] text-[var(--dim)]">
                            {s.category}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {chips.length > 0 && (
            <div className="mb-[6px] flex flex-wrap gap-[5px]">
              {chips.map((c) => {
                const Icon = CATEGORY_ICON[c.category];
                return (
                  <span
                    key={c.name}
                    className="inline-flex items-center gap-[5px] rounded-full bg-[var(--blue-bg)] py-[3px] pl-[8px] pr-[5px] text-[11.5px] font-semibold text-[var(--blue)]"
                  >
                    <Icon size={13} className="text-[var(--blue)]" />
                    {c.name}
                    <button
                      type="button"
                      onClick={() => removeChip(c.name)}
                      aria-label={`Remove ${c.name}`}
                      className="grid h-[15px] w-[15px] place-items-center rounded-full text-[var(--blue)] hover:bg-[#ffffff80]"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={handleChange}
            onBlur={() => {
              setMentionOpen(false);
              setSlashOpen(false);
            }}
            onKeyDown={(e) => {
              if (slashOpen && slashMatches.length > 0) {
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  pickSkill(slashMatches[0].name, slashMatches[0].category);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setSlashOpen(false);
                  return;
                }
              }
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
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setSkillsMenuOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={skillsMenuOpen}
                className="flex items-center gap-[4px] rounded-[8px] border border-[var(--line)] px-2 py-1 text-[11px] font-semibold text-[var(--ink2)] hover:bg-[var(--hover)]"
              >
                Skills{" "}
                <span className="text-[10px] text-[var(--dim)]">
                  {skillsMenuOpen ? "▴" : "▾"}
                </span>
              </button>
              {skillsMenuOpen && (
                <>
                  {/* click-away */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setSkillsMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    aria-label="Attach a skill"
                    className="absolute bottom-[calc(100%+6px)] left-0 z-20 w-[260px] overflow-hidden rounded-[12px] border border-[var(--line)] bg-white py-[6px] shadow-[0_12px_36px_#00000026]"
                  >
                    {SKILL_CATEGORIES.map((cat) => {
                      const Icon = CATEGORY_ICON[cat];
                      const items = SKILL_CATALOG[cat];
                      const expanded = openCategory === cat;
                      return (
                        <div key={cat}>
                          <button
                            type="button"
                            onClick={() =>
                              setOpenCategory(expanded ? null : cat)
                            }
                            className="flex w-full items-center gap-[8px] px-[12px] py-[9px] text-left hover:bg-[var(--hover)]"
                          >
                            <span className="w-[10px] text-[10px] text-[var(--dim)]">
                              {expanded ? "⌄" : "›"}
                            </span>
                            <Icon size={14} className="text-[var(--dim)]" />
                            <span className="flex-1 text-[12.5px] font-semibold uppercase tracking-[.02em] text-[var(--ink2)]">
                              {cat}
                            </span>
                            <span className="text-[11px] font-semibold text-[var(--dim)]">
                              {items.length}
                            </span>
                          </button>
                          {expanded && (
                            <ul className="pb-[2px]">
                              {items.map((name) => (
                                <li key={name}>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => addChip(name, cat)}
                                    className="flex w-full items-center gap-[8px] py-[6px] pl-[40px] pr-[12px] text-left text-[12px] text-[var(--ink2)] hover:bg-[var(--hover)]"
                                  >
                                    {name}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                    <div className="mt-[4px] border-t border-[var(--line)] pt-[4px]">
                      <button
                        type="button"
                        onClick={() => {
                          setSkillsMenuOpen(false);
                          openPanelFor("skills");
                        }}
                        className="flex w-full items-center gap-[8px] px-[12px] py-[9px] text-left text-[12.5px] font-semibold text-[var(--blue)] hover:bg-[var(--hover)]"
                      >
                        <span className="text-[14px] leading-none">+</span> Add
                        Skill
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
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
              disabled={chatBusy}
              title={chatBusy ? "Generating…" : "Send"}
              aria-label="Send"
              className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[var(--blue)] text-white hover:bg-[var(--blue-d)] disabled:opacity-60"
            >
              {chatBusy ? (
                <span className="h-[14px] w-[14px] animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <SendIcon size={16} />
              )}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
