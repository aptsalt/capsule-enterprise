import { NextResponse } from "next/server";
import { listSessions } from "@/lib/capture";
import { ollamaHealth } from "@/lib/cerebras";
export const dynamic = "force-dynamic";
export async function GET() {
  // `engine` lets the capture UI show which distiller will actually run (Ollama
  // on-device vs cloud boost vs local heuristic) and the resolved model name,
  // instead of hardcoding a label that may not match the running engine.
  const engine = await ollamaHealth();
  return NextResponse.json({ sessions: listSessions(15), engine });
}
