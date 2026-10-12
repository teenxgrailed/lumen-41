/* PHONE KIT — the shared primitives of the phone, "Plates" material (08.10.26).
 *
 * One kit for every phone screen: a calm ground, huge tight type, the things
 * that matter now on INVERSE plates (black on light, white on dark — the
 * plate wears the opposite theme class, like menu A's card), lavender only
 * for now / active, progressive blur where content slides under chrome.
 * Extracted from mobile-v2-plates.jsx (Home & Calendar) and generalised.
 * Styles: styles/phone-kit.css (classes pk-*); colours: themes.css --v2p-*
 * (ground, ink, plates) and --pk-* (glass, fog, dots).
 *
 * Load order: after Mobile.jsx and nav-a.jsx (uses mb* formatters, the task
 * store, nvaStep / nvaRubber / nvaShape / window.NvaGlyph at call time),
 * popovers.jsx (window.Art) and Sidebar.jsx (window.PlaceGlyph) and stores.jsx (projects, docs). Everything below is on window.
 * Nothing moves at rest: springs and transitions run only on events;
 * prefers-reduced-motion jumps between states.
 *
 * ── Theme ──────────────────────────────────────────────────────────────────
 *   <PkTheme.Provider value="light"|"dark">   wrap the phone once.
 *   usePkPlate() → "dark"|"paper"|"pk-muted"  the class a plate wears: light
 *                  theme = inverse (a black plate); dark theme = "pk-muted",
 *                  a raised dark surface with light text (no big white
 *                  plates — only the primary button keeps full contrast).
 *   usePkInverse() → "dark"|"paper"           the opposite theme class.
 *   pkPlateClass(theme), pkInverse(theme), pkCx(...classes), pkReduced()
 *
 * ── Screen scaffold ───────────────────────────────────────────────────────
 *   <PkScreen title sub right head headClass compactTitle onPull screen
 *             className scrollRef tail>children</PkScreen>
 *     title         the large title (string or node). It collapses into a
 *                   compact title over a progressive top blur band while the
 *                   content scrolls under the status bar.
 *     compactTitle  text for the compact bar (default: title when a string).
 *     sub           a line under the title (string or node).
 *     right         a node at the right of the title row (a segmented
 *                   control, a round button).
 *     head          more header content under sub (Home's big figures).
 *     headClass     extra class on the <header> ("is-cal" etc.).
 *     onPull        { search(q) → [{id,title,meta,done}], onPick(item),
 *                     onAdd(text), placeholder?, hint?, addLabel?(q) } —
 *                   pull down at the top drops PkPullDown. pkTaskPull()
 *                   builds this for tasks.
 *     screen        data-pk-screen value (for tests / CSS hooks).
 *     scrollRef     (el) => void, receives the scroll container.
 *     tail          false to drop the bottom spacer (default: 132px so the
 *                   last row clears the pill).
 *   The bottom of every PkScreen carries the progressive blur + halftone
 *   dots band behind the menu pill. The scroll container is native
 *   (momentum, overscroll contained). The status bar (52px) is inside the
 *   scroll padding, so content slides under the top band.
 *
 *   <PkPullDown scroller search onPick onAdd placeholder hint addLabel />
 *     the plate (usePkPlate) that drops from the top edge (1:1 finger, rubber
 *     band, spring), with one field: search, or Enter adds. Its top strip is
 *     sky (revealed first as it drops; parked while shut). onAdd, hint,
 *     addLabel and placeholder are optional — without onAdd there is no Add
 *     button, the words say "search", and Enter opens the first hit (Mail).
 *     PkScreen mounts it from onPull; use it directly only on a custom
 *     scroller.
 *
 * ── Material ──────────────────────────────────────────────────────────────
 *   <PkNumber value className label />  rolling digits (each digit a 0–9
 *     strip, a transition on change only). value may hold non-digits ("9 h").
 *   <PkButton kind icon small block disabled onClick className …rest>
 *     kind "primary"  inverse pill (ink on ground; inside a plate, the
 *                     plate's ink) · "quiet" raised (default) · "chip" small
 *                     32px raised · "ghost" small transparent · "inline"
 *                     26px chip in a line of text. Text is ellipsised.
 *   <PkField label id value onChange placeholder multiline rows grow
 *            className inputProps />  a field on the ground (raise fill,
 *     lavender ring on focus). multiline + grow = a textarea that fits its
 *     text (Notes for the day).
 *   <PkEmpty title line action sky />  the quiet empty line (title / action
 *     optional), with a small sky vignette (PkSkyBadge) as the reward for an
 *     empty / finished list; sky={false} drops it.
 *
 * ── The sky (08.10.26, owner: "where are the clouds?") ────────────────────
 *   The brand sky (scenes.jsx PxSky) as a small accent on the calm ground:
 *   <PkSkyPlate as className radius label …>  a plate whose ground is the
 *     sky (Home's Next up). Text inside reads the sky's ink (--px-ink*,
 *     mapped onto --v2p-ink*); the primary button stays inverse (ink pill).
 *   <PkSkyBadge className />  a small sky vignette (empty / finished states).
 *   pkSkyMood(theme, date?)  the mood by time of day, like the desktop's
 *     Time theme: light — pale periwinkle in the morning, the day's own mood
 *     by day, warm rose at golden hour; dark — dusk in the evening, night
 *     otherwise. Skies follow the APP theme (dark = night / dusk), never the
 *     inverse plate they sit on.
 *   <PkSweep kind="row"|"screen" />  a one-shot halftone dot sweep (≤ 400 ms,
 *     transform only; none under reduced motion): a completed row, and a
 *     screen switch from menu A.
 *   Cost: every sky rides scenes.jsx's rest system (12 s without input →
 *   no frames), pauses off-screen (IntersectionObserver) and when covered;
 *   the pull-down's sky is parked while the plate is shut.
 *   pkDotSweep(target?, kind?)  the same sweep, fired imperatively (no
 *     component to mount): appends one .pk-sweep to target (an element or a
 *     selector; default the phone's screen host [data-v2p-host] or the first
 *     .pk-screen) and removes it when it ends. kind "row" | "screen"
 *     (default "screen"). No-op under reduced motion. Returns nothing.
 *
 * ── Colour and glass (wave 3, 09.10.26 — owner: "more glass, more colour") ──
 *   <PkGlyph place="calendar" | kind="doc" size="s"|"m"|"l"|"xl"|px
 *            tone="tint"|"glass"|"plain" className label />
 *     the coloured section glyph TILE — menu A's row icon (the desktop's
 *     Sidebar PlaceGlyph / nav-a NvaGlyph drawings) on a rounded tile washed
 *     with the place's hue. place = a phone place id (home, calendar, tasks,
 *     docs, mail, ask, habits, moodboards, projects, templates, shared, trash,
 *     connections, settings); kind = a popovers.jsx Art name for a type
 *     (doc, page, folder, template, task, event, …). size s 32 · m 44
 *     (default) · l 56 · xl 72, or a number. tone "tint" (default: hue wash
 *     over the raise), "glass" (frosted, for a sky / busy ground), "plain"
 *     (the raise, no hue). label → role="img" + aria-label (default
 *     aria-hidden). Use it in screen headers (PkScreen glyph=…), section
 *     headers (PkSection glyph=…), empty states and rows that show a place.
 *   <PkGlass as className strong round>children</PkGlass>
 *     a frosted surface (see-through fill + backdrop blur + a light edge):
 *     glass chips, buttons, headers and cards. strong = a denser fill (over
 *     busy content); round = a pill radius. Passes data-*, aria-*, onClick,
 *     type, role, tabIndex, style. Never put it under an ancestor with
 *     opacity / filter / mask (see the blur rule above).
 *   PkScreen glyph="place" (or glyphKind="doc") puts a PkGlyph (l)
 *   before the large title (with a `right` control: a PkGlyph (m) and the
 *   control share a row above the title) and a small one before the
 *   compact title;
 *   PkSection glyph="place" puts a small one before the label.
 *   pkFogLive(el) → cleanup  the fog's halftone drifts like the sky (CSS,
 *     compositor-only) while the band is live: marks el data-pk-live while
 *     it is on screen and the tab is visible. <PkFog> does it itself; menu
 *     A's card fog does the same by hand. The scroll does not move the dots.
 *
 * ── Lists ─────────────────────────────────────────────────────────────────
 *   <PkSection title count tone="late" action folded onFold big>rows</PkSection>
 *     a quiet uppercase label (or, with big, one big word) + count + one
 *     action; with onFold it folds (chevron). Rows get a top hairline.
 *   <PkRow id title meta time lead action label done late phase out canDone
 *          canLater onCheck onOpen onSwipe doneLabel laterLabel doneIcon
 *          laterIcon check />
 *     a row on the ground: [lead | check ring] [one open button: title, meta,
 *     time] [action] — siblings, never a button in a button. Swipe right =
 *     done, left = tomorrow (1:1 to 92px, then a rubber band; a flick counts;
 *     the reveal is the plate surface — muted in dark — / raised grey, with
 *     doneLabel + doneIcon / laterLabel + laterIcon, e.g. Mail's Archive /
 *     Make task). phase "check"|"done"|"later" shows the exit; out folds the
 *     row shut. check={false} drops the ring (event rows); lead replaces it.
 *     action: a node at the end (one button) — a swipe never starts on it.
 *   <PkTaskRow t late phase out canDone canLater onCheck onOpen onSwipe
 *              hideProject action />
 *     PkRow for a task: meta = since/duration/project, time, a clip count
 *     when it has attachments; hideProject inside a project's own page.
 *   usePkExit(commit) → { phase, out, exit(t, kind) }  the row exit in steps
 *     (check shows / thrown → folds → commit(t, kind)); kind "check"|"done"|
 *     "later". Use phase[id] / out[id] on rows and phase as "busy" for
 *     pkDay.nextUp.
 *   <PkChips className label>chips</PkChips>  a horizontal strip whose
 *     left / right edges fade into a progressive blur (only on the side that
 *     has more).
 *
 * ── Sheets ────────────────────────────────────────────────────────────────
 *   <PkSheet open onClose title meta head footer detents label className
 *            bodyClass>children</PkSheet>
 *     a frosted sheet over a scrim that blurs the screen, stronger at the
 *     edges. Swipe down to close with menu A's physics (1:1 drag, rubber band
 *     past the top, velocity decides), scrim tap, Esc. detents: fractions of
 *     the screen height, e.g. [0.5, 0.92] (opens at the first; without them
 *     the sheet fits its content up to 92%). Drag starts anywhere on the
 *     sheet except fields; in the body only when it is scrolled to the top.
 *
 *     from: a rect {x, y, w, h, r} in the sheet layer's px (or a function
 *     (layerEl) → rect) the sheet grows out of and goes back into — menu A's
 *     pill for the composer: pkPillRect. A drag still closes by sliding.
 *     onShut(): called once the sheet is fully put away (after the slide or
 *     the morph back) — e.g. to show the pill again.
 *
 *     A footer stays on screen at a lower detent (it rides up with the
 *     visible part; past the lowest detent it leaves with the sheet).
 *
 *   <PkScrim scrimRef open onClick />  the blurred scrim (stronger at the
 *     edges); drive it with --pk-scrim-k (0..1) on scrimRef. <PkFog />  the
 *     bottom band alone (PkScreen already has one). <PkTopBand />  the top
 *     band alone, <PkBlurLayers />  the three progressive blur layers — for a
 *     custom scroller (the doc reader, a board), never hand-written spans.
 *
 * ── Hold → actions (wave 3; was Mobile.jsx MbHold / MbActSheet / MbHueTile /
 *    mbOwnGesture) ─────────────────────────────────────────────────────────
 *   <PkHold onHold className data disabled>children</PkHold>
 *     a box that fires onHold after a 450 ms press that has not travelled
 *     (8 px), or on contextmenu (a mouse's right click, iOS's own long
 *     press). The click that ends a hold is swallowed, and the pointer is
 *     captured at that moment so the sheet that opens under the finger never
 *     gets the release. A swipe or a scroll that starts on it cancels it.
 *   <PkActions acts onClose />
 *     acts = null | { title, meta, head, actions: [{ label, hint, icon, hue,
 *     glyph (a place id → PkGlyph), danger, check, more, disabled, onClick,
 *     data }] } — one frosted PkSheet with a list of glass action rows, each
 *     led by a coloured tile. The sheet closes, then the action runs (in the
 *     same tap, so a file picker it opens keeps the user's gesture).
 *   <PkHueTile icon hue glyph size />  the coloured tile alone (icon
 *     "pinterest" draws Mobile.jsx's MbmPinMark).
 *   pkOwnGesture(pointerId) → release()  a hold that becomes a lift (drag)
 *     takes the finger: the screen's own trackers get a pointercancel and
 *     touch moves stop scrolling until release().
 *   Classes pk-hold, pk-acts, pk-act*, pk-hue-tile (styles/phone-kit.css).
 *
 * ── Day logic (one copy for every phone screen) ───────────────────────────
 *   window.pkDay = {
 *     part(at)                      "Morning"|"Afternoon"|"Evening"|"Anytime"
 *     sections(tasks, today?)       { late, day, inbox, next }
 *     parts(list)                   [[part, tasks]] in day order, non-empty
 *     nextUp({late, day}, {skipped, busy})
 *                                   { nu, after, cands, fresh, lateOpen, open,
 *                                     skip(skipped) → next skipped list }
 *     toggle(id) · update(id, patch) · trash(id) → undo
 *     create(fields) → id           fields: a title string, or { title,
 *                                   date, time, duration, project, priority,
 *                                   label, note, attachments } — words as the
 *                                   composer's coParse found them ("tomorrow",
 *                                   "3pm", "45m", a project name …) or values
 *                                   (dueDate / hour / minutes / projectId).
 *     later(t) → undo  (to tomorrow) · moveOverdue(tasks) → {label, undo}|null
 *     snapshot(t)                   the date fields, for an undo
 *     fileOf(File) → {name,size,type} · fileSize(bytes) → "12 KB"
 *   }
 *   pkTaskPull({ tasks, onOpen, onAdd }) → the onPull object for tasks.
 */
