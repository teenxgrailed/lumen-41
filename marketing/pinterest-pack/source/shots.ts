import { chromium, devices } from "playwright";
import { readFileSync } from "fs";
import { signInAs } from "../../../../../../../home/user/wt-map/tests/helpers/v3-user";
(async () => {
  const [S, U] = process.argv.slice(2);
  const u = JSON.parse(readFileSync(U, "utf8"));
  const b = await chromium.launch();
  const shoot0 = async (name: string, url: string, opts: any, wait = 6000, base = process.env.TEST_BASE_URL, auth = true) => {
    const ctx = await b.newContext({ ...opts, baseURL: base });
    const p = await ctx.newPage();
    await p.clock.setFixedTime(new Date("2026-11-12T10:05:00+01:00"));
    await p.addInitScript((uid) => { try { localStorage.setItem("needt:agents-onboarded", "1"); if (!location.search.includes("setup")) sessionStorage.setItem("needt.cnSetupSeen:" + uid, "skipped"); } catch {} }, u.id);
    if (auth) await signInAs(p, u);
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 240000 });
    await p.waitForTimeout(wait);
    for (let i = 0; i < 60; i++) {
      const sk = await p.evaluate(() => document.querySelectorAll('[class*="skeleton"],[class*="Skeleton"],[class*="animate-pulse"],[data-skeleton],[aria-busy="true"]').length).catch(() => 0);
      if (!sk) break;
      await p.waitForTimeout(2000);
    }
    await p.waitForTimeout(1500);
    if (!auth) { await p.getByRole("button", { name: "Decline" }).first().click({ timeout: 5000 }).catch(() => {}); await p.waitForTimeout(1200); }
    await p.mouse.move(1, 1);
    await p.screenshot({ path: `${S}/raw/${name}.png` });
    console.log("ok", name, p.url());
    await ctx.close();
  };
  const only = (process.env.ONLY || "").split(",").filter(Boolean);
  const shoot = async (n: string, ...r: any[]) => { if (only.length && !only.includes(n)) return; try { for (let k = 0; k < 4; k++) { await (shoot0 as any)(n, ...r); if (require("fs").statSync(`${S}/raw/${n}.png`).size > 60000) break; console.log("blank, retry", n); } } catch (e) { console.log("fail", n, String(e).slice(0, 200)); } };
  const desk = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
  const phone = { ...devices["iPhone 13"] };
  await shoot("land-desk", "https://needt.app/", desk, 5000, undefined, false);
  await shoot("land-phone", "https://needt.app/", phone, 5000, undefined, false);
  await shoot("today-desk", "/today", desk, 30000);
  await shoot("today-phone", "/today", phone, 12000);
  await shoot("agents-desk", "/agents?tab=agents", desk, 12000);
  await shoot("agents-phone", "/agents?tab=agents", phone, 12000);
  await shoot("connections-desk", "/connections", desk, 12000);
  await shoot("connections-phone", "/connections", phone, 12000);
  await shoot("calendar-desk", "/calendar", desk, 12000);
  await shoot("calendar-phone", "/calendar", phone, 15000);
  await shoot("setup-desk", "/connections?setup=1", desk, 12000);
  await b.close();
})();
