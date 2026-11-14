import { chromium } from "playwright";
import { readFileSync } from "fs";
// Renders the app icon SVG to a 220px PNG with rounded corners (end card).
(async () => {
  const svg = readFileSync(process.argv[2], "utf8");
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 220, height: 220 } });
  await p.setContent(`<html><body style="margin:0;background:transparent"><div style="width:220px;height:220px;border-radius:50px;overflow:hidden">${svg.replace("<svg ", '<svg style="width:220px;height:220px;display:block" ')}</div></body></html>`);
  await p.screenshot({ path: process.argv[3], omitBackground: true });
  await b.close();
})();
