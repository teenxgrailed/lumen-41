/* CALENDAR — two views, Craft-built (06.10.26).
   Week: seven columns by the hour; placed tasks wear their project's tint
   with a rail, fixed events are grey, the red line is now.
   Hover, focus or click a block for its peek card (full title, time, actions).
   Agenda (internal value "days", 08.10.26 renamed from "Days"): a column per
   day, 3 / 5 / 7 at a time, paged with ‹ ›.
   Hide done (08.10.26): a header toggle that takes completed tasks out of
   Week and Agenda; kept in needtSettings.calHideDone. Events are never hidden.
   Drag (09.10.26, wave 3): every day column of the week / 3-day grid is a
   Drag.jsx drop target (data-drop="timeline"); a task dragged from a list
   or a task block dragged inside the grid takes the day and the time under
   the hand, snapped to 15 min (App.jsx writes it, with Undo). The Agenda
   takes drops too (09.10.26): a day column moves the task to that day and
   keeps its time; the gap between two rows gives it the time between them
   (see AGENDA DROP below). */
const C2NS = window.NeedtDesignSystem_25d3c8;
const { Icon: C2Icon } = C2NS;

const C2_DAYS = [[31, "Mon", "Aug"], [1, "Tue", "Sep"], [2, "Wed", "Sep"], [3, "Thu", "Sep"], [4, "Fri", "Sep"], [5, "Sat", "Sep"], [6, "Sun", "Sep"]];
const C2_TODAY = 1, C2_NOW = 14.33, C2_START = 7, C2_END = 21, C2_H = 52;
/* Synced events (the work Google calendar and the personal Apple one), in
   the database's Event shape: {id, title, startAt, endAt, isAllDay,
   calendarId, source, externalId}. The views draw blocks (day of month +
   decimal hour + minutes) from them through NEEDT.eventBlock. */
const c2Ev = (id, day, at, len, title, cal) => window.NEEDT.eventAt(day, at, len, { id: id, title: title, calendarId: cal || "work",
  source: cal === "personal" ? "apple" : "google", externalId: (cal === "personal" ? "icloud-" : "gcal-") + id });
const C2_EVENTS = [
  c2Ev("e1", 31, 10.5, 15, "Standup"),
  c2Ev("e2", 1, 10.5, 15, "Standup"),
  c2Ev("e3", 1, 13, 45, "Lunch with Jonas", "personal"),
  c2Ev("e4", 3, 11, 30, "1:1 Anna"),
  c2Ev("e5", 2, 16, 60, "Print atelier visit"),
  c2Ev("e6", 4, 15, 90, "Photo shoot — jackets"),
  c2Ev("e7", 5, 11, 120, "Flea market", "personal")
];
const c2Day = (t) => window.NEEDT.dueDay(t);
const c2Hue = (p) => { const x = window.cvProject ? window.cvProject(p) : null; return (x && x.color) || "var(--text-tertiary)"; };
/* Rendered extent (08.10.26): a block is drawn at least C2_MIN_H tall (+3px
   gap), so a 15-min block reaches past its real end into the next one. Layout
   works on what is drawn, not on the clock: back-to-back short blocks whose
   rects would collide share a cluster and sit side by side, Google/Craft style. */
const C2_MIN_H = 20;
const c2VEnd = (b) => b.at + Math.max(b.len / 60 * C2_H, C2_MIN_H + 3) / C2_H;
/* Overlap clusters for one day: blocks whose drawn rects touch share a cluster;
   each gets the first free column, and the cluster's width is its column count. */
const c2Lay = (list) => {
  const end = c2VEnd;
  const sorted = list.slice().sort((a, b) => a.at - b.at || end(b) - end(a));
  const out = []; let cluster = [], cEnd = -1, colEnds = [], cid = 0;
  const flush = () => { const n = colEnds.length; cluster.forEach((x) => { x.cols = n; x.cl = cid; out.push(x); }); cid++; cluster = []; colEnds = []; cEnd = -1; };
  sorted.forEach((b) => {
    if (cluster.length && b.at >= cEnd) flush();
    let col = colEnds.findIndex((e) => e <= b.at);
    if (col < 0) { col = colEnds.length; colEnds.push(end(b)); } else colEnds[col] = end(b);
    cluster.push({ b, col }); cEnd = Math.max(cEnd, end(b));
  });
  flush();
  return out;
};
/* Placement in px for one day column of width W (08.10.26: density cap).
   Lanes split side by side while each lane stays >= 72px wide; below that the
   cluster cascades the way Google / Craft do it: a block that starts later
   sits 14px further right at the full remaining width, on top. Blocks
   starting within ~20px of an overlapping one can't cascade (it would hide
   that title), so they share the space side by side — but never narrower
   than C2_SPLIT_MIN.
   Density: at most `cap` blocks overlap side by side (3 on the desktop, 2 on
   a phone). Whatever does not fit — beyond the cap, or a side-by-side share
   that would be a sliver — goes into a "+N" chip in its half-hour slot, in a
   C2_GUT gutter on the right of that cluster. The returned list carries
   `.more`: [{ key, at, n, left, width, items }] — items = every block that
   touches that half hour, hidden or not, for the slot popover. */
