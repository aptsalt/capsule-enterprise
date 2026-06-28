// GEMINI — free-tier cloud LLM provider, used so the HOSTED app (Vercel, no local
// Ollama) can still run the chat agent and distillation. Enabled only when
// GEMINI_API_KEY is set; otherwise everything degrades exactly as before.
//
// Google AI Studio free tier: https://aistudio.google.com/app/apikey
// Model + key are env-driven so nothing is hard-coded.
import type { Msg } from "./chatContext";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

// On Vercel (or when explicitly asked) prefer Gemini outright — there is no local
// Ollama to reach, so skip the localhost attempt and its latency.
export function preferGemini(): boolean {
  return geminiEnabled() && (process.env.RELAY_PREFER_GEMINI === "1" || !!process.env.VERCEL);
}

// Map our {system,user,assistant} turns to Gemini's contents[] (user|model).
function toContents(history: Msg[]) {
  return history
    .filter((m) => m.role !== "system" && m.content?.trim())
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
}

// STREAMING chat — returns a ReadableStream of plain-text deltas (matching the
// Ollama path's contract), or null if Gemini can't be reached. onDone receives the
// full assistant reply so the caller can persist it to Backboard, exactly like Ollama.
export async function geminiChatStream(
  system: string,
  history: Msg[],
  onDone?: (reply: string) => void,
): Promise<ReadableStream<Uint8Array> | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${key}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: toContents(history),
        generationConfig: { temperature: 0.4 },
      }),
    });
  } catch {
    return null;
  }
  if (!upstream.ok || !upstream.body) return null;

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = "";
  let reply = "";

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        if (reply.trim() && onDone) onDone(reply);
        return;
      }
      buf += decoder.decode(value, { stream: true });
      // Gemini SSE: lines of `data: {json}` separated by blank lines.
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const piece = JSON.parse(payload)?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (piece) {
            reply += piece;
            controller.enqueue(encoder.encode(piece));
          }
        } catch {
          // ignore keepalives / partial frames
        }
      }
    },
    cancel() {
      reader.cancel();
    },
  });
}

// NON-STREAMING JSON call — used by the distiller. Returns the raw response text
// (expected to be JSON) or null. Forces JSON output via responseMimeType.
export async function geminiJSON(system: string, user: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${key}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch {
    return null;
  }
}
