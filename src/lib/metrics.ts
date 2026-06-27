// CAPSULE — dashboard roll-up metrics, COMPUTED from the real entities.
// Nothing here is hand-set: computeMetrics(data) derives every field from the
// canonical capsules/skills arrays so the numbers can never drift from the data.
//
// HONESTY LABELS (measured vs derived):
//   - capsules / skillsEvolved / sessionsCaptured ... COUNTED from the arrays (measured).
//   - avgTransfer ........................... mean of capsule.transferScore (transferScore is
//                                             a MEASURED scorer output → mean is measured-derived).
//   - tokensSavedTotal / compounding ........ Σ reuses × tokensSavedPerReuse. The A/B trio
//                                             (creative-franchise / automation / api-rate-limiting)
//                                             has MEASURED per-reuse deltas (real Ollama token
//                                             counts); the rest are DERIVED estimates, and `reuses`
//                                             is DERIVED. So this total is a derived projection
//                                             built from a mix of measured + estimated inputs.
//   - adoptionRate .......................... DERIVED ratio over a real field (see formula below).

import type { Capsule, CompoundingPoint, Metrics, Skill } from './types';

// computeMetrics only needs these two collections; accept a structural slice so
// data.ts can pass its (metrics-less) base object without a circular type.
export interface MetricsInput {
  capsules: Capsule[];
  skills: Skill[];
}

// ------------------------------------------------------------------
// realizedSaved — tokens a capsule has actually saved so far:
//   reuses × tokensSavedPerReuse. A capsule with 0 reuses has saved 0,
//   even if its per-reuse delta is large.
// ------------------------------------------------------------------
const realizedSaved = (c: Capsule): number => c.reuses * c.tokensSavedPerReuse;

// ------------------------------------------------------------------
// isoWeek — ISO-8601 week (Mon-based, Thursday rule) of an ISO instant.
// Pure function of the input string (UTC parts only), so the value is
// identical on the server prerender and the client hydrate.
// ------------------------------------------------------------------
const isoWeek = (iso: string): { year: number; week: number } => {
  const d = new Date(iso);
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  // Shift to the Thursday of the current week (Mon=0 … Sun=6).
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const isoYear = target.getUTCFullYear();
  // First Thursday of the ISO year sits in week 1.
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const week =
    1 +
    Math.round(
      (target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
  return { year: isoYear, week };
};

// ------------------------------------------------------------------
// buildCompounding — cumulative-savings series grouped by the capsules'
// real createdAt week. Each point is the running total of realizedSaved
// for every capsule up to and including that week.
// ------------------------------------------------------------------
const buildCompounding = (capsules: Capsule[]): CompoundingPoint[] => {
  const byWeek = new Map<string, { order: number; sum: number }>();
  for (const c of capsules) {
    const { year, week } = isoWeek(c.createdAt);
    const label = `${year}-W${String(week).padStart(2, '0')}`;
    const order = year * 100 + week;
    const cur = byWeek.get(label) ?? { order, sum: 0 };
    cur.sum += realizedSaved(c);
    byWeek.set(label, cur);
  }

  let cumulative = 0;
  return [...byWeek.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([week, v]): CompoundingPoint => {
      cumulative += v.sum;
      return { week, tokensSaved: cumulative };
    });
};

// ------------------------------------------------------------------
// computeMetrics — derive the entire Metrics roll-up from real entities.
// ------------------------------------------------------------------
export const computeMetrics = (data: MetricsInput): Metrics => {
  const { capsules, skills } = data;

  // Σ over capsules of reuses × tokensSavedPerReuse (realized so far).
  const tokensSavedTotal = capsules.reduce((sum, c) => sum + realizedSaved(c), 0);

  // mean of the real measured transfer scores.
  const avgTransfer =
    capsules.length === 0
      ? 0
      : Math.round(
          capsules.reduce((sum, c) => sum + c.transferScore, 0) / capsules.length,
        );

  // distinct sessions that actually produced a capsule (counted, not assumed).
  // NOTE: this is the captured/distilled count; total sessions merely *ingested*
  // by the refinery is a separate factory-module stat and is not derivable here.
  const sessionsCaptured = new Set(capsules.map((c) => c.session)).size;

  // adoptionRate (DERIVED, labelled formula):
  //   every skill has optedIn === true, so the opt-in ratio is a degenerate 100%
  //   and tells us nothing. Instead we report the share of capsule findings that
  //   have actually been ADOPTED into a skill version — i.e. capsules with at
  //   least one routedTo skill route whose status === 'adopted', over all capsules.
  const adoptedCapsules = capsules.filter((c) =>
    c.routedTo.some(
      (r) => r.entity.startsWith('skill/') && r.status === 'adopted',
    ),
  ).length;
  const adoptionRate =
    capsules.length === 0
      ? 0
      : Math.round((adoptedCapsules / capsules.length) * 100);

  return {
    tokensSavedTotal,
    sessionsCaptured,
    capsules: capsules.length,
    skillsEvolved: skills.length,
    avgTransfer,
    adoptionRate,
    compounding: buildCompounding(capsules),
  };
};
