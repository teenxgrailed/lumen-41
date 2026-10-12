/* phone-tasks.jsx — Tasks and Projects in the Plates material (08.10.26).
 *
 * Registers window.PkPlaces.tasks and window.PkPlaces.projects, replacing
 * MobileApp's MbTasks (Inbox / Today / Upcoming / All + the project filter
 * cards) and MbProjects / MbProjCard.
 *
 *   Tasks     a compact segmented control (Inbox · Today · Upcoming · All, open
 *             counts), a small header line ("Done 3 of 9 · 2 h 50 left" + a
 *             thin bar on Today), the tab's sections as PkSection (each folds;
 *             Done is one fold at the bottom, shut), PkTaskRow everywhere
 *             (swipe right = done, left = tomorrow), pull down = search / add
 *             to today (the root's pull). The project filter cards are gone:
 *             a project has its own page now (Projects).
 *   Projects  calm rows on the ground: a colour tile, the name, "4 open ·
 *             next: …", a small progress ring. A row opens the project's page:
 *             tile + name + "4 open · 2 h 50 left", one "Add a task" field,
 *             open tasks grouped Overdue / Today / Upcoming / No date, a Done
 *             fold, and a ⋯ sheet with Edit / Delete — work.jsx WkProjectPage's
 *             rules, phone-sized.
 *
 * Drag and drop (09.10.26, wave 3 #10, phone-drag.jsx): long-press a row
 * to lift it; drop it between rows to reorder, or into / onto another
 * section to move it there (Today, a day, Inbox, a project, No date). The
 * place is the data: a section is a day / project / no date, and inside a
 * time-sorted section the gap is a time — the row takes the slot after the
 * row above it (or before the row below), so the list keeps the order you
 * dropped. One write, with Undo (ptkDropWrite).
 *
 * Edits go through pkDay (toggle / later / create / update). Projects: the
 * one registry in stores.jsx (window.projects: edit / remove with Undo — the
 * desktop's rules and storage keys). Styles: styles/phone-tasks.css (ptk-*),
 * colours: themes.css --ptk-* over --v2p-*.
 */
const PtkNS = window.NeedtDesignSystem_25d3c8;
const { Icon: PtkIcon } = PtkNS;
const ptkCx = (...a) => a.filter(Boolean).join(" ");

/* ══ Projects: the one registry (stores.jsx projectStore / projects —
   the desktop's store, the same keys and rules) ══════════════════════════ */
const PTK_SWATCHES = [["Lavender", "var(--accent)"], ["Blue", "var(--info)"], ["Green", "var(--success)"], ["Red", "var(--destructive)"], ["Grey", "var(--text-muted)"]];
const ptkHueOf = (p) => (p && (p.color || mbHue(p.name))) || "var(--v2p-ink-3)";
function ptkUseProjects() { return window.useProjects().list; }

/* ══ Shared bits ═══════════════════════════════════════════════════════════ */
const ptkByDay = (a, b) => mbDayKey(a) - mbDayKey(b) || mbAtKey(a) - mbAtKey(b);
const ptkByTime = (a, b) => mbAtKey(a) - mbAtKey(b);
const ptkMins = (l) => l.reduce((s, t) => s + (t.estimatedMinutes || 0), 0);
const ptkAhead = (t) => !t.overdue && mbDueDay(t) != null && mbDueDay(t) > MB_TODAY;

/* ══ Drag and drop: where a dropped row goes ═══════════════════════════════
   A zone spec: { mode: "move" | "none", label, date, timed, projectId, fallback }
     date      an ISO day · null = no date (Inbox, No date) · "nb" = the day of
               the row it lands next to (fallback when it lands alone) ·
               undefined = keep its day
     timed     the section is sorted by time: the gap is a time slot
     projectId set on a move into the zone (null = no project) */
