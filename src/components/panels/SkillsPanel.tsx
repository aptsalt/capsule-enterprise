"use client";

// CAPSULE — the "Skills" side panel, ported 1:1 from factory.html.
// Chrome: SidePanel title + ENTERPRISE switch (context action) + close ✕.
// Body order (top→bottom): use-case recommender input · recommendation banner
// · impact note (highest-value skill + Σ saved + adoption) · compounding
// sparkline · enterprise/project banner · per-skill cards.
// All state is read/written ONLY through useStore.

import { useStore } from "@/lib/store";
import { data } from "@/lib/data";
import {
  recommendSkill,
  publishedCurrent,
  fmt,
  ACTIVE_SECTION,
} from "@/lib/selectors";
import { SidePanel, Switch, cn } from "@/components/ui";
import { SkillCard, GearIcon, skillTotalSaved } from "@/components/SkillCard";

/* ---------- compounding sparkline ---------------------------------------- */
/* Inline SVG over data.metrics.compounding (the `sparklineHtml()` port). */
function Sparkline() {
  const pts = data.metrics.compounding;
  if (pts.length < 2) return null;

  const W = 312;
  const H = 42;
  const pad = 2;
  const max = pts[pts.length - 1].tokensSaved || 1;
  const step = W / (pts.length - 1);
  const safe = (n: number) => (Number.isFinite(n) ? n : 0);

  const coords = pts.map(
    (p, i) =>
      [i * step, H - pad - (p.tokensSaved / max) * (H - pad * 2)] as const,
  );
  const line = coords
    .map((c) => `${safe(c[0]).toFixed(1)},${safe(c[1]).toFixed(1)}`)
    .join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const lastC = coords[coords.length - 1];

  return (
    <div className="mb-[11px] rounded-[11px] border border-[var(--line)] bg-white px-[12px] py-[10px]">
      <div className="mb-[6px] flex items-baseline gap-2">
        <b className="text-[12.5px] text-[var(--ink)]">Compounding</b>
        <span className="text-[11px] text-[var(--mut)]">tokens saved / week</span>
        <span className="mono ml-auto text-[11px] font-bold text-[var(--green)]">
          {fmt(first.tokensSaved)} → {fmt(last.tokensSaved)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
      >
        <polygon points={area} fill="#2b6cf015" />
        <polyline
          points={line}
          fill="none"
          stroke="#2b6cf0"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={safe(lastC[0]).toFixed(1)}
          cy={safe(lastC[1]).toFixed(1)}
          r="2.6"
          fill="#2b6cf0"
        />
      </svg>
      <div className="mono mt-[3px] flex justify-between text-[9px] font-semibold text-[var(--dim)]">
        <span>{first.week.replace("2026-", "")}</span>
        <span>{last.week.replace("2026-", "")}</span>
      </div>
    </div>
  );
}

/* ---------- SkillsPanel --------------------------------------------------- */

export function SkillsPanel() {
  const enterprise = useStore((s) => s.enterprise);
  const toggleEnterprise = useStore((s) => s.toggleEnterprise);
  const recommendQuery = useStore((s) => s.recommendQuery);
  const closePanel = useStore((s) => s.closePanel);
  // Adoption overlay — cards and the recommendation derive their current
  // version from this, so adopting re-renders reactively (no mutation hack).
  const adopted = useStore((s) => s.adopted);

  // Recommendation — driven by the free-text query via selectors.recommendSkill.
  const top = recommendSkill(recommendQuery)[0];
  const recSkill = top?.skill;
  const recVer = recSkill ? publishedCurrent(recSkill, adopted) : undefined;

  // Highest-value skill — max per-skill Σ saved.
  let hvSkill = data.skills[0];
  let hvTot = -1;
  for (const sk of data.skills) {
    const t = skillTotalSaved(sk.id);
    if (t > hvTot) {
      hvTot = t;
      hvSkill = sk;
    }
  }

  return (
    <SidePanel
      // Fill the resizable column instead of the shared 360px default, so the
      // panel body grows fluidly as the rail is dragged wider.
      className="w-full! min-w-0!"
      title="Skills"
      onClose={closePanel}
      icon={
        <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-[#eef4ff] text-[var(--blue)]">
          <GearIcon />
        </span>
      }
      action={
        <div className="mr-1 flex items-center gap-2">
          <span
            className={cn(
              "mono text-[10px] font-bold tracking-[.04em] transition-colors",
              enterprise ? "text-[var(--blue)]" : "text-[var(--dim)]",
            )}
          >
            ENTERPRISE
          </span>
          {enterprise && (
            <span className="mono rounded-[5px] bg-[var(--blue)] px-[5px] py-[2px] text-[8.5px] font-bold uppercase leading-none tracking-[.05em] text-white">
              ON
            </span>
          )}
          <Switch
            checked={enterprise}
            onChange={() => toggleEnterprise()}
            tone="blue"
            aria-label="Toggle enterprise skill set"
          />
        </div>
      }
    >
      {/* recommendation banner */}
      {recSkill && recVer && (
        <div className="mb-[11px] flex items-start gap-[9px] rounded-[11px] border border-[var(--line)] bg-[var(--side2)] px-[12px] py-[10px] text-[12px] leading-[1.45] text-[var(--ink2)]">
          <div className="grid h-6 w-6 flex-none place-items-center rounded-[7px] border border-[#d8e4fd] bg-white text-[var(--blue)]">
            ★
          </div>
          <div>
            For{" "}
            {recommendQuery.trim() ? (
              <>“{recommendQuery.trim()}”</>
            ) : (
              <b className="font-bold text-[var(--blue)]">{ACTIVE_SECTION}</b>
            )}{" "}
            →{" "}
            <span className="mono text-[11px] font-bold text-[var(--blue)]">
              {recSkill.id}@{recVer.version}
            </span>{" "}
            ·{" "}
            <b className="font-bold text-[var(--blue)]">
              {fmt(Math.abs(recVer.tokenDeltaPerUse))} tok/use
            </b>{" "}
            · <b className="font-bold text-[var(--blue)]">+{recVer.scoreDelta} transfer</b>.
          </div>
        </div>
      )}

      {/* impact note */}
      <div className="mx-[2px] mb-[12px] text-[11.5px] leading-[1.45] text-[var(--mut)]">
        Top skill <b className="text-[var(--ink2)]">{hvSkill.name}</b> · Σ{" "}
        {fmt(hvTot)} saved. {fmt(data.metrics.tokensSavedTotal)} total across{" "}
        {data.metrics.capsules} capsules → {data.skills.length} skills ·{" "}
        <b className="text-[var(--ink2)]">{data.metrics.adoptionRate}%</b> adopted ·{" "}
        <b className="text-[var(--ink2)]">{data.metrics.avgTransfer}</b> avg transfer.
      </div>

      {/* compounding sparkline */}
      <Sparkline />

      {/* enterprise / project banner */}
      <div
        className={cn(
          "mb-[12px] flex items-center gap-[10px] rounded-[10px] border px-[12px] py-[9px] text-[12px] leading-[1.4]",
          enterprise
            ? "border-[#cfe0fd] bg-[var(--activebg)] text-[var(--blue-d)]"
            : "border-[var(--line)] bg-[#f5f7fa] text-[var(--mut)]",
        )}
      >
        <span>
          {enterprise ? (
            <>
              <b className="font-bold">Enterprise skill set</b> — most-updated,
              capsule-maxxed versions. Adopt by token cost &amp; use-case.
            </>
          ) : (
            <>
              <b className="font-bold">This project’s active skills</b> — versions
              pinned in CAPSULE. Flip ENTERPRISE for the best.
            </>
          )}
        </span>
        <span
          className={cn(
            "mono ml-auto flex-none rounded-[6px] px-[8px] py-[3px] text-[9.5px] font-bold",
            enterprise
              ? "bg-[var(--blue)] text-white"
              : "bg-[var(--side2)] text-[var(--mut)]",
          )}
        >
          {enterprise ? "ENTERPRISE · BEST" : "PROJECT · PINNED"}
        </span>
      </div>

      {/* per-skill cards — fluid: a single stack until the rail is dragged
          wide enough (container query), then a two-up responsive grid. */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-[11px] @xl:grid-cols-2">
          {data.skills.map((sk) => (
            <SkillCard
              key={sk.id}
              skill={sk}
              enterprise={enterprise}
              adopted={adopted}
            />
          ))}
        </div>
      </div>
    </SidePanel>
  );
}
