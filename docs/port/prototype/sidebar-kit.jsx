/* SIDEBAR KIT — the toggle in the top-left, Customize Sidebar, and the prefs
   both read (06.10.26, after Craft).

   Places: every place Needt has. The person picks which ones are tiles; the
   rest live behind the last tile, More, which opens the big create-style menu
   listing them. Sections (Pinned, Projects) can be hidden and reordered. */
const SkNS = window.NeedtDesignSystem_25d3c8;
const { Icon: SkIcon, Tooltip: SkTooltip } = SkNS;

const SK_PLACES = [
  { id: "today", label: "Home", art: "home", sub: "Your day as a page" },
  { id: "calendar", label: "Calendar", art: "event", sub: "Events and placed work", badge: { text: "3m" } },
  { id: "tasks", label: "Tasks", art: "task", sub: "Inbox, today, upcoming" },
  { id: "docs", label: "Docs", art: "page", sub: "Pages and notes" },
  { id: "mail", label: "Mailbox", art: "mail", sub: "What is waiting on you", badge: { text: "12", accent: true }, alert: "Outlook needs reconnecting" },
  { id: "projects", label: "Projects", art: "work", sub: "Every task, by project" },
  { id: "moodboards", label: "Moodboards", art: "stack", sub: "References, side by side" },
  { id: "habits", label: "Habits", art: "habit", sub: "What comes back every day" },
  { id: "templates", label: "Templates", art: "template", sub: "Pages you start from" },
  { id: "shared", label: "Shared", art: "stack", sub: "Pages others shared with you" },
  { id: "trash", label: "Trash", art: "trash", sub: "Kept for 30 days" }
];
const SK_SECTIONS = [{ id: "starred", label: "Pinned" }, { id: "projects", label: "Projects" }];
/* Default: Home, Calendar, Tasks, Docs, Mail as tiles, More as the sixth.
   Everything else waits in More (07.10.26). */
const SK_DEFAULT = {
  places: SK_PLACES.map((p, i) => ({ id: p.id, on: i < 5 })),
  sections: SK_SECTIONS.map((s) => ({ id: s.id, on: true })),
  /* Section ids folded shut in the sidebar (Pinned / Projects headers). */
  collapsed: {}
};
/* Saved prefs keep their order and choices; places that did not exist when
   they were saved are appended (off), places that no longer exist drop out. */
function skMerge(saved) {
  const known = new Set(SK_PLACES.map((p) => p.id));
  const places = (saved.places || []).filter((p) => known.has(p.id));
  SK_PLACES.forEach((p) => { if (!places.some((x) => x.id === p.id)) places.push({ id: p.id, on: false }); });
  return Object.assign({}, SK_DEFAULT, saved, { places: places, sections: saved.sections || SK_DEFAULT.sections });
}
const SK_KEY = "needt.sidebar.v2";

/* One tiny store: the sidebar, the dialog and the context menus all read it. */
const skStore = (function () {
  let state = SK_DEFAULT;
  const S = window.needtSync;
  try { const saved = S ? S.get(SK_KEY, null) : JSON.parse(window.localStorage.getItem(SK_KEY)); if (saved && typeof saved === "object") state = skMerge(saved); if (S) S.remove("needt.sidebar"); } catch (e) { /* no storage */ }
  const subs = new Set();
  const store = {
    get: () => state,
    set: (next) => { state = typeof next === "function" ? next(state) : next; subs.forEach((f) => f(state)); },
    sub: (f) => { subs.add(f); return () => subs.delete(f); }
  };
  /* Persisted through needtSync; another window's layout lands here. */
  if (S) S.bind(store, SK_KEY, { load: (v) => skMerge(v && typeof v === "object" ? v : {}) });
  return store;
})();
function useSidebarPrefs() {
  const [s, setS] = React.useState(skStore.get());
  React.useEffect(() => skStore.sub(setS), []);
  return [s, skStore.set];
}
const skPlace = (id) => SK_PLACES.find((p) => p.id === id);
function skShow(id) { skStore.set((s) => Object.assign({}, s, { places: s.places.map((p) => p.id === id ? Object.assign({}, p, { on: true }) : p) })); }
function skFold(id, shut) { skStore.set((s) => Object.assign({}, s, { collapsed: Object.assign({}, s.collapsed, { [id]: shut == null ? !(s.collapsed || {})[id] : !!shut }) })); }
function skHide(id) { skStore.set((s) => Object.assign({}, s, { places: s.places.map((p) => p.id === id ? Object.assign({}, p, { on: false }) : p) })); }

