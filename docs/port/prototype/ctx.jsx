/* RIGHT CLICK — the app's own context menu everywhere (06.10.26, Craft's
   build: plain 15px rows, hairlines between groups, Delete in red, no icons).

   Mark anything with data-ctx="doc|project|task|place|mail|section" (plus
   data-ctx-id / data-ctx-title) and it gets its menu. Everything else gets the
   app menu. Text fields keep the browser's menu, because copy and paste
   belong to the OS there. */

/* Live from the one project registry (work.jsx), read at menu time — plus No project. */
const cxProjects = () => (window.projectStore ? window.projectStore.get().list : []).map((p) => [p.name, window.projectHue ? window.projectHue(p.name) : p.color]).concat([[null, null]]);
const cxNewTab = (kind, id) => () => { if (window.openInNewTab) window.openInNewTab(kind, id); else window.toast("Tabs — coming with the port"); };
const cxEdit = (name) => () => window.dispatchEvent(new CustomEvent("needt-project-edit", { detail: { name: name } }));
const cxCopy = (text) => { window.needtPlatform.copy(text); window.toast("Link copied"); };
/* A project's own page (08.10.26): go to Projects, then land on that project.
   work.jsx listens for "needt-project-open" ({ name }); the pending name covers
   the first visit, when Projects mounts after the event has gone. */
function needtOpenProject(name) {
  window.__needtProjectPending = name;
  const a = window.__app;
  if (a && a.setScreen) a.setScreen("projects");
  window.dispatchEvent(new CustomEvent("needt-project-open", { detail: { name: name } }));
}

/* Delete on a task moves it to Trash (trashedAt), never out of the list, and
   the toast's Undo brings it back. Data.js owns the rule when it has it. */
function cxTrashTask(app, t) {
  if (!t) return;
  const N = window.NEEDT;
  const set = (patch) => app.updateTask(t.id, patch);
  const patchOf = (fn, fallback) => { const r = fn ? fn(t) : null; return r && typeof r === "object" && !Array.isArray(r) ? r : fallback; };
  set(patchOf(N && N.trashTask, { trashedAt: new Date().toISOString() }));
  window.toast("Moved to Trash", { undo: () => set(patchOf(N && N.restoreTask, { trashedAt: null })) });
}

