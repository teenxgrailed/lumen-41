/* phone-drag.jsx — drag and drop on the phone (09.10.26, wave 3 #10).
 *
 * Long-press (350 ms, a short haptic — needtPlatform.haptic) lifts a
 * row: the row ITSELF goes up (scale 1.02, the plate shadow, a slight tilt)
 * and follows the finger; its slot stays as the gap — nothing is drawn twice.
 * The rows and section headers between home and the gap slide out of the way
 * (transform only), so the gap travels with the finger, across sections too.
 * Release settles the row into the gap on a spring and then commits; release
 * outside the list, a cancelled touch or Esc flies it back. Near the top or
 * bottom edge the list scrolls under the finger. Reduced motion: no tilt, no
 * spring — every move is instant.
 *
 * It never fights the other gestures: before the long-press fires, moving
 * 7px gives the touch back (vertical = native scroll, horizontal = the row's
 * swipe); once a row is lifted, the swipe, the pull-down and the scroll
 * stand down (their move events stop here).
 *
 *   const dz = usePtkDrag(…)  (phone-tasks.jsx: the hook, on pdAttach —
 *   { canLift(id) → bool, onDrop(r) }; the unused window.usePdDrag is gone)
 *   <div ref={dz.ref}> … zones … </div>
 *
 *   A zone is an element with data-pd-zone="<key>" holding a PkSection:
 *     data-pd-mode="move"     rows may be reordered here and dropped in
 *                 "reorder"   rows of this zone reorder; nothing comes in
 *                 "none"      locked (Overdue, Done): a row may only leave
 *     data-pd-folded="1"      folded: its header takes a drop (no gap)
 *   Rows are PkRow's [data-pk-row] (the task id). Headers: .pk-sec-head.
 *
 *   onDrop(r)  r = { id, from, to, after, before } — from/to zone keys,
 *              after/before the ids of the rows around the gap in the
 *              target zone (null at an end). The caller writes the data.
 *
 * Styles: styles/phone-drag.css (pd-*). Colours: --v2p-* (themes.css).
 */
const PD_HOLD = 350;
const PD_SLOP = 7;
const pdReduced = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const PD = { press: null, s: null, swallow: 0, raf: 0, scrollRaf: 0 };

/* ── the tokens a drag moves: section heads, rows, "Show more" ── */
function pdTokens(container, cr, scale) {
  return Array.prototype.slice.call(container.querySelectorAll(".pk-sec-head, [data-pk-row], .ptk-more")).map((el) => {
    const r = el.getBoundingClientRect();
    if (!r.height) return null;
    const z = el.closest("[data-pd-zone]");
    return {
      el: el, kind: el.matches("[data-pk-row]") ? "row" : el.matches(".pk-sec-head") ? "head" : "other",
      zone: z ? z.getAttribute("data-pd-zone") : null, zoneEl: z, mode: z ? z.getAttribute("data-pd-mode") || "move" : "none",
      folded: !!(z && z.getAttribute("data-pd-folded") === "1"), id: el.getAttribute("data-pk-row"),
      top: (r.top - cr.top) / scale, h: r.height / scale
    };
  }).filter(Boolean);
}

/* Every place the gap may open: after a head or a row of a zone that takes
   this row (its own zone when it reorders; a "move" zone otherwise). */
function pdCandidates(s) {
  const T = s.T, si = s.si, H = s.H, out = [];
  for (let q = 1; q <= T.length; q++) {
    const p = T[q - 1];
    if (p.kind === "other" || !p.zone) continue;
    const own = p.zone === s.from;
    const home = q === si;
    if (!home) {
      if (own && s.fromMode === "none") continue;
      if (!own && p.mode !== "move") continue;
    }
    if (p.folded) {
      if (p.kind !== "head" || own) continue;
      out.push({ q: q, zone: p.zone, folded: true, head: p, anchor: p.top + p.h / 2 });
      continue;
    }
    const gapTop = home ? s.srcTop : q < si ? p.top + p.h : p.top + p.h - H;
    out.push({ q: q, zone: p.zone, home: home, gapTop: gapTop, anchor: gapTop + H / 2,
      after: p.kind === "row" ? p.id : null, before: q < T.length && T[q].kind === "row" && T[q].zone === p.zone ? T[q].id : null });
  }
  if (!out.some((c) => c.home)) out.push({ q: si, zone: s.from, home: true, gapTop: s.srcTop, anchor: s.srcTop + H / 2, after: null, before: null });
  return out;
}