const C2_MINW = 72, C2_STEP = 14, C2_NEAR = 20 / C2_H, C2_SPLIT_MIN = 64, C2_GUT = 30, C2_CAP = 3;
const c2End = (b) => b.at + b.len / 60;
const c2Slot = (at) => Math.floor(at * 2) / 2;
/* One cluster at width `inner`: returns the placed blocks and the ones that did not fit. */
const c2PlaceCluster = (cl, inner, cap) => {
  /* More than `cap` deep: plain lanes only — as many as stay >= C2_MINW wide
     (never more than cap); the cascade would stack slivers here. */
  if (cl[0].cols > cap) cap = Math.max(1, Math.min(cap, Math.floor(inner / C2_MINW)));
  const hidden = cl.filter((x) => x.col >= cap && !x.b.draft);
  const vis = cl.filter((x) => x.col < cap || x.b.draft);
  const n = Math.min(cl[0].cols, cap);
  if (inner / n >= C2_MINW || cl[0].cols > n) return { placed: vis.map((x) => Object.assign(x, { off: Math.min(x.col, n - 1) * inner / n, width: inner / n - (n > 1 ? 2 : 0), z: 2 + x.col })), hidden: hidden };
  const placed = [];
  vis.forEach((x, k) => {
    const s = x.b.at, over = placed.filter((p) => c2VEnd(p.b) > s);
    x.z = 2 + k;
    if (!over.length) { x.off = 0; x.width = inner; placed.push(x); return; }
    const near = over.filter((p) => s - p.b.at < C2_NEAR);
    const p0 = near.length === 1 ? near[0] : null, xEnd = c2VEnd(x.b), pEnd = p0 ? c2VEnd(p0.b) : 0;
    if (p0 && (pEnd - xEnd) * C2_H >= 22 && !over.some((p) => p !== p0 && p.off >= p0.off)) {
      /* same start, longer one underneath: cascade on top and push the
         longer block's text below this one, so both titles stay readable */
      x.off = Math.min(p0.off + C2_STEP, inner - C2_MINW); x.width = inner - x.off; x.cascade = true;
      p0.padTop = Math.max(p0.padTop || 0, (xEnd - p0.b.at) * C2_H);
    } else if (near.length) {
      /* A chain of short back-to-back blocks (09:00, 09:15, 09:30): reuse a
         split column whose block has already ended, as long as nothing still
         running sits in it — two columns instead of a third sliver. */
      const free = placed.find((q) => q.split && over.indexOf(q) < 0 && !over.some((o) => o.off < q.off + q.width && q.off < o.off + o.width));
      if (free) { Object.assign(x, { off: free.off, width: free.width, split: true, full: free.full, base: free.base }); placed.push(x); return; }
      const grp = near.concat([x]), base = Math.min.apply(null, near.map((p) => p.off));
      const w = (inner - base) / grp.length;
      if (w < C2_SPLIT_MIN && !x.b.draft) { hidden.push(x); return; }
      grp.forEach((p, q) => { p.off = base + q * w; p.width = w - (q < grp.length - 1 ? 2 : 0); p.split = true; p.full = inner - base; p.base = base; });
    } else { x.off = Math.min(Math.max.apply(null, over.map((p) => p.off)) + C2_STEP, inner - C2_MINW); x.width = inner - x.off; x.cascade = true; }
    placed.push(x);
  });
  return { placed: placed, hidden: hidden };
};
const c2Place = (list, W, cap) => {
  const max = cap || C2_CAP;
  const laid = c2Lay(list);
  const out = [];
  out.more = [];
  if (!W) { laid.forEach((x) => { if (x.col < max || x.b.draft) out.push(Object.assign(x, { pct: true, cols: Math.min(x.cols, max), z: 2 + x.col })); }); return out; }
  const inner = W - 8;
  let i = 0;
  while (i < laid.length) {
    let j = i; while (j < laid.length && laid[j].cl === laid[i].cl) j++;
    const cl = laid.slice(i, j); i = j;
    let r = c2PlaceCluster(cl.map((x) => Object.assign({}, x)), inner, max);
    let room = inner;
    /* Anything hidden: give the cluster's chips a gutter and lay it out again. */
    if (r.hidden.length) { room = inner - C2_GUT; r = c2PlaceCluster(cl.map((x) => Object.assign({}, x)), room, max); }
    r.placed.forEach((x) => { x.left = 4 + x.off; out.push(x); });
    if (r.hidden.length) {
      const slots = {};
      r.hidden.forEach((x) => { const k = c2Slot(x.b.at); (slots[k] = slots[k] || []).push(x.b); });
      Object.keys(slots).forEach((k) => {
        const at = +k, items = list.filter((b) => !b.draft && b.at < at + 0.5 && c2End(b) > at).sort((a, b) => a.at - b.at || c2End(b) - c2End(a));
        out.more.push({ key: "more-" + slots[k][0].day + "-" + k, at: at, n: slots[k].length, left: 4 + room + 3, width: C2_GUT - 5, items: items, hidden: slots[k].map((b) => b.id) });
      });
    }
  }
  return out;
};
/* Agenda (Days) density: timed rows grouped by half hour; past `cap` rows
   in one slot the rest fold into a "+N" row that opens the slot list. */
const c2AgendaFold = (rows, cap) => {
  const out = [], seen = {};
  rows.forEach((b) => {
    if (b.at == null) { out.push({ b: b }); return; }
    const k = c2Slot(b.at), g = seen[k] || (seen[k] = { n: 0, more: null });
    g.n++;
    if (g.n <= cap) { out.push({ b: b }); return; }
    if (!g.more) { g.more = { more: true, key: "more-" + b.day + "-" + k, at: k, n: 0, items: rows.filter((x) => x.at != null && c2Slot(x.at) === k) }; out.push(g.more); }
    g.more.n++;
  });
  return out;
};
const c2Time = (h) => String(Math.floor(h)).padStart(2, "0") + ":" + String(Math.round((h % 1) * 60)).padStart(2, "0");

const c2Load = () => { try { const v = JSON.parse(localStorage.getItem("needt.events")); return Array.isArray(v) ? v.map(window.NEEDT.migrateEvent) : []; } catch (e) { return []; } };
/* User events live in a module store so other places (Mail, Today) can add to
   the calendar before it is ever opened. Stored as Event rows (source
   "needt"); old {day, at, len} records are migrated in Data.js, and add()
   still accepts that shape from callers that speak it (App's composer,
   import.jsx) — NEEDT.migrateEvent turns it into an Event. */
const c2Store = window.makeStore(c2Load());
/* Persisted through needtSync: a change from another window lands in the store. */
if (window.needtSync) window.needtSync.bind(c2Store, "needt.events", { load: (l) => (Array.isArray(l) ? l.map(window.NEEDT.migrateEvent) : []) });
c2Store.sub((l) => { window.dispatchEvent(new CustomEvent("needt-events", { detail: { count: l.length } })); });
const c2Block = (e) => window.NEEDT.eventBlock(e);
/* The user's own events (source "needt") can be deleted here; synced ones
   (google / apple / outlook, e.g. from onboarding) belong to their calendar. */