const ptkIso = (d) => window.NEEDT.toDate(d + " Sep");
const ptkHHMM = (h) => String(Math.floor(h)).padStart(2, "0") + ":" + String(Math.round((h % 1) * 60)).padStart(2, "0");
/* the phone's times are half hours (mbTime), so a dropped time is too */
const ptkUp = (h) => Math.ceil(h * 2 - 1e-6) / 2, ptkDown = (h) => Math.floor(h * 2 + 1e-6) / 2;
function ptkDropWrite(r, specs, say) {
  const store = window.mbTaskStore, N = window.NEEDT;
  const list = store.get();
  const find = (id) => (id == null ? null : list.filter((x) => String(x.id) === String(id))[0] || null);
  const t = find(r.id), spec = specs[r.to];
  if (!t || !spec || (spec.mode === "none" && r.to !== r.from)) return;
  const prev = find(r.after), next = find(r.before);
  const cross = r.to !== r.from;
  const patch = {};
  if (cross && spec.projectId !== undefined) patch.projectId = spec.projectId;
  const day = spec.date === "nb" ? (prev && prev.dueDate) || (next && next.dueDate) || spec.fallback || t.dueDate || ptkIso(MB_TODAY)
    : spec.date === undefined ? t.dueDate : spec.date;
  let hour = mbAt(t);
  if (day == null) {
    if (t.dueDate || t.scheduledStart || t.isFixed) Object.assign(patch, { dueDate: null, scheduledStart: null, scheduledEnd: null, isFixed: false, overdue: false });
    hour = null;
  } else if (spec.timed) {
    /* the gap is a time: right after the row above, else just before the
       row below; a time that already sorts there is kept */
    const dur = (x) => (x.estimatedMinutes || 30) / 60;
    const P = prev && prev.dueDate === day ? prev : null, X = next && next.dueDate === day ? next : null;
    const pA = P ? mbAt(P) : null, xA = X ? mbAt(X) : null, own = t.dueDate === day ? mbAt(t) : null;
    const fits = own != null && (pA == null ? !P : own >= pA) && (xA == null || own <= xA);
    if (fits) hour = own;
    else if (P && pA == null) hour = null;
    else if (P) { const c = ptkUp(pA + dur(P)); hour = (xA != null && c > xA) || c >= 24 ? pA : c; }
    else if (X && xA != null) { const c = ptkDown(xA - dur(t)); hour = c >= 0 ? c : xA; }
    else hour = mbAt(t);
    if (hour == null) Object.assign(patch, { dueDate: day, scheduledStart: null, scheduledEnd: null, isFixed: false });
    else if (hour !== mbAt(t) || day !== t.dueDate) Object.assign(patch, N.placeAt(t, day, hour));
    if (day !== t.dueDate || t.overdue) patch.overdue = false;
  } else if (day !== t.dueDate) Object.assign(patch, N.moveDay(t, day), { overdue: false });

  /* one write: the new fields, and the row's place in the one task order */
  const at0 = list.indexOf(t);
  const nt = Object.keys(patch).length ? N.sync(Object.assign({}, t, patch)) : t;
  const place = (l, row) => {
    const o = l.filter((x) => String(x.id) !== String(t.id));
    const pi = prev ? o.findIndex((x) => x.id === prev.id) : -1, ni = next ? o.findIndex((x) => x.id === next.id) : -1;
    o.splice(pi > -1 ? pi + 1 : ni > -1 ? ni : Math.min(at0, o.length), 0, row);
    return o;
  };
  const moved = place(list, nt);
  if (nt === t && moved.indexOf(t) === at0) return;
  pkDay.queue(t.id, "Moved");
  store.set((l) => place(l, nt));
  const undo = () => store.set((l) => { const o = l.filter((x) => String(x.id) !== String(t.id)); o.splice(Math.min(at0, o.length), 0, t); return o; });
  const timeNow = mbAt(nt), timeMoved = timeNow != null && timeNow !== mbAt(t);
  if (cross) say("Moved to " + spec.label + (timeMoved ? " · " + ptkHHMM(timeNow) : ""), undo);
  else if (timeMoved) say("Now at " + ptkHHMM(timeNow), undo);
  else if (nt !== t) say("Moved", undo);
}
/* The zone around a section: what phone-drag reads (data-pd-*). */
function PtkZone({ k, spec, folded, children }) {
  return <div className="ptk-zone" data-pd-zone={k} data-pd-mode={spec ? spec.mode : "none"} data-pd-folded={folded ? "1" : undefined}>{children}</div>;
}
/* The drag hook (phone-drag.jsx pdAttach), inline so the hook order never depends on load
   order: attaches pdAttach to the list once it is mounted. */
