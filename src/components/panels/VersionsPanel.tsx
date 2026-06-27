"use client";
// CAPSULE — Versions ("Version History") side panel.
// Every accepted capsule finding mints a new semver version of a skill. This panel
// is the audit trail: pick a skill, browse day-grouped versions (semver chip, the
// newest PUBLISHED version wears the blue "Latest" badge, a pending proposal wears
// "Proposed"), then tick two Compare boxes to drop into a side-by-side word-level
// diff of changelog + guidance. All state lives in useStore; timestamps are derived
// by string slicing only (selectors.fmtTime) — no Date APIs anywhere.
import { Fragment, type ReactNode } from "react";
import { data } from "@/lib/data";
import { fmtTime, fmt } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import type { Skill, SkillVersion } from "@/lib/types";
import { Badge, BTN_ACTION, Pill, SidePanel, VTabs, cn } from "@/components/ui";

// ------------------------------------------------------------------
// Date helpers — pure string slicing, never a Date instance.
// ------------------------------------------------------------------
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;
const TODAY = "2026-06-26";
const YESTERDAY = "2026-06-25";

/** Heading for a YYYY-MM-DD day key. "" => "Earlier". */
function dayLabel(key: string): string {
  if (!key) return "Earlier";
  if (key === TODAY) return "Today";
  if (key === YESTERDAY) return "Yesterday";
  const p = key.split("-");
  return `${MONTHS[(Number(p[1]) || 1) - 1]} ${Number(p[2]) || 0}`;
}

/** The newest PUBLISHED version — a pending proposal is never the "Latest". */
function latestPublished(versions: SkillVersion[]): string {
  for (let i = versions.length - 1; i >= 0; i--) {
    if (versions[i].status !== "proposed") return versions[i].version;
  }
  return versions[versions.length - 1]?.version ?? "";
}

const toks = (v: SkillVersion): string => fmt(Math.abs(v.tokenDeltaPerUse));

// ------------------------------------------------------------------
// Word-level diff — added words highlighted green, removed struck red.
// ------------------------------------------------------------------
type DiffSide = { left: ReactNode; right: ReactNode };

function wordDiff(oldText: string, newText: string): DiffSide {
  const o = oldText.split(/\s+/).filter(Boolean);
  const n = newText.split(/\s+/).filter(Boolean);
  const oSet = new Set(o.map((w) => w.toLowerCase()));
  const nSet = new Set(n.map((w) => w.toLowerCase()));

  const left = o.map((w, i) => (
    <Fragment key={i}>
      {nSet.has(w.toLowerCase()) ? (
        w
      ) : (
        <span className="rounded-[3px] bg-[#fde2e7] px-[1px] text-[#b4233b] line-through">
          {w}
        </span>
      )}
      {i < o.length - 1 ? " " : ""}
    </Fragment>
  ));
  const right = n.map((w, i) => (
    <Fragment key={i}>
      {oSet.has(w.toLowerCase()) ? (
        w
      ) : (
        <span className="rounded-[3px] bg-[#d4f4e0] px-[1px] text-[#0f7a39]">
          {w}
        </span>
      )}
      {i < n.length - 1 ? " " : ""}
    </Fragment>
  ));
  return { left, right };
}

// ------------------------------------------------------------------
// vchip — the mono semver chip shared by rows and the comparison view.
// ------------------------------------------------------------------
function VChip({ version }: { version: string }) {
  return (
    <span className="mono rounded-[7px] bg-[var(--side2)] px-2 py-[3px] text-[11.5px] font-bold text-[var(--ink2)]">
      v{version}
    </span>
  );
}

// ------------------------------------------------------------------
// A single version row.
// ------------------------------------------------------------------
function VersionRow({
  v,
  isLatest,
  checked,
  onToggle,
}: {
  v: SkillVersion;
  isLatest: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "relative mb-[9px] rounded-[11px] border bg-white px-3 py-[11px] transition-[border-color,box-shadow]",
        checked
          ? "border-[#bcd2fb] shadow-[0_0_0_1px_#bcd2fb_inset]"
          : "border-[var(--line)] hover:border-[#d4d8de] hover:shadow-[0_3px_14px_#0000000a]",
      )}
    >
      <div className="flex items-center gap-2">
        <VChip version={v.version} />
        {v.name && <Badge tone="muted">{v.name}</Badge>}
        {isLatest && <Badge tone="latest">Latest</Badge>}
        {v.status === "proposed" && <Badge tone="muted">Proposed</Badge>}
      </div>
      <div className="mono mb-[6px] mt-[7px] text-[11px] font-semibold text-[var(--dim)]">
        {fmtTime(v.publishedAt)}
      </div>
      <div className="text-[12px] leading-[1.45] text-[var(--mut)]">
        {v.learnedFrom ? v.learnedFrom.finding : v.changelog}
      </div>
      {/* meta — demoted to one muted line (bump · adoption · tok/use), no colored pills */}
      <div className="mt-[9px] flex items-center gap-[8px] text-[11px] text-[var(--dim)]">
        <span className="mono uppercase tracking-[.04em]">{v.bump}</span>
        <span>· adopted by {v.adoptedBy} team{v.adoptedBy === 1 ? "" : "s"}</span>
        <span>· {toks(v)} tok/use</span>
        <label className="ml-auto flex cursor-pointer select-none items-center gap-[6px] text-[11.5px] text-[var(--mut)]">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="h-[14px] w-[14px] [accent-color:var(--ss)]"
          />
          Compare
        </label>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Comparison view — prior vs selected, word-level diff of changelog
