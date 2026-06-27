// GET /api/chats — list the saved localhost chat sessions (newest first), with their
// LLM-generated titles. Powers the Capture panel's session picker.
import { NextResponse } from "next/server";
import { listChats } from "@/lib/chats";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ chats: listChats() });
}