function usePtkDrag(specs, say, busy) {
  const o = React.useRef(null);
  o.current = {
    canLift: (id) => { const t = window.mbTaskStore.get().filter((x) => String(x.id) === String(id))[0]; return !!t && !t.done && !busy[t.id]; },
    onDrop: (r) => ptkDropWrite(r, specs, say)
  };
  const [el, setEl] = React.useState(null);
  React.useEffect(() => (el && window.pdAttach ? window.pdAttach(el, () => o.current) : undefined), [el]);
  return { ref: setEl };
}

/* The row exit and swipes, one copy for both screens. strip = drop the
   project label (inside a project's page). */
function usePtkRows(say, strip, onOpen) {
  const X = usePkExit((t, kind) => { if (kind === "later") say("Moved to tomorrow", pkDay.later(t)); else pkDay.toggle(t.id); });
  const row = (t) => (
    <PkTaskRow key={t.id} t={t} hideProject={strip} late={!!t.overdue && !t.done} phase={X.phase[t.id]} out={!!X.out[t.id]}
      canDone={!t.done} canLater={!t.done && !ptkAhead(t)}
      onCheck={(x) => (x.done ? pkDay.toggle(x.id) : X.exit(t, "check"))} onOpen={() => onOpen && onOpen(t)} onSwipe={(side) => X.exit(t, side)} />
  );
  return { row: row, busy: X.phase };
}

/* A long list shows its first cap rows and one quiet "Show N more". */
function PtkCapped({ list, render, cap }) {
  const [all, setAll] = React.useState(false);
  const c = cap || MB_CAP_TASKS;
  const shown = all ? list : list.slice(0, c);
  return (
    <>
      {shown.map(render)}
      {list.length > c && !all ? <button type="button" className="ptk-more" onClick={() => setAll(true)}>Show {list.length - c} more</button> : null}
    </>
  );
}

function PtkBar({ pct, hue }) {
  return <span className="ptk-bar" aria-hidden="true"><span className="ptk-bar-fill" style={{ "--p": Math.max(0, Math.min(1, pct)).toFixed(3), "--hue": hue || undefined }} /></span>;
}
function PtkRing({ pct, hue, size }) {
  const z = size || 28, r = z / 2 - 2.5, c = 2 * Math.PI * r;
  return (
    <svg width={z} height={z} viewBox={"0 0 " + z + " " + z} className="ptk-ring" aria-hidden="true" style={{ "--hue": hue }}>
      <circle cx={z / 2} cy={z / 2} r={r} className="ptk-ring-track" />
      <circle cx={z / 2} cy={z / 2} r={r} className="ptk-ring-fill" strokeDasharray={c.toFixed(2)} strokeDashoffset={(c * (1 - pct)).toFixed(2)} transform={"rotate(-90 " + z / 2 + " " + z / 2 + ")"} />
    </svg>
  );
}
function PtkTile({ p, big }) {
  return <span className={ptkCx("ptk-tile", big && "is-big")} style={{ "--hue": ptkHueOf(p) }} aria-hidden="true"><PtkIcon name={p.icon || "folder"} size={big ? 22 : 17} /></span>;
}

/* ══ Tasks ═════════════════════════════════════════════════════════════════ */
const PTK_TABS = [["inbox", "Inbox"], ["today", "Today"], ["upcoming", "Upcoming"], ["all", "All"]];
const PTK_EMPTY = {
  inbox: "Inbox is clear. Anything you jot down without a day lands here.",
  today: "All clear for today ✓",
  upcoming: "Nothing coming up this week.",
  all: "No tasks yet — pull down to add one."
};
let ptkLastTab = "today";

