// Injected into the page: window.__scan() -> { animations, backdrops, willChange }
module.exports = `
(() => {
  const desc = (el) => {
    if (!el || !el.tagName) return String(el);
    let s = el.tagName.toLowerCase();
    if (el.id) s += "#" + el.id;
    const c = typeof el.className === "string" ? el.className.trim().split(/\\s+/).slice(0, 4).join(".") : "";
    if (c) s += "." + c;
    for (const a of ["data-pk","data-nva","data-v2p","data-nva-pill","data-v2p-host"]) if (el.hasAttribute && el.hasAttribute(a)) s += "[" + a + "]";
    return s;
  };
  const chainDesc = (el) => { const out = []; let n = el; for (let i = 0; i < 3 && n && n.tagName; i++, n = n.parentElement) out.push(desc(n)); return out.join(" < "); };
  const effective = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false;
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      if (parseFloat(cs.opacity) === 0) return false;
      n = n.parentElement;
    }
    return true;
  };

  const LAYOUT = /^(width|height|min-width|min-height|max-width|max-height|top|left|right|bottom|inset.*|margin.*|padding.*|grid-template.*|border-radius|border-width|border|font-size|flex.*|gap|letter-spacing|line-height|all)$/;
  window.__extra = () => {
    const layoutTransitions = [];
    const fonts14 = [];
    const root = document.querySelector(".needt-v3") || document.body;
    for (const el of root.querySelectorAll("*")) {
      if (el.closest(".tsqd-parent-container, nextjs-portal")) continue;
      const cs = getComputedStyle(el);
      const tp = cs.transitionProperty.split(",").map((s) => s.trim());
      const td = cs.transitionDuration.split(",").map((s) => parseFloat(s));
      for (let i = 0; i < tp.length; i++) {
        const dur = td[i % td.length];
        if (dur > 0 && LAYOUT.test(tp[i])) layoutTransitions.push({ el: chainDesc(el), prop: tp[i], dur });
      }
      if (cs.fontSize === "14px") {
        let own = "";
        for (const n of el.childNodes) if (n.nodeType === 3) own += n.textContent;
        own = own.trim();
        if (own) fonts14.push({ el: chainDesc(el), text: own.slice(0, 30) });
      }
    }
    const de = document.documentElement;
    return { layoutTransitions, fonts14, hscroll: de.scrollWidth > innerWidth, sw: de.scrollWidth, iw: innerWidth };
  };
  window.__scan = () => {
    const animations = document.getAnimations().map((a) => {
      const t = a.effect && a.effect.target;
      const timing = a.effect ? a.effect.getComputedTiming() : {};
      return {
        kind: a.constructor.name,
        name: a.animationName || a.transitionProperty || a.id || "",
        target: chainDesc(t),
        playState: a.playState,
        iterations: String(timing.iterations),
        duration: timing.duration,
      };
    });
    const backdrops = [];
    const willChange = [];
    const ancestors = [];
    for (const el of document.querySelectorAll("*")) {
      if (el.closest(".tsqd-parent-container, nextjs-portal")) continue;
      const cs = getComputedStyle(el);
      const bf = cs.backdropFilter && cs.backdropFilter !== "none" ? cs.backdropFilter : (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== "none" ? cs.webkitBackdropFilter : null);
      if (bf) {
        const eff = effective(el);
        // does an ancestor carry opacity<1 / filter / mask / clip-path (breaks or multiplies the blur)
        const bad = [];
        for (let n = el.parentElement; n && n.nodeType === 1; n = n.parentElement) {
          const a = getComputedStyle(n);
          if (parseFloat(a.opacity) < 1) bad.push("opacity " + a.opacity + " " + desc(n));
          if (a.filter !== "none") bad.push("filter " + desc(n));
          if (a.maskImage && a.maskImage !== "none") bad.push("mask " + desc(n));
          if (a.clipPath !== "none") bad.push("clip-path " + desc(n));
          if (a.backdropFilter && a.backdropFilter !== "none") bad.push("nested-backdrop " + desc(n));
        }
        backdrops.push({ el: chainDesc(el), bf, eff, bad });
      }
      if (cs.willChange && cs.willChange !== "auto") willChange.push({ el: chainDesc(el), wc: cs.willChange });
    }
    return { animations, backdrops, willChange };
  };
})();
`;
