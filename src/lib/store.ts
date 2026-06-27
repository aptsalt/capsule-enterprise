// CAPSULE — the single Zustand coordination store.
// This is the coordination contract: every component reads and writes
// UI state ONLY through useStore. page.tsx renders the grid and the open
// panel based on openPanel. The store owns ALL local/session state — the
// canonical `data` module stays immutable; adoption is modelled here as an
// overlay (skillId -> adopted version) rather than mutating the dataset.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { data } from './data';
import { latestVersion, type AdoptionMap } from './selectors';

export type PanelId = 'graph' | 'skills' | 'versions' | 'ab' | 'capture' | 'inherit' | null;
export type VersionsTab = 'all' | 'named';

// The big-bets document surface can be live-edited, frozen for review, or
// archived. The editor chrome (toolbar, contentEditable) keys off this.
export type DocStatus = 'editing' | 'read-only' | 'inactive';

// Resizable side-panel rail bounds (px). Clamp every write so a stray drag
// can never collapse the canvas or push the panel off-screen.
export const PANEL_MIN = 360;
export const PANEL_MAX = 680;

// Agentic auto-adoption threshold bounds (transferScore %). At/above the
// threshold a routed finding can be adopted without human sign-off.
export const AGENTIC_MIN = 0;
export const AGENTIC_MAX = 100;

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(n)));

// The canonical engine label for the LOCAL distiller. Mirrors the label
// cerebras.ts stamps on a successful Ollama run ("ollama:<model> (local)").
// The TopBar pill falls back to this before the first real capture.
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5-coder:14b';
export const DEFAULT_ENGINE = `ollama:${DEFAULT_OLLAMA_MODEL} (local)`;

// CapturedCapsule — the client-side projection of a REAL capture (POST /api/capsule).
// Kept as a store OVERLAY so the sidebar can show today's freshly-distilled
// capsules without ever mutating the immutable `data` module.
export interface CapturedCapsule {
  id: string; // CAP-LOCAL-xxxx (client id; the real session id lives in `sessionId`)
  sessionId: string;
  project: string;
  model: string; // short engine model, e.g. "qwen2.5-coder:14b" or "heuristic"
  engine: string; // full engine label, e.g. "ollama:qwen2.5-coder:14b (local)"
  local: boolean; // true when distillation ran on-device (Ollama)
  createdAt: string; // ISO — sorts to the top of "Capsules from today"
  finding: string; // headline insight (the capsule's intent)
  summary: string;
  transferScore: number; // handoff_score.overall
  intent: string;
  decisions: { what: string; why: string; file?: string }[];
  gotchas: string[];
  nextSteps: string[];
  dimensions: Record<string, number>;
  verdict: string;
  storedIn: 'backboard' | 'local';
  ms: number;
  stats: { messages: number; tools: number; durationMin: number };
}

// A single turn in the agent chat thread. Streamed assistant replies grow the
// last message in place via appendChat.
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  // Enterprise skills the user attached to this turn (chips), kept for replay.
  skills?: string[];
}

interface StoreState {
  // ---- state ----
  openPanel: PanelId;
  activeDocId: string;
  // Section selected inside the active doc's tree (null = doc-level view).
  activeSectionId: string | null;
  // Edit mode of the active doc — drives the editor chrome.
  docStatus: DocStatus;
  // Width of the resizable side panel rail, clamped to [PANEL_MIN, PANEL_MAX].
  panelWidth: number;
  // When on, high-transfer findings auto-adopt without human sign-off.
  agenticMode: boolean;
  // Transfer-score % gate for agentic auto-adoption, clamped to [0, 100].
  agenticThreshold: number;
  selectedSkillId: string | null;
  selectedCapsuleId: string | null;
  selectedNodeId: string | null;
  enterprise: boolean;
  capsuleOn: boolean;
  compareIds: string[];
  recommendQuery: string;
  versionsSkillId: string | null;
  versionsTab: VersionsTab;
  adopted: AdoptionMap;
  toast: string | null;
  // ---- real local-capture overlay ----
  capturedCapsules: CapturedCapsule[]; // newest first; overlay on top of data.capsules
  selectedCapturedId: string | null; // a captured row is open in the Capture panel
  lastEngine: string | null; // engine label of the most recent real capture
  // ---- agent chat ----
  chat: ChatMessage[]; // the live conversation thread (empty = show demo cards)
  chatBusy: boolean; // a generation is in flight (disables send, shows spinner)

