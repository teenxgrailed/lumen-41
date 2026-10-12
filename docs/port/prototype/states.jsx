/* STATES (07.10.26) — the screen states the design freeze asks for, openable
   by hand: loading, load error, offline (with a queue of waiting edits), no
   access / revoked access, sync conflict, AI unavailable, and account states.
   Nothing here adds a screen: App wraps the routed body in these layers.

   API (shared with Mobile):
     window.needtStates.get(screen?)        → effective state for a screen
        { load: "none"|"loading"|"error", access: "none"|"shared"|"revoked",
          conflict: bool, ai: "none"|"limit"|"down",
          account: "none"|"trial-ending"|"trial-ended"|"payment-failed",
          offline: bool, queue: [{key,label,at}], scope: "global"|"screen",
          pin: bool, screen }
     window.needtStates.set(key, value, screen?)  key as above, plus "scope",
        "pin", "offline". Without screen it writes where scope points.
     window.needtStates.on(cb) → unsubscribe.  cb(get()) on every change.
     .retry(screen?) · .queue(key, label) · .banners(screen?) → banner specs
     · .reset() · .setScreen(name) (App calls this on every route).
   Components: StBanner, StBannerStack, StSkeleton(kind | {kind}), StError,
   StNoAccess, StOfflineIndicator, StScreenLayer, StSwitcher, StLocks.
   Persisted in localStorage "needt.states". ⌥S toggles the switcher. */

const stEmpty = () => ({ scope: "global", pin: false, offline: false, queue: [], global: {}, screens: {} });
const stDefaults = { load: "none", access: "none", conflict: false, ai: "none", account: "none" };
let stData = (function () {
  try {
    const v = JSON.parse(localStorage.getItem("needt.states"));
    if (v && typeof v === "object") return Object.assign(stEmpty(), v, { queue: Array.isArray(v.queue) ? v.queue : [] });
  } catch (e) { /* no storage */ }
  return stEmpty();
})();
let stScreenNow = "today";
const stSubs = new Set();
const stTimers = {};

function stEmit() {
  if (window.needtSync) window.needtSync.set("needt.states", stData);
  const snap = needtStates.get();
  stSubs.forEach((f) => { try { f(snap); } catch (e) { /* a listener's own problem */ } });
}
function stMapFor(screen) {
  if (screen) return stData.screens[screen] || (stData.screens[screen] = {});
  if (stData.scope === "screen") return stData.screens[stScreenNow] || (stData.screens[stScreenNow] = {});
  return stData.global;
}
/* Loading resolves on its own after 1.2 s unless pinned; a Retry always resolves. */
function stArmLoad(map, force) {
  const id = map === stData.global ? "global" : Object.keys(stData.screens).find((k) => stData.screens[k] === map) || "?";
  window.clearTimeout(stTimers[id]);
  if (map.load !== "loading" || (stData.pin && !force)) return;
  stTimers[id] = window.setTimeout(() => {
    if (map.load === "loading" && (force || !stData.pin)) { delete map.load; stEmit(); }
  }, 1200);
}
const stConnLabel = { gcal: "Google Calendar", gmail: "Gmail" };

