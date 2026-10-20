/* Edge debug: what Safari sees at the top and bottom edges of the screen.
   Loaded only when the URL has ?edgedebug. Tap the panel to hide/show it,
   "Copy" puts the report on the clipboard. */
(() => {
  if (window.__edgeDebug) return;
  window.__edgeDebug = true;

  /* ?autoscroll[=px]: no panel; scroll down one step every 3 s, then back up,
     so a simulator can screenshot Safari's bars at each position. */
  const auto = /[?&]autoscroll(?:=(\d+))?/.exec(location.search);
  if (auto) {
    const step = Number(auto[1] || 600);
    let dir = 1;
    setTimeout(function tick() {
      const max = document.documentElement.scrollHeight - innerHeight;
      if (dir > 0 && scrollY >= max - 2) dir = -1;
      else if (dir < 0 && scrollY <= 2) return;
      window.scrollBy(0, dir * step);
      setTimeout(tick, 3000);
    }, 4000);
    return;
  }

  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.documentElement.appendChild(probe);

  const panel = document.createElement("div");
  panel.setAttribute("data-edge-debug", "");
  panel.style.cssText =
    "position:fixed;left:8px;right:8px;top:30%;max-height:45%;overflow:auto;z-index:2147483647;" +
    "background:rgba(0,0,0,.82);color:#9f9;font:10px/1.35 ui-monospace,Menlo,monospace;" +
    "padding:8px;border-radius:10px;white-space:pre-wrap;word-break:break-all;-webkit-user-select:text;user-select:text";
  const btn = document.createElement("button");
  btn.textContent = "Copy";
  btn.style.cssText =
    "position:sticky;top:0;float:right;font:12px system-ui;padding:4px 10px;border-radius:8px;border:0;background:#9f9;color:#000";
  const text = document.createElement("div");
  panel.append(btn, text);
  document.documentElement.appendChild(panel);

  let hidden = false;
  text.addEventListener("click", () => {
    hidden = !hidden;
    panel.style.opacity = hidden ? "0.08" : "1";
  });

  const desc = (el) => {
    if (!el || el === panel || panel.contains(el)) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    let name = el.tagName.toLowerCase();
    if (el.id) name += "#" + el.id;
    if (typeof el.className === "string" && el.className.trim())
      name += "." + el.className.trim().split(/\s+/).slice(0, 3).join(".");
    return `${name} pos=${cs.position} bg=${cs.backgroundColor}${cs.backgroundImage !== "none" ? " img" : ""} op=${cs.opacity} z=${cs.zIndex} rect=${Math.round(r.top)}..${Math.round(r.bottom)}`;
  };

  const stack = (y) => {
    const x = Math.round(innerWidth / 2);
    return document
      .elementsFromPoint(x, y)
      .map(desc)
      .filter(Boolean)
      .slice(0, 5)
      .map((s) => "    " + s)
      .join("\n");
  };

  const edgeElems = () => {
    const out = [];
    const h = innerHeight;
    for (const el of document.querySelectorAll("body *")) {
      if (el === panel || panel.contains(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width < innerWidth * 0.5 || r.height < 1) continue;
      const atTop = r.top <= 2 && r.bottom > 0;
      const atBottom = r.bottom >= h - 2 && r.top < h;
      if (atTop || atBottom) out.push(`  ${atTop ? "TOP" : ""}${atBottom ? "BOT" : ""} ${desc(el)}`);
    }
    return out.slice(0, 12).join("\n") || "  none";
  };

  const report = () => {
    const ps = getComputedStyle(probe);
    const vv = window.visualViewport;
    const metas = [...document.querySelectorAll('meta[name="theme-color"],meta[name="color-scheme"],meta[name="viewport"],meta[name="apple-mobile-web-app-status-bar-style"]')]
      .map((m) => `  ${m.name}${m.media ? " [" + m.media + "]" : ""} = ${m.content}`)
      .join("\n");
    const h = innerHeight;
    return [
      `url ${location.pathname}  scrollY=${Math.round(scrollY)}/${document.documentElement.scrollHeight}`,
      `ua ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, "")}`,
      `standalone=${navigator.standalone === true} dpr=${devicePixelRatio} screen=${screen.width}x${screen.height}`,
      `inner=${innerWidth}x${h} client=${document.documentElement.clientWidth}x${document.documentElement.clientHeight} vv=${vv ? Math.round(vv.width) + "x" + Math.round(vv.height) + " offTop=" + Math.round(vv.offsetTop) : "-"}`,
      `safe-area top=${ps.paddingTop} bottom=${ps.paddingBottom}`,
      `prefers dark=${matchMedia("(prefers-color-scheme: dark)").matches}`,
      `html class="${document.documentElement.className}" bg=${getComputedStyle(document.documentElement).backgroundColor} scheme=${getComputedStyle(document.documentElement).colorScheme} overflow=${getComputedStyle(document.documentElement).overflowY}`,
      `body bg=${getComputedStyle(document.body).backgroundColor} overflow=${getComputedStyle(document.body).overflowY} pos=${getComputedStyle(document.body).position}`,
      `metas:\n${metas}`,
      `fixed/sticky at edges:\n${edgeElems()}`,
      `at y=0:\n${stack(0)}`,
      `at y=2:\n${stack(2)}`,
      `at y=${h - 1}:\n${stack(h - 1)}`,
      `at y=${h - 40}:\n${stack(h - 40)}`,
    ].join("\n");
  };

  let last = "";
  const tick = () => {
    last = report();
    text.textContent = last;
  };
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(last);
      btn.textContent = "Copied";
    } catch {
      const ta = document.createElement("textarea");
      ta.value = last;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      btn.textContent = "Copied";
    }
    setTimeout(() => (btn.textContent = "Copy"), 1500);
  });
  addEventListener("scroll", () => requestAnimationFrame(tick), { passive: true });
  addEventListener("resize", tick);
  setInterval(tick, 1000);
  tick();
})();
