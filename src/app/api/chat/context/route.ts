// CHAT CONTEXT INSPECTOR — POST /api/chat/context
// Answers "what does the agent actually see, and what touches Backboard?" WITHOUT
// running a generation. Mirrors POST /api/chat exactly (same shared chatContext lib),
// minus the Ollama call. Powers the in-app "Context" inspector.
import { NextRequest, NextResponse } from "next/server";
import { retrieveMemory, hasBackboardKey, cachedThreadId } from "@/lib/backboard";
import {
  CHAT_THREAD_KEY,
  MAX_CONTEXT_MSGS,
  buildSystemPrompt,
  chatMemoryRecord,
  latestCapsule,
  type Msg,
} from "@/lib/chatContext";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { messages?: Msg[]; capsuleOn?: boolean; skills?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const history = (body.messages || []).filter((m) => m.content?.trim());
  const capsuleOn = body.capsuleOn ?? true;
  const skills = body.skills || [];
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content || "";

  // Same READ as /api/chat (semantic recall from Backboard), so the inspector
  // shows the actual memories that would be injected.
  const recall = capsuleOn && lastUser ? await retrieveMemory(lastUser) : { ok: false, memories: [] };
  const recalled = recall.memories.slice(0, 4);

  const capsule = capsuleOn ? latestCapsule() : null;
  const sentToModel = history.slice(-MAX_CONTEXT_MSGS);

  return NextResponse.json({
    // WHERE the context lives + how big it is
    thread: {
      totalMessages: history.length,
      sentToModel: sentToModel.length,
      cappedAt: MAX_CONTEXT_MSGS,
      truncated: history.length > MAX_CONTEXT_MSGS,
      lastUser,
    },
    // WHAT warm-start injects
    warmStart: {
      enabled: capsuleOn,
      capsuleId: capsule?.id ?? null,
      capsuleProject: capsule?.project ?? null,
      skills,
    },
    // WHAT was recalled from Backboard (the READ)
    backboardRead: {
      live: recall.ok,
      query: lastUser,
      memories: recalled,
    },
    // WHAT will be written to Backboard on the next completed turn (the WRITE)
    backboardWrite: {
      keyConfigured: hasBackboardKey(),
      threadKey: CHAT_THREAD_KEY,
      threadId: cachedThreadId(CHAT_THREAD_KEY),
      recordPreview: chatMemoryRecord(lastUser, "<agent reply on completion>"),
    },
    // The EXACT system prompt the model receives
    systemPrompt: buildSystemPrompt(capsuleOn, skills, recalled),
  });
}