// and guidance (the learnedFrom finding).
// ------------------------------------------------------------------
function ComparisonView({
  skill,
  older,
  newer,
}: {
  skill: Skill;
  older: SkillVersion;
  newer: SkillVersion;
}) {
  const dChange = wordDiff(older.changelog || "", newer.changelog || "");
  const dGuide = wordDiff(
    older.learnedFrom ? older.learnedFrom.finding : "",
    newer.learnedFrom ? newer.learnedFrom.finding : "",
  );

  return (
    <>
      <div className="mb-3 rounded-[9px] border border-[var(--line)] bg-[#f6f7f9] px-[11px] py-[9px] text-[11.5px] text-[var(--mut)]">
        Comparing <b>v{older.version}</b> &rarr; <b>v{newer.version}</b> for{" "}
        {skill.name}.{" "}
        <span className="rounded-[3px] bg-[#d4f4e0] px-[1px] text-[#0f7a39]">
          Added
        </span>{" "}
        /{" "}
        <span className="rounded-[3px] bg-[#fde2e7] px-[1px] text-[#b4233b] line-through">
          removed
        </span>{" "}
        vs the prior version.
      </div>
      <div className="grid grid-cols-2 gap-[10px]">
        <CompareColumn version={older} tag="prior" changelog={dChange.left} guidance={dGuide.left} />
        <CompareColumn version={newer} tag="selected" newer changelog={dChange.right} guidance={dGuide.right} />
      </div>
    </>
  );
}

function CompareColumn({
  version,
  tag,
  newer,
  changelog,
  guidance,
}: {
  version: SkillVersion;
  tag: string;
  newer?: boolean;
  changelog: ReactNode;
  guidance: ReactNode;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[11px] border p-[11px]",
        newer ? "border-[#cdebd9] bg-[#fbfefc]" : "border-[var(--line)] bg-white",
      )}
    >
      <div className="mb-2 flex items-center gap-[6px]">
        <VChip version={version.version} />
        <span className="mono text-[9px] font-bold uppercase tracking-[.04em] text-[var(--dim)]">
          {tag}
        </span>
      </div>
      <CompareField label="Changelog">{changelog}</CompareField>
      <CompareField label="Guidance">{guidance}</CompareField>
      <CompareField label="Saved">
        {toks(version)} tok/use &middot; {version.adoptedBy} teams
      </CompareField>
    </div>
  );
}

function CompareField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <h5 className="mono mb-[3px] mt-2 text-[9.5px] font-bold uppercase tracking-[.04em] text-[var(--mut)]">
        {label}
      </h5>
      <div className="break-words text-[11.6px] leading-[1.5] text-[var(--ink2)]">
        {children}
      </div>
    </>
  );
}

// ------------------------------------------------------------------
// Header action buttons. The primary "+ Create Version" wears the
// super-saiyan ACTION treatment (fluorescent border + glow on hover);
// the destructive "Exit Comparison" stays a calm rose cancel.
// ------------------------------------------------------------------
function ActButton({
  warn,
  onClick,
  children,
}: {
  warn?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        warn
          ? cn(
              "rounded-[7px] border px-[9px] py-1 text-[11.5px] font-semibold transition-colors",
              "border-[#fdecef] bg-[#fdecef] text-[var(--rose)] hover:bg-[#fbd9e0]",
            )
          : BTN_ACTION
      }
    >
      {children}
    </button>
  );
}

