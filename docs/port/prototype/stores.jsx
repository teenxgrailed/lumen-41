/* STORES — the prototype's shared state for documents and the toast (06.10.26).
   Star, duplicate, move, trash and restore all write here, so the Docs grid,
   the sidebar's Starred, Trash and Shared read one list and cannot disagree.
   Every destructive write returns an undo, and the toast offers it. */
function makeStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set: (next) => { state = typeof next === "function" ? next(state) : next; subs.forEach((f) => f(state)); },
    sub: (f) => { subs.add(f); return () => subs.delete(f); }
  };
}
function useStore(store) {
  const [s, setS] = React.useState(store.get());
  React.useEffect(() => store.sub(setS), [store]);
  return s;
}

/* PERSISTENCE (09.10.26) — every store below persists through
   window.needtSync (sync.js): same keys, same shapes as before, but a write
   is stamped per record and sent to the other open windows (and, later, the
   server); a change made elsewhere comes back into the store, which
   re-renders. nsBind(store, key, opts) is the glue (needtSync.bind). */
const ST_SYNC = window.needtSync;
const nsGet = (k, fb) => (ST_SYNC ? ST_SYNC.get(k, fb) : (() => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } })());
const nsSet = (k, v, o) => { if (ST_SYNC) return ST_SYNC.set(k, v, o); try { localStorage.setItem(k, typeof v === "string" && o && o.raw ? v : JSON.stringify(v)); return true; } catch (e) { return false; } };
const nsBind = (store, key, opts) => { if (ST_SYNC) return ST_SYNC.bind(store, key, opts); return store.sub((s) => nsSet(key, opts && opts.save ? opts.save(s) : s)); };
const nsOn = (key, fn) => (ST_SYNC ? ST_SYNC.subscribe(key, fn) : () => {});

/* ---------- documents ----------
   A doc carries the database's names: isFavorite (shown as "Pinned"),
   trashedAt (null, or when it went to Trash — trashed = trashedAt != null),
   coverUrl, style (one JSON object: the page style plus any legacy theme /
   ground preset) and projectId. Old storage is migrated in Data.js. */
const docStore = makeStore([]);
/* A doc as read: Data.js's field migration, then the body's old block-level
   format → spans (doc-style.jsx dxMigrateBody; loaded after this file, so it
   applies from the first seed on). The seed's write persists the migrated
   bodies once; an unchanged body keeps its identity. */
const stDocRead = (d) => {
  const d1 = window.NEEDT.migrateDoc(d), M = window.dxMigrateBody;
  if (!M || !Array.isArray(d1.body)) return d1;
  const b = M(d1.body);
  return b.every((x, i) => x === d1.body[i]) ? d1 : Object.assign({}, d1, { body: b });
};
nsBind(docStore, "needt.docs", { load: (l) => (Array.isArray(l) ? l.map(stDocRead) : []) });
let docSeeded = false;
/* The open page is this window's (needt.openDoc is local: not synced). */
const openSaved = nsGet("needt.openDoc", null);
const openStore = makeStore({ id: openSaved == null ? null : String(openSaved), ext: null });
const docs = {
  seed(list) { if (docSeeded) return; docSeeded = true; const saved = nsGet("needt.docs", null); if (Array.isArray(saved)) { docStore.set(saved.map(stDocRead)); return; } docStore.set(list.map((d) => stDocRead(Object.assign({ isFavorite: d.id === "launch" || d.id === "rules", trashedAt: null, projectId: d.projectId || null, coverUrl: null }, d)))); },
  find: (id) => docStore.get().find((d) => String(d.id) === String(id)),
  patch(id, p) {
    const o = openStore.get();
    if (o.ext && String(o.ext.id) === String(id) && !docs.find(id)) { openStore.set({ id: o.id, ext: Object.assign({}, o.ext, p) }); return; }
    docStore.set((l) => l.map((d) => String(d.id) === String(id) ? Object.assign({}, d, p) : d));
  },
  /* The page the document screen shows. A doc outside the list (a Shared
     card) is passed whole and kept beside the id. */
  current() {
    const o = openStore.get();
    if (o.ext && String(o.ext.id) === String(o.id) && !docs.find(o.id)) return o.ext;
    const d = o.id != null ? docs.find(o.id) : null;
    if (d && !d.trashedAt) return d;
    return docs.find("launch") || docStore.get().find((x) => !x.trashedAt) || null;
  },
  open(idOrDoc) {
    const ext = idOrDoc && typeof idOrDoc === "object" ? idOrDoc : null;
    const id = ext ? ext.id : idOrDoc;
    if (id == null) return;
    openStore.set({ id: id, ext: ext && !docs.find(id) ? ext : null });
    nsSet("needt.openDoc", String(id), { raw: true });
    if (docs.find(id)) docStore.set((l) => l.map((d) => String(d.id) === String(id) ? Object.assign({}, d, { viewed: "Just now" }) : d));
    if (window.__app && window.__app.setScreen) window.__app.setScreen("doc");
  },
  /* A blank page, opened. Undo in the toast takes it back out. */
  newDoc() {
    const d = docs.create({});
    docs.open(d.id);
    return d;
  },
  /* A new page at the top of the list. Returns it; the caller owns the toast
     (its Undo is docs.remove(doc.id)). */
  create(partial) {
    const now = new Date();
    const d = Object.assign({ id: "doc-" + now.getTime().toString(36) + Math.random().toString(36).slice(2, 6), title: "", projectId: null, hue: null, style: null, coverUrl: null,
      isFavorite: false, trashedAt: null, updated: "Just now", viewed: "Just now", created: now.getDate() + " " + now.toLocaleString("en-GB", { month: "short" }), body: [] }, partial || {});
    docStore.set((l) => [d].concat(l));
    return d;
  },
  remove(id) { docStore.set((l) => l.filter((x) => String(x.id) !== String(id))); },
  /* A template makes a real page: its title + today's date, its style, its
     blocks copied (empty placeholder blocks dropped). One rule for the
     desktop's Templates (places.jsx) and the phone's (phone-places.jsx).
     Returns the page; the caller owns the toast (Undo = docs.remove(id))
     and opening it. */
  fromTemplate(t) {
    const now = new Date();
    return docs.create({ title: (t.title || "Untitled") + " — " + now.getDate() + " " + now.toLocaleString("en-GB", { month: "short" }),
      style: t.style ? Object.assign({}, t.style) : null, body: JSON.parse(JSON.stringify(t.body || [])).filter((b) => b[1] !== "") });
  },
  star(id) {
    const d = docs.find(id); if (!d) return;
    docs.patch(id, { isFavorite: !d.isFavorite });
    window.toast(d.isFavorite ? "Unpinned" : "Pinned", { undo: () => docs.patch(id, { isFavorite: d.isFavorite }) });
  },
  duplicate(id) {
    const d = docs.find(id); if (!d) return;
    const copy = Object.assign({}, d, { id: d.id + "-copy-" + Date.now(), title: (d.title || "Untitled") + " copy", isFavorite: false, updated: "Just now" });
    docStore.set((l) => { const i = l.findIndex((x) => x.id === d.id); const n = l.slice(); n.splice(i + 1, 0, copy); return n; });
    window.toast("Duplicated “" + (d.title || "Untitled") + "”", { undo: () => docStore.set((l) => l.filter((x) => x.id !== copy.id)) });
  },
  /* By project name (what the menus show); stored as projectId. */
  move(id, project, hue) {
    const d = docs.find(id); if (!d) return;
    docs.patch(id, { projectId: window.NEEDT.projectIdOf(project), hue: hue });
    window.toast("Moved to " + (project || "No project"), { undo: () => docs.patch(id, { projectId: d.projectId, hue: d.hue }) });
  },
  trash(id) {
    const d = docs.find(id); if (!d) return;
    docs.patch(id, { trashedAt: new Date().toISOString() });
    window.toast("Moved to Trash", { undo: () => docs.patch(id, { trashedAt: null }) });
  },
  restore(id) {
    const d = docs.find(id); if (!d) return;
    docs.patch(id, { trashedAt: null });
    window.toast("Restored “" + (d.title || "Untitled") + "”", { undo: () => docs.patch(id, { trashedAt: d.trashedAt }) });
  },
  destroy(id) {
    const before = docStore.get();
    docStore.set((l) => l.filter((x) => String(x.id) !== String(id)));
    window.toast("Deleted forever", { undo: () => docStore.set(before) });
  }
};
const useDocs = () => useStore(docStore);
/* The open document, live: re-renders on a new pick and on every edit. */
function useOpenDoc() { useStore(docStore); useStore(openStore); return docs.current(); }
window.__docTitle = () => { const d = docs.current(); return (d && d.title) || "Untitled"; };

