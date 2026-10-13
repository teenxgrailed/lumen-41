/* The seed lives in Data.js, so both shells read one list. */
const TASKS = window.NEEDT.tasks;

function TabBar({ screen, onScreen, right, left, farRight, onTask, onDoc, due }) {
  const { CommandBar } = window.NeedtDesignSystem_25d3c8;
  if (window.useOpenDoc) window.useOpenDoc();
  return (
    /* Three flex parts rather than absolute corners: the sides never shrink
       below their controls, the search takes what is left (480 at most) and
       stays centred while the sides are equal. */
    <nav className="tab-bar shell-tab-bar-tab-bar">
      <span className="shell-tab-bar-row">{left}</span>
      <span className="shell-tab-bar-span">
        <CommandBar label={screen === "doc" ? "Documents  /  " + ((window.__docTitle && window.__docTitle()) || "Untitled") : "Open"} keys={screen === "doc" ? " " : "⌘K"} width="100%" onClick={() => window.__app && window.__app.setPaletteOpen && window.__app.setPaletteOpen(true)} />
      </span>
      <span className="base-row shell-tab-bar-row-2">
        {right}
        {window.StOfflineIndicator ? <window.StOfflineIndicator /> : null}
        {window.TopIcons ? <window.TopIcons /> : null}
        {farRight}
      </span>
    </nav>
  );
}

/* Plan my day, at the head of Home's prose/canvas forms. */
function TodayControls({ canPlan }) {
  const { Button, Icon } = window.NeedtDesignSystem_25d3c8;
  return (
    <span className="app-today-controls">
      <Button data-agent-plan iconLeft={<Icon name="wand-sparkles" size={16} />} disabled={!canPlan}
        onClick={() => window.__agent && window.__agent.run([
          { sel: "[data-agent-queue] article", act: "hold", say: "Taking what has no time yet", title: "Finish the tank graphic" },
          { sel: "[data-drop=\"timeline\"][data-date=\"1\"]", act: "drop", say: "Into the first free stretch today" },
          { sel: "[data-agent-plan]", act: "click", say: "Two more fit before Thursday" }
        ])}>Plan my day</Button>
    </span>
  );
}

