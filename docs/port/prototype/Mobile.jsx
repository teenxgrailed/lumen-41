/* NEEDT ON A PHONE — the phone's data, rules and the pieces its Plates
 * screens still draw with (08.10.26).
 *
 * The live phone is ONE phone: mobile-v2-plates.jsx (V2pLivePhone: Home,
 * Calendar, the shell) and phone-*.jsx (every other place, registered in
 * window.PkPlaces), on the kit in phone-kit.jsx, under menu A (nav-a.jsx).
 * This file keeps what they read:
 *   - formatters and day keys (mbDur, mbTime, mbAt, mbDue, mbDueDay, mbHue …),
 *     MB_TODAY / MB_WEEKDAY / caps;
 *   - stores: mbTaskStore ("needt.tasks"), mbPrefStore ("needt.settings"),
 *     habits (stores.jsx habitStore through mbUseHabits / mbHabitApi), docs
 *     (stores.jsx docStore through mbDocStore / mbUseDocs / mbDocPatch),
 *     connections (mbUseConn / mbReconnect, "needt.connections"), the edge
 *     switch (mbEdgeStore, window.__edgeData);
 *   - Calendar data (mbCalData, mbSwipe, mbCalFmt);
 *   - the doc reader's page (MbDoc, MbDocBlock, MbDocSep, MbDocCover,
 *     MbDocThumb, mbDcVars / mbDcBdVars) — the mb-doc-* CSS in mobile.css;
 *   - Moodboards' data and rules (useMbmBoards, mbmRole, mbmParseUrl,
 *     MBM_SWATCHES, mbmPins …) and the media they draw (MbmMedia, MbmCover,
 *     MbmAvatar, MbmFaces, MbmPinMark); the place itself is Plates, in
 *     phone-habits.jsx (PhbBoards) — the old Moodboards chrome is gone;
 *   - (the hold → actions layer every place uses moved to phone-kit.jsx:
 *     PkHold, PkActions, PkHueTile, pkOwnGesture — wave 3, 09.10.26);
 *   - Ask's canned answers (MB_ASK), the states layer (mbUseStates,
 *     MbStGlyph) and data lists (MB_CONN, MB_TEMPLATES, MB_SHARED).
 * The old phone (tab bar, More, top chrome, MbHome … MbTrash, MbTask,
 * MbComposer, MbAsk, MbSettings, MobileApp) is _archive/Mobile.legacy.jsx;
 * the old Moodboards views (MbmRoot, MbSheet, MbmActions, the share
 * walkthrough …) are in _archive/Mobile.pre-wave3.jsx (+ mobile.pre-wave3.css).
 *
 * TOUCH: every control is at least 44px. A phone has no hover, so what the
 * desktop reveals on hover is something you tap here.
 */
const MbNS = window.NeedtDesignSystem_25d3c8;
const { Icon: MbIcon } = MbNS;

const MB_TODAY = 1;
const MB_WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function mbDur(min) {
  if (!min) return "";
  return min < 60 ? min + " min" : Math.floor(min / 60) + " h" + (min % 60 ? " " + (min % 60) : "");
}
const mbTime = (at) => (at == null ? "" : String(Math.floor(at)).padStart(2, "0") + ":" + (at % 1 ? "30" : "00"));
/* Tasks arrive in the database's names (Data.js); these read them back in
   the shapes the phone draws with. */
const mbAt = (t) => window.NEEDT.at(t);
const mbDue = (t) => window.NEEDT.dueLabel(t);
const mbPName = (t) => window.NEEDT.projectName(t);
const mbDueDay = (t) => window.NEEDT.dueDay(t);
const mbHue = (name) => { const x = name && window.cvProject ? window.cvProject(name) : null; return (x && x.color) || "var(--text-muted)"; };
const mbDayKey = (t) => {
  const mons = (window.NEEDT && window.NEEDT.MONTHS) || [];
  const m = String(mbDue(t) || "").trim().split(/\s+/);
  const mi = mons.indexOf(m[1]);
  const d = parseInt(m[0], 10);
  return (mi < 0 ? 0 : mi) * 40 + (isNaN(d) ? 0 : d);
};
const mbAtKey = (t) => (mbAt(t) == null ? 99 : mbAt(t));
function mbDayName(d) {
  const x = new Date(window.NEEDT.today);
  x.setDate(d);
  return MB_WEEKDAY[x.getDay()];
}

/* ── THE PHONE'S DATA (07.10.26) — the desktop's stores and storage keys, so
   an edit on one screen size shows on the other, and every phone on the sheet
   reads the same list:
     tasks     "needt.tasks"          (App.jsx's key; trashedAt, never removed)
     projects  "needt.projects.all"   (work.jsx's key)
     docs      window.docStore        ("needt.docs", stores.jsx)
     habits    window.habitApi        (stores.jsx: "needt.habits" + "needt.habitCheckins")
     mail      window.mailApi         (stores.jsx: "needt.mail.threads")
     boards    window.boardsView      (stores.jsx: "needt.boards", "needt.boardItems", "needt.boardMembers")
     events    window.calEvents       (calendar2.jsx: "needt.events", Event rows)
     plan      window.needtPlan       (paywall.jsx)
     prefs     window.needtSettings   (stores.jsx: "needt.settings"; mbPrefStore is a view of it)
   All of it persists through window.needtSync (sync.js), so a change made in
   another open window (the desktop) arrives live and the stores re-render.
   window.__edgeData(kind) swaps them for the edge-case sets (as work.jsx). ── */
