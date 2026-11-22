// One shot of /admin at 1440 wide (tall enough for the whole page: the app scrolls inside its shell), light theme, signed in with a
// session cookie file ("name=value", as .github/workflows/design-shots.yml
// writes it).
//
//   node docs/proposals/admin-overview/shoot.mjs <host> <cookie.txt> <out.png> [path]
import { chromium } from "@playwright/test";
import fs from "node:fs";

const [host, cookieFile, out, route = "/admin"] = process.argv.slice(2);
const [name, ...rest] = fs.readFileSync(cookieFile, "utf8").trim().split("=");
const domain = new URL(host).hostname;

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "en-US",
    timezoneId: "Europe/Zurich",
  });
  await ctx.addCookies([
    {
      name,
      value: rest.join("="),
      domain,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await ctx.newPage();
  page.on("pageerror", (error) => console.log("pageerror", error.message));
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      console.log("console.error", m.text().slice(0, 300))
  );
  await page.goto(host + route, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page
    .waitForLoadState("networkidle", { timeout: 30_000 })
    .catch(() => {});
  await page
    .waitForSelector("[data-admin-stat='Users']", { timeout: 90_000 })
    .catch(() => console.log("WARN overview never rendered; shooting anyway"));
  // Decline the analytics banner so it does not cover the page.
  await page
    .getByRole("button", { name: "Decline" })
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  if (page.url().includes("/auth/"))
    throw new Error("signed out: " + page.url());
  await page.screenshot({ path: out, fullPage: true });
  console.log("shot", out, page.url());
} finally {
  await browser.close();
}