const PkNS = window.NeedtDesignSystem_25d3c8;
const { Icon: PkIcon } = PkNS;

const pkCx = (...a) => a.filter(Boolean).join(" ");
const pkReduced = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const pkInverse = (theme) => (theme === "dark" ? "paper" : "dark");
const pkClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const PkTheme = React.createContext("light");
const usePkInverse = () => pkInverse(React.useContext(PkTheme));
/* The class a plate wears (UX review 08.10.26): light theme — inverse (the
   opposite theme class: a black plate); dark theme — "pk-muted", a slightly
   raised dark surface with light text, never a big white card. Only the
   primary button inside keeps full contrast. */
const pkPlateClass = (theme) => (theme === "dark" ? "pk-muted" : pkInverse(theme));
const usePkPlate = () => pkPlateClass(React.useContext(PkTheme));
/* The sky's mood by time of day (see the header). null = the day's mood. */
function pkSkyMood(theme, date) {
  const h = (date || window.__pxTimeAt || new Date()).getHours();
  if (theme === "dark") return h >= 17 && h < 22 ? "dusk" : "night";
  return h >= 5 && h < 10 ? "periwinkle" : h >= 16 && h < 21 ? "rose" : null;
}
/* Re-read once a quarter hour while mounted, so a plate left open crosses
   into golden hour / dusk (one timer per sky host, no frames). */
function usePkSkyMood() {
  const theme = React.useContext(PkTheme);
  const [, tick] = React.useState(0);
  React.useEffect(() => { const id = window.setInterval(() => tick((n) => n + 1), 15 * 60 * 1000); return () => window.clearInterval(id); }, []);
  return { mood: pkSkyMood(theme), dark: theme === "dark" };
}
/* menu A's spring and rubber band (nav-a.jsx), so every gesture feels the same */
const pkRubber = (x, d) => nvaRubber(x, d);
const pkStep = (s, target, dt, k, zeta) => nvaStep(s, target, dt, k, zeta);
const pkOff = (fn) => { window.removeEventListener("pointermove", fn.mv, true); window.removeEventListener("pointerup", fn.up, true); window.removeEventListener("pointercancel", fn.up, true); };
/* window pointer tracking for one drag: move(e), end(e) */
function pkTrack(move, end) {
  const fn = {};
  fn.mv = (e) => move(e);
  fn.up = (e) => { pkOff(fn); end(e); };
  window.addEventListener("pointermove", fn.mv, true); window.addEventListener("pointerup", fn.up, true); window.addEventListener("pointercancel", fn.up, true);
}

/* ══ Day logic ═════════════════════════════════════════════════════════════ */
const pkStore = () => window.mbTaskStore;
const PK_PRIO_ALIAS = { important: "high", asap: "urgent", normal: "medium", whenever: "low", sometime: "low" };
const pkDay = {
  part(at) { return at == null ? "Anytime" : at < 12 ? "Morning" : at < 17 ? "Afternoon" : "Evening"; },
  sections(tasks, today) {
    const T = today == null ? MB_TODAY : today;
    const late = tasks.filter((t) => t.overdue && !t.noSlot).sort((a, b) => mbDayKey(a) - mbDayKey(b) || mbAtKey(a) - mbAtKey(b));
    const day = tasks.filter((t) => !t.overdue && !t.noSlot && mbDueDay(t) === T).sort((a, b) => mbAtKey(a) - mbAtKey(b));
    const inbox = tasks.filter((t) => !t.overdue && !t.noSlot && !t.dueDate && !t.isFixed);
    const next = tasks.filter((t) => !t.overdue && !t.noSlot && mbDueDay(t) === T + 1);
    return { late: late, day: day, inbox: inbox, next: next };
  },
  parts(list) {
    return ["Morning", "Afternoon", "Evening", "Anytime"].map((p) => [p, list.filter((t) => pkDay.part(mbAt(t)) === p)]).filter((x) => x[1].length);
  },
  /* Next up: overdue first (oldest), then today's open work in time order;
     Skip cycles through the candidates. busy = rows still leaving. */
  nextUp(sec, opts) {
    const o = opts || {}, skipped = o.skipped || [], busy = o.busy || {};
    const lateOpen = sec.late.filter((t) => !t.done && !busy[t.id]);
    const open = sec.day.filter((t) => !t.done && !busy[t.id]);
    const cands = lateOpen.concat(open);
    const fresh = cands.filter((t) => skipped.indexOf(t.id) < 0);
    const nu = (fresh.length ? fresh : cands)[0] || null;
    const after = nu && !nu.overdue ? open.filter((t) => mbAt(t) != null && mbAt(nu) != null && mbAt(t) > mbAt(nu))[0] || null : null;
    return { nu: nu, after: after, cands: cands, fresh: fresh, lateOpen: lateOpen, open: open, skip: (s) => (fresh.length <= 1 || !nu ? [] : s.concat(nu.id)) };
  },
  /* Edits: closing a task closes its open parts;
     NEEDT.sync keeps scheduledEnd; offline, an edit waits in the queue. */
  queue(id, verb) {
    const Q = window.needtStates; if (!Q || !Q.queue) return;
    const t = pkStore().get().filter((x) => x.id === id)[0];
    Q.queue("task:" + id, verb + " “" + ((t && t.title) || "a task") + "”");
  },
  toggle(id) {
    pkDay.queue(id, "Checked off");
    pkStore().set((l) => l.map((t) => {
      if (t.id !== id) return t;
      const done = !t.done;
      return Object.assign({}, t, { done: done }, done && (t.TaskPart || []).some((p) => !p.done) ? { TaskPart: t.TaskPart.map((p) => Object.assign({}, p, { done: true })) } : null);
    }));
  },
  update(id, p) { pkDay.queue(id, "Edited"); pkStore().set((l) => l.map((t) => (t.id === id ? window.NEEDT.sync(Object.assign({}, t, p)) : t))); },
  /* A new task lands on today (the prototype's day model: 1 Sep) unless its
     fields say otherwise. fields: a title, or { title, date, time, duration,
     project, priority, label, note, attachments } — each a word as the
     composer's coParse found it ("tomorrow", "3pm", "45m", "Resale",
     "urgent") or a value (dueDate, hour, minutes, projectId); a coParse
     result ({ rest, found, note }) works as it is. One write. */
  create(fields) {
    const N = window.NEEDT;
    const f = typeof fields === "string" ? { title: fields } : fields || {};
    const found = f.found || {};
    const say = (k) => (f[k] != null && typeof f[k] !== "object" ? f[k] : found[k] ? found[k].value : null);
    const id = Date.now();
    const title = String((f.found && f.rest) || f.title || "").trim() || f.title || "";
    let t = { id: id, title: title, projectId: null, estimatedMinutes: 30, done: false, dueDate: N.toDate(MB_TODAY + " Sep") };
    if (f.attachments && f.attachments.length) t.attachments = f.attachments.map((a) => ({ name: a.name, size: a.size, type: a.type }));
    const dur = f.minutes != null ? f.minutes : say("duration");
    const mins = typeof dur === "number" ? dur : dur ? parseInt(dur, 10) * (/h/.test(dur) ? 60 : 1) : 0;
    if (mins) t.estimatedMinutes = mins;
    const date = f.dueDate || say("date");
    const day = date ? N.toDate(date) : null;
    const time = f.hour != null ? f.hour : say("time");
    const hour = typeof time === "number" ? time : time ? pkDay.hour(time) : null;
    if (hour != null) t = Object.assign(t, N.placeAt(t, day || t.dueDate, hour));
    else if (day) t = Object.assign(t, N.moveDay(t, day));
    const project = say("project");
    if (f.projectId !== undefined) t.projectId = f.projectId;
    else if (project) t.projectId = N.projectIdOf(project);
    const prio = say("priority");
    if (prio) t.priority = pkDay.prio(prio);
    const label = f.labels || say("label");
    if (label) t.labels = Array.isArray(label) ? label : [label];
    if (f.note) t.notes = f.note;
    t = N.sync ? N.sync(t) : t;
    pkStore().set((l) => [t].concat(l));
    return id;
  },
  /* What to say after create: "Added to today", or where it went. */
  added(id) {
    const t = pkStore().get().filter((x) => x.id === id)[0];
    if (!t || !t.dueDate || mbDueDay(t) === MB_TODAY) return t && !t.dueDate ? "Added to Inbox" : "Added to today";
    return "Added — " + (mbDue(t) || "scheduled");
  },
  /* The words a line uses for priority, and for a time of day. */
  prio(p) { const k = p ? String(p).toLowerCase() : null; return k ? (PK_PRIO_ALIAS[k] || k) : null; },
  hour(v) {
    if (v === "noon") return 12; if (v === "midnight") return 0;
    const m = /^(\d{1,2})(?::(\d{2}))?\s?(am|pm)?$/.exec(String(v || "").trim());
    if (!m) return null;
    return (m[3] ? +m[1] % 12 + (m[3] === "pm" ? 12 : 0) : +m[1]) + (m[2] ? +m[2] / 60 : 0);
  },
  /* Delete = Trash: the task keeps its place, stamped. Returns the undo. */
  trash(id) {
    pkStore().set((l) => l.map((x) => (x.id === id ? Object.assign({}, x, { trashedAt: new Date().toISOString() }) : x)));
    return () => pkStore().set((l) => l.map((x) => (x.id === id ? Object.assign({}, x, { trashedAt: null }) : x)));
  },
  snapshot(t) { return { overdue: t.overdue, dueDate: t.dueDate, scheduledStart: t.scheduledStart, scheduledEnd: t.scheduledEnd }; },
  later(t) {
    const before = pkDay.snapshot(t);
    pkDay.update(t.id, Object.assign({ overdue: false }, window.NEEDT.moveDay(t, (MB_TODAY + 1) + " Sep")));
    return () => pkDay.update(t.id, before);
  },
  moveOverdue(tasks) {
    const list = tasks.filter((t) => t.overdue && !t.done && !t.noSlot);
    if (!list.length) return null;
    const before = list.map((t) => [t.id, pkDay.snapshot(t)]);
    list.forEach((t) => pkDay.update(t.id, Object.assign({ overdue: false }, window.NEEDT.moveDay(t, MB_TODAY + " Sep"))));
    return { label: list.length + (list.length === 1 ? " task" : " tasks") + " moved to today", undo: () => before.forEach(([id, b]) => pkDay.update(id, b)) };
  },
  fileOf(f) { return { name: f.name, size: f.size, type: f.type || "" }; },
  fileSize(n) { return n == null ? "" : n < 1024 ? n + " B" : n < 1048576 ? Math.round(n / 1024) + " KB" : (n / 1048576).toFixed(1) + " MB"; }
};

