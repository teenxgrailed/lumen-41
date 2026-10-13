const { Switch, Icon, Menu, MenuItem, MenuLabel } = window.NeedtDesignSystem_25d3c8;

/* THE TASK EDITOR (08.10.26 rebuild) — one compact card, like Things / Linear.
 *
 * ONE COLUMN, ~560 px, centred. Top: a round checkbox and the title (Enter
 * saves, long titles wrap), the ⋯ menu and close. Under the title one row of
 * chips — Date · Duration · Project · Priority · Labels · Repeat (and Who, only
 * when someone else holds the task). Empty chips read "+ Date"; each one opens
 * a small popover editor. Then the notes (plain text, `notes` — the same
 * field and format as the phone), the subtasks (inline add, drag to reorder,
 * ring "1/3"), and the two-minute first step (`entry`, a one-line field; with
 * text in it, Start focus runs on it). The planner's knobs (placement, minimum work block,
 * deadline, hours) live under ⋯ → Scheduling…, which opens an inline section;
 * when anything there is not the default a one-line summary chip sits under
 * the chips. Task / Event / Document is not a tab row any more: ⋯ → Convert to…
 *
 * SAVE MODEL: autosave. Every edit goes out at once through onChange(patch)
 * (App → NEEDT.applyTaskPatch); there is no Save and no Cancel. However the
 * card closes (Esc, scrim, ×), if anything changed a toast says so and its
 * Undo puts the record back as it was when the card opened. ⌘Enter ticks it.
 *
 * Opened with no task (new-task mode) it edits a local draft and writes nothing.
 */
const TD_PRIO = [["urgent", "Urgent"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]];
const TD_PRIO_ALIAS = { important: "high", normal: "medium", whenever: "low", p1: "urgent", p2: "high", p3: "medium", p4: "low" };
const TD_DUR = [15, 30, 45, 60, 90, 120, 180, 240];
const TD_REPEAT = [[null, "Never"], ["daily", "Every day"], ["weekdays", "Every weekday"], ["weekly", "Every week"], ["monthly", "Every month"]];
const TD_CHUNK = [null, 15, 25, 30, 45, 60, 90];
const TD_HOURS = [["work", "Work hours"], ["personal", "Personal"], ["any", "Any time"]];
const TD_LABELS = ["Deep work", "Quick win", "Errand", "Call", "Waiting"];
const TD_DOW = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const TD_MON_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TD_DRAFT = {
  id: "draft", title: "Draft the launch brief", projectId: "ops", dueDate: "2026-09-04", estimatedMinutes: 90, priority: "high",
  notes: "Last month’s numbers, the two decisions we changed, and what the factory needs by Friday.",
  TaskPart: [{ id: "d.1", title: "Pull last month’s numbers", done: true }, { id: "d.2", title: "Write the draft", done: false }, { id: "d.3", title: "Send it for review", done: false }]
};