const mbMake = (v) => (window.makeStore ? window.makeStore(v) : (function () {
  let s = v; const subs = new Set();
  return { get: () => s, set: (n) => { s = typeof n === "function" ? n(s) : n; subs.forEach((f) => f(s)); }, sub: (f) => { subs.add(f); return () => subs.delete(f); } };
})());
const mbUse = (store) => {
  const [s, setS] = React.useState(store.get());
  React.useEffect(() => { setS(store.get()); return store.sub(setS); }, [store]);
  return s;
};
const mbLs = {
  get(k, fb) { if (window.needtSync) return window.needtSync.get(k, fb); try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } },
  set(k, v) { if (window.needtSync) { window.needtSync.set(k, v); return; } try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
/* A store persisted through needtSync (live from other windows), or plainly. */
const mbBind = (store, key, opts) => (window.needtSync ? window.needtSync.bind(store, key, opts) : store.sub((v) => mbLs.set(key, v)));
const mbSeedTasks = () => JSON.parse(JSON.stringify(window.NEEDT.tasks || []));
function mbTasksLoad() {
  const s = mbLs.get("needt.tasks", null);
  return Array.isArray(s) ? s.map(window.NEEDT.migrateTask) : mbSeedTasks();
}
const mbTaskStore = mbMake(mbTasksLoad());
mbBind(mbTaskStore, "needt.tasks", { load: (l) => (Array.isArray(l) ? l.map(window.NEEDT.migrateTask) : []) });
const mbLive = (t) => !t.trashedAt;

/* Habits: stores.jsx's tables (Habit + HabitCheckin, "needt.habits" /
   "needt.habitCheckins"), the same ones the desktop reads. The strip and the
   count are computed from checkins (NEEDT.habitDays / habitDoneOn). */
const mbHabitStore = window.habitStore;
function mbHabitApi() { return window.habitApi; }
const mbUseHabits = () => { mbUse(window.habitCheckinStore); return window.NEEDT.liveHabits(mbUse(mbHabitStore) || []); };
const mbHabitHue = (h) => window.NEEDT.habitColor(h) || "var(--text-tertiary)";

/* Settings the desktop's Settings screen owns, by its own field names.
   mbPrefStore is a VIEW of stores.jsx's settings store (one object, one
   writer, "needt.settings" through needtSync): get() = the stored object
   over these defaults; set() writes only the fields that changed, so a
   default never lands in storage as if the person had chosen it. */
const MB_PREFS_DEFAULT = { start: "09:00", end: "18:00", chunk: "30", buffer: "10", view: "week" };
const mbPrefStore = (() => {
  const S = window.needtSettings;
  if (!S) { const st = mbMake(Object.assign({}, MB_PREFS_DEFAULT, mbLs.get("needt.settings", {}))); mbBind(st, "needt.settings"); return st; }
  const get = () => Object.assign({}, MB_PREFS_DEFAULT, S.store.get());
  return {
    get: get,
    set: (next) => {
      const cur = get(), n = typeof next === "function" ? next(cur) : next, p = {};
      Object.keys(n || {}).forEach((k) => { if (!mbSameish(n[k], cur[k])) p[k] = n[k]; });
      if (Object.keys(p).length) S.patch(p);
    },
    sub: (f) => S.store.sub(() => f(get()))
  };
})();
function mbSameish(a, b) { return a === b || (a && b && typeof a === "object" && JSON.stringify(a) === JSON.stringify(b)); }
const mbSetPref = (k, v) => {
  const S = window.needtSettings;
  if (S) S.set(k, v); else mbPrefStore.set((p) => Object.assign({}, p, { [k]: v }));
};

/* A tick on any edge-data swap, so screens that read storage re-render. */
const mbEdgeStore = mbMake(0);

const mbCx = (...a) => a.filter(Boolean).join(" ");
/* Long lists (the desktop's rule, _tablet-report): Home shows 25 rows of a
   section and Tasks 50, then "Show all N" — a phone with 500 tasks stays fast. */
const MB_CAP_HOME = 25, MB_CAP_TASKS = 50;
function mbCalData(tasks, mine, titles) {
  /* Events are Event rows (startAt / endAt); NEEDT.eventBlock draws them. */
  const evBlocks = C2_EVENTS.map((e) => Object.assign({ event: true }, window.NEEDT.eventBlock(e), titles[e.id] ? { title: titles[e.id] } : null))
    .concat(mine.map((e) => Object.assign({ event: true, user: c2Own(e), source: e.source || "needt" }, window.NEEDT.eventBlock(e))));
  const blocks = tasks.filter((t) => t.scheduledStart && c2Day(t) != null && !t.noSlot && !t.overdue)
    .map((t) => ({ id: t.id, day: c2Day(t), at: window.NEEDT.at(t), len: t.estimatedMinutes || 30, title: t.title, project: window.NEEDT.projectName(t), done: t.done }))
    .concat(evBlocks.filter((b) => b.at != null));
  const loose = tasks.filter((t) => c2Day(t) != null && !t.overdue && (!t.scheduledStart || t.noSlot))
    .map((t) => ({ id: t.id, day: c2Day(t), at: null, len: t.estimatedMinutes || 0, title: t.title, project: window.NEEDT.projectName(t), done: t.done }))
    .concat(evBlocks.filter((b) => b.at == null));
  return { blocks: blocks, loose: loose };
}
const mbCalFmt = (x) => x[0] + " " + x[2];
function mbSwipe(onStep) {
  const s = React.useRef(null);
  return {
    onTouchStart: (e) => { const t = e.touches[0]; s.current = { x: t.clientX, y: t.clientY }; },
    onTouchEnd: (e) => {
      const a = s.current; s.current = null; if (!a) return;
      const t = e.changedTouches[0], dx = t.clientX - a.x, dy = t.clientY - a.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) onStep(dx < 0 ? 1 : -1);
    }
  };
}
/* ── Docs ─────────────────────────────────────────────────────────────── */
/* The desktop's seed (DocsScreen.jsx DOCS) — the phone seeds the shared doc
   store with it when nothing is stored yet, so both screens start equal. */
const MB_DOCS = [
  { id: "launch", title: "Launch brief — September", projectId: "ops", style: { ground: "sand" }, updated: "20 min ago", viewed: "Just now", created: "2 Sep",
    body: [["lead", "The scheduler places work into real free hours, so the calendar is the plan rather than a record of it."], ["h", "Scope"], ["li", "Tasks and events share one grid."], ["li", "The rail on a block means movability, and nothing else."], ["shot"], ["h", "Open questions"], ["todo", "Decide the Mail tab badge", true], ["todo", "Friday review owns the rest"]] },
  { id: "rules", title: "Needt design rules", projectId: "ds", style: { ground: "mist", theme: "sage" }, updated: "Yesterday", viewed: "Yesterday", created: "11 Sep",
    body: [["callout", "Four rules hold every screen together. Break one only on purpose and write down why."], ["rule"], ["h", "Get to know the rules"], ["cards", ["Greys", "Type", "Accent", "Rows"]]] },
  { id: "placement", title: "Scheduler — placement notes", projectId: "ds", style: { theme: "rose" }, updated: "3 days ago", viewed: "3 days ago", created: "20 Aug",
    body: [["p", "Every auto-placed block has a reason and no planner shows one, which is why people redo the scheduler's work by hand."], ["quote", "Show the reason on hover, never as a badge."], ["p", "Next step: a reason line under the block title, 12px, quaternary."]] },
  { id: "review", title: "Weekly review, week 35", projectId: null, style: { ground: "sage" }, updated: "5 days ago", viewed: "5 days ago", created: "29 Aug",
    body: [["h", "Went well"], ["todo", "Shipped the shell", true], ["todo", "Four sales on Vinted", true], ["h", "Next"], ["todo", "Mailbox as a place, not a link"], ["todo", "Book the B1 exam date"]] },
  { id: "german", title: "German B2 — verbs to drill", projectId: "german", style: { ground: "stone", theme: "ocean" }, updated: "1 week ago", viewed: "4 days ago", created: "1 Aug",
    body: [["table", [["sich verlassen", "auf + Akk"], ["sich beschweren", "über + Akk"], ["abhängen", "von + Dat"], ["teilnehmen", "an + Dat"]]], ["p", "Drill two a day, out loud, in a full sentence."]] },
  { id: "untitled", title: "", projectId: null, style: null, updated: "1 hour ago", viewed: "27 min ago", created: "Today", body: [] }
];
/* window.DOCS only counts when DocsScreen.jsx put it there — the design
   system bundle has a sample list under the same name. */
