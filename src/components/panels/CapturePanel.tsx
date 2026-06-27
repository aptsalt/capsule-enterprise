"use client";

// CAPSULE — CAPTURE panel.
// The real local-capture experience. Reuses the shared SidePanel chrome.
// Flow:
//   1. on open → GET /api/sessions  (lists REAL ~/.claude/projects/*.jsonl sessions)
//   2. user picks a session row
//   3. POST /api/capsule { path } → distills LOCALLY via Ollama (qwen2.5-coder:14b)
//      while we show a "distilling locally · Ollama qwen2.5-coder:14b" state
//   4. render the resulting capsule (intent · decisions · gotchas · score ·
//      "stored in Backboard") and prepend it to the store overlay so the sidebar
//      "Capsules from today" list shows it — without ever mutating data.ts.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  DEFAULT_OLLAMA_MODEL,
  useStore,
  type CapturedCapsule,
} from "@/lib/store";
import { ActionButton, Badge, Card, Chip, SidePanel, cn } from "@/components/ui";
import {
  BrainIcon,
  DocIcon,
  ReloadIcon,
  SparkIcon,
} from "@/components/icons";

// Mirror of capture.ts SessionMeta (the GET /api/sessions row shape).
type SessionMeta = {
  sessionId: string;
  project: string;
  path: string;
  mtime: number;
  sizeKB: number;
};

// Mirror of cerebras.ts EngineHealth (the GET /api/sessions `engine` field).
// Tells the UI which distiller will ACTUALLY run before the first capture, so
// the picker/distilling chips never claim Ollama when it's unreachable.
type EngineInfo = { ollama: boolean; cerebras: boolean; model: string };

// Resolve the engine snapshot into an honest chip label + locality. Before the
// probe returns (info === null) we stay optimistic about the local model — the
// result card later corrects to "● fallback" if the heuristic actually ran.
function engineChip(info: EngineInfo | null): { label: string; local: boolean } {
  const model = info?.model || DEFAULT_OLLAMA_MODEL;
  if (!info || info.ollama) return { label: `Ollama ${model}`, local: true };
  if (info.cerebras) return { label: "Cerebras (cloud boost)", local: false };
  return { label: "local heuristic", local: true };
}

// True when the PRIMARY distill engine was the heuristic backfill (Ollama down
// and no cloud boost) — distinct from an Ollama run that merely backfilled a
// blank field ("ollama:… +heuristic").
function isHeuristicEngine(engine: string): boolean {
  return /heuristic/i.test(engine) && !/ollama:|cerebras:/i.test(engine);
}

// Shapes returned by POST /api/capsule (subset we render).
type ApiDecision = { what: string; why: string; file?: string };
type ApiCapsule = {
  project: string;
  session_id: string;
  generated_at: string;
  title?: string;
  intent: string;
  decisions: ApiDecision[];
  gotchas: string[];
  next_steps: string[];
  stats: { messages: number; tools: number; durationMin: number };
  handoff_score?: { overall: number; dimensions: Record<string, number>; verdict: string };
};
type CapsuleResponse = {
  capsule: ApiCapsule;
  engine: string;
  ms: number;
  score: { overall: number; dimensions: Record<string, number>; verdict: string };
  store: { store: "backboard" | "local"; thread_id?: string };
  error?: string;
};