/* ---------- settings (07.10.26) ----------
   Every control in Settings writes into one object, localStorage
   "needt.settings", and reads it back on load. Desktop and phone read the same
   object. Theme and accent are also mirrored to the older "needt.theme" /
   "needt.accent" keys, which App still reads first.
   Keys: theme, accent, aura, start, end, week, tz, order, chunk, buffer,
   auto, protect, weekends, connected, apple, google, outlookCal, declined, allDay,
   writeBack, view, est, project, parts, money, len, brk, sound, hideAlerts,
   snapSound, stopMark, plan, mailPlan, planTime, nudge, review, links, offline.
   apple / google / outlookCal: the calendars that sync, a list of names per
   account (true = all, false = none); set in Connections → ⋯ → Sync settings. */
const SETTINGS_DEFAULTS = {
  theme: "light", accent: "blue", aura: true,
  start: "09:00", end: "18:00", week: "mon", tz: "cet", order: "deadline", chunk: "30", buffer: "10",
  auto: true, protect: true, weekends: false,
  connected: ["apple", "google"], apple: true, google: true, outlookCal: true, declined: false, allDay: true, writeBack: true, view: "week",
  est: "45", project: "none", parts: true, money: true,
  len: "50", brk: "10", sound: "none", hideAlerts: true, snapSound: false, stopMark: true,
  plan: true, mailPlan: false, planTime: "08:30", nudge: false, review: true,
  links: "ask", offline: true
};
const settingsLoad = () => {
  let s = nsGet("needt.settings", null);
  s = s && typeof s === "object" && !Array.isArray(s) ? Object.assign({}, s) : {};
  const th = ST_SYNC ? ST_SYNC.getRaw("needt.theme") : null, ac = ST_SYNC ? ST_SYNC.getRaw("needt.accent") : null;
  if (th) s.theme = th;
  if (ac) s.accent = ac;
  return s;
};
/* ONE settings object for desktop and phone: Mobile.jsx's mbPrefStore is a
   view of this store (no second writer). Theme and accent are mirrored to
   "needt.theme" / "needt.accent", which App.jsx reads first on load. */
const settingsStore = makeStore(settingsLoad());
nsBind(settingsStore, "needt.settings", { load: (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {}) });
settingsStore.sub((s) => {
  if (s.theme) nsSet("needt.theme", s.theme, { raw: true });
  if (s.accent) nsSet("needt.accent", s.accent, { raw: true });
  window.dispatchEvent(new CustomEvent("needt-settings", { detail: s }));
});
const needtSettings = {
  defaults: SETTINGS_DEFAULTS,
  store: settingsStore,
  /* The whole object with defaults filled in, or one key. */
  get: (k) => { const s = Object.assign({}, SETTINGS_DEFAULTS, settingsStore.get()); return k ? s[k] : s; },
  /* True when the person chose this value (not just the default). */
  has: (k) => Object.prototype.hasOwnProperty.call(settingsStore.get(), k),
  set: (k, v) => settingsStore.set((s) => (s[k] === v ? s : Object.assign({}, s, { [k]: v }))),
  patch: (p) => settingsStore.set((s) => Object.assign({}, s, p))
};
/* [settings, set(key, value)] — re-renders on any change. */
function useSettings() { useStore(settingsStore); return [needtSettings.get(), needtSettings.set]; }

/* ---------- habits, mail, moodboards (07.10.26) ----------
   The database shapes from Data.js, one store each, shared by the desktop and
   the phone (both pages load this file). Old storage is migrated in Data.js
   before anything here reads it. */
const stRead = (k) => nsGet(k, null);
const stClone = (x) => JSON.parse(JSON.stringify(x));
const stNow = () => new Date().toISOString();

/* HABITS — Habit rows in "needt.habits", HabitCheckin rows in
   "needt.habitCheckins". Archive sets archivedAt; lists show live habits. */
const habitSeed = stClone((window.NEEDT && window.NEEDT.habits) || []);
const habitCheckinSeed = stClone((window.NEEDT && window.NEEDT.habitCheckins) || []);
const habitStore = makeStore((() => {
  const s = stRead("needt.habits");
  return Array.isArray(s) ? s.map((h) => window.NEEDT.migrateHabit(h).habit) : stClone(habitSeed);
})());
const habitCheckinStore = makeStore((() => {
  const c = stRead("needt.habitCheckins");
  return Array.isArray(c) ? c : Array.isArray(stRead("needt.habits")) ? [] : stClone(habitCheckinSeed);
})());
nsBind(habitStore, "needt.habits", { load: (l) => (Array.isArray(l) ? l.map((h) => window.NEEDT.migrateHabit(h).habit) : []) });
nsBind(habitCheckinStore, "needt.habitCheckins", { load: (l) => (Array.isArray(l) ? l : []) });
const habitNew = (p) => Object.assign({ id: "h-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: "New habit", projectId: null, color: null, icon: null,
  schedule: { time: null, perWeek: null }, archivedAt: null }, window.NEEDT.habitPatch(p || {}));
/* `done` (the old fourteen-day strip) as a read-only, non-stored view on a
   found habit, for callers that still read it (ctx.jsx). */