const mbDesk = () => typeof window.dcSetStyle === "function";
const mbDocSeed = () => ((mbDesk() && window.DOCS) || MB_DOCS).map((d) => Object.assign({ isFavorite: d.id === "launch" || d.id === "rules", trashedAt: null, projectId: d.projectId || null, coverUrl: null }, JSON.parse(JSON.stringify(d))));
/* stores.jsx's docs store when the page has it (mobile.html does), else ours. */
const mbDocStore = window.docStore || mbMake([]);
(function mbDocsBoot() {
  if (window.docs && typeof window.docs.seed === "function") { window.docs.seed(mbDocSeed()); return; }
  const saved = mbLs.get("needt.docs", null);
  mbDocStore.set(Array.isArray(saved) ? saved.map(window.NEEDT.migrateDoc) : mbDocSeed());
  mbBind(mbDocStore, "needt.docs", { load: (l) => (Array.isArray(l) ? l.map(window.NEEDT.migrateDoc) : []) });
})();
const mbUseDocs = () => mbUse(mbDocStore) || [];
const mbDocPatch = (id, p) => mbDocStore.set((l) => l.map((d) => (String(d.id) === String(id) ? Object.assign({}, d, p) : d)));

/* ── A doc's style — the desktop's model, read through doc-style.jsx (the
   same file DocsScreen.jsx uses, loaded by both dev pages):
     Doc.style = { backdrop, page, text, separator, font, wide } (+ coverUrl)
   dcStyleOf turns an old preset id (`theme`) or `ground` into its full style,
   exactly as on the desktop, so the same doc draws the same page, ink, font,
   backdrop, cover and separator here, at phone size. `wide` has nothing to
   widen on a phone. A page that does not load doc-style.jsx shows every doc
   as the plain default page. ── */
const MB_DC_PLAIN = { backdrop: "none", page: "white", text: "auto", cover: null, separator: "line", font: "sans", wide: false };
const mbDcStyleOf = (doc) => (window.dcStyleOf ? window.dcStyleOf(doc) : MB_DC_PLAIN);
/* Page colour and ink (themes.css .dt-themed picks L or D) plus the font, as
   the desktop's sheet sets them. */
function mbDcVars(s) {
  if (!window.dcVars) return null;
  return Object.assign({}, window.dcVars(s), s.font !== "sans" ? { "--font-sans": window.dcFontOf(s.font).css } : null);
}
/* The backdrop pictures ([light, dark] as --dc-bd-l / --dc-bd-d). */
const mbDcBdVars = (id) => (window.dcBdVars ? window.dcBdVars(id) : null);
/* A cover: an uploaded picture or one of the drawn arts ("art:<id>"). */
const MbDocCover = ({ cover }) => (cover && window.DcCover ? <window.DcCover cover={cover} /> : null);
/* The list thumb: the backdrop (if any) with the page on it, its cover and
   its ink — the same picture as the desktop card, at 40 × 50. */
function MbDocThumb({ d }) {
  const s = mbDcStyleOf(d);
  const bd = s.backdrop !== "none";
  return (
    <span className={"mb-doc-thumb" + (bd ? " has-bd" : "")} aria-hidden="true" style={bd ? mbDcBdVars(s.backdrop) : null}>
      <span className="dt-themed mb-doc-thumb-page" style={mbDcVars(s)}>
        {s.cover ? <span className="mb-doc-thumb-cover"><MbDocCover cover={s.cover} /></span> : null}
        <span className="mb-doc-thumb-lines">
          <span className="mb-doc-thumb-head" />
          <span className="mb-doc-thumb-line" />
          <span className="mb-doc-thumb-line is-short" />
        </span>
      </span>
    </span>
  );
}
const mbDocMeta = (d) => [window.NEEDT.projectName(d), d.updated ? "Edited " + d.updated : null].filter(Boolean).join(" · ");
/* The separator under the title and for a divider block: line, dots or the
   hand-drawn wave — the desktop's DcSep (docs.css .docs-sep-*). */
function MbDocSep({ kind, block }) {
  const at = " mb-doc-sep is-" + (kind === "dots" || kind === "wave" ? kind : "line") + (block ? " is-block" : "");
  if (kind === "dots") return <div aria-hidden="true" className={"docs-sep-dots" + at}>{[0, 1, 2].map((i) => <span className="docs-dc-sep-1" key={i} />)}</div>;
  if (kind === "wave") return (
    <div aria-hidden="true" className={"docs-sep-wave" + at}>
      <svg width="120" height="12" viewBox="0 0 120 12" fill="none"><path d="M2 7.5c6-5 10-5 15-.6 5 4.4 9.6 4.2 15-.4 5.6-4.7 10-4.5 15.4.2 5.2 4.6 9.6 4.2 15-.4 5.5-4.6 10-4.3 15.2.3 5.2 4.6 9.5 4.1 15-.6 4.4-3.8 8-4 12.4-.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
    </div>);
  return <div aria-hidden="true" className={"docs-sep-line" + at} />;
}
/* A block as the desktop page draws it (DocsScreen.jsx DocPageBlock), read-only.
   Text is rich (doc-style.jsx spans): t is the block's words with their marks. */
function MbDocBlock({ b: raw, sep }) {
  const b = window.dxMigrateBlock ? window.dxMigrateBlock(raw) : raw;
  const k = b[0];
  const t = window.renderSpans && window.DX_TEXT_KINDS && window.DX_TEXT_KINDS[k] ? window.renderSpans(b[1]) : b[1];
  if (k === "lead") return <p className="mb-doc-p is-lead">{t}</p>;
  if (k === "h") return <h2 className="mb-doc-h">{t}</h2>;
  if (k === "li") return <p className="mb-doc-p is-row is-li"><span aria-hidden="true">•</span><span>{t}</span></p>;
  if (k === "todo") return (
    <p className="mb-doc-p is-row">
      <span aria-hidden="true" className={"mb-doc-check" + (b[2] ? " is-on" : "")}>{b[2] ? <MbIcon name="check" size={11} /> : null}</span>
      <span className={b[2] ? "mb-doc-todo is-done" : "mb-doc-todo"}>{t}</span>
    </p>);
  if (k === "task") return (
    <p className="mb-doc-p is-row is-center mb-doc-task">
      <span aria-hidden="true" className="mb-doc-task-ring" /><span className="mb-doc-task-title">{t}</span>{b[2] ? <span className="mb-doc-task-meta">{b[2]}</span> : null}
    </p>);
  if (k === "quote") return <p className="mb-doc-p is-quote">{t}</p>;
  if (k === "callout") return <p className="mb-doc-p is-row is-callout"><span aria-hidden="true" className="mb-doc-callout-icon"><MbIcon name="alert-circle" size={16} /></span><span>{t}</span></p>;
  if (k === "code") return <pre className="mb-doc-code">{t}</pre>;
  if (k === "rule") return <MbDocSep kind={sep} block />;
  if (k === "cards") return (
    <span className="mb-doc-cards">
      {(b[1] || []).map((c) => <span key={c} className="mb-doc-card-tile"><MbIcon name="file-text" size={18} /><span>{c}</span></span>)}
    </span>);
  if (k === "table") return (
    <span className="mb-doc-table">
      {(b[1] || []).map((r, i) => (
        <span key={i} className="mb-doc-table-row">
          {r.map((c, j) => <span key={j} className={"mb-doc-table-cell" + (j ? "" : " is-first")}>{c}</span>)}
        </span>
      ))}
    </span>);
  if (!b[1] || (window.spansToText && !window.spansToText(b[1]))) return null; /* shot, suggest and other pictures stay on the desktop */
  return <p className={b[2] && b[2].muted ? "mb-doc-p is-muted" : "mb-doc-p"}>{t}</p>;
}
function MbDoc({ id, doc }) {
  const all = mbUseDocs();
  const d = doc || all.filter((x) => String(x.id) === String(id))[0] || all.filter((x) => !x.trashedAt)[0] || MB_DOCS[0];
  const s = mbDcStyleOf(d);
  const bd = s.backdrop !== "none";
  React.useEffect(() => { if (s.font !== "sans" && window.dcLoadFonts) window.dcLoadFonts(); }, [s.font]);
  const st = d.style && typeof d.style === "object" ? d.style : {};
  return (
    <div className={"mb-push mb-doc" + (bd ? " has-bd" : "")} data-mb-screen="doc" data-mb-doc-theme={st.theme || ("backdrop" in st ? "custom" : "default")}
      data-dc-backdrop={s.backdrop} data-dc-page={s.page} data-dc-font={s.font} style={bd ? mbDcBdVars(s.backdrop) : null}>
      <article data-dc-font={s.font} className={"dt-themed mb-doc-card" + (bd ? " on-backdrop" : "") + (s.cover ? " has-cover" : "")} style={mbDcVars(s)}>
        {s.cover ? <div data-mb-cover="" className="mb-doc-cover"><MbDocCover cover={s.cover} /></div> : null}
        <span className="mb-doc-meta">{mbDocMeta(d)}</span>
        <h1 className={"mb-doc-title" + (d.title ? "" : " is-empty")}>{d.title || "Untitled"}</h1>
        <MbDocSep kind={s.separator} />
        {(d.body || []).length ? d.body.map((b, i) => <MbDocBlock key={i} b={b} sep={s.separator} />)
          : <p className="mb-doc-5">Start writing…</p>}
      </article>
    </div>
  );
}

