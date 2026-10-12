const fs = require("fs");
const { open, BASE } = require("./lib.js");
const SCREENS = (process.env.ONLY || "home,tasks,docs,mail,connections,signin,setup").split(",");
(async () => {
  const out = {};
  for (const s of SCREENS) {
    const { browser, page, cdp } = await open({ dsf: 3 });
    let last = null;
    cdp.on("LayerTree.layerTreeDidChange", (e) => { last = e.layers; });
    await cdp.send("DOM.enable"); await cdp.send("LayerTree.enable");
    await page.goto(`${BASE}/style/p12?screen=${s}`, { waitUntil: "load", timeout: 240000 });
    if (process.env.INJECT) await page.addStyleTag({ content: fs.readFileSync("/home/user/wt-p12/src/styles/v3-overrides/phone-perf.css", "utf8") });
    await page.waitForTimeout(3800);
    await page.mouse.move(100, 100); await page.waitForTimeout(500);
    const L = (last || []).filter((l) => l.drawsContent);
    const area = L.reduce((a, l) => a + l.width * l.height, 0);
    out[s] = { layers: (last || []).length, drawing: L.length, cssMpx: +(area / 1e6).toFixed(2), devMpx: +((area * 9) / 1e6).toFixed(1) };
    await browser.close();
  }
  console.log(JSON.stringify(out));
})();