/* ---------- the toggle: icon toggles, chevron opens the small menu ---------- */
function SidebarToggle({ hidden }) {
  const [open, setOpen] = React.useState(false);
  const [shown, leaving] = window.useExit(open, 130);
  const wrap = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const app = window.__app || {};
  const btn = { height: 30, border: 0, background: "transparent", color: "var(--text-secondary)", cursor: "default", display: "grid", placeItems: "center", borderRadius: 8 };
  return (
    <span className="shell-sidebar-toggle-row" ref={wrap} style={{ background: open ? "var(--fill-3)" : "transparent" }}>
      <SkTooltip label={"Toggle sidebar visibility • ⌘\\"} side="right">
        <button type="button" className="nx-press" aria-label="Toggle sidebar" onClick={() => { const a = window.__app; if (a && a.toggleSidebar) a.toggleSidebar(); }} style={Object.assign({ width: 30 }, btn)}>
          <SkIcon name="sidebar-left" size={18} />
        </button>
      </SkTooltip>
      <button type="button" aria-label="Sidebar options" aria-expanded={open} onClick={() => setOpen(!open)} style={Object.assign({ width: 18 }, btn)}>
        <span className="shell-sidebar-toggle-row-2" style={{ transform: open ? "rotate(180deg)" : "none" }}><SkIcon name="chevron-down" size={13} /></span>
      </button>
      {shown ? (
        <div role="menu" className={"shell-sidebar-toggle-menu " + "nx-pop" + (leaving ? " is-leaving" : "")}
         >
          {[[app.focusMode ? "Exit Focus Mode" : "Enable Focus Mode", "⌘.", () => { const a = window.__app; if (a) a.setFocusMode(!a.focusMode); }],
            ["Customize Sidebar", "", () => { const a = window.__app; if (a) a.setCustomize(true); }]].map(([l, k, fn], i) => (
            <button key={l} type="button" role="menuitem" onClick={() => { setOpen(false); fn(); }} className="nx-swap sk-row shell-sidebar-toggle-sk-row"
              style={{ animationDuration: "220ms", animationDelay: (30 + i * 25) + "ms" }}>
              {l}<span className="base-meta-muted shell-sidebar-toggle-text">{k}</span>
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

/* ---------- Customize Sidebar ---------- */
function SkCheck({ on, onClick }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} onClick={onClick} className="nx-check shell-sk-check-check"
      style={{ background: on ? "var(--accent)" : "transparent", boxShadow: on ? "none" : "color-mix(in oklab, var(--text-primary) 22%, transparent) 0 0 0 1.5px inset" }} aria-pressed={on}>
      {on ? <SkIcon name="check" size={14} /> : null}
    </button>
  );
}

/* Drag to reorder: HTML5 drag, the list reorders live under the cursor and
   every row slides to its new place (FLIP, 200 ms). */
function SkList({ rows, label, onToggle, onMove, art }) {
  const refs = React.useRef({});
  const last = React.useRef({});
  const [drag, setDrag] = React.useState(null);
  React.useLayoutEffect(() => {
    rows.forEach((r) => {
      const el = refs.current[r.id]; if (!el) return;
      const top = el.getBoundingClientRect().top, was = last.current[r.id];
      if (was != null && was !== top) {
        el.style.transition = "none"; el.style.transform = "translateY(" + (was - top) + "px)";
        requestAnimationFrame(() => { el.style.transition = "transform 200ms var(--nx-ease)"; el.style.transform = ""; });
      }
      last.current[r.id] = top;
    });
  });
  return (
    <div className="shell-sk-list-stack">
      {rows.map((r, i) => (
        <div className="shell-sk-list-row" key={r.id} ref={(el) => { refs.current[r.id] = el; }} draggable
          onDragStart={(e) => { setDrag(r.id); e.dataTransfer.effectAllowed = "move"; }}
          onDragEnd={() => setDrag(null)}
          onDragOver={(e) => { e.preventDefault(); if (drag && drag !== r.id) onMove(drag, r.id); }}
          style={{ opacity: drag === r.id ? 0.5 : 1 }}>
          <span className="shell-sk-list-row-2"><SkIcon name="grip-vertical" size={16} /></span>
          {art ? <window.Art name={art(r.id)} size={22} /> : null}
          <span className="shell-sk-list-text" style={{ color: r.on ? "var(--text-primary)" : "var(--text-tertiary)" }}>{label(r.id)}</span>
          <SkCheck on={r.on} onClick={() => onToggle(r.id)} />
          {i < rows.length - 1 ? <span className="shell-sk-list-layer" aria-hidden="true" /> : null}
        </div>
      ))}
    </div>
  );
}

function CustomizeSidebar({ open, onClose }) {
  const [shown, leaving] = window.useExit(open, 170);
  const [prefs, setPrefs] = useSidebarPrefs();
  React.useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc);
  }, [open]);
  if (!shown) return null;
  const move = (key) => (from, to) => setPrefs((s) => {
    const list = s[key].slice(); const a = list.findIndex((x) => x.id === from), b = list.findIndex((x) => x.id === to);
    const [it] = list.splice(a, 1); list.splice(b, 0, it); return Object.assign({}, s, { [key]: list });
  });
  const flip = (key) => (id) => setPrefs((s) => Object.assign({}, s, { [key]: s[key].map((x) => x.id === id ? Object.assign({}, x, { on: !x.on }) : x) }));
  const tiles = prefs.places.filter((p) => p.on).length;
  return ReactDOM.createPortal(
    <div className={"base-scrim " + "nx-scrim" + (leaving ? " is-leaving" : "")} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
     >
      <div role="dialog" aria-modal="true" aria-label="Customize Sidebar" className={"shell-customize-sidebar-customize-sidebar " + "nx-sheet" + (leaving ? " is-leaving" : "")}
       >
        <header className="shell-customize-sidebar-row">
          <h2 className="shell-customize-sidebar-text">Customize Sidebar</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="nx-press base-close shell-sidebar-toggle-text"
           >
            <SkIcon name="x" size={13} />
          </button>
        </header>
        <p className="shell-customize-sidebar-text-2">Reorder or hide places and sections. Hidden places move into More.</p>
        <div className="shell-customize-sidebar-row-2">
          <span className="shell-customize-sidebar-text-3">Places</span>
          <span className="base-meta-muted">{tiles} as tiles · {SK_PLACES.length - tiles} in More</span>
        </div>
        <SkList rows={prefs.places} label={(id) => skPlace(id).label} art={(id) => skPlace(id).art} onToggle={flip("places")} onMove={move("places")} />
        <span className="shell-customize-sidebar-text-4">Sections</span>
        <SkList rows={prefs.sections} label={(id) => SK_SECTIONS.find((s) => s.id === id).label} onToggle={flip("sections")} onMove={move("sections")} />
        <button className="shell-customize-sidebar-button" type="button" onClick={() => setPrefs(SK_DEFAULT)}
         >Reset to default</button>
      </div>
    </div>, document.body);
}

/* ---------- the bottom-left switcher (Craft): folder = the app's places,
   doc = the open document's panel. It swaps only the left rail; the doc stays
   in the centre. Each rail mounts its own copy, so the last value is kept
   here and the indicator slides from it on mount. ---------- */
let skSwLast = null;
function SidebarSwitcher({ value }) {
  const [pos, setPos] = React.useState(skSwLast == null ? value : skSwLast);
  React.useEffect(() => {
    let a = 0, b = 0;
    if (pos !== value) a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setPos(value)); });
    skSwLast = value;
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b); };
  }, [value]);
  const pick = (v) => { if (v === value) return; skSwLast = value; const ap = window.__app; if (ap && ap.setSbMode) ap.setSbMode(v); };
  const segs = [["app", "folder", "Places"], ["doc", "file-text", "Document"]];
  return (
    <div className="sk-switch" role="tablist" aria-label="Sidebar content">
      <span className="sk-switch-ind" aria-hidden="true" style={{ transform: pos === "doc" ? "translateX(36px)" : "none" }} />
      {segs.map(([id, icon, label]) => (
        <SkTooltip key={id} label={label} side="top">
          <button type="button" role="tab" aria-selected={pos === id} aria-label={label} data-sb-switch={id}
            className={"sk-switch-seg" + (pos === id ? " is-on" : "")} onClick={() => pick(id)}>
            <SkIcon name={icon} size={17} />
          </button>
        </SkTooltip>
      ))}
    </div>
  );
}

/* ---------- the right toggle: the doc's inspector (Insert · Format · Style ·
   Info), mirrored. Closed by default while reading (08.10.26); the shell
   remembers the choice (needt.docPanel). ---------- */
function DocPanelToggle() {
  const ap = window.__app || {};
  const on = ap.docPanel !== false;
  return (
    <SkTooltip label={(on ? "Hide" : "Show") + " the side panel • ⌘⌥\\"} side="bottom">
      <button type="button" className="nx-press sk-rtoggle" aria-label={(on ? "Hide" : "Show") + " the side panel"} aria-pressed={on} data-docpanel-toggle=""
        onClick={() => { const a = window.__app; if (a && a.setDocPanel) a.setDocPanel(!a.docPanel); }}>
        <SkIcon name="sidebar-right" size={18} />
      </button>
    </SkTooltip>
  );
}

Object.assign(window, { SK_PLACES, SK_SECTIONS, useSidebarPrefs, skHide, skFold, skShow, skPlace, SidebarToggle, CustomizeSidebar, SidebarSwitcher, DocPanelToggle });