const needtStates = {
  get(screen) {
    const s = screen || stScreenNow;
    return Object.assign({}, stDefaults, stData.global, stData.screens[s] || {}, {
      screen: s, scope: stData.scope, pin: stData.pin, offline: !!stData.offline, queue: stData.queue.slice()
    });
  },
  set(key, value, screen) {
    if (key === "scope") { stData.scope = value === "screen" ? "screen" : "global"; stEmit(); return; }
    if (key === "pin") {
      stData.pin = !!value;
      if (!stData.pin) { stArmLoad(stData.global); Object.keys(stData.screens).forEach((k) => stArmLoad(stData.screens[k])); }
      stEmit(); return;
    }
    if (key === "offline") {
      const was = !!stData.offline;
      stData.offline = !!value;
      if (was && !stData.offline) {
        const n = stData.queue.length;
        stData.queue = [];
        if (window.toast) window.toast(n ? n + (n === 1 ? " change synced" : " changes synced") : "Back online");
      }
      stEmit(); return;
    }
    if (!(key in stDefaults)) return;
    const prevAccess = needtStates.get(screen).access;
    const map = stMapFor(screen);
    if (map === stData.global) Object.keys(stData.screens).forEach((k) => { delete stData.screens[k][key]; });
    if (value === stDefaults[key] || value == null) delete map[key]; else map[key] = value;
    if (key === "load") stArmLoad(map);
    /* Revoked access is real for the screens that read connections. */
    if (key === "access" && window.connections) {
      const now = needtStates.get(screen).access;
      if (now === "revoked" && prevAccess !== "revoked") { window.connections.set("gcal", "disconnected"); window.connections.set("gmail", "disconnected"); }
      if (now !== "revoked" && prevAccess === "revoked") { window.connections.set("gcal", "connected"); window.connections.set("gmail", "connected"); }
    }
    stEmit();
  },
  on(cb) { stSubs.add(cb); return () => stSubs.delete(cb); },
  setScreen(s) { if (s && s !== stScreenNow) { stScreenNow = s; stEmit(); } },
  /* Error → Retry → loading → content, whatever the pin says. */
  retry(screen) {
    const s = screen || stScreenNow;
    const own = stData.screens[s];
    const map = own && own.load ? own : stData.global;
    map.load = "loading";
    stArmLoad(map, true);
    stEmit();
  },
  /* One waiting edit per thing edited: retyping a doc is one change, not forty. */
  queue(key, label) {
    if (!stData.offline) return;
    const at = Date.now();
    const i = stData.queue.findIndex((q) => q.key === key);
    if (i > -1) stData.queue[i] = { key, label, at };
    else stData.queue = stData.queue.concat([{ key, label, at }]);
    stEmit();
  },
  reset() {
    Object.keys(stTimers).forEach((k) => window.clearTimeout(stTimers[k]));
    const revoked = [stData.global].concat(Object.keys(stData.screens).map((k) => stData.screens[k])).some((m) => m.access === "revoked");
    stData = stEmpty();
    if (revoked && window.connections) { window.connections.set("gcal", "connected"); window.connections.set("gmail", "connected"); }
    stEmit();
  },
  raw() { return JSON.parse(JSON.stringify(stData)); },
  banners(screen) { return stBannerSpecs(screen || stScreenNow, needtStates.get(screen)); }
};
window.needtStates = needtStates;

/* Real network events drive the same flag. */
window.addEventListener("offline", () => needtStates.set("offline", true));
window.addEventListener("online", () => needtStates.set("offline", false));
/* A reload mid-load still resolves. */
window.setTimeout(() => { stArmLoad(stData.global); Object.keys(stData.screens).forEach((k) => stArmLoad(stData.screens[k])); }, 0);

/* Edits made through the doc store count as waiting changes while offline. */
(function stWrapDocs() {
  const d = window.docs;
  if (!d || d.__stWrapped) return;
  const raw = d.patch;
  d.patch = function (id, p) {
    if (stData.offline) {
      const doc = d.find(id) || (d.current && d.current());
      needtStates.queue("doc:" + id, "Edited “" + ((doc && doc.title) || "Untitled") + "”");
    }
    return raw.apply(this, arguments);
  };
  d.__stWrapped = true;
})();
/* Habits keep their own store; a tick while offline waits like any edit. */
(function stWrapHabits() {
  const h = window.habitApi;
  if (!h || h.__stWrapped) return;
  ["toggle", "patch", "rename"].forEach((m) => {
    const raw = h[m];
    if (typeof raw !== "function") return;
    h[m] = function (id) {
      if (stData.offline) { const x = h.find && h.find(id); needtStates.queue("habit:" + id, (m === "toggle" ? "Ticked" : "Edited") + " “" + ((x && x.title) || "a habit") + "”"); }
      return raw.apply(this, arguments);
    };
  });
  h.__stWrapped = true;
})();
function stNoteTask(id, label) {
  if (!stData.offline) return;
  const t = ((window.__app && window.__app.tasksNow) || []).find((x) => String(x.id) === String(id));
  needtStates.queue("task:" + id, label + " “" + ((t && t.title) || "a task") + "”");
}

function useStStates(screen) {
  const [, tick] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => needtStates.on(tick), []);
  return needtStates.get(screen);
}