function shortProject(project: string): string {
  // Project dirs are slug-encoded paths like "C--Users-deepc-relay" — show the tail.
  const seg = project.split(/[-_]/).filter(Boolean);
  return seg.slice(-2).join("-") || project;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

function scoreTone(score: number): "green" | "amber" | "muted" {
  if (score >= 75) return "green";
  if (score >= 55) return "amber";
  return "muted";
}

// Build the store overlay record from the API response.
function toCaptured(r: CapsuleResponse): CapturedCapsule {
  const c = r.capsule;
  const local = /local/i.test(r.engine);
  const model = r.engine.replace(/^ollama:/, "").replace(/\s*\(local\)$/, "");
  const overall = r.score?.overall ?? c.handoff_score?.overall ?? 0;
  const idTail = (c.session_id || Math.random().toString(36).slice(2)).slice(0, 6);
  return {
    id: `CAP-LOCAL-${idTail}`,
    sessionId: c.session_id,
    project: c.project,
    model,
    engine: r.engine,
    local,
    createdAt: c.generated_at,
    // The headline shown in the sidebar — the distilled title, not the raw path/intent.
    finding: c.title?.trim() || c.intent || `Captured session ${idTail}`,
    summary: c.intent,
    transferScore: overall,
    intent: c.intent,
    decisions: c.decisions ?? [],
    gotchas: c.gotchas ?? [],
    nextSteps: c.next_steps ?? [],
    dimensions: r.score?.dimensions ?? c.handoff_score?.dimensions ?? {},
    verdict: r.score?.verdict ?? c.handoff_score?.verdict ?? "",
    storedIn: r.store?.store ?? "local",
    ms: r.ms ?? 0,
    stats: c.stats ?? { messages: 0, tools: 0, durationMin: 0 },
  };
}

const DIM_LABEL: Record<string, string> = {
  intent_clarity: "Intent",
  decision_traceability: "Traceability",
  reasoning_explicitness: "Reasoning",
  gotcha_coverage: "Gotchas",
  next_step_actionability: "Next steps",
  mental_model_transfer: "Mental model",
};

// Agentic gate: a capsule is kept if its overall transfer score clears the
// (user-set) threshold, OR if its novelty clears a fixed high bar — meaning the
// capsule carries a uniquely strong proposition even when its overall handoff is
// middling. Mirrors the framing in the threshold label.
const NOVELTY_BAR = 80;

// A localhost chat session row from GET /api/chats (shape mirrors lib/chats.ts;
// redeclared here to avoid importing the fs-backed server module into the client).
type ChatSessionRow = {
  id: string;
  title: string;
  messages: { role: string; content: string }[];
  updatedAt: string;
  messageCount: number;
};

// NOVELTY (honest stand-in). The /api/capsule response gives us an overall
// transfer `score` + the six per-dimension scores, but no first-class "novelty".
// We derive novelty as the capsule's STRONGEST single dimension — its most
// distinctive signal. A capsule can be ordinary on average yet exceptional on
// one axis (e.g. a rare gotcha or a crisp mental model); that single spike is
// what makes it worth promoting even below the transfer bar. Falls back to the
// overall score when per-dimension data is absent. This is a demo heuristic over
// LOCAL distillation output, not a model-reported novelty metric.
function noveltyOf(c: CapturedCapsule): number {
  const dims = Object.values(c.dimensions);
  if (dims.length === 0) return c.transferScore;
  return Math.max(...dims);
}

// The outcome of an agentic capture: the distilled capsule, its derived
// novelty, and whether the gate kept (promoted) or skipped it.
type AgenticDecision = {
  captured: CapturedCapsule;
  novelty: number;
  kept: boolean;
};

export function CapturePanel() {
  const closePanel = useStore((s) => s.closePanel);
  const addCapsule = useStore((s) => s.addCapsule);
  const setLastEngine = useStore((s) => s.setLastEngine);
  const selectCaptured = useStore((s) => s.selectCaptured);
  const showToast = useStore((s) => s.showToast);
  const capturedCapsules = useStore((s) => s.capturedCapsules);
  const selectedCapturedId = useStore((s) => s.selectedCapturedId);
  const agenticMode = useStore((s) => s.agenticMode);
  const agenticThreshold = useStore((s) => s.agenticThreshold);
  const setAgenticThreshold = useStore((s) => s.setAgenticThreshold);
  const result = capturedCapsules.find((c) => c.id === selectedCapturedId) || null;

  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [engineInfo, setEngineInfo] = useState<EngineInfo | null>(null);
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [distillingPath, setDistillingPath] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  // Localhost chat sessions (the PRIMARY capture source) loaded from ~/.relay/chats.
  const [chatSessions, setChatSessions] = useState<ChatSessionRow[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  // Agentic-mode outcome of the last auto-distill+gate. Held in local state (not
  // the store) because a SKIPPED capsule is intentionally never added to the
  // overlay — we still want to render its decision, so it lives here.
  const [decision, setDecision] = useState<AgenticDecision | null>(null);

  const loadSessions = useCallback(async () => {
    setListing(true);
    setListError(null);
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error(`sessions ${res.status}`);
      const j = (await res.json()) as { sessions: SessionMeta[]; engine?: EngineInfo };
      setSessions(j.sessions || []);
      setEngineInfo(j.engine ?? null);
    } catch (e) {
      setListError(String(e));
    } finally {
      setListing(false);
    }
  }, []);

  const loadChats = useCallback(async () => {
    setLoadingChats(true);
    try {
      const res = await fetch("/api/chats");
      const j = (await res.json()) as { chats: ChatSessionRow[] };
      setChatSessions(j.chats || []);
    } catch {
      setChatSessions([]);
    } finally {
      setLoadingChats(false);
    }
  }, []);

  // Auto-load chat sessions (primary) + Claude Code sessions (secondary) on open.
  useEffect(() => {
    if (!result && sessions.length === 0 && !listing && !listError) {
      void loadSessions();
      void loadChats();
    }
  }, [result, sessions.length, listing, listError, loadSessions, loadChats]);

  // Shared outcome handling for any capsule response (Claude Code session OR the
  // in-app chat thread): apply the agentic gate or just promote it to the overlay.
  const processResponse = useCallback(
    (j: CapsuleResponse) => {
      const captured = toCaptured(j);
      if (agenticMode) {
        // AGENTIC: GATE the freshly-distilled capsule. Keep only when it clears the
        // transfer bar OR carries a unique proposition (novelty ≥ NOVELTY_BAR). A
        // kept capsule is promoted to the overlay (→ "Capsules from today"); a
        // skipped one is dropped, never added.
        const novelty = noveltyOf(captured);
        const kept =
          captured.transferScore >= agenticThreshold || novelty >= NOVELTY_BAR;
        // Record the engine for BOTH outcomes — a skipped capsule is never added,
        // so without this the TopBar pill would never reflect the engine.
        setLastEngine(captured.engine);
        if (kept) addCapsule(captured); // promote to enterprise repo
        setDecision({ captured, novelty, kept });
        showToast(
          kept
            ? `✓ Kept · promoted to enterprise repo (${captured.transferScore} ≥ ${agenticThreshold})`
            : `Skipped · score ${captured.transferScore} < ${agenticThreshold} · no unique proposition`,
        );
        return;
      }
      addCapsule(captured); // prepends to overlay + selects it + records engine
      showToast(
        captured.local
          ? `Distilled on-device · stored in ${captured.storedIn === "backboard" ? "Backboard" : "local store"}`
          : `Capsule stored in ${captured.storedIn === "backboard" ? "Backboard" : "local store"}`,
      );
    },
    [agenticMode, agenticThreshold, addCapsule, setLastEngine, showToast],
  );

  const capture = useCallback(
    async (session: SessionMeta) => {
      setDistillingPath(session.path);
      setCaptureError(null);
      try {
        const res = await fetch("/api/capsule", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: session.path }),
        });
        const j = (await res.json()) as CapsuleResponse;
        if (!res.ok || j.error) throw new Error(j.error || `capsule ${res.status}`);
        processResponse(j);
      } catch (e) {
        setCaptureError(String(e));
      } finally {
        setDistillingPath(null);
      }
    },
    [processResponse],
  );

  // Capture a localhost CHAT SESSION — distill its conversation through the same
  // pipeline and store it (incl. Backboard). `key` drives the per-row distilling state.
  const captureMessages = useCallback(
    async (messages: { role: string; content: string }[], key: string) => {
      if (messages.length === 0) {
        setCaptureError("That session has no messages to capture.");
        return;
      }
      setDistillingPath(key);
      setCaptureError(null);
      try {
        const res = await fetch("/api/capsule", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages }),
        });
        const j = (await res.json()) as CapsuleResponse;
        if (!res.ok || j.error) throw new Error(j.error || `capsule ${res.status}`);
        processResponse(j);
      } catch (e) {
        setCaptureError(String(e));
      } finally {
        setDistillingPath(null);
      }
    },
    [processResponse],
  );

  const distilling = distillingPath !== null;
  // A freshly clicked sidebar capsule (result) that ISN'T the current gate
  // decision's capsule should take over the view even in agentic mode —
  // otherwise selecting a capsule appears to do nothing behind the gate.
  const showSelected = result !== null && result.id !== decision?.captured.id;
  // In agentic mode the gate decision drives the view (a SKIPPED capsule has no
  // store row, so we can't key off `result`) — unless the user explicitly
  // selected a different capsule. Otherwise fall back to the manual view.
  const showResult = agenticMode ? decision !== null || showSelected : result !== null;

  const captureAnother = useCallback(() => {
    setDecision(null);
    setCaptureError(null);
    selectCaptured(null);
  }, [selectCaptured]);

  return (
    <SidePanel
      title="Capsule session"
      onClose={closePanel}
      icon={
        <span className="grid h-6 w-6 place-items-center rounded-[7px] bg-[#eef4ff] text-[var(--blue)]">
          <SparkIcon size={15} />
        </span>
      }
      action={
        showResult ? (
          <ActionButton
            variant="secondary"
            onClick={captureAnother}
            className="px-[9px] py-[5px] text-[11.5px]"
          >
            ＋ Capsule another
          </ActionButton>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        {/* Always-visible mode explainer: shows the CURRENT mode prominently and
            contrasts MANUAL vs AGENTIC, so it's never ambiguous which flow runs. */}
        <ModeHeader agentic={agenticMode} />

        {agenticMode ? (
          distilling ? (
            <Distilling engine={engineInfo} />
          ) : showSelected && result ? (
            <CaptureResult capsule={result} />
          ) : decision ? (
            <AgenticResult decision={decision} threshold={agenticThreshold} />
          ) : (
            <>
              <AgenticBar threshold={agenticThreshold} onThreshold={setAgenticThreshold} />
              <Picker
                sessions={sessions}
                engine={engineInfo}
                listing={listing}
                listError={listError}
                captureError={captureError}
                onReload={loadSessions}
                onPick={capture}
                chatSessions={chatSessions}
                loadingChats={loadingChats}
                onReloadChats={loadChats}
                onPickChat={(s) => captureMessages(s.messages, s.id)}
                distillingKey={distillingPath}
              />
            </>
          )
        ) : result ? (
          <CaptureResult capsule={result} />
        ) : distilling ? (
          <Distilling engine={engineInfo} />
        ) : (
          <Picker
            sessions={sessions}
            engine={engineInfo}
            listing={listing}
            listError={listError}
            captureError={captureError}
            onReload={loadSessions}
            onPick={capture}
            chatSessions={chatSessions}
            loadingChats={loadingChats}
            onReloadChats={loadChats}
            onPickChat={(s) => captureMessages(s.messages, s.id)}
            distillingKey={distillingPath}
          />
        )}
      </div>
    </SidePanel>
  );
}

/* ---------- on-device distilling state ---------------------------------- */
function Distilling({ engine }: { engine: EngineInfo | null }) {
  const chip = engineChip(engine);
  const cloud = !chip.local;
  return (
    <div className="flex flex-col items-center gap-3 px-2 pt-10 text-center">
      <span className="relative grid h-12 w-12 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-[var(--blue)] opacity-20" />
        <span className="grid h-12 w-12 place-items-center rounded-full bg-[#eef4ff] text-[var(--blue)]">
          <BrainIcon size={22} />
        </span>
      </span>
      <div className="text-[13.5px] font-bold text-[var(--ink)]">
        {cloud ? "Distilling…" : "Distilling locally…"}
      </div>
      <Chip tone="default">
        {chip.label} · {cloud ? "cloud" : "on-device"}
      </Chip>
      <p className="max-w-[260px] text-[11.5px] leading-[1.5] text-[var(--mut)]">
        Reading the real session transcript and extracting intent, decisions, and
        gotchas.{cloud ? "" : " No data leaves this machine."}
      </p>
    </div>
  );
}

/* ---------- session picker ---------------------------------------------- */
function Picker({
  sessions,
  engine,
  listing,
  listError,
  captureError,
  onReload,
  onPick,
  chatSessions,
  loadingChats,
  onReloadChats,
  onPickChat,
  distillingKey,
}: {
  sessions: SessionMeta[];
  engine: EngineInfo | null;
  listing: boolean;
  listError: string | null;
  captureError: string | null;
  onReload: () => void;
  onPick: (s: SessionMeta) => void;
  chatSessions: ChatSessionRow[];
  loadingChats: boolean;
  onReloadChats: () => void;
  onPickChat: (s: ChatSessionRow) => void;
  distillingKey: string | null;
}) {
  const chip = engineChip(engine);
  return (
    <div className="flex flex-col gap-2">
      {/* Unified product sessions — chat + prior sessions, distilled on-device. */}
      <div className="flex items-center gap-2 pb-1">
        <span className="text-[12px] font-bold text-[var(--ink2)]">Sessions</span>
        <Chip tone="default">{chip.label} · {chip.local ? "local" : "cloud"}</Chip>
        <button
          type="button"
          onClick={() => {
            onReloadChats();
            onReload();
          }}
          aria-label="Reload sessions"
          className="ml-auto grid h-[26px] w-[26px] place-items-center rounded-[7px] text-[var(--mut)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]"
        >
          <ReloadIcon size={15} />
        </button>
      </div>

      <p className="pb-1 text-[11.5px] leading-[1.5] text-[var(--mut)]">
        Pick a session to capsule — distilled into a Handoff Capsule on-device with
        the local model.
      </p>

      {captureError && (
        <ErrorCard
          title="Capsule didn’t finish"
          hint="Couldn’t reach the local model. Make sure Ollama is running, then try again."
          detail={captureError}
          onRetry={onReloadChats}
          retryLabel="Reload sessions"
        />
      )}

      {(loadingChats || listing) &&
        chatSessions.length === 0 &&
        sessions.length === 0 && (
          <div className="px-1 py-6 text-center text-[12px] text-[var(--mut)]">
            Loading sessions…
          </div>
        )}

      {chatSessions.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onPickChat(s)}
          disabled={distillingKey !== null}
          className={cn(
            "flex w-full items-center gap-[10px] rounded-[10px] border border-[var(--line)] bg-white px-[11px] py-[9px] text-left transition-[border-color,box-shadow]",
            "hover:border-[#d4d8de] hover:shadow-[0_4px_18px_#0000000a]",
          )}
        >
          <span className="grid h-7 w-7 flex-none place-items-center rounded-[8px] bg-[var(--side2)] text-[var(--mut)]">
            <DocIcon size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.6px] font-semibold text-[var(--ink)]">
              {s.title}
            </span>
            <span className="mono block truncate text-[10px] text-[var(--dim)]">
              {s.messageCount} msgs · {relativeTime(Date.parse(s.updatedAt))}
            </span>
          </span>
          <span className="flex-none text-[15px] text-[var(--blue)]">→</span>
        </button>
      ))}

      {sessions.map((s) => (
        <button
          key={s.path}
          type="button"
          onClick={() => onPick(s)}
          disabled={distillingKey !== null}
          className={cn(
            "flex w-full items-center gap-[10px] rounded-[10px] border border-[var(--line)] bg-white px-[11px] py-[9px] text-left transition-[border-color,box-shadow]",
            "hover:border-[#d4d8de] hover:shadow-[0_4px_18px_#0000000a]",
          )}
        >
          <span className="grid h-7 w-7 flex-none place-items-center rounded-[8px] bg-[var(--side2)] text-[var(--mut)]">
            <DocIcon size={15} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.6px] font-semibold text-[var(--ink)]">
              {shortProject(s.project)}
            </span>
            <span className="mono block truncate text-[10px] text-[var(--dim)]">
              {s.sessionId.slice(0, 8)} · {s.sizeKB} KB · {relativeTime(s.mtime)}
            </span>
          </span>
          <span className="flex-none text-[15px] text-[var(--blue)]">→</span>
        </button>
      ))}

      {!loadingChats &&
        !listing &&
        chatSessions.length === 0 &&
        sessions.length === 0 && (
          <div className="rounded-[10px] border border-dashed border-[var(--line)] px-3 py-5 text-center text-[11.5px] leading-[1.5] text-[var(--mut)]">
            No sessions yet — talk to the agent in the composer, then capsule the
            conversation here.
          </div>
        )}
    </div>
  );
}