const c2Own = (e) => !e.source || e.source === "needt";
const C2_SOURCE_NAME = { needt: "Your events", google: "Google Calendar", apple: "Apple Calendar", outlook: "Outlook Calendar" };
const calEvents = {
  store: c2Store,
  list: () => c2Store.get(),
  /* Events touching [from, to) — ISO days or stamps — synced seed included. */
  inRange: (from, to) => window.NEEDT.eventsInRange(C2_EVENTS.concat(c2Store.get()), from, to),
  add: (ev) => { const e = window.NEEDT.migrateEvent(Object.assign({ title: "New event" }, ev)); c2Store.set((l) => l.concat(e)); return e; },
  patch: (id, p) => c2Store.set((l) => l.map((x) => x.id === id ? Object.assign({}, x, p) : x)),
  /* Move to a new start, keeping the length (NEEDT.moveEvent). */
  move: (id, startAt) => { const e = c2Store.get().find((x) => x.id === id); if (e) calEvents.patch(id, window.NEEDT.moveEvent(e, startAt)); return e; },
  remove: (id) => c2Store.set((l) => l.filter((x) => x.id !== id))
};
/* Next event of today that has not started yet, by the real clock mapped onto the prototype's today. */
const calNext = () => {
  const now = new Date(), h = now.getHours() + now.getMinutes() / 60;
  const all = C2_EVENTS.concat(c2Store.get()).map(c2Block).filter((e) => e.day === C2_TODAY && e.at != null && e.at > h).sort((a, b) => a.at - b.at);
  if (!all.length) return null;
  const e = all[0], at = new Date(now); at.setHours(Math.floor(e.at), Math.round((e.at % 1) * 60), 0, 0);
  return { title: e.title, at: at };
};
window.calEvents = calEvents; window.calNext = calNext;
/* First half hour today, from now on, where a 60-min event touches nothing. */
const c2FreeSlot = (blocks) => {
  const mine = blocks.filter((b) => b.day === C2_TODAY);
  for (let at = Math.ceil(C2_NOW * 2) / 2; at + 1 <= C2_END; at += 0.5) {
    if (!mine.some((b) => at < b.at + b.len / 60 && b.at < at + 1)) return at;
  }
  return Math.min(Math.ceil(C2_NOW * 2) / 2, C2_END - 1);
};

const c2PosStyle = (pos) => {
  const x = pos || {};
  if (x.pct || x.left == null) { const c = x.col || 0, n = x.cols || 1; return { left: "calc(" + c + " * (100% / " + n + ") + 4px)", width: "calc(100% / " + n + " - 8px)" }; }
  return { left: x.left, width: x.width };
};

/* The draft: an empty block where you clicked, its title typed in place.
   Enter keeps it, Esc throws it away. */
function C2Draft({ d, onSave, onCancel, pos }) {
  const [title, setTitle] = React.useState("");
  const done = React.useRef(false);
  const ref = React.useRef(null);
  React.useEffect(() => { const el = ref.current; if (!el) return; el.focus({ preventScroll: true }); el.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [d.day, d.at]);
  const finish = (keep) => { if (done.current) return; done.current = true; keep && title.trim() ? onSave(title.trim()) : onCancel(); };
  const top = (d.at - C2_START) * C2_H, h = (60 / 60) * C2_H - 3;
  return (
    <div className="nx-pop c2-draft" data-c2-block="draft" onClick={(e) => e.stopPropagation()}
      style={Object.assign({}, c2PosStyle(pos), { top: top + 1, height: h })}>
      <span aria-hidden="true" className="c2-draft-rail" />
      <input ref={ref} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New event" aria-label="Event title"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); finish(true); } if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); } }}
        onBlur={() => finish(true)}
        className="c2-draft-input" />
      <div className="c2-meta">{c2Time(d.at)}–{c2Time(d.at + 1)}</div>
    </div>
  );
}

const c2Dur = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h ? h + " h" + (m ? " " + m + " min" : "") : m + " min"; };
const c2Range = (b) => c2Time(b.at) + "–" + c2Time(b.at + b.len / 60);
/* Titles of built-in events renamed from the peek card; user events rename in their own store. */
const c2Titles = window.makeStore((() => { try { return JSON.parse(localStorage.getItem("needt.events.titles")) || {}; } catch (e) { return {}; } })());
if (window.needtSync) window.needtSync.bind(c2Titles, "needt.events.titles", { load: (m) => (m && typeof m === "object" ? m : {}) });

/* A block on the grid: this file places it (lanes, cascade, lift on hover)
   and Task (task.jsx, layout "block") draws it. */
function C2Block({ b, pos, peek, hover, dragProps }) {
  const x = pos || {};
  const [hot, setHot] = React.useState(false);
  const lit = hot || peek;
  const top = (b.at - C2_START) * C2_H, h = Math.max((b.len / 60) * C2_H - 3, C2_MIN_H);
  const place = lit && x.split ? { left: 4 + x.base, width: x.full } : x;
  return (
    <window.Task layout="block" task={b} lit={lit} selected={!!peek}
      box={{ h: h, w: x.width || 999, padTop: x.padTop || 0, tight: x.split && !lit, cascade: x.cascade }}
      className="c2-block"
      style={Object.assign({}, c2PosStyle(place), { zIndex: lit ? 40 : (x.z || 2), top: top + 1, height: h })}
      events={Object.assign({
        "data-c2-block": b.id, tabIndex: 0, role: "button", "aria-label": b.title + ", " + c2Range(b), "aria-expanded": !!peek,
        onClick: (e) => { e.stopPropagation(); hover.click(b, e.currentTarget); },
        onFocus: (e) => hover.focus(b, e.currentTarget),
        onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!b.event && hover.open) hover.open(b.id); else hover.click(b, e.currentTarget); } },
        onMouseEnter: (e) => { setHot(true); hover.enter(b, e.currentTarget); }, onMouseLeave: () => { setHot(false); hover.leave(); }
      }, !b.event && dragProps ? dragProps({ id: b.id, title: b.title }, "move") : null)} />
  );
}

/* The peek card: the block's whole story beside it, flipped to the other
   side near the window edge. */