const HISTORY_ICON = (
  <svg width="15" height="15" viewBox="0 0 17 17" fill="none">
    <path
      d="M2.5 8.5a6 6 0 1 0 1.9-4.4M2.4 2v2.4h2.4"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8.5 5.2V8.6l2.3 1.4"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ------------------------------------------------------------------
// VersionsPanel — the exported side panel.
// ------------------------------------------------------------------
export function VersionsPanel() {
  const closePanel = useStore((s) => s.closePanel);
  const versionsSkillId = useStore((s) => s.versionsSkillId);
  const versionsTab = useStore((s) => s.versionsTab);
  const compareIds = useStore((s) => s.compareIds);
  const setVersionsSkill = useStore((s) => s.setVersionsSkill);
  const setVersionsTab = useStore((s) => s.setVersionsTab);
  const toggleCompare = useStore((s) => s.toggleCompare);
  const showToast = useStore((s) => s.showToast);

  const skillId = versionsSkillId ?? data.skills[0].id;
  const skill = data.skills.find((s) => s.id === skillId) ?? data.skills[0];

  // Switching skill or tab resets the comparison selection.
  const clearCompare = () => {
    for (const id of [...compareIds]) toggleCompare(id);
  };
  const pickSkill = (id: string) => {
    clearCompare();
    setVersionsSkill(id);
  };
  const pickTab = (tab: "all" | "named") => {
    clearCompare();
    setVersionsTab(tab);
  };

  // Resolve the two compared versions within the active skill.
  const cmpA = skill.versions.find((v) => v.version === compareIds[0]);
  const cmpB = skill.versions.find((v) => v.version === compareIds[1]);
  const inCompare = compareIds.length === 2 && Boolean(cmpA) && Boolean(cmpB);

  const action = inCompare ? (
    <ActButton warn onClick={clearCompare}>
      Exit Comparison
    </ActButton>
  ) : (
    <ActButton
      onClick={() =>
        showToast(`New named version drafted for ${skill.name}.`)
      }
    >
      + Create Version
    </ActButton>
  );

  const toolbar = (
    <>
      <div className="flex gap-[6px] overflow-x-auto border-b border-[var(--line2)] px-[13px] py-[10px] [scrollbar-width:none]">
        {data.skills.map((s) => (
          <Pill key={s.id} active={s.id === skillId} onClick={() => pickSkill(s.id)}>
            {s.name}
          </Pill>
        ))}
      </div>
      <VTabs
        items={[
          { id: "all", label: "All Versions" },
          { id: "named", label: "Named Versions" },
        ]}
        value={versionsTab}
        onChange={pickTab}
      />
    </>
  );

  return (
    <SidePanel
      title="Version History"
      icon={
        <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-[#eef4ff] text-[var(--blue)]">
          {HISTORY_ICON}
        </span>
      }
      action={action}
      onClose={closePanel}
      toolbar={toolbar}
    >
      {inCompare && cmpA && cmpB ? (
        <CompareBody skill={skill} a={cmpA} b={cmpB} />
      ) : (
        <RowsBody skill={skill} tab={versionsTab} compareIds={compareIds} onToggle={toggleCompare} />
      )}
    </SidePanel>
  );
}

// Older->newer ordering is the index order within skill.versions.
function CompareBody({ skill, a, b }: { skill: Skill; a: SkillVersion; b: SkillVersion }) {
  const ia = skill.versions.indexOf(a);
  const ib = skill.versions.indexOf(b);
  const older = ia < ib ? a : b;
  const newer = ia < ib ? b : a;
  return <ComparisonView skill={skill} older={older} newer={newer} />;
}

function RowsBody({
  skill,
  tab,
  compareIds,
  onToggle,
}: {
  skill: Skill;
  tab: "all" | "named";
  compareIds: string[];
  onToggle: (id: string) => void;
}) {
  const latest = latestPublished(skill.versions);
  const vers = [...skill.versions].reverse(); // newest first
  const shown = tab === "named" ? vers.filter((v) => Boolean(v.name)) : vers;

  if (shown.length === 0) {
    return (
      <div className="py-[18px] text-center text-[12px] text-[var(--dim)]">
        No named versions yet — switch to All Versions.
      </div>
    );
  }

  // Group rows under date headings derived from each version's publishedAt day.
  const order: string[] = [];
  const groups = new Map<string, SkillVersion[]>();
  for (const v of shown) {
    const key = v.publishedAt ? v.publishedAt.slice(0, 10) : "";
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(v);
  }

  return (
    <>
      {order.map((key) => (
        <Fragment key={key}>
          <div className="mono mx-[2px] mb-2 mt-[14px] text-[10.5px] font-bold uppercase tracking-[.06em] text-[var(--dim)] first:mt-0">
            {dayLabel(key)}
          </div>
          {groups.get(key)!.map((v) => (
            <VersionRow
              key={v.version}
              v={v}
              isLatest={v.version === latest}
              checked={compareIds.includes(v.version)}
              onToggle={() => onToggle(v.version)}
            />
          ))}
        </Fragment>
      ))}
    </>
  );
}
