/* Drag and drop — one gesture for the whole product (desktop).
 *
 * A drop target is any DOM node with data-drop; nothing registers itself, so a
 * new landing place is an attribute, not a change to this file.
 *
 *   data-drop="timeline" + data-start/-hour-h/-offset → a time on a day grid
 *   data-drop="day"      + data-date                  → a date in the mini month
 *   data-drop="row"      + data-id                    → a place in a list
 *   data-drop="focus"                                 → start a session on it
 *
 * Reorder needs no attribute: a source whose list holds other sources (the
 * rows of one list) is sortable inside that list. The drop reports
 * { kind: "row", id } — the row whose place it takes — exactly what a
 * data-drop="row" target reports; a reorder inside one list adds the list as
 * it was drawn: order (the rows' data-drag-id, top to bottom), fromIx, toIx
 * — so the caller knows the rows above and below the gap (App.jsx takes the
 * time slot between them, the phone's rule).
 *
 *   data-drop="project"  + data-id (+ data-label)      → a project (Sidebar)
 *
 * Any non-timeline target under the hand gets [data-drag-over] (its
 * highlight) and, with data-label, says it in the tag ("Move to …"). A
 * timeline target may carry data-date (the column's day); its tag says the
 * snapped time.
 *
 * The gesture (09.10.26, wave 3 #10): press, move 4px, and only then is it a
 * drag — a press that does not travel stays a click. The PICKED ITEM ITSELF
 * lifts (scale 1.02, the floating shadow, a slight lean into its velocity)
 * and follows the pointer 1:1: its slot stays as an empty gap — the item is
 * never drawn twice. Inside its list the other rows slide out of the way
 * (transform only) and the gap travels with the hand; a drop settles the item
 * into the gap with a spring; a drop on a calendar slot flies it into the new
 * block. A drop on nothing, or Esc, flies it back home. Time snaps to 15
 * minutes; a scrolling grid scrolls when the hand reaches its edge.
 * Reduced motion: no lean, no spring — every move is instant.
 *
 * The lifted item is a clone of the source node inside a fixed layer (so a
 * list's overflow cannot clip it on the way to the calendar or the sidebar);
 * the source node stays mounted, hidden ([data-drag-slot]), so React keeps
 * owning it. Styles: styles/shell.css (shell-drag-*).
 */
const SNAP = 0.25;
const THRESHOLD = 4;

function snapTime(t) { return Math.round(t / SNAP) * SNAP; }
function hhmmOf(t) {
  return String(Math.floor(t)).padStart(2, "0") + ":" + String(Math.round((t % 1) * 60)).padStart(2, "0");
}
function dragCalm() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }

/* The nearest thing that scrolls under the pointer. A drag that reaches the
   edge of a scrolling grid keeps going instead of stopping at the fold. */
function scrollerAt(x, y) {
  let el = document.elementFromPoint(x, y);
  while (el && el !== document.body) {
    const st = window.getComputedStyle(el);
    if ((st.overflowY === "auto" || st.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 4) return el;
    el = el.parentElement;
  }
  return null;
}

/* The sortable list around a source: the nearest ancestor whose parent holds
   other sources too. Only vertical lists in normal flow (a calendar block is
   absolutely placed, so it moves in time, not in order). */
function dragListOf(el) {
  let cur = el;
  for (let up = 0; cur && cur.parentElement && up < 6; up++) {
    const parent = cur.parentElement;
    const kids = Array.prototype.filter.call(parent.children, (k) => k === cur || (k.matches && (k.matches("[data-drag-src]") || k.querySelector("[data-drag-src]"))));
    if (kids.length > 1) {
      const pos = window.getComputedStyle(cur).position;
      if (pos === "absolute" || pos === "fixed") return null;
      const a = kids[0].getBoundingClientRect(), b = kids[1].getBoundingClientRect();
      if (Math.abs(a.left - b.left) > 4 || b.top <= a.top) return null;
      return { slot: cur, list: parent, rows: kids };
    }
    cur = parent;
  }
  return null;
}

function targetAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const node = el && el.closest ? el.closest("[data-drop]") : null;
  if (!node) return null;
  const kind = node.getAttribute("data-drop");
  if (kind === "timeline") {
    const r = node.getBoundingClientRect();
    const hourH = parseFloat(node.getAttribute("data-hour-h")) || 46;
    const start = parseFloat(node.getAttribute("data-start")) || 0;
    const offset = parseFloat(node.getAttribute("data-offset")) || 0;
    const t = snapTime(start + (y - r.top + node.scrollTop - offset) / hourH);
    return { kind: "timeline", time: t, label: hhmmOf(t), node: node, date: node.getAttribute("data-date") };
  }
  return { kind: kind, id: node.getAttribute("data-id"), date: node.getAttribute("data-date"), label: node.getAttribute("data-label"), node: node };
}