/* The pull-down for tasks: search titles, open a hit, Enter adds to today. */
function pkTaskPull({ tasks, onOpen, onAdd }) {
  return {
    search: (q) => tasks.filter((t) => String(t.title || "").toLowerCase().indexOf(q.toLowerCase()) > -1).slice(0, 5).map((t) => ({
      id: t.id, title: t.title, done: t.done, task: t,
      meta: [t.done ? "Done" : t.overdue ? "Overdue" : mbDue(t) || "Inbox", mbAt(t) != null ? mbTime(mbAt(t)) : null].filter(Boolean).join(" · ")
    })),
    onPick: (hit) => onOpen(hit.task),
    onAdd: onAdd
  };
}

/* ══ Numbers ══════════════════════════════════════════════════════════════ */
function PkNumber({ value, className, label }) {
  const chars = String(value).split("");
  const n = chars.length;
  return (
    <span className={pkCx("pk-num", className)} aria-label={label != null ? label : String(value)} role="img">
      {chars.map((c, i) => {
        const key = n - i; /* counted from the right, so 9 → 10 rolls the ones */
        if (!/\d/.test(c)) return <span key={"c" + key + c} className="pk-num-ch" aria-hidden="true">{c}</span>;
        return (
          <span key={"d" + key} className="pk-num-d" aria-hidden="true">
            <span className="pk-num-sizer">0</span>
            <span className="pk-num-strip" style={{ "--d": +c }}>
              {"0123456789".split("").map((x) => <span key={x}>{x}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/* ══ Material ═════════════════════════════════════════════════════════════ */
/* A plate whose ground is the sky. No ...rest here (Babel-standalone shares
   its _excluded helper across files): the props it passes on are listed. */
function PkSkyPlate(props) {
  const { as, className, children, radius } = props;
  const sky = usePkSkyMood();
  const Tag = as || "section";
  const pass = {};
  Object.keys(props).forEach((k) => { if (k.indexOf("data-") === 0 || k.indexOf("aria-") === 0 || k === "onClick" || k === "type") pass[k] = props[k]; });
  return (
    <Tag className={pkCx("pk-plate pk-skyplate", className)} data-px-scope="" {...pass}>
      {window.PxSky ? <window.PxSky horizon="none" fps={15} radius={radius == null ? 26 : radius} mood={sky.mood} dark={sky.dark} className="pk-skyplate-sky" /> : null}
      <div className="pk-skyplate-in">{children}</div>
    </Tag>
  );
}
/* A small window of sky: the reward on an empty / finished list. */
function PkSkyBadge({ className }) {
  const sky = usePkSkyMood();
  return (
    <span className={pkCx("pk-skybadge", className)} data-px-scope="" aria-hidden="true" data-pk-skybadge="">
      {window.PxSky ? <window.PxSky horizon="none" fps={15} radius={20} mood={sky.mood} dark={sky.dark} /> : null}
    </span>
  );
}
/* A one-shot halftone sweep (the sky's dot screen): kind "row" crosses a
   row left → right (a task done), "screen" falls over the screen (menu A
   switched places). Transform only; removed when it ends; CSS hides it under
   reduced motion. */
function PkSweep({ kind }) {
  const [on, setOn] = React.useState(true);
  if (!on) return null;
  return (
    <span className={pkCx("pk-sweep", "is-" + (kind || "row"))} aria-hidden="true" data-pk-sweep={kind || "row"}>
      <span className="pk-sweep-band" onAnimationEnd={() => setOn(false)} />
    </span>
  );
}

/* Fire the sweep without mounting a component (a screen switch decided in a
   handler, a done tick in someone else's list). */
function pkDotSweep(target, kind) {
  if (pkReduced() || typeof document === "undefined") return;
  let host = typeof target === "string" ? document.querySelector(target) : target;
  if (!host) host = document.querySelector("[data-v2p-host]") || document.querySelector(".pk-screen");
  if (!host) return;
  if (window.getComputedStyle(host).position === "static") host.style.position = "relative";
  const k = kind === "row" ? "row" : "screen";
  const el = document.createElement("span");
  el.className = "pk-sweep is-" + k; el.setAttribute("aria-hidden", "true"); el.setAttribute("data-pk-sweep", k);
  const band = document.createElement("span"); band.className = "pk-sweep-band";
  el.appendChild(band);
  const done = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  band.addEventListener("animationend", done);
  window.setTimeout(done, 700); /* a hidden tab never ends the animation */
  host.appendChild(el);
}

/* ══ Colour: the section glyph tile ═══════════════════════════════════════
   The menu card's row icon (NvaGlyph = the desktop's PlaceGlyph drawings)
   on a tile washed with the place's hue (phone-kit.css .pk-glyph). */
const PK_PLACE_HUE = { home: "var(--accent)", tasks: "var(--accent)", calendar: "var(--destructive)", mail: "var(--info)", docs: "var(--success)",
  ask: "var(--v2p-lav)", habits: "var(--success)", moodboards: "var(--destructive)", projects: "var(--pk-violet)", templates: "var(--pk-violet)",
  shared: "var(--info)", trash: "var(--destructive)", connections: "var(--info)", settings: "var(--v2p-ink-2)" };
const PK_KIND_HUE = { doc: "var(--success)", page: "var(--success)", folder: "var(--accent)", template: "var(--pk-violet)", task: "var(--accent)", event: "var(--destructive)", mail: "var(--info)" };
const PK_GLYPH_PX = { s: 32, m: 44, l: 56, xl: 72 };
function PkGlyph({ place, kind, size, tone, className, label }) {
  const px = typeof size === "number" ? size : PK_GLYPH_PX[size || "m"] || 44;
  const hue = place ? PK_PLACE_HUE[place] : PK_KIND_HUE[kind];
  let art = null;
  if (place && window.NvaGlyph) art = <window.NvaGlyph id={place} />;
  else if (kind && window.Art) art = <window.Art name={kind} size={24} />;
  else if (place && window.PlaceGlyph) art = <window.PlaceGlyph id={place} />;
  return (
    <span className={pkCx("pk-glyph", "is-" + (tone || "tint"), className)} data-pk-glyph={place || kind || ""}
      style={{ "--pk-gl": px + "px", "--pk-gl-hue": hue || "var(--v2p-lav)" }}
      role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : "true"}>
      <span className="pk-glyph-art">{art}</span>
    </span>
  );
}

/* ══ Glass: a frosted surface ═════════════════════════════════════════════
   No ...rest (Babel-standalone shares its _excluded helper across files):
   the props it passes on are listed. */
const PK_GLASS_PASS = { onClick: 1, type: 1, role: 1, tabIndex: 1, style: 1, id: 1, title: 1, disabled: 1, onPointerDown: 1 };
function PkGlass(props) {
  const { as, className, strong, round, children } = props;
  const Tag = as || "div";
  const pass = {};
  Object.keys(props).forEach((k) => { if (k.indexOf("data-") === 0 || k.indexOf("aria-") === 0 || PK_GLASS_PASS[k]) pass[k] = props[k]; });
  if (Tag === "button" && !pass.type) pass.type = "button";
  return <Tag className={pkCx("pk-glass", strong && "is-strong", round && "is-round", className)} {...pass}>{children}</Tag>;
}

function PkButton({ kind, icon, small, block, className, children, type, ...rest }) {
  const k = kind || "quiet";
  return (
    <button type={type || "button"} className={pkCx("pk-btn", "is-" + k, small && "is-small", block && "is-block", className)} {...rest}>
      {icon ? <PkIcon name={icon} size={k === "chip" || k === "ghost" || k === "inline" ? 14 : 18} /> : null}
      {children != null ? <span className="pk-btn-cut">{children}</span> : null}
    </button>
  );
}

function PkField({ label, id, value, onChange, placeholder, multiline, rows, grow, className, inputProps }) {
  const ref = React.useRef(null);
  const fit = () => { const el = ref.current; if (!el || !grow) return; el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; };
  React.useLayoutEffect(fit, [value, grow]);
  const fid = id || undefined;
  const common = Object.assign({ id: fid, ref: ref, value: value, onChange: onChange, placeholder: placeholder, className: pkCx("pk-field-input", multiline && "is-multi", grow && "is-grow") }, inputProps || {});
  return (
    <div className={pkCx("pk-field", className)}>
      {label ? <label className="pk-label" htmlFor={fid}>{label}</label> : null}
      {multiline ? <textarea rows={rows || 2} {...common} /> : <input {...common} />}
    </div>
  );
}

function PkEmpty({ title, line, action, sky }) {
  const badge = sky === false ? null : <PkSkyBadge />;
  if (!title && !action) {
    if (!badge) return <p className="pk-empty">{line}</p>;
    return <div className="pk-empty is-sky">{badge}<p className="pk-empty-line">{line}</p></div>;
  }
  return (
    <div className="pk-empty is-block">
      {badge}
      {title ? <p className="pk-empty-title">{title}</p> : null}
      {line ? <p className="pk-empty-line">{line}</p> : null}
      {action ? <div className="pk-empty-action">{action}</div> : null}
    </div>
  );
}

/* ══ Sections and rows ════════════════════════════════════════════════════ */
function PkSection({ title, count, tone, action, folded, onFold, big, glyph, children, className }) {
  const label = (
    <>
      {glyph ? <PkGlyph place={glyph} size={big ? "m" : "s"} className="pk-sec-glyph" /> : null}
      <span className={pkCx(big ? "pk-sec-word" : "pk-label", tone === "late" && "is-late")}>{title}</span>
      {count ? <span className="pk-sec-count">{count}</span> : null}
    </>
  );
  return (
    <section className={pkCx("pk-sec", big && "is-big", className)}>
      <header className="pk-sec-head">
        {onFold ? (
          <button type="button" className="pk-sec-fold" onClick={onFold} aria-expanded={!folded}>
            {label}
            <span className={pkCx("pk-sec-chev", folded && "is-folded")} aria-hidden="true"><PkIcon name="chevron-down" size={14} /></span>
          </button>
        ) : <span className="pk-sec-fold is-static">{label}</span>}
        {action ? <span className="pk-sec-action">{action}</span> : null}
      </header>
      {folded ? null : <div className="pk-sec-rows">{children}</div>}
    </section>
  );
}

/* A row on the ground. Swipe right = done, left = tomorrow: the row follows
   the finger 1:1 to the threshold, then meets a rubber band; the reveal
   behind it is a plate (done — the muted surface in dark) or the raised grey
   (tomorrow). The row is a plain box: the lead (check ring, avatar, thumb),
   ONE button that opens it (title, meta, time) and an optional action at the
   end — three siblings, so no button sits inside another. */
const PK_SWIPE = 92;
function PkRow({ id, title, meta, time, lead, action, done: doneIn, late, phase, out, canDone, canLater, onCheck, onOpen, onSwipe, doneLabel, laterLabel, doneIcon, laterIcon, check, label }) {
  const plate = usePkPlate();
  const wrap = React.useRef(null), row = React.useRef(null);
  const G = React.useRef(null);
  const ended = React.useRef(0);
  const [armed, setArmed] = React.useState(null); /* null | "done" | "later" */
  const done = !!doneIn || phase === "check";
  const swipes = !!onSwipe && (canDone || canLater);

  const set = (x, k, side) => {
    if (row.current) row.current.style.transform = x ? "translate3d(" + x.toFixed(1) + "px,0,0)" : "";
    if (wrap.current) { wrap.current.style.setProperty("--pk-k", k.toFixed(3)); wrap.current.setAttribute("data-pk-side", side || ""); }
  };
  const shape = (dx) => {
    const a = Math.abs(dx), s = dx < 0 ? -1 : 1;
    const allowed = s > 0 ? canDone : canLater;
    if (!allowed) return s * pkRubber(a, 18);
    return s * (a <= PK_SWIPE ? a : PK_SWIPE + pkRubber(a - PK_SWIPE, 56));
  };
  const move = (e) => {
    const d = G.current; if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    const now = performance.now();
    d.s.push([now, e.clientX]); while (d.s.length > 2 && now - d.s[0][0] > 90) d.s.shift();
    if (!d.kind) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.kind = Math.abs(dx) > Math.abs(dy) * 1.2 ? "swipe" : "none";
      if (d.kind === "swipe" && wrap.current) wrap.current.classList.add("is-dragging");
    }
    if (d.kind !== "swipe") return;
    if (e.cancelable) e.preventDefault();
    const side = dx > 0 ? "done" : "later";
    const ok = side === "done" ? canDone : canLater;
    set(shape(dx), ok ? Math.min(1, Math.abs(dx) / PK_SWIPE) : 0, side);
    const nextArmed = ok && Math.abs(dx) >= PK_SWIPE ? side : null;
    if (nextArmed !== d.armed) { d.armed = nextArmed; setArmed(nextArmed); }
  };
  const end = (e) => {
    const d = G.current; G.current = null;
    if (!d || !d.kind) return;
    ended.current = performance.now();
    if (d.kind !== "swipe") return;
    if (wrap.current) wrap.current.classList.remove("is-dragging");
    const a = d.s[0], b = d.s[d.s.length - 1];
    const v = b[0] - a[0] > 0 ? (b[1] - a[1]) / (b[0] - a[0]) : 0; /* px/ms */
    const dx = e.clientX - d.x0, s = dx < 0 ? -1 : 1;
    const side = s > 0 ? "done" : "later";
    const ok = side === "done" ? canDone : canLater;
    const go = ok && (Math.abs(dx) >= PK_SWIPE || (Math.abs(dx) > 36 && Math.abs(v) > 0.55 && Math.sign(v) === s));
    setArmed(null);
    if (!go) { set(0, 0, null); return; }
    /* Thrown: off the edge, then the parent folds the row away and commits. */
    if (wrap.current) { wrap.current.classList.add("is-thrown"); wrap.current.style.setProperty("--pk-k", "1"); }
    if (row.current) row.current.style.transform = "translate3d(" + (s * 112) + "%,0,0)";
    onSwipe(side);
  };
  const onPointerDown = (e) => {
    if ((e.button != null && e.button > 0) || done || !swipes) return;
    /* the check ring, a lead's own button and the action stay taps */
    const b = e.target.closest && e.target.closest("button, a, input, textarea");
    if (b && !b.classList.contains("pk-row-open")) return;
    G.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, kind: null, s: [[performance.now(), e.clientX]] };
    pkTrack(move, end);
  };
  /* a swipe is not a tap */
  const click = (e) => {
    if (performance.now() - ended.current < 300) { e.preventDefault(); return; }
    if (onOpen) onOpen();
  };
  const body = (
    <>
      <span className="pk-row-main">
        <span className="pk-row-title">{title}</span>
        {meta ? <span className="pk-row-meta">{meta}</span> : null}
      </span>
      {time ? <span className="pk-row-time">{time}</span> : null}
    </>
  );
  return (
    <div ref={wrap} className={pkCx("pk-rw", out && "is-out", armed && "is-armed")} data-pk-row={id}>
      <div className="pk-rw-in">
        {phase === "check" || phase === "done" ? <PkSweep kind="row" /> : null}
        {swipes ? (
          <>
            <div className={"pk-reveal is-done " + plate} aria-hidden="true">
              <span className="pk-reveal-mark"><PkIcon name={doneIcon || "check"} size={18} /></span><span className="pk-reveal-word">{doneLabel || "Done"}</span>
            </div>
            <div className="pk-reveal is-later" aria-hidden="true">
              <span className="pk-reveal-word">{laterLabel || "Tomorrow"}</span><span className="pk-reveal-mark"><PkIcon name={laterIcon || "arrow-right"} size={18} /></span>
            </div>
          </>
        ) : null}
        <div ref={row} className={pkCx("pk-row", done && "is-done", late && "is-late", check === false && !lead && "is-flat")} onPointerDown={onPointerDown}>
          {lead || (check === false ? null : (
            <button type="button" className={pkCx("pk-check", done && "is-on")} aria-pressed={done} aria-label={done ? "Mark not done" : "Mark done"}
              onClick={(e) => { e.stopPropagation(); if (onCheck) onCheck(); }}>
              <span className="pk-check-ring">{done ? <PkIcon name="check" size={13} /> : null}</span>
            </button>
          ))}
          {onOpen
            ? <button type="button" className="pk-row-open" onClick={click} aria-label={label}>{body}</button>
            : <span className="pk-row-open is-static">{body}</span>}
          {action ? <span className="pk-row-act">{action}</span> : null}
        </div>
      </div>
    </div>
  );
}

/* PkRow for a task: since / duration / project as meta, the time on the right.
   hideProject drops the project (inside that project's own page). */
function PkTaskRow({ t, late, phase, out, canDone, canLater, onCheck, onOpen, onSwipe, hideProject, action }) {
  const time = mbAt(t) != null ? mbTime(mbAt(t)) : null;
  const line = [late ? "Since " + mbDue(t) : null, mbDur(t.estimatedMinutes) || null].filter(Boolean).join(" · ");
  const project = hideProject ? null : mbPName(t);
  const files = (t.attachments || []).length;
  const meta = line || project || files ? (
    <>
      {late ? <span className="pk-alert-dot" /> : null}
      {line ? <span>{line}</span> : null}
      {project ? <span className="pk-row-proj"><span className="pk-hue" style={{ "--hue": mbHue(project) }} />{project}</span> : null}
      {files ? <span className="pk-row-clip" aria-label={files + (files === 1 ? " attachment" : " attachments")}><PkIcon name="paperclip" size={12} />{files}</span> : null}
    </>
  ) : null;
  return (
    <PkRow id={t.id} title={t.title} meta={meta} time={time} done={t.done} late={late} phase={phase} out={out} canDone={canDone} canLater={canLater} action={action}
      onCheck={() => onCheck && onCheck(t)} onOpen={() => onOpen && onOpen(t)} onSwipe={onSwipe} />
  );
}

/* A row leaves in steps: (check shows / thrown off the edge) → folds shut →
   commit(t, kind) writes the change (and the numbers roll). */
function usePkExit(commit) {
  const [phase, setPhase] = React.useState({}); /* id → "check" | "done" | "later" */
  const [out, setOut] = React.useState({});     /* id → folding away */
  const cRef = React.useRef(commit); cRef.current = commit;
  const del = (m, k) => { const n = Object.assign({}, m); delete n[k]; return n; };
  const exit = (t, kind) => {
    if (phase[t.id]) return;
    if (pkReduced()) { cRef.current(t, kind); return; }
    setPhase((m) => Object.assign({}, m, { [t.id]: kind }));
    const hold = kind === "check" ? 360 : 190;
    window.setTimeout(() => setOut((m) => Object.assign({}, m, { [t.id]: 1 })), hold);
    window.setTimeout(() => { cRef.current(t, kind); setPhase((m) => del(m, t.id)); setOut((m) => del(m, t.id)); }, hold + 260);
  };
  return { phase: phase, out: out, exit: exit };
}

/* ══ Chips with blurred edges ═════════════════════════════════════════════ */
function PkChips({ children, className, label }) {
  const box = React.useRef(null), sc = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = sc.current, b = box.current; if (!el || !b) return undefined;
    const read = () => {
      const max = el.scrollWidth - el.clientWidth;
      b.setAttribute("data-pk-left", el.scrollLeft > 2 ? "1" : "0");
      b.setAttribute("data-pk-right", el.scrollLeft < max - 2 ? "1" : "0");
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(read) : null;
    if (ro) { ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild); }
    return () => { el.removeEventListener("scroll", read); if (ro) ro.disconnect(); };
  });
  return (
    <div ref={box} className={pkCx("pk-chips", className)} data-pk-left="0" data-pk-right="0">
      <div ref={sc} className="pk-chips-scroll" role={label ? "group" : undefined} aria-label={label}>{children}</div>
      <span className="pk-edge is-left" aria-hidden="true"><span className="pk-edge-blur is-1" /><span className="pk-edge-blur is-2" /><span className="pk-edge-wash" /></span>
      <span className="pk-edge is-right" aria-hidden="true"><span className="pk-edge-blur is-1" /><span className="pk-edge-blur is-2" /><span className="pk-edge-wash" /></span>
    </div>
  );
}

/* ══ Fog that drifts like the sky ═════════════════════════════════════════
   The halftone dots in a fog band (the screen's bottom band, menu A's card)
   drift slowly right → left and bob a hair, all the time the band is seen
   (the owner's exception to "nothing loops at rest", MOTION.md). It is
   compositor-only: each dot layer is a little wider than the band and its
   `translate` (the drift, 8 dot cells per cycle, so the loop is seamless)
   and `transform` (the bob) are CSS animations (phone-kit.css pk-fog-drift /
   pk-fog-bob). They run only while the band is live: on screen, the tab
   visible — pkFogLive(el) keeps data-pk-live on the band; PkScreen also
   pauses them while its fog is faded out (data-pk-fog-on). Reduced motion =
   still dots. The scroll no longer moves them.
   pkFogLive(el) → cleanup ; marks el data-pk-live="1" | "0". */
function pkFogLive(el) {
  if (!el || typeof document === "undefined") return undefined;
  let seen = true;
  const sync = () => { const v = seen && !document.hidden ? "1" : "0"; if (el.getAttribute("data-pk-live") !== v) el.setAttribute("data-pk-live", v); };
  const io = typeof IntersectionObserver === "function" ? new IntersectionObserver((es) => { seen = es[es.length - 1].isIntersecting; sync(); }) : null;
  if (io) io.observe(el);
  document.addEventListener("visibilitychange", sync);
  sync();
  return () => { if (io) io.disconnect(); document.removeEventListener("visibilitychange", sync); };
}

/* ══ Blur bands ═══════════════════════════════════════════════════════════ */
/* Three stacked backdrop blurs (4 → 10 → 22px), each masked further toward the
   edge, so content melts into frosted glass (menu A's .nva-fog-blur). The
   bands must not sit under an ancestor with opacity / filter / mask, or the
   blur sees nothing — fades go through --pk-*-k on the layers themselves. */
function PkBlurLayers() {
  return <><span className="pk-blur is-1" /><span className="pk-blur is-2" /><span className="pk-blur is-3" /></>;
}
/* The top band alone (PkScreen has one): the progressive blur at the status
   bar that content slides under, faded in through --pk-band on an ancestor.
   For a custom scroller (the doc reader, Moodboards' board). */
function PkTopBand({ className }) {
  return <div className={pkCx("pk-topband", className)} aria-hidden="true"><PkBlurLayers /><span className="pk-topband-wash" /></div>;
}
function PkFog({ fogRef }) {
  const own = React.useRef(null);
  const setEl = React.useCallback((n) => {
    own.current = n;
    if (typeof fogRef === "function") fogRef(n); else if (fogRef) fogRef.current = n;
  }, [fogRef]);
  React.useEffect(() => pkFogLive(own.current), []);
  return (
    <div ref={setEl} className="pk-fog" aria-hidden="true" data-pk-live="0">
      <PkBlurLayers />
      <span className="pk-fog-wash" />
      <span className="pk-fog-dots is-1" /><span className="pk-fog-dots is-2" /><span className="pk-fog-dots is-3" />
    </div>
  );
}

/* ══ The screen scaffold ══════════════════════════════════════════════════ */
function PkScreen({ title, compactTitle, sub, right, head, headClass, onPull, screen, scrollRef, tail, className, glyph, glyphKind, children }) {
  const root = React.useRef(null);
  const [scroller, setScroller] = React.useState(null);
  const setSc = React.useCallback((el) => { setScroller(el); if (scrollRef) scrollRef(el); }, [scrollRef]);
  /* On scroll only: the top band fades in, the large title hands over to the
     compact one, the bottom fog shows while there is content under it. */
  React.useLayoutEffect(() => {
    const el = scroller, r = root.current; if (!el || !r) return undefined;
    let last = "";
    const read = () => {
      const y = el.scrollTop;
      const band = pkClamp(y / 24, 0, 1), kl = pkClamp((y - 6) / 22, 0, 1), kt = pkClamp((y - 20) / 24, 0, 1);
      const left = el.scrollHeight - el.clientHeight - y;
      const fog = pkClamp((left - 40) / 60, 0, 1);
      const key = band.toFixed(3) + kl.toFixed(3) + kt.toFixed(3) + fog.toFixed(3);
      if (key === last) return;
      last = key;
      r.style.setProperty("--pk-band", band.toFixed(3));
      r.style.setProperty("--pk-kl", kl.toFixed(3));
      r.style.setProperty("--pk-kt", kt.toFixed(3));
      r.style.setProperty("--pk-fog-k", fog.toFixed(3));
      r.setAttribute("data-pk-collapsed", kt > 0.5 ? "1" : "0");
      r.setAttribute("data-pk-fog-on", fog > 0.01 ? "1" : "0"); /* the fog's drift pauses while it is faded out */
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(read) : null;
    if (ro) { ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild); }
    return () => { el.removeEventListener("scroll", read); if (ro) ro.disconnect(); };
  }, [scroller]);
  const small = compactTitle != null ? compactTitle : typeof title === "string" ? title : "";
  return (
    <div ref={root} className={pkCx("pk-screen", className)} data-pk-screen={screen || ""} data-pk-collapsed="0" data-pk-fog-on="0">
      <div ref={setSc} className="pk-scroll">
        <div className="pk-content">
          {title != null || sub || head ? (
            <header className={pkCx("pk-head", headClass)}>
              {title != null && (glyph || glyphKind) && right ? (
                /* a glyph and a control: the tile and the control share a row
                   above the title, so a long title keeps the full width */
                <>
                  <div className="pk-head-row is-top">
                    <PkGlyph place={glyph} kind={glyphKind} size="m" className="pk-head-glyph" />
                    {right}
                  </div>
                  <div className="pk-head-row"><h1 className="pk-title">{title}</h1></div>
                </>
              ) : title != null ? (
                <div className="pk-head-row">
                  {glyph || glyphKind ? <PkGlyph place={glyph} kind={glyphKind} size="l" className="pk-head-glyph" /> : null}
                  <h1 className="pk-title">{title}</h1>
                  {right || null}
                </div>
              ) : null}
              {sub ? <p className="pk-sub">{sub}</p> : null}
              {head || null}
            </header>
          ) : null}
          {children}
          {tail === false ? null : <div className="pk-tail" />}
        </div>
      </div>
      <PkTopBand />
      {small ? <div className="pk-compact" aria-hidden="true">{glyph || glyphKind ? <PkGlyph place={glyph} kind={glyphKind} size={22} className="pk-compact-glyph" /> : null}<span className="pk-compact-title">{small}</span></div> : null}
      <PkFog />
      {onPull ? <PkPullDown scroller={scroller} {...onPull} /> : null}
    </div>
  );
}

/* ══ Scrim: the screen behind, blurred harder toward the edges ══════════════
   k (0..1) arrives as --pk-scrim-k on the layers (never as opacity on a
   parent of the blur). */
function PkScrim({ scrimRef, onClick, open }) {
  return (
    <div ref={scrimRef} className={pkCx("pk-scrim", open && "is-open")} onClick={onClick} aria-hidden="true">
      <span className="pk-scrim-blur is-1" /><span className="pk-scrim-blur is-2" /><span className="pk-scrim-tint" />
    </div>
  );
}

/* ══ Pull down at the top: a plate drops from the top edge with one field —
   search what is there, or add it. The finger moves it 1:1 to its height,
   then a rubber band; letting go springs it open or shut. ══════════════════ */
function PkPullDown({ scroller, search, onPick, onAdd, placeholder, hint, addLabel }) {
  const plate = usePkPlate();
  const plateEl = React.useRef(null), body = React.useRef(null), scrim = React.useRef(null), input = React.useRef(null), hintEl = React.useRef(null), skyEng = React.useRef(null);
  const S = React.useRef({ y: { x: 0, v: 0 }, target: 0, raf: 0, last: 0, H: 220, drag: null, open: false, ended: 0, skyOn: false }).current;
  const sky = usePkSkyMood();
  const [open, setOpenRaw] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [armed, setArmed] = React.useState(false);
  const ARM = 96;

  const paint = React.useCallback(() => {
    const el = plateEl.current; if (!el) return;
    const H = S.H, y = Math.max(0, S.y.x);
    const shown = Math.min(y, H);
    const over = Math.max(0, y - H);
    const clip = "inset(0 0 " + (H - shown).toFixed(1) + "px 0 round 0 0 34px 34px)";
    el.style.clipPath = clip; el.style.webkitClipPath = clip;
    el.style.transform = over ? "translateY(" + over.toFixed(1) + "px)" : "";
    el.style.visibility = y < 0.5 ? "hidden" : "visible";
    /* the sky strip draws only while the plate is out */
    if ((y >= 0.5) !== S.skyOn) { S.skyOn = y >= 0.5; if (skyEng.current) skyEng.current.park(!S.skyOn); }
    const k = Math.min(1, shown / H);
    if (body.current) { body.current.style.opacity = Math.min(1, Math.max(0, (shown - 40) / 70)).toFixed(3); body.current.style.transform = "translateY(" + ((1 - k) * -14).toFixed(1) + "px)"; }
    if (scrim.current) scrim.current.style.setProperty("--pk-scrim-k", k.toFixed(3));
    if (hintEl.current) {
      hintEl.current.style.opacity = S.drag && S.drag.kind === "pull" && !S.open ? Math.min(1, shown / 60).toFixed(3) : "0";
      hintEl.current.style.transform = "translate(-50%," + (Math.max(56, y) + 12).toFixed(1) + "px)";
    }
  }, []);
  const run = React.useCallback(() => {
    if (S.raf) return;
    S.last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.034, (now - S.last) / 1000); S.last = now;
      /* settle in px, not in menu A's fractions: a shut plate is put away
         (hidden, no hit area) as soon as it is within half a pixel */
      const still = pkStep(S.y, S.target, dt, 380, 0.8) || (Math.abs(S.y.x - S.target) < 0.5 && Math.abs(S.y.v) < 30);
      paint();
      if (still) { S.y.x = S.target; S.y.v = 0; paint(); S.raf = 0; return; }
      S.raf = requestAnimationFrame(tick);
    };
    S.raf = requestAnimationFrame(tick);
  }, [paint]);
  const setOpen = React.useCallback((v, vel) => {
    S.open = v; setOpenRaw(v);
    S.target = v ? S.H : 0;
    if (vel != null) S.y.v = vel;
    if (!v) { setQ(""); if (input.current) input.current.blur(); }
    if (pkReduced()) { S.y.x = S.target; S.y.v = 0; paint(); return; }
    run();
  }, [paint, run]);

  /* The plate's height follows what it holds (results come and go). */
  React.useLayoutEffect(() => {
    const el = plateEl.current; if (!el) return undefined;
    const m = () => { S.H = el.scrollHeight; if (S.open && !S.raf && !S.drag) { S.y.x = S.target = S.H; } else if (S.open) S.target = S.H; paint(); };
    m();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(m) : null;
    if (ro) ro.observe(body.current);
    return () => { if (ro) ro.disconnect(); cancelAnimationFrame(S.raf); S.raf = 0; };
  }, [paint]);
  React.useEffect(() => { if (open && input.current) { try { input.current.focus({ preventScroll: true }); } catch (e) { input.current.focus(); } } }, [open]);
  React.useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, setOpen]);

  /* Gestures. Mouse and pen through pointer events, touch through touch
     events (so a pull at the top can stop the browser's own overscroll). */
  const begin = (x, y, from) => {
    cancelAnimationFrame(S.raf); S.raf = 0;
    S.drag = { x0: x, y0: y, kind: null, from: from, base: S.y.x, s: [[performance.now(), y]] };
  };
  const moveTo = (x, y, ev) => {
    const d = S.drag; if (!d) return;
    const dx = x - d.x0, dy = y - d.y0;
    const now = performance.now();
    d.s.push([now, y]); while (d.s.length > 2 && now - d.s[0][0] > 90) d.s.shift();
    if (!d.kind) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) <= Math.abs(dx)) { d.kind = "none"; return; }
      if (d.from === "plate") d.kind = "pull";
      else d.kind = dy > 0 && (!scroller || scroller.scrollTop <= 0) ? "pull" : "none";
      if (d.kind !== "pull") { if (S.y.x !== S.target) run(); return; }
    }
    if (d.kind !== "pull") return;
    if (ev && ev.cancelable) ev.preventDefault();
    if (!d.cleared) { d.cleared = true; try { window.getSelection().removeAllRanges(); } catch (e) { /* none */ } }
    const H = S.H;
    const raw = d.base + dy;
    S.y.x = raw <= 0 ? 0 : raw <= H ? raw : H + pkRubber(raw - H, 70);
    S.y.v = 0;
    const a = !S.open && S.y.x >= ARM;
    if (a !== d.armed) { d.armed = a; setArmed(a); }
    paint();
  };
  const finish = () => {
    const d = S.drag; S.drag = null;
    if (!d) return;
    if (d.kind) S.ended = performance.now();
    setArmed(false);
    if (d.kind !== "pull") { paint(); return; }
    const a = d.s[0], b = d.s[d.s.length - 1];
    const v = b[0] - a[0] > 0 ? (b[1] - a[1]) / (b[0] - a[0]) : 0; /* px/ms, + down */
    const vel = Math.max(-4000, Math.min(4000, v * 1000));
    if (!S.open) setOpen(S.y.x >= ARM || (v > 0.5 && S.y.x > 30), vel);
    else setOpen(!(S.y.x < S.H - 60 || v < -0.5), vel);
  };
  const mvRef = React.useRef(null), endRef = React.useRef(null);
  mvRef.current = moveTo; endRef.current = finish;

  React.useEffect(() => {
    const sc = scroller; if (!sc) return undefined;
    const pd = (e) => {
      if (e.pointerType === "touch" || (e.button != null && e.button > 0) || S.open) return;
      if (sc.scrollTop > 0) return;
      begin(e.clientX, e.clientY, "screen");
      pkTrack((ev) => mvRef.current(ev.clientX, ev.clientY, ev), () => endRef.current());
    };
    const ts = (e) => { if (S.open || sc.scrollTop > 0 || e.touches.length !== 1) return; begin(e.touches[0].clientX, e.touches[0].clientY, "screen"); };
    const tm = (e) => { if (S.drag && e.touches.length === 1) mvRef.current(e.touches[0].clientX, e.touches[0].clientY, e); };
    const te = () => { if (S.drag) endRef.current(); };
    /* A pull is not a tap: the click that follows it is swallowed. */
    const ck = (e) => { if (performance.now() - S.ended < 300) { e.stopPropagation(); e.preventDefault(); } };
    sc.addEventListener("pointerdown", pd);
    sc.addEventListener("touchstart", ts, { passive: true });
    sc.addEventListener("touchmove", tm, { passive: false });
    sc.addEventListener("touchend", te); sc.addEventListener("touchcancel", te);
    sc.addEventListener("click", ck, true);
    return () => {
      sc.removeEventListener("pointerdown", pd); sc.removeEventListener("touchstart", ts); sc.removeEventListener("touchmove", tm);
      sc.removeEventListener("touchend", te); sc.removeEventListener("touchcancel", te); sc.removeEventListener("click", ck, true);
    };
  }, [scroller]);

  /* Dragging the open plate up puts it away. */
  const onPlateDown = (e) => {
    if (!S.open || (e.button != null && e.button > 0)) return;
    if (e.target.closest && e.target.closest("input, button")) return;
    begin(e.clientX, e.clientY, "plate");
    pkTrack((ev) => mvRef.current(ev.clientX, ev.clientY, ev), () => endRef.current());
  };

  const query = q.trim();
  const hits = query && search ? search(query) : [];
  /* Enter adds; with nothing to add (Mail, Trash …) it opens the first hit. */
  const add = () => {
    if (!query) return;
    if (onAdd) { onAdd(query); setOpen(false); return; }
    if (hits.length && onPick) { setOpen(false); onPick(hits[0]); }
  };
  const verb = onAdd ? "search or add" : "search";

  return (
    <>
      <PkScrim scrimRef={scrim} open={open} onClick={() => setOpen(false)} />
      <div ref={plateEl} className={"pk-pull " + plate} data-pk-pull={open ? "open" : "shut"} aria-hidden={open ? undefined : "true"} onPointerDown={onPlateDown}>
        {window.PxSky ? (
          <div className="pk-pull-sky" data-px-scope="" aria-hidden="true">
            <window.PxSky horizon="none" fps={15} mood={sky.mood} dark={sky.dark} parked engine={skyEng} />
          </div>
        ) : null}
        <div ref={body} className="pk-pull-body">
          <div className="pk-pull-status" />
          <div className="pk-pull-field">
            <PkIcon name="search" size={22} />
            <input ref={input} className="pk-pull-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder || (onAdd ? "Search or add…" : "Search…")} aria-label={placeholder || (onAdd ? "Search or add" : "Search")}
              tabIndex={open ? 0 : -1} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} data-pk-pull-input />
          </div>
          {hits.length ? (
            <div className="pk-pull-hits">
              {hits.map((h) => (
                <button key={h.id} type="button" className={pkCx("pk-pull-hit", h.done && "is-done")} tabIndex={open ? 0 : -1}
                  onClick={() => { setOpen(false); if (onPick) onPick(h); }}>
                  <span className="pk-pull-hit-title">{h.title}</span>
                  {h.meta ? <span className="pk-pull-hit-meta">{h.meta}</span> : null}
                </button>
              ))}
            </div>
          ) : <p className="pk-pull-none">{query ? "Nothing called that yet." : hint || (onAdd ? "Tasks, by any word in their title. Enter adds it to today." : "By any word.")}</p>}
          <div className="pk-pull-actions">
            <PkButton tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>Cancel</PkButton>
            {onAdd ? (
              <PkButton kind="primary" icon="plus" tabIndex={open ? 0 : -1} disabled={!query} onClick={add} data-pk-pull-add>
                {addLabel ? addLabel(query) : query ? "Add “" + query + "”" : "Add to today"}
              </PkButton>
            ) : null}
          </div>
          <span className="pk-pull-grab" aria-hidden="true" />
        </div>
      </div>
      <span ref={hintEl} className={pkCx("pk-pull-hint", armed && "is-armed")} aria-hidden="true">{armed ? "Let go to " + verb : "Pull to " + verb}</span>
    </>
  );
}

