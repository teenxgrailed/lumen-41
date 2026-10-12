/* WORK — every task, Craft's Tasks screen rebuilt (06.10.26).
   Tabs top right (Inbox / Today / Upcoming / All) in Craft's raised pill.
   Projects first as framed cards with a progress ring and their next tasks,
   like Craft's "Pinned Docs"; then the list, folded by section. Rows are the
   same Task row (task.jsx) the Home page writes, so a task looks the same everywhere. */
const WkNS = window.NeedtDesignSystem_25d3c8;
const { Icon: WkIcon } = WkNS;

const dayOf = (t) => window.NEEDT.dueDay(t);
const WK_TODAY = 1;
const wkAt = (t) => window.NEEDT.at(t);
const wkByTime = (a, b) => (wkAt(a) ?? 99) - (wkAt(b) ?? 99);
/* The project registry is stores.jsx's (one store for the desktop and the
   phone): window.projectStore / projects / useProjects / projectHue /
   projectsSorted. These names keep this file's code as it was. */
const WK_SWATCHES = window.PROJECT_SWATCHES;
const wkProjectStore = window.projectStore;
const wkUseProjects = window.useProjects;
const wkProjectHue = window.projectHue;
const wkProjectsSorted = window.projectsSorted;
if (typeof document !== "undefined" && !document.getElementById("wk-css")) {
  const st = document.createElement("style");
  st.id = "wk-css";
  st.textContent =
    ".wk-tab{background:transparent;color:var(--text-tertiary);transition:background-color 160ms ease,color 160ms ease}" +
    ".wk-tab:hover{background:var(--fill-3);color:var(--text-secondary)}" +
    ".wk-tab[aria-pressed=true],.wk-tab[aria-pressed=true]:hover{background:var(--fill-4);color:var(--text-primary)}" +
    ".wk-new{width:36px;height:36px;padding:0;border-radius:var(--radius-2xl)}" +
    ".wk-tab{white-space:nowrap}";
  document.head.appendChild(st);
}
const wkSetTasks = (f) => { if (window.__app && window.__app.setTasksRaw) window.__app.setTasksRaw(f); };

/* New Project — a small sheet: a name and one of five colours. The same
   sheet edits one (initial + title + cta), from the right-click menu. */
function NewProjectSheet({ open, onClose, onCreate, taken, initial, title, cta }) {
  const [shown, leaving] = window.useExit(open, 170);
  const [name, setName] = React.useState("");
  const [hue, setHue] = React.useState(WK_SWATCHES[0][1]);
  React.useEffect(() => { if (open) { setName((initial && initial.name) || ""); setHue((initial && initial.color) || WK_SWATCHES[0][1]); } }, [open]);
  if (!shown) return null;
  const clean = name.trim();
  const dupe = (taken || []).some((n) => n.toLowerCase() === clean.toLowerCase() && !(initial && n === initial.name));
  const ok = clean && !dupe;
  const go = () => { if (ok) onCreate({ name: clean, color: hue }); };
  return ReactDOM.createPortal(
    <div className={"nx-scrim wk-scrim" + (leaving ? " is-leaving" : "")} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
      <div role="dialog" aria-modal="true" aria-label={title || "New project"} className={"nx-sheet wk-sheet" + (leaving ? " is-leaving" : "")}>
        <span className="wk-sheet-title">{title || "New project"}</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" aria-label="Project name"
          onKeyDown={(e) => { if (e.key === "Enter") go(); if (e.key === "Escape") onClose(); }}
          className="wk-sheet-input" />
        <div className="wk-sheet-row">
          <span className="wk-sheet-label">Colour</span>
          {WK_SWATCHES.map(([k, v]) => (
            <button key={k} type="button" aria-label={k} aria-pressed={hue === v} onClick={() => setHue(v)} className="nx-press wk-swatch"
              style={{ background: v, boxShadow: hue === v ? "var(--surface-raised) 0 0 0 2px, " + v + " 0 0 0 4px" : undefined }} />
          ))}
        </div>
        {dupe ? <span className="wk-sheet-error">A project with this name exists.</span> : null}
        <div className="wk-sheet-acts">
          <button type="button" className="nx-btn nx-btn-text" onClick={onClose}>Cancel</button>
          <button type="button" className="nx-btn nx-btn-primary wk-create" disabled={!ok} onClick={go}>{cta || "Create"}</button>
        </div>
      </div>
    </div>, document.body);
}

function Ring({ pct, hue, size }) {
  const z = size || 22, r = z / 2 - 2.5, c = 2 * Math.PI * r;
  return (
    <svg width={z} height={z} viewBox={"0 0 " + z + " " + z} className="wk-ring" aria-hidden="true">
      <circle cx={z / 2} cy={z / 2} r={r} fill="none" stroke="var(--fill-5)" strokeWidth="2.5" />
      <circle cx={z / 2} cy={z / 2} r={r} fill="none" stroke={hue} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="wk-ring-fill" />
    </svg>
  );
}