/* ---------- friendly error card ----------------------------------------- */
// Product-language failure state: a calm headline + next-action hint, a primary
// "Try again" button, and the raw exception tucked behind a collapsible Details.
function ErrorCard({
  title,
  hint,
  detail,
  onRetry,
  retryLabel = "Try again",
}: {
  title: string;
  hint: string;
  detail: string;
  onRetry: () => void;
  retryLabel?: string;
}) {
  return (
    <Card className="border-[#f3c6cf] bg-[#fdf6f7]">
      <div className="text-[12px] font-semibold text-[var(--ink)]">{title}</div>
      <p className="mt-1 text-[11.5px] leading-[1.45] text-[var(--mut)]">{hint}</p>
      <div className="mt-[10px] flex items-center gap-2">
        <ActionButton onClick={onRetry}>{retryLabel}</ActionButton>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer select-none text-[10.5px] font-semibold text-[var(--dim)]">
          Details
        </summary>
        <div className="mono mt-1 break-words text-[10.5px] text-[var(--mut)]">{detail}</div>
      </details>
    </Card>
  );
}

/* ---------- mode explainer (MANUAL vs AGENTIC) -------------------------- */
// Always shown at the top of the panel. Names the CURRENT mode prominently and
// puts both flows side-by-side with the active one lit, so a user can tell at a
// glance whether they're hand-reviewing capsules or letting the gate decide.
function ModeHeader({ agentic }: { agentic: boolean }) {
  return (
    <div className="flex flex-col gap-[9px] rounded-[11px] border border-[var(--line)] bg-[#fbfcfe] p-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[.05em] text-[var(--mut)]">
          Capsule mode
        </span>
        <Badge tone={agentic ? "blue" : "muted"} className="ml-auto inline-flex items-center gap-[4px]">
          {agentic ? (
            <>
              <BrainIcon size={10} /> Agentic · Auto
            </>
          ) : (
            "Manual"
          )}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ModeCard
          label="Manual"
          active={!agentic}
          desc="you pick a session → distill → review the capsule yourself"
        />
        <ModeCard
          label="Agentic"
          active={agentic}
          desc="auto-distill + auto-gate by the threshold; only winners are kept"
        />
      </div>
      <p className="text-[10.5px] leading-[1.5] text-[var(--dim)]">
        Switch with the{" "}
        <b className="font-semibold text-[var(--ink2)]">Agentic</b> toggle in the
        top bar.
      </p>
    </div>
  );
}

