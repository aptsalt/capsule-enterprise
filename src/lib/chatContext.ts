// CHAT CONTEXT — the single source of truth for what the agent "knows" on a turn.
// Shared by POST /api/chat (the real generation) and POST /api/chat/context (the
// inspector that shows, without generating, exactly what would be sent. This is the
// observability seam: if you want to know what the agent sees, read THIS file.
import { data } from "./data";
import type { Capsule } from "./types";

export type Msg = { role: "system" | "user" | "assistant"; content: string };

// All chat turns land in one Backboard thread under the tenant "capsule" assistant.
export const CHAT_THREAD_KEY = "relay-chat";

// Only the last N turns are sent to the model — keeps token cost bounded as a
// conversation grows. Older turns aren't lost: they live in Backboard memory and
// resurface via semantic recall when relevant.
export const MAX_CONTEXT_MSGS = 12;

export function cleanIntent(intent: string): string {
  return (intent || "")
    .replace(/<local-command-caveat>[\s\S]*?(?=$|\n)/gi, "")
    .replace(/<\/?[a-z-]+>/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

// Latest capsule overall — the "current context" a warm-started agent inherits.
export function latestCapsule(): Capsule | null {
  if (data.capsules.length === 0) return null;
  return [...data.capsules].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function capsuleBriefing(c: Capsule): string {
  const L = [`# Inherited capsule — project "${c.project}" (session ${c.session})`];
  if (c.intent) L.push(`Intent: ${cleanIntent(c.intent)}`);
  if (c.summary) L.push(`Current state: ${c.summary}`);
  if (c.finding) L.push(`Key finding: ${c.finding}`);
  if (c.decisions?.length) {
    L.push(`Decisions already made (do NOT re-litigate):`);
    c.decisions.forEach((d) => {
      const why = d.why && d.why !== "(inferred from session)" ? ` — ${d.why}` : "";
      L.push(`- ${d.what}${why}`);
    });
  }
  if (c.gotchas?.length) {
    L.push(`Gotchas to avoid:`);
    c.gotchas.forEach((g) => L.push(`- ${g}`));
  }
  return L.join("\n");
}

export function buildSystemPrompt(
  capsuleOn: boolean,
  skills: string[],
  recalled: string[],
): string {
  const parts = [
    "You are the CAPSULE agent inside an 8090 Software Factory workspace. " +
      "Help the developer build, drawing on the enterprise's distilled context. Be concise and concrete.",
  ];
  if (capsuleOn) {
    const c = latestCapsule();
    if (c)
      parts.push(
        `You have inherited the latest handoff capsule. Treat it as ground truth; do not redo settled work.\n\n${capsuleBriefing(c)}`,
      );
  }
  if (recalled.length) {
    parts.push(
      `Relevant tenant memory recalled from Backboard (prior capsules/conversations):\n` +
        recalled.map((m) => `- ${m.slice(0, 500)}`).join("\n"),
    );
  }
  if (skills.length) {
    parts.push(`Apply these enterprise skills the developer attached: ${skills.join(", ")}.`);
  }
  return parts.join("\n\n");
}

// The exact string a completed turn is persisted as in Backboard (so the inspector
// can show what WILL be written before it happens).
export function chatMemoryRecord(lastUser: string, reply: string): string {
  return `CAPSULE chat turn\n\nUser: ${lastUser}\n\nAgent: ${reply.trim()}`;
}