function cxItems(kind, el, app) {
  const id = el && el.getAttribute("data-ctx-id");
  const open = () => { if (!el) return; const t = el.hasAttribute("data-ctx-child") ? el.querySelector("button") : el; if (t) t.click(); };
  const go = (s) => () => app.setScreen && app.setScreen(s);
  const D = window.docs;
  const task = () => (app.tasksNow || []).find((t) => String(t.id) === String(id));
  const mail = (act) => () => window.dispatchEvent(new CustomEvent("needt-mail", { detail: { id: id, act: act } }));
  const moveTo = cxProjects().map(([p, hue]) => [p || "No project", () => D && D.move(id, p, hue)]);
  switch (kind) {
    case "doc": {
      const d = D && D.find(id);
      return [[["Open", open], ["Open in New Tab", cxNewTab("doc", id)]],
        [[d && d.isFavorite ? "Unpin" : "Pin", () => D.star(id)], ["Duplicate", () => D.duplicate(id)], ["Move to…", null, null, "›", moveTo]],
        [["Export as Markdown", () => window.toast("Exported “" + ((d && d.title) || "Untitled") + ".md”")], ["Copy link", () => cxCopy("https://needt.app/d/" + id)]],
        [["Delete", () => D.trash(id), "danger"]]];
    }
    case "trash": return [[["Restore", () => D.restore(id)]], [["Delete forever", () => D.destroy(id), "danger"]]];
    case "project": {
      const P = window.projects;
      const cur = P ? P.sort() : "manual";
      const sortRow = (k, l) => [l, () => { if (P) P.setSort(k); }, null, cur === k ? "✓" : null];
      const pid = window.NEEDT.projectIdOf(id);
      const openN = (app.tasksNow || []).filter((t) => t.projectId === pid && !t.done && !t.noSlot).length;
      return [[["Open", () => needtOpenProject(id)], ["Open in New Tab", cxNewTab("screen", "projects")]], [["Edit…", cxEdit(id)]],
        [["New Task", () => app.openComposer && app.openComposer()], ["New Doc", () => D ? D.newDoc() : go("doc")()]],
        [["Sort by", null, null, "›", [sortRow("manual", "Manual"), sortRow("name", "Name"), sortRow("open", "Open tasks")]]],
        [[openN ? "Delete anyway" : "Delete", () => P && P.remove(id), "danger", openN ? openN + " open" : null]]];
    }
    case "task": {
      const t = task();
      const upd = (p, msg) => () => { if (!t) return; const before = Object.assign({}, t); app.updateTask(id, p); window.toast(msg, { undo: () => app.updateTask(id, before) }); };
      return [[["Open", open], [t && t.done ? "Mark not done" : "Mark done", upd({ done: !(t && t.done) }, t && t.done ? "Marked not done" : "Done")]],
        [["Move to Today", upd(Object.assign({ overdue: false }, window.NEEDT.moveDay(t, "1 Sep")), "Moved to today")], ["Move to Tomorrow", upd(Object.assign({ overdue: false }, window.NEEDT.moveDay(t, "2 Sep")), "Moved to tomorrow")],
          ["Set project…", null, null, "›", cxProjects().map(([p]) => [p || "No project", upd({ projectId: window.NEEDT.projectIdOf(p) }, "Moved to " + (p || "No project"))])]],
        [["Duplicate", () => { if (!t) return; const c = Object.assign({}, t, { id: Date.now(), title: t.title + " (copy)" }); app.setTasksRaw((l) => { const i = l.findIndex((x) => x.id === t.id); const n = l.slice(); n.splice(i + 1, 0, c); return n; }); window.toast("Duplicated", { undo: () => app.setTasksRaw((l) => l.filter((x) => x.id !== c.id)) }); }],
          ["Copy link", () => cxCopy("https://needt.app/t/" + id)]],
        [["Delete", () => cxTrashTask(app, t), "danger"]]];
    }
    case "place": return [[["Open", open], ["Open in New Tab", cxNewTab("screen", id)]], [["Hide from Sidebar", () => { window.skHide && window.skHide(id); window.toast("Moved into More", { undo: () => window.skShow && window.skShow(id) }); }], ["Customize Sidebar…", () => app.setCustomize && app.setCustomize(true)]]];
    case "habit": {
      const H = window.habitApi, h = H && H.find(id);
      if (!h) return [[["Go to Habits", go("habits")]]];
      const kept = window.NEEDT.habitDoneOn(id);
      return [[[kept ? "Mark not kept today" : "Mark kept today", () => H.toggle(id)], ["Go to Habits", go("habits")]],
        [["Archive", () => H.archive(id), "danger"]]];
    }
    case "section": return [[["Customize Sidebar…", () => app.setCustomize && app.setCustomize(true)]]];
    case "mail": return [[["Open", mail("open")]], [["Make a Task", mail("task")], ["Add to Calendar", mail("calendar")]], [["Mark as Unread", mail("unread")], ["Archive", mail("archive")]], [["Delete", mail("delete"), "danger"]]];
    default: return [[["New Task", () => app.openComposer && app.openComposer(), null, "N"], ["New Doc", () => D ? D.newDoc() : go("doc")()]], [["Search", () => app.setPaletteOpen && app.setPaletteOpen(true), null, "⌘K"], ["Toggle Sidebar", () => app.toggleSidebar && app.toggleSidebar(), null, "⌘\\"]], [["Settings", go("settings"), null, "⌘,"]]];
  }
}

/* Edit… — the New Project sheet, filled in: rename and recolour in one go.
   Undo puts both back. */