const C2_PEEK_W = 272;
function C2Peek({ b, rect, leaving, onEnter, onLeave, onOpen, onDone, onRename, onDelete, onClose }) {
  const ref = React.useRef(null);
  const [y, setY] = React.useState(rect.top);
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(b.title);
  React.useEffect(() => { setVal(b.title); }, [b.title]);
  const right = rect.right + 8 + C2_PEEK_W <= window.innerWidth - 8;
  const left = right ? rect.right + 8 : Math.max(8, rect.left - 8 - C2_PEEK_W);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const hh = el.offsetHeight; setY(Math.max(8, Math.min(rect.top, window.innerHeight - hh - 8)));
  }, [rect.top, editing, b.id]);
  /* Same labels as the block it opens from: one mapping, taskView. */
  const v = window.taskView(b);
  const hue = v.event ? "var(--text-tertiary)" : (v.hue || c2Hue(null));
  const where = v.where;
  const commit = () => { const t = val.trim(); setEditing(false); if (t && t !== b.title) onRename(b, t); else setVal(b.title); };
  return ReactDOM.createPortal(
    <div ref={ref} data-c2-peek={b.id} role="dialog" aria-label={b.title} className={"nx-pop c2-peek" + (right ? "" : " is-right") + (leaving ? " is-leaving" : "")}
      onMouseEnter={onEnter} onMouseLeave={onLeave} onMouseDown={(e) => e.stopPropagation()}
      style={{ left: left, top: y, width: C2_PEEK_W }}>
      {editing ? (
        <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} aria-label="Event title" data-c2-edit="1"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setVal(b.title); setEditing(false); } }}
          onBlur={commit}
          className="c2-peek-input" />
      ) : (
        <div data-c2-peek-title="1" className={"c2-peek-title" + (b.done ? " is-done" : "")}>{b.title}</div>
      )}
      <div className="c2-peek-time">{v.range} · {v.durLong}</div>
      <div className="c2-peek-where">
        <span aria-hidden="true" className="c2-peek-dot" style={{ background: hue }} />{where}
      </div>
      <div className="c2-peek-acts">
        {b.event ? (
          <React.Fragment>
            <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" onClick={() => setEditing(true)}>Edit title</button>
            {b.user ? <button type="button" className="nx-btn nx-btn-text nx-btn-sm" onClick={() => { onClose(); onDelete(b.id); }}>Delete</button> : null}
          </React.Fragment>
        ) : (
          <React.Fragment>
            <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" onClick={() => { onClose(); onOpen && onOpen(b.id); }}>Open</button>
            <button type="button" className="nx-btn nx-btn-text nx-btn-sm" onClick={() => onDone(b)}>{b.done ? "Not done" : "Done"}</button>
          </React.Fragment>
        )}
      </div>
    </div>, document.body);
}

/* "+N" — what did not fit in a half hour. A chip in the cluster's gutter
   (Week, phone day) or a row in an agenda (Days); either opens the slot list. */
const c2MoreLabel = (m) => m.n + " more at " + c2Time(m.at) + " — show everything in this half hour";
function C2MoreChip({ m, onPick, style, on }) {
  return (
    <button type="button" className="c2-more" data-c2-more={m.at} aria-label={c2MoreLabel(m)} title={c2MoreLabel(m)} aria-haspopup="dialog" aria-expanded={!!on}
      style={style} onClick={(e) => { e.stopPropagation(); onPick(m, e.currentTarget, e.detail === 0); }}>+{m.n}</button>
  );
}
function C2MoreRow({ m, onPick }) {
  return (
    <button type="button" className="c2-more-row" data-c2-more={m.at} aria-haspopup="dialog" title={c2MoreLabel(m)}
      onClick={(e) => { e.stopPropagation(); onPick(m, e.currentTarget, e.detail === 0); }}>
      <span className="c2-more-row-n">+{m.n}</span>
      <span className="c2-more-row-t">more at {c2Time(m.at)}</span>
    </button>
  );
}
/* The slot list: every task and event that touches the half hour. A row
   opens what it is, as the grid would (task → its dialog, event → peek). */
