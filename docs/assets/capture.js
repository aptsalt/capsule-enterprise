// CAPSULE launch-media capture.
// Connects Puppeteer to the ALREADY-RUNNING app at http://localhost:3010 and
// produces real screenshots + short webm clips of the live UI. Resolves the
// GLOBAL puppeteer (NODE_PATH=$(npm root -g)). Never starts/stops the dev server.
//
// Selectors learned from src/components/*.tsx + panels/*.tsx:
//   - icon toolbar (DocumentEditor): button[aria-label="Knowledge Graph"|"Skills"|"Versions"|"A/B Trials"]
//   - agentic toggle (TopBar):       button[title^="Agentic"]  (role=switch, aria-checked)
//   - enterprise toggle (SkillsPanel):button[aria-label="Toggle enterprise skill set"]
//   - capsule toggle (RightPanel):   button[title="Inject the latest capsule context"] (aria-pressed)
//   - composer textarea:             textarea[aria-label="Message the agent"]
//   - @-mention popover:             [role="listbox"][aria-label="Mention a requirement"]
//   - read-only doc segment:         button[title^="Read only"]
//   - capture panel open:            sidebar button text "Capture this session"
//   - sidebar capsule row -> graph:  button[title="Opens in the Knowledge Graph"]
//   - resize handle:                 div[role="separator"][aria-label="Resize panel"]

const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const BASE = "http://localhost:3010";
const ROOT = "C:/Users/deepc/capsule/assets";
const SHOTS = path.join(ROOT, "shots");
const VIDEO = path.join(ROOT, "video");
const REPOFLOW = "file://C:/Users/deepc/capsule/REPO-FLOW.html";

const manifest = { shots: [], videos: [] };
const failures = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const d of [SHOTS, VIDEO]) fs.mkdirSync(d, { recursive: true });

async function shot(page, file, caption) {
  const full = path.join(SHOTS, file);
  try {
    await page.screenshot({ path: full, type: "png" });
    if (fs.existsSync(full)) {
      manifest.shots.push({ file: `shots/${file}`, caption });
      console.log("  shot OK   ", file);
      return true;
    }
    throw new Error("file not written");
  } catch (e) {
    failures.push(`shot ${file}: ${e.message}`);
    console.log("  shot FAIL ", file, e.message);
    return false;
  }
}

// Real mouse click on a selector (waits for it first).
async function clickSel(page, selector, timeout = 8000) {
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.click(selector);
}

// Click the first element matching a text predicate (button/anchor).
async function clickText(page, text) {
  const ok = await page.evaluate((t) => {
    const els = [...document.querySelectorAll("button, a")];
    const el = els.find((e) => (e.textContent || "").includes(t));
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.click();
      return true;
    }
    return false;
  }, text);
  if (!ok) throw new Error(`no element with text "${text}"`);
}

// Close any open side panel (Escape), return to a clean canvas.
async function closePanel(page) {
  await page.keyboard.press("Escape");
  await sleep(350);
}

// Ensure an aria-state toggle matches `want`. attr is "aria-checked"|"aria-pressed".
async function ensureToggle(page, selector, attr, want) {
  const cur = await page.$eval(selector, (el, a) => el.getAttribute(a), attr).catch(() => null);
  if (cur === null) return false;
  if (cur !== String(want)) {
    await page.click(selector);
    await sleep(450);
  }
  return true;
}

async function startRec(page, file) {
  const full = path.join(VIDEO, file);
  try {
    const rec = await page.screencast({ path: full });
    return { rec, full, file };
  } catch (e) {
    failures.push(`video ${file} start: ${e.message}`);
    console.log("  vid  FAIL ", file, e.message);
    return null;
  }
}

async function stopRec(handle, caption) {
  if (!handle) return;
  try {
    await handle.rec.stop();
    if (fs.existsSync(handle.full) && fs.statSync(handle.full).size > 0) {
      manifest.videos.push({ file: `video/${handle.file}`, caption });
      console.log("  vid  OK   ", handle.file);
    } else {
      throw new Error("empty file");
    }
  } catch (e) {
    failures.push(`video ${handle.file} stop: ${e.message}`);
    console.log("  vid  FAIL ", handle.file, e.message);
  }
}

