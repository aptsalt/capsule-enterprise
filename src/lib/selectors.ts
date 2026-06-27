// CAPSULE — pure selector helpers over the canonical dataset.
// All functions are side-effect free named exports.

import { data } from './data';
import type {
  Capsule,
  Graph,
  GraphLink,
  GraphNode,
  Skill,
  SkillVersion,
} from './types';

// ------------------------------------------------------------------
// fmt — deterministic number formatting (explicit en-US locale) so the
// server prerender and the client hydrate to byte-identical strings
// regardless of the visitor's runtime locale.
// ------------------------------------------------------------------
export const fmt = (n: number): string => n.toLocaleString('en-US');

// Month abbreviations for the human-readable timestamp formatter.
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

// ------------------------------------------------------------------
// Active document section + its use-case tags. The workspace currently
// pins the "Technical Requirements" section; the recommender biases its
// empty-query pick toward that section's context (mirrors the factory's
// sectionTags-driven bestSkillForUseCase).
// ------------------------------------------------------------------
export const ACTIVE_SECTION = 'Technical Requirements';

const SECTION_TAGS: Record<string, string[]> = {
  'Technical Requirements': [
    'auth', 'sca', 'step-up', 'idempotency', 'retries', 'payment',
    'iso', 'redaction', 'pci', 'reconciliation', 'settlement',
  ],
};

// ------------------------------------------------------------------
// capsulesForSkill — every capsule whose findings route to this skill.
// Matches both the routedTo[] targets and the producedVersion prefix.
// ------------------------------------------------------------------
export const capsulesForSkill = (skillId: string): Capsule[] =>
  data.capsules.filter(
    (c) =>
      c.routedTo.some((r) => r.entity === skillId) ||
      c.producedVersion.startsWith(`${skillId}@`),
  );

// ------------------------------------------------------------------
// latestVersion — the highest semver version record of a skill.
// ------------------------------------------------------------------
export const parseSemver = (v: string): [number, number, number] => {
  const parts = v.split('.');
  return [Number(parts[0]) || 0, Number(parts[1]) || 0, Number(parts[2]) || 0];
};

export const compareSemver = (a: string, b: string): number => {
  const [aMaj, aMin, aPat] = parseSemver(a);
  const [bMaj, bMin, bPat] = parseSemver(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
};

export const latestVersion = (skill: Skill): SkillVersion | undefined => {
  if (skill.versions.length === 0) return undefined;
  return skill.versions.reduce((latest, v) =>
    compareSemver(v.version, latest.version) > 0 ? v : latest,
  );
};

// ------------------------------------------------------------------
// Adoption overlay — skillId -> the version the org has opted into this
// session. Lives in the Zustand store; selectors stay pure by taking it
// as an argument and never mutating the canonical dataset.
// ------------------------------------------------------------------
export type AdoptionMap = Record<string, string>;

// ------------------------------------------------------------------
// publishedCurrent — the org's currently-adopted version. An entry in the
// adoption overlay wins (adoption promotes that version to current, even
// if the dataset still marks it 'proposed'); otherwise it resolves the
// published version matching skill.currentVersion, falling back to the
// latest published version.
// ------------------------------------------------------------------
export const publishedCurrent = (
  skill: Skill,
  adopted?: AdoptionMap,
): SkillVersion | undefined => {
  const adoptedVer = adopted?.[skill.id];
  if (adoptedVer) {
    const promoted = skill.versions.find((v) => v.version === adoptedVer);
    if (promoted) return promoted;
  }
  const published = skill.versions.filter((v) => v.status === 'published');
  const exact = published.find((v) => v.version === skill.currentVersion);
  if (exact) return exact;
  if (published.length === 0) return undefined;
  return published.reduce((latest, v) =>
    compareSemver(v.version, latest.version) > 0 ? v : latest,
  );
};

// ------------------------------------------------------------------
// totalSaved — Σ capsule.reuses * capsule.tokensSavedPerReuse.
// ------------------------------------------------------------------
export const totalSaved = (): number =>
  data.capsules.reduce((sum, c) => sum + c.reuses * c.tokensSavedPerReuse, 0);

// ------------------------------------------------------------------
// recommendSkill — use-case / free-text aware recommendation.
// Blends token savings and transfer score; excludes skills whose only
// signal comes from a 'proposed' route. Returns ranked skills.
// ------------------------------------------------------------------
export interface SkillRecommendation {
  skill: Skill;
  score: number;
  tokensSaved: number;
  transfer: number;
  matched: boolean;
}

const TOKEN_NORM = 75000; // total saved, used to normalise token weight

export const recommendSkill = (query: string): SkillRecommendation[] => {
  const q = query.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);

  const scored = data.skills.map((skill): SkillRecommendation => {
    // Capsules that adopted (not merely proposed) into this skill.
    const adoptedCapsules = data.capsules.filter((c) =>
      c.routedTo.some((r) => r.entity === skill.id && r.status === 'adopted'),
    );

    const tokensSaved = adoptedCapsules.reduce(
      (sum, c) => sum + c.reuses * c.tokensSavedPerReuse,
      0,
    );
    const transfer =
      adoptedCapsules.length > 0
        ? adoptedCapsules.reduce((sum, c) => sum + c.transferScore, 0) /
          adoptedCapsules.length
        : 0;

    // Free-text relevance over name, description, findings, and changelogs.
    const haystack = [
      skill.name,
      skill.description,
      skill.id,
      ...adoptedCapsules.map((c) => `${c.finding} ${c.summary} ${c.intent}`),
      ...skill.versions.map((v) => `${v.changelog} ${v.name ?? ''}`),
    ]
      .join(' ')
      .toLowerCase();

    const termHits = terms.filter((t) => haystack.includes(t)).length;
    const matched = terms.length === 0 || termHits > 0;
    const relevance = terms.length === 0 ? 0 : termHits / terms.length;

    // Blend: token savings (40%) + transfer (40%) + free-text relevance (20%).
    const tokenWeight = (tokensSaved / TOKEN_NORM) * 100;
    const blended =
      0.4 * tokenWeight + 0.4 * transfer + 0.2 * relevance * 100;

    // With no query, bias the pick toward the active document section's
    // use-case tags (context-aware ranking, like the factory's sectionTags).
    const sectionTags = SECTION_TAGS[ACTIVE_SECTION] ?? [];
    const sectionBias =
      terms.length === 0
        ? sectionTags.filter((t) => haystack.includes(t)).length * 8
        : 0;

    // Strong boost when the query actually matches this skill.
    const score =
      (matched ? blended + relevance * 50 : blended * 0.25) + sectionBias;

    return { skill, score, tokensSaved, transfer: Math.round(transfer), matched };
  });

  // Prefer skills with a real adopted signal; rank by blended score.
  const ranked = scored
    .filter((r) => r.tokensSaved > 0 || r.transfer > 0)
    .sort((a, b) => b.score - a.score);
  if (ranked.length > 0) return ranked;

  // Guaranteed fallback — the global highest-value published skill, so a
  // recommendation banner is always present (mirrors the factory default).
  const fallback = [...scored].sort((a, b) => b.tokensSaved - a.tokensSaved);
  return fallback.length > 0 ? [fallback[0]] : [];
};