function PtkTasks({ tasks, onOpen, say, pull }) {
  const projects = ptkUseProjects();
  const [tab, setTabRaw] = React.useState(ptkLastTab);
  const setTab = (id) => { ptkLastTab = id; setTabRaw(id); };
  const [fold, setFold] = React.useState({ __done: true });
  const flip = (k) => () => setFold((f) => Object.assign({}, f, { [k]: !f[k] }));
  const R = usePtkRows(say, false, onOpen);

  const live = tasks.filter((t) => !t.noSlot);
  const inbox = live.filter((t) => !t.dueDate && !t.isFixed);
  const today = live.filter((t) => t.overdue || mbDueDay(t) === MB_TODAY);
  const upcoming = live.filter((t) => ptkAhead(t) && mbDueDay(t) < 20);
  const scope = { inbox: inbox, today: today, upcoming: upcoming, all: live }[tab];
  const isOpen = (t) => !t.done;

  let sections = [];
  if (tab === "inbox") sections = [["Inbox", inbox]];
  if (tab === "today") sections = [["Overdue", today.filter((t) => t.overdue)], ["Today", today.filter((t) => !t.overdue)]];
  if (tab === "upcoming") {
    const days = [];
    upcoming.forEach((t) => { const d = mbDueDay(t); if (days.indexOf(d) < 0) days.push(d); });
    days.sort((a, b) => a - b);
    sections = days.map((d) => [(d === MB_TODAY + 1 ? "Tomorrow" : mbDayName(d)) + ", " + d + " Sep", upcoming.filter((t) => mbDueDay(t) === d)]);
  }
  if (tab === "all") {
    sections = [["Inbox", inbox]].concat(projects.map((p) => [p.name, live.filter((t) => t.projectId === p.id && (t.dueDate || t.isFixed))]))
      .concat([["No project", live.filter((t) => !t.projectId && (t.dueDate || t.isFixed))]]);
  }
  sections = sections.map(([k, l]) => [k, l.filter(isOpen).sort(k === "Today" ? ptkByTime : ptkByDay)]).filter((x) => x[1].length);
  /* what a drop into each section means (ptkDropWrite) */
  const specs = { Overdue: { mode: "none" }, Done: { mode: "none" } };
  if (tab === "inbox") specs.Inbox = { mode: "move", date: null, label: "Inbox" };
  if (tab === "today") specs.Today = { mode: "move", date: ptkIso(MB_TODAY), timed: true, label: "Today" };
  if (tab === "upcoming") sections.forEach(([k]) => { const d = parseInt(k.split(", ")[1], 10); specs[k] = { mode: "move", date: ptkIso(d), timed: true, label: d === MB_TODAY + 1 ? "Tomorrow" : mbDayName(d) }; });
  if (tab === "all") {
    specs.Inbox = { mode: "move", date: null, label: "Inbox" };
    projects.forEach((p) => { specs[p.name] = { mode: "move", date: "nb", fallback: ptkIso(MB_TODAY), timed: true, projectId: p.id, label: p.name }; });
    specs["No project"] = { mode: "move", date: "nb", fallback: ptkIso(MB_TODAY), timed: true, projectId: null, label: "No project" };
  }
  const dz = usePtkDrag(specs, say, R.busy);
  const doneList = scope.filter((t) => t.done).sort(ptkByTime);

  /* The header: one compact line for the tab, never the hero. */
  const open = scope.filter(isOpen);
  const late = open.filter((t) => t.overdue).length;
  const mins = ptkMins(open.filter((t) => !R.busy[t.id]));
  const left = mins ? mbDur(mins) + " left" : null;
  const counts = { inbox: inbox.filter(isOpen).length, today: today.filter(isOpen).length, upcoming: upcoming.filter(isOpen).length, all: null };
  const doneN = scope.length - open.length;
  const sub = (
    <span className="ptk-sub" data-ptk-count={doneN + "/" + scope.length}>
      {scope.length
        ? <span>Done <PkNumber value={doneN} label={String(doneN)} /> of <PkNumber value={scope.length} label={String(scope.length)} /></span>
        : <span><PkNumber value={open.length} label={String(open.length)} /> open</span>}
      {left ? <span className="ptk-sub-sep">{left}</span> : null}
      {late && tab !== "upcoming" ? <span className="ptk-sub-sep ptk-sub-late"><span className="pk-alert-dot" />{late} overdue</span> : null}
    </span>
  );
  const head = (
    <>
      <PtkBar pct={scope.length ? doneN / scope.length : 0} />
      <div className="ptk-seg" role="tablist" aria-label="Which tasks">
        {PTK_TABS.map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={ptkCx("ptk-seg-btn", tab === id && "is-on")} onClick={() => setTab(id)} data-ptk-tab={id}>
            <span>{l}</span>{counts[id] ? <span className="ptk-seg-n">{counts[id] > 99 ? "99+" : counts[id]}</span> : null}
          </button>
        ))}
      </div>
    </>
  );
  const moveToToday = () => { const r = pkDay.moveOverdue(tasks); if (r) say(r.label, r.undo); };

  return (
    <PkScreen screen="tasks" title="Tasks" sub={sub} head={head} headClass="ptk-head" onPull={pull}>
      <div key={tab} ref={dz.ref} className="ptk-swap" data-ptk-view={tab}>
        {sections.map(([k, l]) => (
          <PtkZone key={k} k={k} spec={specs[k]} folded={!!fold[k]}>
            <PkSection title={k} tone={k === "Overdue" ? "late" : null} count={l.length} folded={!!fold[k]} onFold={flip(k)}
              action={k === "Overdue" ? <PkButton kind="chip" onClick={moveToToday}>Move to today</PkButton> : null}>
              <PtkCapped list={l} render={R.row} />
            </PkSection>
          </PtkZone>
        ))}
        {!sections.length ? <PkEmpty line={!live.length ? PTK_EMPTY.all : PTK_EMPTY[tab]} /> : null}
        {doneList.length ? (
          <PtkZone k="Done" spec={specs.Done} folded={!!fold.__done}>
            <PkSection title="Done" count={doneList.length} folded={!!fold.__done} onFold={flip("__done")}>
              <PtkCapped list={doneList} render={R.row} />
            </PkSection>
          </PtkZone>
        ) : null}
      </div>
    </PkScreen>
  );
}

