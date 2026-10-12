const fs = require("fs");
const { open, BASE } = require("./lib.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const scen = process.argv[2] || "menu-open";
  const { browser, page, cdp } = await open({ dsf: 3, cpu: 4 });
  await page.goto(`${BASE}/style/p12?screen=home`, { waitUntil: "load", timeout: 240000 });
  if (process.env.INJECT) await page.addStyleTag({ content: fs.readFileSync("/home/user/wt-p12/src/styles/v3-overrides/phone-perf.css", "utf8") });
  await sleep(3500);
  const events = [];
  cdp.on("Tracing.dataCollected", (d) => events.push(...d.value));
  const done = new Promise((res) => cdp.once("Tracing.tracingComplete", res));
  await cdp.send("Tracing.start", { traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.invalidationTracking"], excludedCategories: ["-*"] }, transferMode: "ReportEvents" });
  await page.click("[data-nva-open]");
  await sleep(1500);
  await cdp.send("Tracing.end"); await done;
  const ult = events.filter((e) => e.name === "UpdateLayoutTree" && e.ph === "X").map((e) => ({ ts: e.ts, ms: +(e.dur / 1000).toFixed(1), n: e.args && e.args.elementCount })).sort((a, b) => b.ms - a.ms);
  console.log("UpdateLayoutTree count", ult.length, "sum", ult.reduce((a, b) => a + b.ms, 0).toFixed(0), "ms");
  console.log("top", JSON.stringify(ult.slice(0, 8)));
  const med = ult.map((x) => x.ms).sort((a, b) => a - b); console.log("median", med[Math.floor(med.length / 2)], "ms; sum of those <10ms:", ult.filter((x) => x.ms < 10).reduce((a, b) => a + b.ms, 0).toFixed(0));
  const inv = events.filter((e) => /StyleRecalcInvalidationTracking/.test(e.name));
  const byReason = {};
  for (const e of inv) { const k = (e.args.data.reason || "") + " | " + (e.args.data.extraData || "") + " | " + (e.args.data.nodeName || ""); byReason[k] = (byReason[k] || 0) + 1; }
  console.log("invalidations", inv.length, JSON.stringify(Object.entries(byReason).sort((a, b) => b[1] - a[1]).slice(0, 12), null, 0));
  await browser.close();
})();
