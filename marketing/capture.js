#!/usr/bin/env node
/*
 * Headless screenshots of the Needt design prototype, for PH, store, landing and promo images.
 * Nothing opens on screen: Chrome runs headless and the prototype is served by a throwaway
 * static server inside this script (no python http.server, no dev server).
 *
 *   NODE_PATH=/Users/lol/Needt/.claude/nm-base/node_modules node marketing/capture.js <outDir> [scene ...]
 *   node marketing/capture.js out --list            # scene names
 *   node marketing/capture.js out --theme light     # light theme (default: dark)
 *   node marketing/capture.js out --scale 1         # deviceScaleFactor (default 2)
 *   node marketing/capture.js out --width 390 --height 844   # phone-sized viewport
 *
 * Env:
 *   NEEDT_PROTO  prototype root (default: "<repo>/Needt - Design : App, Landing"; it is not in git)
 *
 * Traps this script already handles (06.11.26, PH gallery):
 * - Dark theme is set through localStorage "needt.theme" before the page loads. `?theme=dark` renders a blank page.
 * - The Agents prototype (final.html) opens on "Connect your agents"; Continue x4 reaches the app with Map/Chat tabs.
 * - Hiding a banner by its text must climb only to a card-sized box. Climbing further hides a whole column or
 *   the page, because the same text also sits inside a 900px container. See hideCard().
 */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");

const REPO = path.resolve(__dirname, "..");
const PROTO = process.env.NEEDT_PROTO || path.join(REPO, "Needt - Design : App, Landing");

const SCENES = {
  // app.html (the planner)
  "d-today": { page: "needt-app/app.html", hide: ["Let Needt plan your day", "Try Pro free for 14 days"], waitText: "Let Needt plan your day" },
  "d-cal": { page: "needt-app/app.html", nav: "Calendar", hide: ["Try Pro free for 14 days"] },
  "d-docs": { page: "needt-app/app.html", nav: "Docs", hide: ["Try Pro free for 14 days"] },
  "d-doc": { page: "needt-app/app.html", nav: "Docs", open: "Launch brief — September", hide: ["Try Pro free for 14 days"] },
  "d-conn": { page: "needt-app/app.html", nav: "Connections", hide: ["Try Pro free for 14 days"] },
  // agents-variants/final.html (Needt Agents)
  "a-0": { page: "needt-app/additions-4/agents-variants/final.html" },
  "a-map": { page: "needt-app/additions-4/agents-variants/final.html", agents: "Map", hide: ["Reconnect ChatGPT"], settle: 2500 },
  "a-chat": { page: "needt-app/additions-4/agents-variants/final.html", agents: "Chat" },
  "a-chat-approve": { page: "needt-app/additions-4/agents-variants/final.html", agents: "Chat", ask: "Plan my week around the launch", settle: 6000 },
};

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > -1 ? process.argv[i + 1] : def;
}

function serve(root) {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".json": "application/json", ".mp4": "video/mp4", ".webm": "video/webm" };
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]);
    const file = path.join(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}

// Hide the card that holds `text`. Returns "hidden", "absent" or "too-big".
// It climbs from the text node while the parent is shorter than `maxParent` px.
async function hideCard(p, text, maxParent = 160) {
  return p.evaluate(([text, maxParent]) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let t, seen = false;
    while ((t = w.nextNode())) {
      if (!t.textContent.includes(text)) continue;
      seen = true;
      let e = t.parentElement;
      while (e && e.parentElement && e.parentElement.getBoundingClientRect().height < maxParent) e = e.parentElement;
      if (e && e.getBoundingClientRect().height < maxParent) { e.style.visibility = "hidden"; return "hidden"; }
    }
    return seen ? "too-big" : "absent";
  }, [text, maxParent]);
}

async function enterAgents(p) {
  for (let i = 0; i < 4; i++) {
    const bt = p.getByRole("button", { name: /^Continue/ }).last();
    if (!(await bt.count())) break;
    await bt.click({ force: true }).catch(() => {});
    await p.waitForTimeout(1200);
  }
}

async function shoot(ctx, base, name, s, out) {
  const p = await ctx.newPage();
  await p.goto(base + s.page, { waitUntil: "networkidle" });
  if (s.waitText) await p.getByText(s.waitText).first().waitFor({ timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1200);
  if (s.nav) await p.getByText(s.nav, { exact: true }).first().click({ timeout: 4000 }).catch(() => console.warn(name, "no nav", s.nav));
  if (s.open) { await p.waitForTimeout(1200); await p.getByText(s.open).nth(1).click().catch(() => console.warn(name, "no doc", s.open)); }
  if (s.agents) {
    await enterAgents(p);
    await p.getByRole("button", { name: new RegExp("^" + s.agents) }).first().click({ force: true }).catch(() => console.warn(name, "no tab", s.agents));
  }
  if (s.ask) {
    await p.waitForTimeout(1000);
    const box = p.getByPlaceholder(/Ask Needt/).first();
    await box.fill(s.ask).catch(() => console.warn(name, "no chat box"));
    await box.press("Enter").catch(() => {});
  }
  await p.waitForTimeout(s.settle || 1500);
  // "absent" is fine (the banner is not on every screen); "too-big" means the text sits only in a large box.
  for (const t of s.hide || []) if ((await hideCard(p, t)) === "too-big") console.warn(name, "not hidden (box too big):", t);
  await p.waitForTimeout(300);
  const file = path.join(out, name + ".png");
  await p.screenshot({ path: file });
  await p.close();
  console.log("ok", file);
}

(async () => {
  const out = process.argv[2];
  if (process.argv.includes("--list")) { console.log(Object.keys(SCENES).join("\n")); return; }
  if (!out || out.startsWith("--")) { console.error("usage: node marketing/capture.js <outDir> [scene ...] [--theme dark|light] [--scale 2] [--width 1440 --height 900]"); process.exit(2); }
  if (!fs.existsSync(PROTO)) { console.error("prototype not found:", PROTO, "(set NEEDT_PROTO)"); process.exit(2); }
  const flags = new Set(["--theme", "--scale", "--width", "--height"]);
  const names = process.argv.slice(3).filter((a, i, all) => !a.startsWith("--") && !flags.has(all[i - 1]));
  const pick = names.length ? names : Object.keys(SCENES);
  for (const n of pick) if (!SCENES[n]) { console.error("unknown scene:", n); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });

  const theme = arg("theme", "dark");
  const srv = await serve(path.resolve(PROTO));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  const b = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const ctx = await b.newContext({ viewport: { width: +arg("width", 1440), height: +arg("height", 900) }, deviceScaleFactor: +arg("scale", 2) });
    await ctx.addInitScript((t) => { try { localStorage.setItem("needt.theme", t); } catch (e) {} }, theme);
    for (const n of pick) await shoot(ctx, base, n, SCENES[n], out);
  } finally {
    await b.close();
    srv.close();
  }
})();
