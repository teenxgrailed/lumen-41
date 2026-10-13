/* THE DATA — one place where the facts live.
 *
 * Before this file the kit carried FOUR project registries (`RB_PROJECTS` by
 * key, `CV_PROJECTS` by name, `PROJECTS` in BlockDesigns, `GRID_PROJECT` as an
 * alias table) and the current date was typed out in six files. They drifted,
 * twice: the month disagreed with the week about which day 1 September was,
 * and a habit wore Operations' orange because a missing project fell back to
 * "ops". Neither was a rendering bug — both were two copies of one fact.
 *
 * So: one date, one project registry, one calendar registry, one habit list.
 * Screens keep their own seed of blocks, because a block's position in a day
 * is composition rather than data — but every hue, glyph and name they use is
 * resolved from here.
 */
const NEEDT = (function () {
  /* THE DATE. Everything that says "today" derives from this one value; the
     kit is a Tuesday in September so the week has a middle to sit in. */
  const today = new Date(2026, 8, 1);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  /* THE PROJECTS. A project owns its colour and its icon, and that is the
     whole colour policy of the product: the colour on screen is the person's
     own data. Fields match the database (Project: id, name, color, icon); a
     task refers to its project by `projectId`, never by name. */
  /* THE ONE LIST OF SEED PROJECTS: stores.jsx's PROJECT_SEEDS (the project
     store's first fill) is derived from it, so the two can't drift. `ground`
     is the project card's frame tint. */
  const projects = [
    { id: "ops",    name: "Operations",    color: "var(--hue-orange)", icon: "briefcase", ground: "sand" },
    { id: "ds",     name: "Design system", color: "var(--hue-blue)", icon: "component", ground: "sage" },
    { id: "german", name: "German",        color: "var(--hue-violet)", icon: "graduation-cap", ground: "stone" },
    { id: "resale", name: "Resale",        color: "var(--hue-green)", icon: "package", ground: "mist" },
    { id: "life",   name: "Life",          color: "var(--hue-yellow)", icon: "heart", ground: "sand" }
  ];
  /* Aliases the seeds already use. Kept here rather than in the screens, so a
     renamed project is one edit. */
  const alias = { de: "german", personal: "life" };

  const byId = {};
  const byName = {};
  projects.forEach((p) => { byId[p.id] = p; byName[p.name] = p; });

  /* The user's own projects live in work.jsx's store (desktop) or in
     "needt.projects.all" (phone); both carry ids, so one lookup covers them. */
  function userProjects() {
    if (typeof window !== "undefined" && window.projectStore) return window.projectStore.get().list || [];
    try { const l = JSON.parse(localStorage.getItem("needt.projects.all")); return Array.isArray(l) ? l : []; } catch (e) { return []; }
  }

  /* One resolver for id, name and alias, and one honest answer when there is
     no project: null. A fallback here is how a habit ended up orange. Always
     returns the display shape {id, name, color, icon}. */
  function project(ref) {
    if (!ref) return null;
    const seed = byId[ref] || byName[ref] || byId[alias[ref]];
    const own = userProjects().find((p) => p && (p.id === ref || p.name === ref));
    if (own) return { id: own.id || (seed && seed.id) || slugId(own.name), name: own.name, color: own.color || (seed && seed.color) || null, icon: own.icon || (seed && seed.icon) || "folder" };
    return seed || null;
  }
  function slugId(name) { return "p-" + String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  /* name → id, for anything that still speaks names (the composer, imports,
     old storage). Unknown names get a stable slug id. */
  function projectIdOf(name) { if (!name) return null; const p = project(name); return p ? p.id : slugId(name); }
  function projectName(t) { const p = t ? project(t.projectId) : null; return p ? p.name : null; }

  /* THE CALENDARS. An event has no project, so its calendar owns its hue —
     the same two slots as a task, different owners. */
  const calendars = {
    work:     { name: "Work",     color: "var(--accent)" },
    personal: { name: "Personal", color: "var(--success)" },
    family:   { name: "Family",   color: "var(--info)" }
  };

  /* THE HABITS (database form, 07.10.26). Habit {id, title, projectId, color,
     icon, schedule, archivedAt}; schedule = {time: "HH:mm" | null, perWeek:
     number | null} (perWeek null = every day). What happened lives in
     HabitCheckin {habitId, date "YYYY-MM-DD", done} — one row per ticked (or
     unticked) day; the fourteen-day strip and the streak are computed from
     them (habitDays, habitStreak). A miss is a missing row and nothing else.
     The seed's checkins are written from the old fourteen-day strips below. */
  const habits = [
    { id: "de", title: "German", projectId: "german", color: null, icon: null, schedule: { time: "18:00", perWeek: null }, archivedAt: null },
    { id: "walk", title: "Walk before work", projectId: null, color: null, icon: null, schedule: { time: "08:15", perWeek: null }, archivedAt: null },
    { id: "gym", title: "Gym", projectId: null, color: null, icon: null, schedule: { time: "07:00", perWeek: 3 }, archivedAt: null },
    { id: "read", title: "Read twenty pages", projectId: null, color: null, icon: null, schedule: { time: null, perWeek: null }, archivedAt: null }
  ];
  /* Strips: the last fourteen days, oldest first, the last one is today. */
  const HABIT_STRIPS = {
    de:   [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1],
    walk: [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0],
    gym:  [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0],
    read: [0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1]
  };

  /* THE STAGES. Named, ordered, and the same for every project — a per-project
     stage set is a second thing to maintain and nobody maintains it. */
  const stages = [
    { id: "todo", name: "To do" },
    { id: "doing", name: "In progress" },
    { id: "review", name: "In review" },
    { id: "done", name: "Done" }
  ];

  /* THE PEOPLE. A workspace has more than one person in it, and each of them
     owns a hue the same way a project does — the face is that hue, so who is
     carrying what is read at a glance rather than by name. */
  const people = [
    { id: "you",  name: "You",  initials: "MK", hue: "var(--hue-orange)" },
    { id: "anna", name: "Anna", initials: "AN", hue: "var(--hue-blue)" },
    { id: "tom",  name: "Tom",  initials: "TM", hue: "var(--hue-green)" },
    { id: "lena", name: "Lena", initials: "LN", hue: "var(--hue-violet)" }
  ];
  const byPerson = {};
  people.forEach((p) => { byPerson[p.id] = p; });
  function person(ref) { return byPerson[ref] || byPerson.you; }

  /* DATES. The database speaks ISO: dueDate is "YYYY-MM-DD", scheduledStart
     and scheduledEnd are local "YYYY-MM-DDTHH:mm". The screens still think in
     "4 Sep" and decimal hours, so these turn one into the other and the UI
     maths stays as simple as it was. */
  const pad2 = (n) => String(n).padStart(2, "0");
  function iso(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function fromIso(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  const DOW_LONG = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  /* Anything a person or an old record calls a day → "YYYY-MM-DD", or null.
     "4 Sep", "Today", "Tomorrow", "Fri", "This weekend", an ISO string. */
  function toDate(v) {
    if (v == null || v === "") return null;
    if (v instanceof Date) return iso(v);
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const w = s.toLowerCase().replace(/^by\s+/, "");
    if (w === "today" || w === "tonight") return iso(today);
    if (w === "tomorrow" || w === "tom") return iso(addDays(today, 1));
    if (w === "this weekend") return iso(addDays(today, (6 - today.getDay() + 7) % 7));
    if (w === "next week") return iso(addDays(today, ((1 - today.getDay() + 7) % 7) || 7));
    const inN = /^in (\d+) days?$/.exec(w); if (inN) return iso(addDays(today, +inN[1]));
    const dm = /^(\d{1,2})\s+([a-z]{3})/.exec(w);
    if (dm) { const mi = MONTHS.findIndex((m) => m.toLowerCase() === dm[2]); if (mi > -1) return iso(new Date(today.getFullYear(), mi, +dm[1])); }
    const di = DOW_LONG.findIndex((d) => w.length >= 3 && d.indexOf(w) === 0);
    if (di > -1) return iso(addDays(today, (di - today.getDay() + 7) % 7));
    return null;
  }
  /* "2026-09-04" → "4 Sep" — the label the screens always printed. */
  function dayLabel(isoDay) { const d = fromIso(isoDay); return d ? d.getDate() + " " + MONTHS[d.getMonth()] : null; }
  function dueLabel(t) { return t && t.dueDate ? dayLabel(t.dueDate) : null; }
  /* Day of the month the task is due on, or null — the prototype's day model. */
  function dueDay(t) { const d = t && t.dueDate ? fromIso(t.dueDate) : null; return d ? d.getDate() : null; }
  /* Decimal hour ↔ "HH:mm". */
  function hhmm(h) { if (h == null) return null; let m = Math.round(h * 60); return pad2(Math.floor(m / 60) % 24) + ":" + pad2(m % 60); }
  function stamp(isoDay, hour) { return isoDay && hour != null ? isoDay + "T" + hhmm(hour) : null; }
  function hourOf(stampStr) { const m = /T(\d{2}):(\d{2})/.exec(stampStr || ""); return m ? +m[1] + +m[2] / 60 : null; }
  function addMinutes(stampStr, min) {
    const d = fromIso(stampStr), h = hourOf(stampStr);
    if (!d || h == null) return null;
    d.setMinutes(Math.round(h * 60) + (min || 0));
    return iso(d) + "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  /* The hour a task sits at (decimal), or null when it has no place in a day. */
  function at(t) { return t ? hourOf(t.scheduledStart) : null; }
  function timeLabel(t) { return t && t.scheduledStart ? t.scheduledStart.slice(11, 16) : null; }
  /* scheduledEnd is always start + estimatedMinutes; recomputed, never typed. */
  function endOf(t) { return t.scheduledStart ? addMinutes(t.scheduledStart, t.estimatedMinutes || 30) : null; }
  function sync(t) {
    if (!t) return t;
    const end = endOf(t);
    return (t.scheduledEnd || null) === end ? t : Object.assign({}, t, { scheduledEnd: end });
  }
  /* A patch that puts the task on another day, keeping its hour. */
  function moveDay(t, day) {
    const d = toDate(day);
    const p = { dueDate: d };
    if (t && t.scheduledStart && d) { p.scheduledStart = d + t.scheduledStart.slice(10); p.scheduledEnd = addMinutes(p.scheduledStart, t.estimatedMinutes || 30); }
    return p;
  }
  /* A patch that places the task at an hour on a day (the user's choice). */
  function placeAt(t, day, hour) {
    const d = toDate(day) || (t && t.dueDate) || iso(today);
    const start = stamp(d, hour);
    return { dueDate: d, scheduledStart: start, scheduledEnd: addMinutes(start, (t && t.estimatedMinutes) || 30), isFixed: true };
  }

  /* NOTES (09.10.26). A task's notes are one field, `notes`: plain text
     (newlines kept). Older records carry the desktop's sanitised HTML in
     `description`, the phone's plain text in `description`, or the legacy
     `note`; notesText reads any of them as text and migrateTask folds them
     into `notes` (description / note are dropped). */
  function notesText(v) {
    if (v == null || v === "") return null;
    let s = String(v);
    if (/<[a-z][\s\S]*>/i.test(s)) {
      s = s.replace(/\r?\n/g, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li[^>]*>/gi, "- ")
        .replace(/<\/(p|div|li|h[1-6]|blockquote|pre)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
      s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    }
    s = s.replace(/^\s+|\s+$/g, "");
    return s || null;
  }
  function migrateNotes(o) {
    if (!("description" in o) && !("note" in o)) return o;
    const t = Object.assign({}, o);
    if (t.notes == null) t.notes = notesText(o.description != null && o.description !== "" ? o.description : o.note);
    delete t.description; delete t.note;
    if (t.notes == null) delete t.notes;
    return t;
  }

  /* MIGRATION. Storage written before the database names (est, due, project
     by name, at/time, parts, waitsOn, stage, description / note) is read once
     and rewritten. */
  function migrateTask(o) {
    if (!o || typeof o !== "object") return o;
    o = migrateNotes(o);
    const old = ["est", "due", "project", "at", "time", "parts", "waitsOn", "stage"].some((k) => k in o);
    if (!old) return sync(o);
    const t = {};
    Object.keys(o).forEach((k) => { if (["est", "due", "project", "at", "time", "parts", "waitsOn", "stage"].indexOf(k) < 0) t[k] = o[k]; });
    if ("project" in o) t.projectId = projectIdOf(o.project);
    if ("est" in o) t.estimatedMinutes = o.est == null ? null : o.est;
    let day = toDate(o.due);
    if (o.time && !day && !/^\d{1,2}:\d{2}$/.test(o.time)) day = toDate(o.time);
    if (o.due != null || day) t.dueDate = day;
    let hour = o.at != null ? Number(o.at) : null;
    if (hour == null && /^\d{1,2}:\d{2}$/.test(o.time || "")) hour = hourOf("T" + pad2(o.time.split(":")[0]) + ":" + o.time.split(":")[1]);
    if (hour != null) t.scheduledStart = stamp(day || iso(today), hour);
    if (o.time) t.isFixed = true;
    if (o.parts) t.TaskPart = o.parts.map((p, i) => ({ id: p.id || (o.id + "." + (i + 1)), title: p.title, done: !!p.done }));
    if (o.waitsOn) t.TaskWait = { personId: o.waitsOn.on, reason: o.waitsOn.for };
    if (o.stage) t.Stage = o.stage;
    return sync(t);
  }
  function migrateProject(o) {
    if (!o || typeof o !== "object") return o;
    if ("color" in o && o.id) return o;
    const seed = byName[o.name] || byId[o.id];
    const p = {};
    Object.keys(o).forEach((k) => { if (k !== "hue" && k !== "glyph") p[k] = o[k]; });
    p.id = o.id || (seed ? seed.id : slugId(o.name));
    p.color = o.color || o.hue || (seed ? seed.color : null);
    p.icon = o.icon || o.glyph || (seed ? seed.icon : "folder");
    return p;
  }
  function migrateDoc(o) {
    if (!o || typeof o !== "object") return o;
    const old = ["starred", "trashed", "theme", "ground", "cover", "project"].some((k) => k in o) || (o.style && "cover" in o.style);
    if (!old) return o;
    const d = {};
    Object.keys(o).forEach((k) => { if (["starred", "trashed", "theme", "ground", "cover", "project"].indexOf(k) < 0) d[k] = o[k]; });
    const st = Object.assign({}, o.style && typeof o.style === "object" ? o.style : {});
    const cover = st.cover;
    delete st.cover;
    if (o.theme) st.theme = o.theme;
    if (o.ground) st.ground = o.ground;
    d.style = Object.keys(st).length ? st : null;
    d.coverUrl = o.coverUrl || cover || null;
    d.isFavorite = !!(o.isFavorite || o.starred);
    d.trashedAt = o.trashedAt && /^\d{4}-/.test(o.trashedAt) ? o.trashedAt : (o.trashed ? new Date().toISOString() : null);
    if ("project" in o) d.projectId = projectIdOf(o.project);
    return d;
  }
  /* ---------- HABITS (07.10.26) ----------
     Pure helpers over Habit + HabitCheckin. `checkins` defaults to the live
     list (window.habitApi) and falls back to the seed. */
  function checkinsFromStrip(habitId, strip, end) {
    const out = [];
    (strip || []).forEach((d, i) => { if (d) out.push({ habitId: habitId, date: iso(addDays(end || today, i - (strip.length - 1))), done: true }); });
    return out;
  }
  const habitCheckins = [].concat.apply([], habits.map((h) => checkinsFromStrip(h.id, HABIT_STRIPS[h.id])));
  function liveCheckins(list) {
    if (list) return list;
    try { if (typeof window !== "undefined" && window.habitApi && window.habitApi.checkins) return window.habitApi.checkins(); } catch (e) {}
    return habitCheckins;
  }
  function habitDoneOn(habitId, date, checkins) {
    const d = toDate(date) || iso(today);
    return liveCheckins(checkins).some((c) => c.habitId === habitId && c.date === d && c.done);
  }
  /* The last n days (default 14), oldest first, as 1 / 0 — the strip. */
  function habitDays(habitId, checkins, n, end) {
    const N = n || 14, last = end ? fromIso(toDate(end)) : today;
    const on = {};
    liveCheckins(checkins).forEach((c) => { if (c.habitId === habitId && c.done) on[c.date] = 1; });
    const out = [];
    for (let i = N - 1; i >= 0; i--) out.push(on[iso(addDays(last, -i))] ? 1 : 0);
    return out;
  }
  function habitKept(habitId, checkins, n) { return habitDays(habitId, checkins, n || 14).reduce((s, d) => s + d, 0); }
  /* Days kept in a row, ending today when today is kept, else yesterday —
     today is still open, so a not-yet-kept today does not break it. */
  function habitStreak(habitId, checkins) {
    const days = habitDays(habitId, checkins, 400);
    let i = days.length - 1, n = 0;
    if (!days[i]) i--;
    for (; i >= 0 && days[i]; i--) n++;
    return n;
  }
  /* Kept this week (the last seven days) — what a perWeek habit is measured by. */
  function habitWeek(habitId, checkins) { return habitDays(habitId, checkins, 7).reduce((s, d) => s + d, 0); }
  function habitTime(h) { return (h && h.schedule && h.schedule.time) || null; }
  function habitPerWeek(h) { return (h && h.schedule && h.schedule.perWeek) || null; }
  /* The habit's own colour, else its project's, else null (the caller's grey). */
  function habitColor(h) {
    if (!h) return null;
    if (h.color) return h.color;
    const p = h.projectId ? project(h.projectId) : null;
    return p ? p.color || null : null;
  }
  function liveHabits(list) { return (list || []).filter((h) => h && !h.archivedAt); }
  /* Upsert one checkin: the list with (habitId, date) set to done. */
  function setCheckin(checkins, habitId, date, done) {
    const d = toDate(date) || iso(today);
    let hit = false;
    const out = (checkins || []).map((c) => { if (c.habitId === habitId && c.date === d) { hit = true; return Object.assign({}, c, { done: !!done }); } return c; });
    if (!hit) out.push({ habitId: habitId, date: d, done: !!done });
    return out;
  }
  /* Old {id, title, at, quota, project (name), done[14]} → {habit, checkins}. */
  function isOldHabit(o) { return !!o && typeof o === "object" && ["done", "project", "at", "quota"].some((k) => k in o); }
  function migrateHabit(o) {
    if (!isOldHabit(o)) return { habit: o, checkins: [] };
    const h = {};
    Object.keys(o).forEach((k) => { if (["done", "project", "at", "quota"].indexOf(k) < 0) h[k] = o[k]; });
    if (!("projectId" in h)) h.projectId = o.project ? projectIdOf(o.project) : null;
    if (!("color" in h)) h.color = null;
    if (!("icon" in h)) h.icon = null;
    h.schedule = h.schedule || { time: o.at || null, perWeek: o.quota || null };
    if (!("archivedAt" in h)) h.archivedAt = null;
    return { habit: h, checkins: Array.isArray(o.done) ? checkinsFromStrip(o.id, o.done) : [] };
  }
  /* A habit patch in old words (at, quota, project) → database words. Used by
     callers that still speak the old shape (App's composer). */
  function habitPatch(p) {
    if (!p) return p;
    const out = {};
    Object.keys(p).forEach((k) => { if (["at", "quota", "project", "done"].indexOf(k) < 0) out[k] = p[k]; });
    if ("project" in p && !("projectId" in p)) out.projectId = p.project ? projectIdOf(p.project) : null;
    if ("at" in p || "quota" in p) out.schedule = Object.assign({}, p.schedule || {}, "at" in p ? { time: p.at || null } : {}, "quota" in p ? { perWeek: p.quota || null } : {});
    return out;
  }

  /* ---------- EVENTS (07.10.26) ----------
     Event {id, title, startAt, endAt ("YYYY-MM-DDTHH:mm" local), isAllDay,
     calendarId, source: "needt" | "google" | "apple" | "outlook", externalId}.
     An all-day event's startAt / endAt are "YYYY-MM-DDT00:00" (end exclusive).
     The calendar still draws blocks by day of month + decimal hour + minutes:
     eventBlock() turns one into the other. */
  /* The prototype's week runs 31 Aug – 6 Sep: a day of month above 20 is
     August, anything else September (only used for old {day} records). */
  function dayIso(n) { if (n == null) return iso(today); const m = n > 20 ? today.getMonth() - 1 : today.getMonth(); return iso(new Date(today.getFullYear(), m, n)); }
  function minutesBetween(a, b) {
    const da = fromIso(a), db = fromIso(b), ha = hourOf(a), hb = hourOf(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / 60000 + ((hb || 0) - (ha || 0)) * 60);
  }
  function makeEvent(p) {
    const e = Object.assign({ id: "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: "New event", startAt: null, endAt: null,
      isAllDay: false, calendarId: "personal", source: "needt", externalId: null }, p || {});
    if (e.startAt && !e.endAt) e.endAt = e.isAllDay ? iso(addDays(fromIso(e.startAt), 1)) + "T00:00" : addMinutes(e.startAt, 60);
    return e;
  }
  /* An event at a day (ISO, or day of month) and decimal hour, for minutes. */
  function eventAt(day, hour, minutes, extra) {
    const d = typeof day === "number" ? dayIso(day) : (toDate(day) || iso(today));
    const start = stamp(d, hour == null ? 9 : hour);
    return makeEvent(Object.assign({ startAt: start, endAt: addMinutes(start, minutes || 60) }, extra || {}));
  }
  function isOldEvent(o) { return !!o && typeof o === "object" && ["day", "at", "len"].some((k) => k in o) && !("startAt" in o); }
  /* Old {id, day (of month), at (decimal hour), len (min), title} → Event. */
  function migrateEvent(o) {
    if (!isOldEvent(o)) return o && typeof o === "object" ? makeEvent(o) : o;
    const rest = {};
    Object.keys(o).forEach((k) => { if (["day", "at", "len"].indexOf(k) < 0) rest[k] = o[k]; });
    return eventAt(o.day == null ? today.getDate() : o.day, o.at == null ? 9 : Number(o.at), o.len || 60, rest);
  }
  function eventMinutes(e) { return e && e.startAt && e.endAt ? minutesBetween(e.startAt, e.endAt) : 0; }
  /* The calendar's drawing shape: {id, day (of month), at (decimal hour, null
     when all day), len (min), title}, plus the event's own fields. */
  function eventBlock(e) {
    const d = e && e.startAt ? fromIso(e.startAt) : null;
    return Object.assign({}, e, { day: d ? d.getDate() : null, date: e && e.startAt ? e.startAt.slice(0, 10) : null,
      at: e && !e.isAllDay ? hourOf(e.startAt) : null, len: e && !e.isAllDay ? eventMinutes(e) : 0 });
  }
  /* Events that touch [from, to): ISO days or stamps; a day bound covers the day. */
  function eventsInRange(list, from, to) {
    const lo = from ? (from.length > 10 ? from : from + "T00:00") : "0000";
    const hi = to ? (to.length > 10 ? to : to + "T00:00") : "9999";
    return (list || []).filter((e) => e && e.startAt && e.startAt < hi && (e.endAt || e.startAt) > lo);
  }
  /* The patch that moves an event to a new start, keeping its length. */
  function moveEvent(e, startAt) {
    const len = eventMinutes(e) || 60;
    if (e && e.isAllDay) { const d = toDate(startAt); return { startAt: d + "T00:00", endAt: iso(addDays(fromIso(d), Math.max(1, Math.round(len / 1440)))) + "T00:00" }; }
    return { startAt: startAt, endAt: addMinutes(startAt, len) };
  }

  /* ---------- MAIL (07.10.26) ----------
     MailThread {id, accountId ("gmail" | "outlook"), subject, from, fromEmail,
     receivedAt ("YYYY-MM-DDTHH:mm"), preview, body [paragraphs], attachment,
     isRead, isArchived, trashedAt, taskId, needsReply, suggestedTask}. The
     state that used to live in the made / read / gone maps is on the thread. */
  const T0 = iso(today), T1 = iso(addDays(today, -1));
  const mail = [
    { id: 1, accountId: "gmail", from: "Jonas Weber", fromEmail: "jonas@weber-vintage.de", receivedAt: T0 + "T09:12", isRead: false, needsReply: true,
      subject: "Berlin pickup — Thursday or Friday?", preview: "Hi Maksym, the two pairs are still on hold for me, right? I can come by Thursday after six or Friday morning…",
      body: ["Hi Maksym,", "the two pairs are still on hold for me, right? I can come by Thursday after six or Friday morning, whichever suits you.", "If it helps I can pay the CHF 560 in cash on pickup, or TWINT the day before.", "Best, Jonas"],
      suggestedTask: "Reply to the Berlin buyer" },
    { id: 2, accountId: "gmail", from: "Print Atelier Zürich", fromEmail: "orders@printatelier.ch", receivedAt: T0 + "T08:40", isRead: false, needsReply: true,
      subject: "Proof ready — Demesures tank, front print", preview: "Your proof is attached. Please confirm the colour and the placement before 14:00 so we can run it today.",
      body: ["Hello,", "your proof is attached. Please confirm the colour and the placement before 14:00 so we can run it today.", "Placement: 7 cm under the collar, centred. Ink: off-white on black.", "Kind regards, Print Atelier"],
      suggestedTask: "Check the print proof", attachment: "proof-tank-front.pdf · 2.4 MB" },
    { id: 3, accountId: "outlook", from: "Lena Fischer", fromEmail: "lena@needt.app", receivedAt: T0 + "T07:55", isRead: true, needsReply: true,
      subject: "Type scale — 13 or 14 for chrome?", preview: "I tried 14 in the sidebar and it starts to read like content. Want to keep 13/12?",
      body: ["Hey,", "I tried 14 in the sidebar and it starts to read like content. Want to keep 13/12 and only use 15 inside documents?", "L."],
      suggestedTask: "Reply to Lena about the type scale" },
    { id: 4, accountId: "gmail", from: "Swiss Post", fromEmail: "noreply@post.ch", receivedAt: T1 + "T18:02", isRead: true,
      subject: "Your parcel 99.00.123456.7 has been delivered", preview: "The parcel was delivered to the pickup station Tagelswangen at 17:48.",
      body: ["The parcel was delivered to the pickup station at 17:48.", "Pickup code: shown in the Post app."] },
    { id: 5, accountId: "gmail", from: "Vinted", fromEmail: "no-reply@vinted.com", receivedAt: T1 + "T14:30", isRead: true,
      subject: "You sold: Arc'teryx shell, size M", preview: "Congratulations! Ship the item within 5 days to get paid.",
      body: ["Congratulations! Ship the item within 5 days to get paid.", "Shipping label is ready in the app."], suggestedTask: "Ship the Arc'teryx shell" },
    { id: 6, accountId: "outlook", from: "Swisscom", fromEmail: "rechnung@swisscom.ch", receivedAt: iso(addDays(today, -4)) + "T10:15", isRead: true,
      subject: "Ihre Rechnung Oktober ist bereit", preview: "Die Rechnung über CHF 49.90 ist ab sofort im Kundencenter verfügbar.",
      body: ["Guten Tag,", "die Rechnung über CHF 49.90 ist ab sofort im Kundencenter verfügbar.", "Fällig am 31. Oktober.", "Freundliche Grüsse"], suggestedTask: "Swisscom-Rechnung bezahlen" }
  ].map(mailThread);
  function mailThread(m) {
    return Object.assign({ id: null, accountId: "gmail", subject: "", from: "", fromEmail: null, receivedAt: null, preview: "", body: [], attachment: null,
      isRead: true, isArchived: false, trashedAt: null, taskId: null, needsReply: false, suggestedTask: null,
      folder: null, to: [], cc: [], bcc: [], attachments: [] }, m);
  }
  /* The day heading a thread sits under: Today, Yesterday, a weekday in the
     last week, else "24 Aug". */
  function mailDayLabel(receivedAt) {
    const d = fromIso(receivedAt); if (!d) return "";
    const n = Math.round((today - d) / 86400000);
    if (n === 0) return "Today";
    if (n === 1) return "Yesterday";
    if (n > 1 && n < 7) return DOW_LONG[d.getDay()].charAt(0).toUpperCase() + DOW_LONG[d.getDay()].slice(1);
    return dayLabel(receivedAt);
  }
  function mailTime(receivedAt) { return receivedAt && receivedAt.length > 10 ? receivedAt.slice(11, 16) : ""; }
  /* The inbox: received threads only — a row with a folder ("sent" | "drafts") is the user's own. */
  function liveMail(list) { return (list || []).filter((m) => m && !m.folder && !m.isArchived && !m.trashedAt); }
  /* The fixture sets: "seed", "mail" (200 threads over many days, long
     subjects / senders / previews — the edge case) or "empty". */
  function mailFixture(kind) {
    if (kind === "empty") return [];
    if (kind !== "mail") return JSON.parse(JSON.stringify(mail));
    const who = ["Jonas Weber", "Print Atelier Zürich", "Lena Fischer", "Swiss Post", "Vinted",
      "Donaudampfschifffahrtsgesellschaft Kundendienst und Reklamationsabteilung", "Anna", "Treuhandbüro Müller & Partner GmbH", "Tom", "Swisscom"];
    const subj = ["Re: Re: Fwd: Berlin pickup — Thursday or Friday, and could you also bring the second pair of boots, the receipt and the dust bags?",
      "Proof ready", "Ihre Steuererklärungsunterlagen für das Jahr 2025 — fehlende Belege, Fristverlängerung und nächste Schritte",
      "Type scale — 13 or 14 for chrome?", "Your parcel 99.00.123456.7 has been delivered to the pickup station Tagelswangen",
      "Kraftfahrzeughaftpflichtversicherungsprämienrückerstattung", "ok", "Invoice 2026-0918 · CHF 49.90 · due 31 October · please pay by bank transfer or TWINT"];
    const back = [0, 1, 2, 3, 4, 5, 8, 20];
    const out = [];
    for (let i = 0; i < 200; i++) {
      const s = subj[i % subj.length];
      const day = iso(addDays(today, -back[Math.min(back.length - 1, Math.floor(i / 25))]));
      out.push(mailThread({ id: 1000 + i, accountId: i % 3 ? "gmail" : "outlook", from: who[i % who.length], fromEmail: "sender" + i + "@example.ch",
        receivedAt: day + "T" + pad2(23 - (i % 15)) + ":" + pad2((i * 7) % 60), isRead: i % 4 !== 0, needsReply: i % 3 === 0,
        subject: s + (i > 7 ? " #" + (i + 1) : ""),
        preview: "Hi Maksym, " + s.toLowerCase() + " — this preview runs long on purpose so the row has to cut it off cleanly at the edge.",
        body: ["Hi Maksym,", s, "This is thread " + (i + 1) + " of 200, made for checking the list at volume.", "Best"],
        suggestedTask: i % 3 === 0 ? s : null }));
    }
    return out;
  }
  /* Old storage: "needt.mail" = {made {id: taskId}, read {id: bool}, gone
     {id: "archive" | "delete"}} over the fixture ("needt.mail.edge" picked
     which one). → MailThread[] with isRead / isArchived / trashedAt / taskId. */
  function migrateMail(old, edgeKind) {
    const s = old && typeof old === "object" ? old : {};
    const made = s.made || {}, read = s.read || {}, gone = s.gone || {};
    const when = new Date().toISOString();
    return mailFixture(edgeKind === "mail" || edgeKind === "empty" ? edgeKind : "seed").map((m) => {
      const t = Object.assign({}, m);
      if (m.id in read) t.isRead = !!read[m.id];
      if (made[m.id] != null) t.taskId = made[m.id];
      if (gone[m.id] === "archive") t.isArchived = true;
      if (gone[m.id] === "delete") t.trashedAt = when;
      return t;
    });
  }

  /* ---------- MOODBOARDS (07.10.26) ----------
     Board {id, title, projectId, linkShare, pinterestBoardId, trashedAt}
     BoardItem {id, boardId, kind: image | link | color | note, url, color, text, position}
     BoardMember {boardId, email, role: owner | edit | view}
     Pins are never stored — only the linked Pinterest board (pinterestBoardId).
     Kept beside them, not in the schema yet (_rename-report.txt §5): Board
     createdAt, pinterestStatus, pinterestSyncedAt; BoardItem title, ratio,
     colorName, source {name, domain}, thumbnailUrl, createdAt; BoardMember name.
     Screens read joinBoards(tables): each board with its items (by position)
     and members — the shape an API "include" returns. */
  const isoMs = (v) => (v == null ? null : typeof v === "number" ? new Date(v).toISOString() : String(v));
  function boardItemFrom(it, boardId, position) {
    if (it && "boardId" in it && "position" in it && !("note" in it) && !("src" in it) && !("added" in it)) return Object.assign({}, it, { boardId: boardId, position: position });
    const o = it || {};
    const out = { id: o.id, boardId: boardId, kind: o.kind, url: null, color: o.color || null, text: null, position: position };
    if (o.kind === "image") out.url = o.url || o.src || null;
    else if (o.kind === "link") { out.url = o.url || null; if (o.src) out.thumbnailUrl = o.src; }
    out.text = o.text != null ? o.text : (o.note != null ? o.note : null);
    ["title", "ratio", "colorName", "source", "thumbnailUrl"].forEach((k) => { if (o[k] !== undefined && out[k] === undefined) out[k] = o[k]; });
    out.createdAt = isoMs(o.createdAt || o.added || Date.now());
    return out;
  }
  /* Old boards [{id, title, created, members[{name,email,role}], linkShare,
     items[] | tiles[], pinterest {board, status, synced}}] — or already-joined
     boards — → tables {boards, items, members}. */
  function splitBoards(list) {
    const boards = [], items = [], members = [];
    (list || []).filter((b) => b && b.id).forEach((b) => {
      const its = Array.isArray(b.items) ? b.items : (b.tiles || []).map((t, i) => t[3]
        ? { id: b.id + "-t" + i, kind: "image", src: t[3], title: t[2] || "Image", ratio: +t[1] || 1 }
        : { id: b.id + "-t" + i, kind: "color", color: t[0], colorName: t[2] || "", ratio: +t[1] || 1 });
      const p = b.pinterest;
      boards.push({ id: b.id, title: b.title || "Untitled moodboard", projectId: b.projectId || null, linkShare: !!b.linkShare,
        pinterestBoardId: "pinterestBoardId" in b ? b.pinterestBoardId : (p ? p.board : null),
        pinterestStatus: "pinterestStatus" in b ? b.pinterestStatus : (p ? p.status || "ok" : null),
        pinterestSyncedAt: "pinterestSyncedAt" in b ? b.pinterestSyncedAt : (p ? isoMs(p.synced) : null),
        createdAt: isoMs(b.createdAt || b.created || Date.now()), trashedAt: b.trashedAt || null });
      its.forEach((it, i) => items.push(boardItemFrom(it, b.id, i)));
      const ms = Array.isArray(b.members) && b.members.length ? b.members : [{ name: "Maksym", email: "maksym@needt.app", role: "owner" }];
      ms.forEach((m) => members.push({ boardId: b.id, email: m.email, role: m.role, name: m.name }));
    });
    return { boards: boards, items: items, members: members };
  }
  const migrateBoards = splitBoards;
  let joinMemo = null;
  function joinBoards(t) {
    if (!t) return [];
    if (joinMemo && joinMemo.t === t) return joinMemo.v;
    const byItems = {}, byMembers = {};
    (t.items || []).forEach((it) => { (byItems[it.boardId] = byItems[it.boardId] || []).push(it); });
    (t.members || []).forEach((m) => { (byMembers[m.boardId] = byMembers[m.boardId] || []).push(m); });
    const v = (t.boards || []).map((b) => Object.assign({}, b, {
      items: (byItems[b.id] || []).slice().sort((a, c) => a.position - c.position),
      members: byMembers[b.id] || [] }));
    joinMemo = { t: t, v: v };
    return v;
  }
  function liveBoards(list) { return (list || []).filter((b) => b && !b.trashedAt); }

  /* THE SCHEMA (09.10.26) — every stored key, what it holds and how it syncs
     (sync.js: needtSync.register). One table per collection; the stored
     shape is the database row. kind: "collection" (array of rows, one id
     each — idOf when the row has no `id`), "map" (an object; each field is
     its own record), "value" (one value, last write wins). local: kept on
     this device only (window state). raw: a bare string, not JSON.
     Record stamps (updatedAt, deletedAt, rev) live in the sync metadata, not
     in the rows — see PORT.md "One program". */
  const schema = {
    "needt.tasks": { kind: "collection", table: "Task" },
    "needt.projects.all": { kind: "collection", table: "Project" },
    "needt.projects": { kind: "collection", table: "Project", note: "the user's own (derived from needt.projects.all)" },
    "needt.projects.sort": { kind: "value", raw: true, table: "UserPref.projectSort" },
    "needt.docs": { kind: "collection", table: "Doc" },
    "needt.templates": { kind: "collection", table: "Template" },
    "needt.habits": { kind: "collection", table: "Habit" },
    "needt.habitCheckins": { kind: "collection", table: "HabitCheckin", idOf: (c) => c.habitId + "|" + c.date },
    "needt.events": { kind: "collection", table: "Event" },
    "needt.events.titles": { kind: "map", table: "EventOverride", note: "event id → title" },
    "needt.mail.threads": { kind: "collection", table: "MailThread" },
    "needt.boards": { kind: "collection", table: "Board" },
    "needt.boardItems": { kind: "collection", table: "BoardItem" },
    "needt.boardMembers": { kind: "collection", table: "BoardMember", idOf: (m) => m.boardId + "|" + m.email },
    "needt.chats": { kind: "collection", table: "Chat" },
    "needt.settings": { kind: "map", table: "UserSettings" },
    "needt.theme": { kind: "value", raw: true, table: "UserSettings.theme", note: "mirror of settings.theme (read first by App.jsx)" },
    "needt.accent": { kind: "value", raw: true, table: "UserSettings.accent", note: "mirror of settings.accent" },
    "needt.connections": { kind: "map", table: "Connection", note: "provider id → state" },
    "needt.connections.sync": { kind: "map", table: "Connection.sync" },
    "needt.mcpLinks": { kind: "collection", table: "AccessLink (kind mcp)" },
    "needt.apiLinks": { kind: "collection", table: "AccessLink (kind api)" },
    "needt.plan.state": { kind: "value", raw: true, table: "Subscription.plan" },
    "needt.sidebar.v2": { kind: "value", table: "UserSettings.sidebar" },
    "needt.docsSort": { kind: "value", table: "UserSettings.docsSort" },
    "needt.mbSort": { kind: "value", table: "UserSettings.boardsSort" },
    "needt.docShare": { kind: "value", table: "DocShare" },
    "needt.focus.log": { kind: "value", table: "FocusSession", note: "append log, last 400" },
    "needt.dayNotes.*": { kind: "value", raw: true, table: "DayNote", note: "one key per ISO day" },
    "needt.upsellDismissed.*": { kind: "value", raw: true, table: "UserFlags" },
    "needt.promo.dismissed": { kind: "value", raw: true, table: "UserFlags" },
    /* This device / window only. */
    "needt.openDoc": { kind: "value", raw: true, local: true },
    "needt.docPanel": { kind: "value", raw: true, local: true },
    "needt.docPanel.v2": { kind: "value", raw: true, local: true },
    "needt.cal.days": { kind: "value", raw: true, local: true },
    "needt.connections.tab": { kind: "value", raw: true, local: true },
    "needt.phone.theme": { kind: "value", raw: true, local: true },
    "needt.states": { kind: "value", local: true, note: "prototype states harness" },
    "needt.mcp.key": { kind: "value", raw: true, local: true, note: "a secret: never synced" },
    "needt.sidebarTiles.applied": { kind: "value", local: true }
  };
  if (window.needtSync) Object.keys(schema).forEach((k) => window.needtSync.register(k, schema[k]));

  /* Runs once per load, before any screen reads storage. Projects first, so
     task and doc names resolve to the ids the projects were given. Writes go
     through needtSync (origin "migrate"). */
  (function migrateStorage() {
    let ls;
    try { ls = window.localStorage; } catch (e) { return; }
    if (!ls) return;
    const S = window.needtSync;
    const put = (k, v) => { if (S) S.set(k, v, { origin: "migrate" }); else ls.setItem(k, JSON.stringify(v)); };
    const drop = (k) => { if (S) S.remove(k, { origin: "migrate" }); else ls.removeItem(k); };
    const rw = (key, fn) => {
      try {
        const v = JSON.parse(ls.getItem(key));
        if (!Array.isArray(v)) return;
        const n = v.map(fn);
        if (JSON.stringify(n) !== JSON.stringify(v)) put(key, n);
      } catch (e) { /* unreadable: leave it */ }
    };
    rw("needt.projects.all", migrateProject);
    rw("needt.projects", migrateProject);
    rw("needt.tasks", migrateTask);
    rw("needt.docs", migrateDoc);
    const read = (k) => { try { return JSON.parse(ls.getItem(k)); } catch (e) { return undefined; } };
    const write = (k, v) => { try { put(k, v); } catch (e) {} };
    /* Habits: project name + done[14] → Habit + HabitCheckin rows. */
    try {
      const hs = read("needt.habits");
      if (Array.isArray(hs) && hs.some(isOldHabit)) {
        let cks = read("needt.habitCheckins"); cks = Array.isArray(cks) ? cks : [];
        const have = {}; cks.forEach((c) => { have[c.habitId + "|" + c.date] = 1; });
        const next = hs.map((o) => { const r = migrateHabit(o); r.checkins.forEach((c) => { if (!have[c.habitId + "|" + c.date]) { have[c.habitId + "|" + c.date] = 1; cks.push(c); } }); return r.habit; });
        write("needt.habits", next); write("needt.habitCheckins", cks);
      }
    } catch (e) {}
    /* Events: day / at / len → startAt / endAt (+ isAllDay, calendarId, source). */
    rw("needt.events", (o) => (isOldEvent(o) ? migrateEvent(o) : o));
    /* Mail: the made / read / gone maps → MailThread rows. */
    try {
      const old = read("needt.mail");
      if (old && !Array.isArray(old) && typeof old === "object" && read("needt.mail.threads") == null) {
        write("needt.mail.threads", migrateMail(old, ls.getItem("needt.mail.edge")));
        drop("needt.mail"); drop("needt.mail.edge");
      }
    } catch (e) {}
    /* Moodboards: one nested list → Board / BoardItem / BoardMember tables. */
    try {
      const old = read("needt.moodboards");
      if (old != null && read("needt.boards") == null) {
        const list = Array.isArray(old) ? old : (old && Array.isArray(old.boards) ? old.boards : []);
        const t = splitBoards(list);
        write("needt.boards", t.boards); write("needt.boardItems", t.items); write("needt.boardMembers", t.members);
        drop("needt.moodboards");
      }
    } catch (e) {}
  })();

  /* THE TASKS. The seed both shells read, in the database's field names:
     projectId, dueDate, estimatedMinutes, scheduledStart/scheduledEnd,
     TaskPart, TaskWait, Stage. isFixed marks a time the person set by hand
     (the planner may not move it). Fields the database does not have yet —
     tone, heat, entry, value, earned, noSlot, movedFrom, age, holder,
     overdue, blockedBy — are listed in _rename-report.txt. */
  const tasks = [
    { id: 1, title: "Draft the launch brief", projectId: "ops", tone: "info", status: "in_progress", dueDate: "2026-09-04", estimatedMinutes: 90, scheduledStart: "2026-09-04T09:00", scheduledEnd: "2026-09-04T10:30", isFixed: true, done: false, holder: "you", TaskWait: { personId: "anna", reason: "the legal sign-off" }, Stage: "doing", blockedBy: 6, heat: 0.7,
      TaskPart: [{ id: "1.1", title: "Pull last month's numbers", done: true }, { id: "1.2", title: "Write the draft", done: false }, { id: "1.3", title: "Send it for review", done: false }] },
    { id: 2, title: "Send invoices for August", projectId: "ops", tone: "info", status: "todo", dueDate: "2026-08-31", estimatedMinutes: 30, scheduledStart: "2026-08-31T09:00", scheduledEnd: "2026-08-31T09:30", done: false, overdue: true, holder: "anna", Stage: "doing", movedFrom: "09:30" },
    { id: 3, title: "Review the form-row spec", projectId: "ds", tone: "accent", status: "in_progress", dueDate: "2026-09-02", estimatedMinutes: 60, scheduledStart: "2026-09-02T11:00", scheduledEnd: "2026-09-02T12:00", isFixed: true, done: false, holder: "you", Stage: "review" },
    { id: 4, title: "German — B2 unit 4", projectId: "german", tone: "success", status: "todo", dueDate: "2026-09-01", estimatedMinutes: 60, scheduledStart: "2026-09-01T18:00", scheduledEnd: "2026-09-01T19:00", isFixed: true, done: false, holder: "you", Stage: "todo" },
    { id: 5, title: "Call the accountant back", projectId: null, status: "todo", estimatedMinutes: 20, done: false, age: 34 },
    { id: 14, title: "Finish the tank graphic", projectId: "ds", tone: "accent", status: "todo", dueDate: "2026-09-01", estimatedMinutes: 240, scheduledStart: "2026-09-01T14:00", scheduledEnd: "2026-09-01T18:00", done: false, holder: "you", TaskWait: { personId: "tom", reason: "the print files" }, Stage: "doing", entry: "Open the artwork and pick the print side" },
    { id: 15, title: "Reply to the Berlin buyer", projectId: "resale", status: "todo", dueDate: "2026-09-01", estimatedMinutes: 15, scheduledStart: "2026-09-01T09:00", scheduledEnd: "2026-09-01T09:15", done: false },
    /* A FULL DAY. Home groups the day by `at` — morning under 12, afternoon
       under 17, evening after — so a day with three tasks in it renders three
       cards and two of the three group headings never appear. These fill the
       day the seed is supposed to depict: a person with a real Tuesday, not a
       demo with one task per heading. Two more overdue, so the wall beside
       today has something to argue with. */
    { id: 27, title: "Answer the supplier email", projectId: "ops", tone: "info", status: "todo", dueDate: "2026-09-01", estimatedMinutes: 15, scheduledStart: "2026-09-01T08:00", scheduledEnd: "2026-09-01T08:15", done: false, Stage: "todo" },
    { id: 28, title: "Reply to Lena about the type scale", projectId: "ds", tone: "accent", status: "todo", dueDate: "2026-09-01", estimatedMinutes: 20, scheduledStart: "2026-09-01T09:00", scheduledEnd: "2026-09-01T09:20", done: false, holder: "lena", Stage: "review" },
    { id: 29, title: "Pack the boots for pickup", projectId: "resale", status: "todo", dueDate: "2026-09-01", estimatedMinutes: 25, scheduledStart: "2026-09-01T10:00", scheduledEnd: "2026-09-01T10:25", done: false,
      TaskPart: [{ id: "29.1", title: "Wrap them", done: true }, { id: "29.2", title: "Print the label", done: false }] },
    { id: 30, title: "Check the print proof", projectId: "ds", tone: "accent", status: "in_progress", dueDate: "2026-09-01", estimatedMinutes: 30, scheduledStart: "2026-09-01T11:00", scheduledEnd: "2026-09-01T11:30", done: false, holder: "you", Stage: "doing" },
    { id: 31, title: "Call the tax office", status: "todo", dueDate: "2026-09-01", estimatedMinutes: 20, scheduledStart: "2026-09-01T12:00", scheduledEnd: "2026-09-01T12:20", done: false, age: 9 },
    { id: 32, title: "Fix the form-row spacing", projectId: "ds", tone: "accent", status: "in_progress", dueDate: "2026-09-01", estimatedMinutes: 45, scheduledStart: "2026-09-01T13:00", scheduledEnd: "2026-09-01T13:45", done: false, holder: "you", Stage: "doing" },
    { id: 33, title: "Photograph the two jackets", projectId: "resale", status: "todo", dueDate: "2026-09-01", estimatedMinutes: 40, scheduledStart: "2026-09-01T15:00", scheduledEnd: "2026-09-01T15:40", done: false,
      TaskPart: [{ id: "33.1", title: "Set up the light", done: false }, { id: "33.2", title: "Shoot both", done: false }] },
    { id: 34, title: "Update the shipping sheet", projectId: "ops", tone: "info", status: "todo", dueDate: "2026-09-01", estimatedMinutes: 20, scheduledStart: "2026-09-01T16:00", scheduledEnd: "2026-09-01T16:20", done: false, Stage: "todo" },
    { id: 35, title: "German — listening drill", projectId: "german", tone: "success", status: "todo", dueDate: "2026-09-01", estimatedMinutes: 25, scheduledStart: "2026-09-01T19:00", scheduledEnd: "2026-09-01T19:25", done: false },
    { id: 36, title: "Read the supplier brief", projectId: "ops", tone: "info", status: "todo", dueDate: "2026-09-01", estimatedMinutes: 30, scheduledStart: "2026-09-01T20:00", scheduledEnd: "2026-09-01T20:30", done: false },
    { id: 37, title: "Renew the domain", projectId: "ops", tone: "info", status: "todo", dueDate: "2026-08-29", estimatedMinutes: 10, scheduledStart: "2026-08-29T09:00", scheduledEnd: "2026-08-29T09:10", done: false, overdue: true, Stage: "todo" },
    { id: 38, title: "Send the August report", projectId: "ops", tone: "info", status: "todo", dueDate: "2026-08-30", estimatedMinutes: 35, scheduledStart: "2026-08-30T10:00", scheduledEnd: "2026-08-30T10:35", done: false, overdue: true, holder: "you", Stage: "doing" },
    { id: 16, title: "Photograph the shell", projectId: "resale", status: "todo", dueDate: "2026-09-02", estimatedMinutes: 40, scheduledStart: "2026-09-02T10:00", scheduledEnd: "2026-09-02T10:40", done: false,
      TaskPart: [{ id: "16.1", title: "Set up the light", done: true }, { id: "16.2", title: "Shoot the front", done: false }, { id: "16.3", title: "Shoot the label", done: false }] },
    { id: 17, title: "Sign the factory quote", projectId: "ops", status: "todo", dueDate: "2026-09-02", estimatedMinutes: 45, scheduledStart: "2026-09-02T12:00", scheduledEnd: "2026-09-02T12:45", done: false, holder: "tom", Stage: "review", blockedBy: 26, entry: "Open the quote PDF" },
    { id: 18, title: "Pick the courier for the batch", projectId: "ops", status: "todo", dueDate: "2026-09-02", estimatedMinutes: 30, scheduledStart: "2026-09-02T16:00", scheduledEnd: "2026-09-02T16:30", done: false, Stage: "todo", blockedBy: 17 },
    { id: 19, title: "Read the VAT note", status: "todo", dueDate: "2026-09-03", estimatedMinutes: 20, scheduledStart: "2026-09-03T18:00", scheduledEnd: "2026-09-03T18:20", done: false },
    { id: 20, title: "Landing page copy", projectId: "ds", status: "todo", dueDate: "2026-09-03", estimatedMinutes: 120, scheduledStart: "2026-09-03T10:00", scheduledEnd: "2026-09-03T12:00", done: false, holder: "lena", Stage: "doing", entry: "Write the first sentence" },
    { id: 21, title: "Ship the camera body", projectId: "resale", status: "todo", dueDate: "2026-09-04", estimatedMinutes: 45, scheduledStart: "2026-09-04T11:00", scheduledEnd: "2026-09-04T11:45", done: false, value: 1600 },
    { id: 22, title: "Write the September brief", projectId: "ops", status: "todo", dueDate: "2026-09-04", estimatedMinutes: 45, scheduledStart: "2026-09-04T15:00", scheduledEnd: "2026-09-04T15:45", done: false, holder: "anna", Stage: "todo", blockedBy: 1 },
    { id: 23, title: "German — B2 unit 5", projectId: "german", status: "todo", dueDate: "2026-09-04", estimatedMinutes: 60, scheduledStart: "2026-09-04T18:00", scheduledEnd: "2026-09-04T19:00", done: false },
    { id: 24, title: "Archive August", status: "todo", dueDate: "2026-09-05", estimatedMinutes: 20, done: false },
    { id: 25, title: "Two pairs of boots — list them", projectId: "resale", status: "todo", dueDate: "2026-09-06", estimatedMinutes: 45, scheduledStart: "2026-09-06T11:00", scheduledEnd: "2026-09-06T11:45", done: false, value: 5600 },
    { id: 26, title: "Read the two supplier contracts", projectId: "ops", status: "todo", dueDate: "2026-09-07", estimatedMinutes: 60, scheduledStart: "2026-09-07T14:00", scheduledEnd: "2026-09-07T15:00", done: false, holder: "tom", Stage: "doing" },
    { id: 6, title: "Collect last quarter's numbers", projectId: "ops", tone: "info", status: "todo", dueDate: "2026-09-03", estimatedMinutes: 45, scheduledStart: "2026-09-03T09:00", scheduledEnd: "2026-09-03T09:45", done: false, Stage: "doing", entry: "Export the card statement",
      TaskPart: [{ id: "6.1", title: "Export the card statement", done: false }, { id: "6.2", title: "Export the invoices", done: false }] },
    { id: 7, title: "Pick a courier for the September batch", projectId: null, status: "todo", estimatedMinutes: 45, done: false },
    { id: 8, title: "Write the weekly review", projectId: "ds", tone: "accent", status: "todo", dueDate: "2026-09-04", estimatedMinutes: 60, isFixed: true, done: false },
    { id: 9, title: "Reconcile the card statement", projectId: "ops", tone: "info", estimatedMinutes: 30, done: true, Stage: "done" },
    { id: 10, title: "Book the dentist", projectId: null, estimatedMinutes: 15, done: true },
    /* A money group: one task per thing, a sum on the group, and no slot in the
       day — the thing sells when it sells, so there is nothing to move. */
    { id: 11, title: "Arc'teryx shell — L", projectId: "resale", status: "in_progress", done: false, heat: 1, value: 4200, earned: 3800, noSlot: true,
      TaskPart: [{ id: "11.1", title: "Photograph it", done: true }, { id: "11.2", title: "List it", done: true }, { id: "11.3", title: "Ship it", done: false }] },
    { id: 12, title: "Two pairs of boots", projectId: "resale", status: "todo", done: false, heat: 0.5, value: 5600, noSlot: true,
      TaskPart: [{ id: "12.1", title: "Photograph them", done: false }, { id: "12.2", title: "List them", done: false }, { id: "12.3", title: "Ship them", done: false }] },
    { id: 13, title: "Camera body", projectId: "resale", status: "todo", done: false, value: 1600, noSlot: true,
      TaskPart: [{ id: "13.1", title: "Photograph it", done: false }, { id: "13.2", title: "List it", done: false }] }
  ];

  /* THE STREAK. A day counts as closed when everything with a deadline on it
     was closed — the definition that cannot be farmed by adding empty tasks,
     because an empty day has no deadline in it to close. `days` is the last
     fourteen, oldest first, the same window the habits use. */
  const closedDays = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0];
  function streak() {
    let n = 0;
    /* Today is still in progress, so it cannot be judged yet — counting it
       would report a break every morning and a repair every evening. The
       streak is what held up to and including yesterday; today joins it when
       the day is over. */
    for (let i = closedDays.length - 2; i >= 0 && closedDays[i]; i--) n++;
    return n;
  }

  function dateLabel(d) { return d.getDate() + " " + MONTHS[d.getMonth()]; }
  function shiftWeek(n) {
    const monday = new Date(today);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + n * 7);
    return monday;
  }

  /* THE CHAIN. What a task is waiting on, resolved: a person with a reason, or
     another task that has to close first. Derived on demand — a stored chain
     is a chain that disagrees with its own tasks by Thursday. */
  function blockerOf(t, list) {
    if (t.blockedBy) {
      const by = (list || tasks).filter((x) => x.id === t.blockedBy)[0];
      if (by && !by.done) return { kind: "task", task: by };
    }
    if (t.TaskWait) return { kind: "person", on: t.TaskWait.personId, for: t.TaskWait.reason };
    return null;
  }

  /* How many open tasks each task is holding up, counted through the chain —
     the only ranking worth having here, because it answers "what do I do first"
     rather than "what is urgent". */
  function unblocks(t, list) {
    const all = (list || tasks).filter((x) => !x.done);
    let n = 0;
    const seen = {};
    let front = [t.id];
    while (front.length) {
      const next = [];
      all.forEach((x) => {
        if (seen[x.id] || front.indexOf(x.blockedBy) < 0) return;
        seen[x.id] = 1;
        next.push(x.id);
        n += 1;
      });
      front = next;
    }
    return n;
  }

  /* Who is blocking how many of the tasks you hold. Derived, never stored —
     a count that is written down is a count that goes stale. */
  function blocking(list) {
    const out = {};
    (list || tasks).forEach((t) => {
      if (!t.done && t.TaskWait) out[t.TaskWait.personId] = (out[t.TaskWait.personId] || 0) + 1;
    });
    return out;
  }

  /* TASK STATE (07.10.26) — pure helpers, so every screen and the phone close,
     trash and restore a task the same way. None of them touches the app: they
     take a task or a list and return a patch or a new list.

     Closing cascades: a closed task closes every open TaskPart with it, and
     the last open part closing closes the parent (only on that transition, so
     a parent reopened with all parts done does not snap shut again).
     Reopening reopens the task only — its parts stay as they are. */
  function closeParts(parts) { return (parts || []).map((p) => (p.done ? p : Object.assign({}, p, { done: true }))); }
  /* The patch that sets a task done (default) or not done. */
  function completeTask(t, done) {
    const d = done === undefined ? true : !!done;
    if (!d) return { done: false };
    const parts = t && t.TaskPart;
    return parts && parts.some((p) => !p.done) ? { done: true, TaskPart: closeParts(parts) } : { done: true };
  }
  /* One task with a patch applied and the cascade rules run. */
  function patchTask(t, patch) {
    const next = Object.assign({}, t, patch);
    if (patch && patch.done === true && !t.done && next.TaskPart && next.TaskPart.some((p) => !p.done)) next.TaskPart = closeParts(next.TaskPart);
    if (patch && "TaskPart" in patch && !("done" in patch) && !next.done) {
      const before = (t.TaskPart || []).some((p) => !p.done);
      const after = (next.TaskPart || []).length > 0 && next.TaskPart.every((p) => p.done);
      if (before && after) next.done = true;
    }
    return next;
  }
  /* The list with task `id` patched (cascade included). Ids compare as strings.
     Also takes one task: applyTaskPatch(task, patch) → the patched task, so a
     caller that holds a single task (App's updateTask) uses the same rule. */
  function applyTaskPatch(list, id, patch) {
    if (!Array.isArray(list)) return list && typeof list === "object" ? patchTask(list, id) : list;
    return list.map((t) => (t && String(t.id) === String(id) ? patchTask(t, patch) : t));
  }
  /* Flip done on task `id`, cascading on close. */
  function toggleTask(list, id) {
    return (list || []).map((t) => (t && String(t.id) === String(id) ? patchTask(t, completeTask(t, !t.done)) : t));
  }

  /* TRASH. Deleting a task moves it to Trash: it keeps everything and gains
     trashedAt (ISO). Every task list reads liveTasks(); Trash reads
     trashedTasks(); destroyTask is the only real removal. */
  function isTrashed(t) { return !!(t && t.trashedAt); }
  function liveTasks(list) { return (list || []).filter((t) => t && !t.trashedAt); }
  function trashedTasks(list) { return (list || []).filter((t) => t && t.trashedAt); }
  /* List form: (list, id) → new list. Task form: (task) → the patch to
     apply ({ trashedAt }), for callers that write through updateTask. */
  function trashTask(list, id, when) {
    if (!Array.isArray(list)) return { trashedAt: (typeof id === "string" && id) || new Date().toISOString() };
    return applyTaskPatch(list, id, { trashedAt: when || new Date().toISOString() });
  }
  function restoreTask(list, id) { return Array.isArray(list) ? applyTaskPatch(list, id, { trashedAt: null }) : { trashedAt: null }; }
  function destroyTask(list, id) { return (list || []).filter((t) => !(t && String(t.id) === String(id))); }

  return { schema, today, MONTHS, DOW, projects, project, projectName, projectIdOf, calendars, habits, tasks,
    people, person, blocking, stages, blockerOf, unblocks,
    closedDays, streak, dateLabel, shiftWeek,
    iso, toDate, dayLabel, dueLabel, dueDay, hhmm, stamp, at, timeLabel, sync, moveDay, placeAt,
    migrateTask, migrateProject, migrateDoc, notesText,
    habitCheckins, habitDoneOn, habitDays, habitKept, habitStreak, habitWeek, habitTime, habitPerWeek, habitColor, liveHabits, setCheckin, migrateHabit, habitPatch,
    dayIso, makeEvent, eventAt, migrateEvent, eventMinutes, eventBlock, eventsInRange, moveEvent,
    mail, mailThread, mailDayLabel, mailTime, liveMail, mailFixture, migrateMail,
    splitBoards, migrateBoards, joinBoards, liveBoards,
    completeTask, patchTask, applyTaskPatch, toggleTask, closeParts,
    isTrashed, liveTasks, trashedTasks, trashTask, restoreTask, destroyTask };
})();

Object.assign(window, { NEEDT });

/* ---------- the first-task planner (08.10.26) ----------
   Shared by onboarding on the desktop (AuthScreen.jsx) and the phone
   (MobileAuth.jsx), which used to carry a copy each. firstSlot finds the
   first free half hour inside working hours that touches no event and no
   task whose time was set by hand (isFixed); weekends are skipped unless
   asked. A time the person typed is kept as they said (fixed). slotReason
   says why in one line; firstTask builds the Task row. planNow is the
   prototype's "now" (14:20). Window aliases: needtFirstSlot,
   needtSlotReason, needtFirstTask. */
(function (N) {
  const PLAN_NOW = 14 + 20 / 60;
  const planDate = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(); };
  const planWeekday = (d, form) => planDate(d).toLocaleDateString("en-GB", { weekday: form || "long" });
  const planHour = (s) => { const m = /^(\d{1,2}):(\d{2})/.exec(s || ""); return m ? +m[1] + +m[2] / 60 : null; };
  function firstSlot(o) {
    const N = window.NEEDT, len = (o.minutes || 30) / 60;
    const s = planHour(o.start) == null ? 9 : planHour(o.start), e = planHour(o.end) == null ? 18 : planHour(o.end);
    const today = N.iso(N.today);
    const dayAt = (k, from) => { const d = planDate(from); const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + k); return N.iso(x); };
    const busyOn = (d) => {
      const next = dayAt(1, d);
      const ev = (window.calEvents ? window.calEvents.inRange(d, next) : []).map(N.eventBlock)
        .filter((b) => b.date === d && b.at != null).map((b) => ({ at: b.at, end: b.at + (b.len || 30) / 60, title: b.title, kind: "event" }));
      const tk = (o.tasks || []).filter((t) => t && t.isFixed && !t.done && !t.trashedAt && t.scheduledStart && t.scheduledStart.slice(0, 10) === d)
        .map((t) => { const a = N.at(t); return { at: a, end: a + (t.estimatedMinutes || 30) / 60, title: t.title, kind: "task" }; });
      return ev.concat(tk).sort((a, b) => a.at - b.at);
    };
    const near = (busy, at) => ({
      before: busy.filter((b) => b.end <= at + 1e-6 && b.end > s).sort((a, b) => b.end - a.end)[0] || null,
      after: busy.filter((b) => b.at >= at + len - 1e-6 && b.at < e)[0] || null
    });
    const from0 = o.day || today;
    if (o.hour != null) {
      const busy = busyOn(from0);
      const clash = busy.filter((b) => o.hour < b.end && b.at < o.hour + len)[0] || null;
      return Object.assign({ day: from0, at: o.hour, fixed: true, clash: clash, busy: busy, start: s, end: e, searchFrom: o.hour }, near(busy, o.hour));
    }
    for (let k = 0; k < 14; k++) {
      const d = dayAt(k, from0), wd = planDate(d).getDay();
      if (!o.weekends && (wd === 0 || wd === 6)) continue;
      const busy = busyOn(d);
      const from = d === today ? Math.max(s, PLAN_NOW) : s;
      for (let at = Math.ceil(from * 2 - 1e-6) / 2; at + len <= e + 1e-6; at += 0.5) {
        if (!busy.some((b) => at < b.end && b.at < at + len)) {
          return Object.assign({ day: d, at: at, fixed: false, busy: busy, start: s, end: e, searchFrom: from, firstDay: from0 }, near(busy, at));
        }
      }
    }
    return { day: from0, at: s, fixed: false, busy: busyOn(from0), start: s, end: e, searchFrom: s, before: null, after: null };
  }
  /* One line that says why, in the person's words: the slot, the neighbours. */
  function slotReason(r, minutes) {
    const N = window.NEEDT, hm = N.hhmm, len = minutes || 30;
    const q = (b) => "“" + b.title + "”";
    if (r.fixed) return r.clash
      ? "You asked for " + hm(r.at) + " — it overlaps " + q(r.clash) + ", so it stays where you said."
      : "You asked for " + hm(r.at) + " — that time is free, so it stays there.";
    const today = N.iso(N.today);
    const wd = planWeekday(r.day);
    const lead = r.day === (r.firstDay || today)
      ? "Your first free " + len + " min" + (r.day === today ? " after " + hm(r.searchFrom) : " on " + wd)
      : (r.firstDay === today ? "Nothing free today after " + hm(Math.max(r.start, PLAN_NOW)) : "That day is full") + " — " + wd + " " + hm(r.at) + " is your first free " + len + " min";
    const tail = r.before && r.after ? " — between " + q(r.before) + " and " + q(r.after) + "."
      : r.before ? " — right after " + q(r.before) + "."
      : r.after ? " — before " + q(r.after) + "."
      : " — the rest of your hours are open.";
    return lead + tail;
  }
  /* The first task as a Task row (Data.js names), placed where the planner said. */
  function firstTask(parsed, prefs, tasks) {
    const N = window.NEEDT, f = (parsed && parsed.found) || {};
    const minutes = f.duration ? parseInt(f.duration.value, 10) * (/h/.test(f.duration.value) ? 60 : 1) : 30;
    const day = f.date ? N.toDate(f.date.value) : null;
    let hour = null;
    if (f.time) {
      const v = f.time.value, m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(v);
      if (v === "noon") hour = 12; else if (v === "midnight") hour = 0;
      else if (m) hour = (m[3] ? +m[1] % 12 + (m[3] === "pm" ? 12 : 0) : +m[1]) + (m[2] ? +m[2] / 60 : 0);
    }
    const slot = firstSlot({ tasks: tasks, minutes: minutes, day: day, hour: hour, start: prefs.start, end: prefs.end, weekends: !!prefs.weekends });
    const projectId = f.project && N.projectIdOf ? N.projectIdOf(f.project.value) : null;
    const task = N.sync({
      id: Date.now() + Math.random(), title: (parsed.rest || parsed.title || "").trim() || "First task", projectId: projectId, status: "todo",
      estimatedMinutes: minutes, dueDate: f.deadline ? (N.toDate(f.deadline.value) || slot.day) : slot.day, done: false,
      scheduledStart: N.stamp(slot.day, slot.at), isFixed: !!slot.fixed
    });
    if (f.priority) task.priority = f.priority.value.toLowerCase();
    if (f.label) task.labels = [f.label.value];
    if (parsed.note) task.notes = parsed.note;
    return { task: task, slot: slot, minutes: minutes, reason: slotReason(slot, minutes) };
  }
  Object.assign(N, { planNow: PLAN_NOW, planDate: planDate, planWeekday: planWeekday, planHour: planHour,
    firstSlot: firstSlot, slotReason: slotReason, firstTask: firstTask });
  Object.assign(window, { needtFirstSlot: firstSlot, needtSlotReason: slotReason, needtFirstTask: firstTask });
})(NEEDT);