const habitView = (h) => { if (!h) return h; const v = Object.assign({}, h); Object.defineProperty(v, "done", { enumerable: false, get: () => window.NEEDT.habitDays(h.id) }); return v; };
const habitApi = {
  /* Live habits (not archived); all() includes archived ones. */
  list: () => window.NEEDT.liveHabits(habitStore.get()),
  all: () => habitStore.get(),
  checkins: () => habitCheckinStore.get(),
  find: (id) => habitView(habitStore.get().find((h) => h.id === id)),
  /* A new habit starts with no checkins: fourteen hollow days, nothing owed.
     Takes database fields; the old words (at, quota, project) are translated. */
  add(p) { const h = habitNew(p); habitStore.set((l) => l.concat(h)); return h; },
  patch(id, p) {
    const q = window.NEEDT.habitPatch(p || {});
    habitStore.set((l) => l.map((h) => h.id === id ? Object.assign({}, h, q, q.schedule ? { schedule: Object.assign({}, h.schedule, q.schedule) } : {}) : h));
  },
  /* Tick (or untick) a day — today unless `date` is given. */
  toggle(id, on, date) {
    const N = window.NEEDT, d = N.toDate(date) || N.iso(N.today);
    const next = on == null ? !N.habitDoneOn(id, d, habitCheckinStore.get()) : !!on;
    habitCheckinStore.set((l) => N.setCheckin(l, id, d, next));
  },
  rename(id, title) {
    const h = habitStore.get().find((x) => x.id === id); if (!h || !title || title === h.title) return;
    habitApi.patch(id, { title: title });
    window.toast("Renamed to “" + title + "”", { undo: () => habitApi.patch(id, { title: h.title }) });
  },
  archive(id) {
    const h = habitStore.get().find((x) => x.id === id); if (!h) return;
    habitApi.patch(id, { archivedAt: stNow() });
    window.toast("Archived “" + h.title + "”", { undo: () => habitApi.patch(id, { archivedAt: null }) });
  },
  remove(id) { habitStore.set((l) => l.filter((x) => x.id !== id)); },
  /* Swap both tables at once (edge data, reset). */
  replace(habits, checkins) { habitCheckinStore.set(checkins || []); habitStore.set(habits || []); }
};
function useHabits() { useStore(habitCheckinStore); return window.NEEDT.liveHabits(useStore(habitStore)); }
/* NEEDT.habits reads live from here, never a module-time snapshot. */
if (window.NEEDT) {
  try {
    window.NEEDT.habitSeed = habitSeed; window.NEEDT.habitCheckinSeed = habitCheckinSeed;
    Object.defineProperty(window.NEEDT, "habits", { configurable: true, enumerable: true, get: () => habitApi.list() });
  } catch (e) {}
}

/* MAIL — MailThread rows in "needt.mail.threads". Read / archive / trash /
   the task a thread became are fields on the thread. */
const mailThreadStore = makeStore((() => {
  const s = stRead("needt.mail.threads");
  return Array.isArray(s) ? s.map((m) => window.NEEDT.mailThread(m)) : window.NEEDT.mailFixture("seed");
})());
const mailUnread = () => window.NEEDT.liveMail(mailThreadStore.get()).filter((m) => !m.isRead).length;
let mailLastCount = mailUnread();
nsBind(mailThreadStore, "needt.mail.threads", { load: (l) => (Array.isArray(l) ? l.map((m) => window.NEEDT.mailThread(m)) : []) });
mailThreadStore.sub(() => {
  const n = mailUnread();
  if (n !== mailLastCount) { mailLastCount = n; window.dispatchEvent(new CustomEvent("needt-mail-count", { detail: { count: n } })); }
});
const mailApi = {
  store: mailThreadStore,
  /* Every thread, archived and trashed included; live() is what the inbox shows. */
  list: () => mailThreadStore.get(),
  live: () => window.NEEDT.liveMail(mailThreadStore.get()),
  get: (id) => mailThreadStore.get().find((m) => String(m.id) === String(id)) || null,
  patch(id, p) { mailThreadStore.set((l) => l.map((m) => String(m.id) === String(id) ? Object.assign({}, m, p) : m)); },
  /* Replace the whole list: "seed" | "mail" (200 threads) | "empty", or a list. */
  reset(kind) { mailThreadStore.set(Array.isArray(kind) ? kind : window.NEEDT.mailFixture(kind)); return mailThreadStore.get().length; }
};
const useMail = () => useStore(mailThreadStore);

/* MAIL OUT (09.10.26) — compose, send, drafts, reply, forward, on the same
   store and the same MailThread row (mailApi; window.mailOut is an alias).
   A sent or draft message is a MailThread row with
     folder       "sent" | "drafts"   (null = received; NEEDT.liveMail skips the others)
     to, cc, bcc  [{ name, email }]
     attachments  [{ name, size, type }]
     text         the body as typed (body = its paragraphs, preview = a line)
     inReplyTo / forwardOf   the thread it answers / passes on
     quote        { from, email, when, text } of that thread
   from / fromEmail are the account's. Sent and Drafts are
   mailApi.folder(list, "sent" | "drafts").
   A draft (the composer's state) is
     { id, accountId, to, cc, bcc, subject, text, attachments, inReplyTo, forwardOf, quote }
   — compose(p) makes one, reply(m, all) / forward(m) make one from a thread.
   saveDraft(d) → id · send(d) → { id, undo } (the row goes to Sent at once;
   undo() — the 5 s "Undo send" — turns it back into a draft and returns it)
   · discard(id) → undo · check(d) → what stops a send, or null ·
   accounts() · suggest(q, skip) → contacts. */
