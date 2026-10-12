const fs = require("fs");
const { open, BASE } = require("./lib.js");
const SCAN = require("./scan.js");
const OUT = process.env.OUT || "/tmp/claude-0/-home-user-needt/57ffecbd-c4d6-51b7-910d-b2d13653f220/scratchpad/p12/results";
const TAG = process.env.TAG || "run";
const MODE = process.env.MODE || "both"; // count | perf | both
const CPU = Number(process.env.CPU || 4);
const KILL = process.env.KILL === "1"; // delete the phone-perf rules (before)
const THEME = process.env.THEME || "light";
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ov = (fn, arg) => (p) => p.evaluate(fn, arg);
const SCEN = {
  "menu-open": { base: "home", start: (p) => p.click("[data-nva-open]"), end: (p) => p.keyboard.press("Escape"), dur: 900 },
  "menu-close": { base: "home", pre: async (p) => { await p.click("[data-nva-open]"); await sleep(1500); }, start: (p) => p.keyboard.press("Escape"), dur: 900 },
  "menu-drag": { base: "home", drag: { from: [195, 785], to: [195, 250], steps: 24 }, dur: 600 },
  "composer": { base: "home", start: ov(() => window.__ui.getState().setComposerOpen(true)), end: ov(() => window.__ui.getState().setComposerOpen(false)), dur: 900 },
  "ask": { base: "home", start: ov(() => window.__ui.getState().setAskOpen(true)), end: ov(() => window.__ui.getState().setAskOpen(false)), dur: 900 },
  "task-sheet": { base: "tasks", start: ov(() => window.__ov.getState().openTask("t1")), end: ov(() => window.__ov.getState().closeTask()), dur: 900 },
  "paywall": { base: "home", start: ov(() => window.__ov.getState().openPaywall("Accent colours")), end: ov(() => window.__ov.getState().closePaywall()), dur: 900 },
  "settings": { base: "home", start: ov(() => window.__ui.getState().openSettings()), end: ov(() => window.__ui.getState().closeSettings()), dur: 900 },
  "pull-down": { base: "home", drag: { from: [195, 120], to: [195, 420], steps: 22 }, dur: 500 },
  "reader-slide": { base: "doc", drag: { from: [6, 400], to: [330, 400], steps: 20 }, dur: 400 },
  "scroll-tasks": { base: "tasks", pre: async (p) => { await p.getByText("All", { exact: true }).first().click(); await sleep(800); }, scroll: true, dur: 1500 },
  "scroll-home": { base: "home", scroll: true, dur: 1200 },
};

const SAMPLER = `
window.__frames = [];
window.__run = false;
window.__startFrames = () => { window.__frames = []; window.__run = true; const f = (t) => { if (!window.__run) return; window.__frames.push(t); requestAnimationFrame(f); }; requestAnimationFrame(f); };
window.__stopFrames = () => { window.__run = false; return window.__frames; };
window.__samples = [];
window.__sampleAt = (times) => { window.__samples = []; const t0 = performance.now(); for (const t of times) setTimeout(() => { const r = window.__scan(); window.__samples.push({ t: Math.round(performance.now() - t0), eff: r.backdrops.filter(b => b.eff).map(b => b.el + " " + b.bf), allBackdrops: r.backdrops.length, anims: r.animations.length, animInf: r.animations.filter(a => a.iterations === "Infinity").length, moving: [...document.querySelectorAll("[data-moving],[data-pk-moving],[data-nva-moving]")].map(e => e.className.toString().split(" ")[0]) }); }, t); };
`;

async function prep(page, sc) {
  await page.goto(`${BASE}/style/p12?screen=${sc.base}`, { waitUntil: "load", timeout: 240000 });
  await page.evaluate(SCAN);
  await page.evaluate(SAMPLER);
  if (process.env.INJECT) await page.addStyleTag({ content: fs.readFileSync("/home/user/wt-p12/src/styles/v3-overrides/phone-perf.css", "utf8") });
  if (process.env.EXTRA_CSS) await page.addStyleTag({ content: fs.readFileSync(process.env.EXTRA_CSS, "utf8") });
  if (KILL) {
    await page.evaluate(() => {
      let n = 0;
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        let s = -1, e = -1;
        for (let i = 0; i < rules.length; i++) {
          const t = rules[i].selectorText || "";
          if (t.includes("p12-start")) s = i;
          if (t.includes("p12-end")) e = i;
        }
        if (s >= 0 && e > s) { for (let i = e; i >= s; i--) { sheet.deleteRule(i); n++; } }
      }
      window.__killed = n;
    });
  }
  await sleep(3500);
  if (sc.pre) await sc.pre(page);
}

