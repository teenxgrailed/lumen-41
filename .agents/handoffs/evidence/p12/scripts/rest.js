const fs = require("fs");
const { open, BASE, unmatched } = require("./lib.js");
const SCAN = require("./scan.js");
const TAG = process.env.TAG || "run";
const OUT = process.env.OUT || "/tmp/claude-0/-home-user-needt/57ffecbd-c4d6-51b7-910d-b2d13653f220/scratchpad/p12/results";
const SHOTS = process.env.SHOTS || "/home/user/wt-p12/.agents/handoffs/evidence/p12";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
const themes = (process.env.THEMES || "light,dark").split(",");
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const SHOT = process.env.NOSHOT ? false : true;

const SCREENS = ["home", "calendar", "tasks", "projects", "project", "docs", "doc", "mail", "habits", "moodboards", "moodboard", "connections", "templates", "shared", "trash", "setup", "signin"];
const wait = (page, ms) => page.waitForTimeout(ms);

// states: name -> [baseScreen, openFn(page), closeFn(page)]
const STATES = {
  menu: ["home", (p) => p.click("[data-nva-open]"), (p) => p.keyboard.press("Escape")],
  month: ["calendar", async (p) => { await p.getByText("Month", { exact: true }).first().click(); }, async (p) => { await p.getByText("Schedule", { exact: true }).first().click(); }],
  mailreader: ["mail", async (p) => { await p.locator(".pml-view").nth(1).click(); await p.waitForTimeout(800); await p.locator("[data-pk-row]").first().click(); }, (p) => p.keyboard.press("Escape")],
  composer: ["home", (p) => p.evaluate(() => window.__ui.getState().setComposerOpen(true)), (p) => p.evaluate(() => window.__ui.getState().setComposerOpen(false))],
  ask: ["home", (p) => p.evaluate(() => window.__ui.getState().setAskOpen(true)), (p) => p.evaluate(() => window.__ui.getState().setAskOpen(false))],
  settings: ["home", (p) => p.evaluate(() => window.__ui.getState().openSettings()), (p) => p.evaluate(() => window.__ui.getState().closeSettings())],
  task: ["tasks", (p) => p.evaluate(() => window.__ov.getState().openTask("t1")), (p) => p.evaluate(() => window.__ov.getState().closeTask())],
  paywall: ["home", (p) => p.evaluate(() => window.__ov.getState().openPaywall("Accent colours")), (p) => p.evaluate(() => window.__ov.getState().closePaywall())],
  event: ["calendar", (p) => p.evaluate(() => window.__ov.getState().openEvent({ title: "Design review", meta: "Today", facts: [["Time", "14:00 – 15:00"], ["Length", "1 h"], ["Calendar", "Work"]] })), (p) => p.evaluate(() => window.__ov.getState().closeEvent())],
  newEvent: ["calendar", (p) => p.evaluate(() => { const d = new Date(); const s = (h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); const z = (n) => String(n).padStart(2, "0"); return `${x.getFullYear()}-${z(x.getMonth() + 1)}-${z(x.getDate())}T${z(h)}:00`; }; window.__ov.getState().openNewEvent({ startAt: s(16), endAt: s(17) }); }), (p) => p.evaluate(() => window.__ov.getState().closeNewEvent())],
};

async function load(page, screen) {
  await page.goto(`${BASE}/style/p12?screen=${screen}`, { waitUntil: "load", timeout: 240000 });
  await page.evaluate(SCAN);
  if (process.env.INJECT) await page.addStyleTag({ content: fs.readFileSync("/home/user/wt-p12/src/styles/v3-overrides/phone-perf.css", "utf8") });
  await wait(page, 3600);
}
const slim = (r) => ({
  animations: r.animations,
  extra: r.extra,
  backdrops: r.backdrops.map((b) => ({ el: b.el, bf: b.bf, eff: b.eff, bad: b.bad })),
  effectiveBackdrops: r.backdrops.filter((b) => b.eff).length,
  allBackdrops: r.backdrops.length,
  willChange: r.willChange,
});

(async () => {
  for (const theme of themes) {
    const { browser, page, errors } = await open({ theme, dsf: 3 });
    const res = {};
    const list = [...SCREENS.map((s) => ["screen", s]), ...Object.keys(STATES).map((s) => ["state", s])];
    for (const [kind, name] of list) {
      if (only && !only.includes(name)) continue;
      try {
        if (kind === "screen") {
          await load(page, name);
          { const sc = await page.evaluate(() => window.__scan()); sc.extra = await page.evaluate(() => window.__extra()); res[name] = slim(sc); }
          if (SHOT) await page.screenshot({ path: `${SHOTS}/${name}-${theme}.png`, scale: "css" });
        } else {
          const [base, openFn, closeFn] = STATES[name];
          await load(page, base);
          await openFn(page);
          await wait(page, 1800);
          { const sc = await page.evaluate(() => window.__scan()); sc.extra = await page.evaluate(() => window.__extra()); res[name + ":open"] = slim(sc); }
          if (SHOT) await page.screenshot({ path: `${SHOTS}/${name}-${theme}.png`, scale: "css" });
          await closeFn(page);
          await wait(page, 3600);
          { const sc = await page.evaluate(() => window.__scan()); sc.extra = await page.evaluate(() => window.__extra()); res[name + ":closed"] = slim(sc); }
        }
      } catch (e) {
        res[name] = { error: String(e).slice(0, 300) };
      }
      process.stdout.write(`${theme} ${name} done\n`);
    }
    res.__errors = errors.slice(0, 20);
    fs.writeFileSync(`${OUT}/rest-${TAG}-${theme}.json`, JSON.stringify(res, null, 1));
    await browser.close();
  }
  console.log("unmatched", [...unmatched]);
})();