/* ── Mail — a place, not a client. The same threads as the desktop
   (MailThread rows in stores.jsx, window.mailApi — "needt.mail.threads"),
   so reading a message or making it a task shows on both. Every one can
   become a task, which is the only reason Needt shows mail. ── */
/* Connections — the desktop's store shape and key ("needt.connections") and
   its change event, so a reconnect on one screen shows on every other. */
const MB_CONN_DEFAULT = { gmail: "connected", outlook: "disconnected", gcal: "connected", ical: "connected", notion: "connected", github: "connected" };
function mbConnRead() {
  if (window.connections && typeof window.connections.get === "function") return window.connections.get();
  const v = mbLs.get("needt.connections", {}) || {};
  const out = Object.assign({}, MB_CONN_DEFAULT, v);
  Object.keys(out).forEach((k) => { if (out[k] === "connecting") out[k] = "disconnected"; });
  return out;
}
let mbConnLive = null;
function mbConnSet(id, state) {
  if (window.connections && typeof window.connections.set === "function") { window.connections.set(id, state); return; }
  mbConnLive = Object.assign({}, mbConnLive || mbConnRead(), { [id]: state });
  mbLs.set("needt.connections", mbConnLive);
  window.dispatchEvent(new CustomEvent("needt-connections", { detail: { id: id, state: state, all: Object.assign({}, mbConnLive) } }));
}
function mbUseConn() {
  const read = () => (mbConnLive && !window.connections ? Object.assign({}, mbConnLive) : mbConnRead());
  const [v, setV] = React.useState(read);
  React.useEffect(() => {
    const on = () => setV(read());
    window.addEventListener("needt-connections", on);
    return () => window.removeEventListener("needt-connections", on);
  }, []);
  return v;
}
const mbConnTimers = {};
function mbReconnect(id, label, say) {
  mbConnSet(id, "connecting");
  window.clearTimeout(mbConnTimers[id]);
  mbConnTimers[id] = window.setTimeout(() => {
    mbConnSet(id, "connected");
    if (say) say(label + (id === "outlook" ? " reconnected — 2 new messages synced" : " connected"));
  }, 1200);
}

/* Templates and Shared: the desktop's lists (places.jsx TEMPLATES / SHARED,
   the same rows) — the built-in set after the user's own ("needt.templates",
   saved from a page on the desktop). Use makes a page from a template in the
   shared doc store (docs.fromTemplate) and opens it. */
const MB_TEMPLATES = [
  { id: "t-daily", title: "Daily note", style: { ground: "mist" }, label: "Template", meta: "5 blocks", body: [["lead", "What would make today a good day?"], ["h", "Plan"], ["todo", "First task"], ["todo", "Second task"], ["h", "Notes"], ["p", "Write as you go."]] },
  { id: "t-review", title: "Weekly review", style: { ground: "sage" }, label: "Template", meta: "6 blocks", body: [["h", "Went well"], ["li", "…"], ["h", "Didn't"], ["li", "…"], ["h", "Next week"], ["todo", "One thing that matters"]] },
  { id: "t-drop", title: "Product drop", style: { ground: "sand" }, label: "Template", meta: "8 blocks", body: [["callout", "Drop date, price, quantity — decide these first."], ["h", "Checklist"], ["todo", "Samples approved"], ["todo", "Photos shot"], ["todo", "Listing written"], ["shot"]] },
  { id: "t-meeting", title: "Meeting notes", style: null, label: "Template", meta: "4 blocks", body: [["p", "Who, when, why."], ["h", "Decisions"], ["li", "…"], ["h", "Actions"], ["todo", "Owner — task — date"]] },
  { id: "t-listing", title: "Resale listing", style: { ground: "stone" }, label: "Template", meta: "6 blocks", body: [["table", [["Brand", "—"], ["Size", "—"], ["Condition", "—"], ["Price", "CHF —"]]], ["p", "Measurements and flaws, in that order."]] },
  { id: "t-brief", title: "Project brief", style: { ground: "mist" }, label: "Template", meta: "7 blocks", body: [["lead", "One sentence: what changes when this ships."], ["h", "Scope"], ["li", "In"], ["li", "Out"], ["h", "Open questions"], ["todo", "…"]] }
];
const mbTemplates = () => { const mine = mbLs.get("needt.templates", []); return (Array.isArray(mine) ? mine : []).map((t) => Object.assign({ mine: true }, t)).concat(MB_TEMPLATES); };
const MB_SHARED = [
  { id: "s-lena", title: "Type scale — proposal", sharedBy: "Lena Fischer", role: "Can edit", style: { ground: "mist" }, updated: "2 h ago", body: [["h", "Chrome"], ["li", "13 / 12, nothing else"], ["h", "Documents"], ["li", "15 body, 17 headings"]] },
  { id: "s-tom", title: "Factory quote — round 2", sharedBy: "Tom Berger", role: "Can comment", style: { ground: "sand" }, updated: "Yesterday", body: [["table", [["Tank", "CHF 9.40"], ["Hoodie", "CHF 21.00"], ["MOQ", "150"]]], ["p", "Lead time 5 weeks from sample approval."]] },
  { id: "s-anna", title: "Launch checklist", sharedBy: "Anna Keller", role: "Can view", style: null, updated: "3 days ago", body: [["todo", "Domain renewed", true], ["todo", "Shop copy"], ["todo", "Photos"]] }
];
function mbAgo(ts) {
  const t = ts ? Date.parse(ts) : NaN;
  if (isNaN(t)) return ts || "today";
  const min = (Date.now() - t) / 60000;
  if (min < 60) return "just now";
  if (min < 24 * 60) return "today";
  const days = Math.round(min / 1440);
  return days === 1 ? "yesterday" : days + " days ago";
}
const mbLeft = (ts) => { const t = ts ? Date.parse(ts) : NaN; if (isNaN(t)) return null; const d = Math.max(0, 30 - Math.floor((Date.now() - t) / 86400000)); return d + (d === 1 ? " day left" : " days left"); };
const MB_ASK = [
  ["Plan my afternoon", "You have 13:30–17:00 mostly free. I'd place the tank graphic first (90 min), then the factory reply and the Ricardo listing — want me to put them in?"],
  ["What's overdue?", "Three things are past their date. The August invoices are the one blocking someone else — start there."],
  ["Draft a reply to Jonas", "“Hi Jonas, thanks for the update. Thursday works — could you send the samples before 12:00 so we can check them the same day? Best, Maksym”"]
];
/* ── The hold → actions layer (wave 3) is in phone-kit.jsx now: PkHold,
   PkActions, PkHueTile, pkOwnGesture (the old Mb* aliases are gone). ── */