const mailOutApi = (function () {
  const api = () => mailApi;
  const N = () => window.NEEDT;
  const isOut = (m) => !!(m && (m.folder === "sent" || m.folder === "drafts"));
  const meta = () => (window.connections && window.connections.meta) || {};
  const addr = (id) => { const C = window.cnData && window.cnData.CN_META[id]; return (C && C.account) || "you@needt.app"; };
  const label = (id) => (meta()[id] && meta()[id].label) || id || "Mail";
  /* The mail accounts the user has (connected or broken), connected first. */
  const accounts = () => {
    const c = window.connections ? window.connections.get() : {}, M = meta();
    return Object.keys(M).filter((k) => M[k].kind === "Mail" && c[k] && c[k] !== "none")
      .map((k) => ({ id: k, label: M[k].label, email: addr(k), state: c[k] }))
      .sort((a, b) => (a.state === "connected" ? 0 : 1) - (b.state === "connected" ? 0 : 1));
  };
  const pickAccount = (want) => {
    const l = accounts(), hit = l.filter((a) => a.id === want && a.state === "connected")[0];
    return hit ? hit.id : l.length ? l[0].id : null;
  };
  /* Everyone you have mail from or wrote to, most frequent first. */
  const contacts = () => {
    const seen = {}, out = [];
    const add = (name, email) => {
      if (!email) return;
      const k = String(email).toLowerCase();
      if (seen[k]) { seen[k].n++; return; }
      const c = { name: name || email, email: email, n: 1 };
      seen[k] = c; out.push(c);
    };
    api().list().forEach((m) => { if (isOut(m)) (m.to || []).concat(m.cc || []).forEach((r) => add(r.name, r.email)); else add(m.from, m.fromEmail); });
    return out.sort((a, b) => b.n - a.n);
  };
  const isEmail = (s) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(s || "").trim());
  const suggest = (q, skip) => {
    const s = String(q || "").trim().toLowerCase(), no = (skip || []).map((r) => String(r.email).toLowerCase());
    if (!s) return [];
    return contacts().filter((c) => no.indexOf(c.email.toLowerCase()) < 0 && (c.name.toLowerCase().indexOf(s) >= 0 || c.email.toLowerCase().indexOf(s) >= 0)).slice(0, 5);
  };
  /* A typed address → a recipient (a known contact keeps its name). */
  const person = (text) => {
    const e = String(text || "").trim().replace(/[,;]+$/, "");
    if (!isEmail(e)) return null;
    const known = contacts().filter((c) => c.email.toLowerCase() === e.toLowerCase())[0];
    return { name: known ? known.name : e, email: e };
  };
  const now = () => { const d = new Date(); return N().stamp(N().toDate("Today"), d.getHours() + d.getMinutes() / 60); };
  const quoteOf = (m) => ({ from: m.from, email: m.fromEmail, when: N().mailDayLabel(m.receivedAt) + " " + N().mailTime(m.receivedAt), text: m.text || (m.body || [m.preview]).join("\n\n") });
  const blank = (p) => Object.assign({ id: null, accountId: pickAccount(null), to: [], cc: [], bcc: [], subject: "", text: "", attachments: [], inReplyTo: null, forwardOf: null, quote: null }, p || {});
  const strip = (s) => String(s || "").replace(/^((re|fwd?):\s*)+/i, "");
  const toRow = (d, folder) => ({
    folder: folder, accountId: d.accountId, to: d.to || [], cc: d.cc || [], bcc: d.bcc || [], subject: d.subject || "",
    text: d.text || "", body: String(d.text || "").split(/\n{2,}/).map((x) => x.trim()).filter(Boolean),
    preview: String(d.text || "").replace(/\s+/g, " ").trim().slice(0, 140), attachments: d.attachments || [], attachment: null,
    from: label(d.accountId), fromEmail: d.accountId ? addr(d.accountId) : null, receivedAt: now(), isRead: true, needsReply: false,
    inReplyTo: d.inReplyTo || null, forwardOf: d.forwardOf || null, quote: d.quote || null
  });
  const fromRow = (m) => blank({ id: m.id, accountId: m.accountId, to: m.to || [], cc: m.cc || [], bcc: m.bcc || [], subject: m.subject || "",
    text: m.text != null ? m.text : (m.body || []).join("\n\n"), attachments: m.attachments || [], inReplyTo: m.inReplyTo || null, forwardOf: m.forwardOf || null, quote: m.quote || null });
  const add = (row) => {
    const id = "out-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    api().store.set((l) => [Object.assign(N().mailThread({ id: id }), row, { id: id })].concat(l));
    return id;
  };
  const has = (id) => id != null && !!api().get(id);
  const out = {
    isOut: isOut, accounts: accounts, pickAccount: pickAccount, contacts: contacts, suggest: suggest, person: person, isEmail: isEmail,
    blank: blank, compose: blank, fromRow: fromRow, label: label, addr: addr,
    inbox: (list) => N().liveMail(list).filter((m) => !isOut(m)),
    folder: (list, f) => (list || []).filter((m) => m.folder === f && !m.trashedAt).sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt))),
    /* Is there anything worth keeping? */
    filled: (d) => !!(d && ((d.to || []).length || (d.cc || []).length || (d.bcc || []).length || String(d.subject || "").trim() || String(d.text || "").trim() || (d.attachments || []).length)),
    /* What stops a send, in words (null = fine). */
    check: (d) => {
      const all = (d.to || []).concat(d.cc || [], d.bcc || []);
      if (!(d.to || []).length && !all.length) return "Add someone to send to.";
      const bad = all.filter((r) => !isEmail(r.email))[0];
      if (bad) return "“" + bad.email + "” isn’t an email address.";
      if (!d.accountId) return "Connect a mail account to send.";
      const a = accounts().filter((x) => x.id === d.accountId)[0];
      if (!a || a.state !== "connected") return label(d.accountId) + " is disconnected — reconnect it to send.";
      return null;
    },
    saveDraft(d) {
      const row = toRow(d, "drafts");
      if (has(d.id)) { api().patch(d.id, row); return d.id; }
      return add(row);
    },
    send(d) {
      const row = toRow(d, "sent");
      let id = d.id;
      if (has(id)) api().patch(id, row); else id = add(row);
      const orig = d.inReplyTo != null ? api().get(d.inReplyTo) : null;
      const before = orig ? { needsReply: orig.needsReply, isRead: orig.isRead } : null;
      if (orig) api().patch(orig.id, { needsReply: false, isRead: true });
      return { id: id, undo: () => { api().patch(id, { folder: "drafts" }); if (orig) api().patch(orig.id, before); return fromRow(api().get(id)); } };
    },
    /* Delete a draft (or a sent row); returns undo. */
    discard(id) {
      const l = api().list(), at = l.findIndex((m) => String(m.id) === String(id)), m = l[at];
      if (!m) return () => {};
      api().store.set((x) => x.filter((r) => String(r.id) !== String(id)));
      return () => api().store.set((x) => { const c = x.slice(); c.splice(Math.min(at, c.length), 0, m); return c; });
    },
    reply(m, all) {
      const sent = m.folder === "sent";
      const to = sent ? (m.to || []) : [{ name: m.from, email: m.fromEmail }];
      const mine = accounts().map((a) => a.email.toLowerCase());
      const cc = all ? (m.cc || []).concat(sent ? [] : (m.to || [])).filter((r) => r.email && mine.indexOf(String(r.email).toLowerCase()) < 0 && !to.some((x) => x.email === r.email)) : [];
      return blank({ accountId: pickAccount(m.accountId), to: to.filter((r) => r.email), cc: cc, subject: "Re: " + strip(m.subject), inReplyTo: m.id, quote: quoteOf(m) });
    },
    forward(m) {
      const files = (m.attachments || []).slice();
      if (m.attachment) files.push({ name: m.attachment, size: null, type: /\.pdf$/i.test(m.attachment) ? "application/pdf" : "" });
      return blank({ accountId: pickAccount(m.accountId), subject: "Fwd: " + strip(m.subject), forwardOf: m.id, quote: quoteOf(m), attachments: files });
    },
    fileOf: (f) => ({ name: f.name, size: f.size, type: f.type || "" }),
    fileSize: (b) => (b == null ? "" : b < 1024 ? b + " B" : b < 1048576 ? Math.round(b / 1024) + " KB" : (b / 1048576).toFixed(1) + " MB"),
    /* "Lena Fischer" for one, "Lena, Jonas" for several */
    names: (rs) => { const l = rs || []; return l.length === 1 ? String(l[0].name || l[0].email) : l.map((r) => String(r.name || r.email).split(/\s+/)[0]).join(", "); }
  };
  return out;
})();
Object.assign(mailApi, mailOutApi);
window.mailOut = mailApi;

/* MOODBOARDS — Board / BoardItem / BoardMember rows in "needt.boards",
   "needt.boardItems", "needt.boardMembers". boardStore holds the three
   tables (null until a shell seeds it); boardsView is the joined list the
   screens draw — each board with its `items` (by position) and `members` —
   and takes a joined list back on set, splitting it into the tables. */