async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.log("  STEP FAIL ", name, e.message);
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
    args: ["--no-sandbox", "--force-color-profile=srgb", "--hide-scrollbars"],
  });
  const page = await browser.newPage();
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "no-preference" },
  ]);
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1200);

  // ---------------- SCREENSHOTS ----------------

  // 01 workspace / home — switch to an editable doc so the full toolbar + glowing
  //    composer read as a live workspace.
  await step("01-home", async () => {
    await closePanel(page);
    await step("home-tab", async () => { await clickText(page, "Feature Requirements"); });
    await sleep(700);
    await shot(page, "01-workspace-home.png", "CAPSULE workspace — document editor, knowledge sidebar, agent composer");
  });

  // 02 Knowledge Graph panel open (no node selected).
  await step("02-kg", async () => {
    await clickSel(page, 'button[aria-label="Knowledge Graph"]');
    await sleep(1800); // let the force sim settle
    await shot(page, "02-knowledge-graph.png", "Knowledge Graph Explorer — provenance force-graph of capsules, skills, agents");
  });

  // 03 graph node selected -> provenance detail (sidebar capsule row selects a node).
  await step("03-provenance", async () => {
    await clickSel(page, 'button[title="Opens in the Knowledge Graph"]');
    await sleep(1500);
    await shot(page, "03-graph-node-provenance.png", "Node selected — full provenance: finding, routed-to skills, technique to learn");
  });

  // 04 Skills panel — enterprise OFF.
  await step("04-skills-off", async () => {
    await closePanel(page);
    await clickSel(page, 'button[aria-label="Skills"]');
    await sleep(700);
    await ensureToggle(page, 'button[aria-label="Toggle enterprise skill set"]', "aria-checked", false);
    await sleep(400);
    await shot(page, "04-skills-enterprise-off.png", "Skills panel — project-pinned versions (Enterprise OFF)");
  });

  // 05 Skills panel — ENTERPRISE ON (blue toggle + recolored active cards).
  await step("05-skills-on", async () => {
    await ensureToggle(page, 'button[aria-label="Toggle enterprise skill set"]', "aria-checked", true);
    await sleep(700);
    await shot(page, "05-skills-enterprise-on.png", "Skills panel — Enterprise ON: capsule-maxxed best versions, blue toggle lit");
    // restore for later panels
    await ensureToggle(page, 'button[aria-label="Toggle enterprise skill set"]', "aria-checked", false);
  });

  // 06 Version History panel.
  await step("06-versions", async () => {
    await closePanel(page);
    await clickSel(page, 'button[aria-label="Versions"]');
    await sleep(800);
    await shot(page, "06-version-history.png", "Version History — every capsule finding mints a new semver; day-grouped audit trail");
  });

  // 07 Versions Compare mode — tick two versions -> word-level diff.
  await step("07-compare", async () => {
    const n = await page.$$eval('input[type="checkbox"]', (els) => {
      els.slice(0, 2).forEach((e) => e.click());
      return els.length;
    });
    if (n < 2) throw new Error("fewer than 2 version checkboxes");
    await sleep(900);
    await shot(page, "07-versions-compare-diff.png", "Compare mode — side-by-side word-level diff of changelog & guidance between two versions");
  });

  // 08 A/B Trials panel.
  await step("08-ab", async () => {
    await closePanel(page);
    await clickSel(page, 'button[aria-label="A/B Trials"]');
    await sleep(800);
    await shot(page, "08-ab-trials.png", "A/B Trials — same task with the capsule recalled vs a cold run: tokens & steps saved");
  });

  // 09 Capture panel — MANUAL mode.
  await step("09-capture-manual", async () => {
    await closePanel(page);
    await ensureToggle(page, 'button[title^="Agentic"]', "aria-checked", false);
    await clickText(page, "Capture this session");
    await sleep(2500); // allow /api/sessions to list real sessions
    await shot(page, "09-capture-manual.png", "Capture session — MANUAL: pick a real ~/.claude session, distill on-device with Ollama");
  });

  // 10 Capture panel — AGENTIC mode (gate banner). Turn agentic ON, then run a
  //    real distill to surface the Kept/Skipped gate; fall back to the agentic
  //    threshold bar if the local distiller is unavailable.
  await step("10-capture-agentic", async () => {
    await ensureToggle(page, 'button[title^="Agentic"]', "aria-checked", true);
    await sleep(800);
    // Try to actually run the gate by clicking the first session row.
    let ranGate = false;
    await step("agentic-run", async () => {
      const clicked = await page.evaluate(() => {
        // session rows are buttons whose mono subline contains "KB ·"
        const btns = [...document.querySelectorAll("button")];
        const row = btns.find((b) => /KB ·/.test(b.textContent || ""));
        if (row) { row.click(); return true; }
        return false;
      });
      if (!clicked) return;
      // Wait up to 45s for the gate banner (Kept/Skipped) text.
      for (let i = 0; i < 90; i++) {
        const seen = await page.evaluate(() =>
          /promoted to enterprise repo|Skipped · not promoted/.test(document.body.innerText),
        );
        if (seen) { ranGate = true; break; }
        await sleep(500);
      }
    });
    await sleep(600);
    await shot(
      page,
      "10-capture-agentic.png",
      ranGate
        ? "Capture session — AGENTIC: auto-distill + gate, capsule Kept/Skipped vs the threshold"
        : "Capture session — AGENTIC: auto-distill + threshold gate (keep if transfer ≥ bar or novelty ≥ 80)",
    );
  });

  // 11 Composer with Capsule toggle ON (fluorescent-yellow glow). capsuleOn
  //    defaults true; ensure it's on and the canvas is clear so the right rail shows.
  await step("11-capsule-glow", async () => {
    await closePanel(page);
    await ensureToggle(page, 'button[title^="Agentic"]', "aria-checked", false);
    await ensureToggle(page, 'button[title="Inject the latest capsule context"]', "aria-pressed", true);
    await sleep(600);
    await shot(page, "11-composer-capsule-glow.png", "Agent composer — Capsule context ON: the fluorescent-yellow aura injects the latest capsule");
  });

  // 12 Read-only doc mode (status pill). Technical Requirements loads read-only.
  await step("12-readonly", async () => {
    await step("tr-tab", async () => { await clickText(page, "Technical Requirements"); });
    await sleep(500);
    await step("read-seg", async () => { await clickSel(page, 'button[title^="Read only"]'); });
    await sleep(500);
    await shot(page, "12-readonly-doc.png", "Read-only document mode — status pill + dimmed toolbar; the surface is frozen for review");
  });

  // 13 @-mention popover open in the composer.
  await step("13-mention", async () => {
    await clickSel(page, 'textarea[aria-label="Message the agent"]');
    await page.type('textarea[aria-label="Message the agent"]', "@", { delay: 60 });
    await page.waitForSelector('[role="listbox"][aria-label="Mention a requirement"]', { visible: true, timeout: 5000 });
    await sleep(400);
    await shot(page, "13-mention-popover.png", "@-mention popover — reference a requirement (REQ-xxx) directly inside the agent composer");
    // clear the textarea so it doesn't bleed into later shots
    await page.evaluate(() => {
      const t = document.querySelector('textarea[aria-label="Message the agent"]');
      if (t) { t.value = ""; t.dispatchEvent(new Event("input", { bubbles: true })); }
    });
    await page.keyboard.press("Escape");
  });

  // 14 A side panel dragged wide (real pointer drag on the resize separator).
  await step("14-drag-wide", async () => {
    await closePanel(page);
    await clickSel(page, 'button[aria-label="Skills"]');
    await sleep(700);
    const handle = await page.$('div[role="separator"][aria-label="Resize panel"]');
    if (!handle) throw new Error("no resize separator");
    const box = await handle.boundingBox();
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    // panel grows to the LEFT — drag the pointer left to widen it.
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(sx - i * 24, sy);
      await sleep(20);
    }
    await page.mouse.up();
    await sleep(900);
    await shot(page, "14-panel-dragged-wide.png", "Resizable side rail dragged wide — Skills cards reflow into a two-up grid");
  });

  // 15 REPO-FLOW.html — enterprise-vs-personal comparison section.
  await step("15-repoflow", async () => {
    await page.goto(REPOFLOW, { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(600);
    await page.evaluate(() => {
      const hs = [...document.querySelectorAll("h1,h2,h3")];
      const h = hs.find((e) => /Enterprise registry vs Personal repo/i.test(e.textContent || ""))
        || hs.find((e) => /(enterprise).*(personal)|(personal).*(enterprise)/i.test(e.textContent || ""));
      if (h) h.scrollIntoView({ block: "start" });
    });
    await sleep(700);
    await shot(page, "15-repoflow-enterprise-vs-personal.png", "REPO-FLOW — Enterprise registry vs Personal repo: how a developer pins an enterprise skill");
  });

  // ---------------- VIDEOS (best-effort) ----------------
  // Return to the live app for the interaction clips.
  await page.goto(BASE, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1000);

  // vid-knowledge-graph — open KG, settle, then click a node.
  await step("vid-kg", async () => {
    await closePanel(page);
    await clickSel(page, 'button[aria-label="Knowledge Graph"]');
    await sleep(1600);
    const rec = await startRec(page, "vid-knowledge-graph.webm");
    await sleep(700);
    await page.evaluate(() => {
      const gs = [...document.querySelectorAll("svg g.group")];
      const t = gs.find((g) => /skill|CAP|cap-/i.test(g.textContent || "")) || gs[Math.floor(gs.length / 2)] || gs[0];
      if (t) t.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await sleep(3800);
    await stopRec(rec, "Opening the Knowledge Graph and selecting a node to reveal its provenance");
  });

  // vid-enterprise-toggle — Skills open (OFF), record the recolor as enterprise flips ON.
  await step("vid-enterprise", async () => {
    await closePanel(page);
    await clickSel(page, 'button[aria-label="Skills"]');
    await sleep(700);
    await ensureToggle(page, 'button[aria-label="Toggle enterprise skill set"]', "aria-checked", false);
    await sleep(400);
    const rec = await startRec(page, "vid-enterprise-toggle.webm");
    await sleep(900);
    await page.click('button[aria-label="Toggle enterprise skill set"]');
    await sleep(3600);
    await stopRec(rec, "Flipping ENTERPRISE on — skill cards recolor to the capsule-maxxed best versions");
    await ensureToggle(page, 'button[aria-label="Toggle enterprise skill set"]', "aria-checked", false);
  });

  // vid-capsule-glow — close panels, toggle Capsule off then on; capture the pulse.
  await step("vid-glow", async () => {
    await closePanel(page);
    await ensureToggle(page, 'button[title="Inject the latest capsule context"]', "aria-pressed", true);
    await sleep(400);
    const rec = await startRec(page, "vid-capsule-glow.webm");
    await sleep(700);
    await page.click('button[title="Inject the latest capsule context"]'); // off
    await sleep(1100);
    await page.click('button[title="Inject the latest capsule context"]'); // on -> glow pulses
    await sleep(3400);
    await stopRec(rec, "Capsule toggle ON — the composer lights up with a pulsing fluorescent-yellow aura");
  });

  // vid-agentic — agentic on, open capture, run the gate (best-effort).
  await step("vid-agentic", async () => {
    await closePanel(page);
    await ensureToggle(page, 'button[title^="Agentic"]', "aria-checked", true);
    await sleep(400);
    await step("vid-agentic-open", async () => { await clickText(page, "Capture this session"); });
    await sleep(2200);
    const rec = await startRec(page, "vid-agentic.webm");
    await sleep(600);
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")];
      const row = btns.find((b) => /KB ·/.test(b.textContent || ""));
      if (row) row.click();
    });
    // record the distilling -> gate transition (capped); the gate may resolve
    // after the clip ends — that's fine, we capture what works.
    await sleep(6400);
    await stopRec(rec, "Agentic capture — auto-distill on-device, then the gate decides Kept vs Skipped");
    await ensureToggle(page, 'button[title^="Agentic"]', "aria-checked", false);
  });

  // vid-drag — open Skills, record a real drag of the resize separator wider.
  await step("vid-drag", async () => {
    await closePanel(page);
    await clickSel(page, 'button[aria-label="Skills"]');
    await sleep(700);
    const handle = await page.$('div[role="separator"][aria-label="Resize panel"]');
    if (!handle) throw new Error("no resize separator");
    const box = await handle.boundingBox();
    const sx = box.x + box.width / 2;
    const sy = box.y + box.height / 2;
    const rec = await startRec(page, "vid-drag.webm");
    await sleep(600);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 14; i++) { await page.mouse.move(sx - i * 22, sy); await sleep(45); }
    await sleep(500);
    for (let i = 14; i >= 0; i--) { await page.mouse.move(sx - i * 22, sy); await sleep(35); }
    await page.mouse.up();
    await sleep(900);
    await stopRec(rec, "Dragging the side-rail seam — the panel widens and its content reflows live");
  });

  // ---------------- MANIFEST ----------------
  fs.writeFileSync(path.join(ROOT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log("shots :", manifest.shots.length, "/ 15");
  console.log("videos:", manifest.videos.length, "/ 5");
  if (failures.length) {
    console.log("failures:");
    for (const f of failures) console.log("  -", f);
  }

  await browser.close();
})().catch((e) => {
  console.error("FATAL", e);
  try {
    fs.writeFileSync(path.join(ROOT, "manifest.json"), JSON.stringify(manifest, null, 2));
  } catch {}
  process.exit(1);
});