/* ── Moodboards ───────────────────────────────────────────────────────────
 * Personal inspiration collections — not tasks, so nothing here has a date,
 * a duration or a checkbox. A board is a masonry wall of references (photos,
 * links, colours, notes) the owner can share with View or Edit. A Pinterest
 * board can be linked as a source: its pins are read live and never stored,
 * so an invitee sees a plaque where the owner sees the pins.
 *
 * State is the database's three tables — Board, BoardItem, BoardMember — in
 * stores.jsx (window.boardStore: "needt.boards", "needt.boardItems",
 * "needt.boardMembers"), the same ones the desktop writes. Screens here read
 * window.boardsView (or the desktop's window.mbStore, the same view): each
 * board joined with its items (by position) and members. Every phone on the
 * sheet reads the same store, so a change on one shows on all of them.
 * Item fields: url (the image, or the link's target), thumbnailUrl (a link's
 * preview picture), text (a note's words, or the caption on any other item),
 * color, colorName, title, ratio, source, createdAt (ISO). Board: createdAt,
 * linkShare, pinterestBoardId / pinterestStatus / pinterestSyncedAt. */
const MBM_ME = { name: "Maksym", email: "maksym@needt.app" };

/* mbmCss: its rules live in styles/mobile.css. */

/* ── data ── */
function mbmId(p) { return (p || "i") + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function mbmHash(s) { let h = 0; s = String(s || ""); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

/* Seeded "photographs" are drawn, not downloaded: the prototype runs offline. */
function mbmArt(a, b, kind, ratio) {
  const H = Math.round(100 * (ratio || 1));
  const shape = kind === "orb" ? '<circle cx="62" cy="' + Math.round(H * 0.42) + '" r="26" fill="url(#r)"/>'
    : kind === "arch" ? '<path d="M28 ' + H + ' V' + Math.round(H * 0.48) + ' a22 22 0 0 1 44 0 V' + H + ' Z" fill="' + b + '" opacity=".85"/>'
    : kind === "stripe" ? '<rect x="0" y="' + Math.round(H * 0.58) + '" width="100" height="' + Math.round(H * 0.12) + '" fill="' + b + '" opacity=".7"/><rect x="0" y="' + Math.round(H * 0.76) + '" width="100" height="3" fill="' + b + '" opacity=".5"/>'
    : kind === "figure" ? '<ellipse cx="50" cy="' + Math.round(H * 0.34) + '" rx="11" ry="13" fill="' + b + '"/><path d="M26 ' + H + ' C30 ' + Math.round(H * 0.55) + ' 70 ' + Math.round(H * 0.55) + ' 74 ' + H + ' Z" fill="' + b + '"/>'
    : '<rect x="18" y="' + Math.round(H * 0.18) + '" width="64" height="' + Math.round(H * 0.64) + '" rx="2" fill="' + b + '" opacity=".55"/>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 ' + H + '" preserveAspectRatio="xMidYMid slice">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '" stop-opacity=".55"/></linearGradient>' +
    '<radialGradient id="r"><stop offset="0" stop-color="' + window.cssVar("--color-white") + '" stop-opacity=".95"/><stop offset="1" stop-color="' + b + '"/></radialGradient></defs>' +
    '<rect width="100" height="' + H + '" fill="' + a + '"/><rect width="100" height="' + H + '" fill="url(#g)"/>' + shape + '</svg>';
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function mbmSeed() {
  const now = Date.now();
  const day = 86400000;
  const at = (ms) => new Date(ms).toISOString();
  const me = (id) => ({ boardId: id, email: MBM_ME.email, role: "owner", name: MBM_ME.name });
  const it = (f, ago) => Object.assign({ id: mbmId("i"), url: null, color: null, text: null, createdAt: at(now - ago) }, f);
  const img = (title, a, b, kind, ratio, src, ago) => it({ kind: "image", url: mbmArt(a, b, kind, ratio), title: title, ratio: ratio,
    source: src || { name: "Photos", domain: "" } }, (ago || 1) * day);
  const board = (id, title, ago, f, items, members) => Object.assign({ id: id, title: title, projectId: null, linkShare: false,
    pinterestBoardId: null, pinterestStatus: null, pinterestSyncedAt: null, createdAt: at(now - ago), trashedAt: null }, f,
    { members: members || [me(id)], items: items.map((x, i) => Object.assign(x, { boardId: id, position: i })) });
  const pin = (name, status, ago) => ({ pinterestBoardId: name, pinterestStatus: status, pinterestSyncedAt: at(now - ago) });
  return [
    board("mb-flash", "Flash after dark", 40 * day, pin("Flash after dark", "ok", 4 * 60000), [
      img("Stairwell, 2 a.m.", "#121214", "#e8e2d4", "figure", 1.32, { name: "Photos", domain: "" }, 1),
      it({ kind: "color", color: "#16161A", colorName: "Ink", ratio: 0.72 }, 2 * day),
      it({ kind: "link", url: "https://www.are.na/block/2231", title: "Direct flash — a reference library", ratio: 0.7,
        source: { name: "Are.na", domain: "are.na" }, text: "The ones where the shadow is a hard outline behind the head." }, 3 * day),
      img("Club exit", "#2a0f12", "#ff5a4f", "orb", 1.0, null, 4),
      it({ kind: "note", text: "Hard flash, close, slightly above. Skin goes chalky, background drops to black — that is the look, not a mistake.", ratio: 0.8 }, 5 * day),
      it({ kind: "color", color: "#D7263D", colorName: "Signal red", ratio: 1.1 }, 6 * day),
      img("Chrome bumper", "#1d2227", "#c9d3dc", "stripe", 0.78, { name: "Instagram", domain: "instagram.com" }, 7)
    ]),
    board("mb-fw27", "Demesures FW27", 20 * day, pin("Streetwear archive", "lost", 3 * day), [
      img("Washed black, raw hem", "#26262a", "#5b5b63", "arch", 1.25, { name: "Photos", domain: "" }, 1),
      it({ kind: "color", color: "#B9AE97", colorName: "Bone", ratio: 0.8 }, 1 * day),
      it({ kind: "color", color: "#3E4A3D", colorName: "Moss", ratio: 0.8 }, 1 * day),
      it({ kind: "link", url: "https://www.ssense.com/en-ch/men/product/our-legacy/black-box-shirt", title: "Our Legacy — Box shirt, washed", ratio: 1.2,
        thumbnailUrl: mbmArt("#1b1b1d", "#8a8a90", "frame", 1.2), source: { name: "SSENSE", domain: "ssense.com" } }, 2 * day),
      it({ kind: "note", text: "Drop shoulder, but not oversized. Graphic only on the back, 6 cm under the collar.", ratio: 0.6 }, 3 * day),
      img("Label close-up", "#d8d2c4", "#2b2b2b", "stripe", 0.9, null, 4)
    ], [me("mb-fw27"), { boardId: "mb-fw27", email: "anna@demesures.cc", role: "edit", name: "Anna" }, { boardId: "mb-fw27", email: "tom@studio-k.ch", role: "view", name: "Tom" }]),
    board("mb-oberwis", "Room, Oberwis", 12 * day, {}, [
      img("Low shelf, one lamp", "#cfc6b6", "#7c6a55", "frame", 1.15, null, 2),
      it({ kind: "color", color: "#E9E4DA", colorName: "Limewash", ratio: 0.75 }, 2 * day),
      it({ kind: "link", url: "https://www.vitra.com/en-ch/product/eames-plastic-side-chair", title: "Eames Plastic Side Chair", ratio: 0.9,
        source: { name: "Vitra", domain: "vitra.com" } }, 6 * day)
    ]),
    board("mb-type", "Type specimens", 9 * day, pin("Type specimens", "ok", 20 * 60000), [
      it({ kind: "note", text: "Grotesks with ink traps — they survive bad print, which is the point.", ratio: 0.6 }, 1 * day),
      img("Specimen sheet, 1962", "#efe9dc", "#151515", "stripe", 1.35, { name: "Photos", domain: "" }, 2),
      it({ kind: "color", color: "#F2EDE3", colorName: "Paper", ratio: 0.7 }, 2 * day),
      it({ kind: "link", url: "https://fontsinuse.com/uses/1", title: "Fonts In Use — Akzidenz on record sleeves", ratio: 0.8,
        source: { name: "Fonts In Use", domain: "fontsinuse.com" } }, 4 * day)
    ], [{ boardId: "mb-type", email: "lena@lena-rk.com", role: "owner", name: "Lena" }, { boardId: "mb-type", email: MBM_ME.email, role: "view", name: MBM_ME.name }])
  ];
}

/* The joined view of the board tables (stores.jsx), seeded with the phone's
   boards when nothing is stored yet. Old "needt.moodboards" lists (and the
   older tiles format) are migrated in Data.js. */
function mbmStoreOf() {
  const s = window.mbStore;
  if (s && typeof s.get === "function" && typeof s.set === "function" && typeof s.sub === "function") return s;
  window.boardsView.seed(mbmSeed);
  return window.boardsView;
}
/* [live boards, set(fn over every board, trashed ones included)]. */
function useMbmBoards() {
  const store = mbmStoreOf();
  const [st, setSt] = React.useState(() => store.get());
  React.useEffect(() => store.sub((s) => setSt(s)), [store]);
  const set = React.useCallback((fn) => store.set((prev) => (typeof fn === "function" ? fn(prev || []) : fn)), [store]);
  return [window.NEEDT.liveBoards(st || []), set];
}
function mbmPatch(list, id, fn) { return list.map((b) => (b.id === id ? Object.assign({}, b, fn(b)) : b)); }

function mbmRole(b) {
  const ms = (b && b.members) || [];
  if (!ms.length) return "owner";
  const mine = ms.filter((m) => m.email === MBM_ME.email || m.name === "You" || m.name === MBM_ME.name)[0];
  return mine ? mine.role : "owner";
}
function mbmOwner(b) { return ((b && b.members) || []).filter((m) => m.role === "owner")[0] || { name: MBM_ME.name, email: MBM_ME.email }; }
function mbmAgo(ts) {
  const s = Math.max(0, (Date.now() - (ts || 0)) / 1000);
  if (s < 50) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return Math.round(s / 86400) + " d ago";
}
function mbmDay(ts) { const d = new Date(ts || Date.now()); return d.getDate() + " " + window.NEEDT.MONTHS[d.getMonth()].slice(0, 3); }
function mbmInk(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return "var(--text-on-fill)";
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b2 = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b2) / 255 > 0.6 ? "var(--swatch-label-dark)" : "var(--swatch-label-light)";
}
function mbmHue(name) { const hues = ["var(--hue-orange)", "var(--hue-blue)", "var(--hue-green)", "var(--hue-violet)", "var(--hue-yellow)", "var(--hue-pink)"]; return hues[mbmHash(name) % hues.length]; }

/* Pins: the desktop's mock if it has published one, else six of our own,
   derived from the board's name so the same board always shows the same six. */
function mbmPins(name) {
  try { if (window.mbApi && typeof window.mbApi.pins === "function") { const p = window.mbApi.pins(name); if (Array.isArray(p) && p.length) return p; } } catch (e) {}
  const src = window.MB_PINS;
  const got = src ? (Array.isArray(src) ? src : src[name]) : null;
  if (Array.isArray(got) && got.length) return got.map((p, i) => Array.isArray(p) ? { color: p[0], ratio: p[1], title: p[2] } : Object.assign({ id: name + i }, p));
  const pal = [["#2b2d31", "Night street"], ["#c8b89a", "Sand wall"], ["#8f3a2e", "Rust door"], ["#e9e6df", "Paper light"], ["#3d4b5c", "Blue hour"], ["#a7a39a", "Concrete"]];
  const ratios = [1.4, 0.9, 1.2, 1.6, 1.0, 1.3];
  const k = mbmHash(name);
  return pal.map((p, i) => ({ id: name + i, color: p[0], title: p[1], ratio: ratios[(i + k) % 6] }));
}
const MBM_PIN_BOARDS = [["Flash after dark", 214], ["Streetwear archive", 1180], ["Raw interiors", 96], ["Type specimens", 342], ["Film grain", 58]];

/* ── small parts ── */
function MbmPinMark({ size }) {
  const s = size || 18;
  return (
    <span aria-hidden="true" className="mbm-pin-mark-1" style={{ width: s, height: s, borderRadius: s / 2, font: "700 " + Math.round(s * 0.62) + "px/1 Georgia, serif" }}>P</span>
  );
}
function MbmAvatar({ m, size, ring }) {
  const s = size || 24;
  const hue = mbmHue(m.email || m.name);
  return (
    <span title={m.name} aria-hidden="true" className={mbCx("mbm-avatar-1", ring && "is-ring")} style={{ "--hue": hue, width: s, height: s, borderRadius: s / 2, fontSize: Math.round(s * 0.42) }}>
      {String(m.name || m.email || "?").trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
function MbmFaces({ members, max }) {
  const ms = members || [];
  const shown = ms.slice(0, max || 3);
  return (
    <span className="mbm-faces-1">
      {shown.map((m, i) => <span key={m.email || i} className="mbm-face"><MbmAvatar m={m} size={20} ring /></span>)}
      {ms.length > shown.length ? <span className="mbm-faces-2">+{ms.length - shown.length}</span> : null}
    </span>
  );
}
/* ── tiles ── */
function MbmMedia({ item, radius, big }) {
  const r = radius == null ? 14 : radius;
  const ratio = item.ratio || 1;
  if (item.kind === "image" || (item.kind === "pin" && item.src)) {
    return <img src={item.kind === "image" ? item.url : item.src} alt={item.title || ""} draggable="false"
      className="mbm-media-1" style={{ aspectRatio: String(1 / ratio), borderRadius: r }} />;
  }
  if (item.kind === "color" || item.kind === "pin") {
    const ink = mbmInk(item.color);
    return (
      <span className={mbCx("mbm-media-2", big && "is-big")} style={{ aspectRatio: String(1 / ratio), borderRadius: r, "--swatch": item.color || null, "--ink": ink }}>
        {item.kind === "color" ? (
          <span className="mbm-media-3">
            <span className="mbm-media-name">{item.colorName || "Colour"}</span>
            <span className="mbm-media-4">{String(item.color || "").toUpperCase()}</span>
          </span>
        ) : null}
      </span>
    );
  }
  if (item.kind === "link") {
    const dom = (item.source && item.source.domain) || "";
    const hue = mbmHue(dom);
    return (
      <span className={mbCx("mbm-media-5", big && "is-big")} style={{ borderRadius: r, "--hue": hue }}>
        {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="mbm-media-6" style={{ aspectRatio: String(1 / ratio) }} /> : (
          <span className="mbm-media-7" style={{ aspectRatio: String(1 / Math.min(ratio, big ? 0.62 : 0.8)) }}>
            <span className="display mbm-media-8">{(item.source && item.source.name || dom || "·").slice(0, 1)}</span>
          </span>
        )}
        <span className="mbm-media-9">
          <span className="mbm-media-10">{item.title || dom}</span>
          <span className="mbm-media-11">
            <MbIcon name="link" size={11} />{dom}
          </span>
        </span>
      </span>
    );
  }
  /* note */
  return (
    <span className={mbCx("mbm-media-12", big && "is-big")} style={{ borderRadius: r }}>
      <span className="mbm-media-13">{item.text}</span>
      {!big ? <span className="mbm-media-11"><MbIcon name="text" size={11} />Note</span> : null}
    </span>
  );
}
/* ── the boards list ── */
function MbmCover({ items }) {
  const four = (items || []).slice(0, 4);
  const cell = (it, k) => {
    if (!it) return <span key={k} className="mb-cell-1" />;
    if (it.kind === "image" || (it.kind === "link" && it.thumbnailUrl)) return <img key={k} src={it.kind === "image" ? it.url : it.thumbnailUrl} alt="" className="mb-cell-2" />;
    if (it.kind === "color") return <span key={k} className="mb-cell-5" style={{ "--swatch": it.color }} />;
    if (it.kind === "link") {
      const hue = mbmHue(it.source && it.source.domain);
      return <span key={k} className="mb-cell-3" style={{ "--hue": hue }}><MbIcon name="link" size={16} /></span>;
    }
    return <span key={k} className="mb-cell-4">{it.text}</span>;
  };
  return (
    <span className="mbm-cover-1">
      {[0, 1, 2, 3].map((k) => cell(four[k], k))}
    </span>
  );
}
/* ── adding: link, colour, note, Pinterest ── */
const MBM_SWATCHES = [["#16161A", "Ink"], ["#F2EDE3", "Paper"], ["#B9AE97", "Bone"], ["#D7263D", "Signal red"], ["#3E4A3D", "Moss"], ["#4C8DFF", "Cobalt"],
  ["#FFC53D", "Sodium"], ["#8F3A2E", "Rust"], ["#C9D3DC", "Chrome"], ["#2FD08A", "Mint"], ["#B072FF", "Violet"], ["#E9E4DA", "Limewash"]];
function mbmParseUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (!/\./.test(u.hostname)) return null;
    const domain = u.hostname.replace(/^www\./, "");
    const base = domain.split(".").slice(-2, -1)[0] || domain;
    const known = { "are.na": "Are.na", "ssense.com": "SSENSE", "youtube.com": "YouTube", "instagram.com": "Instagram", "pinterest.com": "Pinterest", "tiktok.com": "TikTok" };
    const name = known[domain] || (base.length <= 3 ? domain : base.charAt(0).toUpperCase() + base.slice(1));
    const seg = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
    const title = seg && !/^\d+$/.test(seg) ? seg.replace(/[-_]+/g, " ").replace(/\.[a-z]+$/i, "").replace(/^./, (c) => c.toUpperCase()) : name;
    return { url: u.href, domain: domain, name: name, title: title };
  } catch (e) { return null; }
}
const MB_ST_DEFAULT = { load: "none", access: "none", conflict: false, ai: "none", account: "none", offline: false, queue: [] };
function mbUseStates(screen) {
  const [, tick] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => (window.needtStates && window.needtStates.on ? window.needtStates.on(tick) : undefined), []);
  return window.needtStates && window.needtStates.get ? Object.assign({}, MB_ST_DEFAULT, window.needtStates.get(screen)) : MB_ST_DEFAULT;
}
function MbStGlyph({ name, size, fallback }) {
  return window.StGlyph ? <window.StGlyph name={name} size={size} /> : <MbIcon name={fallback || "info"} size={size} />;
}
(function mbEdge() {
  if (window.__edgeData) return; /* the desktop's own switch wins where it is loaded */
  const iso = (d) => window.NEEDT.iso(new Date(2026, 8, d));
  const pad = (n) => String(n).padStart(2, "0");
  const T = (id, title, extra) => Object.assign({ id: id, title: title, projectId: null, status: "todo", estimatedMinutes: 30, done: false }, extra || {});
  const at = (day, h, min) => ({ dueDate: iso(day), scheduledStart: iso(day) + "T" + pad(Math.floor(h)) + ":" + pad(Math.round((h % 1) * 60)), estimatedMinutes: min || 30 });
  const fixEnd = (t) => {
    if (!t.scheduledStart) return t;
    const m = Math.round(window.NEEDT.at(t) * 60) + (t.estimatedMinutes || 30);
    return Object.assign(t, { scheduledEnd: t.scheduledStart.slice(0, 11) + pad(Math.min(23, Math.floor(m / 60))) + ":" + pad(m % 60) });
  };
  const seedProjects = () => window.projectSeeds(); /* stores.jsx: the one registry */
  const seedDocs = () => mbDocSeed();
  /* Habit rows + HabitCheckin rows (stores.jsx seeds). */
  const seedHabits = () => JSON.parse(JSON.stringify(window.NEEDT.habitSeed || []));
  const seedCheckins = () => JSON.parse(JSON.stringify(window.NEEDT.habitCheckinSeed || []));
  const habitRow = (id, title) => ({ id: id, title: title, projectId: null, color: null, icon: null, schedule: { time: null, perWeek: null }, archivedAt: null });
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
  /* A board in the joined database shape (Board + BoardItem + BoardMember rows). */
  const board = (id, title, items) => ({ id: id, title: title, projectId: null, linkShare: false, pinterestBoardId: null, pinterestStatus: null, pinterestSyncedAt: null,
    createdAt: new Date(Date.now() - 86400000).toISOString(), trashedAt: null, members: [{ boardId: id, email: MBM_ME.email, role: "owner", name: MBM_ME.name }],
    items: items.map((x, i) => Object.assign({ id: id + "-i" + i, boardId: id, url: null, color: null, text: null, position: i, createdAt: new Date(Date.now() - i * 3600000).toISOString() }, x)) });
  const SETS = {
    long() {
      const tasks = mbSeedTasks();
      LONG_T.forEach((title, i) => { if (tasks[i + 6]) tasks[i + 6].title = title; });
      tasks.forEach((t) => { if (t.projectId === "ops") t.projectId = "p-long"; });
      const projects = seedProjects().map((p) => p.id === "ops" ? Object.assign({}, p, { id: "p-long", name: LONG_P, seed: false }) : p);
      const docs = seedDocs().map((d) => d.id === "launch" ? Object.assign({}, d, { title: "Launch brief for the September release — scope, open questions, owners, dates and every decision we still have to make before it ships", projectId: "p-long" }) : d);
      const habits = seedHabits().map((h, i) => i ? h : Object.assign({}, h, { title: "Thirty minutes of German out loud, every single evening, before anything else" }));
      const boards = mbmSeed().map((b, i) => i ? b : Object.assign({}, b, { title: "Flash after dark — every reference for the autumn shoot, the lookbook and the shop banners" }));
      return { tasks, projects, docs, habits, boards };
    },
    german() {
      const tasks = mbSeedTasks();
      DE_T.forEach((title, i) => { if (tasks[i + 6]) tasks[i + 6].title = title; });
      tasks.forEach((t) => { if (t.projectId === "german") t.projectId = "p-de"; });
      const projects = seedProjects().map((p) => p.id === "german" ? Object.assign({}, p, { id: "p-de", name: DE_P, seed: false }) : p);
      const docs = seedDocs().map((d) => d.id === "german" ? Object.assign({}, d, { title: "Donaudampfschifffahrtsgesellschaftskapitänsmützenabzeichen", projectId: "p-de" }) : d);
      const habits = seedHabits().map((h, i) => i ? h : Object.assign({}, h, { title: "Rechtschreibungsübungen" }));
      const boards = mbmSeed().map((b, i) => i ? b : Object.assign({}, b, { title: "Herbstkollektionsinspirationssammlung" }));
      return { tasks, projects, docs, habits, boards };
    },
    empty() { return { tasks: [], projects: [], docs: [], habits: [], boards: [], mail: "empty" }; },
    one() {
      return { tasks: [fixEnd(T(1, "Reply to the Berlin buyer", Object.assign({ projectId: "resale" }, at(1, 15, 20))))],
        projects: seedProjects().filter((p) => p.id === "resale"),
        docs: seedDocs().filter((d) => d.id === "launch"),
        habits: seedHabits().slice(0, 1),
        boards: [board("mb-one", "One board", [{ kind: "note", text: "The only reference so far.", ratio: 0.8 }])] };
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
      const habits = seedHabits(), checkins = seedCheckins();
      for (let i = habits.length; i < 12; i++) {
        habits.push(habitRow("h-many-" + i, ["Stretch", "Read 20 pages", "No phone after 22:00", "Walk", "Water", "Journal"][i % 6] + " " + (i + 1)));
        for (let k = 0; k < 14; k++) if ((i + k) % 3) checkins.push({ habitId: "h-many-" + i, date: iso(1 - 13 + k), done: true });
      }
      const boards = mbmSeed();
      for (let i = 0; i < 20; i++) boards.push(board("mb-many-" + i, "Board " + (i + 1), [{ kind: "note", text: "Reference " + (i + 1), ratio: 0.8 }]));
      return { tasks, projects: seedProjects(), docs: seedDocs(), habits, checkins, boards };
    },
    nocolor() {
      const tasks = mbSeedTasks();
      let n = 0;
      tasks.forEach((t) => { if (!t.projectId && n < 4) { t.projectId = "p-nocolor"; n++; } });
      const projects = seedProjects().concat([{ id: "p-nocolor", name: "Unsorted", color: null, icon: null }]);
      const docs = seedDocs().map((d) => d.id === "review" ? Object.assign({}, d, { projectId: "p-nocolor" }) : d);
      const habits = seedHabits().map((h, i) => i ? h : Object.assign({}, h, { projectId: "p-nocolor" }));
      return { tasks, projects, docs, habits, boards: mbmSeed() };
    },
    /* Mail: 200 threads over many days (the desktop's mail kind). */
    mail() { return Object.assign(SETS.reset(), { mail: "mail" }); },
    reset() { return { tasks: mbSeedTasks(), projects: seedProjects(), docs: seedDocs(), habits: seedHabits(), boards: mbmSeed(), mail: "seed" }; }
  };
  window.__edgeData = function (kind) {
    const make = SETS[kind];
    if (!make) { console.warn("__edgeData: one of " + Object.keys(SETS).join(" | ")); return Object.keys(SETS); }
    const d = make();
    window.projectStore.set((s) => Object.assign({}, s, { list: d.projects })); /* writes "needt.projects(.all)" */
    mbDocStore.set(d.docs);
    mbTaskStore.set(d.tasks);
    const ids = {}; d.habits.forEach((h) => { ids[h.id] = 1; });
    window.habitApi.replace(d.habits, d.checkins || seedCheckins().filter((c) => ids[c.habitId]));
    mbmStoreOf().set(d.boards);
    if (window.mailApi) window.mailApi.reset(d.mail || "seed");
    mbEdgeStore.set((n) => n + 1);
    window.dispatchEvent(new CustomEvent("needt-edge", { detail: kind }));
    return { kind: kind, tasks: d.tasks.length, projects: d.projects.length, docs: d.docs.length, habits: d.habits.length, boards: d.boards.length };
  };
})();

/* A shell asks for something by bumping a counter (composeKey, askKey …).
   Only a change counts: a remount (theme switch) must not replay it. */
function mbOnKey(key, fn) {
  const first = React.useRef(key);
  React.useEffect(() => { if (key && key !== first.current) fn(); }, [key]);
}

Object.assign(window, { mbOnKey, MbDoc, mbTaskStore, mbHabitStore, mbPrefStore, mbSetPref, mbDcStyleOf, mbUseStates });
