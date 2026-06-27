"use client";

// CAPSULE — a single enterprise skill card (`.skill-card`), ported 1:1 from
// factory.html. Shows the capsule-maxxed version, its per-use + Σ savings, the
// capsules that fed it, its use-case chips and last-learned finding, plus the
// Use / Versions / Graph / Pin actions. All state flows through useStore.

import { useState } from "react";
import { useStore } from "@/lib/store";
import {
  capsulesForSkill,
  latestVersion,
  publishedCurrent,
  fmt,
  type AdoptionMap,
} from "@/lib/selectors";
import { data } from "@/lib/data";
import type { Skill } from "@/lib/types";
import { ActionButton, Chip, cn } from "@/components/ui";
import { SparkIcon } from "@/components/icons";

/* ---------- shared atoms -------------------------------------------------- */

/** The 15×15 gear glyph used for the Skills identity (`gear()` in factory). */
export function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <circle cx="7.5" cy="7.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M7.5 1.5v1.6M7.5 11.9v1.6M1.5 7.5h1.6M11.9 7.5h1.6M3.3 3.3l1.1 1.1M10.6 10.6l1.1 1.1M11.7 3.3l-1.1 1.1M4.4 10.6l-1.1 1.1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Use-case tags per skill — drives the `.chip.uc` use-case chips. */
export const USE_CASES: Record<string, string[]> = {
  "skill/payment-idempotency": ["retries", "refunds", "ledger"],
  "skill/iso20022-mapper": ["pacs.008", "camt.053", "multi-currency"],
  "skill/pci-redaction": ["PII", "logs", "prompts"],
  "skill/reconciliation-ledger": ["settlement", "camt.053"],
  "skill/sca-challenge": ["auth", "step-up", "fraud"],
};

/** Per-skill Σ saved == Σ over feeding capsules of reuses × tokensSavedPerReuse. */
export const skillTotalSaved = (skillId: string): number =>
  capsulesForSkill(skillId).reduce(
    (sum, c) => sum + c.reuses * c.tokensSavedPerReuse,
    0,
  );

/* ---------- SkillCard ----------------------------------------------------- */

type SkillCardProps = {
  skill: Skill;
  /** When true, render the capsule-maxxed latest version (incl. proposed). */
  enterprise: boolean;
  /** Adoption overlay (skillId -> adopted version) from the store. */
  adopted?: AdoptionMap;
};