const tdDur = (min) => {
  if (!min) return null;
  if (min < 60) return min + " min";
  const h = Math.floor(min / 60), m = min % 60;
  return m ? h + " h " + m : h + " h";
};
const tdPad = (n) => String(n).padStart(2, "0");
const tdFromIso = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const tdIso = (d) => d.getFullYear() + "-" + tdPad(d.getMonth() + 1) + "-" + tdPad(d.getDate());
const tdToday = () => (window.NEEDT && window.NEEDT.today) || new Date();
const tdAdd = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/* "Today", "Tomorrow", "Fri 4 Sep". */
function tdDayName(isoDay) {
  const d = tdFromIso(isoDay); if (!d) return null;
  const t = tdToday(), diff = Math.round((d - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] + " " + d.getDate() + " " + TD_MON_LONG[d.getMonth()].slice(0, 3);
}
const tdShort = (isoDay) => { const d = tdFromIso(isoDay); return d ? d.getDate() + " " + TD_MON_LONG[d.getMonth()].slice(0, 3) : null; };
function tdAgo(isoStamp) {
  if (!isoStamp) return null;
  const d = new Date(isoStamp); if (isNaN(d)) return null;
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "at " + tdPad(d.getHours()) + ":" + tdPad(d.getMinutes());
  return d.getDate() + " " + TD_MON_LONG[d.getMonth()].slice(0, 3);
}
const tdPrio = (p) => { const k = p ? String(p).toLowerCase() : null; return k ? (TD_PRIO_ALIAS[k] || k) : null; };
/* Every project the person can pick: the seeds plus their own, one entry per id. */
function tdProjects() {
  const N = window.NEEDT, out = [], seen = {};
  const add = (p) => { if (!p || !p.id || seen[p.id]) return; seen[p.id] = 1; const r = N.project(p.id) || p; out.push(r); };
  (N.projects || []).forEach(add);
  try { if (window.projectStore) (window.projectStore.get().list || []).forEach(add); } catch (e) {}
  return out;
}
/* Notes are plain text (`notes`, Data.js NEEDT.notesText reads older HTML). */
const tdNotes = (t) => (t && t.notes) || "";

/* The ring + "1/3" (same drawing as the task row's counter). */
function TdRing({ done, total }) {
  const r = 6, c = 2 * Math.PI * r;
  return (
    <span className="tk-count tdc-count">
      <svg className="tk-ring" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle className="tk-ring-track" cx="8" cy="8" r={r} />
        <circle className="tk-ring-fill" cx="8" cy="8" r={r} strokeDasharray={c} strokeDashoffset={total ? c * (1 - done / total) : c} />
      </svg>
      {done}/{total}
    </span>
  );
}

/* One chip under the title. Empty → a quiet "+ Date". */
function TdChip({ k, glyph, value, empty, open, onOpen, danger, title, dot, children, measure }) {
  if (measure) return (
    <span data-k={k} data-filled={value ? "1" : ""} className={"tdc-chip" + (value ? "" : " is-empty")}>
      {dot ? <span className="tdc-dot" aria-hidden="true" /> : <Icon name={glyph} size={13} />}
      <span className="tdc-chip-text">{value || empty}</span>
    </span>
  );
  return (
    <button type="button" data-tdc-trigger={k} className={"tdc-chip" + (value ? "" : " is-empty") + (danger ? " is-danger" : "")}
      aria-expanded={open ? "true" : "false"} aria-haspopup="dialog" title={title} onClick={onOpen}>
      {dot ? <span className="tdc-dot" data-hue="" ref={(el) => { if (el) el.style.setProperty("--tdc-hue", dot); }} aria-hidden="true" /> : <Icon name={glyph} size={13} />}
      <span className="tdc-chip-text">{value || empty}</span>
      {children}
    </button>
  );
}

/* A month grid, quick picks and a time — the date popover's body. */
function TdCalendar({ value, onPick }) {
  const base = tdFromIso(value) || tdToday();
  const [month, setMonth] = React.useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const first = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const todayIso = tdIso(tdToday());
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(tdIso(new Date(month.getFullYear(), month.getMonth(), d)));
  return (
    <div className="tdc-cal">
      <div className="tdc-cal-head">
        <span className="tdc-cal-month">{TD_MON_LONG[month.getMonth()]} {month.getFullYear()}</span>
        <button type="button" className="tdc-icon-btn" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="chevron-left" size={14} /></button>
        <button type="button" className="tdc-icon-btn" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="chevron-right" size={14} /></button>
      </div>
      <div className="tdc-cal-grid" role="grid">
        {TD_DOW.map((d) => <span key={d} className="tdc-cal-dow">{d}</span>)}
        {cells.map((c, i) => c ? (
          <button key={c} type="button" className={"tdc-cal-day" + (c === value ? " is-on" : "") + (c === todayIso ? " is-today" : "")}
            aria-pressed={c === value} onClick={() => onPick(c)}>{+c.slice(8)}</button>
        ) : <span key={"e" + i} />)}
      </div>
    </div>
  );
}

function TaskDialog({ open, onClose, task, onChange }) {
  const N = window.NEEDT;
  const [draft, setDraft] = React.useState(TD_DRAFT);
  const t = task || draft;
  const tid = task ? task.id : null;
  const [title, setTitle] = React.useState(t.title || "");
  const [parts, setParts] = React.useState(t.TaskPart || []);
  const [pop, setPop] = React.useState(null);          // { key, x, y }
  const [menu, setMenu] = React.useState(false);
  const [notes, setNotes] = React.useState(tdNotes(t));
  const [entry, setEntry] = React.useState(t.entry || "");
  const [q, setQ] = React.useState("");
  const [drag, setDrag] = React.useState(null);        // { from, over }
  const [focusId, setFocusId] = React.useState(null);
  const [addText, setAddText] = React.useState("");
  /* Scheduling: closed by default, remembered (needtSettings.taskSchedOpen). */
  const [schedOpen, setSchedOpenRaw] = React.useState(() => { const st = window.needtSettings; return !!(st && st.get && st.get("taskSchedOpen")); });
  const setSchedOpen = (v) => { setSchedOpenRaw(v); if (window.needtSettings) window.needtSettings.set("taskSchedOpen", !!v); };
  const cardRef = React.useRef(null);
  const notesRef = React.useRef(null);
  const popRef = React.useRef(null);
  const partRefs = React.useRef({});
  /* Chip row: one line, always. Chips that don't fit fold into a "+N" chip —
     empty ones first, then filled ones from the end (date stays longest). */
  const chipsRef = React.useRef(null);
  const measureRef = React.useRef(null);
  const moreRef = React.useRef(null);
  const [folded, setFolded] = React.useState([]);
  const [chipW, setChipW] = React.useState(0);
  React.useLayoutEffect(() => {
    const row = chipsRef.current, m = measureRef.current;
    if (!row || !m) return;
    const cs = getComputedStyle(row);
    const avail = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const gap = parseFloat(cs.columnGap) || 0;
    const items = Array.prototype.map.call(m.querySelectorAll("[data-k]"), (el) => ({ k: el.getAttribute("data-k"), filled: !!el.getAttribute("data-filled"), w: el.getBoundingClientRect().width }));
    const more = m.querySelector(".tdc-more"), moreW = more ? more.getBoundingClientRect().width : 40;
    const width = (list) => list.reduce((a, it) => a + it.w, 0) + gap * Math.max(0, list.length - 1);
    let out = [];
    if (width(items) > avail + 0.5) {
      const order = items.filter((it) => !it.filled).reverse().concat(items.filter((it) => it.filled).reverse());
      let shown = items.slice();
      for (let i = 0; i < order.length && shown.length > 1; i++) {
        if (width(shown) + gap + moreW <= avail + 0.5) break;
        shown = shown.filter((it) => it !== order[i]);
        out.push(order[i].k);
      }
    }
    if (out.join() !== folded.join()) setFolded(out);
  });
  React.useEffect(() => {
    const row = chipsRef.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setChipW(row.clientWidth));
    ro.observe(row);
    return () => ro.disconnect();
  }, [open]);
  /* The tick plays when you close it, not when the card opens on a done task. */
  const checkTick = useCheckTick(!!t.done, open ? "t" + tid : null);
  const [subTick, setSubTick] = React.useState(null);

  /* Autosave bookkeeping: the record as it was when the card opened, whether
     anything changed since, and the brief "Saved" flash. */
  const snap = React.useRef(null);
  const [flash, setFlash] = React.useState(0);
  React.useEffect(() => {
    const s0 = snap.current;
    if (s0 && (!open || !task || String(s0.id) !== String(task.id))) {
      snap.current = null;
      if (s0.dirty && !s0.quiet && window.toast) {
        window.toast("Changes saved", { undo: () => {
          const app = window.__app; if (!app) return;
          if (app.setTasksRaw) app.setTasksRaw((l) => l.map((x) => String(x.id) === String(s0.id) ? s0.before : x));
          else if (app.updateTask) app.updateTask(s0.id, s0.before);
        } });
      }
    }
    if (open && task && !snap.current) snap.current = { id: task.id, before: Object.assign({}, task), dirty: false };
  }, [open, tid]);
  React.useEffect(() => {
    if (!flash) return;
    const h = setTimeout(() => setFlash(0), 1400);
    return () => clearTimeout(h);
  }, [flash]);
  /* Re-read the record whenever a different task opens (or the same one again). */
  React.useEffect(() => {
    if (!open) return;
    const src = task || draft;
    setTitle(src.title || "");
    setParts(src.TaskPart || []);
    setPop(null); setMenu(false); setSubTick(null);
    setNotes(tdNotes(src)); setEntry(src.entry || "");
  }, [tid, open]);
  React.useEffect(() => {
    if (focusId == null) return;
    const el = partRefs.current[focusId]; if (el) el.focus();
    setFocusId(null);
  }, [focusId, parts]);

  const emit = (patch) => {
    if (!task) { setDraft((d) => (N && N.patchTask ? N.patchTask(d, patch) : Object.assign({}, d, patch))); setFlash((n) => n + 1); return; }
    if (!onChange) return;
    onChange(Object.assign({}, patch, { updatedAt: new Date().toISOString() }));
    if (snap.current) snap.current.dirty = true;
    setFlash((n) => n + 1);
  };
  const toggleDone = () => {
    const p = N.completeTask ? N.completeTask(t, !t.done) : { done: !t.done };
    if (p.TaskPart) setParts(p.TaskPart);
    emit(p);
  };

  /* Keyboard: Esc closes the innermost thing, then the card; ⌘Enter ticks it. */
  React.useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation(); e.preventDefault();
        if (pop) setPop(null); else if (menu) setMenu(false); else onClose && onClose();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.stopPropagation(); e.preventDefault(); toggleDone();
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  });
  /* A click outside an open popover / menu closes it. */
  React.useEffect(() => {
    if (!pop && !menu) return;
    const h = (e) => {
      if (popRef.current && popRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest("[data-tdc-trigger]")) return;
      setPop(null); setMenu(false);
    };
    document.addEventListener("mousedown", h, true);
    return () => document.removeEventListener("mousedown", h, true);
  }, [pop, menu]);
  /* The notes field grows with its text. */
  React.useLayoutEffect(() => {
    const n = notesRef.current; if (!n) return;
    n.style.height = "auto"; n.style.height = n.scrollHeight + "px";
  }, [notes, open]);

  if (!open) return null;

  const openPop = (key, e, anchor) => {
    if (pop && pop.key === key) { setPop(null); return; }
    const a = (anchor || e.currentTarget).getBoundingClientRect(), c = cardRef.current.getBoundingClientRect();
    setQ(""); setMenu(false);
    setPop({ key: key, x: a.left - c.left, y: a.bottom - c.top + 6 });
  };
  const anchorStyle = (p) => ({ "--tdc-x": p.x + "px", "--tdc-y": p.y + "px" });

  /* ── derived ── */
  const proj = t.projectId ? N.project(t.projectId) : null;
  const time = N.timeLabel ? N.timeLabel(t) : null;
  const dayName = t.dueDate ? tdDayName(t.dueDate) : null;
  const dateValue = dayName ? dayName + (time ? " · " + time : "") : time ? time : null;
  const late = !!(t.overdue && !t.done);
  const prio = tdPrio(t.priority);
  const prioLabel = prio ? (TD_PRIO.find((p) => p[0] === prio) || [prio, prio])[1] : null;
  const labels = Array.isArray(t.labels) ? t.labels : [];
  const repeat = TD_REPEAT.find((r) => r[0] === (t.repeat || null));
  const holder = t.holder && t.holder !== "you" ? N.person(t.holder) : null;
  const closed = parts.filter((p) => p.done).length;
  const fixed = t.isFixed === true || t.auto === false;
  const chunk = t.chunk || null;
  const deadline = t.deadline || null;
  const hours = t.hours || "work";
  const schedDefault = !fixed && !chunk && !deadline && hours === "work";
  const schedSum = [
    fixed ? "Fixed" + (time ? " " + time : "") : "Auto" + (time ? " " + time : ""),
    chunk ? "min block " + chunk + " min" : null,
    deadline ? (t.hardDeadline ? "hard deadline " : "deadline ") + tdShort(deadline) : null,
    hours !== "work" ? (TD_HOURS.find((h) => h[0] === hours) || [0, hours])[1].toLowerCase() : null
  ].filter(Boolean).join(" · ");
  const firstOpen = parts.filter((p) => !p.done)[0];
  const wayIn = entry.trim() || (firstOpen && firstOpen.title) || null;
  const created = t.createdAt ? tdShort(N.toDate(t.createdAt)) : null;
  const updated = t.updatedAt ? tdAgo(t.updatedAt) : null;
  const inProgress = t.status === "in_progress" && !t.done;
  const attachments = Array.isArray(t.attachments) ? t.attachments : [];
  const chipDefs = [
    { k: "date", glyph: "calendar", value: dateValue, empty: "Date", danger: late, title: late ? "Past its date and still open — move it or let it go" : "Date and time" },
    { k: "duration", glyph: "hourglass", value: tdDur(t.estimatedMinutes), empty: "Duration", title: "Duration" },
    { k: "project", glyph: "folder", dot: proj ? proj.color : null, value: proj ? proj.name : null, empty: "Project", title: "Project" },
    { k: "priority", glyph: "flag", value: prioLabel, empty: "Priority", danger: prio === "urgent", title: prio === "urgent" ? "Urgent priority" : "Priority" },
    { k: "labels", glyph: "tag", value: labels.length ? labels[0] + (labels.length > 1 ? " +" + (labels.length - 1) : "") : null, empty: "Labels", title: labels.length ? labels.join(", ") : "Labels" },
    { k: "repeat", glyph: "repeat", value: repeat && repeat[0] ? repeat[1] : null, empty: "Repeat", title: "Repeat" }
  ];
  if (holder) chipDefs.push({ k: "who", glyph: "user", value: holder.name, empty: "Who", title: "Held by " + holder.name });
  const foldedDefs = chipDefs.filter((c) => folded.indexOf(c.k) > -1);
  const foldedOpen = !!(pop && foldedDefs.some((c) => c.k === pop.key));
  const foldedTitle = foldedDefs.map((c) => c.value ? (c.k === "labels" ? labels.join(", ") : c.value) : "No " + c.empty.toLowerCase()).join(" · ");

  /* ── edits ── */
  const editTitle = (v) => { setTitle(v); emit({ title: v }); };
  const commitTitle = () => { if (!title.trim()) { const v = (snap.current && snap.current.before.title) || "Untitled"; setTitle(v); emit({ title: v }); } };
  const editParts = (fn) => {
    const next = fn(parts).map((p, i) => p.id ? p : Object.assign({ id: t.id + "." + Date.now().toString(36) + i }, p));
    setParts(next); emit({ TaskPart: next });
    return next;
  };
  const addPartAfter = (i, text) => {
    const id = t.id + "." + Date.now().toString(36);
    editParts((l) => { const c = l.slice(); c.splice(i + 1, 0, { id: id, title: text || "", done: false }); return c; });
    setFocusId(id);
  };
  const setDate = (isoDay) => {
    setPop(null);
    if (!isoDay) { emit({ dueDate: null, scheduledStart: null, scheduledEnd: null, isFixed: false }); return; }
    emit(t.scheduledStart ? N.moveDay(t, isoDay) : { dueDate: isoDay });
  };
  const setTime = (v) => {
    if (!v) { emit({ scheduledStart: null, scheduledEnd: null, isFixed: false }); return; }
    const m = /^(\d{1,2}):(\d{2})/.exec(v); if (!m) return;
    emit(Object.assign(N.placeAt(t, t.dueDate || tdIso(tdToday()), +m[1] + +m[2] / 60), { auto: false }));
  };
  const setFixed = (v) => emit(v ? { isFixed: true, auto: false } : { isFixed: false, auto: true });
  const editNotes = (v) => { setNotes(v); emit({ notes: v.trim() ? v : null }); };
  const editEntry = (v) => { setEntry(v); emit({ entry: v.trim() ? v : null }); };
  const app = window.__app || {};
  const quietClose = () => { if (snap.current) snap.current.quiet = true; onClose && onClose(); };
  const restore = (id) => { if (app.updateTask) app.updateTask(id, { trashedAt: null }); };

  const act = {
    duplicate: () => {
      setMenu(false);
      if (!task || !app.setTasksRaw) return;
      const nid = Date.now() + Math.random();
      const copy = Object.assign({}, task, { id: nid, title: task.title + " (copy)", done: false, createdAt: new Date().toISOString(), updatedAt: null,
        TaskPart: (task.TaskPart || []).map((p, i) => Object.assign({}, p, { id: nid + "." + (i + 1) })) });
      app.setTasksRaw((l) => { const i = l.findIndex((x) => String(x.id) === String(task.id)); const c = l.slice(); c.splice(i + 1, 0, copy); return c; });
      window.toast && window.toast("Duplicated", { undo: () => app.setTasksRaw((l) => l.filter((x) => x.id !== nid)) });
    },
    toEvent: () => {
      setMenu(false);
      if (!task || !window.calEvents) return;
      const ev = window.calEvents.add(N.eventAt(t.dueDate || tdIso(tdToday()), N.at(t) != null ? N.at(t) : 9, t.estimatedMinutes || 60, { title: t.title }));
      onChange(N.trashTask(task)); quietClose();
      window.toast && window.toast("Converted to an event", { undo: () => { window.calEvents.remove(ev.id); restore(task.id); } });
    },
    toDoc: () => {
      setMenu(false);
      if (!task || !window.docs) return;
      const text = notes.trim();
      const d = window.docs.create({ title: t.title, projectId: t.projectId || null, hue: proj ? proj.color : null, body: text ? [{ id: "b1", kind: "p", text: text }] : [] });
      onChange(N.trashTask(task)); quietClose();
      window.toast && window.toast("Converted to a document", { undo: () => { window.docs.remove(d.id); restore(task.id); } });
    },
    move: () => { setMenu(false); const a = cardRef.current.querySelector('[data-tdc-trigger="project"]'); if (a) openPop("project", null, a); },
    sched: () => { setMenu(false); setSchedOpen(!schedOpen); },
    progress: () => { setMenu(false); emit({ status: inProgress ? "todo" : "in_progress", Stage: inProgress ? "todo" : "doing" }); },
    link: () => {
      setMenu(false);
      const url = "needt.app/t/" + t.id;
      window.needtPlatform.copy(url);
      window.toast && window.toast("Link copied");
    },
    remove: () => {
      setMenu(false);
      if (!task) { onClose && onClose(); return; }
      onChange(N.trashTask(task)); quietClose();
      window.toast && window.toast("Moved to Trash", { undo: () => restore(task.id) });
    }
  };
  const attach = (files) => {
    const add = Array.from(files || []).map((f, i) => ({ id: "a" + Date.now().toString(36) + i, name: f.name, size: f.size }));
    if (add.length) emit({ attachments: attachments.concat(add) });
  };

  /* ── popover bodies ── */
  const projects = pop && pop.key === "project" ? tdProjects() : [];
  const allLabels = (() => {
    if (!pop || pop.key !== "labels") return [];
    const set = {}; TD_LABELS.forEach((l) => { set[l] = 1; });
    ((app.tasksNow) || []).forEach((x) => (x.labels || []).forEach((l) => { set[l] = 1; }));
    labels.forEach((l) => { set[l] = 1; });
    return Object.keys(set);
  })();
  const ql = q.trim().toLowerCase();
  const nextMonday = tdIso(tdAdd(tdToday(), ((8 - tdToday().getDay()) % 7) || 7));
  const popBody = !pop ? null : pop.key === "date" || pop.key === "deadline" ? (() => {
    const isDl = pop.key === "deadline";
    const val = isDl ? deadline : t.dueDate || null;
    const pick = isDl ? (v) => { setPop(null); emit({ deadline: v }); } : setDate;
    const quick = [["Today", "sun", tdIso(tdToday())], ["Tomorrow", "sunrise", tdIso(tdAdd(tdToday(), 1))], ["Next week", "calendar-days", nextMonday]];
    if (!isDl) quick.push(["Someday", "archive", null]);
    return (
      <div className="tdc-pop-date">
        <div className="tdc-quick">
          {quick.map(([label, glyph, v]) => (
            <button key={label} type="button" className={"tdc-quick-btn" + (val === v || (!v && !val && !isDl && t.dueDate == null) ? " is-on" : "")} onClick={() => pick(v)}>
              <Icon name={glyph} size={14} /><span>{label}</span>
            </button>
          ))}
        </div>
        <TdCalendar value={val} onPick={pick} />
        {isDl ? (
          <div className="tdc-pop-row">
            <span className="tdc-pop-label">Hard deadline</span>
            <Switch checked={!!t.hardDeadline} onChange={(v) => emit({ hardDeadline: !!v })} />
          </div>
        ) : (
          <div className="tdc-pop-row">
            <span className="tdc-pop-label"><Icon name="clock" size={13} />Time</span>
            <input className="tdc-time" type="time" value={time || ""} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
            {time ? <button type="button" className="nx-btn nx-btn-text nx-btn-sm" onClick={() => setTime(null)}>No time</button> : null}
          </div>
        )}
        {val ? <button type="button" className="nx-btn nx-btn-text nx-btn-sm tdc-pop-clear" onClick={() => pick(null)}>{isDl ? "Remove deadline" : "Clear date"}</button> : null}
      </div>
    );
  })() : pop.key === "duration" ? (
    <div className="tdc-pop-dur">
      <div className="tdc-dur-grid">
        {TD_DUR.map((m) => (
          <button key={m} type="button" className={"tdc-dur" + (t.estimatedMinutes === m ? " is-on" : "")} aria-pressed={t.estimatedMinutes === m}
            onClick={() => { setPop(null); emit({ estimatedMinutes: m }); }}>{tdDur(m)}</button>
        ))}
      </div>
      {t.estimatedMinutes ? <button type="button" className="nx-btn nx-btn-text nx-btn-sm tdc-pop-clear" onClick={() => { setPop(null); emit({ estimatedMinutes: null }); }}>No duration</button> : null}
    </div>
  ) : pop.key === "project" ? (
    <div className="tdc-pop-list">
      <label className="tdc-search"><Icon name="search" size={13} /><input autoFocus placeholder="Find a project" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <div className="tdc-list">
        {!ql ? (
          <button type="button" className={"tdc-opt" + (!t.projectId ? " is-on" : "")} onClick={() => { setPop(null); emit({ projectId: null }); }}>
            <span className="tdc-dot is-none" aria-hidden="true" /><span className="tdc-opt-text">No project</span>{!t.projectId ? <Icon name="check" size={14} /> : null}
          </button>
        ) : null}
        {projects.filter((p) => !ql || p.name.toLowerCase().indexOf(ql) > -1).map((p) => (
          <button key={p.id} type="button" className={"tdc-opt" + (t.projectId === p.id ? " is-on" : "")} onClick={() => { setPop(null); emit({ projectId: p.id }); }}>
            <span className="tdc-dot" ref={(el) => { if (el) el.style.setProperty("--tdc-hue", p.color || "var(--text-quaternary)"); }} aria-hidden="true" />
            <span className="tdc-opt-text">{p.name}</span>{t.projectId === p.id ? <Icon name="check" size={14} /> : null}
          </button>
        ))}
        {ql && !projects.some((p) => p.name.toLowerCase().indexOf(ql) > -1) ? <span className="tdc-empty">No project called “{q.trim()}”</span> : null}
      </div>
    </div>
  ) : pop.key === "priority" ? (
    <div className="tdc-list">
      {TD_PRIO.map(([k, label], i) => (
        <button key={k} type="button" className={"tdc-opt" + (prio === k ? " is-on" : "")} onClick={() => { setPop(null); emit({ priority: k }); }}>
          <span className={"tdc-flag is-" + k}><Icon name="flag" size={14} /></span><span className="tdc-opt-text">{label}</span>
          <span className="tdc-opt-key">P{i + 1}</span>{prio === k ? <Icon name="check" size={14} /> : null}
        </button>
      ))}
      <button type="button" className={"tdc-opt" + (!prio ? " is-on" : "")} onClick={() => { setPop(null); emit({ priority: null }); }}>
        <span className="tdc-flag"><Icon name="ban" size={14} /></span><span className="tdc-opt-text">No priority</span>{!prio ? <Icon name="check" size={14} /> : null}
      </button>
    </div>
  ) : pop.key === "labels" ? (
    <div className="tdc-pop-list">
      <label className="tdc-search"><Icon name="tag" size={13} /><input autoFocus placeholder="Find or create a label" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) { const v = q.trim(); const hit = allLabels.find((l) => l.toLowerCase() === v.toLowerCase()); const name = hit || v; emit({ labels: labels.indexOf(name) > -1 ? labels.filter((x) => x !== name) : labels.concat([name]) }); setQ(""); } }} /></label>
      <div className="tdc-list">
        {allLabels.filter((l) => !ql || l.toLowerCase().indexOf(ql) > -1).map((l) => {
          const on = labels.indexOf(l) > -1;
          return (
            <button key={l} type="button" role="menuitemcheckbox" aria-checked={on} className={"tdc-opt" + (on ? " is-on" : "")}
              onClick={() => emit({ labels: on ? labels.filter((x) => x !== l) : labels.concat([l]) })}>
              <span className={"tdc-box" + (on ? " is-on" : "")} aria-hidden="true">{on ? <Icon name="check" size={11} /> : null}</span>
              <span className="tdc-opt-text">{l}</span>
            </button>
          );
        })}
        {ql && !allLabels.some((l) => l.toLowerCase() === ql) ? (
          <button type="button" className="tdc-opt" onClick={() => { emit({ labels: labels.concat([q.trim()]) }); setQ(""); }}>
            <span className="tdc-flag"><Icon name="plus" size={14} /></span><span className="tdc-opt-text">Create “{q.trim()}”</span>
          </button>
        ) : null}
      </div>
    </div>
  ) : pop.key === "repeat" ? (
    <div className="tdc-list">
      {TD_REPEAT.map(([k, label]) => (
        <button key={label} type="button" className={"tdc-opt" + ((t.repeat || null) === k ? " is-on" : "")} onClick={() => { setPop(null); emit({ repeat: k }); }}>
          <span className="tdc-opt-text">{label}</span>{(t.repeat || null) === k ? <Icon name="check" size={14} /> : null}
        </button>
      ))}
    </div>
  ) : pop.key === "more" ? (
    <div className="tdc-list" role="menu">
      {foldedDefs.map((c) => (
        <button key={c.k} type="button" role="menuitem" className={"tdc-opt" + (c.danger ? " is-danger" : "")} title={c.title}
          onClick={() => { setPop(null); openPop(c.k, null, moreRef.current); }}>
          <span className="tdc-flag">{c.dot ? <span className="tdc-dot" ref={(el) => { if (el) el.style.setProperty("--tdc-hue", c.dot); }} aria-hidden="true" /> : <Icon name={c.glyph} size={14} />}</span>
          <span className={"tdc-opt-text" + (c.value ? "" : " is-empty")}>{c.value ? (c.k === "labels" ? labels.join(", ") : c.value) : c.empty}</span>
        </button>
      ))}
    </div>
  ) : pop.key === "who" ? (
    <div className="tdc-list">
      {(N.people || []).map((p) => (
        <button key={p.id} type="button" className={"tdc-opt" + ((t.holder || "you") === p.id ? " is-on" : "")} onClick={() => { setPop(null); emit({ holder: p.id }); }}>
          <span className="tdc-face" ref={(el) => { if (el) el.style.setProperty("--tdc-hue", p.hue); }}>{p.initials}</span>
          <span className="tdc-opt-text">{p.id === "you" ? "Me" : p.name}</span>{(t.holder || "you") === p.id ? <Icon name="check" size={14} /> : null}
        </button>
      ))}
    </div>
  ) : null;

  const menuItems = [
    ["copy", "Duplicate", act.duplicate],
    ["calendar", "Convert to event", act.toEvent],
    ["file-text", "Convert to document", act.toDoc],
    ["folder", "Move to project…", act.move],
    ["calendar-clock", schedOpen ? "Hide scheduling" : "Scheduling…", act.sched]
  ];
  if (t.status && !t.done) menuItems.push(["loader", inProgress ? "Mark as to do" : "Mark in progress", act.progress]);
  menuItems.push(["link", "Copy link", act.link]);

  return (
    <div className="tdc-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div ref={cardRef} className={"tdc-card" + (t.done ? " is-done" : "")} role="dialog" aria-modal="true" aria-label={title || "Task"}>
        <header className="tdc-head">
          <button type="button" className={"tdc-check" + (t.done ? " is-on" : inProgress ? " is-half" : "") + (checkTick ? " is-ticking" : "")} role="checkbox" aria-checked={!!t.done}
            aria-label={t.done ? "Mark not done" : "Mark done"} title={(t.done ? "Reopen" : "Done") + " · ⌘↵"} onClick={toggleDone}>
            {t.done ? <Icon name="check" size={14} /> : null}
          </button>
          <textarea className="tdc-title" rows={1} value={title} placeholder="Name it" aria-label="Title"
            onChange={(e) => editTitle(e.target.value.replace(/\n/g, " "))} onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); e.currentTarget.blur(); } }} />
          <span className="tdc-head-end">
            <button type="button" data-tdc-trigger="menu" className="tdc-icon-btn" aria-label="More" aria-expanded={menu ? "true" : "false"} aria-haspopup="menu"
              onClick={() => { setPop(null); setMenu(!menu); }}><Icon name="ellipsis" size={16} /></button>
            <button type="button" className="tdc-icon-btn" aria-label="Close" title="Close · Esc" onClick={onClose}><Icon name="x" size={16} /></button>
          </span>
          {menu ? (
            <div ref={popRef} className="tdc-pop tdc-menu" role="menu">
              {menuItems.map(([glyph, label, fn]) => (
                <button key={label} type="button" role="menuitem" className="tdc-opt" onClick={fn}>
                  <span className="tdc-flag"><Icon name={glyph === "loader" ? "circle-check" : glyph} size={14} /></span><span className="tdc-opt-text">{label}</span>
                </button>
              ))}
              <span className="tdc-sep" role="separator" />
              <button type="button" role="menuitem" className="tdc-opt is-danger" onClick={act.remove}>
                <span className="tdc-flag"><Icon name="trash-2" size={14} /></span><span className="tdc-opt-text">Delete</span>
              </button>
            </div>
          ) : null}
        </header>

        <div ref={chipsRef} className="tdc-chips">
          {chipDefs.filter((c) => folded.indexOf(c.k) < 0).map((c) => (
            <TdChip key={c.k} k={c.k} glyph={c.glyph} dot={c.dot} value={c.value} empty={c.empty} danger={c.danger} title={c.title}
              open={pop && pop.key === c.k && !foldedOpen} onOpen={(e) => openPop(c.k, e)} />
          ))}
          {foldedDefs.length ? (
            <button ref={moreRef} type="button" data-tdc-trigger="more" className="tdc-chip tdc-more" aria-haspopup="menu"
              aria-expanded={pop && (pop.key === "more" || foldedOpen) ? "true" : "false"} aria-label={foldedDefs.length + " more: " + foldedTitle} title={foldedTitle}
              onClick={(e) => openPop("more", e)}>
              <span className="tdc-chip-text">+{foldedDefs.length}</span>
            </button>
          ) : null}
          <div ref={measureRef} className="tdc-chips-measure" aria-hidden="true" inert="">
            {chipDefs.map((c) => <TdChip key={c.k} measure k={c.k} glyph={c.glyph} dot={c.dot} value={c.value} empty={c.empty} />)}
            <span className="tdc-chip tdc-more"><span className="tdc-chip-text">+{chipDefs.length}</span></span>
          </div>
        </div>

        {!schedDefault && !schedOpen ? (
          <button type="button" className="tdc-sum" onClick={() => setSchedOpen(true)} title="Scheduling">
            <Icon name="calendar-clock" size={13} /><span className="tdc-sum-text">{schedSum}</span>
          </button>
        ) : null}

        <div className="tdc-body" onScroll={() => { if (pop && pop.key === "deadline") setPop(null); }}>
          {schedOpen ? (
            <section className="tdc-sched" aria-label="Scheduling">
              <div className="tdc-sched-head">
                <span className="tdc-label"><Icon name="calendar-clock" size={13} />Scheduling</span>
                <button type="button" className="nx-btn nx-btn-text nx-btn-sm" onClick={() => setSchedOpen(false)}>Done</button>
              </div>
              <div className="tdc-srow">
                <span className="tdc-srow-label">Placement</span>
                <span className="tdc-seg" role="group" aria-label="Placement">
                  <button type="button" aria-pressed={!fixed} onClick={() => setFixed(false)}>Auto</button>
                  <button type="button" aria-pressed={fixed} onClick={() => setFixed(true)}>Fixed</button>
                </span>
                <span className="tdc-srow-hint">{fixed ? (time ? "Stays at " + time : "Stays where you put it") : time ? "Planned " + time + " — Needt may move it" : "Needt finds the slot"}</span>
              </div>
              <div className="tdc-srow">
                <span className="tdc-srow-label">Min. work block</span>
                <span className="tdc-pills">
                  {TD_CHUNK.map((c) => <button key={String(c)} type="button" className="tdc-pill" aria-pressed={chunk === c} onClick={() => emit({ chunk: c })}>{c ? c + " min" : "Don’t split"}</button>)}
                </span>
              </div>
              <div className="tdc-srow">
                <span className="tdc-srow-label">Deadline</span>
                <button type="button" data-tdc-trigger="deadline" className={"tdc-chip" + (deadline ? "" : " is-empty")} aria-expanded={pop && pop.key === "deadline" ? "true" : "false"}
                  onClick={(e) => openPop("deadline", e)}>
                  <Icon name="calendar-clock" size={13} /><span className="tdc-chip-text">{deadline ? (t.hardDeadline ? "Hard · " : "") + tdDayName(deadline) : "Deadline"}</span>
                </button>
              </div>
              <div className="tdc-srow">
                <span className="tdc-srow-label">Hours</span>
                <span className="tdc-seg" role="group" aria-label="Hours">
                  {TD_HOURS.map(([k, label]) => <button key={k} type="button" aria-pressed={hours === k} onClick={() => emit({ hours: k })}>{label}</button>)}
                </span>
              </div>
            </section>
          ) : null}

          <textarea ref={notesRef} className="tdc-notes" rows={1} value={notes} placeholder="Add notes" aria-label="Notes"
            onChange={(e) => editNotes(e.target.value)} />

          <section className="tdc-subs" aria-label="Subtasks">
            {parts.length ? (
              <div className="tdc-subs-head">
                <span className="tdc-label">Subtasks</span>
                <TdRing done={closed} total={parts.length} />
              </div>
            ) : null}
            {parts.map((p, i) => (
              <div key={p.id || i} className={"tdc-sub" + (drag && drag.over === i && drag.from !== i ? (drag.from < i ? " is-drop-after" : " is-drop-before") : "") + (drag && drag.from === i ? " is-dragging" : "")}
                draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(i)); } catch (x) {} setDrag({ from: i, over: i }); }}
                onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (drag.over !== i) setDrag({ from: drag.from, over: i }); }}
                onDrop={(e) => { e.preventDefault(); if (!drag) return; const f = drag.from; setDrag(null); if (f === i) return; editParts((l) => { const c = l.slice(); const [m] = c.splice(f, 1); c.splice(i, 0, m); return c; }); }}
                onDragEnd={() => setDrag(null)}>
                <span className="tdc-grip" aria-hidden="true"><Icon name="grip-vertical" size={13} /></span>
                <button type="button" className={"tdc-sub-check" + (p.done ? " is-on" : "") + (p.done && subTick != null && subTick === (p.id || i) ? " is-ticking" : "")} role="checkbox" aria-checked={!!p.done} aria-label={p.done ? "Reopen subtask" : "Tick subtask"}
                  onClick={() => { setSubTick(p.done ? null : (p.id || i)); editParts((l) => l.map((x, j) => (j === i ? Object.assign({}, x, { done: !x.done }) : x))); }}>
                  {p.done ? <Icon name="check" size={11} /> : null}
                </button>
                <input ref={(el) => { partRefs.current[p.id] = el; }} className={"tdc-sub-title" + (p.done ? " is-done" : "")} value={p.title} placeholder="Subtask" aria-label="Subtask"
                  onChange={(e) => { const v = e.target.value; editParts((l) => l.map((x, j) => (j === i ? Object.assign({}, x, { title: v }) : x))); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); addPartAfter(i, ""); }
                    else if (e.key === "Backspace" && !p.title) { e.preventDefault(); const prev = parts[i - 1]; editParts((l) => l.filter((_, j) => j !== i)); if (prev) setFocusId(prev.id); }
                  }}
                  onBlur={() => { if (!p.title.trim()) editParts((l) => l.filter((x) => x.id !== p.id)); }} />
                <button type="button" className="tdc-icon-btn tdc-sub-del" aria-label="Remove subtask" onClick={() => editParts((l) => l.filter((_, j) => j !== i))}><Icon name="x" size={13} /></button>
              </div>
            ))}
            <label className="tdc-sub tdc-sub-add">
              <span className="tdc-grip" aria-hidden="true" />
              <span className="tdc-sub-plus" aria-hidden="true"><Icon name="plus" size={14} /></span>
              <input className="tdc-sub-title" value={addText} placeholder="Add subtask" aria-label="Add subtask" onChange={(e) => setAddText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && addText.trim()) { e.preventDefault(); editParts((l) => l.concat([{ title: addText.trim(), done: false }])); setAddText(""); } }} />
            </label>
          </section>

          <div className="tdc-step" data-tdc-step="">
            <span className="tdc-step-arrow" aria-hidden="true"><Icon name="arrow-right" size={14} /></span>
            <label className="tdc-step-label" htmlFor="tdc-entry">First step</label>
            <input id="tdc-entry" className="tdc-step-input" value={entry} placeholder={(firstOpen && firstOpen.title) || "The smallest thing that counts as starting"}
              aria-label="First step" onChange={(e) => editEntry(e.target.value)} />
            {wayIn && !t.done && task ? (
              <button type="button" className="nx-btn nx-btn-text nx-btn-sm tdc-step-go" title="Start a focus session on the first step"
                onClick={() => { if (app.setFocus) { app.setFocus({ intention: wayIn, planned: t.estimatedMinutes || 25, elapsed: 0, taskId: t.id }); onClose && onClose(); } }}>Start focus</button>
            ) : <span className="tdc-step-cost">2 min</span>}
          </div>

          {attachments.length ? (
            <div className="tdc-files">
              {attachments.map((a) => (
                <span key={a.id} className="tdc-file"><Icon name="paperclip" size={12} /><span className="tdc-file-name">{a.name}</span>
                  <button type="button" className="tdc-icon-btn" aria-label={"Remove " + a.name} onClick={() => emit({ attachments: attachments.filter((x) => x.id !== a.id) })}><Icon name="x" size={12} /></button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <footer className="tdc-foot">
          <span className="tdc-meta">{[created ? "Created " + created : null, updated ? "Updated " + updated : null].filter(Boolean).join(" · ") || (task ? "Changes save as you type" : "Draft — nothing is saved")}</span>
          <button type="button" className="nx-btn nx-btn-text nx-btn-sm" onClick={() => window.needtPlatform.pickFile({ multiple: true }).then(attach)}><Icon name="paperclip" size={14} />Attach</button>
          <span className="tdc-saved" data-on={flash ? "1" : "0"} aria-live="polite"><Icon name="check" size={12} />Saved</span>
        </footer>

        {pop && popBody ? (
          <div ref={popRef} className={"tdc-pop is-" + pop.key} role="dialog" aria-label={pop.key} style={anchorStyle(pop)}>{popBody}</div>
        ) : null}
      </div>
    </div>
  );
}

/* It finds things as well as doing them: tasks and documents are matched by
   name alongside the places and the actions. */
const PALETTE_DOCS = ["Launch brief — September", "Needt design rules", "Scheduler — placement notes", "Weekly review, week 35"];

function CommandPalette({ open, onClose, onScreen, tasks }) {
  const [q, setQ] = React.useState("");
  if (!open) return null;
  const hit = (s) => s.toLowerCase().indexOf(q.toLowerCase()) > -1;
  const foundTasks = (tasks || []).filter((t) => q && hit(t.title)).slice(0, 5);
  const foundDocs = PALETTE_DOCS.filter((t) => q && hit(t)).slice(0, 4);
  const items = [
    ["Open Today", "today", "calendar-days", "⌘1"],
    ["Open Projects", "projects", "folder-kanban", "⌘2"],
    ["Open Calendar", "calendar", "calendar", "⌘3"],
    ["Open Documents", "docs", "file-text", "⌘4"],
    ["Plan my day", "today", "wand-sparkles", "⌘⇧P"]
  ].filter((i) => hit(i[0]));
  return (
    <div className="nt-scrim docs-td-palette-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="docs-td-palette">
        <div className="docs-td-palette-field">
          <Icon name="arrow-right" size={16} />
          <input autoFocus className="nt-input nt-input-plain docs-td-palette-input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="docs-td-meta-muted">esc</span>
        </div>
        <div className="nt-menu-sep" />
        {foundTasks.length ? <MenuLabel>Tasks</MenuLabel> : null}
        {foundTasks.map((t) => (
          <MenuItem key={t.id} icon={<Icon name="circle" size={14} />} shortcut={window.NEEDT.dueLabel(t) || ""} onClick={() => { onScreen("today"); onClose(); }}>{t.title}</MenuItem>
        ))}
        {foundDocs.length ? <MenuLabel>Documents</MenuLabel> : null}
        {foundDocs.map((t) => (
          <MenuItem key={t} icon={<Icon name="file-text" size={14} />} onClick={() => { onScreen("doc"); onClose(); }}>{t}</MenuItem>
        ))}
        {items.length ? <MenuLabel>Go to</MenuLabel> : null}
        {items.map(([label, screen, icon, keys]) => (
          <MenuItem key={label} icon={<Icon name={icon} size={14} />} shortcut={keys} onClick={() => { onScreen(screen); onClose(); }}>{label}</MenuItem>
        ))}
        {!items.length && !foundTasks.length && !foundDocs.length
          ? <p className="nt-empty-text docs-td-palette-empty">Nothing matches. Press Enter to capture it as a task.</p> : null}
      </div>
    </div>
  );
}

Object.assign(window, { TaskDialog, CommandPalette });
