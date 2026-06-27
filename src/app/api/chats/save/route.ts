// POST /api/chats/save — upsert a localhost chat session to the durable store.
// Body: { id, messages, title? }. Called by the composer after each completed turn
// (fire-and-forget). Title is generated once and preserved on later saves.
import { NextRequest, NextResponse } from "next/server";
import { saveChat, type ChatMsg } from "@/lib/chats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { id?: string; messages?: ChatMsg[]; title?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const messages = (body.messages || []).filter((m) => m.content?.trim());
  if (!body.id || messages.length === 0) {
    return NextResponse.json({ error: "id and messages required" }, { status: 400 });
  }
  const saved = await saveChat(body.id, messages, body.title);
  return NextResponse.json(saved);
}
