const fs = require("fs");
const { open, BASE } = require("./lib.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const { browser, page } = await open({ dsf: 3, cpu: 4 });
  await page.goto(`${BASE}/style/p12?screen=home`, { waitUntil: "load", timeout: 240000 });
  if (process.env.INJECT) await page.addStyleTag({ content: fs.readFileSync("/home/user/wt-p12/src/styles/v3-overrides/phone-perf.css", "utf8") });
  await sleep(3500);
  const r = await page.evaluate(() => {
    const time = (label, fn) => { const t0 = performance.now(); fn(); void document.documentElement.offsetHeight; const t1 = performance.now(); return [label, +(t1 - t0).toFixed(1)]; };
    const nva = document.querySelector(".nva"); const host = document.querySelector("[data-v2p-host]");
    const out = [];
    for (let i = 0; i < 2; i++) {
      out.push(time("host +data-nva-moving", () => host.setAttribute("data-nva-moving", "")));
      out.push(time("host -data-nva-moving", () => host.removeAttribute("data-nva-moving")));
      out.push(time("nva +data-moving", () => nva.setAttribute("data-moving", "")));
      out.push(time("nva -data-moving", () => nva.removeAttribute("data-moving")));
      out.push(time("nva +both", () => { nva.setAttribute("data-moving", ""); host.setAttribute("data-nva-moving", ""); }));
      out.push(time("nva -both", () => { nva.removeAttribute("data-moving"); host.removeAttribute("data-nva-moving"); }));
      out.push(time("host +inert", () => host.setAttribute("inert", "")));
      out.push(time("host -inert", () => host.removeAttribute("inert")));
    }
    out.push(["elements", document.querySelectorAll("*").length]);
    return out;
  });
  console.log(process.env.INJECT ? "AFTER" : "BEFORE", JSON.stringify(r));
  await browser.close();
})();
