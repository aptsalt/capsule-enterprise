// CHAT SESSIONS — durable store for the localhost agent conversations, so each one
// can be listed and captured later (parallels ~/.relay/capsules). One file per session
// under ~/.relay/chats/<id>.json. Each session carries an LLM-generated meaningful title.
import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { OLLAMA_MODEL } from "./cerebras";

const CHATS_DIR = join(homedir(), ".relay", "chats");
const OLLAMA_BASE = process.env.OLLAMA_URL || "http://localhost:11434";

export type ChatMsg = { role: "user" | "assistant"; content: string };
export type ChatSession = {
  id: string;
  title: string;
  messages: ChatMsg[];
  updatedAt: string; // ISO
};
// List shape — includes messages so Capture can distill a session without a second fetch.
export type ChatSessionRow = ChatSession & { messageCount: number };

function ensureDir() {
  if (!existsSync(CHATS_DIR)) mkdirSync(CHATS_DIR, { recursive: true });
}
const safe = (id: string) => id.replace(/[^\w.-]/g, "_");
const fileFor = (id: string) => join(CHATS_DIR, `${safe(id)}.json`);

// Cheap fallback headline from the first user message (no model call).
function headline(messages: ChatMsg[]): string {
  const first = messages.find((m) => m.role === "user")?.content || "Untitled chat";
  const s = first.replace(/<\/?[a-z-]+>/gi, "").replace(/\s+/g, " ").trim();
  const w = s.split(" ").slice(0, 8).join(" ").replace(/[.,;:]+$/, "");
  return w.charAt(0).toUpperCase() + w.slice(1) || "Untitled chat";
}

// LLM-generated 3-6 word title for the conversation. Falls back to headline() on any
// failure (Ollama down, timeout) so a session is never left untitled.
export async function generateChatTitle(messages: ChatMsg[]): Promise<string> {
  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Agent"}: ${m.content}`)
    .join("\n")
    .slice(0, 4000);
  // Generous timeout: a cold 14b load can take ~20s. This runs server-side as a
  // fire-and-forget save, so it never blocks the user's chat.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        options: { temperature: 0.2, num_predict: 20 },
        messages: [
          {
            role: "system",
            content:
              "You name conversations. Reply with ONLY a 3-6 word title (Title Case, no quotes, no trailing period) that captures what the conversation is about.",
          },
          { role: "user", content: transcript },
        ],
      }),
    });
    if (!res.ok) return headline(messages);
    const j = await res.json();
    const raw = String(j.message?.content || "").trim();
    const clean = raw.replace(/^["'`]+|["'`.]+$/g, "").replace(/\s+/g, " ").trim();
    const words = clean.split(" ").slice(0, 7).join(" ");
    return words || headline(messages);
  } catch {
    return headline(messages);
  } finally {
    clearTimeout(timer);
  }
}

function readSession(id: string): ChatSession | null {
  try {
    return JSON.parse(readFileSync(fileFor(id), "utf-8")) as ChatSession;
  } catch {
    return null;
  }
}

// Upsert a session. Title is generated once (on first save) and preserved after, so
// repeated per-turn saves don't re-spend a model call. Never throws.
export async function saveChat(
  id: string,
  messages: ChatMsg[],
  providedTitle?: string,
): Promise<{ id: string; title: string }> {
  ensureDir();
  const existing = readSession(id);
  const title =
    providedTitle?.trim() || existing?.title || (await generateChatTitle(messages));
  const session: ChatSession = { id, title, messages, updatedAt: new Date().toISOString() };
  writeFileSync(fileFor(id), JSON.stringify(session, null, 2));
  return { id, title };
}

export function listChats(): ChatSessionRow[] {
  ensureDir();
  return readdirSync(CHATS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const s = JSON.parse(readFileSync(join(CHATS_DIR, f), "utf-8")) as ChatSession;
        return { ...s, messageCount: s.messages?.length ?? 0 };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b as ChatSessionRow).updatedAt.localeCompare((a as ChatSessionRow).updatedAt)) as ChatSessionRow[];
}