/* ══ Projects ══════════════════════════════════════════════════════════════ */
function PtkProjectRow({ p, tasks, onPick }) {
  const mine = tasks.filter((t) => t.projectId === p.id);
  const open = mine.filter((t) => !t.done).sort(ptkByDay);
  const pct = mine.length ? (mine.length - open.length) / mine.length : 0;
  const meta = open.length ? open.length + " open · next: " + open[0].title : mine.length ? "All done" : "No tasks yet";
  return (
    <button type="button" className="ptk-prow" onClick={() => onPick(p.id)} data-ptk-project={p.id} aria-label={p.name + ", " + (open.length ? open.length + " open" : meta)}>
      <PtkTile p={p} />
      <span className="ptk-prow-main">
        <span className="ptk-prow-name">{p.name}</span>
        <span className="ptk-prow-meta">{meta}</span>
      </span>
      <span className="ptk-prow-ring" title={Math.round(pct * 100) + "% done"}><PtkRing pct={pct} hue={ptkHueOf(p)} /></span>
    </button>
  );
}

function PtkActions({ open, onClose, title, items }) {
  return (
    <PkSheet open={open} onClose={onClose} title={title} label="Project options" bodyClass="ptk-acts">
      {items.map((a) => (
        <button key={a.id} type="button" className={ptkCx("ptk-act", a.danger && "is-danger")} onClick={a.onClick} data-ptk-act={a.id}>
          <span className="ptk-act-icon"><PtkIcon name={a.icon} size={18} /></span>
          <span className="ptk-act-main"><span className="ptk-act-title">{a.title}</span>{a.line ? <span className="ptk-act-line">{a.line}</span> : null}</span>
        </button>
      ))}
    </PkSheet>
  );
}

function PtkEditSheet({ open, p, onClose, onSave }) {
  const [name, setName] = React.useState("");
  const [hue, setHue] = React.useState(PTK_SWATCHES[0][1]);
  React.useEffect(() => { if (open && p) { setName(p.name); setHue(p.color || PTK_SWATCHES[0][1]); } }, [open]);
  const clean = name.trim();
  const dupe = !!(p && clean && clean.toLowerCase() !== p.name.toLowerCase() && window.projects.list().some((x) => x.name.toLowerCase() === clean.toLowerCase()));
  const ok = !!clean && !dupe;
  const swatches = PTK_SWATCHES.slice();
  if (p && p.color && !swatches.some((s) => s[1] === p.color)) swatches.unshift(["Current", p.color]);
  const save = () => { if (ok) onSave({ name: clean, color: hue }); };
  return (
    <PkSheet open={open} onClose={onClose} title="Edit project" label="Edit project"
      footer={<><PkButton onClick={onClose}>Cancel</PkButton><PkButton kind="primary" disabled={!ok} onClick={save} data-ptk-save>Save</PkButton></>}>
      <div className="ptk-edit">
        <PkField label="Name" id="ptk-edit-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name"
          inputProps={{ onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }, "data-ptk-edit-name": "" }} />
        {dupe ? <p className="ptk-edit-err">A project with this name exists.</p> : null}
        <div className="ptk-edit-colours">
          <span className="pk-label">Colour</span>
          <div className="ptk-swatches" role="radiogroup" aria-label="Colour">
            {swatches.map(([l, v]) => (
              <button key={l} type="button" role="radio" aria-checked={hue === v} aria-label={l} className={ptkCx("ptk-swatch", hue === v && "is-on")} style={{ "--hue": v }} onClick={() => setHue(v)} />
            ))}
          </div>
        </div>
      </div>
    </PkSheet>
  );
}

