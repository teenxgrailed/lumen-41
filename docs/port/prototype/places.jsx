/* PLACES — Habits, Templates, Trash, Shared as real screens (06.10.26).
   Same header as Documents: the place's own picture, the title, one quiet line. */
const PlNS = window.NeedtDesignSystem_25d3c8;
const { Icon: PlIcon, Avatar: PlAvatar } = PlNS;

function PlaceHeader({ art, title, meta, actions, add }) {
  return (
    <header className="pl-place-header-row">
      {add || <window.Art name={art} size={30} />}
      <h1 className="pl-place-header-text" title={typeof title === "string" ? title : undefined}>{title}</h1>
      {meta ? <span className="pl-place-header-text-2">{meta}</span> : null}
      <span className="pl-place-header-row-2">{actions}</span>
    </header>
  );
}
/* Sky header (07.10.26): Templates and Shared open on a short painted-sky
   banner — the title in Exposure, the meta line, and three of the place's own
   pages on frosted glass. The grid below is unchanged. */
function PlSceneHeader({ variant, kicker, title, meta, actions, prints, add }) {
  if (!window.PxSky) return <PlaceHeader art="template" title={title} meta={meta} actions={actions} add={add} />;
  const Sky = window.PxSky, Glass = window.GlassCard;
  const at = [[0, 34], [112, 16], [224, 44]];
  return (
    <header className="pl-scene nx-swap pl-scene-header-header" data-pl-scene={variant}>
      <Sky variant={variant} radius={20} intensity={1.4} meadow={false}>
        <div className="pl-scene-header-abs">
          <div data-px-calm className="pl-scene-header-col">
            <span className="px-kicker">{kicker}</span>
            <span className="pl-scene-header-row">
              {add || null}
              <h1 className="px-display px-on-sky pl-scene-header-text">{title}</h1>
            </span>
            <span className="pl-scene-header-row-2">
              {meta ? <span className="px-on-sky pl-scene-header-text-2">{meta}</span> : null}
              {actions}
            </span>
          </div>
          <div className="pl-scene-prints pl-scene-header-abs-2" aria-label={"From " + title}>
            {prints.slice(0, 3).map((pr, i) => (
              <Glass key={pr.doc.id} className="pl-thumb" pad={6} radius={16} caption={pr.caption} onClick={pr.onOpen} label={"Open " + (pr.doc.title || "Untitled")}
                style={{ position: "absolute", left: at[i][0], top: at[i][1], zIndex: i === 1 ? 2 : 1 }}>
                {window.DocThumb ? <span className="pl-scene-header-el"><window.DocThumb doc={pr.doc} w={96} h={118} /></span> : null}
              </Glass>
            ))}
          </div>
        </div>
      </Sky>
    </header>
  );
}
/* Buttons use the shared system in app.css (UI-RULES.md): nx-btn + one of
   primary / secondary / text / danger. */

/* Hover for the small custom controls here: one step of fill. !important
   because their resting ground is set inline. */
const PL_CSS = ".pl-habit-more:hover, .pl-mb-more:hover { background: var(--fill-3) !important; color: var(--text-primary) !important; }"
  + " .pl-seg[aria-pressed=\"false\"]:hover, .pl-chip[aria-pressed=\"false\"]:hover { background: var(--fill-3) !important; }";

/* Empty place: the place's picture, one line, one action. */
function PlEmpty({ art, title, line, action }) {
  return (
    <div className="nx-swap pl-empty pl-empty-col">
      <window.Art name={art} size={56} />
      <span className="pl-empty-text">{title}</span>
      <span className="pl-line">{line}</span>
      {action ? <span className="pl-empty-text-3">{action}</span> : null}
    </div>
  );
}

/* ---------- Habits ---------- */
/* Projects for pickers and boards: the live project store when work.jsx has
   one (its hook returns {list} or a plain array), else the seed list. */
function plUseProjectNames() {
  const r = window.useProjects ? window.useProjects() : null;
  const arr = Array.isArray(r) ? r : r && Array.isArray(r.list) ? r.list : (window.WK_PROJECTS || []);
  return arr.filter((p) => p && p.name && !p.archived).map((p) => p.name);
}
const plHue = (name) => window.projectHue ? window.projectHue(name) : window.cvProject ? window.cvProject(name).color : "var(--accent)";
const PL_QUOTAS = [[null, "Every day"], [3, "3× a week"], [5, "5× a week"]];

/* A Craft sheet: portalled, a scrim behind, Esc or a click outside closes.
   `habit` set means edit (rename) mode; otherwise it makes a new one. */
function PlHabitSheet({ open, habit, onClose }) {
  const [shown, leaving] = window.useExit ? window.useExit(open, 170) : [open, false];
  const projects = plUseProjectNames();
  /* The form speaks the database: schedule.time, schedule.perWeek, projectId. */
  const [f, setF] = React.useState({ title: "", time: "", perWeek: null, projectId: null });
  const nameRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    setF(habit ? { title: habit.title, time: window.NEEDT.habitTime(habit) || "", perWeek: window.NEEDT.habitPerWeek(habit), projectId: habit.projectId || null } : { title: "", time: "", perWeek: null, projectId: null });
    const t = setTimeout(() => { if (nameRef.current) { nameRef.current.focus(); nameRef.current.select(); } }, 40);
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => { clearTimeout(t); document.removeEventListener("keydown", esc); };
  }, [open]);
  if (!shown) return null;
  const at = f.time.trim();
  const atOk = !at || /^([01]?\d|2[0-3]):[0-5]\d$/.test(at);
  const ok = f.title.trim() && atOk;
  const norm = (v) => { if (!v) return null; const [h, m] = v.split(":"); return h.padStart(2, "0") + ":" + m; };
  const save = () => {
    if (!ok || !window.habitApi) return;
    const p = { title: f.title.trim(), schedule: { time: norm(at), perWeek: f.perWeek }, projectId: f.projectId };
    if (habit) {
      const before = window.habitApi.find(habit.id);
      window.habitApi.patch(habit.id, p);
      window.toast("Habit updated", { undo: () => before && window.habitApi.patch(habit.id, { title: before.title, schedule: before.schedule, projectId: before.projectId }) });
    } else {
      const h = window.habitApi.add(p);
      window.toast("Habit “" + h.title + "” added", { undo: () => window.habitApi.remove(h.id) });
    }
    onClose();
  };
  return ReactDOM.createPortal(
    <div className={("nx-scrim" + (leaving ? " is-leaving" : "")) + " pl-habit-sheet-grid"} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label={habit ? "Edit habit" : "New habit"} className={("nx-sheet pl-habit-sheet" + (leaving ? " is-leaving" : "")) + " pl-habit-sheet-col"}
        onKeyDown={(e) => { if (e.key === "Enter" && e.target.tagName === "INPUT") save(); }}>
        <div className="pl-row-12">
          <window.Art name="habit" size={32} />
          <span className="pl-habit-sheet-col-2">
            <span className="pl-sheet-title">{habit ? "Edit habit" : "New habit"}</span>
            <span className="pl-meta">Comes back daily, never piles up</span>
          </span>
        </div>
        <label className="pl-stack-6">
          <span className="pl-label">Name</span>
          <input ref={nameRef} name="habit-name" value={f.title} placeholder="New habit" onChange={(e) => setF(Object.assign({}, f, { title: e.target.value }))} className="pl-field" />
        </label>
        <label className="pl-stack-6">
          <span className="pl-label">Time <span className="pl-habit-sheet-text-3">· optional</span></span>
          <input name="habit-time" value={f.time} placeholder="HH:MM" inputMode="numeric" onChange={(e) => setF(Object.assign({}, f, { time: e.target.value }))}
            className={"pl-field is-time is-num" + (atOk ? "" : " is-invalid")} />
        </label>
        <div className="pl-stack-6">
          <span className="pl-label">Days per week</span>
          <span className="pl-habit-sheet-row-2">
            {PL_QUOTAS.map(([q, n]) => <button key={n} type="button" className="pl-seg pl-seg-btn" aria-pressed={f.perWeek === q} onClick={() => setF(Object.assign({}, f, { perWeek: q }))}>{n}</button>)}
          </span>
        </div>
        <div className="pl-stack-6">
          <span className="pl-label">Project <span className="pl-habit-sheet-text-3">· optional</span></span>
          <span className="pl-habit-sheet-row-3">
            {[null].concat(projects).map((p) => {
              const pid = p ? window.NEEDT.projectIdOf(p) : null;
              const on = f.projectId === pid;
              return (
                <button key={p || "none"} type="button" className={"pl-chip pl-habit-sheet-row-4" + (on ? " is-on" : "")} aria-pressed={on} onClick={() => setF(Object.assign({}, f, { projectId: pid }))}>
                  <span className="pl-habit-sheet-row-5" style={p ? { "--pl-project": plHue(p) } : undefined}><PlIcon name="folder" size={12} /></span>{p || "No project"}
                </button>
              );
            })}
          </span>
        </div>
        <div className="pl-habit-sheet-row-6">
          <button type="button" className="nx-btn nx-btn-text" onClick={onClose}>Cancel</button>
          <button type="button" className="nx-btn nx-btn-primary pl-habit-save" disabled={!ok} onClick={save}>{habit ? "Save" : "Create habit"}</button>
        </div>
      </div>
    </div>, document.body);
}

function PlHabitMenu({ h, onRename }) {
  return (
    <span onClick={(e) => e.stopPropagation()} className="pl-habit-menu-row">
      <window.RichMenu small align="right" width={200} items={[
        { art: "page", title: "Rename", onClick: () => onRename(h) },
        { art: "trash", title: "Archive", onClick: () => window.habitApi && window.habitApi.archive(h.id) }
      ]} trigger={<button type="button" aria-label={"More for " + h.title} className="nx-press pl-habit-more pl-habit-menu-grid">
        <PlIcon name="ellipsis" size={14} /></button>} />
    </span>
  );
}

/* Pro (08.10.26, paywall.jsx): Free keeps 3 habits and 1 moodboard; more
   habits, more boards and Pinterest are Pro. A click past the limit opens the
   paywall on that feature — nothing is lost, nothing pops up on its own. */
const PL_FREE_HABITS = 3, PL_FREE_BOARDS = 1;
const plUsePro = () => (window.useNeedtPro ? window.useNeedtPro() : true);
function HabitsScreen() {
  const list = window.useHabits ? window.useHabits() : ((window.NEEDT && window.NEEDT.habits) || []);
  const [sheet, setSheet] = React.useState({ open: false, habit: null });
  const pro = plUsePro();
  const atLimit = !pro && list.length >= PL_FREE_HABITS;
  const openNew = () => { if (atLimit) { window.openPaywall && window.openPaywall("More than " + PL_FREE_HABITS + " habits"); return; } setSheet({ open: true, habit: null }); };
  const openEdit = (h) => setSheet({ open: true, habit: h });
  React.useEffect(() => {
    const on = (e) => { if (e.detail === "habit") openNew(); };
    window.addEventListener("needt-new", on); return () => window.removeEventListener("needt-new", on);
  });
  return (
    <div className="scroll-inner pl-habits-col">
      <style>{PL_CSS}</style>
      <PlaceHeader art="habit" title="Habits" meta={!pro && window.ProLimit
          ? <window.ProLimit used={list.length} max={PL_FREE_HABITS} noun="habits" feature={"More than " + PL_FREE_HABITS + " habits"} />
          : list.length + (list.length === 1 ? " habit" : " habits") + " · nothing carries over"}
        add={<window.PageAddButton label="New habit" onClick={openNew} />} />
      {!list.length ? (
        <PlEmpty art="habit" title="No habits yet" line="Pick one small thing to do every day — it comes back daily and never piles up."
          action={<button type="button" className="nx-btn nx-btn-primary" onClick={openNew}><PlIcon name="plus" size={14} />New habit</button>} />
      ) : (
      <>
      {/* 08.10.26: Today leads — large check-in cards (Habits.jsx HabitToday,
          which also carries the old shelf's strip, count and ⋯ menu). The
          four-month dots and the time-left cards follow, secondary. */}
      <section className="nx-swap pl-habits-today">
        {window.HabitToday ? <window.HabitToday menu={(h) => <PlHabitMenu h={h} onRename={openEdit} />} /> : null}
      </section>
      <div className="pl-habits-grid">
        <section className="nx-swap pl-habits-col-2">
          <span className="pl-sheet-title">Last four months</span>
          <span className="pl-habits-text">One dot a day. Coloured — kept, grey — missed, ring — still ahead.</span>
          {window.HabitRail ? <window.HabitRail /> : null}
        </section>
        <div className="pl-habits-side">
          {window.HabitLeft ? <section className="nx-swap pl-habits-left"><window.HabitLeft /></section> : null}
        </div>
      </div>
      </>
      )}
      <PlHabitSheet open={sheet.open} habit={sheet.habit} onClose={() => setSheet((x) => ({ open: false, habit: x.habit }))} />
    </div>
  );
}