function CxProjectEdit() {
  const [name, setName] = React.useState(null);
  const [last, setLast] = React.useState(null);
  React.useEffect(() => {
    const on = (e) => { const n = e.detail && e.detail.name; if (n && window.projects && window.projects.find(n)) { setName(n); setLast(n); } };
    window.addEventListener("needt-project-edit", on);
    return () => window.removeEventListener("needt-project-edit", on);
  }, []);
  const Sheet = window.NewProjectSheet;
  if (!Sheet || !window.projects) return null;
  const p = window.projects.find(name || last) || { name: name || last || "", color: null };
  const save = (next) => {
    const P = window.projects, was = { name: p.name, color: p.color };
    setName(null);
    let n = was.name;
    if (next.name !== was.name) { if (!P.rename(was.name, next.name)) return; n = next.name; }
    if (next.color !== was.color) P.recolor(n, next.color);
    if (n !== was.name || next.color !== was.color) {
      window.toast(n !== was.name ? "Renamed to “" + n + "”" : "Colour changed", { undo: () => { if (n !== was.name) P.rename(n, was.name); if (next.color !== was.color) P.recolor(was.name, was.color); } });
    }
  };
  return <Sheet open={!!name} onClose={() => setName(null)} onCreate={save} initial={{ name: p.name, color: p.color }} title="Edit project" cta="Save"
    taken={window.projects.list().map((x) => x.name)} />;
}

function CtxLayer() {
  const [menu, setMenu] = React.useState(null);
  const [shown, leaving] = window.useExit(!!menu, 120);
  const [last, setLast] = React.useState(null);
  const panel = React.useRef(null);
  React.useEffect(() => { if (menu) setLast(menu); }, [menu]);
  React.useEffect(() => {
    function onCtx(e) {
      if (e.defaultPrevented) return;
      const t = e.target;
      if (t.closest("input, textarea, [contenteditable=''], [contenteditable='true']")) return;
      e.preventDefault();
      const el = t.closest("[data-ctx]");
      const kind = el ? el.getAttribute("data-ctx") : "app";
      const groups = cxItems(kind, el, window.__app || {});
      const h = groups.reduce((s, g) => s + g.length * 36, 0) + (groups.length - 1) * 11 + 12;
      const x = Math.min(e.clientX, window.innerWidth - 248), y = Math.min(e.clientY, window.innerHeight - h - 8);
      setMenu({ x: x, y: y, groups: groups, flip: y < e.clientY, key: Date.now() });
    }
    function away(e) { if (panel.current && panel.current.contains(e.target)) return; setMenu(null); }
    function esc(e) { if (e.key === "Escape") setMenu(null); }
    document.addEventListener("contextmenu", onCtx);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("blur", () => setMenu(null));
    window.addEventListener("resize", () => setMenu(null));
    return () => { document.removeEventListener("contextmenu", onCtx); document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, []);
  const m = menu || last;
  if (!shown || !m) return <><CxProjectEdit />{null}</>;
  return <><CxProjectEdit />{ReactDOM.createPortal(
    <div ref={panel} key={m.key} role="menu" className={"base-menu shell-ctx-layer-menu " + "nx-pop" + (leaving ? " is-leaving" : "")}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: m.x, top: m.y, transformOrigin: m.flip ? "bottom left" : "top left" }}>
      {m.groups.map((g, gi) => (
        <React.Fragment key={gi}>
          {gi ? <span className="base-menu-sep" aria-hidden="true" /> : null}
          {g.map(([label, fn, tone, hint, sub]) => (
            <button key={label} type="button" role="menuitem" className="cx-row shell-ctx-layer-row"
              onClick={() => {
                if (sub) { setMenu((mm) => Object.assign({}, mm, { key: Date.now(), groups: [[[label.replace("…", ""), null, "title"]], sub] })); return; }
                if (tone === "title") return;
                setMenu(null); if (fn) window.setTimeout(fn, 0);
              }}
              style={{ font: tone === "title" ? "500 12px/14px var(--font-sans)" : "400 15px/19px var(--font-sans)", height: tone === "title" ? 28 : 36, color: tone === "danger" ? "var(--destructive)" : tone === "title" ? "var(--text-muted)" : "var(--text-primary)" }}>
              {label}
              {hint ? <span className="shell-ctx-layer-span" style={{ font: hint === "›" ? "400 17px/1 var(--font-sans)" : "var(--type-meta)" }}>{hint}</span> : null}
            </button>
          ))}
        </React.Fragment>
      ))}
    </div>, document.body)}</>;
}

Object.assign(window, { CtxLayer, needtOpenProject });