async function act(page, sc, phase) {
  // phase: "go" → start; "back" → end
  if (sc.drag) {
    const { from, to, steps } = sc.drag;
    await page.mouse.move(from[0], from[1]);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
      await sleep(16);
    }
    return;
  }
  if (sc.scroll) {
    await page.mouse.move(195, 400);
    for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 90); await sleep(16); }
    return;
  }
  await (phase === "go" ? sc.start(page) : sc.end(page));
}

async function run() {
  const results = {};
  for (const [name, sc] of Object.entries(SCEN)) {
    if (only && !only.includes(name)) continue;
    const r = { name };
    for (const phase of ["go", "back"]) {
      if (phase === "back" && !sc.end) continue;
      const label = phase === "go" ? name : name + ":back";
      if (MODE !== "perf") {
        // count run, no throttle
        const { browser, page, cdp } = await open({ theme: THEME, dsf: 3 });
        await prep(page, sc);
        if (phase === "back") { await act(page, sc, "go"); await sleep(1800); }
        await page.evaluate((t) => window.__sampleAt(t), [30, 90, 150, 220, 300, 400, 550, 750]);
        await act(page, sc, phase);
        await sleep(sc.dur + 800);
        if (sc.drag) { await page.mouse.up(); await sleep(900); }
        const samples = await page.evaluate(() => window.__samples);
        const killed = await page.evaluate(() => window.__killed);
        r[phase + "_samples"] = samples;
        r.killed = killed;
        await browser.close();
      }
      if (MODE !== "count") {
        const { browser, page, cdp } = await open({ theme: THEME, dsf: 3, cpu: CPU });
        await prep(page, sc);
        if (phase === "back") { await act(page, sc, "go"); await sleep(2200); }
        const events = [];
        cdp.on("Tracing.dataCollected", (d) => events.push(...d.value));
        const done = new Promise((res) => cdp.once("Tracing.tracingComplete", res));
        await cdp.send("Tracing.start", { traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "cc", "viz"], excludedCategories: ["-*"] }, transferMode: "ReportEvents" });
        await page.evaluate(() => window.__startFrames());
        const t0 = Date.now();
        await act(page, sc, phase);
        await sleep(sc.dur + 300);
        if (sc.drag) { await page.mouse.up(); await sleep(900); }
        const frames = await page.evaluate(() => window.__stopFrames());
        await cdp.send("Tracing.end");
        await done;
        // frame stats on the window of the action
        const dts = frames.slice(1).map((t, i) => t - frames[i]);
        const total = frames.length ? frames[frames.length - 1] - frames[0] : 0;
        const sorted = [...dts].sort((a, b) => a - b);
        const cnt = {};
        for (const e of events) {
          if (e.ph === "X" || e.ph === "B" || e.ph === "I") cnt[e.name] = (cnt[e.name] || 0) + 1;
        }
        const pick = ["FireAnimationFrame", "Layout", "UpdateLayoutTree", "Paint", "PrePaint", "Commit", "UpdateLayer", "UpdateLayerTree", "CompositeLayers", "RasterTask", "FunctionCall", "TimerFire", "EventDispatch", "ScheduleStyleRecalculation", "InvalidateLayout", "HitTest", "Layerize"];
        const c = {};
        for (const k of pick) c[k] = cnt[k] || 0;
        // layout dirty objects
        const dur = {};
        for (const e of events) if (e.ph === "X" && e.dur) dur[e.name] = (dur[e.name] || 0) + e.dur / 1000;
        const durPick = {};
        for (const k of ["FireAnimationFrame", "UpdateLayoutTree", "Layout", "PrePaint", "Paint", "Commit", "UpdateLayer", "RasterTask", "FunctionCall", "EventDispatch", "HitTest", "IntersectionObserverController::computeIntersections", "ResizeObserverController::deliverObservations"]) durPick[k] = +(dur[k] || 0).toFixed(1);
        let layoutObjs = 0;
        for (const e of events) if (e.name === "Layout" && e.args && e.args.beginData) layoutObjs += e.args.beginData.dirtyObjects || 0;
        r[phase + "_perf"] = {
          cpu: CPU,
          frames: frames.length,
          ms: Math.round(total),
          fps: total ? +((frames.length - 1) / (total / 1000)).toFixed(1) : 0,
          dtMean: dts.length ? +(dts.reduce((a, b) => a + b, 0) / dts.length).toFixed(1) : 0,
          dtP95: sorted.length ? +sorted[Math.floor(sorted.length * 0.95)].toFixed(1) : 0,
          dtMax: sorted.length ? +sorted[sorted.length - 1].toFixed(1) : 0,
          over20: dts.filter((d) => d > 20).length,
          over34: dts.filter((d) => d > 34).length,
          events: c,
          layoutObjs,
          durMs: durPick,
        };
        await browser.close();
      }
    }
    results[name] = r;
    process.stdout.write(`${name} done\n`);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/motion-${TAG}-${THEME}.json`, JSON.stringify(results, null, 1));
}
run().catch((e) => { console.error(e); process.exit(1); });
