"use client";

// CAPSULE — Knowledge Graph Explorer side panel.
// SidePanel chrome (title + Reset view action + close ✕) wrapping the contained
// ForceGraph and a provenance detail for the currently-selected node. Provenance
// is resolved via selectors.provenanceFor; the rich per-type bodies read the
// canonical dataset directly. Matches capsule/factory.html exactly.

import { useEffect, useMemo, useState } from "react";
import { ActionButton, SidePanel } from "@/components/ui";
import { DocIcon, SparkIcon } from "@/components/icons";
import { ForceGraph, TYPE_LABEL } from "@/components/ForceGraph";
import { useStore } from "@/lib/store";
import { data } from "@/lib/data";
import { latestVersion, provenanceFor } from "@/lib/selectors";
import type { Bump as BumpKind, GraphNode, GraphNodeType } from "@/lib/types";

// ------------------------------------------------------------------
// PLAY walkthrough — the RL story told IN ORDER. Each stage activates one (or,
// for the closing frame, two) node type(s); the cumulative set lights every
// edge whose endpoints are already active, so the chain visibly assembles.
// ------------------------------------------------------------------
type PlayState = "idle" | "playing" | "paused" | "done";

const STAGES: ReadonlyArray<{ types: GraphNodeType[]; caption: string }> = [
  { types: ["requirement"], caption: "Requirements defined" },
  { types: ["workorder"], caption: "Work orders planned" },
  { types: ["agent"], caption: "Agents execute" },
  { types: ["model"], caption: "Sessions captured (models)" },
  { types: ["capsule"], caption: "Capsules distilled" },
  { types: ["skill"], caption: "Skills versioned" },
  { types: ["memory", "mcp"], caption: "Backboard memory · enterprise repo" },
];

const STEP_MS = 900; // dwell per stage
const LEAD_MS = 400; // beat before the first stage activates

function PlayGlyph({ paused }: { paused?: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden className="flex-none">
      {paused ? (
        <g fill="currentColor">
          <rect x="2.5" y="2" width="2.4" height="8" rx="0.6" />
          <rect x="7.1" y="2" width="2.4" height="8" rx="0.6" />
        </g>
      ) : (
        <path d="M3 1.8 10 6l-7 4.2Z" fill="currentColor" />
      )}
    </svg>
  );
}

// skill -> originating requirement (drives the regulator-grade provenance trace).
const SKILL_REQ: Record<string, string> = {
  "skill/payment-idempotency": "REQ-001",
  "skill/iso20022-mapper": "REQ-002",
  "skill/pci-redaction": "REQ-003",
  "skill/reconciliation-ledger": "REQ-002",
  "skill/sca-challenge": "REQ-004",
};

const BUMP_BG: Record<BumpKind, string> = {
  major: "#fdecef",
  minor: "#e9f6fd",
  patch: "#f1e9fe",
};
const BUMP_FG: Record<BumpKind, string> = {
  major: "var(--rose)",
  minor: "#0369a1",
  patch: "var(--violet)",
};