function PtkProjectPage({ p, tasks, say, onOpen, onBack }) {
  const hue = ptkHueOf(p);
  const mine = tasks.filter((t) => t.projectId === p.id);
  const open = mine.filter((t) => !t.done), done = mine.filter((t) => t.done).sort(ptkByTime);
  const late = open.filter((t) => t.overdue);
  const R = usePtkRows(say, true, onOpen);
  const left = ptkMins(open.filter((t) => !R.busy[t.id]));
  const pct = mine.length ? done.length / mine.length : 0;
  const [fold, setFold] = React.useState({ __done: true });
  const flip = (k) => () => setFold((f) => Object.assign({}, f, { [k]: !f[k] }));
  const [draft, setDraft] = React.useState("");
  const [menu, setMenu] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const addRef = React.useRef(null);
  const groups = [
    ["Overdue", late.slice().sort(ptkByDay)],
    ["Today", open.filter((t) => !t.overdue && mbDueDay(t) === MB_TODAY).sort(ptkByTime)],
    ["Upcoming", open.filter((t) => ptkAhead(t)).sort(ptkByDay)],
    ["No date", open.filter((t) => !t.overdue && mbDueDay(t) == null)]
  ].filter((g) => g[1].length);
  const specs = {
    Overdue: { mode: "none" }, Done: { mode: "none" },
    Today: { mode: "move", date: ptkIso(MB_TODAY), timed: true, label: "Today" },
    Upcoming: { mode: "move", date: "nb", fallback: ptkIso(MB_TODAY + 1), timed: true, label: "Upcoming" },
    "No date": { mode: "move", date: null, label: "No date" }
  };
  const dz = usePtkDrag(specs, say, R.busy);

  /* Add: a task of this project with no day yet (WkProjectPage's rule). */
  const addTitle = (title) => {
    const id = pkDay.create({ title: title });
    pkDay.update(id, { projectId: p.id, dueDate: null });
    say("Added to “" + p.name + "”", () => window.mbTaskStore.set((l) => l.filter((x) => x.id !== id)));
  };
  const add = () => { const title = draft.trim(); if (!title) return; addTitle(title); setDraft(""); };
  const del = () => { setMenu(false); const r = window.projects.remove(p.name, { quiet: true }); onBack(); if (r) say(r.label, r.undo); };
  const pull = Object.assign(pkTaskPull({ tasks: mine, onOpen: onOpen, onAdd: addTitle }), {
    placeholder: "Search or add to " + p.name, hint: "This project's tasks, by any word. Enter adds one here.", addLabel: (q) => (q ? "Add “" + q + "”" : "Add to " + p.name)
  });

  const head = (
    <div className="ptk-ph" data-ptk-page={p.id}>
      <PkButton kind="ghost" icon="chevron-left" className="ptk-back" onClick={onBack} data-ptk-back>Projects</PkButton>
      <div className="ptk-ph-row">
        <PtkTile p={p} big />
        <h1 className="pk-title ptk-ph-name">{p.name}</h1>
        <button type="button" className="ptk-round" aria-label="Project options" onClick={() => setMenu(true)} data-ptk-menu><PtkIcon name="ellipsis" size={20} /></button>
      </div>
      <p className="pk-sub ptk-sub">
        <span><PkNumber value={open.length} label={String(open.length)} /> open</span>
        {left ? <span className="ptk-sub-sep">{mbDur(left)} left</span> : !open.length && mine.length ? <span className="ptk-sub-sep">all done</span> : null}
        {late.length ? <span className="ptk-sub-sep ptk-sub-late"><span className="pk-alert-dot" />{late.length} overdue</span> : null}
      </p>
      {mine.length ? <PtkBar pct={pct} hue={hue} /> : null}
    </div>
  );

  return (
    <>
      <PkScreen screen="project" compactTitle={p.name} head={head} headClass="ptk-head is-page" onPull={pull}>
        <div className="ptk-add">
          <span className="ptk-add-plus" aria-hidden="true"><PtkIcon name="plus" size={18} /></span>
          <input ref={addRef} className="ptk-add-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={"Add a task to " + p.name} aria-label={"Add a task to " + p.name}
            enterKeyHint="done" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") { setDraft(""); e.currentTarget.blur(); } }} data-ptk-add />
          {draft.trim() ? <PkButton kind="chip" className="ptk-add-go" onClick={add} data-ptk-add-go>Add</PkButton> : null}
        </div>
        <div ref={dz.ref} className="ptk-zones">
          {groups.map(([k, l]) => (
            <PtkZone key={k} k={k} spec={specs[k]} folded={!!fold[k]}>
              <PkSection title={k} tone={k === "Overdue" ? "late" : null} count={l.length} folded={!!fold[k]} onFold={flip(k)}>
                <PtkCapped list={l} render={R.row} />
              </PkSection>
            </PtkZone>
          ))}
          {done.length ? (
            <PtkZone k="Done" spec={specs.Done} folded={!!fold.__done}>
              <PkSection title="Done" count={done.length} folded={!!fold.__done} onFold={flip("__done")}>
                <PtkCapped list={done} render={R.row} />
              </PkSection>
            </PtkZone>
          ) : null}
        </div>
        {!groups.length && !done.length ? <PkEmpty line="Nothing in this project yet — add the first task above." /> : null}
        {!groups.length && done.length ? <PkEmpty line="All done here ✓" /> : null}
      </PkScreen>

      <PtkActions open={menu} onClose={() => setMenu(false)} title={p.name} items={[
        { id: "edit", icon: "pencil", title: "Edit project", line: "Name and colour", onClick: () => { setMenu(false); setEditing(true); } },
        { id: "delete", icon: "trash-2", title: "Delete project", danger: true, line: open.length ? open.length + (open.length === 1 ? " open task moves" : " open tasks move") + " to No project" : "Its tasks stay, with no project", onClick: del }
      ]} />
      <PtkEditSheet open={editing} p={p} onClose={() => setEditing(false)}
        onSave={(v) => { if (window.projects.edit(p, v)) { setEditing(false); say("Saved"); } }} />
    </>
  );
}