const sameOver = (a, b) => a === b || !!(a && b && a.kind === b.kind && a.date === b.date && a.time === b.time && a.id === b.id && a.node === b.node);
const DRAG_SAYS = (o) => !o ? "" : o.kind === "timeline" || o.kind === "day" ? o.label || "" : o.kind === "focus" ? "Focus on this" : o.kind === "project" ? (o.label ? "Move to " + o.label : "") : "";

function useDrag(onDrop) {
  const [drag, setDrag] = React.useState(null);
  const armed = React.useRef(null);
  const S = React.useRef(null);          /* the live session (DOM, geometry) */
  const pending = React.useRef(0);
  const live = React.useRef(null);
  const at = React.useRef({ x: 0, y: 0 });
  const dropRef = React.useRef(onDrop);
  const swallowUntil = React.useRef(0);
  dropRef.current = onDrop;
  live.current = drag;

  /* Edge autoscroll: within 56px of a scroller's edge the grid moves under the
     hand, faster the closer the pointer is. Runs on its own frame loop so a
     pointer held still at the edge keeps scrolling. */
  React.useEffect(() => {
    if (!drag) return undefined;
    let raf = 0;
    function step() {
      const p = at.current;
      const sc = scrollerAt(p.x, p.y);
      if (sc) {
        const r = sc.getBoundingClientRect();
        const EDGE = 56;
        const down = p.y > r.bottom - EDGE ? (p.y - (r.bottom - EDGE)) / EDGE : 0;
        const up = p.y < r.top + EDGE ? (p.y - (r.top + EDGE)) / EDGE : 0;
        const v = (down || up) * 14;
        if (v) { sc.scrollTop += v; if (S.current) paint(S.current); }
      }
      raf = window.requestAnimationFrame(step);
    }
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [!!drag]);

  /* ── lift: the source node itself goes up ── */
  function lift(a, x, y) {
    const el = a.el;
    if (!el || !el.isConnected) return null;
    const sort = a.mode === "place" ? dragListOf(el) : null;
    const node = sort ? sort.slot : el;
    const r = node.getBoundingClientRect();
    const calm = dragCalm();
    const layer = document.createElement("div");
    layer.className = "shell-drag-lift";
    layer.setAttribute("aria-hidden", "true");
    layer.style.left = r.left + "px"; layer.style.top = r.top + "px"; layer.style.width = r.width + "px"; layer.style.height = r.height + "px";
    const card = document.createElement("div");
    card.className = "shell-drag-lift-card";
    const clone = node.cloneNode(true);
    clone.removeAttribute("data-drag-slot");
    [clone].concat(Array.prototype.slice.call(clone.querySelectorAll("[id],[data-drop],[data-drag-src]"))).forEach((n) => { n.removeAttribute("id"); n.removeAttribute("data-drop"); n.removeAttribute("data-drag-src"); n.removeAttribute("data-drag-id"); });
    const pos = window.getComputedStyle(node).position;
    if (pos === "absolute" || pos === "fixed") Object.assign(clone.style, { position: "relative", left: "0", top: "0", right: "auto", bottom: "auto", margin: "0", width: r.width + "px", height: r.height + "px", opacity: "1", transform: "none" });
    clone.classList.add("shell-drag-lift-node");
    card.appendChild(clone);
    const tag = document.createElement("span");
    tag.className = "shell-drag-lift-tag";
    layer.appendChild(card); layer.appendChild(tag);
    document.body.appendChild(layer);
    node.setAttribute("data-drag-slot", "");
    document.documentElement.classList.add("is-drag-active");
    const s = {
      item: a.item, mode: a.mode, node: node, layer: layer, card: card, tag: tag, calm: calm,
      r0: { left: r.left, top: r.top, width: r.width, height: r.height }, x0: a.x0, y0: a.y0, x: x, y: y, lean: 0, lastX: x,
      sort: null, j: -1, over: null, overNode: null
    };
    if (sort) {
      const lr = sort.list.getBoundingClientRect();
      const kids = Array.prototype.slice.call(sort.list.children);
      const rows = sort.rows.map((k) => {
        const kr = k.getBoundingClientRect();
        const src = k.matches("[data-drag-src]") ? k : k.querySelector("[data-drag-src]");
        return { el: k, top: kr.top - lr.top, h: kr.height, id: src ? src.getAttribute("data-drag-id") : null, at: kids.indexOf(k) };
      });
      const i = rows.findIndex((q) => q.el === node);
      const gap = rows.length > 1 ? Math.max(0, rows[1].top - rows[0].top - rows[0].h) : 0;
      s.sort = { list: sort.list, rows: rows, i: i, kids: kids, pitch: r.height + gap };
      s.j = i;
    }
    /* the lift itself: scale + shadow ease in on the next frame */
    window.requestAnimationFrame(() => { if (S.current === s) card.classList.add("is-up"); });
    return s;
  }

  /* Where the gap is: the row index whose place the item would take. */
  function sortIndex(s) {
    const q = s.sort; if (!q) return -1;
    const lr = q.list.getBoundingClientRect();
    const cx = s.x, cy = s.r0.top + (s.y - s.y0) + s.r0.height / 2;
    const inside = cx > lr.left - 32 && cx < lr.right + 32 && cy > lr.top - q.pitch / 2 && cy < lr.bottom + q.pitch / 2;
    if (!inside) return -1;
    const rel = cy - lr.top;
    let j = q.i;
    for (let k = q.i + 1; k < q.rows.length; k++) if (rel > q.rows[k].top + q.rows[k].h / 2) j = k;
    for (let k = q.i - 1; k >= 0; k--) if (rel < q.rows[k].top + q.rows[k].h / 2) j = k;
    return j;
  }
  /* Rows between home and the gap slide by one pitch (transform only); any
     other child between them (a fold, a "Show more") slides with them. */
  function shiftRows(s, j) {
    const q = s.sort; if (!q) return;
    const from = q.rows[q.i].at;
    const to = j < 0 ? from : q.rows[j].at;
    q.kids.forEach((k, idx) => {
      let dy = 0;
      if (to > from && idx > from && idx <= to) dy = -q.pitch;
      if (to < from && idx >= to && idx < from) dy = q.pitch;
      if (dy) { k.setAttribute("data-drag-shift", ""); k.style.transform = "translate3d(0," + dy + "px,0)"; }
      else if (k.hasAttribute("data-drag-shift")) k.style.transform = "translate3d(0,0,0)";
    });
  }

  function paint(s) {
    const dx = s.x - s.x0, dy = s.y - s.y0;
    s.lean = s.calm ? 0 : Math.max(-3, Math.min(3, s.lean * 0.8 + (s.x - s.lastX) * 0.25));
    s.lastX = s.x;
    s.layer.style.transform = "translate3d(" + dx + "px," + dy + "px,0)";
    s.card.style.setProperty("--drag-lean", s.lean.toFixed(2) + "deg");
  }

  function setOverNode(s, node) {
    if (s.overNode === node) return;
    if (s.overNode) s.overNode.removeAttribute("data-drag-over");
    s.overNode = node || null;
    if (node && node.getAttribute("data-drop") !== "timeline") node.setAttribute("data-drag-over", "");
  }

  /* One frame of the hand: where it is, what it is over, where the gap is. */
  function frame(s, p) {
    s.x = p.x; s.y = p.y;
    paint(s);
    let over = targetAt(p.x, p.y);
    if (over && over.kind === "row" && over.node && s.node.contains(over.node)) over = null;
    let j = -1;
    if (!over || over.kind === "row") {
      const k = sortIndex(s);
      if (k >= 0) { j = k; over = k === s.sort.i ? { kind: "home" } : { kind: "row", id: s.sort.rows[k].id, node: s.sort.list }; }
    }
    if (s.sort && j !== s.j) { s.j = j; shiftRows(s, j); }
    setOverNode(s, over && over.kind !== "row" && over.kind !== "home" ? over.node : null);
    const says = DRAG_SAYS(over);
    if (s.tag.textContent !== says) { s.tag.textContent = says; s.tag.classList.toggle("is-on", !!says); }
    s.over = over;
    return over && over.kind === "home" ? null : over;
  }

  /* Tidy up: the source comes back, the rows drop their offsets. */
  function cleanup(s) {
    if (!s) return;
    setOverNode(s, null);
    if (s.sort) s.sort.kids.forEach((k) => { if (k.hasAttribute("data-drag-shift")) { k.removeAttribute("data-drag-shift"); k.style.transform = ""; } });
    if (s.node) s.node.removeAttribute("data-drag-slot");
    if (s.layer && s.layer.parentNode) s.layer.parentNode.removeChild(s.layer);
    if (!S.current) document.documentElement.classList.remove("is-drag-active");
  }

  /* Fly the lifted card to a rect (viewport), then run done(). */
  function flyTo(s, rect, done, fade) {
    if (s.calm || !rect) { done(); return; }
    const dx = rect.left - s.r0.left, dy = rect.top - s.r0.top;
    s.layer.classList.add("is-settling");
    s.card.classList.remove("is-up");
    if (fade) s.layer.classList.add("is-fading");
    s.card.style.setProperty("--drag-lean", "0deg");
    s.layer.style.transform = "translate3d(" + dx + "px," + dy + "px,0)";
    let fired = false;
    const fin = () => { if (fired) return; fired = true; done(); };
    s.layer.addEventListener("transitionend", (e) => { if (e.target === s.layer && e.propertyName === "transform") fin(); });
    window.setTimeout(fin, 420);
  }

  /* After a drop the list re-renders; the source may sit somewhere else than
     the gap (a sorted list keeps its sort). It then travels from where the
     card was to where it really is — never a jump. */
  function settleSource(node, from) {
    if (!node || !node.isConnected || dragCalm()) return;
    const r = node.getBoundingClientRect();
    const dx = from.left - r.left, dy = from.top - r.top;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    node.style.transition = "none";
    node.style.transform = "translate3d(" + dx + "px," + dy + "px,0)";
    node.getBoundingClientRect();
    node.setAttribute("data-drag-flip", "");
    node.style.transition = "";
    node.style.transform = "";
    window.setTimeout(() => node.removeAttribute("data-drag-flip"), 400);
  }

  function end(commit, e) {
    const s = S.current;
    armed.current = null;
    if (!s) return;
    S.current = null;
    swallowUntil.current = performance.now() + 350;
    const p = e ? { x: e.clientX, y: e.clientY } : { x: s.x, y: s.y };
    const over = commit ? frame(s, p) : null;
    setDrag(null);
    const lr = s.layer.getBoundingClientRect();
    const was = { left: lr.left, top: lr.top };

    if (over && over.kind === "row" && s.sort) {
      /* Into the gap: land where the rows made room, then commit. */
      const q = s.sort, j = s.j, list = q.list.getBoundingClientRect();
      const top = list.top + (j > q.i ? q.rows[j].top + q.rows[j].h - s.r0.height : q.rows[j].top);
      flyTo(s, { left: list.left + (s.r0.left - list.left), top: top }, () => {
        const node = s.node;
        /* React reorders the list in the commit; the offsets are dropped in
           the same frame (a MutationObserver runs before paint). */
        let done = false;
        const tidy = () => { if (done) return; done = true; mo.disconnect(); cleanup(s); settleSource(node, { left: s.r0.left, top: top }); };
        const mo = new MutationObserver(tidy);
        mo.observe(q.list, { childList: true });
        dropRef.current(s.item, { kind: "row", id: over.id, node: over.node, order: q.rows.map((r) => r.id), fromIx: q.i, toIx: j }, s.mode);
        window.requestAnimationFrame(() => window.requestAnimationFrame(tidy));
      });
      return;
    }
    if (over) {
      /* A calendar slot, a day, Focus: commit, then the card flies into what
         the drop made (the new block) or quietly lands where it is. */
      dropRef.current(s.item, over, s.mode);
      const id = s.item && s.item.id != null ? String(s.item.id) : null;
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        let land = null;
        if (id && over.kind === "timeline") {
          const all = Array.prototype.slice.call(document.querySelectorAll("[data-drag-id]")).filter((n) => n.getAttribute("data-drag-id") === id && n !== s.node && !s.layer.contains(n) && over.node.contains(n));
          land = all[0] || null;
        }
        if (land) {
          const lr2 = land.getBoundingClientRect();
          land.setAttribute("data-drag-landing", "");
          flyTo(s, { left: lr2.left, top: lr2.top }, () => { land.removeAttribute("data-drag-landing"); cleanup(s); });
        } else flyTo(s, { left: was.left, top: was.top }, () => cleanup(s), true);
      }));
      return;
    }
    /* Missed (or Esc): the card travels back to where it was picked up. The
       only movement that is not a state change — the gesture being undone. */
    if (s.sort) shiftRows(s, -1);
    flyTo(s, { left: s.r0.left, top: s.r0.top }, () => cleanup(s));
  }

  React.useEffect(() => {
    function move(e) {
      at.current = { x: e.clientX, y: e.clientY };
      const a = armed.current;
      if (a && !S.current) {
        if (Math.abs(e.clientX - a.x0) + Math.abs(e.clientY - a.y0) < THRESHOLD) return;
        const s = lift(a, e.clientX, e.clientY);
        armed.current = null;
        if (!s) return;
        S.current = s;
        try { window.getSelection().removeAllRanges(); } catch (er) { /* none */ }
        const over = frame(s, { x: e.clientX, y: e.clientY });
        setDrag({ item: a.item, mode: a.mode, x: e.clientX, y: e.clientY, over: over, from: { x: a.x0, y: a.y0 } });
        return;
      }
      if (!S.current) return;
      if (e.cancelable) e.preventDefault();
      S.current.pending = { x: e.clientX, y: e.clientY };
      if (pending.current) return;
      pending.current = window.requestAnimationFrame(() => {
        pending.current = 0;
        const s = S.current;
        if (!s || !s.pending) return;
        const p = s.pending;
        const over = frame(s, p);
        setDrag((d) => {
          if (!d) return d;
          /* Nothing to publish if the frame changed nothing. */
          return d.x === p.x && d.y === p.y && sameOver(d.over, over) ? d : Object.assign({}, d, { x: p.x, y: p.y, over: over });
        });
      });
    }
    function up(e) {
      if (!S.current) { armed.current = null; return; }
      end(true, e);
    }
    function cancel() { if (S.current) end(false); armed.current = null; }
    function key(e) { if (e.key === "Escape" && (S.current || armed.current)) { e.stopPropagation(); cancel(); } }
    /* A drag is not a click on the row it started from. */
    function click(e) { if (performance.now() < swallowUntil.current) { e.stopPropagation(); e.preventDefault(); } }
    function blur() { cancel(); }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    window.addEventListener("click", click, true);
    window.addEventListener("blur", blur);
    return () => {
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("click", click, true);
      window.removeEventListener("blur", blur);
      if (S.current) { const s = S.current; S.current = null; cleanup(s); }
    };
  }, []);

  /* Spread onto any element that should be draggable. */
  function dragProps(item, mode) {
    return {
      "data-drag-src": "",
      "data-drag-id": item && item.id != null ? String(item.id) : undefined,
      onPointerDown: (e) => {
        if (e.button !== 0 || e.pointerType === "touch") return;
        if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable=true]")) return;
        armed.current = { item: item, mode: mode || "place", x0: e.clientX, y0: e.clientY, el: e.currentTarget };
      }
    };
  }
  return [drag, dragProps, null];
}

/* The lifted item lives in its own layer (see useDrag), so nothing is drawn
   here any more — kept so App's <DragGhost /> needs no change. */
function DragGhost() { return null; }

Object.assign(window, { useDrag, DragGhost, targetAt, snapTime, hhmmOf, scrollerAt, SNAP, THRESHOLD });
