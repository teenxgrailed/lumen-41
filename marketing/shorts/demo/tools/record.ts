import { chromium, type Page } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { signInAs } from "../../../../tests/helpers/v3-user";
/*
 * Records one demo scene of the phone app in real time.
 * usage: record.ts <user.json> <outdir> <scene: spread|compose>
 * Viewport 414x736 CSS px at DPR 1080/414 → 1080x1920 frames (9:16).
 * Frames come from the CDP screencast with their timestamps (frames.txt).
 * No cursor; taps show a soft ring so the viewer sees where the thumb went.
 */
const W = 414, H = 736, DPR = 1080 / 414;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitText(page: Page, text: string, ms = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await page.evaluate((s) => document.body.innerText.includes(s), text))) return;
    await sleep(1000);
  }
  throw new Error("timeout waiting for " + text);
}

(async () => {
  const [uf, out, scene] = process.argv.slice(2);
  mkdirSync(out, { recursive: true });
  const u = JSON.parse(readFileSync(uf, "utf8"));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, baseURL: "http://localhost:3480", timezoneId: "Europe/Zurich", locale: "en-US" });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const css = `nextjs-portal{display:none!important}*{cursor:none!important}
      .demo-tap{position:fixed;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:rgba(255,255,255,.35);border:2px solid rgba(255,255,255,.8);pointer-events:none;z-index:2147483647;transform:scale(.6);opacity:1;transition:transform .45s ease-out,opacity .45s ease-out}`;
    document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); });
    (window as any).__tap = (x: number, y: number) => { const d = document.createElement("div"); d.className = "demo-tap"; d.style.left = x + "px"; d.style.top = y + "px"; document.body.appendChild(d); requestAnimationFrame(() => requestAnimationFrame(() => { d.style.transform = "scale(1.4)"; d.style.opacity = "0"; })); setTimeout(() => d.remove(), 700); };
  });
  await signInAs(page as any, u);
  const tap = async (loc: ReturnType<Page["locator"]>) => {
    const bx = (await loc.boundingBox())!;
    const x = bx.x + bx.width / 2, y = bx.y + bx.height / 2;
    console.log("tap at", x, y, await page.evaluate(([x, y]) => { (window as any).__tap?.(x, y); return typeof (window as any).__tap; }, [x, y]));
    await sleep(120);
    await page.touchscreen.tap(x, y);
  };

  // Warm the screen first (dev server compiles routes on first hit).
  const path = scene === "upcoming" ? "/tasks" : "/today";
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 240000 });
  await waitText(page, process.env.WAITFOR || (scene === "spread" ? "Spread" : scene === "upcoming" ? "Upcoming" : "Today"));
  await sleep(4000);

  const cdp = await ctx.newCDPSession(page);
  const lines: string[] = [];
  let n = 0;
  cdp.on("Page.screencastFrame", async (f: any) => {
    const name = `f${String(n++).padStart(5, "0")}.jpg`;
    writeFileSync(`${out}/${name}`, Buffer.from(f.data, "base64"));
    lines.push(`${name} ${f.metadata.timestamp}`);
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  const mark = (label: string) => lines.push(`# ${label} ${Date.now() / 1000}`);

  if (scene === "spread") {
    await sleep(2500); mark("tap");
    await tap(page.getByRole("button", { name: "Spread", exact: true }).first());
    await sleep(+(process.env.AFTER || 6500));
    await page.mouse.wheel(0, 0);
  } else if (scene === "upcoming") {
    await sleep(1200); mark("tap");
    await tap(page.getByRole("button", { name: /^Upcoming/ }).or(page.getByRole("tab", { name: /^Upcoming/ })).first());
    await sleep(+(process.env.AFTER || 5000));
  } else if (scene === "compose") {
    await sleep(1500); mark("plus");
    await tap(page.getByRole("button", { name: /new task|add|create/i }).last());
    await sleep(1200); mark("type");
    await page.keyboard.type(process.env.LINE || "call mom tomorrow at 6pm for 20 min #Personal", { delay: 75 });
    await sleep(1800); mark("enter");
    await tap(page.getByRole("button", { name: /^Add$/ }).last());
    await sleep(+(process.env.AFTER || 5000));
  }
  await cdp.send("Page.stopScreencast");
  await sleep(500);
  writeFileSync(`${out}/frames.txt`, lines.join("\n") + "\n");
  console.log("frames", n);
  await b.close();
})();