function PtkProjects({ tasks, onOpen, say }) {
  const projects = ptkUseProjects();
  const [openId, setOpenRaw] = React.useState(null);
  const setOpen = (id) => setOpenRaw(id);
  const live = tasks.filter((t) => !t.noSlot);
  const page = openId ? projects.filter((p) => p.id === openId)[0] || null : null;

  if (page) return <div key={"p-" + page.id} className="ptk-stage"><PtkProjectPage p={page} tasks={live} say={say} onOpen={onOpen} onBack={() => setOpen(null)} /></div>;

  const openN = live.filter((t) => t.projectId && !t.done && projects.some((p) => p.id === t.projectId)).length;
  const pull = {
    search: (q) => projects.filter((p) => p.name.toLowerCase().indexOf(q.toLowerCase()) > -1).slice(0, 5).map((p) => {
      const n = live.filter((t) => t.projectId === p.id && !t.done).length;
      return { id: p.id, title: p.name, meta: n ? n + " open" : "All done" };
    }),
    onPick: (hit) => setOpen(hit.id),
    placeholder: "Search projects",
    hint: "Projects, by any word in their name."
  };
  return (
    <div key="list" className="ptk-stage">
      <PkScreen screen="projects" title="Projects" onPull={pull}
        sub={projects.length ? <span className="ptk-sub"><span>{projects.length} {projects.length === 1 ? "project" : "projects"}</span><span className="ptk-sub-sep"><PkNumber value={openN} label={String(openN)} /> open</span></span> : null}>
        {projects.length ? (
          <div className="ptk-plist">{projects.map((p) => <PtkProjectRow key={p.id} p={p} tasks={live} onPick={setOpen} />)}</div>
        ) : <PkEmpty line="No projects yet. Projects are made on the desktop for now — they show up here at once." />}
      </PkScreen>
    </div>
  );
}

window.PkPlaces = window.PkPlaces || {};
window.PkPlaces.tasks = PtkTasks;
window.PkPlaces.projects = PtkProjects;