function C2SlotList({ m, onPick }) {
  return (
    <div className="c2-slot-list" role="list">
      {m.items.map((b) => {
        const v = window.taskView ? window.taskView(b) : { range: c2Range(b) };
        const hue = b.event ? "var(--text-tertiary)" : (v.hue || c2Hue(b.project));
        return (
          <button key={b.id} type="button" role="listitem" className={"c2-slot-row" + (b.done ? " is-done" : "")} data-c2-slot-item={b.id}
            onClick={(e) => onPick(b, e.currentTarget)}>
            <span aria-hidden="true" className="c2-slot-rail" style={{ background: hue }} />
            <span className="c2-slot-text">
              <span className="c2-slot-title">{b.title}</span>
              <span className="c2-slot-meta">{c2Range(b)}{b.event ? " · Event" : b.project ? " · " + b.project : ""}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
const C2_POP_W = 280;
function C2SlotPop({ m, rect, leaving, onPick, onClose, kbd }) {
  const ref = React.useRef(null);
  const [y, setY] = React.useState(rect.top);
  const right = rect.right + 8 + C2_POP_W <= window.innerWidth - 8;
  const left = right ? rect.right + 8 : Math.max(8, rect.left - 8 - C2_POP_W);
  React.useLayoutEffect(() => { const el = ref.current; if (!el) return; setY(Math.max(8, Math.min(rect.top - 12, window.innerHeight - el.offsetHeight - 8))); }, [rect.top, m.key]);
  React.useEffect(() => {
    const down = (e) => { if (e.target.closest && (e.target.closest("[data-c2-slot-pop]") || e.target.closest("[data-c2-more]"))) return; onClose(false); };
    const key = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(true); } };
    document.addEventListener("mousedown", down, true); document.addEventListener("keydown", key, true);
    /* Opened from the keyboard: focus moves into the list. */
    const f = kbd && ref.current && ref.current.querySelector("button"); if (f) f.focus({ preventScroll: true });
    return () => { document.removeEventListener("mousedown", down, true); document.removeEventListener("keydown", key, true); };
  }, [m.key]);
  return ReactDOM.createPortal(
    <div ref={ref} data-c2-slot-pop={m.at} role="dialog" aria-label={"Everything at " + c2Time(m.at)}
      className={"nx-pop c2-slot-pop" + (right ? "" : " is-right") + (leaving ? " is-leaving" : "")} style={{ left: left, top: y, width: C2_POP_W }}>
      <div className="c2-slot-head">
        <span className="c2-slot-when">{c2Time(m.at)}–{c2Time(m.at + 0.5)}</span>
        <span className="c2-slot-count">{m.items.length} {m.items.length === 1 ? "item" : "items"}</span>
      </div>
      <C2SlotList m={m} onPick={onPick} />
    </div>, document.body);
}
/* The popover's state for a view: open on a chip, close on pick / outside / Esc. */
function useC2Slot() {
  const [slot, setSlot] = React.useState(null); /* { m, rect, el } */
  const last = React.useRef(null); if (slot) last.current = slot;
  const [shown, leaving] = window.useExit(!!slot, 120);
  const open = (m, el, kbd) => setSlot({ m: m, rect: el.getBoundingClientRect(), el: el, kbd: !!kbd });
  const close = (refocus) => { const s = last.current; setSlot(null); if (refocus && s && s.el && s.el.isConnected) s.el.focus({ preventScroll: true }); };
  return { slot: shown ? last.current : null, leaving: leaving, open: open, close: close };
}

function WeekView({ blocks, onOpen, draft, onSlot, onSave, onCancel, onDelete, onDone, onRename, days, dragProps }) {
  const DAYS = days || C2_DAYS, N = DAYS.length;
  const hours = []; for (let h = C2_START; h < C2_END; h++) hours.push(h);
  const scroller = React.useRef(null), gridRef = React.useRef(null);
  const [colW, setColW] = React.useState(0);
  const [peek, setPeek] = React.useState(null); /* { id, rect } */
  const last = React.useRef(null); if (peek) last.current = peek;
  const [shown, leaving] = window.useExit(!!peek, 120);
  const tOpen = React.useRef(0), tClose = React.useRef(0), quiet = React.useRef(false);
  const clear = () => { clearTimeout(tOpen.current); clearTimeout(tClose.current); };
  const show = (b, el) => { clear(); setPeek({ id: b.id, rect: el.getBoundingClientRect() }); };
  const close = (refocus) => {
    clear(); const p = last.current; setPeek(null);
    if (refocus && p) { const el = document.querySelector('[data-c2-block="' + p.id + '"]'); if (el) { quiet.current = true; el.focus({ preventScroll: true }); quiet.current = false; } }
  };
  const hover = {
    open: onOpen,
    enter: (b, el) => { clearTimeout(tClose.current); clearTimeout(tOpen.current); if (peek && peek.id === b.id) return; tOpen.current = setTimeout(() => show(b, el), peek ? 120 : 350); },
    leave: () => { clearTimeout(tOpen.current); clearTimeout(tClose.current); tClose.current = setTimeout(() => setPeek(null), 150); },
    click: (b, el) => show(b, el),
    focus: (b, el) => { if (quiet.current) return; let fv = false; try { fv = el.matches(":focus-visible"); } catch (e) {} if (fv) show(b, el); }
  };
  React.useEffect(() => () => clear(), []);
  React.useEffect(() => {
    if (!peek) return;
    const down = (e) => { if (e.target.closest && (e.target.closest("[data-c2-peek]") || e.target.closest('[data-c2-block="' + peek.id + '"]'))) return; close(false); };
    const key = (e) => { if (e.key !== "Escape" || (e.target && e.target.getAttribute && e.target.getAttribute("data-c2-edit"))) return; e.preventDefault(); e.stopPropagation(); close(true); };
    const sc = () => close(false);
    document.addEventListener("mousedown", down, true); document.addEventListener("keydown", key, true);
    const s = scroller.current; s && s.addEventListener("scroll", sc, { passive: true }); window.addEventListener("resize", sc);
    return () => { document.removeEventListener("mousedown", down, true); document.removeEventListener("keydown", key, true); s && s.removeEventListener("scroll", sc); window.removeEventListener("resize", sc); };
  }, [peek && peek.id]);
  React.useEffect(() => { if (scroller.current) scroller.current.scrollTop = (8.5 - C2_START) * C2_H; }, []);
  React.useLayoutEffect(() => {
    const el = gridRef.current; if (!el) return;
    const m = () => setColW(Math.max(0, (el.getBoundingClientRect().width - 56) / N));
    m(); if (!window.ResizeObserver) return; const ro = new ResizeObserver(m); ro.observe(el); return () => ro.disconnect();
  }, [N]);
  const pb = shown && last.current ? blocks.find((x) => x.id === last.current.id) : null;
  const sl = useC2Slot();
  /* A row in the slot list opens like the block would: a task its dialog, an event its peek. */
  const pickSlot = (b, el) => { const r = el.getBoundingClientRect(); sl.close(false); if (!b.event && onOpen) onOpen(b.id); else { clear(); setPeek({ id: b.id, rect: r }); } };
  return (
    <div className="c2-week">
      <div className="c2-week-head" style={{ gridTemplateColumns: "56px repeat(" + N + ", minmax(0, 1fr))" }}>
        <span />
        {DAYS.map(([d, wd]) => {
          const today = d === C2_TODAY;
          return (
            <div key={d} className={"c2-dayhead" + (today ? " is-today" : "")}>
              <span className="c2-dayhead-wd">{wd}</span>
              <span className="c2-dayhead-n">{d}</span>
            </div>
          );
        })}
      </div>
      <div ref={scroller} className="scroll-inner c2-week-scroll">
        <div ref={gridRef} className="c2-week-grid" style={{ gridTemplateColumns: "56px repeat(" + N + ", minmax(0, 1fr))", height: (C2_END - C2_START) * C2_H }}>
          <div className="c2-rel">
            {hours.map((h) => <span key={h} className="c2-hour" style={{ top: (h - C2_START) * C2_H - 7 }}>{h === C2_START ? "" : String(h).padStart(2, "0") + ":00"}</span>)}
          </div>
          {DAYS.map(([d, wd]) => (
            /* each day column is a drop target (Drag.jsx data-drop="timeline"):
               a task dropped here takes this day and the 15-min slot under
               the hand; its new block (data-drag-id) is where it lands */
            <div key={d} data-c2-day={d} data-drop="timeline" data-date={d} data-start={C2_START} data-hour-h={C2_H} data-offset="0" onClick={(e) => {
                if (!onSlot || e.target.closest("[data-c2-block]")) return;
                const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                const at = Math.min(Math.max(C2_START + Math.floor(y / (C2_H / 2)) / 2, C2_START), C2_END - 1);
                onSlot(d, at);
              }} className={"c2-daycol" + (d === C2_TODAY ? " is-today" : wd === "Sat" || wd === "Sun" ? " is-weekend" : "")}>
              {hours.map((h) => <span key={h} aria-hidden="true" className="c2-hline" style={{ top: (h - C2_START) * C2_H }} />)}
              {(() => {
                const laid = c2Place(blocks.filter((b) => b.day === d).concat(draft && draft.day === d ? [{ id: "__draft", draft: true, at: draft.at, len: 60 }] : []), colW, C2_CAP);
                return laid.map((pos) => pos.b.draft
                  ? <C2Draft key={"draft-" + draft.key} d={draft} pos={pos} onSave={onSave} onCancel={onCancel} />
                  : <C2Block key={pos.b.id} b={pos.b} pos={pos} hover={hover} peek={!!peek && peek.id === pos.b.id} dragProps={dragProps} />)
                  .concat(laid.more.map((m) => <C2MoreChip key={m.key} m={m} onPick={sl.open} on={!!sl.slot && !sl.leaving && sl.slot.m.key === m.key}
                    style={{ left: m.left, width: m.width, top: (m.at - C2_START) * C2_H + 2 }} />));
              })()}
              {d === C2_TODAY ? (
                <span aria-hidden="true" className="c2-now" style={{ top: (C2_NOW - C2_START) * C2_H }}>
                  <span className="c2-now-dot" />
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      {sl.slot ? <C2SlotPop key={sl.slot.m.key} m={sl.slot.m} rect={sl.slot.rect} kbd={sl.slot.kbd} leaving={sl.leaving} onPick={pickSlot} onClose={sl.close} /> : null}
      {pb ? <C2Peek key={pb.id} b={pb} rect={last.current.rect} leaving={leaving}
        onEnter={() => clearTimeout(tClose.current)} onLeave={hover.leave} onClose={() => close(false)}
        onOpen={onOpen} onDone={onDone} onRename={onRename} onDelete={onDelete} /> : null}
    </div>
  );
}

/* AGENDA ("days") — a column per day: header, all-day items, then timed rows. */
const C2_RANGE = (() => { const out = C2_DAYS.slice(), wds = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; for (let d = 7; d <= 20; d++) out.push([d, wds[(d - 7) % 7], "Sep"]); return out; })();
const C2_LONG = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const c2LoadN = () => { try { const n = parseInt(localStorage.getItem("needt.cal.days"), 10); return [3, 5, 7].indexOf(n) >= 0 ? n : 3; } catch (e) { return 3; } };

/* An agenda row: Task's "agenda" row (time, rail, title, duration, where). */
function C2Row({ b, onOpen, stacked, compact, dragProps }) {
  const row = <window.Task layout="row" density="agenda" task={b} onOpen={onOpen ? (id) => onOpen(id) : null} stacked={stacked} compact={compact} />;
  /* A task row lifts like a week block (Drag.jsx, mode "move"); events stay put. */
  return !b.event && dragProps ? <div className="c2-row-drag" {...dragProps({ id: b.id, title: b.title }, "move")}>{row}</div> : row;
}

/* AGENDA DROP (09.10.26) — the Agenda is a drop target like the week grid,
   through Drag.jsx's attributes (no drop logic of its own):
     a day column   data-drop="day" + data-date "3 Sep" → App.jsx moves the
                    task to that day and keeps its time (NEEDT.moveDay);
                    highlighted, the tag says the day (+ the kept time).
     the gap        between two timed rows (and before the first / after the
                    last) a thin data-drop="timeline" strip whose data-start
                    is the time between them (15-min snap; data-hour-h is
                    huge, so the hand's height inside it never moves the
                    time) → App.jsx places the task there, with the week
                    grid's toast + Undo; the tag says the time.
   App.jsx's day drop has no toast, so the day column adds the Undo here: the
   task is read when the press starts, and the toast fires after the drop. */
const c2Up15 = (h) => Math.ceil(h * 4 - 1e-6) / 4, c2Down15 = (h) => Math.floor(h * 4 + 1e-6) / 4;
const c2EndOf = (r) => (r.more ? Math.max.apply(null, r.items.map(c2End)) : c2End(r.b));
const c2AtOf = (r) => (r.more ? r.at : r.b.at);
/* The time a drop between a (above) and b (below) takes. */
const c2GapTime = (a, b) => {
  if (a && b) {
    const after = c2Up15(c2EndOf(a));
    if (after <= c2AtOf(b) - 0.25) return after;
    return Math.max(c2AtOf(a), c2Down15((c2AtOf(a) + c2AtOf(b)) / 2));
  }
  if (b) return Math.max(0, c2Down15(c2AtOf(b) - 0.5));
  return Math.min(23.75, c2Up15(c2EndOf(a)));
};
function C2Gap({ d, at }) {
  return <div className="c2-gap" aria-hidden="true" data-c2-gap={c2Time(at)} data-drop="timeline" data-date={d} data-start={at} data-hour-h="100000" data-offset="0" />;
}
/* Rows with the gaps between the timed ones. */
const c2WithGaps = (rows, d, draw) => {
  const out = [];
  let prev = null;
  rows.forEach((r, i) => {
    const timed = r.more || r.b.at != null;
    if (timed) out.push(<C2Gap key={"gap-" + i} d={d} at={c2GapTime(prev, r)} />);
    out.push(draw(r));
    if (timed) prev = r;
  });
  if (prev) out.push(<C2Gap key="gap-end" d={d} at={c2GapTime(prev, null)} />);
  return out;
};

function DaysView({ blocks, loose, onOpen, dragProps }) {
  const [n, setN] = React.useState(c2LoadN);
  const [start, setStart] = React.useState(() => Math.max(0, C2_RANGE.findIndex((x) => x[0] === C2_TODAY)));
  const pick = (v) => { const k = parseInt(v, 10); setN(k); if (window.needtSync) window.needtSync.set("needt.cal.days", String(k)); setStart((s) => Math.min(s, C2_RANGE.length - k)); };
  const s = Math.min(start, C2_RANGE.length - n), days = C2_RANGE.slice(s, s + n);
  const fmt = (x) => x[0] + " " + x[2];
  /* Stack title over meta when a column is too narrow to hold both on one
     line without cutting the title (3 days at 1280 wide gives ~300px). */
  const gridRef = React.useRef(null);
  const [gw, setGw] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = gridRef.current; if (!el) return;
    const m = () => setGw(el.getBoundingClientRect().width);
    m(); if (!window.ResizeObserver) return; const ro = new ResizeObserver(m); ro.observe(el); return () => ro.disconnect();
  }, [s, n]);
  const stacked = n >= 5 || (gw > 0 && (gw - (n - 1) * 10) / n < 400);
  const sl = useC2Slot();
  const pickSlot = (b) => { sl.close(false); if (!b.event && onOpen) onOpen(b.id); };
  /* The task in the hand: its time goes on the day tag, its fields into the Undo. */
  const carry = React.useRef(null);
  const [carryAt, setCarryAt] = React.useState(null);
  React.useEffect(() => {
    if (!dragProps) return undefined;
    const N = window.NEEDT;
    const down = (e) => {
      const src = e.button === 0 && e.target.closest ? e.target.closest("[data-drag-src]") : null;
      const id = src ? src.getAttribute("data-drag-id") : null;
      const t = id != null ? ((window.__app && window.__app.tasksNow) || []).find((x) => String(x.id) === id) : null;
      carry.current = t || null;
      setCarryAt(t ? N.at(t) : null);
    };
    const up = (e) => {
      const t = carry.current; carry.current = null;
      if (!t || !document.querySelector(".shell-drag-lift")) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const col = el && el.closest ? el.closest("[data-drop]") : null;
      if (!col || !col.hasAttribute("data-c2-agenda-day")) return;
      const day = N.toDate(col.getAttribute("data-date"));
      if (!day || t.dueDate === day) return;
      const before = { dueDate: t.dueDate || null, scheduledStart: t.scheduledStart || null, scheduledEnd: t.scheduledEnd || null, isFixed: !!t.isFixed };
      /* after App.jsx has written the move */
      window.setTimeout(() => window.toast("Moved to " + N.dayLabel(day) + (N.at(t) != null ? " · " + N.hhmm(N.at(t)) : ""),
        { undo: () => window.__app && window.__app.updateTask(t.id, before) }), 0);
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    return () => { window.removeEventListener("pointerdown", down, true); window.removeEventListener("pointerup", up, true); };
  }, [!!dragProps]);
  return (
    <div className="c2-stack">
      <div className="c2-days-bar">
        <button type="button" aria-label="Previous days" className="nx-btn nx-btn-text nx-btn-sm c2-days-page" disabled={s === 0} onClick={() => setStart(Math.max(0, s - n))}><C2Icon name="chevron-left" size={15} /></button>
        <button type="button" aria-label="Next days" className="nx-btn nx-btn-text nx-btn-sm c2-days-page" disabled={s + n >= C2_RANGE.length} onClick={() => setStart(Math.min(C2_RANGE.length - n, s + n))}><C2Icon name="chevron-right" size={15} /></button>
        <span data-c2-range="1" className="c2-days-range">{fmt(days[0])} – {fmt(days[days.length - 1])}</span>
        <span className="c2-days-seg">
          {window.Seg2 ? <window.Seg2 value={String(n)} onChange={pick} options={[["3", "3 days"], ["5", "5 days"], ["7", "7 days"]]} /> : null}
        </span>
      </div>
      <div key={s + "-" + n} ref={gridRef} className="nx-swap c2-days-grid" data-c2-days={n} style={{ gridTemplateColumns: "repeat(" + n + ", minmax(0, 1fr))" }}>
        {days.map(([d, wd, mo]) => {
          const today = d === C2_TODAY;
          const timed = blocks.filter((b) => b.day === d).sort((a, b) => a.at - b.at);
          const allDay = loose.filter((b) => b.day === d);
          const items = allDay.concat(timed);
          return (
            <section key={d + mo} data-c2-col={d} aria-label={C2_LONG[wd] + " " + d + " " + mo} className={"c2-col" + (today ? " is-today" : "")}
              data-drop="day" data-c2-agenda-day="" data-date={d + " " + mo} data-label={wd + " " + d + " " + mo + (carryAt != null ? " · " + c2Time(carryAt) : "")}>
              <header className="c2-col-head">
                <span className="c2-col-wd">{n === 7 ? wd : C2_LONG[wd]}</span>
                <span className="c2-col-date">{mo} {d}</span>
                {today && n < 7 ? <span className="c2-col-today">Today</span> : null}
              </header>
              <div className="scroll-inner c2-col-scroll">
                {items.length ? c2WithGaps(c2AgendaFold(items, C2_CAP), d, (r) => r.more
                  ? <C2MoreRow key={r.key} m={r} onPick={sl.open} />
                  : <C2Row key={r.b.id} b={r.b} onOpen={onOpen} stacked={stacked} compact={n === 7} dragProps={dragProps} />) : (
                  <div data-c2-empty="1" className="c2-col-empty">Nothing planned</div>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {sl.slot ? <C2SlotPop key={sl.slot.m.key} m={sl.slot.m} rect={sl.slot.rect} kbd={sl.slot.kbd} leaving={sl.leaving} onPick={pickSlot} onClose={sl.close} /> : null}
    </div>
  );
}

function CalendarCraft({ tasks, onOpen, dragProps }) {
  /* Starting view comes from Settings / onboarding ("week" | "days"). */
  const [view, setViewRaw] = React.useState(() => {
    const s = window.needtSettings;
    const v = s && s.has && s.has("view") ? s.get("view") : "week";
    return v === "days" ? "days" : "week";
  });
  const setView = (v) => { setViewRaw(v); if (window.needtSettings) window.needtSettings.set("view", v); };
  /* Hide done: completed tasks leave Week and Agenda; events stay. */
  const [hideDone, setHideDoneRaw] = React.useState(() => { const s = window.needtSettings; return !!(s && s.get && s.get("calHideDone")); });
  const setHideDone = (v) => { setHideDoneRaw(v); if (window.needtSettings) window.needtSettings.set("calHideDone", !!v); };
  /* Tablet (07.10.26): under 900 the week grid shows three days, starting
     today; ‹ › page through the week three days at a time. */
  const [narrow, setNarrow] = React.useState(() => window.innerWidth < 900);
  React.useEffect(() => {
    const fit = () => setNarrow(window.innerWidth < 900);
    window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit);
  }, []);
  const todayIx = C2_DAYS.findIndex((x) => x[0] === C2_TODAY);
  const [from, setFrom] = React.useState(todayIx);
  const span = narrow ? C2_DAYS.slice(Math.min(from, C2_DAYS.length - 3), Math.min(from, C2_DAYS.length - 3) + 3) : C2_DAYS;
  const page = (dir) => {
    if (!narrow || view !== "week") { window.toast((dir < 0 ? "Previous" : "Next") + " week — loads with real data"); return; }
    const next = Math.min(Math.max(0, Math.min(from, C2_DAYS.length - 3) + dir * 3), C2_DAYS.length - 3);
    if (next === Math.min(from, C2_DAYS.length - 3)) window.toast((dir < 0 ? "Previous" : "Next") + " week — loads with real data");
    else setFrom(next);
  };
  const spanLabel = narrow && view === "week" ? span[0][0] + " " + span[0][2] + " – " + span[2][0] + " " + span[2][2] : "31 Aug – 6 Sep · week 36";
  const mine = window.useStore(c2Store), setMine = c2Store.set;
  const [draft, setDraft] = React.useState(null);
  const titles = window.useStore(c2Titles);
  /* Blocks are this view's own shape: day + decimal hour + length, and the
     project by name for its chip. Read from the task's database fields. */
  /* Trashed tasks (trashedAt) live on the Trash screen only. */
  const live = window.NEEDT.liveTasks(tasks);
  /* Events (Event rows) as blocks: synced ones with any local title override,
     then the user's own. */
  const evBlocks = C2_EVENTS.map((e) => Object.assign({ event: true }, c2Block(e), titles[e.id] ? { title: titles[e.id] } : null))
    .concat(mine.map((e) => Object.assign({ event: true, user: c2Own(e), source: e.source || "needt" }, c2Block(e))));
  const shown = hideDone ? live.filter((t) => !t.done) : live;
  const doneN = live.filter((t) => t.done && c2Day(t) != null && !t.overdue).length;
  const blocks = shown.filter((t) => t.scheduledStart && c2Day(t) != null && !t.noSlot && !t.overdue)
    .map((t) => ({ id: t.id, day: c2Day(t), at: window.NEEDT.at(t), len: t.estimatedMinutes || 30, title: t.title, project: window.NEEDT.projectName(t), done: t.done }))
    .concat(evBlocks.filter((b) => b.at != null));
  /* tasks due on a day but not given an hour, and all-day events: the Days
     view lists them as all-day */
  const loose = shown.filter((t) => c2Day(t) != null && !t.overdue && (!t.scheduledStart || t.noSlot))
    .map((t) => ({ id: t.id, day: c2Day(t), at: null, len: t.estimatedMinutes || 0, title: t.title, project: window.NEEDT.projectName(t), done: t.done }))
    .concat(evBlocks.filter((b) => b.at == null));
  /* Done closes the task's parts too (NEEDT.completeTask); Undo puts the
     task and its parts back as they were. */
  const done = (b) => {
    const app = window.__app; if (!app || !app.updateTask) return;
    const t = live.find((x) => x.id === b.id) || { id: b.id, done: !!b.done };
    const was = !!t.done, before = { done: was };
    if (t.TaskPart) before.TaskPart = t.TaskPart;
    app.updateTask(b.id, window.NEEDT.completeTask(t, !was));
    window.toast((was ? "Reopened “" : "Done · “") + b.title + "”", { undo: () => app.updateTask(b.id, before) });
  };
  const rename = (b, title) => {
    const prev = b.title;
    if (b.user) { setMine((l) => l.map((x) => x.id === b.id ? Object.assign({}, x, { title: title }) : x)); window.toast("Renamed to “" + title + "”", { undo: () => setMine((l) => l.map((x) => x.id === b.id ? Object.assign({}, x, { title: prev }) : x)) }); }
    else { c2Titles.set((m) => Object.assign({}, m, { [b.id]: title })); window.toast("Renamed to “" + title + "”", { undo: () => c2Titles.set((m) => Object.assign({}, m, { [b.id]: prev })) }); }
  };
  const slot = (day, at) => setDraft({ day: day, at: at, key: Date.now() });
  /* Create → New event: a draft in today's first free slot. */
  React.useEffect(() => {
    const on = (e) => { if (e.detail === "event") newEvent(); };
    window.addEventListener("needt-new", on); return () => window.removeEventListener("needt-new", on);
  });
  const save = (title) => {
    const d = draft; if (!d) return;
    const ev = window.NEEDT.eventAt(d.day, d.at, 60, { title: title });
    setDraft(null); setMine((l) => l.concat(ev));
    window.toast("Added “" + title + "” · " + c2Time(d.at), { undo: () => setMine((l) => l.filter((x) => x.id !== ev.id)) });
  };
  const del = (id) => {
    const ev = mine.find((x) => x.id === id); if (!ev) return;
    setMine((l) => l.filter((x) => x.id !== id));
    window.toast("Deleted “" + ev.title + "”", { undo: () => setMine((l) => l.some((x) => x.id === id) ? l : l.concat(ev)) });
  };
  const newEvent = () => { setView("week"); slot(C2_TODAY, c2FreeSlot(blocks)); };
  return (
    <div className="c2-stack">
      <header className="c2-head">
        <window.PageAddButton label="New" items={[{ art: "event", title: "New Event", sub: "Blocks time on your calendar", onClick: newEvent }, { art: "task", title: "New Task", sub: "Placed into a free hour", kbd: "N", onClick: () => window.__app && window.__app.openComposer && window.__app.openComposer() }]} />
        <h1 className="c2-title">Calendar</h1>
        <span data-c2-range="" className="c2-span">{spanLabel}</span>
        <span className="c2-head-right">
          <span className="c2-pager">
            {[["chevron-left", narrow ? "Previous days" : "Previous week", -1], ["chevron-right", narrow ? "Next days" : "Next week", 1]].map(([ic, l, dir]) => (
              <button key={ic} type="button" aria-label={l} title={l} className="nx-btn nx-btn-text c2-page" data-c2-page={dir} onClick={() => page(dir)}><C2Icon name={ic} size={16} /></button>
            ))}
          </span>
          <button type="button" className="nx-btn nx-btn-secondary" onClick={() => { if (narrow && from !== todayIx) setFrom(todayIx); else window.toast("You're on this week"); }}>Today</button>
          <button type="button" data-c2-hide-done="" aria-pressed={hideDone} className={"nx-btn nx-btn-text c2-hide" + (narrow ? " is-icon" : "")}
            aria-label="Hide done" title={hideDone ? (doneN ? doneN + (doneN === 1 ? " done task hidden" : " done tasks hidden") + " — click to show" : "Done tasks are hidden — click to show") : "Hide completed tasks"}
            onClick={() => setHideDone(!hideDone)}>
            <C2Icon name={hideDone ? "eye-off" : "eye"} size={15} />{narrow ? null : <span>Hide done</span>}
          </button>
          {window.Seg2 ? <span className={"c2-seg" + (narrow ? " is-narrow" : "")}><window.Seg2 value={view} onChange={setView} options={[["week", narrow ? "3 days" : "Week"], ["days", "Agenda"]]} /></span> : null}
        </span>
      </header>
      <div key={view} className="nx-swap c2-body">
        {view === "week" ? <WeekView blocks={blocks} onOpen={onOpen} draft={draft} onSlot={slot} onSave={save} onCancel={() => setDraft(null)} onDelete={del} onDone={done} onRename={rename} days={span} dragProps={dragProps} /> : <DaysView blocks={blocks} loose={loose} onOpen={onOpen} dragProps={dragProps} />}
      </div>
    </div>
  );
}

Object.assign(window, { CalendarCraft });
