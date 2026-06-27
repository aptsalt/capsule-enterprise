#!/usr/bin/env node
// CAPTURE-ENQUEUE — the FAST, NON-BLOCKING half of CAPSULE Ambient Capture (#2).
//
// Fired by the Claude Code **Stop** hook the instant a session turn finishes. Its ONLY job is to
// append the just-finished session's transcript path to the capture queue and exit immediately.
// It NEVER calls a model, never touches Backboard, never does git — so it can never slow down the
// user's Claude Code. The heavy pipeline (distill -> score -> gate -> store -> bump) runs later in
// the separate long-running `capture-watcher.ts` process.
//
// Usage:
//   node capture-enqueue.js [transcriptPath]
//   - If a path arg is given, that exact path is enqueued.
//   - If no arg (the Stop-hook case, since `start /b` detaches stdin), it resolves the
//     MOST-RECENTLY-MODIFIED ~/.claude/projects/*/*.jsonl and enqueues that.
//
// Crash-safe: every step is wrapped; the process ALWAYS exits 0 so a failure here can never surface
// as a hook error in the user's session.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const CAPSULE_DIR = "C:/Users/deepc/.capsule";
const QUEUE = path.join(CAPSULE_DIR, "capture-queue.txt");
const PROJ_DIR = path.join(os.homedir(), ".claude", "projects");

// Resolve the most-recently-modified session transcript across all projects.
function mostRecentJsonl() {
  let best = null;
  let bestMtime = -1;
  let dirs = [];
  try {
    dirs = fs.readdirSync(PROJ_DIR);
  } catch {
    return null;
  }
  for (const d of dirs) {
    const dir = path.join(PROJ_DIR, d);
    let files = [];
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const fp = path.join(dir, f);
      try {
        const m = fs.statSync(fp).mtimeMs;
        if (m > bestMtime) {
          bestMtime = m;
          best = fp;
        }
      } catch {
        /* skip unreadable */
      }
    }
  }
  return best;
}

function main() {
  let target = process.argv[2] && process.argv[2].trim();
  if (!target) target = mostRecentJsonl();
  if (!target) return; // nothing to enqueue — silent, non-blocking

  // Normalize to forward slashes so the queue file is stable & easy to dedup.
  const normalized = path.resolve(target).replace(/\\/g, "/");

  try {
    fs.mkdirSync(CAPSULE_DIR, { recursive: true });
  } catch {
    /* dir may already exist */
  }

  // Append the path + a newline. The watcher dedups, so a duplicate enqueue is harmless.
  try {
    fs.appendFileSync(QUEUE, normalized + "\n", "utf8");
  } catch {
    /* never throw out of the hook */
  }
}

try {
  main();
} catch {
  /* swallow — the Stop hook must never fail */
}
process.exit(0);