const boardLoad = () => {
  const b = stRead("needt.boards");
  if (!Array.isArray(b)) return null;
  const arr = (v) => (Array.isArray(v) ? v : []);
  return { boards: b, items: arr(stRead("needt.boardItems")), members: arr(stRead("needt.boardMembers")) };
};
const boardStore = makeStore(boardLoad());
let boardWarned = false;
const BOARD_TOKEN = {};
boardStore.sub((t) => {
  if (!t) return;
  const o = { source: BOARD_TOKEN };
  const ok = nsSet("needt.boards", t.boards, o) && nsSet("needt.boardItems", t.items, o) && nsSet("needt.boardMembers", t.members, o);
  if (ok) boardWarned = false;
  else if (!boardWarned) { boardWarned = true; if (window.toast) window.toast("Storage full — image kept until reload"); }
});
/* A change made in another window (or by another writer) arrives here; the
   three tables are re-read together. */
["needt.boards", "needt.boardItems", "needt.boardMembers"].forEach((k) => nsOn(k, (v, info) => {
  if (info.source === BOARD_TOKEN || info.origin === "error") return;
  const t = boardLoad();
  if (t) boardStore.set(t);
}));
const BOARD_EMPTY = { boards: [], items: [], members: [] };
const boardsView = {
  tables: boardStore,
  get: () => window.NEEDT.joinBoards(boardStore.get() || BOARD_EMPTY),
  set: (next) => boardStore.set((t) => window.NEEDT.splitBoards(typeof next === "function" ? next(window.NEEDT.joinBoards(t || BOARD_EMPTY)) : next)),
  sub: (f) => boardStore.sub(() => f(boardsView.get())),
  /* First shell to load seeds the tables when nothing is stored yet. */
  seed(make) { if (boardStore.get() == null) boardStore.set(window.NEEDT.splitBoards(make ? make() : [])); return boardsView.get(); }
};

/* ---------- projects ----------
   ONE project registry (07.10.26; moved here 08.10.26 so the desktop's
   work.jsx and the phone's phone-tasks.jsx read the same store). The seeds
   plus the user's own; each project is {id, name, color, icon} — the
   database's Project. Tasks and docs point at it by projectId, so a rename
   touches nothing but the project. "needt.projects" holds the user's own;
   the whole list, renames and recolours included, lives in
   "needt.projects.all". The store seeds on first read: the seed colours come
   from ColumnsView.jsx (cvProject), which loads after this file. */
/* One source: the seeds are NEEDT.projects (Data.js) — id, name, ground. */
const PROJECT_SEEDS = window.NEEDT.projects.map((p) => ({ id: p.id, name: p.name, ground: p.ground || null }));
const PROJECT_SWATCHES = [["accent", "var(--accent)"], ["info", "var(--info)"], ["success", "var(--success)"], ["destructive", "var(--destructive)"], ["muted", "var(--text-muted)"]];
const prjSeedHue = (name) => { const x = window.cvProject ? window.cvProject(name) : null; return (x && x.color) || "var(--text-tertiary)"; };
const prjSeeded = () => PROJECT_SEEDS.map((p) => { const n = window.NEEDT.project(p.id); return Object.assign({}, p, { color: prjSeedHue(p.name), icon: (n && n.icon) || "folder", seed: true }); });
const prjOwn = () => { const v = nsGet("needt.projects", null); return Array.isArray(v) ? v.map(window.NEEDT.migrateProject) : []; };
const prjLoad = () => {
  const all = nsGet("needt.projects.all", null);
  if (Array.isArray(all) && all.length) return all.filter((p) => p && p.name).map(window.NEEDT.migrateProject);
  const seeded = prjSeeded();
  const names = new Set(seeded.map((p) => p.name));
  return seeded.concat(prjOwn().filter((p) => p && p.name && !names.has(p.name)));
};
const prjSortSaved = () => { const v = ST_SYNC ? ST_SYNC.getRaw("needt.projects.sort") : null; return v === "name" || v === "open" ? v : "manual"; };
const projectStore = (() => {
  let st = null; /* seeded quietly on first read — no write, no event */
  let seeding = null;
  const subs = new Set();
  /* While seeding, Data.js's NEEDT.project (which reads this store) sees
     what it saw before the store existed: the saved list. */
  const saved = () => { const l = nsGet("needt.projects.all", null); return Array.isArray(l) ? l : []; };
  const get = () => {
    if (st !== null) return st;
    if (seeding) return seeding;
    seeding = { list: saved(), sort: "manual" };
    try { st = { list: prjLoad(), sort: prjSortSaved() }; } finally { seeding = null; }
    return st;
  };
  return {
    get: get,
    set: (next) => { st = typeof next === "function" ? next(get()) : next; subs.forEach((f) => f(st)); },
    sub: (f) => { subs.add(f); return () => subs.delete(f); }
  };
})();
const PRJ_TOKEN = {};
projectStore.sub((st) => {
  const o = { source: PRJ_TOKEN };
  nsSet("needt.projects.all", st.list, o);
  nsSet("needt.projects", st.list.filter((p) => !p.seed).map((p) => ({ id: p.id, name: p.name, color: p.color, icon: p.icon || "folder" })), o);
  nsSet("needt.projects.sort", st.sort, { source: PRJ_TOKEN, raw: true });
  window.dispatchEvent(new CustomEvent("needt-projects"));
});
["needt.projects.all", "needt.projects.sort"].forEach((k) => nsOn(k, (v, info) => {
  if (info.source === PRJ_TOKEN || info.origin === "error" || v == null) return;
  const all = nsGet("needt.projects.all", null);
  if (!Array.isArray(all)) return;
  projectStore.set({ list: all.filter((p) => p && p.name).map(window.NEEDT.migrateProject), sort: prjSortSaved() });
}));
function useProjects() { return useStore(projectStore); }
/* A project's colour, by name or id. */
const projectHue = (ref) => {
  const p = ref ? projectStore.get().list.find((x) => x.name === ref || x.id === ref) : null;
  if (p && p.color) return p.color;
  const n = ref && window.NEEDT.project(ref);
  const x = window.cvProject ? window.cvProject(n ? n.name : ref) : null;
  return (x && x.color) || "var(--text-tertiary)";
};
/* The list in the chosen order. "open" needs the tasks; without them it is manual. */
const projectsSorted = (list, sort, tasks) => {
  const l = list.slice();
  if (sort === "name") l.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "open" && tasks) {
    const n = (p) => tasks.filter((t) => t.projectId === p.id && !t.done && !t.noSlot).length;
    l.sort((a, b) => n(b) - n(a));
  }
  return l;
};
/* The task list a project edit touches: the desktop app's (App.jsx) when it
   is up, else the phone's task store (Mobile.jsx mbTaskStore). */
