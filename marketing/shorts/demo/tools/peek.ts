import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import { signInAs } from "../../../../tests/helpers/v3-user";
// usage: peek.ts <user.json> <outdir> <path...>   (phone viewport screenshots)
(async () => {
  const [uf, out, ...paths] = process.argv.slice(2);
  mkdirSync(out, { recursive: true });
  const u = JSON.parse(readFileSync(uf, "utf8"));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: "light", baseURL: "http://localhost:3480" });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const shot = async (f: string) => { const r: any = await cdp.send("Page.captureScreenshot", { format: "png" }); require("fs").writeFileSync(f, Buffer.from(r.data, "base64")); };
  await signInAs(page as any, u);
  for (const p of paths) {
    if (p === "SCHEDULE") { const r = await page.request.post("/api/tasks/schedule-all"); console.log("schedule", r.status(), (await r.text()).slice(0, 300)); continue; }
    await page.goto(p, { waitUntil: "networkidle", timeout: 240000 }).catch(e => console.log("goto", p, String(e).slice(0, 100)));
    await page.waitForTimeout(+(process.env.WAIT||12000));
    const name = p.replace(/\W+/g, "_");
    await shot(`${out}/${name}.png`);
    console.log("shot", p);
  }
  await b.close();
})();
