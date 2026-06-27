// CHAT — the working agent composer, streamed from the LOCAL model (Ollama qwen2.5-coder:14b).
// The WHOLE point of CAPSULE is warm-start: when capsuleOn, we inject the latest capsule
// briefing as ground truth, and any attached enterprise skills, into the system prompt — so the
// agent answers oriented, not cold. Streams plain text chunks back so the UI fills in live.
import { NextRequest } from "next/server";
import { data } from "@/lib/data";
import { OLLAMA_MODEL } from "@/lib/cerebras";
import { retrieveMemory, storeCapsuleMemory } from "@/lib/backboard";
import type { Capsule } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const OLLAMA_BASE = process.env.OLLAMA_URL || "http://localhost:11434";
// All chat turns land in one Backboard thread under the tenant "capsule" assistant,
// so the conversation becomes durable tenant memory (retrievable + warm-start fuel).
const CHAT_THREAD_KEY = "relay-chat";

type Msg = { role: "system" | "user" | "assistant"; content: string };

function cleanIntent(intent: string): string {
  return (intent || "")
    .replace(/<local-command-caveat>[\s\S]*?(?=$|\n)/gi, "")
    .replace(/<\/?[a-z-]+>/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

// Latest capsule overall — the "current context" a warm-started agent inherits.
function latestCapsule(): Capsule | null {
  if (data.capsules.length === 0) return null;
  return [...data.capsules].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function capsuleBriefing(c: Capsule): string {
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

function systemPrompt(capsuleOn: boolean, skills: string[], recalled: string[]): string {
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

export async function POST(req: NextRequest) {
  let body: { messages?: Msg[]; capsuleOn?: boolean; skills?: string[] };
  try {
    body = await req.json();
  } catch {
    return new Response("invalid JSON body", { status: 400 });
  }
  const history = (body.messages || []).filter((m) => m.content?.trim());
  if (history.length === 0) return new Response("no messages", { status: 400 });

  const capsuleOn = body.capsuleOn ?? true;
  const skills = body.skills || [];
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content || "";

  // READ side: when context is on, surface relevant tenant memory (prior capsules +
  // past chat turns) from Backboard so the agent answers warm. Degrades to [] without a key.
  const recalled = capsuleOn ? (await retrieveMemory(lastUser)).memories.slice(0, 4) : [];

  const messages: Msg[] = [
    { role: "system", content: systemPrompt(capsuleOn, skills, recalled) },
    ...history,
  ];

  let upstream: Response;
  try {
    upstream = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: true,
        messages,
        options: { temperature: 0.4 },
      }),
    });
  } catch {
    return new Response("Local model unavailable — start Ollama (ollama serve).", { status: 503 });
  }
  if (!upstream.ok || !upstream.body) {
    return new Response("Local model error.", { status: 502 });
  }

  // Re-stream: Ollama emits NDJSON ({message:{content}, done}); forward just the
  // content deltas as plain text so the client can append them verbatim.
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = "";
  let reply = ""; // accumulate the full assistant turn for the Backboard write

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        // WRITE side: persist the completed turn as durable tenant memory. Distilled
        // form (User/Agent lines), send_to_llm:false — a memory op, never billed inference.
        // Fire-and-forget; storeCapsuleMemory logs failures and never throws.
        if (reply.trim()) {
          void storeCapsuleMemory(
            CHAT_THREAD_KEY,
            `CAPSULE chat turn\n\nUser: ${lastUser}\n\nAgent: ${reply.trim()}`,
          );
        }
        return;
      }
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? ""; // keep the partial last line for the next chunk
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const piece = JSON.parse(line)?.message?.content;
          if (piece) {
            reply += piece;
            controller.enqueue(encoder.encode(piece));
          }
        } catch {
          // ignore non-JSON keepalive lines
        }
      }
    },
    cancel() {
      reader.cancel();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
