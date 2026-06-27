// CAPTURE — read a Claude Code session transcript (~/.claude/projects/<proj>/<id>.jsonl)
// and extract the raw material RELAY distills into a Handoff Capsule.
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PROJ_DIR = join(homedir(), ".claude", "projects");

export type RawSession = {
  sessionId: string;
  project: string;
  path: string;
  messages: number;
  tools: number;
  durationMin: number;
  filesTouched: string[];
  // a compressed transcript: user intents + assistant text + tool actions, trimmed for the LLM
  transcript: string;
};

export type SessionMeta = {
  sessionId: string;
  project: string;
  path: string;
  mtime: number;
  sizeKB: number;
};

function projects(): string[] {
  if (!existsSync(PROJ_DIR)) return [];
  return readdirSync(PROJ_DIR).filter((d) => {
    try { return statSync(join(PROJ_DIR, d)).isDirectory(); } catch { return false; }
  });
}

export function listSessions(limit = 20): SessionMeta[] {
  const out: SessionMeta[] = [];
  for (const p of projects()) {
    const dir = join(PROJ_DIR, p);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      const fp = join(dir, f);
      try {
        const s = statSync(fp);
        out.push({ sessionId: f.replace(/\.jsonl$/, ""), project: p, path: fp, mtime: s.mtimeMs, sizeKB: Math.round(s.size / 1024) });
      } catch { /* skip */ }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit);
}

const FILE_RE = /(?:[A-Za-z]:)?[\w./\\-]+\.(?:ts|tsx|js|jsx|py|css|json|md|mjs|html|java|go|rs|sql|yml|yaml|sh)/g;

export function captureSession(path: string, maxChars = 28000): RawSession {
  const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
  let messages = 0, tools = 0;
  let firstTs = "", lastTs = "";
  const files = new Set<string>();
  const parts: string[] = [];

  for (const line of lines) {
    let r: Record<string, unknown>;
    try { r = JSON.parse(line); } catch { continue; }
    const ts = (r.timestamp as string) || "";
    if (ts) { if (!firstTs) firstTs = ts; lastTs = ts; }
    const type = r.type as string;
    const msg = (r.message as Record<string, unknown>) || {};
    const content = msg.content;
    if (type === "user") {
      messages++;
      const text = typeof content === "string" ? content
        : Array.isArray(content) ? content.map((c) => (typeof c === "object" && c && (c as Record<string,unknown>).type === "text" ? (c as Record<string,string>).text : "")).join(" ")
        : "";
      const t = String(text).trim();
      if (t && !t.startsWith("[") && t.length < 2000) parts.push(`USER: ${t}`);
    } else if (type === "assistant") {
      messages++;
      if (Array.isArray(content)) {
        for (const c of content as Record<string, unknown>[]) {
          if (c.type === "text" && typeof c.text === "string") {
            const t = c.text.trim();
            if (t) parts.push(`AI: ${t.slice(0, 700)}`);
            for (const m of t.matchAll(FILE_RE)) files.add(m[0]);
          } else if (c.type === "tool_use") {
            tools++;
            const name = c.name as string;
            const inp = JSON.stringify(c.input || {});
            for (const m of inp.matchAll(FILE_RE)) files.add(m[0]);
            const fp = (c.input as Record<string, string>)?.file_path || (c.input as Record<string, string>)?.path || "";
            parts.push(`TOOL[${name}]: ${fp || inp.slice(0, 120)}`);
          }
        }
      }
    }
  }

  const durationMin = firstTs && lastTs
    ? Math.max(0, Math.round((Date.parse(lastTs) - Date.parse(firstTs)) / 60000))
    : 0;

  // Keep the head (intent) and the tail (latest state) — that's where handoff signal lives.
  let transcript = parts.join("\n");
  if (transcript.length > maxChars) {
    const head = transcript.slice(0, Math.floor(maxChars * 0.45));
    const tail = transcript.slice(-Math.floor(maxChars * 0.55));
    transcript = `${head}\n…[middle trimmed]…\n${tail}`;
  }

  const project = path.split(/[\\/]/).slice(-2, -1)[0] || "unknown";
  const sessionId = path.split(/[\\/]/).pop()!.replace(/\.jsonl$/, "");
  return {
    sessionId, project, path, messages, tools, durationMin,
    filesTouched: [...files].filter((f) => !f.includes("node_modules")).slice(0, 40),
    transcript,
  };
}