window.NEEDT_KEYS = [
  ["Everywhere", [
    { keys: ["⌘", "K"], match: (e) => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k", label: "Open anything" },
    { keys: ["⌘", "N"], match: (e) => (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "n", label: "New — task, event, document" },
    { keys: ["⌘", "⇧", "F"], match: (e) => (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f", label: "Start or stop focus" },
    { keys: ["⌘", "⇧", "P"], match: (e) => (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p", label: "Plan my day" },
    { keys: ["?"], match: (e) => e.key === "?" && !e.metaKey && !e.ctrlKey, label: "This list" },
    { keys: ["esc"], match: (e) => e.key === "Escape", label: "Close what is open", quiet: true }
  ]],
  ["Go to", [
    { keys: ["G", "H"], seq: "gh", label: "Home" },
    { keys: ["G", "C"], seq: "gc", label: "Calendar" },
    { keys: ["G", "W"], seq: "gw", label: "Workspace" },
    { keys: ["G", "D"], seq: "gd", label: "Documents" },
    { keys: ["G", "S"], seq: "gs", label: "Settings" }
  ]],
  ["On a task", [
    { keys: ["⏎"], label: "Open it", passive: true },
    { keys: ["⌘", "⏎"], label: "Close it", passive: true },
    { keys: ["⌘", "⇧", "S"], label: "Reschedule", passive: true },
    { keys: ["⌫"], label: "Delete it", passive: true }
  ]],
  ["Theme", [
    { keys: ["⌘", "⇧", "L"], match: (e) => (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "l", label: "Cycle the theme" }
  ]]
];

const GO = { gh: "today", gc: "calendar", gw: "projects", gt: "tasks", gd: "docs", gs: "settings" };

/* The sheet reads the same table the handler does. */
function KeySheet({ open, onClose }) {
  const { Icon } = window.NeedtDesignSystem_25d3c8;
  if (!open) return null;
  return (
    <div className="td-scrim" onMouseDown={onClose}>
      <div className="key-sheet" onMouseDown={(e) => e.stopPropagation()}>
        <header className="shell-key-sheet-row">
          <h2 className="shell-key-sheet-text">Keyboard</h2>
          <span className="base-meta-muted">Press ? anywhere to bring this back.</span>
          <span className="shell-key-sheet-text-2">esc to close</span>
        </header>
        <div className="scroll-inner shell-key-sheet-scroll-inner">
          {NEEDT_KEYS.map(([group, rows]) => (
            <section className="base-stack shell-key-sheet-stack" key={group}>
              <span className="base-section-label shell-key-sheet-span">{group}</span>
              {rows.map((r) => (
                <span className="shell-key-sheet-row-2" key={r.label}>
                  <span className="shell-key-sheet-text-3" style={{ color: r.quiet ? "var(--text-muted)" : "var(--text-primary)" }}>{r.label}</span>
                  <span className="shell-key-sheet-row-3">
                    {r.keys.map((k, i) => <kbd key={i} className="key-cap">{k}</kbd>)}
                  </span>
                </span>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Read once, at module scope: the values are used as initial state, and state
   read from a changing source is a bug waiting for a re-render. */
const __params = (function () {
  try {
    const q = new URLSearchParams(window.location.search);
    return { screen: q.get("screen"), theme: q.get("theme"), chrome: q.get("chrome"),
      form: q.get("form"), view: q.get("view") };
  } catch (e) { return {}; }
})();

/* Every task write goes through here, so closing a task closes its parts for
   every caller (row checkbox, context menu, dialog, the agent). Data.js may
   own the rule (NEEDT.applyTaskPatch); this is the same rule inline. */
function patchTask(t, p) {
  const N = window.NEEDT;
  if (N && N.applyTaskPatch) { const r = N.applyTaskPatch(t, p); if (r && typeof r === "object" && !Array.isArray(r)) return r; }
  const next = Object.assign({}, t, p);
  if (p && p.done === true && Array.isArray(t.TaskPart) && !("TaskPart" in p)) next.TaskPart = t.TaskPart.map((x) => (x.done ? x : Object.assign({}, x, { done: true })));
  return next;
}
/* "3pm", "15:00", "9:30am", "noon" → decimal hour. */
function coHourOf(v) {
  const w = String(v || "").toLowerCase().replace(/\s+/g, "");
  if (w === "noon") return 12;
  if (w === "midnight") return 0;
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(w);
  if (!m) return null;
  let h = +m[1] % 24;
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return h + (m[2] ? +m[2] / 60 : 0);
}

function App() {
  const [screen, setScreen] = React.useState(__params.screen || "today");
  /* Settings is a sheet over the place you were, as in Craft: the screen
     underneath stays mounted and is what you return to. */
  const [under, setUnder] = React.useState(screen === "settings" ? "today" : screen);
  React.useEffect(() => { if (screen !== "settings") setUnder(screen); }, [screen]);
  /* Four themes: Light (the default), Dark, System, Time. Theme and accent
     persist; older stored names map onto the four. */
  const [theme, setTheme] = React.useState(() => {
    let v = __params.theme;
    try { if (!v) v = localStorage.getItem("needt.theme"); } catch (e) {}
    return window.normalizeTheme(v);
  });
  const [accent, setAccent] = React.useState(() => {
    let v = null;
    try { v = localStorage.getItem("needt.accent"); } catch (e) {}
    return v && window.NEEDT_ACCENT_IDS.indexOf(v) > -1 ? v : "blue";
  });
  /* Both live in the one settings object (stores.jsx, needtSync), which
     mirrors them to "needt.theme" / "needt.accent". Another window's choice
     comes back here through the same key. */
  React.useEffect(() => { if (window.needtSettings) window.needtSettings.set("theme", theme); }, [theme]);
  React.useEffect(() => { if (window.needtSettings) window.needtSettings.set("accent", accent); }, [accent]);
  React.useEffect(() => {
    const S = window.needtSync;
    if (!S) return undefined;
    return S.subscribe("needt.settings", (v, info) => {
      if (info.origin !== "remote" || !v) return;
      if (v.theme) setTheme((cur) => (window.normalizeTheme(v.theme) === cur ? cur : window.normalizeTheme(v.theme)));
      if (v.accent && window.NEEDT_ACCENT_IDS.indexOf(v.accent) > -1) setAccent(v.accent);
    });
  }, []);
  const pickTheme = (v) => setTheme(typeof v === "function" ? (x) => window.normalizeTheme(v(x)) : window.normalizeTheme(v));
  const day = useDrift(theme);
  const themeCls = day.themeClass + (theme === "time" ? " theme-time" : "");
  /* Tasks carry the database's field names (Data.js). Storage from before the
     rename is migrated by Data.js on load; every write goes through
     NEEDT.sync, so scheduledEnd always equals scheduledStart + estimatedMinutes. */
  const [tasks, setTasksState] = React.useState(() => { try { const s = JSON.parse(localStorage.getItem("needt.tasks")); if (Array.isArray(s)) return s.map(window.NEEDT.migrateTask); } catch (e) {} return TASKS; });
  const setTasks = React.useCallback((f) => setTasksState((l) => (typeof f === "function" ? f(l) : f).map(window.NEEDT.sync)), []);
  /* Persist through needtSync; a change from elsewhere (another window, the
     phone store after a UI switch) is merged per record — this state is
     written from an effect, so it can hold an edit storage has not seen yet. */
  const tasksTok = React.useRef({}).current;
  React.useEffect(() => { if (window.needtSync) window.needtSync.set("needt.tasks", tasks, { source: tasksTok }); }, [tasks]);
  React.useEffect(() => {
    const S = window.needtSync;
    if (!S) return undefined;
    return S.subscribe("needt.tasks", (v, info) => {
      if (info.source === tasksTok || info.origin === "error" || !Array.isArray(v)) return;
      const ch = (info.changes || []).filter((c) => c.key === "needt.tasks");
      if (ch.length) setTasksState((l) => S.mergeInto("needt.tasks", l, ch.map((c) => (c.op === "put" ? Object.assign({}, c, { value: window.NEEDT.migrateTask(c.value) }) : c))));
      else setTasksState(v.map(window.NEEDT.migrateTask));
    });
  }, []);
  const [taskOpen, setTaskOpen] = React.useState(false);
  // taskOpen: false | true (new / unknown) | a task id. Callers may hand us an
  // id, a task/block object, or (old signature) a click event — only ids count.
  const openTask = (x) => {
    const id = x != null && typeof x === "object" ? (x.nativeEvent || x.target ? null : x.id) : x;
    setTaskOpen(id != null ? id : true);
  };
  const [composer, setComposer] = React.useState(null);
  function openComposer() {
    /* The pill's real rectangle, so the arc starts where the object is rather
       than where it was last laid out. */
    const pill = document.querySelector("[data-agent-home]");
    setComposer(pill ? pill.getBoundingClientRect() : { left: window.innerWidth - 140, top: window.innerHeight - 64, width: 116, height: 40 });
  }
  /* The legacy settings dialog (Dialogs.jsx) is retired: anything that still
     asks for it via __app.setSettingsOpen gets the Settings sheet. */
  const setSettingsOpen = (v) => { if (v) goScreen("settings"); else if (at.current === "settings") goScreen(under); };
  const [briefForm, setBriefForm] = React.useState(__params.form || "today");
  const [brief] = React.useState({ timeline: true, marks: true });
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [keysOpen, setKeysOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  /* Sidebar chrome (06.10.26): hidden by the toggle or ⌘\, Focus Mode hides
     the sidebar and the top bar together, Customize Sidebar is a sheet. */
  /* Icons arrive asynchronously: re-render the whole app once they land, so
     no button is left blank on a cold load. */
  const [, iconsTick] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => { window.addEventListener("needt-icons", iconsTick); const t = window.setTimeout(iconsTick, 900); return () => { window.removeEventListener("needt-icons", iconsTick); window.clearTimeout(t); }; }, []);
  const [sbHidden, setSbHidden] = React.useState(false);
  /* Doc view: the bottom-left switcher picks what the left rail shows —
     "doc" (the document's own panel) or "app" (places, pinned, projects).
     The doc stays open in the centre either way. */
  const [sbMode, setSbMode] = React.useState("doc");
  /* The doc's right (style) panel, toggled from the top bar's far right or
     ⌘⌥\; DocsScreen listens for "needt-docpanel". Closed until the person
     opens it once (nothing stored = closed). */
  const [docPanelPref, setDocPanelPref] = React.useState(() => { try { return window.localStorage.getItem("needt.docPanel") === "1"; } catch (e) { return false; } });
  /* Tablet (< 900): the panel is a transient, width-driven state — hidden on
     entering the narrow width, toggled for this window only, never saved.
     Wide again, the saved preference (docPanelPref) applies as the user left it. */
  const DOC_NARROW = 900;
  const [docNarrow, setDocNarrow] = React.useState(() => window.innerWidth < DOC_NARROW);
  const [docPanelNarrow, setDocPanelNarrow] = React.useState(false);
  const docNarrowRef = React.useRef(docNarrow);
  docNarrowRef.current = docNarrow;
  React.useEffect(() => {
    function onResize() {
      const n = window.innerWidth < DOC_NARROW;
      if (n !== docNarrowRef.current) { docNarrowRef.current = n; setDocNarrow(n); setDocPanelNarrow(false); }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const docPanel = docNarrow ? docPanelNarrow : docPanelPref;
  const setDocPanel = (v) => {
    const set = docNarrowRef.current ? setDocPanelNarrow : setDocPanelPref;
    set((cur) => !!(typeof v === "function" ? v(cur) : v));
  };
  React.useEffect(() => { if (window.needtSync) window.needtSync.set("needt.docPanel", docPanelPref ? "1" : "0"); }, [docPanelPref]);
  React.useEffect(() => {
    if (window.__app) window.__app.docPanel = docPanel;
    window.dispatchEvent(new CustomEvent("needt-docpanel", { detail: { open: docPanel } }));
  }, [docPanel]);
  const [focusMode, setFocusMode] = React.useState(false);
  const [customize, setCustomize] = React.useState(false);
  /* Narrow window (< 1100): the sidebar steps out of the row on its own and
     the toggle brings it back as a floating sheet over the content. sbHidden
     stays the user's explicit choice for the wide layout, so growing the
     window back reopens the column unless they had hidden it themselves. */
  const SB_NARROW = 1100;
  const [narrow, setNarrow] = React.useState(() => window.innerWidth < SB_NARROW);
  const [sbFloat, setSbFloat] = React.useState(false);
  const narrowRef = React.useRef(narrow);
  narrowRef.current = narrow;
  React.useEffect(() => {
    function onResize() {
      const n = window.innerWidth < SB_NARROW;
      if (n !== narrowRef.current) { setNarrow(n); setSbFloat(false); }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const toggleSidebar = () => {
    if (focusMode) { setFocusMode(false); setSbHidden(false); setSbFloat(narrowRef.current); return; }
    if (narrowRef.current) setSbFloat((o) => !o);
    else setSbHidden((h) => !h);
  };
  React.useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && (e.code === "Backslash" || e.key === "\\")) {
        e.preventDefault();
        if (e.altKey) setDocPanel((v) => !v); else toggleSidebar();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ".") { e.preventDefault(); setFocusMode((f) => !f); }
      if (e.key === "Escape" && focusMode) setFocusMode(false);
      if (e.key === "Escape") setSbFloat(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);
  /* Choosing a place from the floating sidebar is the end of its errand. */
  React.useEffect(() => { setSbFloat(false); }, [screen]);
  const [bugOpen, setBugOpen] = React.useState(false);
  /* Ask Needt (⌘J) is a column of the main row on a wide window and a right
     sheet below 1100: it never sits over the page it is talking about. Chat
     portals its panel into the dock element. */
  const [chatOpen, setChatOpen] = React.useState(false);
  const [chatDock, setChatDock] = React.useState(null);
  const [selectedDate, setSelectedDate] = React.useState(1);
  /* The calendar opens in the view chosen in Settings, once one was chosen. */
  const [calView, setCalView] = React.useState(__params.view || (window.needtSettings && window.needtSettings.has("view") ? window.needtSettings.get("view") : "columns"));
  const [focus, setFocus] = React.useState(null);
  /* Before the product there are two screens: the account, then the setup.
     stage is which of the three the window is showing. */
  const [stage, setStage] = React.useState("app");
  const [authMode, setAuthMode] = React.useState("signup");
  const [aura, setAuraState] = React.useState(() => (window.needtSettings ? window.needtSettings.get("aura") !== false : true));
  const setAura = (v) => { setAuraState(v); if (window.needtSettings) window.needtSettings.set("aura", !!v); };
  /* Settings the shell itself reads (Focus length, quiet alerts in a session). */
  const [prefs] = window.useSettings ? window.useSettings() : [{}];
  /* Route change (08.10.26): the screen is shown at once, first open or not.
     The old route veil held a never-built screen back 240 ms behind a
     covering mark (and the veil itself for 560 ms), so a first open felt
     slower than a repeat one; now every open is the same .screen-enter CSS
     transition running on the new screen itself. */
  const at = React.useRef(screen);
  at.current = screen;
  /* One way in for anything that wants to move the app — a notification's
     "Show me" goes through the same door as a keyboard shortcut. */
  React.useEffect(() => { window.__go = (s) => goScreen(s); });
  /* The built app (build.js) loads some places on demand (needt-lazy.js);
     when a group lands, render again so its real components replace the
     stand-ins in the same pass. */
  const [, setLazyTick] = React.useState(0);
  React.useEffect(() => {
    const on = () => setLazyTick((n) => n + 1);
    window.addEventListener("needt:lazy", on);
    return () => window.removeEventListener("needt:lazy", on);
  }, []);
  /* Open in New Tab: the address carries what to open (#doc/<id> or
     #screen/<place>), read once when the tab starts. */
  React.useEffect(() => {
    window.openInNewTab = (kind, id) => window.open(location.pathname + location.search + "#" + (kind === "doc" ? "doc" : "screen") + "/" + encodeURIComponent(id), "_blank");
    const m = (location.hash || "").match(/^#(doc|screen)\/(.+)$/);
    if (!m) return;
    const id = decodeURIComponent(m[2]);
    window.setTimeout(() => { if (m[1] === "doc" && window.docs) window.docs.open(id); else goScreen(id); }, 300);
    history.replaceState(null, "", location.pathname + location.search);
  }, []);
  function goScreen(next) {
    if (next === "workspace") next = "projects";
    if (next === "boards") next = "tasks"; /* Boards removed 07.10.26 */ /* the old name, still in shortcuts and search */
    if (next === at.current) return;
    if (next === "settings" || at.current === "settings") { at.current = next; setScreen(next); return; }
    at.current = next;
    setScreen(next);
  }

  /* One drag layer for the whole product: the sidebar hands over a task, the
     calendar hands over a block, and the drop target decides what it meant. */
  const [drag, dragProps, returning] = useDrag(function (item, over, mode) {
    if (!over) return;
    if (over.kind === "day") {
      setTasks((list) => list.map((t) => (t.id === item.id ? Object.assign({}, t, window.NEEDT.moveDay(t, over.date + " Sep"), { isFixed: true }) : t)));
      setSelectedDate(parseInt(over.date, 10));
      return;
    }
    if (over.kind === "focus") {
      setFocus({ intention: item.title, planned: item.estimatedMinutes || parseInt(prefs.len, 10) || 50, elapsed: 0, taskId: item.id });
      return;
    }
    /* A task dropped on a project in the sidebar moves into it. */
    if (over.kind === "project") {
      const t = tasks.find((x) => String(x.id) === String(item.id));
      if (!t || String(t.projectId) === String(over.id)) return;
      const was = t.projectId == null ? null : t.projectId;
      const reg = window.projects && window.projects.list ? window.projects.list() : [];
      const hit = (reg || []).find((p) => String(p.id) === String(over.id));
      const to = hit ? hit.id : over.id;
      setTasks((list) => list.map((x) => (x.id === t.id ? Object.assign({}, x, { projectId: to }) : x)));
      window.toast("Moved to " + (over.label || "the project"), { undo: () => setTasks((list) => list.map((x) => (x.id === t.id ? Object.assign({}, x, { projectId: was }) : x))) });
      return;
    }
    /* A task dropped on another row takes that row's place — the list keeps
       one order and the drop edits it, rather than a second sort. In a list
       sorted by time the gap is a time slot (the phone's rule, phone-tasks.jsx
       ptkDropWrite): the task takes the slot right after the row above, else
       just before the row below; a time that already sorts there is kept —
       so a reordered timed task stays where it was dropped. */
    if (over.kind === "row") {
      const list0 = tasks;
      const find = (id) => (id == null ? null : list0.find((x) => String(x.id) === String(id)) || null);
      const t = find(item.id);
      if (!t) return;
      let prev = null, next = null;
      if (over.order && over.toIx != null && over.fromIx != null && over.toIx >= 0) {
        const o = over.order.slice(); o.splice(over.fromIx, 1); o.splice(over.toIx, 0, String(item.id));
        prev = find(o[over.toIx - 1]); next = find(o[over.toIx + 1]);
      } else {
        const tgt = find(over.id);
        if (!tgt) return;
        if (list0.indexOf(tgt) > list0.indexOf(t)) prev = tgt; else next = tgt;
      }
      const N = window.NEEDT, day = t.dueDate;
      const patch = {};
      if (day) {
        const dur = (x) => (x.estimatedMinutes || 30) / 60;
        const up = (h) => Math.ceil(h * 4 - 1e-6) / 4, down = (h) => Math.floor(h * 4 + 1e-6) / 4;
        const P = prev && prev.dueDate === day ? prev : null, X = next && next.dueDate === day ? next : null;
        const pA = P ? N.at(P) : null, xA = X ? N.at(X) : null, own = N.at(t);
        let hour = own;
        if (P || X) {
          const fits = own != null && (pA == null ? !P : own >= pA) && (xA == null || own <= xA);
          if (fits) hour = own;
          else if (P && pA == null) hour = null;
          else if (P) { const c = up(pA + dur(P)); hour = (xA != null && c > xA) || c >= 24 ? pA : c; }
          else if (X && xA != null) { const c = down(xA - dur(t)); hour = c >= 0 ? c : xA; }
        }
        if (hour == null && own != null) Object.assign(patch, { scheduledStart: null, scheduledEnd: null, isFixed: false });
        else if (hour != null && hour !== own) Object.assign(patch, N.placeAt(t, day, hour));
      }
      const nt = Object.keys(patch).length ? Object.assign({}, t, patch) : t;
      const place = (l) => {
        const o = l.filter((x) => String(x.id) !== String(t.id));
        const pi = prev ? o.findIndex((x) => x.id === prev.id) : -1, ni = next ? o.findIndex((x) => x.id === next.id) : -1;
        const at0 = l.findIndex((x) => String(x.id) === String(t.id));
        o.splice(pi > -1 ? pi + 1 : ni > -1 ? ni : Math.min(at0, o.length), 0, nt);
        return o;
      };
      setTasks(place);
      const now = N.at(nt);
      if (now != null && now !== N.at(t)) {
        const at0 = list0.indexOf(t);
        window.toast("Now at " + N.hhmm(now), { undo: () => setTasks((l) => { const o = l.filter((x) => String(x.id) !== String(t.id)); o.splice(Math.min(at0, o.length), 0, t); return o; }) });
      }
      return;
    }
    /* A task dropped on the calendar's day / week grid (calendar2.jsx) takes
       that day and the snapped time (15 min); the grid's block for it is
       where the lifted card lands. */
    if (over.kind === "timeline") {
      const t = tasks.find((x) => String(x.id) === String(item.id));
      const day = over.date ? window.NEEDT.dayIso(parseInt(over.date, 10)) : null;
      if (!t || !day || over.time == null) return;
      const hour = Math.max(0, Math.min(23.75, over.time));
      if (t.dueDate === day && window.NEEDT.at(t) === hour && !t.overdue) return;
      const before = { dueDate: t.dueDate || null, scheduledStart: t.scheduledStart || null, scheduledEnd: t.scheduledEnd || null, isFixed: !!t.isFixed, overdue: !!t.overdue, noSlot: !!t.noSlot };
      setTasks((list) => list.map((x) => (x.id === t.id ? Object.assign({}, x, window.NEEDT.placeAt(x, day, hour), { overdue: false, noSlot: false }) : x)));
      window.toast("Placed at " + window.NEEDT.hhmm(hour) + " · " + window.NEEDT.dayLabel(day), { undo: () => setTasks((list) => list.map((x) => (x.id === t.id ? Object.assign({}, x, before) : x))) });
    }
  });

  /* A session ticks a minute every second and a half, so the ring and the
     stopped wordmark are visible without waiting out a real fifty minutes. */
  React.useEffect(() => {
    if (!focus) return undefined;
    const id = window.setInterval(() => {
      setFocus((f) => (f && f.elapsed < f.planned * 60 ? Object.assign({}, f, { elapsed: f.elapsed + 1 }) : f));
    }, 200);
    return () => window.clearInterval(id);
  }, [!!focus]);

  const rootOwn = React.useRef({ cls: [], vars: [] });
  /* Layout effect, so a theme flip committed inside a view transition lands on
     the root in the same frame as the shell. */
  React.useLayoutEffect(() => {
    /* Only the classes and vars App owns are swapped: others on <html>
       (Drag.jsx's is-drag-active mid-drag) stay. */
    const root = document.documentElement;
    const own = rootOwn.current;
    const cls = ("theme-surface theme-drifts " + themeCls).trim().split(/\s+/);
    own.cls.forEach((c) => { if (cls.indexOf(c) < 0) root.classList.remove(c); });
    cls.forEach((c) => root.classList.add(c));
    const vars = day.vars || {};
    own.vars.forEach((k) => { if (!(k in vars)) root.style.removeProperty(k); });
    Object.keys(vars).forEach((k) => root.style.setProperty(k, vars[k]));
    rootOwn.current = { cls, vars: Object.keys(vars) };
    root.setAttribute("data-accent", accent);
    root.setAttribute("data-theme-choice", theme);
  }, [themeCls, day.vars, accent, theme]);

  React.useEffect(() => {
    window.__app = { tasksNow: tasks, updateTask: (id, p) => { if (window.stNoteTask) window.stNoteTask(id, "done" in (p || {}) && Object.keys(p).length === 1 ? (p.done ? "Checked off" : "Reopened") : "Edited"); setTasks((l) => l.map((t) => String(t.id) === String(id) ? patchTask(t, p) : t)); },
      setTasksRaw: setTasks, sbMode, setSbMode, docPanel, setDocPanel, chatOpen, setChatOpen, toggleSidebar, sbNarrow: narrow, sbFloat, setFocusMode, focusMode, setCustomize, openComposer, setKeysOpen, setHelpOpen, setBugOpen, setScreen: goScreen, setScreenNow: setScreen, setTheme: pickTheme, theme, accent, setAccent, setTaskOpen, openTask: (id) => openTask(id), setSettingsOpen, setPaletteOpen, setFocus, setCalView, setStage, setAura, day };
  });

  React.useEffect(() => {
    let lead = "";
    let leadAt = 0;
    function key(e) {
      const t = e.target;
      const typing = t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));

      if (e.key === "Escape") {
        if (bugOpen) setBugOpen(false);
        else if (helpOpen) setHelpOpen(false);
        else if (keysOpen) setKeysOpen(false);
        else if (paletteOpen) setPaletteOpen(false);
        else if (composer) setComposer(null);
        else if (taskOpen) setTaskOpen(false);
        return;
      }

      /* Sequences are for people whose hands are on the keys, so they stand
         down inside a field where the same letters are text. */
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const now = Date.now();
        if (lead === "g" && now - leadAt < 1000) {
          const to = GO["g" + e.key.toLowerCase()];
          lead = "";
          if (to) { e.preventDefault(); goScreen(to); return; }
        }
        if (e.key.toLowerCase() === "g") { lead = "g"; leadAt = now; return; }
        lead = "";
        if (e.key === "n" || e.key === "N") { e.preventDefault(); openComposer(); return; }
      }

      NEEDT_KEYS.forEach(([, rows]) => rows.forEach((r) => {
        if (!r.match || !r.match(e)) return;
        if (typing && !e.metaKey && !e.ctrlKey) return;
        e.preventDefault();
        if (r.keys[r.keys.length - 1] === "K") setPaletteOpen(true);
        else if (r.keys[r.keys.length - 1] === "N") openComposer();
        else if (r.keys[r.keys.length - 1] === "F") setFocus((f) => (f ? null : { intention: "Draft the launch brief", planned: parseInt(prefs.len, 10) || 50, elapsed: 0 }));
        else if (r.keys[r.keys.length - 1] === "P") goScreen("today");
        else if (r.keys[r.keys.length - 1] === "L") setTheme((v) => ({ system: "light", light: "dark", dark: "time", time: "system" })[v] || "light");
        else if (r.keys[0] === "?") setKeysOpen(true);
      }));
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [keysOpen, paletteOpen, composer, taskOpen, helpOpen, bugOpen]);

  function toggle(id) {
    if (window.stNoteTask) { const t = tasks.find((x) => x.id === id); window.stNoteTask(id, t && t.done ? "Reopened" : "Checked off"); }
    setTasks((list) => list.map((t) => (t.id === id ? patchTask(t, { done: !t.done }) : t)));
  }
  function capture(title) {
    setTasks((list) => list.concat([{ id: Date.now(), title: title, projectId: null, status: "todo", estimatedMinutes: 45, done: false }]));
  }

  /* The Composer's sentence becomes the thing it names: an event goes to the
     calendar's store, a doc to the docs store, a habit to the habits store,
     and a task keeps every attribute the line parsed. */
  function composerCreate(p) {
    const N = window.NEEDT, f = p.found || {};
    const day = N.toDate(f.date ? f.date.value : "Today") || N.iso(N.today);
    const hour = f.time ? coHourOf(f.time.value) : null;
    const minutes = f.duration ? parseInt(f.duration.value, 10) * (/h/.test(f.duration.value) ? 60 : 1) : null;
    const projectId = f.project ? N.projectIdOf(f.project.value) : (prefs.project && prefs.project !== "none" ? prefs.project : null);
    const undoToast = (msg, undo) => window.toast && window.toast(msg, { undo: undo });
    /* What the line did not claim is the name; the claimed words became fields. */
    const title = p.rest || p.title;
    if (p.type === "event" && window.calEvents) {
      const ev = window.calEvents.add(N.eventAt(day, hour != null ? hour : 9, minutes || 60, { title: title }));
      undoToast("Added to Calendar", () => window.calEvents.remove(ev.id));
      return;
    }
    if (p.type === "doc" && window.docs) {
      const d = window.docs.create({ title: title, projectId: projectId, hue: f.project && window.projectHue ? window.projectHue(f.project.value) : null,
        body: p.note ? [{ id: "b1", kind: "p", text: p.note }] : [] });
      undoToast("Doc created", () => window.docs.remove(d.id));
      return;
    }
    if (p.type === "habit" && window.habitApi) {
      const h = window.habitApi.add({ title: title, projectId: projectId,
        schedule: { time: hour != null ? N.hhmm(hour) : null, perWeek: f.repeat && /week/.test(f.repeat.value) ? 1 : null } });
      undoToast("Habit added", () => window.habitApi.remove(h.id));
      return;
    }
    const est = minutes || (window.needtSettings && window.needtSettings.has("est") ? parseInt(prefs.est, 10) : 30);
    const task = {
      id: Date.now() + Math.random(), title: title, projectId: projectId, status: "todo", estimatedMinutes: est,
      dueDate: f.deadline ? (N.toDate(f.deadline.value) || day) : day, done: false,
      TaskPart: p.parts.length ? p.parts.map((t, j) => ({ id: "n" + Date.now().toString(36) + "." + (j + 1), title: t, done: false })) : undefined
    };
    if (hour != null) Object.assign(task, { scheduledStart: N.stamp(day, hour), isFixed: true });
    if (f.priority) task.priority = f.priority.value.toLowerCase();
    if (f.label) task.labels = [f.label.value];
    if (p.note) task.notes = p.note;
    setTasks((list) => list.concat([task]));
  }

  const view = screen === "settings" ? under : screen;
  /* Prototype states (states.jsx): what the switcher has turned on for the
     place in front of you. Settings is a sheet, so it reports itself. */
  const st = window.useStStates(view);
  React.useEffect(() => { window.needtStates.setScreen(screen === "settings" ? "settings" : view); }, [screen, view]);
  React.useEffect(() => { if (view === "doc") setSbMode("doc"); }, [view]);
  const settingsSheet = screen === "settings"
    ? <SettingsScreen theme={theme} onTheme={pickTheme} accent={accent} onAccent={setAccent} day={day}
        onBack={() => goScreen(under)} aura={aura} onAura={setAura}
        onSignOut={() => { setStage("auth"); setAuthMode("login"); setScreen("today"); }} />
    : null;
  const body = view === "today"
    ? <TodayScreen tasks={tasks} onOpen={openTask} onToggle={toggle} form={briefForm} onForm={setBriefForm} brief={brief} dragProps={dragProps} drag={drag} />
    : (view === "tasks" || view === "projects") ? (window.WorkScreen ? <window.WorkScreen key={view} mode={view} tasks={tasks} onToggle={toggle} onOpen={openTask} dragProps={dragProps} /> : null)
    : view === "moodboards" && window.MoodboardsScreen ? <window.MoodboardsScreen />
    : view === "calendar" ? (window.CalendarCraft ? <window.CalendarCraft tasks={tasks} onOpen={openTask} dragProps={dragProps} /> : null)
    : view === "doc" ? <DocumentScreen onBack={() => setScreen("docs")} />
    : view === "mail" && window.MailScreen ? <window.MailScreen />
    : view === "habits" && window.HabitsScreen ? <window.HabitsScreen />
    : view === "templates" && window.TemplatesScreen ? <window.TemplatesScreen />
    : view === "trash" && window.TrashScreen ? <window.TrashScreen />
    : view === "shared" && window.SharedScreen ? <window.SharedScreen />
    : view === "connections" && window.ConnectionsScreen ? <window.ConnectionsScreen />
    : <DocsScreen onOpenDoc={() => setScreen("doc")} />;

  const docRail = view === "doc" && window.DocPanel && sbMode === "doc";
  const railContent = (
    <div key={docRail ? "doc" : "app"} className="sb-swap shell-app-swap">
      {docRail ? <window.DocPanel onBack={() => goScreen("docs")} /> : <Sidebar onTask={openComposer} screen={view} onScreen={goScreen} theme={theme} onTheme={pickTheme}
        tasks={tasks} onCapture={capture} onOpenPalette={() => setPaletteOpen(true)} onSettings={() => goScreen("settings")}
        dragProps={dragProps} drag={drag} selectedDate={selectedDate} onSelectDate={setSelectedDate}
        focus={focus} onStartFocus={(f) => setFocus(Object.assign({ elapsed: 0 }, f))} onStopFocus={() => setFocus(null)} />}
    </div>
  );
  return (
    <div className={"app theme-surface theme-drifts " + themeCls}
      style={Object.assign({ display: "flex", flexDirection: "column", height: "100%" }, day.vars)}>
      {/* Craft's top bar, across the whole window: the sidebar toggle, search
          in the middle, notifications and help. Everything else lives in the
          page's own header below it. */}
      {focusMode ? null : <TabBar screen={view} onScreen={goScreen} onTask={openComposer} onDoc={() => goScreen("doc")}
        left={window.SidebarToggle ? <window.SidebarToggle /> : null}
        farRight={view === "doc" && window.DocPanelToggle ? <window.DocPanelToggle /> : null}
        right={view === "doc" && window.DocTopRight ? <window.DocTopRight /> : null} />}
      <div className="shell-app-row">
      {/* Narrow: a click anywhere off the floating sidebar puts it away. */}
      {narrow && sbFloat && !focusMode ? <div className="sb-float-scrim" aria-hidden="true" onMouseDown={() => setSbFloat(false)} /> : null}
      {/* Inline, not only in app.css, so a cached stylesheet can never leave
          the sidebar standing while the toggle thinks it is hidden. */}
      {narrow ? (
      <div className={"shell-app-layer " + "sb-shell sb-float" + (sbFloat && !focusMode ? " is-open" : "")} aria-hidden={!(sbFloat && !focusMode)}
        style={{ boxShadow: sbFloat && !focusMode ? "var(--shadow-floating)" : "none", transform: sbFloat && !focusMode ? "none" : "translateX(calc(-100% - 24px))", pointerEvents: sbFloat && !focusMode ? "auto" : "none", visibility: sbFloat && !focusMode ? "visible" : "hidden", transition: sbFloat && !focusMode
            ? "transform 260ms cubic-bezier(0.2, 0.9, 0.24, 1), box-shadow 260ms ease, visibility 0s"
            : "transform 260ms cubic-bezier(0.2, 0.9, 0.24, 1), box-shadow 260ms ease, visibility 0s linear 260ms" }}>
      {railContent}
      </div>
      ) : (
      /* Hide/show like the chat dock: the column's width runs 300 → 0 and the
         main row reflows with it, while the rail itself (fixed width inside)
         fades and slides 12px left. */
      <div className={"shell-app-row-2 " + "sb-shell" + (sbHidden || focusMode ? " is-hidden" : "")} aria-hidden={sbHidden || focusMode || undefined}
        style={{ width: sbHidden || focusMode ? 0 : "var(--sidebar-w)" }}>
        <div className="sb-rail shell-app-rail" style={{ opacity: sbHidden || focusMode ? 0 : 1, transform: sbHidden || focusMode ? "translateX(-12px)" : "none", pointerEvents: sbHidden || focusMode ? "none" : "auto", transition: sbHidden || focusMode ? "opacity 180ms ease, transform 260ms cubic-bezier(.2,.8,.2,1)" : "opacity 220ms ease 40ms, transform 260ms cubic-bezier(.2,.8,.2,1)" }}>
          {railContent}
        </div>
      </div>
      )}
      {window.CtxLayer ? <window.CtxLayer /> : null}
      {window.ToastLayer ? <window.ToastLayer /> : null}
      {window.CustomizeSidebar ? <window.CustomizeSidebar open={customize} onClose={() => setCustomize(false)} /> : null}
      {focusMode ? (
        <button type="button" className="focus-exit nx-press shell-app-focus-exit" onClick={() => setFocusMode(false)}
         >
          Exit Focus Mode<span className="base-meta-muted">esc</span>
        </button>
      ) : null}
      {focus && aura ? <div className="focus-aura" aria-hidden="true" /> : null}
      {/* The app's own hand, over everything and clickable through. */}
      {window.AgentCursor ? <window.AgentCursor /> : null}
      {settingsSheet}
      <main className="shell-app-stack" style={{ padding: focusMode ? "20px 20px 20px" : "0 20px 20px" }}>
        {/* Home (form "today") carries Plan my day in its own Tasks-style header. */}
        {view === "today" && !focusMode && briefForm !== "today" ? (
          <span className="base-row shell-app-row-3">
            <TodayControls canPlan={tasks.some((t) => !t.done && !t.isFixed)} />
          </span>
        ) : null}
        {focusMode ? null : <window.StBannerStack screen={view} st={st} />}
        <div key={view} className="screen-enter shell-app-screen-enter">
          {body}
          <window.StScreenLayer screen={view} st={st} />
        </div>
        <TaskDialog open={!!taskOpen} task={taskOpen === true ? undefined : tasks.find((t) => String(t.id) === String(taskOpen))}
          onChange={(patch) => setTasks((l) => l.map((t) => String(t.id) === String(taskOpen) ? patchTask(t, patch) : t))}
          onClose={() => setTaskOpen(false)} />
        <KeySheet open={keysOpen} onClose={() => setKeysOpen(false)} />
        {window.HelpSheet ? <window.HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} /> : null}
        {window.BugSheet ? <window.BugSheet open={bugOpen} onClose={() => setBugOpen(false)} /> : null}
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onScreen={setScreen} tasks={tasks} />
        {stage === "app" && window.Notifications && __params.chrome !== "off" ? <window.Notifications hidden={!!composer || paletteOpen || !!(focus && prefs.hideAlerts)} /> : null}
        {stage === "app" && !focusMode ? <window.StSwitcher screen={screen === "settings" ? "settings" : view} /> : null}
        <window.StLocks screen={view} />
        {screen === "settings" ? <window.StSettingsLayer /> : null}
        {stage === "app" && __params.chrome !== "off" ? <Chat hidden={!!composer} open={chatOpen} onOpenChange={setChatOpen} dock={chatDock} narrow={narrow} /> : null}
        {window.Composer ? <window.Composer open={!!composer} from={composer} onClose={() => setComposer(null)}
          onCreate={composerCreate} /> : null}
      </main>
      <div ref={setChatDock} data-chat-dock
        style={narrow ? { flex: "none", width: 0 }
          : { flex: "none", display: "flex", justifyContent: "flex-end", overflow: "hidden", backgroundColor: "var(--background)",
            width: chatOpen && stage === "app" ? 360 : 0, transition: "width 220ms cubic-bezier(0.2, 0.9, 0.24, 1)" }} />
      </div>
      <DragGhost drag={drag} returning={returning} />
      {stage === "auth" ? <AuthScreen mode={authMode} onMode={setAuthMode}
        onDone={() => setStage(authMode === "login" ? "app" : "onboarding")} /> : null}
      {stage === "onboarding" ? <OnboardingScreen theme={theme} onTheme={pickTheme} onDone={(r) => {
          /* 08.10.26: setup ends on Home (Day) with the first task already
             placed (AuthScreen.jsx needtFirstTask); Calendar's view is chosen
             for the person (Week) unless Settings already holds one. */
          if (r && r.task) setTasks((list) => list.concat([r.task]));
          const v = window.needtSettings ? window.needtSettings.get("view") : "week";
          setCalView(v === "days" ? "days" : "week");
          setScreen("today"); setBriefForm("today");
          setStage("app");
        }} /> : null}
    </div>
  );
}

/* The design-system compiler bundles this file and evaluates it once at
   bundle-load time, when #root does not exist yet. Mount only when it does. */
const __root = document.getElementById("root");
if (__root) ReactDOM.createRoot(__root).render(<App />);