/* ---------- Templates ---------- */
const TEMPLATES = [
  { id: "t-daily", title: "Daily note", style: { ground: "mist" }, label: "Template", meta: "5 blocks", body: [["lead", "What would make today a good day?"], ["h", "Plan"], ["todo", "First task"], ["todo", "Second task"], ["h", "Notes"], ["p", "Write as you go."]] },
  { id: "t-review", title: "Weekly review", style: { ground: "sage" }, label: "Template", meta: "6 blocks", body: [["h", "Went well"], ["li", "…"], ["h", "Didn't"], ["li", "…"], ["h", "Next week"], ["todo", "One thing that matters"]] },
  { id: "t-drop", title: "Product drop", style: { ground: "sand" }, label: "Template", meta: "8 blocks", body: [["callout", "Drop date, price, quantity — decide these first."], ["h", "Checklist"], ["todo", "Samples approved"], ["todo", "Photos shot"], ["todo", "Listing written"], ["shot"]] },
  { id: "t-meeting", title: "Meeting notes", style: null, label: "Template", meta: "4 blocks", body: [["p", "Who, when, why."], ["h", "Decisions"], ["li", "…"], ["h", "Actions"], ["todo", "Owner — task — date"]] },
  { id: "t-listing", title: "Resale listing", style: { ground: "stone" }, label: "Template", meta: "6 blocks", body: [["table", [["Brand", "—"], ["Size", "—"], ["Condition", "—"], ["Price", "CHF —"]]], ["p", "Measurements and flaws, in that order."]] },
  { id: "t-brief", title: "Project brief", style: { ground: "mist" }, label: "Template", meta: "7 blocks", body: [["lead", "One sentence: what changes when this ships."], ["h", "Scope"], ["li", "In"], ["li", "Out"], ["h", "Open questions"], ["todo", "…"]] }
];
const plLoad = (k) => { try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
const plMk = window.makeStore || function (init) { let v = init; const subs = new Set(); return { get: () => v, set: (n) => { v = typeof n === "function" ? n(v) : n; subs.forEach((f) => f(v)); }, sub: (f) => { subs.add(f); return () => subs.delete(f); } }; };
function plUseStore(store) {
  const [v, setV] = React.useState(store.get());
  React.useEffect(() => store.sub(setV), []);
  return v;
}
/* Templates: the built-in set plus the user's own ("needt.templates"); one
   store so the edge-case switcher can swap either. */
const plTplStore = plMk({ mine: plLoad("needt.templates"), builtin: TEMPLATES });
/* Persisted through needtSync; another window's templates land in the store. */
if (window.needtSync) window.needtSync.bind(plTplStore, "needt.templates", {
  save: (v) => v.mine,
  load: (mine) => Object.assign({}, plTplStore.get(), { mine: Array.isArray(mine) ? mine : [] })
});
/* A template card makes a real page: title + today's date, the template's
   blocks copied, then the page opens. Undo takes the page back out. */
function plFromTemplate(t) {
  if (!window.docs || !window.docs.create) return;
  const d = window.docs.fromTemplate(t);
  window.toast("Created from “" + (t.title || "Untitled") + "”", { undo: () => window.docs.remove(d.id) });
  window.docs.open(d.id);
}
/* No "+" here (07.10.26, owner): a template is picked, not made, on this screen. */
function TemplatesScreen() {
  const DocCard = window.DocCard;
  const tpl = plUseStore(plTplStore);
  const all = tpl.mine.concat(tpl.builtin);
  return (
    <div className="scroll-inner pl-page">
      <PlSceneHeader variant="b" kicker="Templates" title="Templates" meta={all.length ? all.length + " to start from" : "Nothing to start from yet"}
        prints={all.filter((t) => t.style && t.style.ground).slice(0, 3).map((t) => ({ doc: t, caption: t.title, onOpen: () => plFromTemplate(t) }))} />
      {!all.length ? (
        <PlEmpty art="template" title="No templates yet" line="Templates you save from a page show up here, ready to start from." />
      ) : null}
      <div className="pl-templates-grid">
        {all.map((t, i) => (
          <div key={t.id} className="nx-swap" style={{ animationDelay: Math.min(i, 12) * 35 + "ms" }}>
            {DocCard ? <DocCard doc={t} onOpen={() => plFromTemplate(t)} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Trash ---------- */
/* trashedAt is a timestamp; the row says it the way it always did. */
const plAgo = (ts) => {
  const t = ts ? Date.parse(ts) : NaN;
  if (isNaN(t)) return ts || "today";
  const min = (Date.now() - t) / 60000;
  return min < 60 ? "Just now" : min < 24 * 60 ? "today" : new Date(t).getDate() + " " + window.NEEDT.MONTHS[new Date(t).getMonth()];
};
/* Deleted tasks land here too (07.10.26): a task gets trashedAt instead of
   leaving the list. Restore clears it; Delete forever removes the task. The
   list rules are Data.js's (NEEDT.restoreTask / destroyTask / trashedTasks,
   list in → list out), written through App's task setter. */
const plTasksNow = () => ((window.__app && window.__app.tasksNow) || []);
const plTrashedOf = (l) => (window.NEEDT && window.NEEDT.trashedTasks ? window.NEEDT.trashedTasks(l) : (l || []).filter((t) => t && t.trashedAt));
const plSetTasks = (fn) => { if (window.__app && window.__app.setTasksRaw) window.__app.setTasksRaw(fn); };
const plTaskApi = {
  restore(id) {
    const t = plTasksNow().find((x) => String(x.id) === String(id)); if (!t) return;
    const N = window.NEEDT;
    plSetTasks((l) => N && N.restoreTask ? N.restoreTask(l, id) : l.map((x) => String(x.id) === String(id) ? Object.assign({}, x, { trashedAt: null }) : x));
    window.toast("Restored “" + (t.title || "Untitled") + "”", { undo: () => plSetTasks((l) => l.map((x) => String(x.id) === String(id) ? Object.assign({}, x, { trashedAt: t.trashedAt }) : x)) });
  },
  destroy(id) {
    const before = plTasksNow().slice(), t = before.find((x) => String(x.id) === String(id)); if (!t) return;
    const N = window.NEEDT;
    plSetTasks((l) => N && N.destroyTask ? N.destroyTask(l, id) : l.filter((x) => String(x.id) !== String(id)));
    window.toast("Deleted “" + (t.title || "Untitled") + "” forever", { undo: () => plSetTasks(before) });
  }
};
/* App re-publishes window.__app after each render; re-read it a frame later. */
function plUseTrashedTasks() {
  const [, tick] = React.useReducer((n) => n + 1, 0);
  const list = plTrashedOf(plTasksNow());
  const sig = list.map((t) => t.id).join(",");
  React.useEffect(() => {
    let last = sig, raf = 0;
    const poll = () => { const now = plTrashedOf(plTasksNow()).map((t) => t.id).join(","); if (now !== last) { last = now; tick(); } raf = window.setTimeout(poll, 400); };
    raf = window.setTimeout(poll, 400);
    return () => window.clearTimeout(raf);
  }, [sig]);
  return list;
}
function PlTrashRow({ i, thumb, title, meta, ctx, id, onRestore, onDestroy }) {
  return (
    <div className="nx-swap pl-trash-row" data-ctx={ctx} data-ctx-id={id} style={{ animationDelay: Math.min(i, 12) * 30 + "ms" }}>
      {thumb}
      <span className="pl-trash-col-3">
        <span className="pl-strong pl-trash-title" title={title}>{title}</span>
        <span className="pl-meta pl-trash-meta" title={meta}>{meta}</span>
      </span>
      <button type="button" className="nx-btn nx-btn-secondary" onClick={onRestore}>Restore</button>
      <button type="button" className="nx-btn nx-btn-danger" onClick={onDestroy}>Delete forever</button>
    </div>
  );
}
/* Moodboards deleted from the Moodboards screen (Board.trashedAt). */
const plUseTrashedBoards = () => { const t = plUseStore(window.boardStore); return window.NEEDT.joinBoards(t || { boards: [], items: [], members: [] }).filter((b) => b.trashedAt); };
function TrashScreen() {
  const all = window.useDocs();
  const gone = all.filter((d) => d.trashedAt);
  const tasks = plUseTrashedTasks();
  const boards = plUseTrashedBoards();
  const n = gone.length + tasks.length + boards.length;
  const heads = [gone.length, tasks.length, boards.length].filter(Boolean).length > 1;
  const empty = () => {
    const docsBefore = window.docStore.get(), tasksBefore = plTasksNow().slice(), boardsBefore = window.boardStore.get();
    window.docStore.set((l) => l.filter((d) => !d.trashedAt));
    if (tasks.length) plSetTasks((l) => window.NEEDT && window.NEEDT.liveTasks ? window.NEEDT.liveTasks(l) : l.filter((t) => !t.trashedAt));
    if (boards.length) window.boardsView.set((l) => l.filter((b) => !b.trashedAt));
    window.toast("Trash emptied", { undo: () => { window.docStore.set(docsBefore); if (tasks.length) plSetTasks(tasksBefore); if (boards.length) window.boardStore.set(boardsBefore); } });
  };
  const project = (t) => (window.NEEDT && window.NEEDT.projectName ? window.NEEDT.projectName(t) : "");
  return (
    <div className="scroll-inner pl-page">
      <PlaceHeader art="trash" title="Trash" meta="Pages and tasks stay here for 30 days"
        actions={n ? <button type="button" className="nx-btn nx-btn-danger" onClick={empty}>Empty Trash</button> : null} />
      {!n ? (
        <div className="nx-swap pl-trash-col">
          <window.Art name="trash" size={56} />
          <span className="pl-empty-text">Trash is empty</span>
          <span className="pl-line">Delete a page or a task — it lands here first.</span>
        </div>
      ) : (
        <div className="pl-trash-col-2">
          {gone.length && heads ? <h2 className="pl-trash-h">Pages</h2> : null}
          {gone.map((d, i) => (
            <PlTrashRow key={d.id} i={i} ctx="trash" id={d.id} title={d.title || "Untitled"}
              thumb={window.DocThumb ? <window.DocThumb doc={d} w={30} h={38} /> : null}
              meta={"Deleted " + plAgo(d.trashedAt) + (project(d) ? " · from " + project(d) : "")}
              onRestore={() => window.docs.restore(d.id)} onDestroy={() => window.docs.destroy(d.id)} />
          ))}
          {tasks.length && (heads || !gone.length) ? <h2 className="pl-trash-h">Tasks</h2> : null}
          {tasks.map((t, i) => (
            <PlTrashRow key={t.id} i={gone.length + i} ctx="trash-task" id={t.id} title={t.title || "Untitled"}
              thumb={<span className="pl-trash-task" aria-hidden="true">{window.Art ? <window.Art name="task" size={30} /> : null}</span>}
              meta={"Deleted " + plAgo(t.trashedAt) + (project(t) ? " · from " + project(t) : "")}
              onRestore={() => plTaskApi.restore(t.id)} onDestroy={() => plTaskApi.destroy(t.id)} />
          ))}
          {boards.length && heads ? <h2 className="pl-trash-h">Moodboards</h2> : null}
          {boards.map((b, i) => (
            <PlTrashRow key={b.id} i={gone.length + tasks.length + i} id={b.id} title={b.title || "Untitled moodboard"}
              thumb={<span className="pl-trash-task" aria-hidden="true">{window.Art ? <window.Art name="stack" size={30} /> : null}</span>}
              meta={"Deleted " + plAgo(b.trashedAt) + " · " + b.items.length + (b.items.length === 1 ? " reference" : " references")}
              onRestore={() => { window.mbApi.restore(b.id); window.toast("Restored “" + b.title + "”", { undo: () => window.mbApi.remove(b.id) }); }}
              onDestroy={() => { const u = window.mbApi.destroy(b.id); window.toast("Deleted forever", { undo: u }); }} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Shared ---------- */
const SHARED = [
  { id: "s-lena", title: "Type scale — proposal", sharedBy: "Lena Fischer", role: "Can edit", style: { ground: "mist" }, updated: "2 h ago", body: [["h", "Chrome"], ["li", "13 / 12, nothing else"], ["h", "Documents"], ["li", "15 body, 17 headings"]] },
  { id: "s-tom", title: "Factory quote — round 2", sharedBy: "Tom Berger", role: "Can comment", style: { ground: "sand" }, updated: "Yesterday", body: [["table", [["Tank", "CHF 9.40"], ["Hoodie", "CHF 21.00"], ["MOQ", "150"]]], ["p", "Lead time 5 weeks from sample approval."]] },
  { id: "s-anna", title: "Launch checklist", sharedBy: "Anna Keller", role: "Can view", style: null, updated: "3 days ago", body: [["todo", "Domain renewed", true], ["todo", "Shop copy"], ["todo", "Photos"]] }
];
const plSharedStore = plMk(SHARED.slice());
/* Shared has nothing to create (no "+", 07.10.26): it only lists what others shared. */
function SharedScreen() {
  const DocCard = window.DocCard;
  const shared = plUseStore(plSharedStore);
  const people = new Set(shared.map((d) => d.sharedBy)).size;
  return (
    <div className="scroll-inner pl-page">
      <PlSceneHeader variant="d" kicker="Shared" title="Shared with me" meta={shared.length ? shared.length + (shared.length === 1 ? " page" : " pages") + " from " + people + (people === 1 ? " person" : " people") : "Nothing yet"}
        prints={shared.map((d) => ({ doc: d, caption: "From " + d.sharedBy.split(" ")[0], onOpen: () => window.docs.open(Object.assign({}, d, { label: d.role })) }))} />
      {!shared.length ? (
        <PlEmpty art="stack" title="Nothing shared with you yet" line="When someone shares a page with you, it shows up here."
          action={<button type="button" className="nx-btn nx-btn-secondary" onClick={() => window.__app && window.__app.setScreen("docs")}>Go to Documents</button>} />
      ) : null}
      <div className="pl-templates-grid">
        {shared.map((d, i) => (
          <div key={d.id} className="nx-swap pl-shared-col" style={{ animationDelay: Math.min(i, 12) * 35 + "ms" }}>
            {DocCard ? <DocCard doc={Object.assign({}, d, { label: d.role })} onOpen={() => window.docs.open(Object.assign({}, d, { label: d.role }))} /> : null}
            <span className="pl-shared-row" title={d.sharedBy}>
              <PlAvatar initials={d.sharedBy.split(" ").map((w) => w[0]).join("").slice(0, 2)} name={d.sharedBy} size={18} /><span className="pl-shared-name">{d.sharedBy}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Boards (BoardsScreen) removed 2026-10-07 — unreachable since Boards left the nav. */

/* ---------- Moodboards (07.10.26, v2) ----------
   Personal inspiration collections — not linked to tasks or projects.
   A board holds items (image · link · colour · note) in a masonry grid you can
   drag to reorder. Boards are private until shared. A Pinterest board can be
   connected as a live source: only the connection is stored, never the Pins.
   Everything lives in one store (window.mbStore) behind window.mbApi so the
   mobile screen reads and writes the same boards. The whole section sits in
   one closure so its helpers never collide with Mobile.jsx's Mb* globals. */
const MoodboardsScreen = (() => {
  const ME = { name: "Maksym", email: "maksym@needt.app", role: "owner" };
  const mbId = (p) => (p || "it") + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const DAY = 86400000;

  /* Mock Pinterest boards. Pins render from here and are never written to a board. */
  const MB_PINS = {
    "SS27 references": [
      { title: "Boxy wool overshirt", color: "#5b5348", ratio: 1.4 }, { title: "Washed black denim", color: "#24262a", ratio: 1.1 },
      { title: "Raw hem detail", color: "#9b8f80", ratio: 0.8 }, { title: "Military olive", color: "#4a4f36", ratio: 1.3 },
      { title: "Back print placement", color: "#d7d1c6", ratio: 1.2 }, { title: "Utility pocket", color: "#3a3d40", ratio: 0.9 },
      { title: "Red stitch accent", color: "#8e2f26", ratio: 1 }, { title: "Garment dye swatch", color: "#b7a68c", ratio: 1.25 }
    ],
    "Archive menswear": [
      { title: "Helmut Lang AW98", color: "#1f2124", ratio: 1.45 }, { title: "Bondage strap", color: "#6d6a66", ratio: 1 },
      { title: "Painter jeans", color: "#c8c0b2", ratio: 1.3 }, { title: "Astro biker", color: "#2c2a2f", ratio: 0.85 },
      { title: "Flight liner", color: "#7b6e4f", ratio: 1.15 }, { title: "Archive tag", color: "#e3ddd2", ratio: 0.75 }
    ],
    "Studio light": [
      { title: "Hard flash, black ground", color: "#121314", ratio: 1.3 }, { title: "Bounce card", color: "#e8e5df", ratio: 0.9 },
      { title: "Blue gel spill", color: "#2a3a52", ratio: 1.2 }, { title: "Ring light catch", color: "#8c8a86", ratio: 1 },
      { title: "Window light", color: "#cfc4b0", ratio: 1.35 }, { title: "Tungsten warm", color: "#9a6a3c", ratio: 1.1 },
      { title: "Shadow play", color: "#3c3c3e", ratio: 0.8 }
    ]
  };
  const PIN_BOARDS = Object.keys(MB_PINS);

  /* ---- link preview, built from the URL alone (no network) ---- */
  const NAMED = { "figma.com": "Figma", "pinterest.com": "Pinterest", "are.na": "Are.na", "youtube.com": "YouTube", "instagram.com": "Instagram", "behance.net": "Behance", "dribbble.com": "Dribbble", "vimeo.com": "Vimeo", "grailed.com": "Grailed", "ssense.com": "SSENSE" };
  function normUrl(s) {
    s = String(s || "").trim();
    if (!s || /\s/.test(s)) return null;
    if (!/^https?:\/\//i.test(s)) { if (!/^[\w-]+(\.[\w-]+)+(\/|$|\?|#)/.test(s)) return null; s = "https://" + s; }
    try { const u = new URL(s); return /\./.test(u.hostname) ? u : null; } catch (e) { return null; }
  }
  function linkFromUrl(s) {
    const u = normUrl(s); if (!u) return null;
    const domain = u.hostname.replace(/^www\./, "");
    const root = domain.split(".").slice(-2).join(".");
    const name = NAMED[root] || (root.split(".")[0].charAt(0).toUpperCase() + root.split(".")[0].slice(1));
    const segs = u.pathname.split("/").filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch (e) { return x; } })
      .filter((x) => !(/^\d+$/.test(x) || /^[A-Za-z0-9_]{4,}$/.test(x) && /\d/.test(x) && /[A-Za-z]/.test(x)))
      .filter((x) => !/^(design|file|proto|board|block|p|pin|watch|r|post|posts|item|items|product|products|en|de)$/i.test(x));
    let title = segs.length ? segs[segs.length - 1].replace(/\.[a-z0-9]{2,4}$/i, "").replace(/[-_+]+/g, " ").replace(/\s+/g, " ").trim() : "";
    if (!title && u.searchParams.get("v")) title = "Video";
    title = title ? title.charAt(0).toUpperCase() + title.slice(1) : name;
    return { kind: "link", url: u.href, title: title, source: { name: name, domain: domain }, ratio: root === "figma.com" ? 0.66 : 0.72 };
  }
  const isFigma = (it) => it && it.source && /(^|\.)figma\.com$/.test(it.source.domain);
  const hueOf = (s) => { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
  const tint = (dom, k) => "color-mix(in oklch, oklch(0.68 0.11 " + hueOf(dom) + ") " + (k || 22) + "%, var(--surface-raised))";

  /* ---- data ---- */
  const hex2 = (n) => Math.round(n).toString(16).padStart(2, "0");
  function mbHex(c) {
    if (!c) return cssVar('--swatch-fallback');
    if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(c)) return ("#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toLowerCase();
    const m = /hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i.exec(c);
    if (!m) return cssVar('--swatch-fallback');
    const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = (t + 1) % 1; return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p); };
    return "#" + hex2(f(h + 1 / 3)) + hex2(f(h)) + hex2(f(h - 1 / 3));
  }
  /* THE DATA (07.10.26) is the database's: Board {id, title, projectId,
     linkShare, pinterestBoardId, trashedAt}, BoardItem {id, boardId, kind,
     url, color, text, position}, BoardMember {boardId, email, role} — three
     tables in stores.jsx (window.boardStore), shared with the phone. This
     screen reads window.boardsView: the boards joined with their items (in
     position order) and members, and writes a joined list back. Beside the
     schema (not stored by the API yet): Board createdAt, pinterestStatus,
     pinterestSyncedAt; BoardItem title, ratio, colorName, source,
     thumbnailUrl, createdAt; BoardMember name. Old "needt.moodboards" data
     (and the older tiles format) is migrated in Data.js. */
  const isoAgo = (ms) => new Date(Date.now() - ms).toISOString();
  const colorItem = (id, t, i) => ({ id: id, kind: "color", url: null, color: mbHex(t[0]), text: null, colorName: t[2] || "", ratio: +t[1] || 1, createdAt: isoAgo(i * 60000) });
  const seedBoard = (bi, id, title, tiles) => ({ id: id, title: title, projectId: null, linkShare: false, pinterestBoardId: null, pinterestStatus: null, pinterestSyncedAt: null,
    createdAt: isoAgo((bi + 1) * 3 * DAY), trashedAt: null, members: [{ boardId: id, email: ME.email, role: "owner", name: ME.name }],
    items: tiles.map((t, i) => colorItem("it-m" + bi + "-" + i, t, i)) });
  const seed = () => [
    seedBoard(0, "mb-ss27", "SS27 drop — raw", [["#1c1c1c", 1.4, "Night flash"], ["#8a8178", 1, "Concrete"], ["#c9c2b6", 0.8, "Washed tee"], ["#3b3f2e", 1.2, "Olive army"], ["#b03a2e", 0.9, "One red thing"], ["#e9e4da", 1.1, "Paper"]]),
    seedBoard(1, "mb-shoot", "Underground shoot", [["#0f0f10", 1.3, "Tunnel"], ["#5a5f66", 1, "Steel"], ["#d8d3c8", 0.7, "Flash spill"], ["#26303a", 1.2, "Blue hour"]]),
    seedBoard(2, "mb-shop", "Shop look", [["#f3f1ec", 0.9, "Ground"], ["#111", 0.8, "Type"], ["#9aa39b", 1.1, "Sage"], ["#cbbba0", 1, "Sand"]])
  ].map((b) => {
    if (b.id === "mb-ss27") {
      b.items.splice(1, 0, Object.assign(linkFromUrl("https://www.figma.com/design/k3Xq9/SS27-Lookbook-Grid"), { id: "it-s1", color: null, text: null, createdAt: isoAgo(2 * DAY) }));
      b.items.splice(4, 0, { id: "it-s2", kind: "note", url: null, color: null, text: "Fewer pieces, heavier fabric. Every look needs one thing that feels wrong.", ratio: 0.7, createdAt: isoAgo(DAY) });
      b.items[0].text = "Flash straight on, no fill.";
    }
    if (b.id === "mb-shoot") {
      b.items.splice(2, 0, Object.assign(linkFromUrl("https://www.are.na/block/underground-flash-photography"), { id: "it-s3", color: null, text: null, createdAt: isoAgo(3 * DAY) }));
      b.members.push({ boardId: b.id, email: "lena@studio.ch", role: "edit", name: "Lena" });
    }
    b.items.forEach((it, i) => { it.boardId = b.id; it.position = i; });
    return b;
  });
  /* The joined view (window.boardsView): get() → boards with items and
     members, set(list | fn), sub(fn). Seeded here when nothing is stored. */
  const mbStore = window.boardsView;
  mbStore.seed(seed);

  /* Every mutator returns undo(); create returns the new board. Lists show
     live boards; delete moves a board to Trash (trashedAt). */
  const live = () => window.NEEDT.liveBoards(mbStore.get());
  const get = (id) => mbStore.get().find((b) => b.id === id) || null;
  const patchBoard = (id, fn) => mbStore.set((l) => l.map((b) => b.id === id ? Object.assign({}, b, fn(b)) : b));
  const snapUndo = (id) => { const before = get(id); return () => before && mbStore.set((l) => l.map((b) => b.id === id ? before : b)); };
  const now = () => new Date().toISOString();
  const mbApi = {
    list: live,
    get: get,
    create(title) {
      const id = mbId("mb");
      const b = { id: id, title: title || "Untitled moodboard", projectId: null, linkShare: false, pinterestBoardId: null, pinterestStatus: null, pinterestSyncedAt: null,
        createdAt: now(), trashedAt: null, items: [], members: [{ boardId: id, email: ME.email, role: "owner", name: ME.name }] };
      mbStore.set((l) => [b].concat(l)); return b;
    },
    rename(id, title) { const u = snapUndo(id); patchBoard(id, () => ({ title: title })); return u; },
    /* Delete → Trash. Undo (and Trash → Restore) clears trashedAt. */
    remove(id) {
      if (!get(id)) return () => {};
      patchBoard(id, () => ({ trashedAt: now() }));
      return () => patchBoard(id, () => ({ trashedAt: null }));
    },
    restore(id) { patchBoard(id, () => ({ trashedAt: null })); },
    /* Delete forever: the board, its items and its members. */
    destroy(id) {
      const l = mbStore.get(), i = l.findIndex((b) => b.id === id); if (i < 0) return () => {};
      const b = l[i]; mbStore.set(l.filter((x) => x.id !== id));
      return () => mbStore.set((n) => { n = n.slice(); n.splice(Math.min(i, n.length), 0, b); return n; });
    },
    addItem(boardId, item, at) {
      const it = Object.assign({ id: mbId("it"), boardId: boardId, url: null, color: null, text: null, ratio: 1, createdAt: now() }, item);
      patchBoard(boardId, (b) => { const n = b.items.slice(); n.splice(at == null ? 0 : at, 0, it); return { items: n }; });
      const undo = () => patchBoard(boardId, (b) => ({ items: b.items.filter((x) => x.id !== it.id) }));
      undo.item = it; return undo;
    },
    updateItem(boardId, itemId, p) { const u = snapUndo(boardId); patchBoard(boardId, (b) => ({ items: b.items.map((x) => x.id === itemId ? Object.assign({}, x, p) : x) })); return u; },
    removeItem(boardId, itemId) {
      const b = get(boardId); if (!b) return () => {};
      const i = b.items.findIndex((x) => x.id === itemId); if (i < 0) return () => {};
      const it = b.items[i];
      patchBoard(boardId, (x) => ({ items: x.items.filter((y) => y.id !== itemId) }));
      return () => patchBoard(boardId, (x) => { const n = x.items.slice(); n.splice(Math.min(i, n.length), 0, it); return { items: n }; });
    },
    /* Reorder: the list order becomes each item's position. */
    moveItem(boardId, itemId, toIndex) {
      const u = snapUndo(boardId);
      patchBoard(boardId, (b) => { const n = b.items.slice(), i = n.findIndex((x) => x.id === itemId); if (i < 0) return {}; const [it] = n.splice(i, 1); n.splice(Math.max(0, Math.min(toIndex, n.length)), 0, it); return { items: n }; });
      return u;
    },
    share(boardId, member) {
      const u = snapUndo(boardId);
      const m = { boardId: boardId, email: member.email.trim().toLowerCase(), role: member.role === "edit" ? "edit" : "view",
        name: member.name || member.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) };
      patchBoard(boardId, (b) => ({ members: b.members.some((x) => x.email === m.email) ? b.members.map((x) => x.email === m.email && x.role !== "owner" ? Object.assign({}, x, { role: m.role }) : x) : b.members.concat([m]) }));
      return u;
    },
    setRole(boardId, email, role) { const u = snapUndo(boardId); patchBoard(boardId, (b) => ({ members: b.members.map((x) => x.email === email && x.role !== "owner" ? Object.assign({}, x, { role: role }) : x) })); return u; },
    removeMember(boardId, email) { const u = snapUndo(boardId); patchBoard(boardId, (b) => ({ members: b.members.filter((x) => x.email !== email || x.role === "owner") })); return u; },
    setLinkShare(boardId, on) { const u = snapUndo(boardId); patchBoard(boardId, () => ({ linkShare: !!on })); return u; },
    /* Only the reference to the Pinterest board is stored — never its pins. */
    connectPinterest(boardId, name) { const u = snapUndo(boardId); patchBoard(boardId, () => ({ pinterestBoardId: name, pinterestStatus: "ok", pinterestSyncedAt: now() })); return u; },
    disconnectPinterest(boardId) { const u = snapUndo(boardId); patchBoard(boardId, () => ({ pinterestBoardId: null, pinterestStatus: null, pinterestSyncedAt: null })); return u; },
    setPinterestStatus(boardId, status) {
      const u = snapUndo(boardId);
      patchBoard(boardId, (b) => b.pinterestBoardId ? Object.assign({ pinterestStatus: status }, status === "ok" ? { pinterestSyncedAt: now() } : {}) : {});
      return u;
    }
  };

  function mbDownscale(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 900 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const g = c.getContext("2d"); g.fillStyle = cssVar('--color-white'); g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        let data = null; try { data = c.toDataURL("image/jpeg", 0.8); } catch (e) {}
        resolve(data ? { kind: "image", url: data, title: (file.name || "Image").replace(/\.[a-z0-9]+$/i, ""), ratio: +(h / w).toFixed(3) } : null);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  /* Pinterest access is one account-level state in window.connections
     ("pinterest"), shared with Connections; a board only remembers which
     Pinterest board it shows. A board linked before that store knew Pinterest
     means the account was connected. */
  const pinAcct = () => (window.connections ? window.connections.get().pinterest || "none" : "connected");
  const setPinAcct = (v) => { if (window.connections) window.connections.set("pinterest", v); };
  if (window.connections && !window.connections.get().pinterest && mbStore.get().some((b) => b.pinterestBoardId)) setPinAcct("connected");
  function usePinAcct() {
    const [v, setV] = React.useState(pinAcct);
    React.useEffect(() => {
      const on = () => setV(pinAcct());
      window.addEventListener("needt-connections", on); return () => window.removeEventListener("needt-connections", on);
    }, []);
    return v;
  }
  const PinBeta = () => <span className="mb-pin-beta pl-mb-row">Beta</span>;

  Object.assign(window, { mbStore: mbStore, mbApi: mbApi, MB_PINS: MB_PINS, mbLinkFromUrl: linkFromUrl, mbDownscale: mbDownscale, mbSeed: seed });

  /* ---- small pieces ---- */
  const Icon = (p) => <PlIcon {...p} />;
  function useMb() {
    const [s, setS] = React.useState(mbStore.get());
    React.useEffect(() => mbStore.sub(setS), []);
    return window.NEEDT.liveBoards(s);
  }
  const ms = (iso) => (iso ? Date.parse(iso) : Date.now());
  const ago = (ms) => { const d = Date.now() - ms; if (d < 60000) return "just now"; if (d < 3600000) return Math.round(d / 60000) + " min ago"; if (d < DAY) return Math.round(d / 3600000) + " h ago"; return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
  const fullDate = (ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const initials = (n) => (n || "?").split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
  const isPrivate = (b) => b.members.length <= 1 && !b.linkShare;
  const sourceLabel = (it) => it.kind === "link" ? it.source.domain : it.kind === "image" ? (it.source ? it.source.domain : "Uploaded") : it.kind === "color" ? (it.colorName || it.color.toUpperCase()) : "Note";
  const copy = (text, msg) => { window.needtPlatform.copy(text); window.toast(msg || "Link copied"); };
  const openUrl = (url) => { try { window.open(url, "_blank", "noopener"); } catch (e) {} };

  function Avatars({ members, size, max }) {
    const z = size || 20, list = members.slice(0, max || 4);
    return (
      <span className="pl-avatars-row" title={members.map((m) => m.name).join(", ")}>
        {list.map((m, i) => (
          <span key={m.email} className="pl-avatars-grid" style={{ "--pl-hue": hueOf(m.email), width: z, height: z, marginLeft: i ? -z * 0.3 : 0, borderRadius: z, font: "600 " + Math.round(z * 0.42) + "px/1 var(--font-sans)" }}>{initials(m.name)}</span>
        ))}
        {members.length > list.length ? <span className="pl-avatars-text">+{members.length - list.length}</span> : null}
      </span>
    );
  }
  function FavBadge({ it, size }) {
    const z = size || 18, d = it.source ? it.source.domain : "";
    return <span aria-hidden="true" className="pl-fav-badge-grid" style={{ "--pl-hue": hueOf(d), width: z, height: z, font: "700 " + Math.round(z * 0.55) + "px/1 var(--font-sans)" }}>{(it.source ? it.source.name : "?").charAt(0).toUpperCase()}</span>;
  }
  function PinBadge({ size }) {
    const z = size || 18;
    return <span aria-label="Pinterest" className="pl-pin-badge-grid" style={{ width: z, height: z, borderRadius: z, font: "800 " + Math.round(z * 0.6) + "px/1 Georgia, serif" }}>P</span>;
  }
  /* WCAG relative luminance — picks the readable label ink for a swatch. */
  const wcagL = (h) => { const n = parseInt(mbHex(h).slice(1), 16); const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(n >> 16) + 0.7152 * f(n >> 8 & 255) + 0.0722 * f(n & 255); };
  /* What an item looks like inside its frame, at any size. */
  function Visual({ it, big }) {
    const frame = "pl-visual-frame" + (big ? " is-big" : "");
    if (it.kind === "image") return <img src={it.url} alt={it.title || ""} draggable={false} className={frame + " is-image"} />;
    if (it.kind === "color") return (
      <span className={frame} style={{ aspectRatio: 1 / (it.ratio || 1), "--pl-bg": it.color }}>
        <span className={"pl-visual-abs" + (wcagL(it.color) > 0.18 ? " is-on-light" : "")}>{it.color.toUpperCase()}</span>
      </span>);
    if (it.kind === "note") return (
      <span className={frame + " is-note"}>
        <span className="pl-visual-el">{it.text}</span>
      </span>);
    const d = it.source.domain;
    return (
      <span className={frame} style={{ aspectRatio: 1 / (it.ratio || 0.72), "--pl-bg": tint(d, 26) }}>
        <span aria-hidden="true" className="pl-visual-abs-2">
          <span className="pl-visual-abs-3" style={{ "--pl-bg": tint(d, 60) }} />
          <span className="pl-visual-abs-4" style={{ "--pl-bg": tint(d, 34) }} />
        </span>
        {isFigma(it) ? <span className="pl-visual-abs-5">
          <svg width="9" height="13" viewBox="0 0 38 57" aria-hidden="true"><path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" fill="var(--brand-figma-blue)" /><path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" fill="var(--brand-figma-green)" /><path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19z" fill="var(--brand-figma-coral)" /><path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" fill="var(--brand-figma-red)" /><path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" fill="var(--brand-figma-purple)" /></svg>Figma</span> : null}
      </span>);
  }

  /* A centred Craft sheet. */
  function Dialog({ open, onClose, label, width, children }) {
    const [shown, leaving] = window.useExit ? window.useExit(open, 170) : [open, false];
    React.useEffect(() => {
      if (!open) return undefined;
      const esc = (e) => { if (e.key === "Escape") onClose(); };
      document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc);
    }, [open]);
    if (!shown) return null;
    return ReactDOM.createPortal(
      <div className={("nx-scrim" + (leaving ? " is-leaving" : "")) + " pl-habit-sheet-grid"} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div role="dialog" aria-label={label} className={("nx-sheet mb-dialog" + (leaving ? " is-leaving" : "")) + " pl-dialog-col"}
          style={{ maxWidth: width || 440 }}>
          {children}
        </div>
      </div>, document.body);
  }
  function DlgHead({ art, glyph, title, sub }) {
    return (
      <div className="pl-row-12">
        {glyph || <window.Art name={art} size={32} />}
        <span className="pl-dlg-head-col">
          <span className="pl-sheet-title">{title}</span>
          {sub ? <span className="pl-meta">{sub}</span> : null}
        </span>
      </div>
    );
  }
  const Foot = ({ children }) => <div className="pl-dlg-head-row">{children}</div>;
  function Switch({ on, onChange, label }) {
    return <button type="button" role="switch" aria-checked={on} aria-label={label} className={"mb-switch" + (on ? " is-on" : "")} onClick={() => onChange(!on)}><i /></button>;
  }

  /* ---- add sheets ---- */
  function LinkSheet({ open, onClose, onAdd }) {
    const [v, setV] = React.useState("");
    const ref = React.useRef(null);
    React.useEffect(() => { if (open) { setV(""); setTimeout(() => ref.current && ref.current.focus(), 40); } }, [open]);
    const it = linkFromUrl(v);
    const bad = v.trim() && !it;
    const go = () => { if (it) { onAdd(it); onClose(); } };
    return (
      <Dialog open={open} onClose={onClose} label="Paste a link">
        <DlgHead art="page" title="Paste a link" sub="Any page, a Figma file, a Pin — it’s saved as a link" />
        <label className="pl-stack-6">
          <span className="pl-label">URL</span>
          <input ref={ref} name="mb-url" value={v} placeholder="https://" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }}
            className={"pl-field" + (bad ? " is-invalid" : "")} />
          {bad ? <span className="pl-link-sheet-text">That doesn’t look like a link — try https://…</span> : null}
        </label>
        {it ? (
          <div className="nx-swap pl-link-sheet-row">
            <span className="pl-link-sheet-el"><Visual it={it} /></span>
            <span className="pl-link-sheet-col">
              <span className="pl-link-sheet-text-2">{it.title}</span>
              <span className="pl-link-sheet-row-2"><FavBadge it={it} size={14} />{it.source.domain}</span>
              {isFigma(it) ? <span className="pl-meta">Opens in Figma · we only keep the link</span> : null}
            </span>
          </div>) : null}
        <Foot><button type="button" className="nx-btn nx-btn-text" onClick={onClose}>Cancel</button>
          <button type="button" className="nx-btn nx-btn-primary mb-link-add" disabled={!it} onClick={go}>Add link</button></Foot>
      </Dialog>
    );
  }
  const PRESETS = [["#1c1c1c", "Ink"], ["#e9e4da", "Paper"], ["#8a8178", "Concrete"], ["#3b3f2e", "Olive"], ["#b03a2e", "Brick"], ["#26303a", "Night blue"], ["#cbbba0", "Sand"], ["#9aa39b", "Sage"]];
  function ColorSheet({ open, onClose, onAdd }) {
    const [c, setC] = React.useState(PRESETS[2][0]);
    const [n, setN] = React.useState("");
    React.useEffect(() => { if (open) { setC(PRESETS[2][0]); setN(""); } }, [open]);
    const hex = /^#?[0-9a-f]{6}$/i.test(c.trim()) ? mbHex(c.trim().replace(/^#?/, "#")) : null;
    const go = () => { if (!hex) return; onAdd({ kind: "color", color: hex, colorName: n.trim(), ratio: 0.8 }); onClose(); };
    return (
      <Dialog open={open} onClose={onClose} label="Add a colour">
        <DlgHead art="tune" title="Add a colour" sub="A swatch to keep next to your references" />
        <div className="pl-color-sheet-row">
          <span className="pl-color-sheet-el" style={hex ? { "--pl-bg": hex } : undefined} />
          <div className="pl-color-sheet-row-2">
            {PRESETS.map(([h, nm]) => <button key={h} type="button" aria-label={nm} title={nm} onClick={() => { setC(h); if (!n || PRESETS.some((p) => p[1] === n)) setN(nm); }}
              className={("nx-press" + (hex === h ? " nx-selected" : "")) + " pl-color-sheet-btn"} style={{ "--pl-bg": h }} />)}
          </div>
        </div>
        <div className="pl-color-sheet-row-3">
          <label className="pl-color-sheet-col"><span className="pl-label">Hex</span>
            <input name="mb-hex" value={c} onChange={(e) => setC(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} className={"pl-field is-num" + (!hex ? " is-invalid" : "")} /></label>
          <label className="pl-color-sheet-col-2"><span className="pl-label">Name <span>· optional</span></span>
            <input name="mb-colorname" value={n} placeholder="Colour name" onChange={(e) => setN(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} className="pl-field" /></label>
        </div>
        {!hex ? <span className="pl-color-sheet-text">Use six hex digits, like #8A8178.</span> : null}
        <Foot><button type="button" className="nx-btn nx-btn-text" onClick={onClose}>Cancel</button>
          <button type="button" className="nx-btn nx-btn-primary mb-color-add" disabled={!hex} onClick={go}>Add colour</button></Foot>
      </Dialog>
    );
  }
  function NoteSheet({ open, onClose, onAdd }) {
    const [v, setV] = React.useState("");
    const ref = React.useRef(null);
    React.useEffect(() => { if (open) { setV(""); setTimeout(() => ref.current && ref.current.focus(), 40); } }, [open]);
    const go = () => { const t = v.trim(); if (!t) return; onAdd({ kind: "note", text: t, ratio: Math.min(1.4, 0.5 + t.length / 160) }); onClose(); };
    return (
      <Dialog open={open} onClose={onClose} label="Add a note">
        <DlgHead art="doc" title="Add a note" sub="A thought that belongs with the pictures" />
        <textarea ref={ref} name="mb-note" value={v} rows={4} placeholder="Add a note" onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go(); }}
          className="pl-field is-area is-tall" />
        <Foot><span className="pl-note-sheet-el">⌘↵ to add</span>
          <button type="button" className="nx-btn nx-btn-text" onClick={onClose}>Cancel</button>
          <button type="button" className="nx-btn nx-btn-primary" disabled={!v.trim()} onClick={go}>Add note</button></Foot>
      </Dialog>
    );
  }

  /* ---- share ---- */
  function ShareSheet({ open, onClose, board }) {
    const [email, setEmail] = React.useState("");
    const [role, setRole] = React.useState("view");
    const ref = React.useRef(null);
    React.useEffect(() => { if (open) { setEmail(""); setRole("view"); setTimeout(() => ref.current && ref.current.focus(), 40); } }, [open]);
    if (!board) return null;
    const e = email.trim();
    const okMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
    const dupe = okMail && board.members.some((m) => m.email === e.toLowerCase());
    const invite = () => {
      if (!okMail || dupe) return;
      const undo = mbApi.share(board.id, { email: e, role: role });
      window.toast("Invited " + e + " · " + (role === "edit" ? "Can edit" : "Can view"), { undo: undo });
      setEmail("");
    };
    const link = location.origin + "/b/" + board.id;
    const owner = board.members.filter((m) => m.role === "owner"), rest = board.members.filter((m) => m.role !== "owner");
    return (
      <Dialog open={open} onClose={onClose} label="Share board" width={480}>
        <DlgHead art="stack" title={"Share “" + board.title + "”"} sub={isPrivate(board) ? "Private — only you can see this board" : "Shared with " + (board.members.length - 1) + (board.members.length === 2 ? " person" : " people") + (board.linkShare ? " and anyone with the link" : "")} />
        <div className="pl-share-sheet-row">
          <input ref={ref} name="mb-invite" type="email" value={email} placeholder="Email address" onChange={(ev) => setEmail(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") invite(); }}
            className={"pl-field is-grow" + (e && !okMail ? " is-invalid" : "")} />
          <span className="pl-share-sheet-row-2">
            {[["view", "View"], ["edit", "Edit"]].map(([k, n]) => <button key={k} type="button" aria-pressed={role === k} className={"pl-seg-btn mb-role-" + k} onClick={() => setRole(k)}>{n}</button>)}
          </span>
          <button type="button" className="nx-btn nx-btn-primary mb-invite-btn" disabled={!okMail || dupe} onClick={invite}>Invite</button>
        </div>
        {e && !okMail ? <span className="pl-color-sheet-text">Enter a full email address.</span> : dupe ? <span className="pl-share-sheet-text">Already on this board.</span> : null}
        <div className="mb-members pl-habit-sheet-col-2">
          {owner.concat(rest).map((m) => (
            <div key={m.email} className="nx-swap pl-share-sheet-row-3">
              <Avatars members={[m]} size={28} />
              <span className="pl-share-sheet-col">
                <span className="pl-strong">{m.name}{m.role === "owner" ? <span className="pl-line"> (you)</span> : null}</span>
                <span className="pl-share-sheet-text-2">{m.email}</span>
              </span>
              {m.role === "owner" ? <span className="pl-share-sheet-text-3">Owner</span> : <>
                <select aria-label={"Role for " + m.name} className="mb-select" value={m.role} onChange={(ev) => { const u = mbApi.setRole(board.id, m.email, ev.target.value); window.toast(m.name + " can " + (ev.target.value === "edit" ? "edit" : "view") + " now", { undo: u }); }}>
                  <option value="view">Can view</option><option value="edit">Can edit</option>
                </select>
                <button type="button" aria-label={"Remove " + m.name} className="nx-btn nx-btn-text nx-btn-sm" onClick={() => { const u = mbApi.removeMember(board.id, m.email); window.toast("Removed " + m.name, { undo: u }); }}>Remove</button>
              </>}
            </div>
          ))}
        </div>
        <div className="pl-share-sheet-box" />
        <div className="pl-row-12">
          <span className="pl-share-sheet-grid"><Icon name={board.linkShare ? "globe" : "lock"} size={14} /></span>
          <span className="pl-share-sheet-col-2">
            <span className="pl-strong">Anyone with the link</span>
            <span className="pl-meta">{board.linkShare ? "Can view · no sign-in needed" : "Off — only people you invite"}</span>
          </span>
          {board.linkShare ? <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm mb-copy-link" onClick={() => copy(link)}><Icon name="link" size={13} />Copy link</button> : null}
          <Switch label="Anyone with the link" on={board.linkShare} onChange={(on) => { mbApi.setLinkShare(board.id, on); window.toast(on ? "Anyone with the link can view" : "Link sharing off"); }} />
        </div>
        <Foot><button type="button" className="nx-btn nx-btn-secondary" onClick={onClose}>Done</button></Foot>
      </Dialog>
    );
  }

  /* ---- Pinterest (mock OAuth) ---- */
  function PinterestSheet({ open, onClose, onPick, reconnect, current }) {
    const [step, setStep] = React.useState("consent");
    const [busy, setBusy] = React.useState(false);
    /* Already connected (here or in Connections): skip consent, go to boards. */
    React.useEffect(() => { if (open) { setStep(!reconnect && pinAcct() === "connected" ? "pick" : "consent"); setBusy(false); } }, [open]);
    const allow = () => { setBusy(true); setTimeout(() => { setBusy(false); setPinAcct("connected"); if (reconnect && current) { onPick(current); onClose(); } else setStep("pick"); }, 600); };
    return (
      <Dialog open={open} onClose={onClose} label="Connect Pinterest" width={420}>
        {step === "consent" ? <>
          <div className="pl-pinterest-sheet-row">
            <span className="pl-pinterest-sheet-grid">N</span>
            <span className="pl-pinterest-sheet-row-2">{[0, 1, 2].map((i) => <i key={i} className="pl-pinterest-sheet-dot" />)}</span>
            <PinBadge size={44} />
          </div>
          <div className="pl-pinterest-sheet-row-3"><PinBeta /></div>
          <div className="pl-pinterest-sheet-col">
            <span className="pl-sheet-title">Needt wants to see your boards and Pins</span>
            <span className="pl-meta">Signed in to Pinterest as teenx</span>
          </div>
          <div className="pl-pinterest-sheet-col-2">
            {[["eye", "See your public and secret boards"], ["image", "See your Pins and their images"], ["ban", "Needt can’t create, edit or delete anything"]].map(([ic, t]) => (
              <span key={t} className="pl-pinterest-sheet-row-4"><Icon name={ic} size={15} />{t}</span>))}
          </div>
          <span className="pl-pinterest-sheet-text">Pins stay on Pinterest — Needt shows them live and doesn’t copy them. You can disconnect any time.</span>
          <Foot><button type="button" className="nx-btn nx-btn-text" onClick={onClose}>Cancel</button>
            <button type="button" className="nx-btn nx-btn-primary mb-pin-allow" disabled={busy} onClick={allow}>{busy ? "Connecting…" : "Allow"}</button></Foot>
        </> : <>
          <DlgHead glyph={<PinBadge size={32} />} title="Choose a board" sub="Its Pins will show on this moodboard · Pinterest is in beta" />
          <div className="pl-pinterest-sheet-col-3">
            {PIN_BOARDS.map((n, i) => (
              <button key={n} type="button" className="nx-press nx-swap mb-pin-board pl-pinterest-sheet-row-5" onClick={() => { onPick(n); onClose(); }}
                style={{ animationDelay: i * 40 + "ms" }}>
                <span className="pl-pinterest-sheet-grid-2">
                  {MB_PINS[n].slice(0, 4).map((p, j) => <i key={j} style={{ "--pl-bg": p.color }} />)}
                </span>
                <span className="pl-grow-col">
                  <span className="pl-strong">{n}</span>
                  <span className="pl-meta">{MB_PINS[n].length} Pins</span>
                </span>
                <Icon name="chevron-right" size={14} />
              </button>))}
          </div>
          <Foot><button type="button" className="nx-btn nx-btn-text" onClick={onClose}>Cancel</button></Foot>
        </>}
      </Dialog>
    );
  }
  function PinterestSection({ board, guest, importing, onRefresh, onReconnect }) {
    const p = { board: board.pinterestBoardId, status: board.pinterestStatus, synced: ms(board.pinterestSyncedAt) };
    const [, tick] = React.useState(0);
    React.useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
    const pinUrl = "https://www.pinterest.com/teenx/" + p.board.toLowerCase().replace(/\s+/g, "-") + "/";
    if (guest) return (
      <section className="mb-pin-plaque nx-swap pl-pinterest-section-row">
        <PinBadge size={28} />
        <span className="pl-grow-col">
          <span className="pl-strong">Pinterest board · visible only to the owner</span>
          <span className="pl-meta">Pins load from the owner’s Pinterest account and aren’t shared.</span>
        </span>
        <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" onClick={() => openUrl(pinUrl)}>Open on Pinterest<Icon name="arrow-up-right" size={13} /></button>
      </section>);
    const pins = MB_PINS[p.board] || [];
    const acct = usePinAcct();
    const lost = p.status === "lost" || acct !== "connected";
    return (
      <section className="mb-pin-section pl-pinterest-section-text">
        <div className="pl-pinterest-section-row-2">
          <PinBadge size={20} />
          <span className="pl-strong">From Pinterest · {p.board}</span>
          <PinBeta />
          <span className="mb-pin-sync pl-meta">{lost ? "Not syncing" : importing ? "Importing…" : "Synced " + ago(p.synced)}</span>
          <span className="pl-pinterest-section-row-3">
            {!lost ? <button type="button" className="nx-btn nx-btn-text nx-btn-sm mb-pin-refresh" disabled={importing} onClick={onRefresh}><Icon name="refresh-cw" size={13} />Refresh</button> : null}
            <button type="button" className="nx-btn nx-btn-text nx-btn-sm mb-pin-disconnect" onClick={() => { const u = mbApi.disconnectPinterest(board.id); window.toast("Pinterest disconnected", { undo: u }); }}>Disconnect</button>
            <window.RichMenu small align="right" width={220} items={[
              { art: "page", title: "Open on Pinterest", onClick: () => openUrl(pinUrl) },
              { sep: true },
              lost ? { art: "focus", title: "Simulate access back", onClick: () => { setPinAcct("connected"); mbApi.setPinterestStatus(board.id, "ok"); } }
                : { art: "focus", title: "Simulate lost access", onClick: () => setPinAcct("disconnected") }
            ]} trigger={<button type="button" aria-label="Pinterest section menu" className="nx-btn nx-btn-text nx-btn-sm mb-pin-more pl-pinterest-section-btn"><Icon name="ellipsis" size={14} /></button>} />
          </span>
        </div>
        {lost ? (
          <div className="mb-pin-lost nx-swap pl-pinterest-section-row-4">
            <span className="pl-pinterest-section-row-5"><Icon name="unlink" size={18} /></span>
            <span className="pl-grow-col">
              <span className="pl-strong">Pinterest access ended — Reconnect to see these Pins</span>
              <span className="pl-meta">Needt never kept copies, so nothing shows until you reconnect.</span>
            </span>
            <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm mb-pin-reconnect" onClick={onReconnect}>Reconnect</button>
          </div>
        ) : importing ? (
          <div className="pl-pinterest-section-box">
            {pins.map((x, i) => <span key={i} className="mb-skel pl-pinterest-section-el" style={{ aspectRatio: 1 / x.ratio, animationDelay: i * 80 + "ms" }} />)}
          </div>
        ) : (
          <div className="mb-pins pl-pinterest-section-box">
            {pins.map((x, i) => (
              <figure key={x.title} className="nx-swap mb-card mb-pin pl-pinterest-section-figure" style={{ animationDelay: i * 30 + "ms" }}>
                <span className="pl-pinterest-section-el-2" style={{ aspectRatio: 1 / x.ratio, "--pl-bg": x.color }} />
                <span className="mb-bar">
                  <span className="pl-pinterest-section-el-3">{x.title}</span>
                  <button type="button" aria-label="Open Pin on Pinterest" className="mb-bar-btn" onClick={() => openUrl(pinUrl)}><Icon name="arrow-up-right" size={13} /></button>
                </span>
              </figure>))}
          </div>
        )}
      </section>
    );
  }

  /* ---- browser extension (mock) ---- */
  function ExtensionSheet({ open, onClose, boards, cur }) {
    const [pick, setPick] = React.useState(cur);
    React.useEffect(() => { if (open) setPick(cur); }, [open]);
    const b = boards.find((x) => x.id === pick) || boards[0];
    return (
      <Dialog open={open} onClose={onClose} label="Save to Needt extension" width={520}>
        <DlgHead art="work" title="Save from any website" sub="Hover an image, press Save to Needt, pick a board" />
        <div aria-hidden="true" className="pl-extension-sheet-box">
          <div className="pl-extension-sheet-row">
            {[0, 1, 2].map((i) => <i key={i} className="pl-extension-sheet-dot" />)}
            <span className="pl-extension-sheet-row-2">archive-menswear.com/lookbook/aw98</span>
          </div>
          <div className="pl-extension-sheet-grid">
            <span className="pl-extension-sheet-el">
              <span className="mb-ext-save pl-extension-sheet-abs">
                <span className="pl-extension-sheet-grid-2">N</span>Save to Needt</span>
              <span className="pl-extension-sheet-abs-2">
                <span className="pl-extension-sheet-text">Save to board</span>
                {boards.slice(0, 4).map((x) => (
                  <span key={x.id} role="button" tabIndex={0} onClick={() => setPick(x.id)} className={"pl-extension-sheet-row-3" + (b && b.id === x.id ? " is-on" : "")}>
                    <span className="pl-extension-sheet-el-2">{x.title}</span>{b && b.id === x.id ? <Icon name="check" size={12} /> : null}</span>))}
              </span>
            </span>
            <span className="pl-shared-col">
              <i className="pl-extension-sheet-dot-2" />
              <i className="pl-extension-sheet-dot-3" />
              <i className="pl-extension-sheet-dot-4" />
              <i className="pl-extension-sheet-dot-5" />
            </span>
          </div>
        </div>
        <span className="pl-meta">Saves the image and where it came from{b ? " — into “" + b.title + "”" : ""}. Works in Chrome, Arc and Edge.</span>
        <Foot><button type="button" className="nx-btn nx-btn-text" onClick={onClose}>Not now</button>
          <button type="button" className="nx-btn nx-btn-primary" onClick={() => { window.toast("Coming soon"); onClose(); }}><Icon name="chrome" size={14} />Add to Chrome</button></Foot>
      </Dialog>
    );
  }

  /* ---- detail sheet (right) ---- */
  function Detail({ board, itemId, guest, onClose, onRemove }) {
    const it = board && board.items.find((x) => x.id === itemId);
    const open = !!it;
    const [shown, leaving] = window.useExit ? window.useExit(open, 200) : [open, false];
    const last = React.useRef(null);
    if (it) last.current = it;
    const show = it || last.current;
    const [note, setNote] = React.useState("");
    const [saved, setSaved] = React.useState(false);
    const timer = React.useRef(null);
    React.useEffect(() => { if (it) { setNote(it.text || ""); setSaved(false); } }, [itemId]);
    React.useEffect(() => {
      if (!open) return undefined;
      const esc = (e) => { if (e.key === "Escape") { if (timer.current) flushRef.current(); onClose(); } };
      document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc);
    }, [open]);
    const flush = (v) => { clearTimeout(timer.current); if (!it) return; mbApi.updateItem(board.id, it.id, it.kind === "note" ? { text: v } : { text: v.trim() ? v : null }); setSaved(true); };
    const flushRef = React.useRef(null);
    flushRef.current = () => flush(note);
    const onNote = (v) => { setNote(v); setSaved(false); clearTimeout(timer.current); timer.current = setTimeout(() => flush(v), 400); };
    if (!shown || !show) return null;
    const x = show;
    const src = x.kind === "link" ? x.source.name : x.kind === "image" ? (x.source ? x.source.name : "Uploaded") : x.kind === "color" ? "Colour" : "Note";
    return ReactDOM.createPortal(
      <div className={("nx-scrim" + (leaving ? " is-leaving" : "")) + " pl-detail-box"} onMouseDown={(e) => { if (e.target === e.currentTarget) { if (timer.current) flush(note); onClose(); } }}>
        <aside role="dialog" aria-label="Reference" className={("mb-side" + (leaving ? " is-leaving" : "")) + " pl-detail-abs"}>
          <div className="pl-detail-row">
            <span className="pl-detail-el">{x.kind === "color" ? (x.colorName || x.color.toUpperCase()) : x.kind === "note" ? "Note" : x.title}</span>
            <button type="button" aria-label="Close" className="nx-btn nx-btn-text nx-btn-sm pl-pinterest-section-btn" onClick={() => { if (timer.current) flush(note); onClose(); }}><Icon name="x" size={14} /></button>
          </div>
          <div className="pl-detail-col">
            <Visual it={x} big />
            <div className="pl-detail-row-2">
              {x.kind === "link" ? <FavBadge it={x} size={22} /> : <span className="pl-detail-grid"><Icon name={x.kind === "image" ? "upload" : x.kind === "color" ? "palette" : "pen-line"} size={12} /></span>}
              <span className="pl-share-sheet-col">
                <span className="pl-strong">{src}</span>
                {x.url ? <span className="pl-detail-text">{isFigma(x) ? "Opens in Figma · link only" : x.source.domain}</span>
                  : x.kind === "color" ? <span className="pl-meta">{x.color.toUpperCase()}</span> : null}
              </span>
              {x.url ? <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm mb-open-source" onClick={() => openUrl(x.url)}>{isFigma(x) ? "Open in Figma" : "Open source"}<Icon name="arrow-up-right" size={13} /></button> : null}
              {x.kind === "color" ? <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" onClick={() => copy(x.color.toUpperCase(), "Copied " + x.color.toUpperCase())}><Icon name="copy" size={13} />Copy hex</button> : null}
            </div>
            <label className="pl-stack-6">
              <span className="pl-detail-row-3 pl-label"><span>{x.kind === "note" ? "Text" : "Note"}</span><span className={"mb-saved pl-detail-el-2" + (saved ? " is-saved" : "")}>Saved</span></span>
              <textarea name="mb-detail-note" value={note} readOnly={guest} rows={4} placeholder={guest ? "No note" : "Add a note"} onChange={(e) => onNote(e.target.value)} onBlur={() => { if (timer.current && !saved) flush(note); }}
                className="pl-field is-area" />
            </label>
            <span className="pl-meta">Added {fullDate(ms(x.createdAt))}</span>
          </div>
          {!guest ? <div className="pl-detail-row-4">
            <button type="button" className="nx-btn nx-btn-danger nx-btn-sm mb-detail-remove" onClick={() => onRemove(x.id)}><Icon name="trash-2" size={13} />Remove</button>
            {x.url ? <button type="button" className="nx-btn nx-btn-text nx-btn-sm" onClick={() => copy(x.url)}><Icon name="link" size={13} />Copy link</button> : null}
          </div> : null}
        </aside>
      </div>, document.body);
  }

  /* ---- a reference card in the masonry ---- */
  function Card({ it, i, guest, onOpen, onRemove, onEditNote, drag }) {
    const over = drag.over === it.id && drag.id && drag.id !== it.id;
    return (
      <figure className={("nx-swap mb-card mb-item mb-kind-" + it.kind + (drag.id === it.id ? " is-dragging" : "") + (over ? " is-over" : "")) + " pl-card-col"}
        data-id={it.id} draggable={!guest} tabIndex={0} role="button" aria-label={(it.title || it.colorName || it.kind) + " — open"}
        onClick={() => onOpen(it.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(it.id); }}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/x-mb-item", it.id); } catch (er) {} drag.start(it.id); }}
        onDragEnter={(e) => { if (drag.id) { e.preventDefault(); drag.hover(it.id); } }}
        onDragOver={(e) => { if (drag.id) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
        onDrop={(e) => { if (drag.id) { e.preventDefault(); e.stopPropagation(); drag.drop(it.id); } }}
        onDragEnd={() => drag.end()}
        style={{ animationDelay: Math.min(i, 12) * 30 + "ms" }}>
        <span className="pl-card-el">
          <Visual it={it} />
          <span className="mb-bar" onClick={(e) => e.stopPropagation()}>
            {it.kind === "link" ? <FavBadge it={it} size={14} /> : null}
            <span className="pl-pinterest-section-el-3">{sourceLabel(it)}</span>
            {it.url ? <button type="button" aria-label={"Open " + sourceLabel(it)} title={isFigma(it) ? "Opens in Figma" : "Open source"} className="mb-bar-btn" onClick={() => openUrl(it.url)}><Icon name="arrow-up-right" size={13} /></button> : null}
            {!guest ? <window.RichMenu small align="right" width={200} items={[
              { art: "doc", title: it.kind === "note" ? "Edit note" : it.text ? "Edit note" : "Add a note", onClick: () => onEditNote(it.id) },
              it.url ? { art: "page", title: "Copy link", onClick: () => copy(it.url) } : it.kind === "color" ? { art: "tune", title: "Copy hex", onClick: () => copy(it.color.toUpperCase(), "Copied " + it.color.toUpperCase()) } : null,
              { sep: true },
              { art: "trash", title: "Remove", onClick: () => onRemove(it.id) }
            ].filter(Boolean)} trigger={<button type="button" aria-label="More" className="mb-bar-btn mb-card-more"><Icon name="ellipsis" size={14} /></button>} /> : null}
          </span>
        </span>
        {it.kind === "link" ? <figcaption className="pl-card-col-2">
          <span className="pl-card-el-2">{it.title}</span>
          <span className="pl-meta">{isFigma(it) ? "Opens in Figma" : it.source.domain}</span>
        </figcaption> : null}
        {it.text && it.kind !== "note" ? <figcaption className="mb-card-note pl-card-figcaption">{it.text}</figcaption> : null}
      </figure>
    );
  }

  function BoardTitle({ title, onRename, guest }) {
    const [edit, setEdit] = React.useState(false);
    const [v, setV] = React.useState(title);
    if (!edit || guest) return <span className={"pl-mb-title" + (guest ? " is-guest" : "")} title={guest ? title : title + " — click to rename"} onClick={() => { if (guest) return; setV(title); setEdit(true); }}>{title}</span>;
    const done = (keep) => { setEdit(false); const t = v.trim(); if (keep && t && t !== title) onRename(t); };
    return <input className="pl-mb-title-input pl-board-title-input" autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={() => done(true)}
      onKeyDown={(e) => { if (e.key === "Enter") done(true); if (e.key === "Escape") done(false); }}
      style={{ width: Math.max(8, v.length + 2) + "ch" }} />;
  }
  function Collage({ b, h }) {
    const t = b.items.slice(0, 4);
    const bg = (x) => x.kind === "image" ? "center / cover no-repeat url(" + x.url + ")" : x.kind === "color" ? x.color : x.kind === "link" ? tint(x.source.domain, 34) : "var(--fill-2)";
    return (
      <div className="pl-collage-grid" style={{ height: h }}>
        {t.map((x, i) => <span key={x.id} className={"pl-collage-el" + (i === 0 && t.length > 1 ? " is-tall" : "") + (t.length === 1 ? " is-wide" : "")} style={{ "--pl-bg": bg(x) }}>
          {x.kind === "note" ? <span className="pl-collage-abs">{x.text}</span> : null}
        </span>)}
        {!t.length ? <span className="pl-collage-grid-2"><Icon name="image" size={22} /></span> : null}
      </div>
    );
  }

  /* ---- the screen ---- */
  const MB_SORTS = [["name", "Name"], ["created", "Date created"], ["updated", "Date updated"]];
  const MB_SORT_KEY = "needt.mbSort";
  function mbReadSort() {
    const v = window.needtSync ? window.needtSync.get(MB_SORT_KEY) : null;
    if (v && MB_SORTS.some((x) => x[0] === v.key) && (v.dir === "asc" || v.dir === "desc")) return v;
    return { key: "updated", dir: "desc" };
  }

  function MoodboardsScreen() {
    const boards = useMb();
    const [openId, setOpenId] = React.useState(null);
    const [guest, setGuest] = React.useState(false);
    const [sheet, setSheet] = React.useState(null); /* link | color | note | share | pinterest | reconnect | ext */
    const [detail, setDetail] = React.useState(null);
    const [importing, setImporting] = React.useState({});
    const [dropOn, setDropOn] = React.useState(false);
    const [dragId, setDragId] = React.useState(null);
    const [overId, setOverId] = React.useState(null);
    /* Grid sort (08.10.26), in the header's ⋯ menu like Craft. Search is the
       top bar's (⌘K) — the grid has no field of its own. "Date updated" is the
       newest of the board's createdAt, its items' createdAt and
       pinterestSyncedAt (no updatedAt column yet — see SCREENS.md). The choice
       is a per-viewer convenience kept in this browser (needt.mbSort). */
    const [sort, setSortState] = React.useState(mbReadSort);
    React.useEffect(() => (window.needtSync ? window.needtSync.subscribe(MB_SORT_KEY, (v, info) => { if (info.origin !== "local") setSortState(mbReadSort()); }) : undefined), []);
    const setSort = (key, dir) => {
      const v = { key: key, dir: dir || (key === "name" ? "asc" : "desc") };
      setSortState(v);
      if (window.needtSync) window.needtSync.set(MB_SORT_KEY, v);
    };
    const depth = React.useRef(0);
    const cur = boards.find((b) => b.id === openId) || null;
    React.useEffect(() => { setGuest(false); setDetail(null); }, [openId]);

    const pro = plUsePro();
    const create = () => {
      if (!pro && boards.length >= PL_FREE_BOARDS) { window.openPaywall && window.openPaywall("Unlimited moodboards"); return; }
      const b = mbApi.create("Untitled moodboard");
      setOpenId(b.id);
      window.toast("Moodboard created", { undo: () => { mbApi.remove(b.id); setOpenId(null); } });
    };
    React.useEffect(() => {
      const on = (e) => { if (e.detail === "moodboard") create(); };
      window.addEventListener("needt-new", on); return () => window.removeEventListener("needt-new", on);
    });
    const rename = (id, title) => { const u = mbApi.rename(id, title); window.toast("Renamed to “" + title + "”", { undo: u }); };
    const removeBoard = (id) => { const b = mbApi.get(id); if (!b) return; const u = mbApi.remove(id); if (openId === id) setOpenId(null); window.toast("Deleted “" + b.title + "”", { undo: u }); };

    const addOne = (item, msg) => {
      if (!cur) return;
      const u = mbApi.addItem(cur.id, item);
      window.toast(msg || "Added to “" + cur.title + "”", { undo: u });
      return u.item;
    };
    const addFiles = (fs) => {
      const id = cur && cur.id; if (!id) return;
      fs = Array.from(fs || []).filter((f) => /^image\//.test(f.type || ""));
      if (!fs.length) { window.toast("Only images can be dropped here"); return; }
      Promise.all(fs.map(mbDownscale)).then((list) => {
        const ok = list.filter(Boolean);
        if (!ok.length) { window.toast("Couldn't read that image"); return; }
        const undos = ok.reverse().map((x) => mbApi.addItem(id, x));
        window.toast(ok.length + (ok.length > 1 ? " images" : " image") + " added", { undo: () => undos.forEach((u) => u()) });
      });
    };
    const addUrl = (s) => { const it = linkFromUrl(s); if (!it) return false; addOne(it, (isFigma(it) ? "Figma link" : "Link") + " added · " + it.source.domain); return true; };
    const removeItem = (itemId) => {
      if (!cur) return; const it = cur.items.find((x) => x.id === itemId);
      const u = mbApi.removeItem(cur.id, itemId); setDetail(null);
      window.toast("Removed " + (it && it.kind === "link" ? "link" : it && it.kind === "color" ? "colour" : it && it.kind === "note" ? "note" : "image"), { undo: u });
    };

    /* ⌘V anywhere on the board: an image, or a link. */
    const onPaste = React.useCallback((e) => {
      if (!cur || guest || sheet) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const cd = e.clipboardData; if (!cd) return;
      const files = Array.from(cd.files || []).filter((f) => /^image\//.test(f.type));
      if (files.length) { e.preventDefault(); addFiles(files); return; }
      const text = (cd.getData("text/uri-list") || cd.getData("text/plain") || "").trim();
      if (!text) return;
      if (/^#?[0-9a-f]{6}$/i.test(text)) { e.preventDefault(); addOne({ kind: "color", color: mbHex(text.replace(/^#?/, "#")), colorName: "", ratio: 0.8 }, "Colour added"); return; }
      if (addUrl(text.split(/\s+/)[0])) { e.preventDefault(); return; }
      window.toast("Paste an image or a link to add it");
    }, [cur && cur.id, guest, sheet]);
    React.useEffect(() => {
      if (!cur) return undefined;
      document.addEventListener("paste", onPaste); return () => document.removeEventListener("paste", onPaste);
    }, [onPaste]);
    window.__mbPaste = onPaste;

    /* file drop over the whole board */
    const hasFiles = (e) => Array.from((e.dataTransfer && e.dataTransfer.types) || []).indexOf("Files") >= 0;
    const dropProps = cur && !guest ? {
      onDragEnter: (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current++; setDropOn(true); },
      onDragOver: (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } },
      onDragLeave: (e) => { if (!hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDropOn(false); },
      onDrop: (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current = 0; setDropOn(false); addFiles(e.dataTransfer.files); }
    } : {};

    const drag = {
      id: dragId, over: overId,
      start: (id) => setDragId(id), hover: (id) => setOverId(id),
      drop: (targetId) => {
        if (!cur || !dragId || dragId === targetId) return;
        const to = cur.items.findIndex((x) => x.id === targetId);
        mbApi.moveItem(cur.id, dragId, to);
        setDragId(null); setOverId(null);
      },
      end: () => { setDragId(null); setOverId(null); }
    };

    const runImport = (id) => {
      setImporting((m) => Object.assign({}, m, { [id]: true }));
      setTimeout(() => { setImporting((m) => Object.assign({}, m, { [id]: false })); mbApi.setPinterestStatus(id, "ok"); }, 1500);
    };
    const connectPin = (name) => { if (!cur) return; setPinAcct("connected"); mbApi.connectPinterest(cur.id, name); runImport(cur.id); window.toast("Connected “" + name + "” from Pinterest"); };

    const pickImages = () => window.needtPlatform.pickFile({ accept: "image/*", multiple: true }).then((fs) => { if (fs.length) addFiles(fs); });
    const addItems = [
      { art: "import", title: "Upload images", kbd: "", onClick: pickImages },
      { art: "page", title: "Paste a link", kbd: "⌘V", onClick: () => setSheet("link") },
      { art: "tune", title: "Colour", onClick: () => setSheet("color") },
      { art: "doc", title: "Note", onClick: () => setSheet("note") },
      { sep: true },
      pro || (cur && cur.pinterestBoardId)
        ? { art: "stack", title: <span className="pl-pro-title">{cur && cur.pinterestBoardId ? "Change Pinterest board" : "Connect Pinterest board"}{window.ProBadge ? <window.ProBadge size="sm" /> : null}</span>, sub: "Beta", onClick: () => setSheet("pinterest") }
        : { art: "stack", title: <span className="pl-pro-title">Connect Pinterest board{window.ProBadge ? <window.ProBadge size="sm" locked /> : null}</span>, sub: "Pins live on your board — with Pro", onClick: () => window.openPaywall && window.openPaywall("Pinterest boards") },
      { art: "work", title: "Get the browser extension", onClick: () => setSheet("ext") }
    ];

    const sheets = <>
      <LinkSheet open={sheet === "link"} onClose={() => setSheet(null)} onAdd={(it) => addOne(it, (isFigma(it) ? "Figma link" : "Link") + " added · " + it.source.domain)} />
      <ColorSheet open={sheet === "color"} onClose={() => setSheet(null)} onAdd={(it) => addOne(it, "Colour added")} />
      <NoteSheet open={sheet === "note"} onClose={() => setSheet(null)} onAdd={(it) => addOne(it, "Note added")} />
      <ShareSheet open={sheet === "share"} onClose={() => setSheet(null)} board={cur} />
      <PinterestSheet open={sheet === "pinterest" || sheet === "reconnect"} reconnect={sheet === "reconnect"} current={cur && cur.pinterestBoardId} onClose={() => setSheet(null)} onPick={connectPin} />
      <ExtensionSheet open={sheet === "ext"} onClose={() => setSheet(null)} boards={boards} cur={cur ? cur.id : boards[0] && boards[0].id} />
    </>;

    if (cur) {
      const all = cur.items;
      const priv = isPrivate(cur);
      return (
        <div className="scroll-inner mb-board pl-mb-box" {...dropProps}>
          {/* Back sits before the title, like the Project page's "‹ Projects". */}
          <PlaceHeader art="stack" title={<BoardTitle key={cur.id} guest={guest} title={cur.title} onRename={(t) => rename(cur.id, t)} />}
            add={<button type="button" className="nx-btn nx-btn-text nx-btn-sm pl-mb-back" data-mb-back="" onClick={() => setOpenId(null)}><Icon name="chevron-left" size={15} />Moodboards</button>}
            meta={<span className="pl-mb-row-2">{all.length + (all.length === 1 ? " reference" : " references")}
              {priv ? <span title="Private — only you" className="pl-mb-row-3"><Icon name="lock" size={13} /></span> : null}</span>}
            actions={<>
              <button type="button" className={"nx-btn nx-btn-text nx-btn-sm mb-guest" + (guest ? " nx-selected" : "")} aria-pressed={guest} onClick={() => setGuest(!guest)} title="Prototype: preview what invitees see"><Icon name={guest ? "eye-off" : "eye"} size={13} />{guest ? "Exit guest view" : "View as guest"}</button>
              {!guest ? <button type="button" className="nx-btn nx-btn-secondary mb-share" onClick={() => setSheet("share")}>
                {!priv ? <Avatars members={cur.members} size={18} max={3} /> : <Icon name="lock" size={13} />}Share</button> : null}
              {!guest ? <window.RichMenu small align="right" width={260} prompt="Add to this board" items={addItems}
                trigger={(o) => <button type="button" aria-expanded={o} className="nx-btn nx-btn-primary mb-add"><Icon name="plus" size={14} />Add</button>} /> : null}
            </>} />
          {guest ? <div className="mb-guest-bar nx-swap pl-mb-row-4">
            <Icon name="eye" size={14} /><span className="pl-mb-el">Viewing as a guest with <b className="pl-mb-text">Can view</b> — this is what people you invite see.</span>
            <button type="button" className="nx-btn nx-btn-text nx-btn-sm" onClick={() => setGuest(false)}>Exit</button></div> : null}
          {all.length ? (
            <div key={cur.id} className="mb-grid pl-mb-box-2">
              {all.map((it, i) => <Card key={it.id} it={it} i={i} guest={guest} drag={drag} onOpen={setDetail} onRemove={removeItem} onEditNote={setDetail} />)}
            </div>
          ) : guest ? <p className="pl-line">Nothing on this board yet.</p> : (
            <div className="mb-empty nx-swap pl-mb-col">
              <span className="pl-pinterest-sheet-col-3">
                <span className="pl-sheet-title">Start this board</span>
                <span className="pl-line">Collect what this should feel like — pictures, links, colours.</span>
              </span>
              <div className="pl-mb-grid">
                {[["upload", "Drop images", "Drag files anywhere on the board", pickImages, "Choose files"],
                  ["link", "Paste with ⌘V", "An image or any link — Figma, Pinterest, a shop", () => setSheet("link"), "Paste a link"],
                  ["plus", "Add", "A colour, a note, or a Pinterest board", null, null]].map(([ic, t, s, fn, cta]) => (
                  <div key={t} className="pl-mb-col-2">
                    <span className="pl-mb-grid-2"><Icon name={ic} size={16} /></span>
                    <span className="pl-strong">{t}</span>
                    <span className="pl-mb-el-2">{s}</span>
                    {fn ? <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" onClick={fn}>{cta}</button>
                      : <window.RichMenu small width={260} items={addItems.slice(2)} trigger={(o) => <button type="button" aria-expanded={o} className="nx-btn nx-btn-secondary nx-btn-sm">More ways<Icon name="chevron-down" size={12} /></button>} />}
                  </div>))}
              </div>
            </div>
          )}
          {cur.pinterestBoardId ? <PinterestSection board={cur} guest={guest} importing={!!importing[cur.id]} onRefresh={() => runImport(cur.id)} onReconnect={() => setSheet("reconnect")} /> : null}
          {dropOn ? <div className="mb-drop nx-scrim" aria-hidden="true"><span><Icon name="upload" size={22} />Drop to add</span></div> : null}
          <Detail board={cur} itemId={detail} guest={guest} onClose={() => setDetail(null)} onRemove={removeItem} />
          {sheets}
        </div>
      );
    }
    const mbTime = (x) => { const t = x ? Date.parse(x) : NaN; return isNaN(t) ? 0 : t; };
    const mbUpdated = (b) => Math.max(mbTime(b.createdAt), mbTime(b.pinterestSyncedAt), ...b.items.map((it) => mbTime(it.createdAt)));
    const flip = sort.dir === (sort.key === "name" ? "desc" : "asc") ? -1 : 1;
    const shownBoards = boards.slice().sort((a, b) => flip * (sort.key === "name"
      ? String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" })
      : sort.key === "created" ? mbTime(b.createdAt) - mbTime(a.createdAt) : mbUpdated(b) - mbUpdated(a)));
    const DropMenu = window.DcDropMenu, SortItems = window.DcSortMenuItems;
    return (
      <div className="scroll-inner pl-page">
        <style>{PL_CSS}</style>
        <PlaceHeader art="stack" title="Moodboards" meta={!pro && window.ProLimit
            ? <window.ProLimit used={boards.length} max={PL_FREE_BOARDS} noun="boards" feature="Unlimited moodboards" />
            : boards.length + (boards.length === 1 ? " board" : " boards")}
          add={<window.PageAddButton label="New moodboard" onClick={create} />}
          actions={boards.length && DropMenu && SortItems ? (
            <DropMenu width={220} align="right" trigger={<button type="button" aria-label="More" data-mb-more="" className="nx-btn nx-btn-secondary pl-mb-round"><Icon name="ellipsis" size={18} /></button>}>
              <SortItems sorts={MB_SORTS} value={sort} onChange={setSort} />
            </DropMenu>) : null} />
        {!boards.length ? (
          <PlEmpty art="stack" title="No moodboards yet" line={"Collect pictures, links and colours for what something should feel like." + (pro ? "" : " Free keeps one board — Pro adds as many as you like.")}
            action={<button type="button" className="nx-btn nx-btn-primary" onClick={create}><Icon name="plus" size={14} />New moodboard</button>} />
        ) : null}
        <div className="pl-mb-grid-3">
          {shownBoards.map((b, i) => (
            <div key={b.id} role="button" tabIndex={0} className="nx-swap nx-press pl-mb-card pl-mb-col-3" onClick={() => setOpenId(b.id)}
              onKeyDown={(e) => { if (e.key === "Enter") setOpenId(b.id); }}
              style={{ animationDelay: (i * 35) + "ms" }}>
              <Collage b={b} h={150} />
              <span className="pl-mb-row-5">
                <span className="pl-mb-col-4">
                  <span className="pl-link-sheet-text-2">{b.title}</span>
                  <span className="pl-link-sheet-row-2">
                    {b.items.length + (b.items.length === 1 ? " reference" : " references")}{b.pinterestBoardId ? <span title={"Pinterest · " + b.pinterestBoardId} className="pl-mb-row-6"><PinBadge size={12} /></span> : null}
                  </span>
                </span>
                <span className="pl-mb-row-7">
                  {isPrivate(b) ? <span className="mb-lock pl-mb-row-3" title="Private — only you"><Icon name="lock" size={13} /></span>
                    : <Avatars members={b.members} size={20} max={3} />}
                </span>
                <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="pl-habit-menu-row">
                  <window.RichMenu small align="right" width={200} items={[
                    { art: "page", title: "Open", onClick: () => setOpenId(b.id) },
                    { art: "trash", title: "Delete board", onClick: () => removeBoard(b.id) }
                  ]} trigger={<button type="button" aria-label={"More for " + b.title} className="nx-press pl-mb-more pl-mb-grid-4">
                    <Icon name="ellipsis" size={15} /></button>} />
                </span>
              </span>
            </div>
          ))}
        </div>
        {/* The one soft upsell here (Free only, dismissible for good). */}
        {!pro && boards.length > 0 && window.ProUpsell ? (
          <window.ProUpsell id="moodboards" feature="Unlimited moodboards" title="Unlimited moodboards"
            line="Free keeps one board. Pro adds as many as you need, sharing and live Pinterest boards." cta="Try Pro free" className="pl-upsell" />
        ) : null}
        {sheets}
      </div>
    );
  }
  return MoodboardsScreen;
})();

/* EDGE DATA for the places (07.10.26). window.__edgeDataPlaces(kind) swaps
   what Moodboards, Habits, Templates, Shared and Trash show, in place:
     long · german · empty · one · many · reset
   window.__edgeData(kind) (work.jsx) also runs it, through its "needt-edge"
   event, after it has swapped tasks, docs and projects. Returns the counts.
   Colours come from the seed boards (content, not styling). Rows it adds to
   Trash have ids starting "edge-", so reset can take them back out. */
(function () {
  const KINDS = ["long", "german", "empty", "one", "many", "reset"];
  const LONG = [
    "Autumn–winter drop: every reference we collected in Zürich, Milano and Antwerpen before the sample round",
    "Underground flash shoot — tunnels under Kreis 4, the steel, the blue hour and the one red thing in every frame",
    "Shop look for the relaunch with a much longer name than anyone would ever type into a moodboard title field"
  ];
  const DE = ["Herbst-Winter-Kollektion: Referenzen", "Fotoshooting Kreis 4 – Lichtstimmung", "Steuererklärungsunterlagen zusammensuchen", "Wohnungsübergabe vorbereiten", "Vokabeln wiederholen (zehn Minuten)"];
  const now = Date.now();
  const iso = (min) => new Date(now - min * 60000).toISOString();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const pick = (arr, i) => arr[i % arr.length];

  /* Boards in the joined database shape (Board + its BoardItem and
     BoardMember rows), written through window.boardsView. */
  const OWNER = (id) => ({ boardId: id, email: "maksym@needt.app", role: "owner", name: "Maksym" });
  function boards(kind) {
    const base = window.mbSeed ? window.mbSeed() : [];
    if (kind === "reset") return base;
    if (kind === "empty") return [];
    const items = [].concat.apply([], base.map((b) => b.items));
    const mk = (id, title, n, extra) => Object.assign({ id: id, title: title, projectId: null, linkShare: false, pinterestBoardId: null, pinterestStatus: null, pinterestSyncedAt: null,
      createdAt: iso(1440), trashedAt: null, members: [OWNER(id)],
      items: Array.from({ length: n }, (_, i) => Object.assign(clone(pick(items, i)), { id: id + "-it" + i, boardId: id, position: i })) }, extra || {});
    if (kind === "one") return [mk("edge-mb1", "SS27 drop — raw", 1)];
    if (kind === "many") return Array.from({ length: 36 }, (_, i) => mk("edge-mb" + i, i ? "Board " + (i + 1) + " · " + pick(["Shoot", "Shop", "Drop", "Studio"], i) : "Everything, all at once", i ? (i % 7) : 64));
    const titles = kind === "german" ? DE : LONG;
    return titles.slice(0, 3).map((t, i) => {
      const id = "edge-mb" + i;
      const b = mk(id, t, 4 + i * 2, { members: [OWNER(id),
        { boardId: id, email: "alexandra.konstantinopoulou@studio-antwerpen.example", role: "edit", name: kind === "german" ? "Lena Hoffmann-Wüthrich" : "Alexandra Konstantinopoulou-Vanderbilt" }] });
      b.items[0].text = kind === "german" ? "Blitz frontal, kein Aufheller — Schatten hart lassen, Hintergrund schwarz." : "Flash straight on, no fill, and keep every shadow hard — the background stays black even when the client asks twice.";
      return b;
    });
  }
  /* Habits as Habit rows plus HabitCheckin rows (the strip is computed). */
  function habits(kind) {
    const N = window.NEEDT;
    const seed = { habits: clone(N.habitSeed || []), checkins: clone(N.habitCheckinSeed || []) };
    if (kind === "reset") return seed;
    if (kind === "empty") return { habits: [], checkins: [] };
    const checkins = [];
    const strip = (id, k) => { for (let i = 0; i < 14; i++) if ((i * 7 + k * 3) % 5) checkins.push({ habitId: id, date: N.iso(new Date(N.today.getFullYear(), N.today.getMonth(), N.today.getDate() - 13 + i)), done: true }); };
    const h = (id, title, k, extra) => { strip(id, k); const e = extra || {};
      return { id: id, title: title, projectId: e.projectId || null, color: null, icon: null, schedule: { time: e.time || null, perWeek: e.perWeek || null }, archivedAt: null }; };
    let list;
    if (kind === "one") list = [h("edge-h1", "Walk before work", 1, { time: "08:15" })];
    else if (kind === "many") list = Array.from({ length: 28 }, (_, i) => h("edge-h" + i, pick(["Stretch", "Read twenty pages", "German", "Walk", "Shoot one roll", "No phone after 22:00", "Water"], i) + " " + (i + 1), i, { time: i % 3 ? null : String(6 + i % 12).padStart(2, "0") + ":30", perWeek: i % 4 ? null : 3 }));
    else {
      const titles = kind === "german" ? ["Vokabeln wiederholen (zehn Minuten)", "Spaziergang vor der Arbeit", "Steuerunterlagen sortieren"]
        : ["Stretch for ten minutes before opening the laptop, even on the days that start with a call", "Shoot one roll of film on the walk home and write down every frame", "Read twenty pages"];
      list = titles.map((t, i) => h("edge-h" + i, t, i, { time: i ? null : "07:45", projectId: i === 0 ? "german" : null }));
    }
    return { habits: list, checkins: checkins };
  }
  function templates(kind) {
    const T = window.TEMPLATES || [];
    if (kind === "reset") return { mine: [], builtin: T };
    if (kind === "empty") return { mine: [], builtin: [] };
    if (kind === "one") return { mine: [], builtin: T.slice(0, 1) };
    const mine = (t, i) => ({ id: "edge-tpl" + i, title: t, style: i % 2 ? { ground: "sand" } : null, label: "Template", meta: (i % 6 + 1) + " blocks", body: [["p", t]] });
    if (kind === "many") return { mine: Array.from({ length: 40 }, (_, i) => mine("Template " + (i + 1), i)), builtin: T };
    return { mine: (kind === "german" ? DE : LONG).slice(0, 3).map(mine), builtin: T };
  }
  function shared(kind) {
    const S = window.SHARED || [];
    if (kind === "reset") return S.slice();
    if (kind === "empty") return [];
    if (kind === "one") return S.slice(0, 1);
    const one = (t, by, i) => Object.assign(clone(pick(S, i)), { id: "edge-s" + i, title: t, sharedBy: by });
    if (kind === "many") return Array.from({ length: 30 }, (_, i) => one("Shared page " + (i + 1), pick(["Lena Fischer", "Tom Berger", "Anna Keller", "Jonas Meier"], i), i));
    return (kind === "german" ? DE : LONG).slice(0, 3).map((t, i) => one(t, kind === "german" ? "Lena Hoffmann-Wüthrich" : "Alexandra Konstantinopoulou-Vanderbilt", i));
  }
  function trash(kind) {
    const notEdge = (x) => !String(x.id).startsWith("edge-");
    const n = kind === "many" ? 30 : kind === "one" ? 1 : kind === "long" || kind === "german" ? 3 : 0;
    const nTasks = kind === "one" ? 0 : n;
    const titles = kind === "german" ? DE : kind === "long" ? LONG : null;
    const keep = (x) => notEdge(x) && (kind === "reset" || !x.trashedAt);
    if (window.docStore) window.docStore.set((l) => {
      const d0 = l.find(notEdge) || { body: [] };
      return l.filter(keep).concat(Array.from({ length: n }, (_, i) => Object.assign(clone(d0), { id: "edge-d" + i, title: titles ? pick(titles, i) : "Old page " + (i + 1), trashedAt: iso(30 + i * 700), isFavorite: false })));
    });
    /* Functional update: App may not have re-rendered after __edgeData's own swap yet. */
    if (window.__app && window.__app.setTasksRaw) window.__app.setTasksRaw((l) => {
      const t0 = l.find(notEdge) || {};
      return l.filter(keep).concat(Array.from({ length: nTasks }, (_, i) => Object.assign(clone(t0), { id: "edge-t" + i, title: titles ? pick(titles, i + 1) : "Deleted task " + (i + 1), trashedAt: iso(10 + i * 500), done: false })));
    });
    return { docs: n, tasks: nTasks };
  }
  window.__edgeDataPlaces = function (kind) {
    if (KINDS.indexOf(kind) < 0) { console.warn("__edgeDataPlaces: one of " + KINDS.join(" | ")); return KINDS; }
    const b = boards(kind), h = habits(kind), t = templates(kind), s = shared(kind);
    if (window.mbStore) window.mbStore.set(b);
    if (window.habitApi) window.habitApi.replace(h.habits, h.checkins);
    plTplStore.set(t);
    plSharedStore.set(s);
    const tr = trash(kind);
    return { kind: kind, boards: b.length, habits: h.habits.length, templates: t.mine.length + t.builtin.length, shared: s.length, trashDocs: tr.docs, trashTasks: tr.tasks };
  };
  window.addEventListener("needt-edge", (e) => { if (KINDS.indexOf(e.detail) >= 0) window.setTimeout(() => window.__edgeDataPlaces(e.detail), 0); });
})();

Object.assign(window, { MoodboardsScreen, HabitsScreen, TemplatesScreen, TrashScreen, SharedScreen, TEMPLATES, SHARED });