/* Menu A's pill, in the px of a layer that covers the phone's screen (for
   PkSheet from=…). null when the menu is not there (signed out, a test page). */
function pkPillRect(layerEl) {
  if (!layerEl || typeof nvaShape !== "function") return null;
  const frame = layerEl.closest("[data-v2p-frame]") || document;
  const nva = frame.querySelector(".nva"), body = nva && nva.querySelector(".nva-body");
  const St = nva && nva.__nva;
  if (!St || !St.g || !body) return null;
  const s = nvaShape(St.g, 0, 0);
  const a = nva.getBoundingClientRect(), b = layerEl.getBoundingClientRect();
  return { x: a.left - b.left + body.offsetLeft + s.x, y: a.top - b.top + body.offsetTop + s.y, w: s.w, h: s.h, r: s.r };
}

/* ══ The sheet ════════════════════════════════════════════════════════════
   y = how far the sheet sits below its open position, in px. Open is the
   first detent (or 0 when it fits its content); shut is its height + 24. A
   drag follows the finger 1:1 downward and meets a rubber band upward past
   the highest detent; letting go projects the finger's speed and settles on
   the nearest detent — or shut, which calls onClose. */
function PkSheet({ open, onClose, title, meta, head, footer, detents, label, className, bodyClass, from, onShut, children }) {
  const layer = React.useRef(null), sheet = React.useRef(null), scrim = React.useRef(null), bodyEl = React.useRef(null), footEl = React.useRef(null), morphEl = React.useRef(null);
  const plateCls = usePkInverse();
  const fromRef = React.useRef(from); fromRef.current = from;
  const shutRef = React.useRef(onShut); shutRef.current = onShut;
  const S = React.useRef({ y: { x: 9999, v: 0 }, target: 9999, raf: 0, last: 0, H: 0, FH: 0, drag: null, open: false, shown: false, wasHidden: true, m: { k: { x: 1, v: 0 }, raf: 0, rect: null } }).current;
  const closeRef = React.useRef(onClose); closeRef.current = onClose;
  const ds = (detents && detents.length ? detents.slice().sort((a, b) => a - b) : null);
  const dsKey = ds ? ds.join(",") : "";
  S.ds = ds;

  /* stops (px of y), from the highest open position down; the last is shut */
  const stops = () => {
    const shut = S.H + 24;
    if (!ds) return [0, shut];
    const top = ds[ds.length - 1];
    return ds.slice().reverse().map((d) => Math.max(0, (top - d) * S.FH)).concat([shut]);
  };
  const firstStop = () => (ds ? Math.max(0, (ds[ds.length - 1] - ds[0]) * S.FH) : 0);
  const paint = React.useCallback(() => {
    const el = sheet.current; if (!el) return;
    const y = S.y.x;
    el.style.transform = "translate3d(0," + y.toFixed(1) + "px,0)";
    const k = S.H ? pkClamp(1 - y / (S.H + 24), 0, 1) : 0;
    if (scrim.current) scrim.current.style.setProperty("--pk-scrim-k", k.toFixed(3));
    const hidden = y >= S.H + 23 && !S.open && !S.drag && !S.m.raf;
    if (layer.current) { layer.current.style.visibility = hidden ? "hidden" : "visible"; layer.current.setAttribute("data-pk-y", Math.round(y)); }
    if (hidden !== S.wasHidden) { S.wasHidden = hidden; if (hidden && shutRef.current) shutRef.current(); }
    /* At a lower detent the sheet's bottom is below the screen: the footer
       rides up to stay on screen (down to the lowest detent; past it, while
       closing, it leaves with the sheet), and the body gets the room. */
    const d = S.ds, low = d && d.length > 1 ? (d[d.length - 1] - d[0]) * S.FH : 0;
    const pin = low > 0 ? pkClamp(y, 0, low) : 0;
    if (Math.abs(pin - (S.pin || 0)) > 0.25 || (pin === 0 && S.pin)) {
      S.pin = pin;
      if (footEl.current) { footEl.current.style.transform = pin ? "translate3d(0," + (-pin).toFixed(1) + "px,0)" : ""; footEl.current.classList.toggle("is-pinned", pin > 0.5); }
      if (bodyEl.current && footEl.current) bodyEl.current.style.paddingBottom = pin ? "calc(30px + " + pin.toFixed(1) + "px)" : "";
    }
  }, []);
  const run = React.useCallback(() => {
    if (S.raf) return;
    S.last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.034, (now - S.last) / 1000); S.last = now;
      pkStep(S.y, S.target, dt, 420, 0.86);
      const still = Math.abs(S.y.x - S.target) < 0.5 && Math.abs(S.y.v) < 8;
      if (still) { S.y.x = S.target; S.y.v = 0; S.raf = 0; paint(); return; }
      paint();
      S.raf = requestAnimationFrame(tick);
    };
    S.raf = requestAnimationFrame(tick);
  }, [paint]);
  const go = React.useCallback((target, vel) => {
    S.target = target;
    if (vel != null) S.y.v = vel;
    if (pkReduced()) { cancelAnimationFrame(S.raf); S.raf = 0; S.y.x = target; S.y.v = 0; paint(); return; }
    run();
  }, [paint, run]);
  /* The morph (from): the sheet grows out of a rect on the screen — menu A's
     pill for the composer — and goes back into it. k 0 = the rect, 1 = the
     sheet; the sheet sits at its open position while the clip and corners
     travel, the plate-coloured wash fades as it grows. A drag still closes
     the plain way (it slides). */
  const morphPaint = () => {
    const el = sheet.current, M = S.m, r = M.rect; if (!el) return;
    if (!r || M.k.x >= 0.999) {
      el.style.clipPath = ""; el.style.webkitClipPath = "";
      if (morphEl.current) morphEl.current.style.opacity = "0";
      el.style.removeProperty("--pk-morph-k");
      return;
    }
    const k = pkClamp(M.k.x, 0, 1.06), H = S.H, LW = layer.current ? layer.current.clientWidth : 0;
    const top0 = r.y - (S.FH - H), lerp = (a, b) => a + (b - a) * k;
    const t = Math.max(0, lerp(top0, 0)), b = Math.max(0, lerp(S.FH - r.y - r.h, 0)), l = Math.max(0, lerp(r.x, 0)), rt = Math.max(0, lerp(LW - r.x - r.w, 0));
    const rt0 = Math.max(0, lerp(r.r, 34)), rb = Math.max(0, lerp(r.r, 0));
    const clip = "inset(" + t.toFixed(1) + "px " + rt.toFixed(1) + "px " + b.toFixed(1) + "px " + l.toFixed(1) + "px round " + rt0.toFixed(1) + "px " + rt0.toFixed(1) + "px " + rb.toFixed(1) + "px " + rb.toFixed(1) + "px)";
    el.style.clipPath = clip; el.style.webkitClipPath = clip;
    el.style.setProperty("--pk-morph-k", pkClamp((k - 0.35) / 0.55, 0, 1).toFixed(3));
    if (morphEl.current) morphEl.current.style.opacity = pkClamp(1 - k * 1.3, 0, 1).toFixed(3);
    if (scrim.current) scrim.current.style.setProperty("--pk-scrim-k", pkClamp(k, 0, 1).toFixed(3));
  };
  const morph = (to, done) => {
    const M = S.m;
    cancelAnimationFrame(M.raf); M.raf = 0;
    if (layer.current) layer.current.classList.add("is-morphing");
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.034, (now - last) / 1000); last = now;
      const still = pkStep(M.k, to, dt, to ? 170 : 380, to ? 0.84 : 1);
      morphPaint();
      if (still || (to === 0 && M.k.x <= 0.002)) { M.k.x = to; M.k.v = 0; M.raf = 0; if (layer.current) layer.current.classList.remove("is-morphing"); morphPaint(); if (done) done(); return; }
      M.raf = requestAnimationFrame(tick);
    };
    M.raf = requestAnimationFrame(tick);
  };
  /* Measure the sheet. A closed sheet (or one on its way down) keeps its shut
     position in step with its height: new detents, or content that grew while
     it was put away, must not leave its top edge peeking over the screen. */
  const measure = () => {
    const el = sheet.current, ly = layer.current; if (!el || !ly) return;
    const oldShut = S.H + 24, wasShut = !S.open && S.target >= oldShut - 0.5;
    S.FH = ly.clientHeight;
    if (S.ds) el.style.height = Math.round(S.ds[S.ds.length - 1] * S.FH) + "px";
    else el.style.height = "";
    S.H = el.offsetHeight;
    if (wasShut && S.H + 24 !== oldShut) {
      S.target = S.H + 24;
      if (!S.raf && !S.m.raf && !S.drag) { S.y.x = S.target; S.y.v = 0; paint(); }
    }
  };

  React.useLayoutEffect(() => {
    measure();
    const was = S.open;
    S.open = !!open;
    const rectOf = () => { const f = fromRef.current; const r = typeof f === "function" ? f(layer.current) : f; return r && r.w ? r : null; };
    if (open) {
      const r = !was && !pkReduced() ? rectOf() : null;
      if (r) {
        /* grow out of the rect: at the open position at once, the clip travels */
        cancelAnimationFrame(S.raf); S.raf = 0;
        S.y.x = S.target = firstStop(); S.y.v = 0;
        S.m.rect = r; S.m.k.x = 0; S.m.k.v = 0;
        paint(); morphPaint();
        morph(1, () => { S.m.rect = null; morphPaint(); });
      } else {
        if (S.y.x > S.H + 24 || S.y.x === 9999) S.y.x = S.H + 24;
        go(firstStop());
      }
      if (sheet.current) { try { sheet.current.focus({ preventScroll: true }); } catch (e) { /* old engines */ } }
    } else if (!was || S.y.x >= S.H + 23.5) {
      /* already shut (a re-render with other detents): straight to the shut
         position, nothing slides into view */
      cancelAnimationFrame(S.raf); S.raf = 0;
      if (S.m.raf) { cancelAnimationFrame(S.m.raf); S.m.raf = 0; S.m.rect = null; S.m.k.x = 1; morphPaint(); }
      S.y.x = S.target = S.H + 24; S.y.v = 0; paint();
    }
    else {
      /* closed by a tap, Esc or the primary action while it sits open: back
         into the rect; closed by a drag: it slides */
      const r = was && !pkReduced() && S.y.x < 40 && !S.drag ? rectOf() : null;
      if (r) {
        cancelAnimationFrame(S.raf); S.raf = 0;
        S.m.rect = r; if (!S.m.raf) { S.m.k.x = 1; S.m.k.v = 0; }
        morph(0, () => { S.m.rect = null; S.y.x = S.target = S.H + 24; S.y.v = 0; S.m.k.x = 1; morphPaint(); paint(); });
      } else { if (S.m.raf) { cancelAnimationFrame(S.m.raf); S.m.raf = 0; S.m.rect = null; S.m.k.x = 1; morphPaint(); } go(S.H + 24); }
    }
  }, [open, dsKey]);
  React.useLayoutEffect(() => {
    const el = sheet.current; if (!el || typeof ResizeObserver !== "function") return undefined;
    const ro = new ResizeObserver(() => { measure(); if (!S.open && !S.raf) { S.y.x = S.target = S.H + 24; paint(); } });
    ro.observe(el);
    return () => { ro.disconnect(); cancelAnimationFrame(S.raf); S.raf = 0; };
  }, [dsKey]);
  React.useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === "Escape") { e.stopPropagation(); closeRef.current && closeRef.current(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);

  const begin = (x, y, inBody) => {
    S.drag = { x0: x, y0: y, base: S.y.x, kind: null, inBody: inBody, s: [[performance.now(), y]] };
  };
  const moveTo = (x, y, ev) => {
    const d = S.drag; if (!d) return;
    const dx = x - d.x0, dy = y - d.y0;
    const now = performance.now();
    d.s.push([now, y]); while (d.s.length > 2 && now - d.s[0][0] > 90) d.s.shift();
    if (!d.kind) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) <= Math.abs(dx)) { d.kind = "none"; return; }
      /* in the body, only a downward drag from the top of its scroll */
      if (d.inBody && (dy < 0 || (bodyEl.current && bodyEl.current.scrollTop > 0))) { d.kind = "none"; return; }
      d.kind = "drag";
      cancelAnimationFrame(S.raf); S.raf = 0;
      if (S.m.raf) { cancelAnimationFrame(S.m.raf); S.m.raf = 0; S.m.rect = null; S.m.k.x = 1; morphPaint(); if (layer.current) layer.current.classList.remove("is-morphing"); }
      if (layer.current) layer.current.classList.add("is-dragging");
    }
    if (d.kind !== "drag") return;
    if (ev && ev.cancelable) ev.preventDefault();
    const raw = d.base + dy;
    S.y.x = raw >= 0 ? raw : -pkRubber(-raw, 40);
    S.y.v = 0;
    paint();
  };
  const finish = () => {
    const d = S.drag; S.drag = null;
    if (layer.current) layer.current.classList.remove("is-dragging");
    if (!d || d.kind !== "drag") return;
    const a = d.s[0], b = d.s[d.s.length - 1];
    const v = b[0] - a[0] > 0 ? (b[1] - a[1]) / (b[0] - a[0]) : 0; /* px/ms, + down */
    const projected = S.y.x + v * 180;
    const st = stops();
    let best = st[0];
    st.forEach((p) => { if (Math.abs(p - projected) < Math.abs(best - projected)) best = p; });
    /* a clear flick down from the lowest detent closes */
    if (v > 0.9 && S.y.x > st[st.length - 2] - 4) best = st[st.length - 1];
    const vel = pkClamp(v * 1000, -4000, 4000);
    go(best, vel);
    if (best === st[st.length - 1] && closeRef.current) closeRef.current();
  };
  const mvRef = React.useRef(null), endRef = React.useRef(null);
  mvRef.current = moveTo; endRef.current = finish;

  const fieldish = (t) => t.closest && t.closest("input, textarea, select, [contenteditable='true'], .pk-no-drag");
  const onPointerDown = (e) => {
    if (!S.open || e.pointerType === "touch" || (e.button != null && e.button > 0) || fieldish(e.target)) return;
    begin(e.clientX, e.clientY, !!(bodyEl.current && bodyEl.current.contains(e.target)));
    pkTrack((ev) => mvRef.current(ev.clientX, ev.clientY, ev), () => endRef.current());
  };
  React.useEffect(() => {
    const el = sheet.current; if (!el) return undefined;
    const ts = (e) => { if (!S.open || e.touches.length !== 1 || fieldish(e.target)) return; begin(e.touches[0].clientX, e.touches[0].clientY, !!(bodyEl.current && bodyEl.current.contains(e.target))); };
    const tm = (e) => { if (S.drag && e.touches.length === 1) mvRef.current(e.touches[0].clientX, e.touches[0].clientY, e); };
    const te = () => { if (S.drag) endRef.current(); };
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", te); el.addEventListener("touchcancel", te);
    return () => { el.removeEventListener("touchstart", ts); el.removeEventListener("touchmove", tm); el.removeEventListener("touchend", te); el.removeEventListener("touchcancel", te); };
  }, []);
  /* a drag is not a tap */
  const swallow = (e) => { const d = S.drag; if (d && d.kind === "drag") { e.stopPropagation(); e.preventDefault(); } };

  return (
    <div ref={layer} className={pkCx("pk-sheet-layer", open && "is-open")} aria-hidden={open ? undefined : "true"} data-pk-sheet={open ? "open" : "shut"}>
      <PkScrim scrimRef={scrim} open={open} onClick={() => onClose && onClose()} />
      <div ref={sheet} className={pkCx("pk-sheet", className)} role="dialog" aria-modal="true" aria-label={label || (typeof title === "string" ? title : undefined)} tabIndex={-1}
        onPointerDown={onPointerDown} onClickCapture={swallow}>
        {from ? <span ref={morphEl} className={"pk-sheet-morph " + plateCls} aria-hidden="true" /> : null}
        <span className="pk-sheet-grab" aria-hidden="true" />
        {head || null}
        {title ? (
          <header className="pk-sheet-head">
            <span className="pk-sheet-title">{title}</span>
            {meta ? <span className="pk-sheet-meta">{meta}</span> : null}
          </header>
        ) : null}
        <div ref={bodyEl} className={pkCx("pk-sheet-body", bodyClass)}>{children}</div>
        {footer ? <div ref={footEl} className="pk-sheet-foot">{footer}</div> : null}
      </div>
    </div>
  );
}