export function SkillCard({ skill, enterprise, adopted }: SkillCardProps) {
  const setVersionsSkill = useStore((s) => s.setVersionsSkill);
  const openPanelFor = useStore((s) => s.openPanelFor);
  const selectNode = useStore((s) => s.selectNode);
  const selectSkill = useStore((s) => s.selectSkill);
  const adoptLatest = useStore((s) => s.adoptLatest);
  const showToast = useStore((s) => s.showToast);

  // Collapsed by default — the bulk of the card (description, full finding,
  // fed-by/Σ/use-case chips, coaching, secondary actions) lives behind this.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const fed = capsulesForSkill(skill.id);
  const latest = latestVersion(skill);
  const cur = publishedCurrent(skill, adopted);
  const shown = enterprise ? latest : cur;
  // Guard: a skill with no versions has nothing to render.
  if (!shown || !latest || !cur) return null;

  // The org has adopted this skill if the dataset opted it in or the session
  // overlay promoted a version.
  const optedIn = skill.optedIn || Boolean(adopted?.[skill.id]);

  const save = Math.abs(shown.tokenDeltaPerUse);
  const tot = skillTotalSaved(skill.id);
  const ucs = USE_CASES[skill.id] ?? [];
  const ahead = latest.version !== cur.version;
  const best = enterprise && ahead;

  const srcCap = data.capsules.find(
    (c) => c.id === shown.learnedFrom?.capsule,
  );
  const pinCmd = `capsule pull ${skill.id}@${shown.version}`;

  const onUse = () => {
    selectSkill(skill.id);
    showToast(`Loaded ${skill.name} v${shown.version} into the session.`);
  };
  const onAdopt = () => adoptLatest(skill.id);
  const onVersions = () => {
    setVersionsSkill(skill.id);
    openPanelFor("versions");
  };
  const onGraph = () => {
    selectNode(skill.id);
    openPanelFor("graph");
  };
  const onCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(pinCmd);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const moreTok =
    Math.abs(latest.tokenDeltaPerUse) - Math.abs(cur.tokenDeltaPerUse);
  // One-line preview when collapsed; full text once Details is open.
  const finding = shown.learnedFrom?.finding ?? skill.description;

  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-[13px] border bg-white p-[14px] transition-[border-color,box-shadow] hover:border-[#d4d8de] hover:shadow-[0_4px_18px_#0000000a]",
        best
          ? "border-[#bcd2fb] shadow-[0_0_0_1px_#bcd2fb_inset]"
          : "border-[var(--line)]",
      )}
    >
      {/* ── ESSENTIALS (always visible) ───────────────────────────────── */}

      {/* head: icon · name/id · current→enterprise version */}
      <div className="flex items-start gap-[10px]">
        <div className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[8px] bg-[#eef4ff] text-[var(--blue)]">
          <GearIcon />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-bold">{skill.name}</div>
          <div className="mono truncate text-[10.5px] font-semibold text-[var(--dim)]">
            {skill.id}
          </div>
        </div>
        <div className="ml-auto flex flex-none flex-col items-end gap-[3px] text-right">
          <span
            className={cn(
              "mono inline-block rounded-[7px] px-[8px] py-[3px] text-[11px] font-bold",
              best
                ? "bg-[var(--activebg)] text-[var(--blue)]"
                : "bg-[var(--side2)] text-[var(--ink2)]",
            )}
          >
            v{shown.version}
          </span>
          {best && (
            <span className="mono text-[9.5px] font-semibold text-[var(--dim)]">
              v{cur.version} → v{latest.version}
            </span>
          )}
        </div>
      </div>

      {/* essential metrics: tokens/use saved · transfer · adoption */}
      <div className="mt-[10px] flex flex-wrap items-center gap-[6px]">
        <Chip tone="save">⌁ {fmt(save)} tok/use</Chip>
        <span className="mono inline-flex items-center gap-[5px] rounded-[6px] bg-[var(--activebg)] px-[7px] py-[3px] text-[10.5px] font-semibold text-[var(--blue)]">
          +{shown.scoreDelta} transfer
        </span>
        {optedIn ? (
          <Chip tone="save">✓ adopted</Chip>
        ) : (
          <Chip>○ not adopted</Chip>
        )}
      </div>

      {/* one-line "last learned" — truncated until Details opens */}
      <div
        className={cn(
          "mt-[9px] text-[11.8px] leading-[1.45] text-[var(--ink2)]",
          !detailsOpen && "truncate",
        )}
      >
        <b className="font-bold text-[var(--blue)]">Last learned · </b>
        {finding}
      </div>

      {/* primary action + Details disclosure */}
      <div className="mt-[11px] flex flex-wrap items-center gap-[6px]">
        {best ? (
          <ActionButton onClick={onAdopt}>
            Update to v{latest.version}
          </ActionButton>
        ) : (
          <ActionButton onClick={onUse}>Use in session</ActionButton>
        )}
        <ActionButton
          variant="secondary"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((o) => !o)}
        >
          {detailsOpen ? "Less" : "Details"}
          <span
            className={cn(
              "text-[10px] transition-transform duration-200",
              detailsOpen && "rotate-180",
            )}
            aria-hidden
          >
            ▾
          </span>
        </ActionButton>
      </div>

      {/* ── DETAILS (progressive disclosure, inline) ──────────────────── */}
      {detailsOpen && (
        <div className="mt-[12px] flex flex-col gap-[11px] border-t border-[var(--line2)] pt-[12px]">
          {/* full description */}
          <div className="text-[12.3px] leading-[1.45] text-[var(--mut)]">
            {skill.description}
          </div>

          {/* fed-by · Σ saved · use-case chips */}
          <div className="flex flex-wrap gap-[6px]">
            <Chip tone="fed">
              ◇ fed by {fed.length} capsule{fed.length === 1 ? "" : "s"}
            </Chip>
            <Chip>Σ {fmt(tot)} saved</Chip>
            {ucs.map((u) => (
              <Chip key={u} tone="uc">
                {u}
              </Chip>
            ))}
          </div>

          {/* coaching disclosure */}
          {srcCap && (
            <details className="rounded-[9px] border border-[#cdebd9] bg-[#f6fbf7] p-0">
              <summary className="mono flex cursor-pointer select-none list-none items-center gap-[5px] rounded-[9px] px-[10px] py-[8px] text-[9.5px] font-bold uppercase tracking-[.04em] text-[var(--green)] transition-colors hover:bg-[#eef8f1] [&::-webkit-details-marker]:hidden">
                <SparkIcon size={12} /> Technique to learn
              </summary>
              <div className="px-[10px] pt-[8px] text-[11.6px] font-semibold leading-[1.5] text-[var(--ink2)]">
                {srcCap.mentalModel || srcCap.finding}
              </div>
              {srcCap.learnings.length > 0 && (
                <ul className="mx-0 mb-[9px] mt-[6px] list-disc pl-[26px] pr-[10px] text-[11.4px] leading-[1.5] text-[var(--ink2)]">
                  {srcCap.learnings.slice(0, 3).map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              )}
            </details>
          )}

          {/* enterprise delta line */}
          {enterprise && ahead && (
            <div className="flex items-center gap-[6px] text-[11.5px] font-semibold text-[var(--blue)]">
              v{cur.version} → v{latest.version} · +{moreTok} more tok/use
              {latest.status === "proposed" ? " · awaiting adoption" : ""}
            </div>
          )}
          {enterprise && !ahead && (
            <div className="flex items-center gap-[6px] text-[11.5px] font-semibold text-[var(--green)]">
              ✓ already on the enterprise-best version
            </div>
          )}

          {/* secondary actions */}
          <div className="flex flex-wrap gap-[6px]">
            <ActionButton variant="secondary" onClick={onVersions}>
              Versions
            </ActionButton>
            <ActionButton variant="secondary" onClick={onGraph}>
              Graph
            </ActionButton>
            <ActionButton
              variant="secondary"
              aria-expanded={pinOpen}
              onClick={() => setPinOpen((o) => !o)}
            >
              Pin
            </ActionButton>
          </div>

          {/* pin row — the copyable `capsule pull` command */}
          {pinOpen && (
            <div className="mono flex items-center gap-[7px] rounded-[7px] border border-dashed border-[var(--line)] bg-[#f6f7f9] px-[9px] py-[6px] text-[11px] font-semibold text-[var(--mut)]">
              {pinCmd}
              <button
                type="button"
                className="ml-auto cursor-pointer font-semibold text-[var(--blue)] transition-colors hover:text-[var(--blue-d)]"
                onClick={onCopy}
              >
                {copied ? "copied ✓" : "copy"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