function pdShift(s, cand) {
  const q = cand && !cand.folded ? cand.q : s.si;
  s.T.forEach((t, k) => {
    let dy = 0;
    if (q > s.si && k >= s.si && k < q) dy = -s.H;
    if (q < s.si && k >= q && k < s.si) dy = s.H;
    if (dy) { t.el.setAttribute("data-pd-shift", ""); t.el.style.transform = "translate3d(0," + dy.toFixed(1) + "px,0)"; }
    else if (t.el.hasAttribute("data-pd-shift")) t.el.style.transform = "translate3d(0,0,0)";
  });
}

function pdOver(s, cand) {
  const head = cand && cand.zone !== s.from ? s.T.filter((t) => t.kind === "head" && t.zone === cand.zone)[0] : null;
  const el = head ? head.el : null;
  if (s.overEl === el) return;
  if (s.overEl) s.overEl.removeAttribute("data-pd-over");
  s.overEl = el;
  if (el) el.setAttribute("data-pd-over", "");
}

/* ── one frame of the finger ── */
function pdFrame(s) {
  const p = s.p;
  const dx = (p.x - s.x0) / s.scale, dy = (p.y - s.y0) / s.scale;
  s.lean = s.calm ? 0 : Math.max(-3, Math.min(3, s.lean * 0.75 + (p.x - s.lastX) * 0.3));
  s.lastX = p.x;
  s.layer.style.transform = "translate3d(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px,0)";
  s.card.style.setProperty("--pd-lean", (s.calm ? 0 : -1 + s.lean).toFixed(2) + "deg");
  const sc = s.scroller.getBoundingClientRect();
  s.out = p.x < sc.left - 8 || p.x > sc.right + 8 || p.y < sc.top || p.y > sc.bottom;
  const cr = s.container.getBoundingClientRect();
  const cy = (s.srcClientTop + (p.y - s.y0) - cr.top) / s.scale + s.H / 2;
  let best = null;
  if (!s.out) s.cands.forEach((c) => { const d = Math.abs(c.anchor - cy); if (!best || d < best.d) best = { c: c, d: d }; });
  const cand = best ? best.c : s.cands.filter((c) => c.home)[0];
  if (cand !== s.cand) { s.cand = cand; pdShift(s, cand); pdOver(s, s.out ? null : cand); }
  s.layer.classList.toggle("is-out", !!s.out);
}

function pdAutoScroll() {
  const s = PD.s; if (!s) { PD.scrollRaf = 0; return; }
  const sc = s.scroller, r = sc.getBoundingClientRect(), y = s.p.y;
  const TOP = 116, BOTTOM = 140;
  let v = 0;
  if (y < r.top + TOP) v = -Math.min(1, (r.top + TOP - y) / TOP) * 12;
  else if (y > r.bottom - BOTTOM) v = Math.min(1, (y - (r.bottom - BOTTOM)) / BOTTOM) * 12;
  if (v) {
    const before = sc.scrollTop;
    sc.scrollTop = before + v;
    if (sc.scrollTop !== before) pdFrame(s);
  }
  PD.scrollRaf = window.requestAnimationFrame(pdAutoScroll);
}

/* ── press → lift ── */
function pdCancelPress() {
  const P = PD.press; if (!P) return;
  PD.press = null;
  window.clearTimeout(P.timer);
  P.rowEl.removeAttribute("data-pd-press");
}