/* ══ Hold → actions (wave 3, 09.10.26; moved here from Mobile.jsx) ═══════
   The phone has no hover and no right-click: what the desktop keeps in a
   context menu is a long press here, and the menu is a glass sheet. */
const PK_HOLD_MS = 450;
/* A hold that turns into a lift owns the finger from then on: the screen's
   own gestures (the pull-down, a row's swipe — window trackers) are ended
   with a pointercancel, and while lifted a window-level capture stops touch
   moves from reaching them (and from scrolling). Returns release(). */
function pkOwnGesture(pid) {
  try { window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: pid })); } catch (e) { /* old browser */ }
  const stop = (e) => { e.stopPropagation(); if (e.cancelable) e.preventDefault(); };
  window.addEventListener("touchmove", stop, { capture: true, passive: false });
  return () => window.removeEventListener("touchmove", stop, { capture: true, passive: false });
}
function PkHold({ onHold, className, children, data, disabled }) {
  const s = React.useRef({ t: 0, fired: false, x: 0, y: 0, id: null, el: null });
  const hold = React.useRef(onHold); hold.current = onHold;
  const clear = () => { window.clearTimeout(s.current.t); s.current.t = 0; };
  React.useEffect(() => clear, []);
  const fire = () => {
    const st = s.current; st.t = 0; st.fired = true;
    try { window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: st.id })); } catch (e) { /* old browser */ }
    try { if (st.el && st.id != null) st.el.setPointerCapture(st.id); } catch (e) { /* the pointer already left */ }
    window.needtPlatform.haptic("light");
    if (hold.current) hold.current();
  };
  const props = disabled ? {} : {
    onPointerDown: (e) => {
      if (e.button) return;
      clear();
      Object.assign(s.current, { x: e.clientX, y: e.clientY, id: e.pointerId, el: e.currentTarget, fired: false });
      s.current.t = window.setTimeout(fire, PK_HOLD_MS);
    },
    onPointerMove: (e) => { if (s.current.t && Math.hypot(e.clientX - s.current.x, e.clientY - s.current.y) > 8) clear(); },
    onPointerUp: clear,
    onPointerCancel: clear,
    onContextMenu: (e) => { e.preventDefault(); if (s.current.fired) return; clear(); s.current.fired = true; if (hold.current) hold.current(); },
    onClickCapture: (e) => { if (s.current.fired) { s.current.fired = false; e.stopPropagation(); e.preventDefault(); } }
  };
  return <div className={pkCx("pk-hold", className)} {...props} {...(data || {})}>{children}</div>;
}
function PkHueTile({ icon, hue, glyph, size }) {
  const px = size || 36;
  if (glyph && window.PkGlyph) return <window.PkGlyph place={glyph} size={px} />;
  const Pin = window.MbmPinMark;
  return (
    <span className="pk-glyph pk-hue-tile" aria-hidden="true" style={{ "--pk-gl": px + "px", "--pk-gl-hue": hue || "var(--v2p-lav)" }}>
      {icon === "pinterest" && Pin ? <Pin size={Math.round(px * 0.5)} /> : <PkIcon name={icon || "circle"} size={Math.round(px * 0.5)} />}
    </span>
  );
}
function PkActions({ acts, onClose }) {
  const last = React.useRef(null); if (acts) last.current = acts;
  const a = acts || last.current;
  return (
    <PkSheet open={!!acts} onClose={onClose} title={a ? a.title : ""} meta={a ? a.meta : null} head={a ? a.head : null} label={(a && a.title) || "Actions"} className="pk-acts-sheet">
      {a ? (
        <div className="pk-acts" role="menu" aria-label={a.title || "Actions"}>
          {a.actions.filter(Boolean).map((x) => (
            <button key={x.label} type="button" role="menuitem" className={pkCx("pk-act", x.danger && "is-danger")} disabled={x.disabled}
              onClick={() => { onClose(); if (x.onClick) x.onClick(); }} {...(x.data || {})}>
              <PkHueTile icon={x.icon} hue={x.danger ? "var(--destructive)" : x.hue} glyph={x.glyph} />
              <span className="pk-act-text">
                <span className="pk-act-label">{x.label}</span>
                {x.hint ? <span className="pk-act-hint">{x.hint}</span> : null}
              </span>
              {x.check ? <span className="pk-act-check"><PkIcon name="check" size={18} /></span> : x.more ? <span className="pk-act-check"><PkIcon name="chevron-right" size={16} /></span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </PkSheet>
  );
}

Object.assign(window, {
  PkHold, PkActions, PkHueTile, pkOwnGesture,
  pkDay, pkTaskPull, pkCx, pkReduced, pkInverse, pkPlateClass, PkTheme, usePkInverse, usePkPlate, usePkExit,
  PkScreen, PkPullDown, PkRow, PkTaskRow, PkNumber, PkSection, PkChips, PkSheet, PkScrim, PkEmpty, PkButton, PkField, PkFog,
  PkBlurLayers, PkTopBand, PkSkyPlate, PkSkyBadge, PkSweep, pkSkyMood,
  PkGlyph, PkGlass, pkDotSweep, pkFogLive, pkPillRect
});
