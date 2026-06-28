"use client";

// CAPSULE — contained force-directed Knowledge Graph.
// The vanilla simulation from capsule/factory.html ported 1:1 into React:
// pairwise repulsion + link springs + center gravity + velocity damping, with
// NaN guards, clamped velocities, a pinned Backboard hub, and a kinetic-energy
// settle that stops the loop. The graph is built via selectors.buildGraph();
// clicking a node writes to the store via selectNode. The legend doubles as a
// set of per-type filters. All visual state (positions, dim/hot highlight,
// hide) is applied imperatively on stored element refs so the SVG children stay
// static — that keeps refs stable and never restarts the simulation.

import { useEffect, useMemo, useRef, useState } from "react";
import { buildGraph } from "@/lib/selectors";
import { useStore } from "@/lib/store";
import type { GraphNode, GraphNodeType } from "@/lib/types";
import { cn } from "@/components/ui";

// ------------------------------------------------------------------
// Per-type palette, labels and radii (radii kept small to fit a 360px column).
// ------------------------------------------------------------------
export const TYPE_COLOR: Record<GraphNodeType, string> = {
  capsule: "#0ea5e9",
  skill: "#7c3aed",
  agent: "#16a34a",
  workorder: "#d97706",
  requirement: "#e11d48",
  model: "#2563eb",
  mcp: "#0d9488",
  memory: "#4f46e5",
};

export const TYPE_LABEL: Record<GraphNodeType, string> = {
  capsule: "Capsule",
  skill: "Skill",
  agent: "Agent",
  workorder: "Work order",
  requirement: "Requirement",
  model: "Model / session",
  mcp: "MCP",
  memory: "Backboard memory",
};

const RADIUS: Record<GraphNodeType, number> = {
  memory: 13,
  skill: 10,
  agent: 9,
  capsule: 9,
  requirement: 8,
  workorder: 7,
  model: 8,
  mcp: 7,
};

// BASE_W is the design width the layout was tuned at; the live width comes from
// a ResizeObserver so the SVG + simulation FILL the panel as it is dragged wider
// (store.panelWidth up to 680). Horizontal gravity is scaled by BASE_W/width so
// the cluster spreads to use the extra room instead of staying a narrow column.
const BASE_W = 332;
const H = 330;
const HUB_ID = "mem/backboard";

type SimNode = GraphNode & { x: number; y: number; vx: number; vy: number };

export type ForceGraphProps = {
  /** Type-keyed map of disabled (hidden) node types. */
  filter: Partial<Record<GraphNodeType, boolean>>;
  /** Toggle a type via the legend. */
  onToggleFilter: (type: GraphNodeType) => void;
  /**
   * PLAY walkthrough activation. When non-null, only nodes whose type is in the
   * set are "active" (full colour); every other node/edge is desaturated +
   * dimmed. An empty set = all deactivated (the walkthrough's opening frame).
   * null = not playing → normal selection/hover interaction.
   */
  playActive?: Set<GraphNodeType> | null;
};

