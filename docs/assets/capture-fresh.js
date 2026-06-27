// CAPSULE — fresh launch media capture against the RUNNING app at :3010.
// Global puppeteer + ffmpeg (page.screencast). Real data: CAP-R001..R008, 7 skills.
// Try/catch per shot; manifest lists only files that exist.

const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");

// Make ffmpeg reachable for page.screencast (AutoPod build is on PATH already,
// but prepend its dir defensively).
const FF_DIR = "C:\\Program Files (x86)\\Common Files\\AutoPod\\ffmpeg\\bin";
if (fs.existsSync(FF_DIR)) process.env.PATH = FF_DIR + path.delimiter + process.env.PATH;

const APP = "http://localhost:3010";
const ROOT = "C:\\Users\\deepc\\capsule\\assets";
const SHOTS = path.join(ROOT, "shots");
const VIDEO = path.join(ROOT, "video");
for (const d of [SHOTS, VIDEO]) fs.mkdirSync(d, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const manifest = { shots: [], videos: [] };

async function main() {
  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
    args: ["--no-sandbox", "--force-color-profile=srgb", "--allow-file-access-from-files"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  await page.goto(APP, { waitUntil: "networkidle2", timeout: 60000 });
  await sleep(1200);

  /* ----------------------------- helpers ----------------------------- */
  const shot = async (file, caption, fn) => {
    try {
      if (fn) await fn();
      await sleep(450);
      const full = path.join(SHOTS, file);
      await page.screenshot({ path: full });
      manifest.shots.push({ file, caption });
      console.log("  ok  shot", file);
    } catch (e) {
      console.log("  FAIL shot", file, "-", String(e).split("\n")[0]);
    }
  };

  const video = async (file, caption, fn) => {
    const full = path.join(VIDEO, file);
    let rec;
    try {
      rec = await page.screencast({ path: full });
      await fn();
      await rec.stop();
      rec = null;
      manifest.videos.push({ file, caption });
      console.log("  ok  video", file);
    } catch (e) {
      console.log("  FAIL video", file, "-", String(e).split("\n")[0]);
      try { if (rec) await rec.stop(); } catch {}
      try { if (fs.existsSync(full) && fs.statSync(full).size < 1000) fs.unlinkSync(full); } catch {}
    }
  };

  const clickSel = async (sel) => { await page.waitForSelector(sel, { visible: true }); await page.click(sel); };

  // Click the first <button> whose visible text contains `text` (optionally within scope sel).
  const clickText = async (text, scope) => {
    const ok = await page.evaluate((t, sc) => {
      const root = sc ? document.querySelector(sc) : document;
      if (!root) return false;
      const els = [...root.querySelectorAll("button")];
      const el = els.find((b) => (b.textContent || "").replace(/\s+/g, " ").trim().includes(t));
      if (!el) return false;
      el.click();
      return true;
    }, text, scope || null);
    if (!ok) throw new Error("clickText not found: " + text);
  };

  // Open a side panel via the document-editor toolbar icon (aria-label).
  const openPanel = async (aria) => {
    // close any existing panel first so the toggle reliably opens the target
    const open = await page.$('[aria-label="Close panel"]');
    if (open) { await page.keyboard.press("Escape"); await sleep(350); }
    await clickSel(`button[aria-label="${aria}"]`);
    await sleep(700);
  };

  const closePanel = async () => {
    const open = await page.$('[aria-label="Close panel"]');
    if (open) { await page.keyboard.press("Escape"); await sleep(400); }
  };

  // Set a role=switch toggle to a desired checked state.
  const setSwitch = async (sel, want) => {
    await page.waitForSelector(sel, { visible: true });
    const cur = await page.$eval(sel, (el) => el.getAttribute("aria-checked") === "true");
    if (cur !== want) { await page.click(sel); await sleep(350); }
  };

  const SEL = {
    agentic: 'button[role="switch"][title^="Agentic"]',
    capsule: 'button[role="switch"][title="Inject the latest capsule context"]',
    enterprise: 'button[role="switch"][aria-label="Toggle enterprise skill set"]',
    composer: 'textarea[aria-label="Message the agent"]',
    captureBtn: "aside button",
  };

  // Click the sidebar "Capture this session" action button.
  const openCapture = async () => {
    await closePanel();
    await clickText("Capture this session");
    await sleep(800);
  };

  // Pick the first real session row inside the open capture panel.
  const pickSession = async () => {
    const ok = await page.evaluate(() => {
      const els = [...document.querySelectorAll("button")];
      const el = els.find((b) => /KB ·/.test(b.textContent || ""));
      if (!el) return false;
      el.click();
      return true;
    });
    if (!ok) throw new Error("no session row");
  };

  /* ============================ SHOTS ============================ */
  console.log("SHOTS");

  // 01 workspace home
  await closePanel();
  await setSwitch(SEL.agentic, false).catch(() => {});
  await shot("01-workspace-home.png", "CAPSULE workspace — split sidebar with scrollable Capsules (CAP-R001..R008) and the super-saiyan Capture button.");

  // 02 Knowledge Graph panel
  await shot("02-knowledge-graph.png", "Knowledge Graph Explorer — the contained force graph of requirements → capsules → skills → Backboard memory.", async () => {
    await openPanel("Knowledge Graph");
    await sleep(1600); // let the sim settle
  });

  // 03 graph node -> provenance (click a sidebar capsule → selects its node)
  await shot("03-graph-node-provenance.png", "A capsule node selected — its provenance trace (finding, routed-to skill, technique to learn).", async () => {
    const ok = await page.evaluate(() => {
      const els = [...document.querySelectorAll('aside button[title="Opens in the Knowledge Graph"]')];
      if (!els.length) return false;
      els[0].click();
      return true;
    });
    if (!ok) throw new Error("no capsule row");
    await sleep(1500);
  });

  // 04 Skills — Enterprise OFF
  await shot("04-skills-enterprise-off.png", "Skills panel — Enterprise OFF: project-pinned versions, condensed cards with fluorescent action buttons.", async () => {
    await openPanel("Skills");
    await setSwitch(SEL.enterprise, false);
    await sleep(400);
  });

  // 05 Skills — Enterprise ON
  await shot("05-skills-enterprise-on.png", "Skills panel — Enterprise ON (blue): capsule-maxxed best versions with the upgrade deltas lit.", async () => {
    await setSwitch(SEL.enterprise, true);
    await sleep(500);
  });

  // 06 Version History
  await shot("06-version-history.png", "Version History — day-grouped semver versions of a skill; every accepted finding mints a new version.", async () => {
    await openPanel("Versions");
    await sleep(600);
  });

  // 07 Versions Compare
  await shot("07-versions-compare.png", "Versions Compare — two versions ticked drop into a word-level diff of changelog + guidance.", async () => {
    await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('input[type="checkbox"]')];
      boxes.slice(0, 2).forEach((b) => b.click());
    });
    await sleep(700);
  });

  // 08 A/B Trials (measured)
  await shot("08-ab-trials.png", "A/B Trials — Capsule vs Cold: measured tokens, steps and pass/fail per task; capsuled runs win.", async () => {
    await openPanel("A/B Trials");
    await sleep(600);
  });

  // 09 Capture MANUAL
  await shot("09-capture-manual.png", "Capture — MANUAL mode: pick a real ~/.claude session to distill on-device into a Handoff Capsule.", async () => {
    await closePanel();
    await setSwitch(SEL.agentic, false);
    await openCapture();
    await sleep(1200); // sessions load
  });

  // 10 Capture AGENTIC gate
  await shot("10-capture-agentic-gate.png", "Capture — AGENTIC mode: auto-distill + the keep/skip gate (transfer ≥ threshold OR novelty ≥ 80).", async () => {
    await closePanel();
    await setSwitch(SEL.agentic, true);
    await openCapture();
    await sleep(1200);
  });

  // 11 composer Capsule toggle ON (yellow aura) + agentic matching
  await shot("11-composer-capsule-aura.png", "Composer with Capsule injected ON (yellow aura) and the matching Agentic toggle — both the shared super-saiyan ON state.", async () => {
    await closePanel();
    await setSwitch(SEL.agentic, true);
    await setSwitch(SEL.capsule, true);
    await sleep(600);
  });

  // 12 read-only doc
  await shot("12-doc-read-only.png", "Document set to Read only — the formatting toolbar dims and the surface goes inert for review.", async () => {
    await closePanel();
    const ok = await page.evaluate(() => {
      const grp = document.querySelector('[aria-label="Document mode"]');
      if (!grp) return false;
      const btn = [...grp.querySelectorAll("button")].find((b) => (b.title || "").startsWith("Read only"));
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!ok) throw new Error("no read-only segment");
    await sleep(500);
  });

  // 13 @-mention
  await shot("13-at-mention.png", "@-mention in the composer — type @ to mention a requirement; the popover filters the requirement list live.", async () => {
    // restore editing first so the composer is the focus
    await page.evaluate(() => {
      const grp = document.querySelector('[aria-label="Document mode"]');
      const btn = grp && [...grp.querySelectorAll("button")].find((b) => (b.title || "").startsWith("Editing"));
      btn && btn.click();
    });
    await sleep(300);
    await clickSel(SEL.composer);
    await page.type(SEL.composer, "@", { delay: 60 });
    await sleep(700);
  });

  // 14 panel dragged wide (content fills width)
  await shot("14-panel-wide.png", "Side panel dragged wide — the graph + cards fluidly fill the extra width (resize separator, up to 680px).", async () => {
    // clear composer
    await page.evaluate((sel) => { const t = document.querySelector(sel); if (t) { t.value = ""; t.dispatchEvent(new Event("input", { bubbles: true })); } }, SEL.composer);
    await openPanel("Knowledge Graph");
    await sleep(800);
    const h = await page.$('[role="separator"][aria-label="Resize panel"]');
    if (!h) throw new Error("no resize separator");
    const box = await h.boundingBox();
    const y = box.y + box.height / 2;
    const x = box.x + box.width / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    // panel grows to the LEFT → move pointer left to widen toward PANEL_MAX (680)
    for (let i = 1; i <= 12; i++) { await page.mouse.move(x - i * 28, y); await sleep(20); }
    await page.mouse.up();
    await sleep(1500); // let graph re-settle into the wider column
  });

  // 15 Handoff panel — warm-start card + cold-vs-warm result (HERO content)
  await shot("15-handoff-result.png", "Handoff & warm start — the 'You inherit' briefing plus the measured cold-vs-warm result from running both agents.", async () => {
    await openPanel("Handoff");
    await sleep(800);
    await clickText("Run handoff demo");
    // wait up to ~45s for the cold-vs-warm contrast to render
    let got = false;
    for (let i = 0; i < 45; i++) {
      got = await page.evaluate(() => /Same question · both agents/i.test(document.body.innerText));
      if (got) break;
      await sleep(1000);
    }
    await sleep(600);
    // scroll the panel body so the result is in frame
    await page.evaluate(() => {
      const panes = [...document.querySelectorAll(".overflow-y-auto")];
      const p = panes.find((el) => /Same question|You inherit/i.test(el.innerText));
      if (p) p.scrollTop = p.scrollHeight * 0.45;
    });
    await sleep(500);
  });

  /* ============================ VIDEOS ============================ */
  console.log("VIDEOS");

  // vid-handoff (hero): result already rendered above → reveal warm-card → contrast
  await video("vid-handoff.webm", "Hero — Handoff warm start: the 'You inherit' briefing, then the measured cold-vs-warm result of running both agents.", async () => {
    // ensure handoff panel + a rendered result
    const hasResult = await page.evaluate(() => /Same question · both agents/i.test(document.body.innerText));
    if (!hasResult) {
      await openPanel("Handoff");
      await sleep(600);
      await clickText("Run handoff demo");
      for (let i = 0; i < 45; i++) {
        if (await page.evaluate(() => /Same question · both agents/i.test(document.body.innerText))) break;
        await sleep(1000);
      }
    }
    const scrollTo = (frac) => page.evaluate((f) => {
      const panes = [...document.querySelectorAll(".overflow-y-auto")];
      const p = panes.find((el) => /Same question|You inherit/i.test(el.innerText));
      if (p) p.scrollTo({ top: p.scrollHeight * f, behavior: "smooth" });
    }, frac);
    await scrollTo(0); await sleep(1600);     // warm-start card
    await scrollTo(0.5); await sleep(1500);   // run demo button / question
    await scrollTo(1); await sleep(2000);     // cold-vs-warm contrast
  });

  // vid-agentic: run the gate — toggle agentic, open capture, distill a session
  await video("vid-agentic.webm", "Agentic capture gate — auto-distill a real session on-device, then the keep/skip verdict against the threshold.", async () => {
    await closePanel();
    await setSwitch(SEL.agentic, true);
    await openCapture();
    await sleep(1200);
    await pickSession();              // distilling… (~5s) → gate banner
    await sleep(6500);
  });

  // vid-capsule-glow: toggle Capsule ON, aura pulses
  await video("vid-capsule-glow.webm", "Capsule context toggle — the composer's yellow super-saiyan aura blooms as the latest capsule is injected.", async () => {
    await closePanel();
    await setSwitch(SEL.capsule, false);
    await sleep(800);
    await page.click(SEL.capsule); await sleep(1400);   // ON — aura blooms
    await page.click(SEL.capsule); await sleep(1100);   // OFF
    await page.click(SEL.capsule); await sleep(1500);   // ON again
  });

  // vid-graph-play: KG Play walkthrough activating steps
  await video("vid-graph-play.webm", "Knowledge Graph Play — the RL story assembles in order: requirements → work orders → agents → sessions → capsules → skills → memory.", async () => {
    await openPanel("Knowledge Graph");
    await sleep(1200);
    await clickText("Play");
    await sleep(7000); // 7 stages settle
  });

  // vid-enterprise: toggle enterprise ON
  await video("vid-enterprise.webm", "Enterprise toggle — skill cards flip from project-pinned to the capsule-maxxed enterprise-best versions in blue.", async () => {
    await openPanel("Skills");
    await setSwitch(SEL.enterprise, false);
    await sleep(900);
    await page.click(SEL.enterprise); await sleep(1700);  // ON
    await page.click(SEL.enterprise); await sleep(1100);  // OFF
    await page.click(SEL.enterprise); await sleep(1600);  // ON
  });

  /* ================ 16 MULTI-DEV.html (file) — last (navigates away) ============ */
  await shot("16-multidev-enterprise-vs-personal.png", "MULTI-DEV doc — 'Four branches: one enterprise master, three dev personal branches' that pin enterprise skills and contribute capsules back.", async () => {
    await page.goto("file://C:/Users/deepc/capsule/MULTI-DEV.html", { waitUntil: "networkidle2", timeout: 30000 });
    await sleep(800);
    await page.evaluate(() => {
      const hs = [...document.querySelectorAll("h2,h1,p")];
      const el = hs.find((e) => /Four branches|one enterprise master/i.test(e.textContent || ""));
      if (el) el.scrollIntoView({ block: "start" });
      window.scrollBy(0, -20);
    });
    await sleep(700);
  });

  /* ----------------------------- write manifest ----------------------------- */
  fs.writeFileSync(path.join(ROOT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("manifest:", manifest.shots.length, "shots,", manifest.videos.length, "videos");

  await browser.close();
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