const graphIcon = (
  <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-[#eef4ff] text-[var(--blue)]">
    <svg width="15" height="15" viewBox="0 0 17 17" fill="none">
      <circle cx="3.5" cy="3.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="13" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="5" cy="13.5" r="2.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.5 4.7 11 6.9M11 9.8 6.6 12" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  </span>
);

export function KnowledgeGraphPanel() {
  const closePanel = useStore((s) => s.closePanel);
  const selectNode = useStore((s) => s.selectNode);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const [filter, setFilter] = useState<Partial<Record<GraphNodeType, boolean>>>(
    {},
  );

  // ----- PLAY walkthrough state machine -----
  // playStep === -1 is the opening frame (all deactivated); 0..6 are the stages.
  const [playState, setPlayState] = useState<PlayState>("idle");
  const [playStep, setPlayStep] = useState(-1);

  // Advance one stage per STEP_MS while playing; finish (all active) at the end.
  useEffect(() => {
    if (playState !== "playing") return;
    if (playStep >= STAGES.length - 1) {
      setPlayState("done");
      return;
    }
    const t = setTimeout(
      () => setPlayStep((s) => s + 1),
      playStep < 0 ? LEAD_MS : STEP_MS,
    );
    return () => clearTimeout(t);
  }, [playState, playStep]);

  // Cumulative active set. null when idle/done → normal selection + hover.
  const playActive = useMemo<Set<GraphNodeType> | null>(() => {
    if (playState === "idle" || playState === "done") return null;
    const set = new Set<GraphNodeType>();
    for (let i = 0; i <= playStep; i++)
      STAGES[i]?.types.forEach((tp) => set.add(tp));
    return set; // empty set on the opening frame = all deactivated
  }, [playState, playStep]);

  const startPlay = () => {
    selectNode(null);
    setFilter({});
    setPlayStep(-1);
    setPlayState("playing");
  };
  const pausePlay = () => setPlayState("paused");
  const resumePlay = () => setPlayState("playing");
  const stopPlay = () => {
    setPlayState("idle");
    setPlayStep(-1);
  };

  const toggleFilter = (type: GraphNodeType) =>
    setFilter((f) => ({ ...f, [type]: !f[type] }));

  const reset = () => {
    setFilter({});
    selectNode(null);
    stopPlay();
  };

  const handleClose = () => {
    selectNode(null);
    closePanel();
  };

  const playing = playState === "playing";
  const showStrip = playState !== "idle";
  const stepLabel = playStep < 0 ? 0 : playStep + 1;
  const caption =
    playStep < 0
      ? "All deactivated — starting walkthrough…"
      : (STAGES[playStep]?.caption ?? "");

  return (
    <SidePanel
      title="Knowledge Graph Explorer"
      icon={graphIcon}
      onClose={handleClose}
      className="w-full! min-w-0!"
      action={
        <div className="flex items-center gap-[6px]">
          <ActionButton
            onClick={
              playState === "playing"
                ? pausePlay
                : playState === "paused"
                  ? resumePlay
                  : startPlay
            }
          >
            <PlayGlyph paused={playing} />
            {playState === "playing"
              ? "Pause"
              : playState === "paused"
                ? "Resume"
                : playState === "done"
                  ? "Replay"
                  : "Play"}
          </ActionButton>
          <ActionButton variant="secondary" onClick={reset}>
            Reset view
          </ActionButton>
        </div>
      }
    >
      {showStrip && (
        <div className="mb-[10px] flex items-center gap-[9px] rounded-[10px] border border-[var(--blue-bg)] bg-[var(--blue-bg)] px-[11px] py-[8px]">
          <span className="mono flex-none rounded-[6px] bg-[var(--blue)] px-[6px] py-[2px] text-[10px] font-bold text-white">
            {stepLabel}/{STAGES.length}
          </span>
          <span className="flex-1 text-[12px] font-semibold leading-[1.35] text-[var(--blue-d)]">
            {caption}
          </span>
          <div className="flex flex-none items-center gap-[5px]">
            {playState !== "done" && (
              <ActionButton
                variant="secondary"
                onClick={playing ? pausePlay : resumePlay}
                className="rounded-[6px] px-[8px] py-[3px] text-[11px]"
              >
                {playing ? "Pause" : "Resume"}
              </ActionButton>
            )}
            <ActionButton
              variant="secondary"
              onClick={startPlay}
              className="rounded-[6px] px-[8px] py-[3px] text-[11px]"
            >
              Replay
            </ActionButton>
          </div>
        </div>
      )}
      <ForceGraph
        filter={filter}
        onToggleFilter={toggleFilter}
        playActive={playActive}
      />
      <ProvenanceDetail nodeId={selectedNodeId} />
    </SidePanel>
  );
}

// ------------------------------------------------------------------
// Provenance detail
// ------------------------------------------------------------------
const SUB_CLASS = "mb-[10px] text-[12px] leading-[1.45] text-[var(--mut)]";

function Gt({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono text-[9.5px] font-bold uppercase tracking-[.05em] text-[var(--dim)]">
      {children}
    </div>
  );
}

function ProvenanceDetail({ nodeId }: { nodeId: string | null }) {
  const node = nodeId ? provenanceFor(nodeId).node : undefined;

  return (
    <div className="rounded-[11px] border border-[var(--line)] bg-white p-[13px]">
      {!node ? (
        <div className="flex flex-col items-center gap-[8px] py-8 text-center text-[var(--dim)]">
          <DocIcon size={28} />
          <span className="text-[12px]">Select a node to view details</span>
        </div>
      ) : (
        <>
          <Gt>{TYPE_LABEL[node.type]}</Gt>
          <h4 className="mb-[6px] mt-[3px] text-[14px] font-bold">
            {node.label}
          </h4>
          <p className={SUB_CLASS}>{node.sub}</p>
          <NodeBody node={node} />
        </>
      )}
    </div>
  );
}

function NodeBody({ node }: { node: GraphNode }) {
  switch (node.type) {
    case "skill":
      return <SkillBody refId={node.refId} />;
    case "capsule":
      return <CapsuleBody refId={node.refId} />;
    case "memory":
      return <MemoryBody />;
    case "agent":
      return <AgentBody refId={node.refId} />;
    case "model":
      return <ModelBody refId={node.refId} />;
    case "requirement":
      return <RequirementBody refId={node.refId} />;
    case "workorder":
      return <WorkOrderBody refId={node.refId} />;
    default:
      return null;
  }
}

// ----- skill: "Why vX exists" chain -----
type ChainRow = { color: string; k: string; nm?: string; ds: string };

function SkillBody({ refId }: { refId: string }) {
  const sk = data.skills.find((s) => s.id === refId);
  if (!sk) return null;
  const lv = latestVersion(sk);
  if (!lv) return null;
  const lf = lv.learnedFrom;
  const cap = data.capsules.find((c) => c.id === lf.capsule);

  const reqId = SKILL_REQ[sk.id];
  const rq = reqId ? data.requirements.find((r) => r.id === reqId) : undefined;
  const wos = reqId
    ? data.workOrders.filter((w) => w.requirementId === reqId)
    : [];
  const wo = wos.find((w) => sk.usedByAgents.includes(w.agentId)) ?? wos[0];

  const rows: ChainRow[] = [
    {
      color: "var(--skill)",
      k: "Skill",
      nm: `${sk.name} · v${lv.version}`,
      ds: lv.changelog,
    },
  ];
  if (cap) {
    rows.push({
      color: "var(--cap)",
      k: "Capsule",
      nm: cap.id,
      ds: cap.intent || cap.summary,
    });
    rows.push({
      color: "var(--model)",
      k: "Session",
      nm: `${cap.session} · ${cap.model}`,
      ds: `by ${cap.author}`,
    });
    rows.push({
      color: "var(--green)",
      k: "Finding",
      ds: lf.finding || cap.finding,
    });
  }
  if (wo) {
    rows.push({
      color: "var(--wo)",
      k: "Work order",
      nm: wo.id,
      ds: `${wo.title} · ${wo.status}`,
    });
  }
  if (rq) {
    rows.push({
      color: "var(--req)",
      k: "Requirement",
      nm: rq.id,
      ds: rq.plainEnglish,
    });
  }

  return (
    <>
      <Gt>Why v{lv.version} exists</Gt>
      <ul className="m-0 mt-[6px] list-none p-0">
        {rows.map((r, i) => (
          <ChainItem key={i} row={r} last={i === rows.length - 1} />
        ))}
      </ul>
    </>
  );
}

function ChainItem({ row, last }: { row: ChainRow; last: boolean }) {
  return (
    <li
      className="relative ml-[5px] pl-[18px]"
      style={{
        borderLeft: `1.5px solid ${last ? "transparent" : "var(--line)"}`,
        paddingBottom: last ? 0 : 12,
      }}
    >
      <span
        className="absolute left-[-5px] top-[2px] h-[9px] w-[9px] rounded-full bg-white"
        style={{ border: `2px solid ${row.color}` }}
      />
      <div className="mono text-[9.5px] font-bold uppercase tracking-[.04em] text-[var(--dim)]">
        {row.k}
      </div>
      {row.nm && <div className="text-[12.5px] font-bold">{row.nm}</div>}
      <div className="mt-[2px] text-[11.8px] leading-[1.45] text-[var(--mut)]">
        {row.ds}
      </div>
    </li>
  );
}

// ----- capsule: finding + routedTo + technique coaching -----
function CapsuleBody({ refId }: { refId: string }) {
  const c = data.capsules.find((x) => x.id === refId);
  if (!c) return null;

  return (
    <>
      <Gt>Finding</Gt>
      <p className={`mt-[2px] ${SUB_CLASS}`}>{c.finding}</p>
      <Gt>Routed to</Gt>
      {c.routedTo.map((r, i) => {
        const isAgent = r.entity.startsWith("agent/");
        return (
          <div
            key={i}
            className="flex items-center gap-[7px] py-[7px] text-[12px]"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--line2)" }}
          >
            <span
              className="h-2 w-2 flex-none rounded-[3px]"
              style={{ background: isAgent ? "#16a34a" : "#7c3aed" }}
            />
            <span className="font-semibold">{r.entityName}</span>
            <span
              className="mono ml-auto rounded-[5px] px-[6px] py-[2px] text-[9px] font-bold"
              style={{ background: BUMP_BG[r.proposes], color: BUMP_FG[r.proposes] }}
            >
              {r.proposes} → v{r.proposedVersion}
            </span>
            <span
              className="mono rounded-[5px] px-[6px] py-[2px] text-[9px] font-bold uppercase"
              style={
                r.status === "adopted"
                  ? { background: "var(--green-bg)", color: "var(--green)" }
                  : { background: "var(--amber-bg)", color: "var(--amber)" }
              }
            >
              {r.status}
            </span>
          </div>
        );
      })}
      <div className="mt-[10px] rounded-[10px] border border-[#cdebd9] bg-[#f6fbf7] px-[11px] py-[10px]">
        <div className="mono mb-[5px] flex items-center gap-[5px] text-[9.5px] font-bold uppercase tracking-[.04em] text-[var(--green)]">
          <SparkIcon size={12} /> Technique to learn
        </div>
        <div className="text-[12px] font-semibold leading-[1.5] text-[var(--ink2)]">
          {c.mentalModel}
        </div>
        {c.learnings.length > 0 && (
          <ul className="mt-[7px] list-disc pl-4 text-[11.8px] leading-[1.5] text-[var(--ink2)]">
            {c.learnings.slice(0, 3).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// ----- memory: tenant-assistant note -----
function MemoryBody() {
  const w = data.workspace;
  return (
    <p className={SUB_CLASS}>
      Tenant assistant <span className="mono">{w.tenantAssistantId}</span> on{" "}
      {w.memoryStore} ({w.memoryTier}). Memory follows the entity, not the model —
      every capsule is stored here and read back by any session.
    </p>
  );
}

function AgentBody({ refId }: { refId: string }) {
  const ag = data.agents.find((a) => a.id === refId);
  if (!ag) return null;
  return (
    <>
      <Gt>Uses skills</Gt>
      <p className={SUB_CLASS}>{ag.usesSkills.join(", ")}</p>
      <Gt>Executes</Gt>
      <p className={SUB_CLASS}>{ag.executes.join(", ")}</p>
    </>
  );
}

function ModelBody({ refId }: { refId: string }) {
  const mo = data.models.find((m) => m.id === refId);
  if (!mo) return null;
  return (
    <p className={SUB_CLASS}>
      {mo.name} · {mo.provider} · {mo.contextK}K context. Sessions on this model
      produce capsules that feed the enterprise skills.
    </p>
  );
}

function RequirementBody({ refId }: { refId: string }) {
  const rq = data.requirements.find((r) => r.id === refId);
  if (!rq) return null;
  return <p className={SUB_CLASS}>{rq.plainEnglish}</p>;
}

function WorkOrderBody({ refId }: { refId: string }) {
  const wo = data.workOrders.find((w) => w.id === refId);
  if (!wo) return null;
  return (
    <p className={SUB_CLASS}>
      {wo.title} · {wo.status} · {wo.agentId}
    </p>
  );
}