  // ---- actions ----
  setActiveDoc: (docId: string) => void;
  setActiveSection: (sectionId: string | null) => void;
  setDocStatus: (status: DocStatus) => void;
  setPanelWidth: (width: number) => void;
  toggleAgentic: () => void;
  setAgenticThreshold: (threshold: number) => void;
  openPanelFor: (panel: Exclude<PanelId, null>) => void;
  closePanel: () => void;
  selectSkill: (skillId: string | null) => void;
  selectCapsule: (capsuleId: string | null) => void;
  selectNode: (nodeId: string | null) => void;
  toggleEnterprise: () => void;
  toggleCapsule: () => void;
  toggleCompare: (id: string) => void;
  setRecommendQuery: (query: string) => void;
  setVersionsSkill: (skillId: string | null) => void;
  setVersionsTab: (tab: VersionsTab) => void;
  adoptLatest: (skillId: string) => void;
  showToast: (message: string) => void;
  dismissToast: () => void;
  // Prepend a freshly-distilled capsule to the overlay and record its engine.
  addCapsule: (capsule: CapturedCapsule) => void;
  // Record the engine of the most recent distill INDEPENDENT of overlay
  // membership — so the TopBar pill reflects the engine even on agentic SKIPs,
  // where the capsule is intentionally never added.
  setLastEngine: (engine: string) => void;
  // Open a captured capsule's detail in the Capture panel (null = picker view).
  selectCaptured: (id: string | null) => void;
  // Append a whole message (user turn, or the empty assistant turn to stream into).
  pushChat: (message: ChatMessage) => void;
  // Grow the last assistant message in place as stream chunks arrive.
  appendChat: (chunk: string) => void;
  setChatBusy: (busy: boolean) => void;
  clearChat: () => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
  // ---- initial state ----
  openPanel: null,
  activeDocId: 'Technical Requirements',
  activeSectionId: null,
  docStatus: 'editing',
  panelWidth: 360,
  agenticMode: false,
  agenticThreshold: 50,
  selectedSkillId: null,
  selectedCapsuleId: null,
  selectedNodeId: null,
  enterprise: false,
  capsuleOn: true,
  compareIds: [],
  recommendQuery: '',
  versionsSkillId: null,
  versionsTab: 'all',
  adopted: {},
  toast: null,
  capturedCapsules: [],
  selectedCapturedId: null,
  lastEngine: null,
  chat: [],
  chatBusy: false,