function pdLift() {
  const P = PD.press; if (!P) return;
  PD.press = null;
  P.rowEl.removeAttribute("data-pd-press");
  const rowEl = P.rowEl, container = P.container;
  if (!rowEl.isConnected) return;
  const screen = container.closest(".pk-screen") || container.parentElement;
  const scroller = container.closest(".pk-scroll") || container.parentElement;
  const sr = screen.getBoundingClientRect(), cr = container.getBoundingClientRect(), rr = rowEl.getBoundingClientRect();
  const scale = screen.offsetWidth ? sr.width / screen.offsetWidth : 1;
  const tokens = pdTokens(container, cr, scale);
  const srcI = tokens.findIndex((t) => t.el === rowEl);
  if (srcI < 0) return;
  window.needtPlatform.haptic("medium");
  try { window.getSelection().removeAllRanges(); } catch (e) { /* none */ }
  const src = tokens[srcI];
  const calm = pdReduced();
  const layer = document.createElement("div");
  layer.className = "pd-lift";
  layer.setAttribute("aria-hidden", "true");
  layer.style.left = ((rr.left - sr.left) / scale).toFixed(1) + "px";
  layer.style.top = ((rr.top - sr.top) / scale).toFixed(1) + "px";
  layer.style.width = (rr.width / scale).toFixed(1) + "px";
  const card = document.createElement("div");
  card.className = "pd-lift-card";
  const clone = rowEl.cloneNode(true);
  clone.removeAttribute("data-pk-row"); clone.removeAttribute("data-pd-press");
  Array.prototype.forEach.call(clone.querySelectorAll("[id]"), (n) => n.removeAttribute("id"));
  card.appendChild(clone);
  layer.appendChild(card);
  screen.appendChild(layer);
  rowEl.setAttribute("data-pd-slot", "");
  document.documentElement.classList.add("is-pd-drag");
  const s = {
    id: P.id, from: src.zone, fromMode: src.mode, container: container, screen: screen, scroller: scroller, scale: scale, calm: calm,
    layer: layer, card: card, rowEl: rowEl, x0: P.x0, y0: P.y0, p: { x: P.x, y: P.y }, lastX: P.x, lean: 0,
    srcClientTop: rr.top, srcTop: src.top, H: src.h, r0: { left: (rr.left - sr.left) / scale, top: (rr.top - sr.top) / scale },
    T: tokens.filter((t) => t !== src), si: srcI, cand: null, overEl: null, get: P.get, pid: P.pid
  };
  s.cands = pdCandidates(s);
  PD.s = s;
  pdFrame(s);
  window.requestAnimationFrame(() => { if (PD.s === s) card.classList.add("is-up"); });
  if (!PD.scrollRaf) PD.scrollRaf = window.requestAnimationFrame(pdAutoScroll);
}

/* ── release ── */
function pdCleanup(s) {
  if (s.overEl) s.overEl.removeAttribute("data-pd-over");
  s.T.forEach((t) => { if (t.el.hasAttribute("data-pd-shift")) { t.el.removeAttribute("data-pd-shift"); t.el.style.transform = ""; } });
  s.rowEl.removeAttribute("data-pd-slot");
  if (s.layer.parentNode) s.layer.parentNode.removeChild(s.layer);
  if (!PD.s) document.documentElement.classList.remove("is-pd-drag");
}

function pdFly(s, dx, dy, done, fade) {
  if (s.calm) { done(); return; }
  s.layer.classList.add("is-settling");
  if (fade) s.layer.classList.add("is-fading");
  s.card.classList.remove("is-up");
  s.card.style.setProperty("--pd-lean", "0deg");
  s.layer.style.transform = "translate3d(" + dx.toFixed(1) + "px," + dy.toFixed(1) + "px,0)";
  let fired = false;
  const fin = () => { if (fired) return; fired = true; done(); };
  s.layer.addEventListener("transitionend", (e) => { if (e.target === s.layer && e.propertyName === "transform") fin(); });
  window.setTimeout(fin, 460);
}

/* After the write the list re-renders. If the row is not exactly where the
   gap was (a sorted list keeps its sort), it travels there from the gap. */
function pdSettle(container, id, fromClientTop) {
  if (pdReduced()) return;
  const el = Array.prototype.filter.call(container.querySelectorAll("[data-pk-row]"), (n) => n.getAttribute("data-pk-row") === String(id))[0];
  if (!el) return;
  const r = el.getBoundingClientRect();
  const dy = fromClientTop - r.top;
  if (Math.abs(dy) < 2) return;
  el.style.transition = "none";
  el.style.transform = "translate3d(0," + dy.toFixed(1) + "px,0)";
  el.getBoundingClientRect();
  el.setAttribute("data-pd-flip", "");
  el.style.transition = "";
  el.style.transform = "";
  window.setTimeout(() => el.removeAttribute("data-pd-flip"), 420);
}

