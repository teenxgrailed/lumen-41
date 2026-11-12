import { chromium } from "playwright";
import { readdirSync } from "fs";
(async () => {
  const dir = process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 1 });
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".html"))) {
    await p.goto("file://" + dir + "/" + f);
    await p.waitForSelector("body[data-ready]");
    await p.waitForTimeout(300);
    await p.screenshot({ path: dir + "/out/" + f.replace(".html", ".png") });
  }
  await b.close();
})();