  // ---- actions ----
  // Single source of truth for the open document — the sidebar tree row tint
  // and the editor headline both read this, so tree + canvas always agree.
  setActiveDoc: (docId) => set({ activeDocId: docId }),
  // Section selection is doc-local; null returns to the doc-level overview.
  setActiveSection: (sectionId) => set({ activeSectionId: sectionId }),
  // Mode switch drives the editor chrome (editable vs frozen vs archived).
  setDocStatus: (status) => set({ docStatus: status }),
  // Clamp every width write so a drag can never collapse the canvas or
  // overflow the viewport — the resizer is the only caller, but stay safe.
  setPanelWidth: (width) => set({ panelWidth: clamp(width, PANEL_MIN, PANEL_MAX) }),
  // Agentic mode lets high-transfer findings adopt without a human gate.
  toggleAgentic: () =>
    set((s) => ({
      agenticMode: !s.agenticMode,
      toast: !s.agenticMode
        ? `Agentic mode ON — findings ≥ ${s.agenticThreshold} transfer auto-adopt.`
        : 'Agentic mode OFF — adoption returns to manual sign-off.',
    })),
  // Keep the gate inside [0, 100]; the threshold slider is the only writer.
  setAgenticThreshold: (threshold) =>
    set({ agenticThreshold: clamp(threshold, AGENTIC_MIN, AGENTIC_MAX) }),
  // Leaving the graph clears the selected node so a stale highlight never
  // re-appears when the Knowledge Graph panel is later reopened.
  openPanelFor: (panel) =>
    set((s) =>
      panel !== 'graph' && s.openPanel === 'graph'
        ? { openPanel: panel, selectedNodeId: null }
        : { openPanel: panel },
    ),
  closePanel: () =>
    set((s) =>
      s.openPanel === 'graph'
        ? { openPanel: null, selectedNodeId: null }
        : { openPanel: null },
    ),
  selectSkill: (skillId) => set({ selectedSkillId: skillId }),
  selectCapsule: (capsuleId) => set({ selectedCapsuleId: capsuleId }),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  toggleEnterprise: () =>
    set((s) => ({
      enterprise: !s.enterprise,
      toast: !s.enterprise
        ? 'Enterprise skill set — showing capsule-maxxed best versions.'
        : "Project skill set — showing this project's pinned versions.",
    })),
  toggleCapsule: () =>
    set((s) => ({
      capsuleOn: !s.capsuleOn,
      toast: !s.capsuleOn
        ? 'Capsule context ON — latest capsule will be injected.'
        : 'Capsule context OFF.',
    })),
  // Cap the compare selection at two ids, dropping the oldest when a third is
  // ticked, so the side-by-side diff always stays visible (factory behaviour).
  toggleCompare: (id) =>
    set((s) => ({
      compareIds: s.compareIds.includes(id)
        ? s.compareIds.filter((c) => c !== id)
        : [...s.compareIds, id].slice(-2),
    })),
  setRecommendQuery: (query) => set({ recommendQuery: query }),
  setVersionsSkill: (skillId) => set({ versionsSkillId: skillId }),
  setVersionsTab: (tab) => set({ versionsTab: tab }),
  // Adoption is a metadata op recorded in the overlay — never a mutation of the
  // shared `data` module. Selectors derive the published/current view from it.
  adoptLatest: (skillId) =>
    set((s) => {
      const skill = data.skills.find((sk) => sk.id === skillId);
      if (!skill) return {};
      const target = latestVersion(skill);
      if (!target) return {};
      return {
        adopted: { ...s.adopted, [skillId]: target.version },
        selectedSkillId: skillId,
        toast: `Adopted enterprise-best ${skill.name} v${target.version} org-wide.`,
      };
    }),
  showToast: (message) => set({ toast: message }),
  dismissToast: () => set({ toast: null }),
  // The overlay is the ONLY place real captures live — data.ts stays immutable.
  // Opening the new capsule's detail keeps the panel on the just-captured result.
  addCapsule: (capsule) =>
    set((s) => ({
      capturedCapsules: [capsule, ...s.capturedCapsules.filter((c) => c.id !== capsule.id)],
      lastEngine: capsule.engine,
      selectedCapturedId: capsule.id,
    })),
  setLastEngine: (engine) => set({ lastEngine: engine }),
  selectCaptured: (id) => set({ selectedCapturedId: id }),
  pushChat: (message) => set((s) => ({ chat: [...s.chat, message] })),
  // Mutate the last message's content (the streaming assistant turn).
  appendChat: (chunk) =>
    set((s) => {
      if (s.chat.length === 0) return {};
      const chat = s.chat.slice();
      const last = chat[chat.length - 1];
      chat[chat.length - 1] = { ...last, content: last.content + chunk };
      return { chat };
    }),
  setChatBusy: (busy) => set({ chatBusy: busy }),
  clearChat: () => set({ chat: [], chatBusy: false }),
    }),
    {
      // Persist ONLY the visible thread to sessionStorage so a reload replays the
      // exact conversation. This is a UI cache — durable memory still lives in
      // Backboard (written server-side at send time, so replay never re-writes).
      name: 'capsule-chat',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ chat: s.chat }),
    },
  ),
);