// One mode tile — the active mode is lit in the blue accent with a "NOW" badge;
// the other is dimmed so the contrast reads instantly.
function ModeCard({
  label,
  active,
  desc,
}: {
  label: string;
  active: boolean;
  desc: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[9px] border px-[10px] py-[8px] transition-colors",
        active
          ? "border-[#bcd2fb] bg-[var(--activebg)] shadow-[0_0_0_1px_#bcd2fb_inset]"
          : "border-[var(--line)] bg-white opacity-70",
      )}
    >
      <div className="flex items-center gap-[5px]">
        <span
          className={cn(
            "text-[11.5px] font-bold",
            active ? "text-[var(--blue)]" : "text-[var(--mut)]",
          )}
        >
          {label}
        </span>
        {active && (
          <Badge tone="blue" className="px-[5px] py-[1px] text-[8px]">
            NOW
          </Badge>
        )}
      </div>
      <p
        className={cn(
          "mt-[3px] text-[10.5px] leading-[1.45]",
          active ? "text-[var(--ink2)]" : "text-[var(--mut)]",
        )}
      >
        {desc}
      </p>
    </div>
  );
}

/* ---------- agentic threshold control ----------------------------------- */
// Shown above the picker when Agentic mode is ON. Explains the auto-distill +
// gate contract and exposes the keep threshold (slider + number, both write the
// store's agenticThreshold). Novelty's bar is fixed (NOVELTY_BAR).
function AgenticBar({
  threshold,
  onThreshold,
}: {
  threshold: number;
  onThreshold: (n: number) => void;
}) {
  return (
    <Card className="bg-[#fbfcfe]">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 flex-none place-items-center rounded-[7px] bg-[#eef4ff] text-[var(--blue)]">
          <BrainIcon size={14} />
        </span>
        <span className="text-[12.5px] font-bold text-[var(--ink)]">
          Agentic auto-distill
        </span>
        <Badge tone="blue" className="ml-auto">
          ON
        </Badge>
      </div>
      <p className="mt-2 text-[11.5px] leading-[1.5] text-[var(--mut)]">
        Every session is distilled on-device with Ollama, then gated. A capsule is
        kept and promoted to the enterprise repo only if it clears the bar —
        otherwise it’s dropped, never promoted.
      </p>
      <label
        htmlFor="agentic-threshold"
        className="mt-3 block text-[11px] font-semibold text-[var(--ink2)]"
      >
        Keep capsule if transfer score ≥ {threshold}
        <span className="font-normal text-[var(--mut)]">
          {" "}
          (or novelty ≥ {NOVELTY_BAR} — a unique proposition)
        </span>
      </label>
      <div className="mt-2 flex items-center gap-3">
        <input
          id="agentic-threshold"
          type="range"
          min={0}
          max={100}
          value={threshold}
          onChange={(e) => onThreshold(Number(e.target.value))}
          aria-label="Keep threshold (transfer score)"
          className="h-[4px] flex-1 cursor-pointer appearance-none rounded-full bg-[var(--side2)] accent-[var(--blue)]"
        />
        <input
          type="number"
          min={0}
          max={100}
          value={threshold}
          onChange={(e) => onThreshold(Number(e.target.value))}
          aria-label="Keep threshold value"
          className="mono w-[52px] rounded-[7px] border border-[var(--line)] px-[7px] py-[5px] text-[12px] font-bold text-[var(--ink)] outline-none focus:border-[var(--blue)]"
        />
      </div>
    </Card>
  );
}

/* ---------- agentic gate result ----------------------------------------- */
// Renders the gate decision banner first, then the full distilled capsule body
// (so a SKIPPED capsule is still fully inspectable — you can see exactly what
// didn't clear the bar).
function AgenticResult({
  decision,
  threshold,
}: {
  decision: AgenticDecision;
  threshold: number;
}) {
  const { captured, novelty, kept } = decision;
  return (
    <div className="flex flex-col gap-3">
      <GateBanner
        kept={kept}
        score={captured.transferScore}
        novelty={novelty}
        threshold={threshold}
        heuristic={isHeuristicEngine(captured.engine)}
      />
      <CaptureResult capsule={captured} />
    </div>
  );
}

// The visible, explained verdict. Shows WHY a capsule was kept or skipped and
// plots both signals against their bars so the gate is legible at a glance.
function GateBanner({
  kept,
  score,
  novelty,
  threshold,
  heuristic,
}: {
  kept: boolean;
  score: number;
  novelty: number;
  threshold: number;
  heuristic: boolean;
}) {
  const scorePass = score >= threshold;
  const novPass = novelty >= NOVELTY_BAR;
  const reason = kept
    ? scorePass
      ? `transfer score ${score} ≥ ${threshold}`
      : `novelty ${novelty} ≥ ${NOVELTY_BAR} — a unique proposition`
    : `score ${score} < ${threshold} · novelty ${novelty} < ${NOVELTY_BAR} (no unique proposition)`;
  return (
    <Card
      className={
        kept
          ? "border-[#bfe3c8] bg-[var(--green-bg)]"
          : "border-[var(--line)] bg-[var(--side2)]"
      }
    >
      <div className="flex items-center gap-[10px]">
        <span
          className={cn(
            "grid h-7 w-7 flex-none place-items-center rounded-full text-[13px] font-bold text-white",
            kept ? "bg-[var(--green)]" : "bg-[#b3b8c0]",
          )}
        >
          {kept ? "✓" : "–"}
        </span>
        <div className="min-w-0">
          <div className="text-[12.5px] font-bold text-[var(--ink)]">
            {kept ? "Kept · promoted to enterprise repo" : "Skipped · not promoted"}
          </div>
          <div className="text-[11px] leading-[1.4] text-[var(--mut)]">{reason}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-[7px]">
        <GateMeter label="Transfer" value={score} bar={threshold} pass={scorePass} />
        <GateMeter label="Novelty" value={novelty} bar={NOVELTY_BAR} pass={novPass} />
      </div>

      {heuristic && (
        <p className="mono mt-[10px] flex gap-[6px] rounded-[7px] border border-[#f0d9a8] bg-[#fdf8ee] px-[9px] py-[7px] text-[10.5px] leading-[1.5] text-[var(--mut)]">
          <span className="flex-none text-[var(--amber)]">▲</span>
          <span>
            Ollama was unreachable — this capsule was distilled by the local
            heuristic, so the gate ran on heuristic scores (which skew low). Start
            Ollama for a model-grade score before trusting a skip.
          </span>
        </p>
      )}

      <p className="mt-[10px] text-[10.5px] leading-[1.5] text-[var(--dim)]">
        Distilled locally; the gate keeps a capsule when transfer ≥ {threshold} OR
        novelty ≥ {NOVELTY_BAR}. Novelty is the capsule’s strongest single
        dimension — its most distinctive signal, derived from the local score.
      </p>
    </Card>
  );
}

// One signal plotted against its bar: a fill up to `value` and a tick at `bar`.
function GateMeter({
  label,
  value,
  bar,
  pass,
}: {
  label: string;
  value: number;
  bar: number;
  pass: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[54px] flex-none text-[10.5px] text-[var(--mut)]">
        {label}
      </span>
      <span className="relative h-[6px] flex-1 rounded-full bg-white shadow-[0_0_0_1px_var(--line)_inset]">
        <span
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            pass ? "bg-[var(--green)]" : "bg-[var(--blue)]",
          )}
          style={{ width: `${value}%` }}
        />
        <span
          className="absolute top-[-3px] bottom-[-3px] w-[2px] rounded bg-[var(--ink2)]"
          style={{ left: `calc(${bar}% - 1px)` }}
          title={`bar ${bar}`}
        />
      </span>
      <span className="mono w-[46px] flex-none text-right text-[10px] font-bold text-[var(--ink2)]">
        {value} / {bar}
      </span>
    </div>
  );
}