export function ForceGraph({
  filter,
  onToggleFilter,
  playActive = null,
}: ForceGraphProps) {
  const selectNode = useStore((s) => s.selectNode);
  const selectedNodeId = useStore((s) => s.selectedNodeId);

  // Build the simulation model once. selectors.buildGraph() already dedupes
  // the synthesized capsule->skill 'learns' edges and only links real nodes.
  const model = useMemo(() => {
    const graph = buildGraph();
    const nodes: SimNode[] = graph.nodes.map((n) => ({
      ...n,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
    }));
    const idx: Record<string, SimNode> = {};
    nodes.forEach((n) => {
      idx[n.id] = n;
    });
    const links = graph.links.filter((l) => idx[l.source] && idx[l.target]);
    return { nodes, links, idx };
  }, []);

  // Undirected adjacency for the click-to-highlight neighbourhood.
  const adj = useMemo(() => {
    const a: Record<string, Record<string, boolean>> = {};
    model.nodes.forEach((n) => {
      a[n.id] = {};
    });
    model.links.forEach((l) => {
      a[l.source][l.target] = true;
      a[l.target][l.source] = true;
    });
    return a;
  }, [model]);

  // Distinct types in first-seen order — the legend only shows what is present.
  const presentTypes = useMemo(() => {
    const seen = new Set<GraphNodeType>();
    const order: GraphNodeType[] = [];
    model.nodes.forEach((n) => {
      if (!seen.has(n.type)) {
        seen.add(n.type);
        order.push(n.type);
      }
    });
    return order;
  }, [model]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Array<SVGGElement | null>>([]);
  const linkRefs = useRef<Array<SVGLineElement | null>>([]);
  const rafRef = useRef<number | null>(null);
  // Live measured width of the graph surface (drives viewBox + simulation).
  const [width, setWidth] = useState(BASE_W);
  const widthRef = useRef(BASE_W);
  const prevWidthRef = useRef(BASE_W);
  // Re-arms the settle loop after an external nudge (e.g. a width change) so the
  // sim re-centres without a full position reset. Set inside the sim effect.
  const kickRef = useRef<(() => void) | null>(null);

  // Measure the surface; fill the panel width as the side rail is dragged.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.max(300, Math.round(entries[0].contentRect.width));
      if (Math.abs(w - widthRef.current) < 1) return;
      widthRef.current = w;
      setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Stable ref setters (memoized on the stable model) so selection/filter
  // re-renders never re-invoke them and the captured DOM nodes stay put.
  const nodeRefSetters = useMemo(
    () =>
      model.nodes.map((_, i) => (el: SVGGElement | null) => {
        nodeRefs.current[i] = el;
      }),
    [model],
  );
  const linkRefSetters = useMemo(
    () =>
      model.links.map((_, i) => (el: SVGLineElement | null) => {
        linkRefs.current[i] = el;
      }),
    [model],
  );

  // ----- the force simulation -----
  useEffect(() => {
    const { nodes, links, idx } = model;
    const hub = idx[HUB_ID];
    const w0 = widthRef.current;

    // Seed positions on a ring (x spread scales with width); pin the hub centre.
    nodes.forEach((n, i) => {
      const a = (i / nodes.length) * Math.PI * 2;
      n.x = w0 / 2 + Math.cos(a) * (w0 * 0.26);
      n.y = H / 2 + Math.sin(a) * 82;
      n.vx = 0;
      n.vy = 0;
    });
    if (hub) {
      hub.x = w0 / 2;
      hub.y = H / 2;
    }

    let ticks = 0;

    const tick = () => {
      ticks++;
      let ke = 0;
      // Read the live width every frame; weaken horizontal gravity as the panel
      // widens so the graph spreads to fill instead of clustering in a column.
      const W = widthRef.current;
      const gx = 0.0025 * (BASE_W / W);

      // Pairwise repulsion + centre gravity.
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) d2 = 0.01;
          const d = Math.sqrt(d2);
          const f = 1400 / d2;
          const ux = dx / d;
          const uy = dy / d;
          a.vx += ux * f;
          a.vy += uy * f;
          b.vx -= ux * f;
          b.vy -= uy * f;
        }
        a.vx += (W / 2 - a.x) * gx;
        a.vy += (H / 2 - a.y) * 0.0025;
      }

      // Link springs (longer rest length for the dashed 'learns' edges).
      for (const l of links) {
        const a = idx[l.source];
        const b = idx[l.target];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.01) d = 0.01;
        const rest = l.kind === "learns" ? 64 : 52;
        const f = (d - rest) * 0.02;
        const ux = dx / d;
        const uy = dy / d;
        a.vx += ux * f;
        a.vy += uy * f;
        b.vx -= ux * f;
        b.vy -= uy * f;
      }

      // Integrate: damp, NaN-guard, clamp velocity then position. Hub stays put.
      for (const n of nodes) {
        if (n === hub) {
          n.x = W / 2;
          n.y = H / 2;
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        n.vx *= 0.85;
        n.vy *= 0.85;
        if (!isFinite(n.vx)) n.vx = 0;
        if (!isFinite(n.vy)) n.vy = 0;
        n.vx = Math.max(-7, Math.min(7, n.vx));
        n.vy = Math.max(-7, Math.min(7, n.vy));
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(16, Math.min(W - 16, n.x));
        n.y = Math.max(14, Math.min(H - 16, n.y));
        if (!isFinite(n.x)) n.x = W / 2;
        if (!isFinite(n.y)) n.y = H / 2;
        ke += n.vx * n.vx + n.vy * n.vy;
      }

      // Paint positions imperatively (no React re-render per frame).
      for (let i = 0; i < nodes.length; i++) {
        const g = nodeRefs.current[i];
        if (g)
          g.setAttribute(
            "transform",
            `translate(${nodes[i].x.toFixed(1)},${nodes[i].y.toFixed(1)})`,
          );
      }
      for (let i = 0; i < links.length; i++) {
        const e = linkRefs.current[i];
        const a = idx[links[i].source];
        const b = idx[links[i].target];
        if (e && a && b) {
          e.setAttribute("x1", a.x.toFixed(1));
          e.setAttribute("y1", a.y.toFixed(1));
          e.setAttribute("x2", b.x.toFixed(1));
          e.setAttribute("y2", b.y.toFixed(1));
        }
      }

      // Settle by kinetic energy after a warm-up, then stop the loop.
      if (ticks < 600 && (ticks < 40 || ke > 0.04)) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    // Re-arm the warm-up + resume the loop when something nudges the layout
    // (a width change recenters positions, then asks the sim to settle again).
    kickRef.current = () => {
      ticks = Math.min(ticks, 30);
      if (rafRef.current == null) tick();
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    tick();

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      kickRef.current = null;
    };
  }, [model]);

  // ----- re-layout on width change: recentre, then re-settle (no full reset) --
  useEffect(() => {
    const { nodes, idx } = model;
    const prev = prevWidthRef.current;
    if (width === prev) return;
    const dx = (width - prev) / 2;
    const hub = idx[HUB_ID];
    for (const n of nodes) {
      if (n === hub) continue;
      n.x = Math.max(16, Math.min(width - 16, n.x + dx));
    }
    if (hub) hub.x = width / 2;
    prevWidthRef.current = width;
    kickRef.current?.();
  }, [width, model]);

  // ----- unified visual state: type filter + PLAY activation + selection ------
  // One effect owns every imperative style write (display / opacity / filter /
  // stroke). Styles are set imperatively (the <g>/<line> carry no `style` prop)
  // so they survive width re-renders. Priority: filter hides → play dims by
  // stage → otherwise selection dims non-neighbours.
  useEffect(() => {
    const sel = selectedNodeId;
    model.nodes.forEach((n, i) => {
      const g = nodeRefs.current[i];
      if (!g) return;
      if (filter[n.type]) {
        g.style.display = "none";
        return;
      }
      g.style.display = "";
      if (playActive) {
        const active = playActive.has(n.type);
        g.style.opacity = active ? "1" : "0.12";
        g.style.filter = active ? "" : "grayscale(1)";
        return;
      }
      g.style.filter = "";
      const on = !sel || n.id === sel || adj[sel]?.[n.id];
      g.style.opacity = sel && !on ? "0.18" : "1";
    });
    model.links.forEach((l, i) => {
      const e = linkRefs.current[i];
      if (!e) return;
      const sType = model.idx[l.source]?.type;
      const tType = model.idx[l.target]?.type;
      if ((sType && filter[sType]) || (tType && filter[tType])) {
        e.style.display = "none";
        return;
      }
      e.style.display = "";
      if (playActive) {
        const active =
          sType !== undefined &&
          tType !== undefined &&
          playActive.has(sType) &&
          playActive.has(tType);
        e.style.opacity = active ? "1" : "0.07";
        e.style.stroke = "";
        e.style.strokeWidth = "";
        return;
      }
      e.style.opacity = "1";
      const hot = sel && (l.source === sel || l.target === sel);
      e.style.stroke = hot ? "#2b6cf0" : "";
      e.style.strokeWidth = hot ? "1.8" : "";
    });
  }, [selectedNodeId, model, adj, filter, playActive]);

  return (
    <>
      {/* legend / type filters — crisp active vs inactive colour states */}
      <div className="flex flex-wrap gap-[5px] pb-[10px]">
        {presentTypes.map((t) => {
          const off = !!filter[t];
          return (
            <button
              key={t}
              type="button"
              aria-pressed={!off}
              onClick={() => onToggleFilter(t)}
              className={cn(
                "mono flex cursor-pointer select-none items-center gap-[5px] rounded-full border px-2 py-[3px] text-[10px] font-semibold transition-colors",
                off
                  ? "border-[var(--line)] text-[var(--dim)] line-through opacity-60"
                  : "border-[var(--line2)] bg-[var(--side2)] text-[var(--ink2)] hover:bg-[var(--hover)]",
              )}
            >
              <i
                className="h-2 w-2 rounded-[3px] transition-all"
                style={{
                  background: TYPE_COLOR[t],
                  opacity: off ? 0.3 : 1,
                  filter: off ? "grayscale(1)" : "none",
                }}
              />
              {TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>

      {/* contained graph surface — fills the panel width (responsive viewBox) */}
      <div
        ref={surfaceRef}
        className="relative mb-3 h-[330px] w-full overflow-hidden rounded-[12px] border border-[var(--line)]"
        style={{
          background: "radial-gradient(#eef0f3 1px,transparent 1px)",
          backgroundSize: "18px 18px",
          backgroundColor: "#fff",
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-full w-full"
          onClick={() => selectNode(null)}
        >
          {model.links.map((l, i) => (
            <line
              key={`link-${i}`}
              ref={linkRefSetters[i]}
              stroke={l.kind === "learns" ? "#a78bfa" : "#c8ccd2"}
              strokeWidth={l.kind === "learns" ? 1.2 : 1}
              strokeDasharray={l.kind === "learns" ? "4 3" : undefined}
            />
          ))}
          {model.nodes.map((n, i) => {
            const r = RADIUS[n.type];
            const selected = selectedNodeId === n.id;
            return (
              <g
                key={n.id}
                ref={nodeRefSetters[i]}
                className="group cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  selectNode(n.id);
                }}
              >
                {/* hover halo — brighter type-coloured ring on pointer-over */}
                <circle
                  r={r + 5}
                  fill="none"
                  stroke={TYPE_COLOR[n.type]}
                  strokeWidth={2}
                  className="pointer-events-none opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                />
                {/* selected — strong blue ring */}
                {selected && (
                  <circle
                    r={r + 5}
                    fill="none"
                    stroke="#2b6cf0"
                    strokeWidth={2.4}
                    className="pointer-events-none"
                  />
                )}
                <circle
                  r={r}
                  fill={TYPE_COLOR[n.type]}
                  stroke="#fff"
                  strokeWidth={1.6}
                />
                <text
                  textAnchor="middle"
                  dy={r + 9}
                  style={{
                    font: '600 8px "Inter",sans-serif',
                    fill: "#3c4149",
                    pointerEvents: "none",
                  }}
                >
                  {n.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend + provenance hint — a compact, unobtrusive overlay pinned to
            the bottom-left. pointer-events-none so it never intercepts a node
            click. The hint fades out once the user selects their first node. */}
        <div className="pointer-events-none absolute bottom-[8px] left-[8px] max-w-[62%] rounded-[9px] border border-[var(--line)] bg-white/85 px-[8px] py-[6px] backdrop-blur-[2px]">
          <div className="grid grid-cols-2 gap-x-[10px] gap-y-[3px]">
            {presentTypes.map((t) => (
              <span
                key={t}
                className="mono flex items-center gap-[5px] text-[8.5px] font-semibold text-[var(--ink2)]"
              >
                <i
                  className="h-[7px] w-[7px] flex-none rounded-full"
                  style={{ background: TYPE_COLOR[t] }}
                />
                {TYPE_LABEL[t]}
              </span>
            ))}
          </div>
          <div
            className={cn(
              "mt-[5px] border-t border-[var(--line2)] pt-[4px] text-[8.5px] italic leading-[1.3] text-[var(--dim)] transition-opacity duration-300",
              selectedNodeId ? "opacity-0" : "opacity-100",
            )}
          >
            Click any node for its provenance trace.
          </div>
        </div>
      </div>
    </>
  );
}