/* ---------- glyphs: drawn here so Mobile gets the same marks ---------- */
const ST_PATHS = {
  "cloud-off": ["m2 2 20 20", "M5.78 5.78A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.31-.19", "M21.53 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7 7 0 0 0 10 5.07"],
  lock: ["M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z", "M7 11V7a5 5 0 0 1 10 0v4"],
  alert: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 8v4", "M12 16h.01"],
  refresh: ["M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5"],
  card: ["M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M2 10h20"],
  phone: ["M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z", "M12 18h.01"],
  sparkles: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z", "M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"],
  "calendar-x": ["M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M16 2v4", "M8 2v4", "M3 10h18", "m10 14 4 4", "m14 14-4 4"],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 6v6l4 2"],
  layers: ["M12 2 2 7l10 5 10-5-10-5z", "m2 17 10 5 10-5", "m2 12 10 5 10-5"],
  check: ["M20 6 9 17l-5-5"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  diff: ["M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M13 6h3a2 2 0 0 1 2 2v7", "M11 18H8a2 2 0 0 1-2-2V9"]
};
function StGlyph({ name, size }) {
  const z = size || 14;
  return (
    <svg className="state-glyph-svg" aria-hidden="true" width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {(ST_PATHS[name] || []).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/* ---------- copy ---------- */
const ST_NAMES = { today: "Home", tasks: "Tasks", projects: "Projects", calendar: "Calendar", docs: "Documents", doc: "Document", mail: "Mailbox",
  moodboards: "Moodboards", habits: "Habits", templates: "Templates", shared: "Shared", trash: "Trash", connections: "Connections", settings: "Settings", chat: "Ask Needt" };
const ST_WHAT = { today: "your day", tasks: "your tasks", projects: "your projects", calendar: "your calendar", docs: "your documents", doc: "this document",
  mail: "your mail", moodboards: "your moodboards", habits: "your habits", templates: "templates", shared: "what's shared with you", trash: "Trash",
  connections: "your connections", settings: "your settings", chat: "this conversation" };
const ST_KIND = { today: "list", tasks: "list", projects: "list", mail: "list", habits: "list", trash: "list", settings: "list",
  docs: "grid", templates: "grid", shared: "grid", moodboards: "grid", calendar: "week", doc: "page", connections: "cards", chat: "chat" };
function stErrorText(screen) {
  if (screen === "calendar") return "Couldn't load your calendar — Google Calendar didn't answer.";
  if (screen === "mail") return "Couldn't load your mail — Gmail didn't answer.";
  return "Couldn't load " + (ST_WHAT[screen] || "this") + " — the server didn't answer.";
}
const ST_DIFF = [
  { t: "same", s: "Launch on 14 Oct with the black and bone colourways." },
  { t: "del", s: "Samples arrive Thursday before 12:00." },
  { t: "add", s: "Samples arrive Friday morning — Jonas confirmed." },
  { t: "add", s: "Add the tank graphic to the lookbook." }
];

function stBannerSpecs(screen, st) {
  const out = [];
  const plans = () => window.openPaywall && window.openPaywall();
  if (st.account === "payment-failed") out.push({ id: "payment", tone: "attention", icon: "card",
    title: "Payment failed — update your card to keep Pro", body: "The charge on 5 Oct didn't go through. Pro stays on for 7 more days.",
    actions: [{ label: "Update payment", onClick: plans }] });
  if (st.access === "revoked" && (screen === "calendar" || screen === "mail" || screen === "today")) {
    const id = screen === "mail" ? "gmail" : "gcal";
    out.push({ id: "revoked", tone: "attention", icon: "calendar-x",
      title: stConnLabel[id] + " access was revoked", body: screen === "mail" ? "New mail stopped arriving at 09:14. What's here is still readable." : "Events stopped syncing at 09:14. Your tasks still work.",
      actions: [{ label: "Reconnect", busyLabel: "Reconnecting", onClick: (done) => {
        if (window.connections) window.connections.set(id, "connecting");
        window.setTimeout(() => {
          if (window.connections) { window.connections.set("gcal", "connected"); window.connections.set("gmail", "connected"); }
          needtStates.set("access", "none", (stData.screens[screen] || {}).access ? screen : undefined);
          if (window.toast) window.toast(stConnLabel[id] + " reconnected");
          if (done) done();
        }, 1200);
      } }] });
  }
  if (st.conflict && screen === "doc") out.push({ id: "conflict", tone: "neutral", icon: "phone",
    title: "This doc changed on your iPhone 2 min ago", body: "Both versions are kept until you choose.", diff: ST_DIFF,
    actions: [
      { label: "Keep both", onClick: () => { const d = window.docs && window.docs.current(); if (d && window.docs.create) window.docs.create({ title: (d.title || "Untitled") + " (iPhone)", body: d.body }); needtStates.set("conflict", false); window.toast && window.toast("Kept both — the iPhone version is a new doc"); } },
      { label: "Use theirs", onClick: () => { needtStates.set("conflict", false); window.toast && window.toast("Using the iPhone version"); } },
      { label: "Use mine", onClick: () => { needtStates.set("conflict", false); window.toast && window.toast("Kept your version — the iPhone will update"); } }
    ] });
  if (screen === "today" && st.ai === "limit") out.push({ id: "ai", tone: "neutral", icon: "clock",
    title: "AI paused until 14:00", body: "Plan my day and Ask Needt come back then — your tasks and calendar still work." });
  if (screen === "today" && st.ai === "down") out.push({ id: "ai", tone: "neutral", icon: "cloud-off",
    title: "AI is temporarily unavailable — your tasks and calendar still work",
    actions: [{ label: "Retry", busyLabel: "Retrying", onClick: (done) => window.setTimeout(() => { needtStates.set("ai", "none", (stData.screens.today || {}).ai ? "today" : undefined); if (done) done(); }, 1200) }] });
  if (st.account === "trial-ended") out.push({ id: "trial", tone: "neutral", icon: "lock",
    title: "Trial ended — AI planning and themes are now read-only", body: "Everything you made stays yours and editable.",
    actions: [{ label: "See plans", onClick: plans }] });
  if (st.account === "trial-ending") out.push({ id: "trial", tone: "neutral", icon: "sparkles",
    title: "Pro trial ends in 3 days", actions: [{ label: "Upgrade", onClick: plans }] });
  return out;
}

/* ---------- banner ---------- */
function StBanner({ tone, icon, title, body, actions, diff, onDismiss, compact }) {
  const [busy, setBusy] = React.useState(-1);
  const [diffOpen, setDiffOpen] = React.useState(false);
  const wrap = React.useRef(null);
  React.useEffect(() => {
    if (!diffOpen) return undefined;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setDiffOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setDiffOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [diffOpen]);
  const red = tone === "attention";
  return (
    <div ref={wrap} className={"st-banner" + (red ? " is-attention" : "") + (compact ? " is-compact" : "")} role={red ? "alert" : "status"} data-st-banner={tone || "neutral"}>
      <span className="st-banner-icon"><StGlyph name={icon || "alert"} size={15} /></span>
      <span className="st-banner-text">
        <span className="st-banner-title">{title}</span>
        {body ? <span className="st-banner-body">{body}</span> : null}
      </span>
      <span className="st-banner-actions">
        {diff ? (
          <button type="button" className="nx-btn nx-btn-text nx-btn-sm" aria-expanded={diffOpen} data-st-diff-toggle onClick={() => setDiffOpen((v) => !v)}>
            <StGlyph name="diff" size={13} />See changes
          </button>
        ) : null}
        {(actions || []).map((a, i) => (
          <button key={a.label} type="button" className="nx-btn nx-btn-secondary nx-btn-sm" disabled={busy > -1} data-st-action={a.label}
            onClick={() => { if (a.busyLabel) { setBusy(i); a.onClick(() => setBusy(-1)); } else a.onClick(); }}>
            {busy === i ? <span className="st-spin" aria-hidden="true" /> : null}{busy === i ? a.busyLabel : a.label}
          </button>
        ))}
        {onDismiss ? <button type="button" className="nx-btn nx-btn-text nx-btn-sm state-banner-dismiss" aria-label="Dismiss" onClick={onDismiss}><StGlyph name="x" size={13} /></button> : null}
      </span>
      {diff && diffOpen ? (
        <div className="st-diff nx-pop is-right" data-st-diff>
          <div className="st-diff-head"><StGlyph name="phone" size={13} />iPhone · 2 min ago<span className="base-push">vs this Mac</span></div>
          {diff.map((l, i) => (
            <div key={i} className={"st-diff-line is-" + l.t}><span className="st-diff-mark">{l.t === "add" ? "+" : l.t === "del" ? "−" : ""}</span><span>{l.s}</span></div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
function StBannerStack({ screen, st }) {
  const specs = stBannerSpecs(screen, st);
  if (!specs.length) return null;
  return <div className="st-banners" data-st-banners>{specs.map((b) => <StBanner key={b.id} {...b} />)}</div>;
}

/* ---------- skeletons ---------- */
function StBar({ w, h, r, style }) {
  return <span className="st-sk" style={Object.assign({ width: w, height: h || 10, borderRadius: r == null ? 5 : r }, style || {})} />;
}
const stW = [72, 54, 66, 48, 80, 58, 44, 62, 70, 52];
function StSkeleton(p) {
  const kind = typeof p === "string" ? p : (p && p.kind) || "list";
  const head = (
    <div className="st-sk-head"><StBar w={168} h={18} r={6} /><span className="state-skeleton-span" /><StBar w={92} h={28} r={9} /></div>
  );
  let inner;
  if (kind === "grid") inner = (
    <div className="st-sk-grid">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="st-sk-card"><StBar w="100%" h={118} r={12} /><StBar w={stW[i] + "%"} h={11} /><StBar w={38} h={9} /></div>
      ))}
    </div>);
  else if (kind === "week") inner = (
    <div className="st-sk-week">
      <div className="st-sk-week-gutter">{Array.from({ length: 9 }).map((_, i) => <StBar key={i} w={26} h={8} />)}</div>
      {Array.from({ length: 7 }).map((_, d) => (
        <div key={d} className="st-sk-week-day">
          <StBar w={46} h={10} />
          <span className="st-sk-week-col">
            <StBar w="88%" h={[48, 72, 36, 90, 54, 30, 64][d]} r={8} style={{ position: "absolute", top: [20, 90, 150, 40, 210, 120, 60][d] + "px", left: 4 }} />
            {d % 2 ? <StBar w="88%" h={40} r={8} style={{ position: "absolute", top: [0, 260, 0, 230, 0, 300, 0][d] + "px", left: 4 }} /> : null}
          </span>
        </div>
      ))}
    </div>);
  else if (kind === "page") inner = (
    <div className="st-sk-page">
      <StBar w="58%" h={30} r={8} />
      <StBar w={140} h={10} style={{ marginBottom: 18 }} />
      {[96, 88, 92, 60, 0, 94, 82, 90, 48, 0, 86, 74].map((w, i) => w ? <StBar key={i} w={w + "%"} h={12} /> : <span className="state-skeleton-span-2" key={i} />)}
    </div>);
  else if (kind === "cards") inner = (
    <div className="st-sk-cards">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="st-sk-cardbox">
          <span className="state-skeleton-row"><StBar w={32} h={32} r={9} /><StBar w={96} h={12} /></span>
          <StBar w="86%" h={9} /><StBar w="64%" h={9} />
          <span className="state-skeleton-row-2"><StBar w={84} h={28} r={9} /></span>
        </div>
      ))}
    </div>);
  else if (kind === "chat") inner = (
    <div className="st-sk-chat">
      <StBar w="62%" h={34} r={14} style={{ alignSelf: "flex-end" }} />
      <span className="state-skeleton-row-3"><StBar w={20} h={20} r={6} /><span className="state-skeleton-stack"><StBar w="92%" /><StBar w="78%" /><StBar w="54%" /></span></span>
      <StBar w="48%" h={34} r={14} style={{ alignSelf: "flex-end" }} />
      <span className="state-skeleton-row-3"><StBar w={20} h={20} r={6} /><span className="state-skeleton-stack"><StBar w="86%" /><StBar w="66%" /></span></span>
    </div>);
  else inner = (
    <div className="st-sk-list">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="st-sk-row">
          <StBar w={16} h={16} r={5} /><StBar w={stW[i] * 4.2} h={11} /><span className="state-skeleton-span" />
          <StBar w={40} h={9} />{i % 3 ? <StBar w={64} h={20} r={6} /> : null}
        </div>
      ))}
    </div>);
  return (
    <div className={"st-skeleton is-" + kind} aria-busy="true" aria-label="Loading" data-st-skeleton={kind}>
      {kind === "chat" || kind === "page" ? null : head}
      {inner}
    </div>
  );
}

/* ---------- error ---------- */
function StError({ text, screen, onRetry }) {
  return (
    <div className="st-error" role="alert" data-st-error>
      <span className="st-error-icon"><StGlyph name="cloud-off" size={16} /></span>
      <span className="st-error-text">{text || stErrorText(screen || stScreenNow)}</span>
      <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" data-st-retry onClick={onRetry || (() => needtStates.retry(screen))}>
        <StGlyph name="refresh" size={13} />Retry
      </button>
    </div>
  );
}

/* ---------- no access ---------- */
function StAvatar({ name, size }) {
  const z = size || 28;
  const ini = String(name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return <span className="st-avatar" style={{ width: z, height: z, fontSize: Math.round(z * 0.4) }}>{ini}</span>;
}
function StNoAccess({ title, kind, owner }) {
  const [asked, setAsked] = React.useState(false);
  const who = owner || { name: "Lena Hoffmann", email: "lena@demesures.cc" };
  const thing = kind === "moodboard" ? "moodboard" : "document";
  return (
    <div className="st-noaccess" data-st-noaccess>
      <span className="st-noaccess-lock"><StGlyph name="lock" size={18} /></span>
      <span className="st-noaccess-title">You don't have access to “{title || "Launch brief"}”</span>
      <span className="st-noaccess-body">This {thing} was shared with a link, but not with your account.</span>
      <span className="st-noaccess-owner">
        <StAvatar name={who.name} size={28} />
        <span className="state-no-access-stack">
          <span className="base-strong">{who.name}</span>
          <span className="base-meta">Owner · {who.email}</span>
        </span>
      </span>
      {asked ? (
        <span className="st-noaccess-sent" data-st-requested><StGlyph name="check" size={14} />Request sent — {who.name.split(" ")[0]} will get an email.</span>
      ) : (
        <button type="button" className="nx-btn nx-btn-primary" data-st-request onClick={() => setAsked(true)}>Request access</button>
      )}
    </div>
  );
}

/* ---------- the body layer App puts over the routed screen ---------- */
function StScreenLayer({ screen, st }) {
  let inner = null;
  if (st.load === "loading") inner = <StSkeleton kind={ST_KIND[screen] || "list"} />;
  else if (st.load === "error") inner = <div className="st-center"><StError screen={screen} /></div>;
  else if (st.access === "shared" && (screen === "doc" || screen === "moodboards")) {
    const d = screen === "doc" && window.docs && window.docs.current ? window.docs.current() : null;
    inner = <div className="st-center is-mid"><StNoAccess kind={screen === "moodboards" ? "moodboard" : "doc"} title={screen === "moodboards" ? "SS27 references" : (d && d.title) || "Launch brief"} /></div>;
  }
  if (!inner) return null;
  return <div className="st-layer" data-st-layer={screen}>{inner}</div>;
}

/* Settings is a sheet, not a route: its states go into the sheet's own pane. */
function StSettingsLayer() {
  const st = useStStates("settings");
  const [host, setHost] = React.useState(null);
  React.useEffect(() => {
    let alive = true, n = 0;
    function find() {
      if (!alive) return;
      const sheet = document.querySelector(".settings-sheet");
      const pane = sheet && sheet.lastElementChild;
      if (pane) {
        if (getComputedStyle(pane).position === "static") pane.style.position = "relative";
        setHost(pane);
      } else if (n++ < 40) window.setTimeout(find, 50);
    }
    find();
    return () => { alive = false; };
  }, []);
  if (!host) return null;
  const layer = <StScreenLayer screen="settings" st={st} />;
  return layer ? ReactDOM.createPortal(layer, host) : null;
}

/* ---------- offline indicator (top bar, beside the bell) ---------- */
function stAgo(at) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 45 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : Math.round(s / 3600) + " h ago";
}
function StOfflineIndicator() {
  const st = useStStates();
  const [open, setOpen] = React.useState(false);
  const wrap = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  React.useEffect(() => { if (!st.offline) setOpen(false); }, [st.offline]);
  if (!st.offline) return null;
  const n = st.queue.length;
  return (
    <span className="state-offline-indicator-row" ref={wrap}>
      <button type="button" className="st-offline nx-press" data-st-offline aria-expanded={open} onClick={() => setOpen((v) => !v)}
        title={n ? n + " changes will sync when you're back online" : "You're offline — edits still save"}>
        <StGlyph name="cloud-off" size={14} />
        <span>offline{n ? " · " + n + (n === 1 ? " change" : " changes") + " waiting" : ""}</span>
      </button>
      {open ? (
        <div className="st-offline-pop nx-pop is-right" data-st-offline-pop>
          <div className="st-pop-title">{n ? n + (n === 1 ? " change" : " changes") + " waiting" : "Nothing waiting"}</div>
          {n ? (
            <div className="st-queue">
              {st.queue.slice().reverse().map((q) => (
                <div key={q.key} className="st-queue-row"><span className="st-queue-dot" /><span className="st-queue-label">{q.label}</span><span className="st-queue-at">{stAgo(q.at)}</span></div>
              ))}
            </div>
          ) : null}
          <div className="st-pop-foot">You can keep working. {n ? "These sync" : "Edits sync"} on their own when you're back online.</div>
        </div>
      ) : null}
    </span>
  );
}

/* ---------- locks: trial-ended and AI-off controls ---------- */
function stLockRules(st) {
  const r = [];
  if (st.account === "trial-ended") {
    r.push(["[data-agent-plan]", "Pro · AI planning is read-only since your trial ended"]);
    r.push(["[data-dc-style] button", "Pro · Document themes are read-only since your trial ended"]);
    r.push(["[data-cn-connect]", "Pro · Extra connections need Pro since your trial ended"]);
  } else if (st.ai === "limit") r.push(["[data-agent-plan]", "AI paused until 14:00 — your tasks and calendar still work"]);
  else if (st.ai === "down") r.push(["[data-agent-plan]", "AI is temporarily unavailable — your tasks and calendar still work"]);
  return r;
}
function StLocks({ screen }) {
  const st = useStStates(screen);
  const rules = stLockRules(st);
  const key = JSON.stringify(rules);
  const [tip, setTip] = React.useState(null);
  React.useEffect(() => {
    let raf = 0;
    function apply() {
      raf = 0;
      const want = new Map();
      rules.forEach(([sel, why]) => document.querySelectorAll(sel).forEach((el) => { if (!want.has(el)) want.set(el, why); }));
      document.querySelectorAll("[data-st-lock]").forEach((el) => { if (!want.has(el)) el.removeAttribute("data-st-lock"); });
      want.forEach((why, el) => { if (el.getAttribute("data-st-lock") !== why) el.setAttribute("data-st-lock", why); });
    }
    apply();
    const mo = new MutationObserver(() => { if (!raf) raf = window.requestAnimationFrame(apply); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); if (raf) window.cancelAnimationFrame(raf); document.querySelectorAll("[data-st-lock]").forEach((el) => el.removeAttribute("data-st-lock")); };
  }, [key]);
  React.useEffect(() => { setTip(null); }, [key]);
  React.useEffect(() => {
    const show = (el) => { const r = el.getBoundingClientRect(); setTip({ text: el.getAttribute("data-st-lock"), x: r.left + r.width / 2, right: window.innerWidth - r.right, edge: r.left + r.width / 2 > window.innerWidth - 170, y: r.bottom + 8, up: r.bottom > window.innerHeight - 80, top: r.top - 8 }); };
    function over(e) { const el = e.target && e.target.closest && e.target.closest("[data-st-lock]"); if (el) show(el); else setTip(null); }
    function block(e) {
      const el = e.target && e.target.closest && e.target.closest("[data-st-lock]");
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      if (e.type === "click") show(el);
    }
    document.addEventListener("mouseover", over);
    ["click", "mousedown", "pointerdown"].forEach((t) => document.addEventListener(t, block, true));
    return () => { document.removeEventListener("mouseover", over); ["click", "mousedown", "pointerdown"].forEach((t) => document.removeEventListener(t, block, true)); };
  }, []);
  if (!tip) return null;
  return ReactDOM.createPortal(
    <div className="st-locktip" role="tooltip" data-st-locktip style={tip.edge
      ? { right: Math.max(8, tip.right), top: tip.up ? tip.top : tip.y, transform: tip.up ? "translateY(-100%)" : "none" }
      : { left: tip.x, top: tip.up ? tip.top : tip.y, transform: "translate(-50%, " + (tip.up ? "-100%" : "0") + ")" }}>
      <StGlyph name="lock" size={12} />{tip.text}
    </div>, document.body);
}

/* ---------- the dev switcher: a pill above Ask Needt, ⌥S ---------- */
const ST_ROWS = [
  ["load", "Loading", [["none", "Content"], ["loading", "Loading"], ["error", "Load error"]]],
  ["access", "Access", [["none", "OK"], ["shared", "Shared, no rights"], ["revoked", "Calendar/Mailbox revoked"]]],
  ["conflict", "Sync", [[false, "In sync"], [true, "Conflict (doc)"]]],
  ["ai", "AI", [["none", "OK"], ["limit", "Limit reached"], ["down", "Provider down"]]],
  ["account", "Account", [["none", "Pro"], ["trial-ending", "Trial ending"], ["trial-ended", "Trial ended"], ["payment-failed", "Payment failed"]]]
];
function StChip(props) {
  /* Rest props picked by hand: Babel-standalone's shared `_excluded` list is global across files. */
  const { on, onClick, children } = props;
  const rest = {};
  for (const k in props) if (k !== "on" && k !== "onClick" && k !== "children") rest[k] = props[k];
  return <button type="button" className={"st-chip" + (on ? " nx-selected" : "")} aria-pressed={on} onClick={onClick} {...rest}>{children}</button>;
}
function StSwitcher({ screen }) {
  const st = useStStates(screen);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    function key(e) { if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === "KeyS") { e.preventDefault(); setOpen((v) => !v); } else if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const active = (st.load !== "none" ? 1 : 0) + (st.access !== "none" ? 1 : 0) + (st.conflict ? 1 : 0) + (st.ai !== "none" ? 1 : 0) + (st.account !== "none" ? 1 : 0) + (st.offline ? 1 : 0);
  const name = ST_NAMES[screen] || screen;
  return (
    <div className="st-switch" data-st-switch>
      {open ? (
        <div className="st-panel nx-pop is-right" data-st-panel role="dialog" aria-label="Prototype states">
          <div className="st-panel-head">
            <span className="base-strong">States</span>
            <span className="base-meta">prototype · ⌥S</span>
            <button type="button" className="nx-btn nx-btn-text nx-btn-sm base-push" data-st-reset onClick={() => needtStates.reset()}>Reset</button>
          </div>
          <div className="st-panel-row">
            <span className="st-panel-label">Applies to</span>
            <span className="st-chips">
              <StChip on={st.scope === "global"} data-st-scope="global" onClick={() => needtStates.set("scope", "global")}>Every screen</StChip>
              <StChip on={st.scope === "screen"} data-st-scope="screen" onClick={() => needtStates.set("scope", "screen")}>Only {name}</StChip>
            </span>
          </div>
          {ST_ROWS.map(([k, label, opts]) => (
            <div key={k} className="st-panel-row">
              <span className="st-panel-label">{label}</span>
              <span className="st-chips">
                {opts.map(([v, l]) => <StChip key={String(v)} on={st[k] === v} data-st-set={k + ":" + v} onClick={() => needtStates.set(k, v)}>{l}</StChip>)}
              </span>
            </div>
          ))}
          <div className="st-panel-row">
            <span className="st-panel-label">Network</span>
            <span className="st-chips">
              <StChip on={!st.offline} data-st-set="offline:false" onClick={() => needtStates.set("offline", false)}>Online</StChip>
              <StChip on={st.offline} data-st-set="offline:true" onClick={() => needtStates.set("offline", true)}>Offline{st.queue.length ? " · " + st.queue.length : ""}</StChip>
            </span>
          </div>
          <label className="st-panel-pin">
            <input type="checkbox" checked={st.pin} data-st-pin onChange={(e) => needtStates.set("pin", e.target.checked)} />
            Pin loading (don't resolve after 1.2 s)
          </label>
        </div>
      ) : null}
      <button type="button" className="st-pill nx-press" data-st-pill aria-expanded={open} onClick={() => setOpen((v) => !v)} title="Prototype states (⌥S)">
        <StGlyph name="layers" size={12} />States{active ? <span className="st-pill-n">{active}</span> : null}
      </button>
    </div>
  );
}

Object.assign(window, { needtStates, useStStates, stNoteTask, StGlyph, StBanner, StBannerStack, StSkeleton, StError, StNoAccess, StAvatar,
  StScreenLayer, StSettingsLayer, StOfflineIndicator, StLocks, StSwitcher, stBannerSpecs });