function pdEnd(commit) {
  const s = PD.s; if (!s) return;
  PD.s = null;
  PD.swallow = performance.now() + 400;
  if (PD.scrollRaf) { window.cancelAnimationFrame(PD.scrollRaf); PD.scrollRaf = 0; }
  const cand = commit && !s.out ? s.cand : null;
  if (!cand || cand.home) {
    /* back home (a miss, Esc, a drop where it started) */
    if (s.cand && !s.cand.home) pdShift(s, null);
    pdOver(s, null);
    pdFly(s, 0, 0, () => pdCleanup(s));
    return;
  }
  const r = { id: s.id, from: s.from, to: cand.zone, after: cand.folded ? null : cand.after, before: cand.folded ? null : cand.before, folded: !!cand.folded };
  const opts = s.get();
  const cr = s.container.getBoundingClientRect();
  if (cand.folded) {
    /* into a folded section: the row sinks into its header */
    const hy = cr.top + cand.head.top * s.scale;
    pdFly(s, 0, (hy - s.srcClientTop) / s.scale, () => { if (opts.onDrop) opts.onDrop(r); pdCleanup(s); }, true);
    return;
  }
  const landClient = cr.top + cand.gapTop * s.scale;
  pdFly(s, 0, (landClient - s.srcClientTop) / s.scale, () => {
    let done = false;
    const tidy = () => { if (done) return; done = true; mo.disconnect(); pdCleanup(s); pdSettle(s.container, s.id, landClient); };
    const mo = new MutationObserver(tidy);
    mo.observe(s.container, { childList: true, subtree: true });
    if (opts.onDrop) opts.onDrop(r);
    window.requestAnimationFrame(() => window.requestAnimationFrame(tidy));
  });
}

/* ── the global listeners: capture on window, registered at load — before
   any row's swipe or the pull-down attach theirs, so a lifted drag can stop
   their move events. ── */
(function pdListen() {
  if (window.__pdListening) return;
  window.__pdListening = true;
  const move = (e) => {
    const P = PD.press;
    if (P && e.pointerId === P.pid) {
      P.x = e.clientX; P.y = e.clientY;
      if (Math.abs(e.clientX - P.x0) > PD_SLOP || Math.abs(e.clientY - P.y0) > PD_SLOP) pdCancelPress();
      return;
    }
    const s = PD.s;
    if (!s || e.pointerId !== s.pid) return;
    e.stopImmediatePropagation();
    if (e.cancelable) e.preventDefault();
    s.p = { x: e.clientX, y: e.clientY };
    if (PD.raf) return;
    PD.raf = window.requestAnimationFrame(() => { PD.raf = 0; if (PD.s === s) pdFrame(s); });
  };
  const up = (e) => {
    if (PD.press && e.pointerId === PD.press.pid) { pdCancelPress(); return; }
    const s = PD.s;
    if (!s || e.pointerId !== s.pid) return;
    s.p = { x: e.clientX, y: e.clientY };
    pdFrame(s);
    pdEnd(true);
  };
  const cancel = (e) => {
    if (PD.press && e.pointerId === PD.press.pid) { pdCancelPress(); return; }
    if (PD.s && e.pointerId === PD.s.pid) pdEnd(false);
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
  /* lifted: the page must not scroll, and nothing below hears the move */
  window.addEventListener("touchmove", (e) => { if (PD.s) { if (e.cancelable) e.preventDefault(); e.stopPropagation(); } }, { capture: true, passive: false });
  window.addEventListener("contextmenu", (e) => { if (PD.press || PD.s) e.preventDefault(); }, true);
  window.addEventListener("selectstart", (e) => { if (PD.s) e.preventDefault(); }, true);
  window.addEventListener("click", (e) => { if (performance.now() < PD.swallow) { e.stopPropagation(); e.preventDefault(); } }, true);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && PD.s) { e.stopPropagation(); pdEnd(false); } }, true);
  window.addEventListener("blur", () => { pdCancelPress(); if (PD.s) pdEnd(false); });
})();

/* Attach to one list container; returns the detach. */
function pdAttach(container, get) {
  const down = (e) => {
    if (PD.s || PD.press || !e.isPrimary || (e.button != null && e.button > 0)) return;
    const rowEl = e.target.closest && e.target.closest("[data-pk-row]");
    if (!rowEl || !container.contains(rowEl) || !rowEl.closest("[data-pd-zone]")) return;
    if (e.target.closest(".pk-check, .pk-row-act, input, textarea, a, select")) return;
    const id = rowEl.getAttribute("data-pk-row");
    const o = get();
    if (o.canLift && !o.canLift(id)) return;
    PD.press = { pid: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, rowEl: rowEl, id: id, container: container, get: get, timer: window.setTimeout(pdLift, PD_HOLD) };
    rowEl.setAttribute("data-pd-press", "");
  };
  container.addEventListener("pointerdown", down);
  return () => {
    container.removeEventListener("pointerdown", down);
    if (PD.press && PD.press.container === container) pdCancelPress();
    if (PD.s && PD.s.container === container) { const s = PD.s; PD.s = null; pdCleanup(s); }
  };
}

Object.assign(window, { pdAttach, PD_HOLD });