/* A card is the project's overview; a click (or Enter) anywhere but on one of
   its task rows opens the project's page (08.10.26). */
function ProjectCard({ p, tasks, onToggle, onOpen, onPick, i }) {
  const mine = tasks.filter((t) => t.projectId === p.id);
  const open = mine.filter((t) => !t.done);
  const pct = mine.length ? (mine.length - open.length) / mine.length : 0;
  const [hot, setHot] = React.useState(false);
  const hue = p.color || wkProjectHue(p.name);
  const pickHere = (e) => { if (!onPick || (e.target.closest && e.target.closest("[data-task], button, input"))) return; onPick(p.id); };
  return (
    <div className={"nx-swap wk-pcard" + (onPick ? " is-link" : "") + (hot ? " is-hot" : "")} data-ctx="project" data-ctx-id={p.name} data-wk-pcard={p.id}
      role={onPick ? "button" : undefined} tabIndex={onPick ? 0 : undefined} aria-label={onPick ? "Open " + p.name : undefined}
      onClick={pickHere} onKeyDown={(e) => { if (onPick && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onPick(p.id); } }}
      onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{ animationDelay: (i * 40) + "ms", background: "color-mix(in oklab, " + hue + " 24%, var(--background))" }}>
      <div className="wk-pcard-plate">
        <div className="wk-pcard-head">
          <span className="wk-col">
            <span title={p.name} className="wk-pcard-name">{p.name}</span>
            <span className="wk-meta">{open.length ? open.length + " tasks to do" : mine.length ? "All done" : "No tasks yet"}</span>
          </span>
          <Ring pct={pct} hue={hue} />
        </div>
        {open.slice().sort(wkByTime).slice(0, 4).map((t) => (
          <window.Task key={t.id} layout="row" density="mini" compact task={t} onToggle={() => onToggle(t.id)} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

/* Compact project card for the Tasks screen (07.10.26): same hue frame, Ring
   and open count as ProjectCard, ~180 wide; a click filters the list. */
function WkMiniCard({ name, hue, open, total, selected, onPick, i, none }) {
  const [hot, setHot] = React.useState(false);
  const pct = total ? (total - open) / total : 0;
  const ring = selected ? "var(--text-primary) 0 0 0 1.5px inset" : null;
  const lift = hot ? "var(--shadow-raised-hover)" : "var(--shadow-ring)";
  return (
    <button type="button" className="nx-swap nx-press wk-mcard" data-wk-card={none ? "__none" : name} aria-pressed={!!selected}
      data-ctx={none ? undefined : "project"} data-ctx-id={none ? undefined : name}
      title={selected ? "Clear filter · " + name : "Show only " + name}
      onClick={onPick} onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{ animationDelay: (i * 40) + "ms", background: "color-mix(in oklab, " + hue + " 24%, var(--background))", boxShadow: ring ? ring + ", " + lift : lift,
        transform: hot ? "translateY(-1px)" : "none" }}>
      <span className="wk-mcard-plate">
        <span className="wk-col">
          <span className={"wk-mcard-name" + (none ? " is-none" : "")}>{name}</span>
          <span className="wk-meta wk-num">{open ? open + " open" : total ? "All done" : "No tasks yet"}</span>
        </span>
        <Ring pct={pct} hue={hue} />
      </span>
    </button>
  );
}

/* PROJECT PAGE (08.10.26) — one project on its own: the colour tile, name and
   numbers, an "Add a task" line, its open tasks grouped by when (Overdue,
   Today, Upcoming, No date) and a Done fold. Back returns to the cards. Edit
   opens the shared Edit project sheet (ctx.jsx listens for needt-project-edit);
   Delete is projects.remove (tasks drop to No project, Undo puts them back). */
/* ⋯ menu (Craft-style): page actions live here, not in a button row. */
function WkMore({ label, children }) {
  const [open, setOpen] = React.useState(false);
  const [shown, leaving] = window.useExit ? window.useExit(open, 130) : [open, false];
  const wrap = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span className="wk-more" ref={wrap}>
      <WkNS.IconButton label={label} variant="ghost" onClick={() => setOpen(!open)}><WkIcon name="ellipsis" size={18} /></WkNS.IconButton>
      {shown ? <div className={"nx-pop is-right wk-more-pop" + (leaving ? " is-leaving" : "")} onClick={() => setOpen(false)}><WkNS.Menu width={200}>{children}</WkNS.Menu></div> : null}
    </span>
  );
}
const wkMins = (m) => { const h = Math.floor(m / 60), r = m % 60; return h ? h + " h" + (r ? " " + r + " min" : "") : r + " min"; };
function WkProjectPage({ p, tasks, onBack, onToggle, onOpen, dragProps }) {
  const hue = p.color || wkProjectHue(p.name);
  const mine = tasks.filter((t) => t.projectId === p.id);
  const open = mine.filter((t) => !t.done), done = mine.filter((t) => t.done).sort(wkByTime);
  const late = open.filter((t) => t.overdue);
  const left = open.reduce((n, t) => n + (t.estimatedMinutes || 0), 0);
  const pct = mine.length ? done.length / mine.length : 0;
  const [fold, setFold] = React.useState({ __done: true });
  const flip = (k) => () => setFold((f) => Object.assign({}, f, { [k]: !f[k] }));
  const [draft, setDraft] = React.useState("");
  const addRef = React.useRef(null);
  const byDay = (a, b) => (dayOf(a) ?? 99) - (dayOf(b) ?? 99) || wkByTime(a, b);
  const groups = [
    ["Overdue", late.slice().sort(byDay)],
    ["Today", open.filter((t) => !t.overdue && dayOf(t) === WK_TODAY).sort(wkByTime)],
    ["Upcoming", open.filter((t) => !t.overdue && dayOf(t) != null && dayOf(t) > WK_TODAY).sort(byDay)],
    ["No date", open.filter((t) => !t.overdue && dayOf(t) == null)]
  ].filter((g) => g[1].length);
  const add = () => {
    const title = draft.trim(); if (!title) return;
    const t = { id: Date.now() + Math.random(), title: title, projectId: p.id, status: "todo", estimatedMinutes: 30, done: false };
    wkSetTasks((l) => l.concat([t]));
    setDraft("");
    window.toast("Added to “" + p.name + "”", { undo: () => wkSetTasks((l) => l.filter((x) => x.id !== t.id)) });
  };
  const del = () => { onBack(); window.projects.remove(p.name); };
  const edit = () => window.dispatchEvent(new CustomEvent("needt-project-edit", { detail: { name: p.name } }));
  const HdFold = window.HdFold;
  const row = (t) => <window.Task key={t.id} layout="row" task={t} late={t.overdue && !t.done} onToggle={() => onToggle(t.id)} onOpen={onOpen} dragProps={dragProps} hideProject />;
  const list = (l) => <div className="wk-list">{window.HdCapped ? <window.HdCapped list={l} render={row} cap={50} /> : l.map(row)}</div>;
  return (
    <div className="nx-swap wk-ppage" data-wk-ppage={p.id}>
      <div className="wk-phero" data-ctx="project" data-ctx-id={p.name}>
        <span aria-hidden="true" className="wk-phero-tile" style={{ background: "color-mix(in oklab, " + hue + " 24%, var(--background))", color: hue }}>
          <WkIcon name={p.icon || "folder"} size={22} />
        </span>
        <span className="wk-col wk-phero-text">
          <h1 className="wk-phero-name" title={p.name}>{p.name}</h1>
          <span className="wk-phero-stats wk-num">
            <span>{open.length ? open.length + " open" : mine.length ? "All done" : "No tasks yet"}</span>
            {done.length ? <span>{done.length} done</span> : null}
            {left ? <span>{wkMins(left)} left</span> : null}
            {late.length ? <span className="wk-phero-late" title={late.length + (late.length === 1 ? " task was" : " tasks were") + " due before today — move or let go"}>{late.length} overdue</span> : null}
          </span>
        </span>
        <span className="wk-phero-side">
          <span className="wk-phero-ring" title={Math.round(pct * 100) + "% done"}><Ring pct={pct} hue={hue} size={34} /></span>
          <WkMore label="Project options">
            <WkNS.MenuItem icon={<WkIcon name="pencil" size={14} />} onClick={edit}>Edit project</WkNS.MenuItem>
            <WkNS.MenuSeparator />
            <WkNS.MenuItem variant="destructive" icon={<WkIcon name="trash-2" size={14} />} onClick={del} title={open.length ? open.length + " open tasks move to No project" : undefined}>Delete project</WkNS.MenuItem>
          </WkMore>
        </span>
      </div>
      <label className="wk-padd">
        <span aria-hidden="true" className="wk-padd-plus"><WkIcon name="plus" size={15} /></span>
        <input ref={addRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={"Add a task to " + p.name} aria-label={"Add a task to " + p.name}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") { setDraft(""); e.currentTarget.blur(); } }}
          className="wk-padd-input" />
        {draft.trim() ? <span className="wk-meta">Enter to add</span> : null}
      </label>
      {HdFold ? groups.map(([title, l]) => (
        <HdFold key={title} title={title} tone={title === "Overdue" ? "late" : undefined} count={l.length} open={!fold[title]} onToggle={flip(title)}
          note={title === "Overdue" ? "These were due before today — move them or let them go." : undefined}>{list(l)}</HdFold>
      )) : null}
      {HdFold && done.length ? (
        <HdFold key="__done" title="Done" count={done.length} open={!fold.__done} onToggle={flip("__done")}>{list(done)}</HdFold>
      ) : null}
      {!groups.length && !done.length ? (
        <WkEmpty art="task" title="Nothing in this project yet" line="Add the first task above, or move one here from its right-click menu."
          cta="Add task" icon="plus" onClick={() => addRef.current && addRef.current.focus()} />
      ) : null}
    </div>
  );
}

/* Empty states (07.10.26): a picture, one line, one action. */
const WK_EMPTY = {
  inbox: ["Inbox is clear", "Anything you jot down without a time lands here."],
  today: ["Nothing due today", "Add a task, or pull one in from Upcoming."],
  upcoming: ["Nothing coming up", "Tasks with a date this week show up here."],
  all: ["No tasks yet", "Press N anywhere to add one."],
  projects: ["No open tasks in your projects", "Tasks filed under a project show up here."]
};
function WkEmpty({ art, title, line, cta, icon, onClick }) {
  return (
    <div data-wk-empty="" className="wk-empty">
      <window.Art name={art} size={56} />
      <span className="wk-empty-title">{title}</span>
      <span className="wk-empty-line">{line}</span>
      <button type="button" className="nx-btn nx-btn-secondary wk-empty-cta" onClick={onClick}><WkIcon name={icon} size={14} />{cta}</button>
    </div>
  );
}

/* One component, two places (07.10.26): Tasks = the tabs, Projects = the
   project cards (08.10.26: cards only; a card opens its project's page; a
   Cards / List switch keeps the combined list as its own view). */
function WorkScreen({ tasks: allTasks, onToggle, onOpen, dragProps, mode }) {
  /* Trashed tasks (trashedAt) live on the Trash screen only. */
  const tasks = window.NEEDT.liveTasks(allTasks);
  const isProjects = mode !== "tasks";
  /* Ticking closes the task's parts too (task.jsx → taskToggle). */
  const toggleId = (id) => window.taskToggle(onToggle, tasks.find((t) => t.id === id) || { id: id, done: false });
  const [tab, setTab] = React.useState(isProjects ? "all" : "today");
  const [fold, setFold] = React.useState({});
  const reg = wkUseProjects();
  const [sheet, setSheet] = React.useState(false);
  /* Projects (08.10.26): "cards" = the overview, "list" = every project's
     tasks in one list (needtSettings.projectsView); a card opens its page. */
  const [pview, setPviewRaw] = React.useState(() => { const st = window.needtSettings; return st && st.get && st.get("projectsView") === "list" ? "list" : "cards"; });
  const setPview = (v) => { setPviewRaw(v); setOpenP(null); if (window.needtSettings) window.needtSettings.set("projectsView", v); };
  const [openP, setOpenP] = React.useState(null);
  React.useEffect(() => {
    const take = (name) => { const P = window.projects && name && window.projects.find(name); if (P && isProjects) { setOpenP(P.id); window.__needtProjectPending = null; } };
    take(window.__needtProjectPending);
    const on = (e) => take(e.detail && e.detail.name);
    window.addEventListener("needt-project-open", on); return () => window.removeEventListener("needt-project-open", on);
  }, [isProjects]);
  React.useEffect(() => {
    const on = (e) => { if (e.detail === "project" && isProjects) setSheet(true); };
    window.addEventListener("needt-new", on); return () => window.removeEventListener("needt-new", on);
  });
  const projects = wkProjectsSorted(reg.list, reg.sort, tasks);
  const own = new Set(reg.list.filter((p) => !p.seed).map((p) => p.name));
  const create = (p) => {
    setSheet(false); if (isProjects) setTab("all");
    if (!window.projects.create(p)) return;
    setFold((f) => Object.assign({}, f, { projects: false }));
    window.toast("Created “" + p.name + "”", { undo: () => window.projects.remove(p.name, { quiet: true }) });
  };
  const flip = (k) => () => setFold((f) => Object.assign({}, f, { [k]: !f[k] }));
  const HdFold = window.HdFold;
  /* Tasks: a project filter from the card row; lives in the component so it
     survives tab switches, and every count below respects it. */
  const [pf, setPf] = React.useState(null);
  const liveAll = tasks.filter((t) => !t.noSlot);
  const pidOf = (name) => (projects.find((p) => p.name === name) || {}).id;
  const noneOpen = liveAll.filter((t) => !t.projectId && !t.done).length;
  const cardOK = (k) => k === "__none" ? noneOpen > 0 : projects.some((p) => p.name === k);
  const filt = !isProjects && pf && cardOK(pf) ? pf : null;
  const live = filt ? liveAll.filter((t) => filt === "__none" ? !t.projectId : t.projectId === pidOf(filt)) : liveAll;
  const pick = (k) => () => setPf((v) => v === k ? null : k);
  const inbox = live.filter((t) => !t.dueDate && !t.isFixed && !t.done);
  const today = live.filter((t) => t.overdue || dayOf(t) === WK_TODAY);
  const upcoming = live.filter((t) => !t.overdue && dayOf(t) != null && dayOf(t) > WK_TODAY && dayOf(t) < 20);
  const row = (t) => <window.Task key={t.id} layout="row" task={t} late={t.overdue && !t.done} onToggle={() => toggleId(t.id)} onOpen={onOpen} dragProps={dragProps} hideProject={!!pf} />;
  const tabs = [["inbox", "Inbox", inbox.length], ["today", "Today", today.filter((t) => !t.done).length], ["upcoming", "Upcoming", upcoming.filter((t) => !t.done).length], ["all", "All Tasks", null]];
  const WD = { 2: "Wednesday", 3: "Thursday", 4: "Friday", 5: "Saturday", 6: "Sunday", 7: "Monday" };

  /* Sections hold open tasks only (07.10.26): a ticked task leaves Overdue,
     Today, a project — wherever it was — and lands in one Done fold at the
     bottom of the tab, closed by default. Empty sections are not drawn. */
  const isOpen = (t) => !t.done;
  let sections = [];
  let doneList = [];
  if (tab === "inbox") { sections = [["Inbox", inbox]]; doneList = live.filter((t) => !t.dueDate && !t.isFixed && t.done); }
  if (tab === "today") { sections = [["Overdue", today.filter((t) => t.overdue)], ["Today", today.filter((t) => !t.overdue)]]; doneList = today.filter((t) => t.done); }
  if (tab === "upcoming") { sections = Object.keys(WD).map((d) => [(Number(d) === 2 ? "Tomorrow" : WD[d]) + ", " + d + " Sep", upcoming.filter((t) => dayOf(t) === Number(d))]); doneList = upcoming.filter((t) => t.done); }
  if (tab === "all") {
    sections = (isProjects ? [] : [["Inbox", inbox]]).concat(projects.map((p) => [p.name, live.filter((t) => t.projectId === p.id)])).concat([["No project", live.filter((t) => !t.projectId && t.dueDate)]]);
    const ids = new Set(projects.map((p) => p.id));
    doneList = live.filter((t) => t.done && (isProjects ? ids.has(t.projectId) : true));
  }
  sections = sections.map(([k, l]) => [k, l.filter(isOpen).sort(wkByTime)]).filter((x) => x[1].length);
  /* The open project page (gone if the project was deleted meanwhile), and
     whether the combined list is drawn (Tasks always; Projects in List). */
  const page = isProjects && openP ? projects.find((p) => p.id === openP) || null : null;
  const listOn = !isProjects || (pview === "list" && !page);
  doneList = doneList.slice().sort(wkByTime);

  return (
    <div className="wk-screen">
      <header className="wk-head">
        {isProjects ? <window.PageAddButton label="New project" onClick={() => setSheet(true)} />
          : <window.PageAddButton label="New" items={[{ art: "task", title: "New Task", sub: "Lands in Inbox", kbd: "N", onClick: () => window.__app && window.__app.openComposer && window.__app.openComposer() }, { art: "folder", title: "New Project", sub: "A folder with its own colour", onClick: () => setSheet(true) }]} />}
        <NewProjectSheet open={sheet} onClose={() => setSheet(false)} onCreate={create} taken={projects.map((p) => p.name)} />
        {page ? (
          <button type="button" className="nx-btn nx-btn-text nx-btn-sm wk-back" data-wk-back="" onClick={() => setOpenP(null)}>
            <WkIcon name="chevron-left" size={15} />Projects
          </button>
        ) : <h1 className="wk-title">{isProjects ? "Projects" : "Tasks"}</h1>}
        {isProjects && !page && projects.length && window.Seg2 ? (
          <span className="wk-pview" data-wk-pview={pview}><window.Seg2 value={pview} onChange={setPview} options={[["cards", "Cards"], ["list", "List"]]} /></span>
        ) : null}
        {isProjects ? null : <span className="wk-tabs">
          {tabs.map(([id, l, n]) => (
            <button key={id} type="button" className={"wk-tab wk-tabbtn" + (tab === id ? " is-on" : "")} onClick={() => setTab(id)} aria-pressed={tab === id}>
              {l}{n ? <span className="wk-meta wk-num">{n}</span> : null}
            </button>
          ))}
        </span>}
      </header>

      {isProjects ? null : (
        <div data-wk-cards="" className="wk-cards">
          {projects.map((p, i) => {
            const mine = liveAll.filter((t) => t.projectId === p.id);
            return <WkMiniCard key={p.name} i={i} name={p.name} hue={p.color || wkProjectHue(p.name)} open={mine.filter((t) => !t.done).length} total={mine.length} selected={filt === p.name} onPick={pick(p.name)} />;
          })}
          {noneOpen ? (() => {
            const mine = liveAll.filter((t) => !t.projectId);
            return <WkMiniCard key="__none" none i={projects.length} name="No project" hue="var(--text-muted)" open={noneOpen} total={mine.length} selected={filt === "__none"} onPick={pick("__none")} />;
          })() : null}
          {filt ? (
            <button type="button" data-wk-clear="" className="nx-btn nx-btn-text nx-btn-sm nx-swap wk-clear" onClick={() => setPf(null)}>
              <WkIcon name="x" size={13} />Clear filter
            </button>
          ) : null}
        </div>
      )}

      <div key={tab + (isProjects ? "-" + pview + "-" + (page ? page.id : "") : "")} className="scroll-inner nx-swap wk-scroll">
        {page ? <WkProjectPage key={page.id} p={page} tasks={liveAll} onBack={() => setOpenP(null)} onToggle={toggleId} onOpen={onOpen} dragProps={dragProps} /> : null}
        {isProjects && !page && pview === "cards" && projects.length ? (
          <div className="wk-pgrid" data-wk-pgrid="">
            {projects.map((p, i) => <ProjectCard key={p.name} p={p} i={i} tasks={live} onToggle={toggleId} onOpen={onOpen} onPick={setOpenP} />)}
          </div>
        ) : null}
        {listOn && sections.map(([title, list]) => HdFold ? (
          <HdFold key={title} title={title} tone={title === "Overdue" ? "late" : undefined} count={list.length} open={!fold[title]} onToggle={flip(title)}>
            <div className="wk-list">{window.HdCapped ? <window.HdCapped list={list} render={row} cap={50} /> : list.map(row)}</div>
          </HdFold>
        ) : null)}
        {listOn && HdFold && doneList.length ? (
          <HdFold key="__done" title="Done" count={doneList.length} open={!!fold.__done} onToggle={flip("__done")}>
            <div data-wk-done="" className="wk-list">{window.HdCapped ? <window.HdCapped list={doneList} render={row} cap={50} /> : doneList.map(row)}</div>
          </HdFold>
        ) : null}
        {page || (isProjects && pview === "cards" && projects.length) ? null : isProjects && !projects.length ? (
          <WkEmpty art="folder" title="No projects yet" line="A project groups tasks and docs under one colour."
            cta="New project" icon="plus" onClick={() => setSheet(true)} />
        ) : !sections.length && !doneList.length ? (
          <WkEmpty art="task" title={WK_EMPTY[isProjects ? "projects" : tab][0]} line={WK_EMPTY[isProjects ? "projects" : tab][1]}
            cta="New task" icon="plus" onClick={() => window.__app && window.__app.openComposer && window.__app.openComposer()} />
        ) : null}
      </div>
    </div>
  );
}

/* EDGE CASES (07.10.26) — a prototype switch for inspecting content limits by
   hand. window.__edgeData(kind) swaps the fixture data in place (tasks via
   the app, docs and projects via their stores); 'reset' puts the seeds back.
     long     very long task / project / doc names
     german   long German compounds (Donaudampfschifffahrts…)
     empty    no tasks, docs or projects
     one      exactly one of each
     many     500 tasks across projects, days and times
     nocolor  a project with no colour (and no icon) holding tasks and a doc
     mail     Mail: 200 threads over many days, long subjects / senders /
              previews (MailScreen.jsx → window.mailEdge); 'empty' empties
              Mail too, every other kind puts the seed mail back
     calendar Calendar: a dense Tuesday (overlapping blocks every half hour),
              very short blocks (5–10 min) and very long titles; plus Event
              rows (startAt / endAt, ids "edge-ev…") through window.calEvents —
              overlapping meetings, 5-minute ones, an all-day event. Every
              other kind takes the edge events back out
   Everything persists like real edits (localStorage), so a reload keeps the
   case until 'reset'. */
(function () {
  const iso = (d) => window.NEEDT.iso(new Date(2026, 8, d));
  const pad = (n) => String(n).padStart(2, "0");
  const T = (id, title, extra) => Object.assign({ id: id, title: title, projectId: null, status: "todo", estimatedMinutes: 30, done: false }, extra || {});
  const at = (day, h, min) => ({ dueDate: iso(day), scheduledStart: iso(day) + "T" + pad(Math.floor(h)) + ":" + pad(Math.round((h % 1) * 60)), estimatedMinutes: min || 30 });
  const fixEnd = (t) => {
    if (!t.scheduledStart) return t;
    const m = Math.round(window.NEEDT.at(t) * 60) + (t.estimatedMinutes || 30);
    return Object.assign(t, { scheduledEnd: t.scheduledStart.slice(0, 11) + pad(Math.min(23, Math.floor(m / 60))) + ":" + pad(m % 60) });
  };
  const docBase = (d) => Object.assign({ isFavorite: false, trashedAt: null, projectId: null, coverUrl: null, style: null, updated: "Just now", viewed: "Just now", created: "Today", body: [] }, d);
  const seedProjects = () => window.projectSeeds();
  const seedDocs = () => (window.DOCS || []).map((d) => docBase(Object.assign({ isFavorite: d.id === "launch" || d.id === "rules", updated: d.updated, viewed: d.viewed, created: d.created }, d)));
  const seedTasks = () => JSON.parse(JSON.stringify(window.NEEDT.tasks || []));
  const LONG_P = "Quarterly operations, invoicing, supplier follow-ups and everything else that keeps the shop running";
  const LONG_T = [
    "Write to the supplier about the delayed September batch, ask for a firm ship date, and confirm the new invoice address before Friday",
    "Photograph every jacket in the autumn drop on the grey backdrop, front, back, label and the two close-ups the listings need",
    "Read the whole twelve-page factory quote again, line by line, and mark every clause that changes the price after the first order",
    "Pack the boots for pickup"
  ];
  const DE_P = "Steuererklärungsunterlagen";
  const DE_T = ["Donaudampfschifffahrtsgesellschaftskapitän anrufen", "Steuererklärungsunterlagen zusammensuchen und an die Treuhänderin schicken",
    "Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz lesen", "Kraftfahrzeughaftpflichtversicherung kündigen", "Bücher zurückbringen"];
  const SETS = {
    long() {
      const tasks = seedTasks();
      LONG_T.forEach((title, i) => { if (tasks[i + 6]) tasks[i + 6].title = title; });
      tasks.forEach((t) => { if (t.projectId === "ops") t.projectId = "p-long"; });
      const projects = seedProjects().map((p) => p.id === "ops" ? Object.assign({}, p, { id: "p-long", name: LONG_P, seed: false }) : p);
      const docs = seedDocs().map((d) => d.id === "launch" ? Object.assign({}, d, { title: "Launch brief for the September release — scope, open questions, owners, dates and every decision we still have to make before it ships", projectId: "p-long" }) : d);
      return { tasks, projects, docs };
    },
    german() {
      const tasks = seedTasks();
      DE_T.forEach((title, i) => { if (tasks[i + 6]) tasks[i + 6].title = title; });
      tasks.forEach((t) => { if (t.projectId === "german") t.projectId = "p-de"; });
      const projects = seedProjects().map((p) => p.id === "german" ? Object.assign({}, p, { id: "p-de", name: DE_P, seed: false }) : p);
      const docs = seedDocs().map((d) => d.id === "german" ? Object.assign({}, d, { title: "Donaudampfschifffahrtsgesellschaftskapitänsmützenabzeichen", projectId: "p-de" }) : d);
      return { tasks, projects, docs };
    },
    empty() { return { tasks: [], projects: [], docs: [] }; },
    one() {
      return { tasks: [fixEnd(T(1, "Reply to the Berlin buyer", Object.assign({ projectId: "resale" }, at(1, 15, 20))))],
        projects: seedProjects().filter((p) => p.id === "resale"),
        docs: seedDocs().filter((d) => d.id === "launch") };
    },
    many() {
      const pids = ["resale", "ops", "ds", "german", null];
      const verbs = ["Reply to", "Check", "Pack", "Photograph", "Send", "Draft", "Review", "Call", "Update", "List"];
      const nouns = ["the supplier", "the Berlin buyer", "the print proof", "the jackets", "the invoice", "the brief", "the courier", "the boots", "the sheet", "Lena"];
      const tasks = [];
      for (let i = 0; i < 500; i++) {
        const r = i % 10;
        const day = r < 5 ? 1 : r < 7 ? 2 + (i % 6) : r < 8 ? 29 + (i % 2) : null;
        const extra = { projectId: pids[i % 5] };
        if (day === 29 || day === 30) Object.assign(extra, at(0, 9, 15), { dueDate: "2026-08-" + day, scheduledStart: "2026-08-" + day + "T09:00", overdue: true });
        else if (day) Object.assign(extra, at(day, 7 + ((i * 7) % 28) / 2, 15 + (i % 4) * 15));
        tasks.push(fixEnd(T(1000 + i, verbs[i % 10] + " " + nouns[(i * 3) % 10] + " #" + (i + 1), extra)));
      }
      return { tasks, projects: seedProjects(), docs: seedDocs() };
    },
    nocolor() {
      const tasks = seedTasks();
      let n = 0;
      tasks.forEach((t) => { if (!t.projectId && n < 4) { t.projectId = "p-nocolor"; n++; } });
      const projects = seedProjects().concat([{ id: "p-nocolor", name: "Unsorted", color: null, icon: null }]);
      const docs = seedDocs().map((d) => d.id === "review" ? Object.assign({}, d, { projectId: "p-nocolor" }) : d);
      return { tasks, projects, docs };
    },
    calendar() {
      const tasks = seedTasks().filter((t) => !t.scheduledStart || window.NEEDT.dueDay(t) !== 1);
      const titles = ["Call the courier", "Standup notes", "Reply to Jonas about the Thursday pickup and the cash-or-TWINT question he asked twice",
        "Ping", "Check the print proof — colour, placement 7 cm under the collar, off-white ink on black", "Fix",
        "Steuererklärungsunterlagen zusammensuchen und an die Treuhänderin schicken", "Pack", "Photograph every jacket in the autumn drop",
        "Ok?", "Sign the factory quote after reading all twelve pages line by line", "Mail"];
      const pids = ["ops", "ds", "resale", "german", null];
      let id = 3000;
      /* Dense: two to three overlapping blocks every half hour from 08:00 to 20:00. */
      for (let k = 0; k < 24; k++) {
        const h = 8 + k / 2;
        tasks.push(fixEnd(T(id++, titles[k % titles.length], Object.assign({ projectId: pids[k % 5] }, at(1, h, k % 3 === 0 ? 90 : 45)))));
        tasks.push(fixEnd(T(id++, titles[(k + 5) % titles.length], Object.assign({ projectId: pids[(k + 2) % 5] }, at(1, h + 0.25, k % 2 ? 5 : 10)))));
        if (k % 4 === 0) tasks.push(fixEnd(T(id++, titles[(k + 2) % titles.length], Object.assign({ projectId: pids[(k + 3) % 5] }, at(1, h, 20)))));
      }
      /* Very short blocks on their own (no overlap) and long titles elsewhere in the week. */
      [[2, 9, 5], [2, 9.5, 10], [2, 10, 5], [3, 13, 5], [4, 16, 10]].forEach(([d, h, m], i) => tasks.push(fixEnd(T(id++, titles[(i * 3 + 2) % titles.length], Object.assign({ projectId: pids[i % 5] }, at(d, h, m))))));
      [[3, 15, 120], [5, 9, 240], [6, 14, 60]].forEach(([d, h, m], i) => tasks.push(fixEnd(T(id++, LONG_T[i], Object.assign({ projectId: pids[(i + 1) % 5] }, at(d, h, m))))));
      return { tasks, projects: seedProjects(), docs: seedDocs() };
    },
    mail() { return { tasks: seedTasks(), projects: seedProjects(), docs: seedDocs() }; },
    reset() { return { tasks: seedTasks(), projects: seedProjects(), docs: seedDocs() }; }
  };
  /* Event rows for the calendar kind (NEEDT.eventAt → startAt / endAt). */
  const edgeEvents = () => {
    const N = window.NEEDT, out = [];
    const ev = (i, day, h, min, title, extra) => out.push(N.eventAt(day, h, min, Object.assign({ id: "edge-ev" + i, title: title }, extra || {})));
    ["Standup", "Sync with the print atelier about the September run, the placement and the off-white ink", "1:1", "Ok", "Supplier call — Donaudampfschifffahrtsgesellschaft"]
      .forEach((t, i) => ev(i, 1, 9 + i * 0.5, i % 2 ? 90 : 30, t, { calendarId: "work", source: "google", externalId: "gcal-edge-" + i }));
    [[2, 9, 5], [2, 9.25, 5], [3, 17, 10]].forEach(([d, h, m], i) => ev(10 + i, d, h, m, i ? "Ping" : "Quick check-in"));
    out.push(N.makeEvent({ id: "edge-ev20", title: "Flea market weekend — all day, every stall from the river to the station", startAt: N.dayIso(5) + "T00:00", endAt: N.dayIso(7) + "T00:00", isAllDay: true, calendarId: "personal", source: "apple", externalId: "icloud-edge-20" }));
    return out;
  };
  window.__edgeData = function (kind) {
    const make = SETS[kind];
    if (!make) { console.warn("__edgeData: one of " + Object.keys(SETS).join(" | ")); return Object.keys(SETS); }
    const d = make();
    wkProjectStore.set((s) => Object.assign({}, s, { list: d.projects }));
    if (window.docStore) window.docStore.set(d.docs);
    if (window.__app && window.__app.setTasksRaw) window.__app.setTasksRaw(d.tasks);
    if (window.mailEdge) window.mailEdge(kind === "mail" || kind === "empty" ? kind : "reset");
    if (window.calEvents) {
      const keep = window.calEvents.store.get().filter((e) => !String(e.id).startsWith("edge-ev"));
      window.calEvents.store.set(kind === "calendar" ? keep.concat(edgeEvents()) : keep);
    }
    window.dispatchEvent(new CustomEvent("needt-edge", { detail: kind }));
    return { kind: kind, tasks: d.tasks.length, projects: d.projects.length, docs: d.docs.length };
  };
})();

Object.assign(window, { WorkScreen, Ring, NewProjectSheet });
