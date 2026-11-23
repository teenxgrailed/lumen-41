/* Dock debug: what the dock, the page's tail and the viewport really are.
   Loaded with ?edgedebug next to edge-debug.js. Observed numbers only: every
   line is read from the page, none is worked out from an assumption.
   Scroll to the very bottom of the page first, then tap Copy. */
(() => {
  if (window.__edgeDebugDock) return;
  window.__edgeDebugDock = true;

  // The highest scrollY reached while this panel has been open.
  let maxY = 0;
  addEventListener(
    "scroll",
    () => {
      maxY = Math.max(maxY, scrollY);
    },
    { passive: true }
  );

  const panel = document.createElement("div");
  panel.setAttribute("data-edge-debug", "");
  panel.style.cssText =
    "position:fixed;left:8px;right:8px;top:4%;max-height:24%;overflow:auto;z-index:2147483647;" +
    "background:rgba(0,0,0,.82);color:#ff9;font:10px/1.35 ui-monospace,Menlo,monospace;" +
    "padding:8px;border-radius:10px;white-space:pre-wrap;word-break:break-all;-webkit-user-select:text;user-select:text";
  const btn = document.createElement("button");
  btn.textContent = "Copy";
  btn.style.cssText =
    "position:sticky;top:0;float:right;font:12px system-ui;padding:4px 10px;border-radius:8px;border:0;background:#ff9;color:#000";
  const text = document.createElement("div");
  panel.append(btn, text);
  document.documentElement.appendChild(panel);

  // A hidden box of the given CSS height, read back in px.
  const px = (h) => {
    const u = document.createElement("div");
    u.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;top:0;left:0;width:0;height:" +
      h;
    (
      document.querySelector(".needt-v3") || document.documentElement
    ).appendChild(u);
    const n = u.offsetHeight;
    u.remove();
    return n;
  };
  const rect = (sel) => {
    const els = document.querySelectorAll(sel);
    const el = els[els.length - 1];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
  };
  const fmt = (r) => (r ? r.top + ".." + r.bottom : "none");

  const report = () => {
    const root = document.documentElement;
    const sc = document.scrollingElement || root;
    const vv = window.visualViewport;
    const dock = rect(".nfb-pill");
    const tail = rect(".pk-tail");
    const fog = rect(".pk-fog");
    const inline = root.style.getPropertyValue("--v3-screen-gap");
    return [
      "mode=" +
        root.getAttribute("data-display-mode") +
        " navigator.standalone=" +
        navigator.standalone +
        " dpr=" +
        devicePixelRatio,
      "innerHeight=" +
        innerHeight +
        " screen.height=" +
        screen.height +
        " documentElement.clientHeight=" +
        root.clientHeight +
        " scrollingElement.clientHeight=" +
        sc.clientHeight,
      "visualViewport height=" +
        (vv ? Math.round(vv.height) : "-") +
        " offsetTop=" +
        (vv ? Math.round(vv.offsetTop) : "-") +
        " scale=" +
        (vv ? vv.scale : "-"),
      "units lvh=" +
        px("100lvh") +
        " dvh=" +
        px("100dvh") +
        " svh=" +
        px("100svh") +
        " vh=" +
        px("100vh"),
      "scrollY=" +
        Math.round(scrollY) +
        " maxScrollY reached=" +
        Math.round(maxY) +
        " scrollHeight=" +
        sc.scrollHeight,
      "dock .nfb-pill top..bottom=" + fmt(dock),
      "last row ends (top of .pk-tail)=" +
        (tail ? tail.top : "none") +
        "  tail=" +
        fmt(tail) +
        "  fog=" +
        fmt(fog),
      "dock top minus last row end=" +
        (dock && tail ? dock.top - tail.top : "-"),
      "--v3-screen-gap(inline)=" +
        (inline || "unset") +
        " --v3-vp-gap(used)=" +
        px("var(--v3-vp-gap, 0px)") +
        "px --v3-tail-h(used)=" +
        px("var(--v3-tail-h, 0px)") +
        "px",
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
  addEventListener("scroll", () => requestAnimationFrame(tick), {
    passive: true,
  });
  addEventListener("resize", tick);
  setInterval(tick, 1000);
  tick();
})();