// ------------------------------------------------------------------
// buildGraph — the canonical graph plus deduped capsule->skill 'learns'
// edges derived from each capsule's adopted routes.
// ------------------------------------------------------------------
let graphCache: Graph | null = null;

export const buildGraph = (): Graph => {
  // The canonical dataset is static, so the derived graph can be built once
  // and shared — provenanceFor() and ForceGraph re-read it cheaply.
  if (graphCache) return graphCache;

  const nodes: GraphNode[] = [...data.graph.nodes];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const links: GraphLink[] = [...data.graph.links];

  // Track existing edges to dedupe, plus a kind-agnostic set of connected
  // ordered pairs so a synthesized 'learns' edge never duplicates an existing
  // 'produces' edge between the same capsule and skill.
  const seen = new Set(links.map((l) => `${l.source}->${l.target}:${l.kind}`));
  const connected = new Set(links.map((l) => `${l.source}->${l.target}`));

  for (const capsule of data.capsules) {
    for (const route of capsule.routedTo) {
      if (!route.entity.startsWith('skill/')) continue;
      if (route.status !== 'adopted') continue;
      if (!nodeIds.has(capsule.id) || !nodeIds.has(route.entity)) continue;
      const pair = `${capsule.id}->${route.entity}`;
      // Skip if any edge (e.g. a solid 'produces') already joins this pair.
      if (connected.has(pair)) continue;
      const key = `${pair}:learns`;
      if (seen.has(key)) continue;
      seen.add(key);
      connected.add(pair);
      links.push({ source: capsule.id, target: route.entity, kind: 'learns' });
    }
  }

  graphCache = { nodes, links };
  return graphCache;
};

// ------------------------------------------------------------------
// fmtTime — format an ISO-8601 string WITHOUT any Date APIs.
// Pure string slicing: "2026-05-02T14:21:00Z" -> "May 2, 2:21 PM"
// (month name, 12-hour clock with AM/PM), matching the approved design.
// ------------------------------------------------------------------
export const fmtTime = (iso: string): string => {
  if (!iso || iso.length < 16) return iso;
  const mo = MONTHS[(Number(iso.slice(5, 7)) || 1) - 1];
  const day = Number(iso.slice(8, 10)) || 0;
  const hh = Number(iso.slice(11, 13)) || 0;
  const min = iso.slice(14, 16);
  const ap = hh < 12 ? 'AM' : 'PM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${mo} ${day}, ${h12}:${min} ${ap}`;
};

// ------------------------------------------------------------------
// provenanceFor — the upstream/downstream lineage of any graph node.
// Returns the node plus its incoming and outgoing links and neighbours.
// ------------------------------------------------------------------
export interface Provenance {
  node: GraphNode | undefined;
  incoming: GraphLink[];
  outgoing: GraphLink[];
  upstream: GraphNode[];
  downstream: GraphNode[];
}

export const provenanceFor = (nodeId: string): Provenance => {
  const graph = buildGraph();
  const node = graph.nodes.find((n) => n.id === nodeId);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const incoming = graph.links.filter((l) => l.target === nodeId);
  const outgoing = graph.links.filter((l) => l.source === nodeId);

  const upstream = incoming
    .map((l) => byId.get(l.source))
    .filter((n): n is GraphNode => Boolean(n));
  const downstream = outgoing
    .map((l) => byId.get(l.target))
    .filter((n): n is GraphNode => Boolean(n));

  return { node, incoming, outgoing, upstream, downstream };
};