/* ---------- captured-capsule detail ------------------------------------- */
function CaptureResult({ capsule }: { capsule: CapturedCapsule }) {
  const dims = Object.entries(capsule.dimensions);
  return (
    <div className="flex flex-col gap-3">
      {/* engine + store provenance */}
      <div className="flex flex-wrap items-center gap-[6px]">
        <Chip
          tone="default"
          className={
            capsule.local ? "bg-[var(--activebg)] text-[var(--blue)]" : "bg-[var(--side2)] text-[var(--mut)]"
          }
        >
          {capsule.local ? "● on-device" : "● fallback"} · {capsule.model}
        </Chip>
        <Chip tone="fed">stored in {capsule.storedIn === "backboard" ? "Backboard" : "local store"}</Chip>
        {capsule.ms > 0 && (
          <Chip tone="default">{(capsule.ms / 1000).toFixed(1)}s</Chip>
        )}
      </div>

      {/* score */}
      <Card>
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 flex-none place-items-center rounded-[12px] bg-[var(--side2)]">
            <span className="text-[18px] font-extrabold text-[var(--ink)]">
              {capsule.transferScore}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-[var(--ink2)]">
                Handoff score
              </span>
              <Badge tone={scoreTone(capsule.transferScore)}>
                {capsule.transferScore >= 75 ? "strong" : capsule.transferScore >= 55 ? "solid" : "thin"}
              </Badge>
            </div>
            <p className="mt-[2px] text-[11.5px] leading-[1.45] text-[var(--mut)]">
              {capsule.verdict}
            </p>
          </div>
        </div>
        {dims.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-[6px]">
            {dims.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-[78px] flex-none text-[10.5px] text-[var(--mut)]">
                  {DIM_LABEL[k] ?? k}
                </span>
                <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-[var(--side2)]">
                  <span
                    className="block h-full rounded-full bg-[var(--blue)]"
                    style={{ width: `${v}%` }}
                  />
                </span>
                <span className="mono w-[22px] flex-none text-right text-[10px] font-bold text-[var(--ink2)]">
                  {v}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* intent */}
      <Section title="Intent">
        <p className="text-[12.5px] leading-[1.5] text-[var(--ink)]">{capsule.intent}</p>
      </Section>

      {/* decisions */}
      {capsule.decisions.length > 0 && (
        <Section title={`Decisions · ${capsule.decisions.length}`}>
          <div className="flex flex-col gap-2">
            {capsule.decisions.map((d, i) => (
              <div key={i} className="rounded-[9px] border border-[var(--line)] bg-white p-[9px]">
                <div className="text-[12px] font-semibold text-[var(--ink)]">{d.what}</div>
                {d.why && (
                  <div className="mt-[2px] text-[11px] leading-[1.45] text-[var(--mut)]">
                    because {d.why}
                  </div>
                )}
                {d.file && (
                  <div className="mono mt-1 text-[10px] text-[var(--blue)]">{d.file}</div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* gotchas */}
      {capsule.gotchas.length > 0 && (
        <Section title={`Gotchas · ${capsule.gotchas.length}`}>
          <ul className="flex flex-col gap-[6px]">
            {capsule.gotchas.map((g, i) => (
              <li key={i} className="flex gap-2 text-[11.5px] leading-[1.45] text-[var(--ink2)]">
                <span className="flex-none text-[var(--amber)]">▲</span>
                {g}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* next steps */}
      {capsule.nextSteps.length > 0 && (
        <Section title={`Next steps · ${capsule.nextSteps.length}`}>
          <ul className="flex flex-col gap-[6px]">
            {capsule.nextSteps.map((n, i) => (
              <li key={i} className="flex gap-2 text-[11.5px] leading-[1.45] text-[var(--ink2)]">
                <span className="flex-none text-[var(--blue)]">→</span>
                {n}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* stats footer */}
      <div className="flex flex-wrap items-center gap-[6px] border-t border-[var(--line2)] pt-2">
        <Chip tone="default">{capsule.stats.messages} msgs</Chip>
        <Chip tone="default">{capsule.stats.tools} tools</Chip>
        {capsule.stats.durationMin > 0 && (
          <Chip tone="default">{capsule.stats.durationMin} min</Chip>
        )}
        <span className="mono ml-auto text-[10px] text-[var(--dim)]">{capsule.id}</span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="pb-[6px] text-[11px] font-bold uppercase tracking-[.04em] text-[var(--mut)]">
        {title}
      </div>
      {children}
    </div>
  );
}