const prjTasks = () => (window.__app && window.__app.tasksNow) || (window.mbTaskStore ? window.mbTaskStore.get() : []);
const prjSetTasks = (f) => { if (window.__app && window.__app.setTasksRaw) window.__app.setTasksRaw(f); else if (window.mbTaskStore) window.mbTaskStore.set(f); };
const prjDocsSet = (f) => { if (window.docStore) window.docStore.set(f); };
const projects = {
  list: () => projectStore.get().list,
  find: (name) => projectStore.get().list.find((p) => p.name === name),
  sort: () => projectStore.get().sort,
  setSort(sort) { projectStore.set((s) => Object.assign({}, s, { sort: sort })); },
  create(p) {
    const name = String((p && p.name) || "").trim();
    if (!name || projects.find(name)) return null;
    const np = Object.assign({ id: "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), icon: "folder" }, p, { name: name, color: (p && p.color) || PROJECT_SWATCHES[0][1] });
    projectStore.set((s) => Object.assign({}, s, { list: s.list.concat(np) }));
    return np;
  },
  /* A rename is the project's own: tasks and docs hold its id, not its name. */
  rename(oldName, newName) {
    const nn = String(newName || "").trim();
    if (!nn || nn === oldName || !projects.find(oldName) || projects.find(nn)) return false;
    projectStore.set((s) => Object.assign({}, s, { list: s.list.map((p) => p.name === oldName ? Object.assign({}, p, { name: nn }) : p) }));
    return true;
  },
  recolor(name, color) {
    const id = (projects.find(name) || {}).id;
    projectStore.set((s) => Object.assign({}, s, { list: s.list.map((p) => p.name === name ? Object.assign({}, p, { color: color }) : p) }));
    if (id) prjDocsSet((l) => l.map((d) => d.projectId === id ? Object.assign({}, d, { hue: color }) : d));
  },
  /* Name and colour at once (an edit sheet). false when the name is empty or taken. */
  edit(p, next) {
    const name = String((next && next.name) || "").trim();
    if (!name || (name !== p.name && projects.find(name))) return false;
    if (name !== p.name && !projects.rename(p.name, name)) return false;
    if (next.color && next.color !== p.color) projects.recolor(name, next.color);
    return true;
  },
  /* Delete never strands work: tasks and docs drop to No project, and the
     undo puts the project and every one of them back. Returns
     { label, undo } (null when there is no such project); unless
     opts.quiet, the desktop toast says it with Undo. */
  remove(name, opts) {
    const before = projectStore.get();
    const gone = before.list.find((p) => p.name === name);
    if (!gone) return null;
    const pid = gone.id;
    const taskIds = new Set(prjTasks().filter((t) => t.projectId === pid).map((t) => String(t.id)));
    const openN = prjTasks().filter((t) => t.projectId === pid && !t.done && !t.noSlot && !t.trashedAt).length;
    const docIds = new Set(((window.docStore && window.docStore.get()) || []).filter((d) => d.projectId === pid).map((d) => String(d.id)));
    const docHue = {};
    ((window.docStore && window.docStore.get()) || []).forEach((d) => { if (docIds.has(String(d.id))) docHue[d.id] = d.hue; });
    projectStore.set((s) => Object.assign({}, s, { list: s.list.filter((p) => p.name !== name) }));
    if (taskIds.size) prjSetTasks((l) => l.map((t) => taskIds.has(String(t.id)) ? Object.assign({}, t, { projectId: null }) : t));
    if (docIds.size) prjDocsSet((l) => l.map((d) => docIds.has(String(d.id)) ? Object.assign({}, d, { projectId: null, hue: null }) : d));
    const out = {
      label: "Deleted “" + name + "”" + (openN ? " — " + openN + (openN === 1 ? " task" : " tasks") + " moved to No project" : ""),
      undo: () => {
        projectStore.set((s) => Object.assign({}, s, { list: before.list.map((p) => p.name === name ? p : (s.list.find((x) => x.name === p.name) || p)).concat(s.list.filter((x) => !before.list.some((p) => p.name === x.name))) }));
        if (taskIds.size) prjSetTasks((l) => l.map((t) => taskIds.has(String(t.id)) && !t.projectId ? Object.assign({}, t, { projectId: pid }) : t));
        if (docIds.size) prjDocsSet((l) => l.map((d) => docIds.has(String(d.id)) && !d.projectId ? Object.assign({}, d, { projectId: pid, hue: docHue[d.id] }) : d));
      }
    };
    if (!(opts && opts.quiet)) toast(out.label, { ms: 6000, undo: out.undo });
    return out;
  }
};
Object.assign(window, { PROJECT_SEEDS, PROJECT_SWATCHES, WK_PROJECTS: PROJECT_SEEDS, projectStore, projects, useProjects, projectHue, projectsSorted, projectSeeds: prjSeeded });

/* ---------- toast ---------- */
const toastStore = makeStore([]);
function toast(text, opts) {
  const t = Object.assign({ id: Date.now() + Math.random(), text: text }, opts || {});
  toastStore.set((l) => l.concat(t).slice(-3));
  window.setTimeout(() => dismiss(t.id), t.ms || 4200);
}
function dismiss(id) {
  toastStore.set((l) => l.map((t) => t.id === id ? Object.assign({}, t, { leaving: true }) : t));
  window.setTimeout(() => toastStore.set((l) => l.filter((t) => t.id !== id)), 180);
}

/* Craft's toast: a dark pill at the bottom centre that rises in, with one
   action. Several stack upward. */
function ToastLayer() {
  const list = useStore(toastStore);
  return ReactDOM.createPortal(
    <div className="base-row shell-toast-layer-layer">
      {list.map((t) => (
        <div key={t.id} className={"shell-toast-layer-row " + "nx-toast" + (t.leaving ? " is-leaving" : "")}
         >
          {t.text}
          {t.undo ? (
            <button className="shell-toast-layer-button" type="button" onClick={() => { t.undo(); dismiss(t.id); }}
             >Undo</button>
          ) : <span className="shell-toast-layer-span" />}
        </div>
      ))}
    </div>, document.body);
}

/* CONNECTIONS — one small store for every account Needt reads (moved here
   from MailScreen.jsx 08.10.26, so desktop, phone and onboarding share it),
   persisted in localStorage "needt.connections"; a change fires
   "needt-connections".
   window.connections.get() → { gmail: "connected", outlook: "disconnected", … }
   window.connections.set(id, "connected" | "disconnected" | "connecting")
   window.connections.reconnect(id) → the 1.2 s handshake, then a toast.
   window.connections.authorize(provider) → mock OAuth for a calendar
     ("google" | "apple" | "outlook" → gcal / ical / ocal): connecting for
     1.2 s, then connected and the provider's events synced into calEvents
     (source = provider). Rejects with "offline" or "error" (needtStates
     "auth": offline / load error) and puts the old state back.
     API: POST /connections/:provider/oauth, then GET /connections/:provider/events. */
const CONN_DEFAULT = { gmail: "connected", outlook: "disconnected", gcal: "connected", ical: "connected", notion: "connected", github: "connected" };
const CONN_META = {
  gmail: { label: "Gmail", kind: "Mail", icon: "mail" },
  outlook: { label: "Outlook", kind: "Mail", icon: "mail", lost: "Token expired · last sync 06:12" },
  gcal: { label: "Google Calendar", kind: "Calendar", icon: "calendar-days" },
  ical: { label: "Apple Calendar", kind: "Calendar", icon: "calendar-days" },
  ocal: { label: "Outlook Calendar", kind: "Calendar", icon: "calendar-days" },
  /* Shared with Moodboards: one Pinterest state for both places. */
  pinterest: { label: "Pinterest", kind: "Inspiration", icon: "image" },
  /* The wider catalog (08.10.26) — full copy lives in connections.jsx CN_META. */
  icloudmail: { label: "iCloud Mail", kind: "Mail", icon: "mail" },
  protonmail: { label: "Proton Mail", kind: "Mail", icon: "mail" },
  fastmail: { label: "Fastmail", kind: "Mail", icon: "mail" },
  slack: { label: "Slack", kind: "Messages", icon: "message-circle" },
  telegram: { label: "Telegram", kind: "Messages", icon: "message-circle" },
  discord: { label: "Discord", kind: "Messages", icon: "message-circle" },
  zoom: { label: "Zoom", kind: "Meetings", icon: "video" },
  calendly: { label: "Calendly", kind: "Scheduling", icon: "calendar-days" },
  notion: { label: "Notion", kind: "Docs & wiki", icon: "file-text" },
  linear: { label: "Linear", kind: "Issues", icon: "list-checks" },
  jira: { label: "Jira", kind: "Issues", icon: "list-checks" },
  asana: { label: "Asana", kind: "Projects", icon: "list-checks" },
  trello: { label: "Trello", kind: "Boards", icon: "list-checks" },
  clickup: { label: "ClickUp", kind: "Projects", icon: "list-checks" },
  todoist: { label: "Todoist", kind: "Tasks", icon: "list-checks" },
  obsidian: { label: "Obsidian", kind: "Notes", icon: "file-text" },
  evernote: { label: "Evernote", kind: "Notes", icon: "file-text" },
  gdrive: { label: "Google Drive", kind: "Files", icon: "folder" },
  dropbox: { label: "Dropbox", kind: "Files", icon: "folder" },
  iclouddrive: { label: "iCloud Drive", kind: "Files", icon: "folder" },
  onedrive: { label: "OneDrive", kind: "Files", icon: "folder" },
  box: { label: "Box", kind: "Files", icon: "folder" },
  github: { label: "GitHub", kind: "Code", icon: "folder" },
  figma: { label: "Figma", kind: "Design", icon: "image" },
  canva: { label: "Canva", kind: "Design", icon: "image" },
  miro: { label: "Miro", kind: "Whiteboard", icon: "image" },
  spotify: { label: "Spotify", kind: "Music", icon: "music" }
};
const CONN_CAL = { google: "gcal", apple: "ical", outlook: "ocal" };
const CONN_SOURCE = { gcal: "google", ical: "apple", ocal: "outlook" };
/* What each calendar brings in on first sync (Event rows, NEEDT.eventAt). */
const CONN_SAMPLE = {
  google: [[2, 10, 60, "Design review"], [3, 14, 30, "Team sync"], [4, 9.5, 30, "Hiring screen"]],
  apple: [[4, 8.5, 45, "Dentist"], [5, 19, 120, "Dinner with Lena"], [6, 11, 60, "Call Mum"]],
  outlook: [[2, 15, 90, "Quarterly planning"], [3, 9, 30, "Vendor call — Atelier Brun"], [4, 12, 45, "Lunch & learn"]]
};
let connState = (() => {
  const v = nsGet("needt.connections", {}) || {};
  const out = Object.assign({}, CONN_DEFAULT, v);
  Object.keys(out).forEach((k) => { if (out[k] === "connecting") out[k] = "disconnected"; });
  return out;
})();
/* ---------- calendar sync settings (08.10.26) ----------
   (here so connections.jsx and the phone's phone-places.jsx share one copy)
   Calendars moved out of Settings into their own cards: ⋯ → "Sync settings".
   Which calendars sync is a list per account in needtSettings ("google",
   "apple", "outlookCal"; the older true/false means all/none). Declined,
   all-day and write-back are one choice for every calendar ("declined",
   "allDay", "writeBack") — the same keys Settings used. */
const CN_CAL_SYNC = {
  gcal: { key: "google", cals: [["Maksym", "blue"], ["Demesures", "violet"], ["Holidays in Switzerland", "green"]] },
  ical: { key: "apple", cals: [["Personal", "orange"], ["Family", "pink"]] },
  ocal: { key: "outlookCal", cals: [["Calendar", "blue"], ["Birthdays", "yellow"]] }
};
const cnCalOn = (id, v) => {
  const d = CN_CAL_SYNC[id], all = d.cals.map((c) => c[0]), x = v[d.key];
  return Array.isArray(x) ? x.filter((n) => all.indexOf(n) >= 0) : x === false ? [] : all;
};
Object.assign(window, { CN_CAL_SYNC, cnCalOn });
const connTimers = {};
const CONN_TOKEN = {};
/* Another window connected or disconnected something: take its states (a
   handshake in flight elsewhere shows as connecting here too) and tell the
   screens, as a local change would. */
nsOn("needt.connections", (v, info) => {
  if (info.source === CONN_TOKEN || !v || typeof v !== "object") return;
  const before = connState;
  connState = Object.assign({}, CONN_DEFAULT, v);
  const ids = Object.keys(connState).filter((k) => connState[k] !== before[k]);
  if (ids.length) window.dispatchEvent(new CustomEvent("needt-connections", { detail: { id: ids[0], state: connState[ids[0]], ids: ids, all: Object.assign({}, connState), remote: info.origin === "remote" } }));
});
const connSyncEvents = (provider, on) => {
  const C = window.calEvents, N = window.NEEDT; if (!C || !N || !N.eventAt) return;
  const pre = "sync-" + provider + "-";
  if (!on) { C.store.set((l) => l.filter((e) => String(e.id).indexOf(pre) !== 0)); return; }
  const have = {}; C.store.get().forEach((e) => { have[e.id] = 1; });
  const add = (CONN_SAMPLE[provider] || []).map(([d, h, m, title], i) => N.eventAt(d, h, m, { id: pre + i, title: title, calendarId: provider, source: provider, externalId: provider + "-ob-" + i }))
    .filter((e) => !have[e.id]);
  if (add.length) C.store.set((l) => l.concat(add));
};
const connections = {
  meta: CONN_META,
  calendarOf: (provider) => CONN_CAL[provider] || provider,
  get: () => Object.assign({}, connState),
  set: (id, state) => {
    connState = Object.assign({}, connState, { [id]: state });
    nsSet("needt.connections", connState, { source: CONN_TOKEN });
    /* A calendar that goes away takes the events it synced with it. */
    if (CONN_SOURCE[id] && state !== "connected" && state !== "connecting") connSyncEvents(CONN_SOURCE[id], false);
    window.dispatchEvent(new CustomEvent("needt-connections", { detail: { id: id, state: state, all: Object.assign({}, connState) } }));
  },
  reconnect: (id) => {
    if (connState[id] === "connecting" || connState[id] === "connected") return;
    connections.set(id, "connecting");
    window.clearTimeout(connTimers[id]);
    connTimers[id] = window.setTimeout(() => {
      connections.set(id, "connected");
      if (CONN_SOURCE[id]) connSyncEvents(CONN_SOURCE[id], true);
      const m = CONN_META[id] || { label: id };
      if (window.toast) window.toast(m.label + " reconnected — " + (id === "outlook" ? "2 new messages synced" : "up to date"));
    }, 1200);
  },
  authorize: (provider) => new Promise((resolve, reject) => {
    const id = CONN_CAL[provider] || provider, before = connState[id];
    const S = window.needtStates, st = S && S.get ? S.get("auth") || {} : {};
    connections.set(id, "connecting");
    window.clearTimeout(connTimers[id]);
    connTimers[id] = window.setTimeout(() => {
      const now = S && S.get ? S.get("auth") || {} : st;
      if (now.offline || now.load === "error") {
        connections.set(id, before && before !== "connecting" ? before : "none");
        reject(now.offline ? "offline" : "error"); return;
      }
      connections.set(id, "connected");
      connSyncEvents(CONN_SOURCE[id] || provider, true);
      resolve(id);
    }, 1200);
  })
};
window.connections = connections;

/* Onboarding's calendar connect (08.10.26), shared by desktop and phone:
   a pick runs the mock OAuth through window.connections.authorize (stores.jsx)
   — busy for ~1.2 s, then connected, its events synced into the calendar.
   Offline, a pick waits and connects once back; a failure says so on the row.
   Unpicking a connected calendar disconnects it (its synced events go too). */
const CAL_CONNECT_IDS = ["google", "apple", "outlook"];
function useCalConnect(offline) {
  const [link, setLink] = React.useState({});
  const [skip, setSkip] = React.useState(false);
  const live = React.useRef(true);
  React.useEffect(() => () => { live.current = false; }, []);
  const put = (id, v) => { if (live.current) setLink((m) => Object.assign({}, m, { [id]: v })); };
  const run = (id) => {
    const C = window.connections;
    if (!C || !C.authorize) { put(id, "on"); return; }
    put(id, "busy");
    C.authorize(id).then(() => put(id, "on"), (why) => put(id, why === "offline" ? "waiting" : "error"));
  };
  /* Back online: whatever was picked while offline connects now. */
  React.useEffect(() => { if (!offline) CAL_CONNECT_IDS.forEach((id) => { if (link[id] === "waiting") run(id); }); }, [offline]);
  const unlink = (id) => { const C = window.connections; if (C && C.set) C.set(C.calendarOf ? C.calendarOf(id) : id, "none"); put(id, null); };
  const toggle = (id) => {
    if (id === "skip") { if (!skip) CAL_CONNECT_IDS.forEach((k) => { if (link[k] === "on") unlink(k); else if (link[k]) put(k, null); }); setSkip(!skip); return; }
    setSkip(false);
    const s = link[id];
    if (s === "busy") return;
    if (s === "on") { unlink(id); return; }
    if (s === "waiting") { put(id, null); return; }
    if (offline) { put(id, "waiting"); return; }
    run(id);
  };
  const connected = CAL_CONNECT_IDS.filter((k) => link[k] === "on");
  const picked = CAL_CONNECT_IDS.filter((k) => link[k] && link[k] !== "error");
  return { link: link, skip: skip, toggle: toggle, connected: connected, picked: picked, busy: CAL_CONNECT_IDS.some((k) => link[k] === "busy") };
}
const CAL_CONNECT_NOTE = {
  busy: () => "Connecting…",
  on: () => "Connected · 3 events synced to your calendar",
  error: () => "Couldn't connect — the sign-in didn't finish. Try again.",
  waiting: () => "Connects when you're back online"
};
Object.assign(window, { connections, useCalConnect, CAL_CONNECT_NOTE });

/* MCP LINKS / API LINKS (08.10.26, owner, from Craft) — the user's own access
   points into Needt, listed under Connections → AI tools.
   window.mcpLinks (localStorage "needt.mcpLinks") — for AI tools.
   window.apiLinks (localStorage "needt.apiLinks") — for workflows and shortcuts.
   A link: { id, name, url, scope, permission, access, projectIds, createdAt }
     scope       "all" (All docs & tasks) | "daily" (Daily notes & tasks) | "projects" (Selected projects → projectIds)
     permission  "read" | "write" (Read and write)
     access      "private" (needs a sign-in token) | "public" (anyone with the link)
   The URL is https://mcp.needt.app/links/<secret> (API: api.needt.app); the
   secret is a mock — Regenerate swaps it and the old URL stops working.
   create(p) → link · patch(id, p) · regenerate(id) → link · remove(id) → undo().
   API: GET/POST /links?kind=mcp|api, PATCH /links/:id, POST /links/:id/rotate,
   DELETE /links/:id. */
const linkSecret = () => { let s = ""; const a = "abcdefghijkmnpqrstuvwxyz23456789"; for (let i = 0; i < 22; i++) s += a[Math.floor(Math.random() * a.length)]; return s; };
function makeLinkStore(key, base, seed) {
  const saved = nsGet(key, null);
  const store = makeStore(Array.isArray(saved) ? saved : seed);
  nsBind(store, key, { load: (l) => (Array.isArray(l) ? l : []) });
  const find = (id) => store.get().find((l) => l.id === id);
  return {
    store, base, find,
    list: () => store.get(),
    create(p) {
      const l = Object.assign({ id: "lnk_" + linkSecret().slice(0, 10), name: "Untitled", url: base + linkSecret(), scope: "daily", permission: "read", access: "private", projectIds: [], createdAt: new Date().toISOString() }, p || {});
      store.set((x) => x.concat([l]));
      return l;
    },
    patch(id, p) { store.set((x) => x.map((l) => (l.id === id ? Object.assign({}, l, p) : l))); },
    regenerate(id) { const url = base + linkSecret(); store.set((x) => x.map((l) => (l.id === id ? Object.assign({}, l, { url: url }) : l))); return find(id); },
    remove(id) {
      const all = store.get(), at = all.findIndex((l) => l.id === id), gone = all[at];
      if (!gone) return () => {};
      store.set((x) => x.filter((l) => l.id !== id));
      return () => store.set((x) => { if (x.some((l) => l.id === id)) return x; const n = x.slice(); n.splice(Math.min(at, n.length), 0, gone); return n; });
    }
  };
}
const mcpLinks = makeLinkStore("needt.mcpLinks", "https://mcp.needt.app/links/", [
  { id: "lnk_mcpdaily01", name: "MCP for Daily notes & tasks", url: "https://mcp.needt.app/links/k7r2mxq9vd3hpn4wtc8bza", scope: "daily", permission: "read", access: "private", projectIds: [], createdAt: "2026-10-02T09:14:00.000Z" }
]);
const apiLinks = makeLinkStore("needt.apiLinks", "https://api.needt.app/links/", [
  { id: "lnk_apidaily01", name: "API for Daily notes & tasks", url: "https://api.needt.app/links/f3wq8nzk2ycv6trh9mpd4a", scope: "daily", permission: "write", access: "private", projectIds: [], createdAt: "2026-10-03T16:40:00.000Z" }
]);
function useLinks(api) { return useStore(api.store); }
Object.assign(window, { mcpLinks, apiLinks, useLinks });

Object.assign(window, { makeStore, useStore, docStore, openStore, docs, useDocs, useOpenDoc, toast, ToastLayer, needtSettings, useSettings,
  habitStore, habitCheckinStore, habitApi, useHabits, mailThreadStore, mailApi, mailUnread, useMail, boardStore, boardsView });
try { Object.defineProperty(window, "HABITS", { configurable: true, get: () => habitApi.list() }); } catch (e) {}
