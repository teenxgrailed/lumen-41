/* phone-habits.jsx — Plates screens (08.10.26): Habits and Moodboards.
 * Registered with window.PkPlaces (mobile-v2-plates.jsx draws them).
 *
 *   habits      Help over report: today's check-ins first, as calm rows with
 *               a ring in the habit's colour (its own, else its project's) —
 *               tapping the ring is the screen's one primary action. Under
 *               them, one strip per habit: the last months as dots (kept /
 *               missed / still ahead, today a ring you can tap), sideways in
 *               a PkChips strip whose edges melt into blur, with the habit's
 *               streak as a rolling number. Then "Time left": hours today and
 *               days of the year as dots (Habits.jsx's HabitLeft, at phone
 *               size). A new habit is made in a PkSheet (the desktop form:
 *               name, time, days per week, project). Pull down: search habits,
 *               Enter makes a new one.
 *   moodboards  MbmRoot (Mobile.jsx) — its board and item views, sheets and
 *               snack, unchanged — inside a PkScreen-style shell. The boards
 *               LIST is drawn here in Plates (PkScreen: large → compact title,
 *               top / bottom blur, pull-down search across boards and their
 *               references, Enter makes a new board). Opening a board remounts
 *               MbmRoot on it (startBoard); when MbmRoot goes back to its own
 *               list (back, delete, leave), this list shows again. New board
 *               presses MbmRoot's own (hidden) button, so the logic is one
 *               copy. An open item / the walkthrough call the shell's
 *               onCover, so menu A's pill steps aside (V2pLivePhone `away`).
 *
 * Data: window.habitApi / habitStore (stores.jsx, the desktop's tables),
 * NEEDT.habitDays / habitDoneOn / habitStreak / habitWeek / habitColor;
 * boards through useMbmBoards (Mobile.jsx). Styles: styles/phone-habits.css
 * (phb-*), colours --v2p-* / --pk-* / --phb-* (themes.css).
 */
const PhbNS = window.NeedtDesignSystem_25d3c8;
const { Icon: PhbIcon } = PhbNS;
const phbCx = (...a) => a.filter(Boolean).join(" ");
const PHB_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PHB_MON_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PHB_DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* ══ Habits ═══════════════════════════════════════════════════════════════ */
const phbApi = () => window.habitApi;
const phbHue = (h) => window.NEEDT.habitColor(h) || "var(--phb-none)";
const phbOn = (h) => window.NEEDT.habitDoneOn(h.id);
/* The prototype's day (NEEDT.today), at midnight — Habits.jsx's hbToday. */
function phbToday() {
  const t = window.NEEDT && window.NEEDT.today;
  return t instanceof Date ? new Date(t.getFullYear(), t.getMonth(), t.getDate()) : new Date(2026, 8, 1);
}
/* Kept on a day: Habits.jsx's hbKeptOn (one copy, on window) — the last
   fourteen days from checkins, older days from the desktop's stable walk. */
const phbKeptOn = (h, idx, d, back) => window.hbKeptOn(h, idx, d, back);
const PHB_CAP = 8;

/* One check-in row: the ring in the habit's colour, the name, one quiet line. */
function PhbTodayRow({ h }) {
  const on = phbOn(h);
  const hue = phbHue(h);
  const N = window.NEEDT;
  const perWeek = N.habitPerWeek(h), week = N.habitWeek(h.id);
  const hit = N.habitDays(h.id).filter(Boolean).length;
  const rest = !!perWeek && !on && week >= perWeek;
  const toggle = () => phbApi().toggle(h.id, !on);
  const meta = [on ? "Kept today" : rest ? "Week done" : "Not yet today", perWeek ? week + "/" + perWeek + " this week" : hit + " of 14"].join(" · ");
  const ring = (
    <button type="button" className={phbCx("phb-ring", on && "is-on")} style={{ "--hue": hue }} aria-pressed={on} data-phb-ring={h.id}
      aria-label={h.title + (on ? " — kept today, tap to undo" : " — mark kept today")} onClick={(e) => { e.stopPropagation(); toggle(); }}>
      <span className="phb-ring-in">{on ? <PhbIcon name="check" size={14} /> : null}</span>
    </button>
  );
  return (
    <div className={phbCx("phb-today", on && "is-on", rest && "is-rest")} data-phb-today={h.id}>
      <PkRow id={h.id} title={h.title} meta={meta} time={N.habitTime(h)} lead={ring} onOpen={toggle} />
    </div>
  );
}

/* A habit's last months as dots, sideways. Filled = kept, grey = missed,
   a ring = still ahead; today is a ring in the habit's colour you can tap. */
function PhbMonths({ h, idx }) {
  const hue = phbHue(h);
  const today = phbToday();
  const box = React.useRef(null);
  const months = [];
  for (let k = 3; k >= 0; k--) months.push(new Date(today.getFullYear(), today.getMonth() - k, 1));
  const streak = window.NEEDT.habitStreak(h.id);
  const onToday = phbOn(h);
  let kept = 0, past = 0;
  const groups = months.map((m) => {
    const n = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const dots = [];
    for (let day = 1; day <= n; day++) {
      const d = new Date(m.getFullYear(), m.getMonth(), day);
      const back = Math.round((today - d) / 8.64e7);
      if (back < 0) { dots.push({ day: day, kind: "ahead" }); continue; }
      const on = back === 0 ? onToday : phbKeptOn(h, idx, d, back);
      if (back < 30) { past++; if (on) kept++; }
      dots.push({ day: day, kind: on ? "on" : "miss", today: back === 0 });
    }
    return { m: m, dots: dots };
  });
  /* Open on today: it sits a little right of the middle, the days ahead after it. */
  React.useLayoutEffect(() => {
    const b = box.current; if (!b) return;
    const sc = b.querySelector(".pk-chips-scroll"), t = b.querySelector(".phb-dot.is-today");
    if (sc && t) sc.scrollLeft = Math.max(0, t.offsetLeft - sc.clientWidth * 0.62);
  }, []);
  return (
    <div className="phb-habit" ref={box} data-phb-habit={h.id} style={{ "--hue": hue }}>
      <div className="phb-habit-head">
        <span className="phb-habit-main">
          <span className="phb-habit-name"><span className="pk-hue" />{h.title}</span>
          <span className="phb-habit-cap">{kept} of the last {past} days</span>
        </span>
        <span className={phbCx("phb-streak", !streak && "is-none")}>
          <PkNumber value={streak} className="phb-streak-n" label={streak + (streak === 1 ? " day" : " days") + " in a row"} />
          <span className="phb-streak-cap">in a row</span>
        </span>
      </div>
      <PkChips className="phb-strip" label={h.title + " — the last months"}>
        {groups.map((g) => (
          <span key={g.m.getMonth()} className="phb-month">
            <span className="phb-month-name">{PHB_MON[g.m.getMonth()]}</span>
            <span className="phb-month-dots">
              {g.dots.map((d) => {
                const label = d.day + " " + PHB_MON[g.m.getMonth()] + (d.kind === "ahead" ? " · ahead" : d.kind === "on" ? " · kept" : " · missed");
                if (d.today) {
                  return (
                    <button key={d.day} type="button" className={phbCx("phb-dot is-today", d.kind === "on" && "is-on")} aria-pressed={d.kind === "on"}
                      aria-label={"Today — " + (d.kind === "on" ? "kept, tap to undo" : "tap to mark kept")} onClick={() => phbApi().toggle(h.id, d.kind !== "on")} />
                  );
                }
                return <span key={d.day} className={"phb-dot is-" + d.kind} title={label} />;
              })}
            </span>
          </span>
        ))}
      </PkChips>
    </div>
  );
}

/* Time left: hours today (a dot an hour) and the days of the year (a dot a
   day) — Habits.jsx's HabitLeft, at phone size. Not a score. */
function phbUseNow() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  return now;
}
function PhbLeft() {
  const now = phbUseNow();
  const today = phbToday();
  const hour = now.getHours();
  const hoursLeft = 24 - hour - (now.getMinutes() > 0 ? 1 : 0);
  const y = today.getFullYear();
  const len = Math.round((new Date(y + 1, 0, 1) - new Date(y, 0, 1)) / 8.64e7);
  const doy = Math.round((today - new Date(y, 0, 1)) / 8.64e7);
  const daysLeft = len - doy - 1;
  const hours = [], days = [];
  for (let i = 0; i < 24; i++) hours.push(i < hour ? "spent" : i === hour ? "now" : "open");
  for (let i = 0; i < len; i++) days.push(i < doy ? "spent" : i === doy ? "now" : "open");
  return (
    <div className="phb-left">
      <div className="phb-left-card">
        <div className="phb-left-dots is-hours" aria-hidden="true">{hours.map((k, i) => <span key={i} className={"phb-ld is-" + k} />)}</div>
        <span className="phb-left-cap"><PkNumber value={hoursLeft} className="phb-left-n" /> {hoursLeft === 1 ? "hour" : "hours"} left today</span>
      </div>
      <div className="phb-left-card">
        <div className="phb-left-dots is-year" aria-hidden="true">{days.map((k, i) => <span key={i} className={"phb-ld is-" + k} />)}</div>
        <span className="phb-left-cap"><PkNumber value={daysLeft} className="phb-left-n" /> days left in {y}</span>
      </div>
    </div>
  );
}

/* The new-habit sheet: the desktop's form (places.jsx PlHabitSheet) in a
   PkSheet — name, time (optional), days per week, project (its colour). */
const PHB_QUOTAS = [[null, "Every day"], [3, "3× a week"], [5, "5× a week"]];
function phbProjects() {
  const list = window.projects.list();
  return list.filter((p) => p && p.name && !p.archived).map((p) => {
    const full = window.NEEDT.project(p.id || p.name) || p;
    return { id: full.id || window.NEEDT.projectIdOf(p.name), name: p.name, color: full.color || p.color || null };
  });
}
function PhbNewSheet({ open, habit, onClose, say }) {
  const blank = { title: "", time: "", perWeek: null, projectId: null };
  const [f, setF] = React.useState(blank);
  const set = (p) => setF((x) => Object.assign({}, x, p));
  /* edit (places.jsx PlHabitSheet's rule): the form speaks the database */
  React.useEffect(() => {
    if (!open) return;
    setF(habit ? { title: habit.title, time: window.NEEDT.habitTime(habit) || "", perWeek: window.NEEDT.habitPerWeek(habit), projectId: habit.projectId || null } : blank);
  }, [open, habit && habit.id]);
  const projects = React.useMemo(phbProjects, [open]);
  const at = f.time.trim();
  const atOk = !at || /^([01]?\d|2[0-3]):[0-5]\d$/.test(at);
  const ok = !!f.title.trim() && atOk;
  const norm = (v) => { if (!v) return null; const p = v.split(":"); return p[0].padStart(2, "0") + ":" + p[1]; };
  const save = () => {
    if (!ok) return;
    const p = { title: f.title.trim(), schedule: { time: norm(at), perWeek: f.perWeek }, projectId: f.projectId };
    onClose();
    if (habit) {
      const before = (phbApi().all() || []).filter((x) => x.id === habit.id)[0];
      phbApi().patch(habit.id, p);
      say("Habit updated", before ? () => phbApi().patch(habit.id, { title: before.title, schedule: before.schedule, projectId: before.projectId }) : undefined);
      return;
    }
    const h = phbApi().add(p);
    say("Habit “" + h.title + "” added", () => phbApi().remove(h.id));
  };
  return (
    <PkSheet open={open} onClose={onClose} title={habit ? "Edit habit" : "New habit"} meta="Comes back every day — a missed day never piles up" label={habit ? "Edit habit" : "New habit"} className="phb-sheet"
      footer={<><PkButton onClick={onClose}>Cancel</PkButton><PkButton kind="primary" disabled={!ok} onClick={save} data-phb-create>{habit ? "Save" : "Create habit"}</PkButton></>}>
      <div className="phb-form">
        <PkField label="Name" id="phb-name" value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder="Habit name"
          inputProps={{ autoComplete: "off", "data-phb-name": "", onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } } }} />
        <PkField label="Time · optional" id="phb-time" value={f.time} onChange={(e) => set({ time: e.target.value })} placeholder="HH:MM"
          className={phbCx("phb-time", !atOk && "is-invalid")} inputProps={{ inputMode: "numeric", autoComplete: "off" }} />
        <div className="phb-group">
          <span className="pk-label">Days per week</span>
          <div className="phb-seg" role="radiogroup" aria-label="Days per week">
            {PHB_QUOTAS.map(([q, n]) => (
              <button key={n} type="button" role="radio" aria-checked={f.perWeek === q} className={phbCx("phb-seg-btn", f.perWeek === q && "is-on")} onClick={() => set({ perWeek: q })}>{n}</button>
            ))}
          </div>
        </div>
        <div className="phb-group">
          <span className="pk-label">Project · its colour</span>
          <PkChips className="phb-projs" label="Project">
            {[null].concat(projects).map((p) => {
              const pid = p ? p.id : null, on = f.projectId === pid;
              return (
                <button key={pid || "none"} type="button" className={phbCx("phb-proj", on && "is-on")} aria-pressed={on} onClick={() => set({ projectId: pid })}
                  style={p && p.color ? { "--hue": p.color } : undefined}>
                  <span className="phb-proj-dot" aria-hidden="true" />{p ? p.name : "No project"}
                </button>
              );
            })}
          </PkChips>
        </div>
      </div>
    </PkSheet>
  );
}

/* A list you reorder by holding a row: it lifts and follows the finger (y
   only), the rows it passes slide out of its way (FLIP), the drop springs it
   into its slot. A hold released in place calls onHold (its actions); a tap
   is a tap. Long lists scroll under the hand near the edges. */
function PhbSortList({ ids, render, onOrder, onHold, className }) {
  const [order, setOrder] = React.useState(null);
  const [lift, setLift] = React.useState(null);
  const box = React.useRef(null);
  const D = React.useRef({ t: 0 }).current;
  const list = order || ids;
  const rowEl = (id) => box.current && box.current.querySelector('[data-phb-sort="' + id + '"]');
  const follow = () => {
    const el = D.id != null ? rowEl(D.id) : null; if (!el) return;
    el.style.transform = "none";
    const r = el.getBoundingClientRect();
    el.style.transform = "translate3d(0," + (D.y - D.gy - r.top).toFixed(1) + "px,0) scale(1.02)";
  };
  React.useLayoutEffect(() => {
    const before = D.before; D.before = null;
    if (before && box.current) {
      box.current.querySelectorAll("[data-phb-sort]").forEach((el) => {
        const id = el.getAttribute("data-phb-sort"); if (id === String(D.id) || !before[id]) return;
        const dy = before[id] - el.getBoundingClientRect().top; if (!dy) return;
        el.style.transition = "none"; el.style.transform = "translate3d(0," + dy + "px,0)"; el.getBoundingClientRect();
        el.style.transition = pkReduced() ? "none" : "transform 0.28s cubic-bezier(0.2, 0.9, 0.24, 1)"; el.style.transform = "";
      });
    }
    follow();
  }, [order]);
  const stop = () => { window.clearTimeout(D.t); D.t = 0; if (D.rel) { D.rel(); D.rel = null; } };
  React.useEffect(() => stop, []);
  const down = (e, id) => {
    if (e.button) return;
    stop();
    const el = e.currentTarget, r = el.getBoundingClientRect();
    Object.assign(D, { id: id, sx: e.clientX, sy: e.clientY, y: e.clientY, gy: e.clientY - r.top, pid: e.pointerId, lifted: false, moved: false, swallow: false, order: null });
    D.t = window.setTimeout(() => {
      D.t = 0; D.lifted = true; D.swallow = true; D.rel = pkOwnGesture(D.pid);
      try { el.setPointerCapture(D.pid); } catch (err) { /* gone */ }
      window.needtPlatform.haptic("light");
      setLift(id); setOrder(ids.slice());
    }, PK_HOLD_MS);
  };
  const move = (e) => {
    if (D.id == null || e.pointerId !== D.pid) return;
    if (!D.lifted) { if (Math.hypot(e.clientX - D.sx, e.clientY - D.sy) > 8) { stop(); D.id = null; } return; }
    D.y = e.clientY; if (Math.abs(D.y - D.sy) > 8) D.moved = true;
    const tops = {}; let hit = null;
    box.current.querySelectorAll("[data-phb-sort]").forEach((el) => {
      const id = el.getAttribute("data-phb-sort"), r = el.getBoundingClientRect(); tops[id] = r.top;
      if (id !== String(D.id) && D.y > r.top + r.height * 0.25 && D.y < r.bottom - r.height * 0.25) hit = id;
    });
    const cur = D.order || ids;
    if (hit != null) {
      const from = cur.findIndex((x) => String(x) === String(D.id)), to = cur.findIndex((x) => String(x) === hit);
      if (from > -1 && to > -1 && from !== to) { const next = cur.slice(); next.splice(from, 1); next.splice(to, 0, D.id); D.order = next; D.before = tops; setOrder(next); return; }
    }
    follow();
    const sc = box.current.closest(".pk-scroll");
    if (sc) { const r = sc.getBoundingClientRect(); const v = D.y > r.bottom - 120 ? 8 : D.y < r.top + 110 ? -8 : 0; if (v) { sc.scrollTop += v; follow(); } }
  };
  const up = (e) => {
    if (D.id == null || (e && e.pointerId !== D.pid)) return;
    const id = D.id, was = D.lifted, moved = D.moved, next = D.order;
    stop(); D.id = null; D.lifted = false; D.order = null;
    if (!was) return;
    const el = rowEl(id);
    if (el) { el.style.transition = pkReduced() ? "none" : "transform 0.4s cubic-bezier(0.25, 1.35, 0.4, 1)"; el.style.transform = ""; window.setTimeout(() => { el.style.transition = ""; }, 440); }
    setLift(null); setOrder(null);
    if (moved && next && next.join() !== ids.join()) onOrder(next); else if (!moved && onHold) onHold(id);
  };
  return (
    <div ref={box} className={phbCx("phb-sort", lift != null && "is-lifting", className)}>
      {list.map((id) => (
        <div key={id} data-phb-sort={id} className={phbCx("phb-sort-row", String(lift) === String(id) && "is-lifted")}
          onPointerDown={(e) => down(e, id)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onClickCapture={(e) => { if (D.swallow) { D.swallow = false; e.stopPropagation(); e.preventDefault(); } }}
          onContextMenu={(e) => { e.preventDefault(); if (!D.lifted) { stop(); D.id = null; if (onHold) onHold(id); } }}>
          {render(id)}
        </div>
      ))}
    </div>
  );
}

function PhbHabits({ say, screen }) {
  const live = mbUseHabits();
  const [sheet, setSheet] = React.useState(false);
  const [edit, setEdit] = React.useState(null);
  const [acts, setActs] = React.useState(null);
  const [all, setAll] = React.useState(false);
  const sc = React.useRef(null);
  const kept = live.filter(phbOn).length;
  const d = window.NEEDT.today;
  const shown = live.length > PHB_CAP + 2 && !all ? live.slice(0, PHB_CAP) : live;
  const byId = {}; live.forEach((h) => { byId[h.id] = h; });
  /* Order is the habit table's order (the desktop lists them the same way);
     archived rows keep their slots. */
  const reorder = (ids) => {
    const before = window.habitStore.get();
    const queue = ids.slice(), set = {}; ids.forEach((id) => { set[id] = 1; });
    window.habitStore.set((l) => l.map((h) => { if (!set[h.id]) return h; const nid = queue.shift(); return l.filter((x) => x.id === nid)[0] || h; }));
    say("Order changed", () => window.habitStore.set(before));
  };
  const move = (h, d) => {
    const ids = live.map((x) => x.id), i = ids.indexOf(h.id), j = i + d; if (i < 0 || j < 0 || j >= ids.length) return;
    ids.splice(i, 1); ids.splice(j, 0, h.id); reorder(ids);
  };
  /* Archive: places.jsx's rule (archivedAt), the phone's undo snack. */
  const archive = (h) => { phbApi().patch(h.id, { archivedAt: new Date().toISOString() }); say("Archived “" + h.title + "”", () => phbApi().patch(h.id, { archivedAt: null })); };
  const habitActs = (h) => {
    if (!h) return;
    const on = phbOn(h), i = live.indexOf(h);
    setActs({ title: h.title, meta: [on ? "Kept today" : "Not yet today", window.NEEDT.habitTime(h)].filter(Boolean).join(" · "), actions: [
      { label: on ? "Undo today" : "Mark kept today", icon: "check", hue: phbHue(h), onClick: () => phbApi().toggle(h.id, !on), data: { "data-phb-act": "toggle" } },
      { label: "Edit", hint: "Name, time, days, project", icon: "pencil", glyph: null, hue: "var(--v2p-lav)", onClick: () => { setEdit(h); setSheet(true); }, data: { "data-phb-act": "edit" } },
      i > 0 ? { label: "Move up", icon: "arrow-up", hue: "var(--info)", onClick: () => move(h, -1), data: { "data-phb-act": "up" } } : null,
      i < live.length - 1 ? { label: "Move down", icon: "arrow-down", hue: "var(--info)", onClick: () => move(h, 1), data: { "data-phb-act": "down" } } : null,
      { label: "Archive", hint: "Its days stay; it stops coming back", icon: "archive", danger: true, onClick: () => archive(h), data: { "data-phb-act": "archive" } }
    ] });
  };
  const add = (title) => { const h = phbApi().add({ title: title }); say("Habit “" + h.title + "” added", () => phbApi().remove(h.id)); };
  const pull = {
    search: (q) => live.filter((h) => h.title.toLowerCase().indexOf(q.toLowerCase()) > -1).slice(0, 5).map((h) => ({
      id: h.id, title: h.title, h: h,
      meta: [phbOn(h) ? "Kept today" : "Not yet today", window.NEEDT.habitTime(h)].filter(Boolean).join(" · ")
    })),
    onPick: (hit) => {
      const el = sc.current && sc.current.querySelector('[data-phb-habit="' + hit.id + '"]');
      if (el) el.scrollIntoView({ block: "center", behavior: pkReduced() ? "auto" : "smooth" });
    },
    onAdd: add,
    placeholder: "Search or add a habit…",
    hint: "Habits, by name. Enter makes a new one.",
    addLabel: (q) => (q ? "New habit “" + q + "”" : "New habit")
  };
  const head = live.length ? (
    <div className="phb-head" data-phb-kept={kept + "/" + live.length}>
      <span className="phb-head-text"><PkNumber value={kept} className="phb-head-n" label={kept + " of " + live.length + " kept today"} /> of {live.length} kept today</span>
      <span className="phb-bar" aria-hidden="true"><span className="phb-bar-fill" style={{ "--p": (live.length ? kept / live.length : 0).toFixed(3) }} /></span>
    </div>
  ) : null;
  return (
    <>
      <PkScreen screen={screen || "habits"} title="Habits" glyph="habits" sub={PHB_DAY[d.getDay()] + ", " + d.getDate() + " " + PHB_MON_LONG[d.getMonth()]} head={head}
        right={<PkButton kind="chip" icon="plus" onClick={() => { setEdit(null); setSheet(true); }} aria-label="New habit" data-phb-new>New</PkButton>}
        onPull={pull} scrollRef={(el) => { sc.current = el; }} className="phb-screen">
        {!live.length ? (
          <PkEmpty title="No habits yet" line="A habit comes back every day. A missed day stays empty — nothing piles up."
            action={<PkButton kind="primary" icon="plus" onClick={() => { setEdit(null); setSheet(true); }}>New habit</PkButton>} />
        ) : (
          <>
            <PkSection title="Today" count={kept === live.length ? "All kept ✓" : null} className="phb-sec">
              <PhbSortList ids={shown.map((h) => h.id)} render={(id) => { const h = byId[id]; return h ? <PhbTodayRow h={h} /> : null; }}
                onOrder={reorder} onHold={(id) => habitActs(byId[id])} />
            </PkSection>
            {shown.length < live.length || all ? (
              <PkButton kind="ghost" className="phb-more" onClick={() => setAll(!all)}>{all ? "Show fewer" : "Show all " + live.length}</PkButton>
            ) : null}

            <PkSection title="The last months" className="phb-sec is-months">
              {live.map((h, i) => <PhbMonths key={h.id} h={h} idx={i} />)}
            </PkSection>

            <PkSection title="Time left" className="phb-sec is-left">
              <PhbLeft />
            </PkSection>
            <p className="phb-foot">A missed day stays empty. Nothing carries over.</p>
          </>
        )}
      </PkScreen>
      <PhbNewSheet open={sheet} habit={edit} onClose={() => setSheet(false)} say={say} />
      <PkActions acts={acts} onClose={() => setActs(null)} />
    </>
  );
}

/* ══ Moodboards ═══════════════════════════════════════════════════════════
   Wave 3 (09.10.26): the whole place in Plates — no old chrome left. Data
   and rules are Mobile.jsx's (useMbmBoards over stores.jsx's Board /
   BoardItem / BoardMember tables, mbmRole, mbmParseUrl, MBM_SWATCHES,
   mbmPins …); every view here is kit material:
     list        PkScreen (glyph, large → compact title, pull-down search
                 across boards and references, Enter starts a board), board
                 cards with glass covers; hold a card → its actions.
     board       PkScreen with a back chip, the board's glyph and title, one
                 primary Add, glass Share and ⋯. The wall is two columns;
                 tap a reference → its sheet; hold one → it lifts and follows
                 the finger, the others make room, the drop springs in (a
                 hold released in place opens its actions instead).
     sheets      add (photo / link / colour / note / Pinterest, one sheet),
                 the reference (edit its title, note, colour, move, remove),
                 share (invite, roles, link), rename / new board, move to
                 board, Pinterest boards; actions are PkActions.
   Delete, remove, leave and move each say so with Undo (the shell's snack). */
const PHB_KINDS = {
  image: ["Photo", "image", "var(--hue-blue)"], link: ["Link", "link", "var(--info)"], color: ["Colour", "palette", "var(--hue-pink)"],
  note: ["Note", "text", "var(--hue-yellow)"], pin: ["Pin", "pinterest", "var(--brand-pinterest)"]
};
const phbKind = (it) => PHB_KINDS[it && it.pin ? "pin" : it && it.kind] || PHB_KINDS.note;
const phbItemName = (it) => it.title || it.colorName || String(it.text || "").slice(0, 40) || phbKind(it)[0];
const phbNow = () => new Date().toISOString();
/* Two more rows of swatches than the old sheet: Craft's 6 × 3. */
const PHB_SWATCHES = MBM_SWATCHES.concat([["#FF8A3D", "Orange"], ["#2E6B5E", "Teal"], ["#5B4B8A", "Indigo"], ["#E8B4B8", "Blush"], ["#6B5B4B", "Walnut"], ["#7A8B99", "Slate"]]);

function PhbBoardCard({ b, onOpen, onHold }) {
  const role = mbmRole(b);
  const n = (b.items || []).length;
  const others = (b.members || []).filter((m) => m.email !== MBM_ME.email);
  const solo = !others.length && !b.linkShare;
  return (
    <PkHold className="phb-board-hold" onHold={() => onHold(b)}>
      <button type="button" className="phb-board" onClick={() => onOpen(b.id)} data-phb-board={b.id} aria-label={"Open " + b.title}>
        <span className="phb-board-cover"><MbmCover items={b.items} /></span>
        <span className="phb-board-title">{b.title}</span>
        <span className="phb-board-meta">
          <span className="phb-board-count">{role !== "owner" ? "From " + mbmOwner(b).name : n + (n === 1 ? " reference" : " references")}</span>
          {b.pinterestBoardId ? <MbmPinMark size={14} /> : null}
          {solo ? <span className="phb-board-lock" title="Only you"><PhbIcon name="lock" size={12} /></span> : <MbmFaces members={b.members} max={3} />}
        </span>
      </button>
    </PkHold>
  );
}

/* Search across boards: a board by its name, or a reference by its title,
   note, colour or source — opening the hit opens its board. */
function phbBoardHits(boards, q) {
  const s = q.toLowerCase(), has = (v) => String(v || "").toLowerCase().indexOf(s) > -1;
  const out = [];
  boards.forEach((b) => { if (has(b.title)) out.push({ id: "b:" + b.id, board: b.id, title: b.title, meta: (b.items || []).length + " references" }); });
  boards.forEach((b) => (b.items || []).forEach((it) => {
    if (out.length > 12) return;
    if (has(it.title) || has(it.text) || has(it.colorName) || has(it.color) || has(it.source && it.source.name) || has(it.source && it.source.domain)) {
      out.push({ id: "i:" + it.id, board: b.id, item: it.id, title: phbItemName(it), meta: phbKind(it)[0] + " · in " + b.title });
    }
  }));
  return out.slice(0, 6);
}

/* ── the wall: two columns, each reference into the shorter one ── */
function phbColumns(items) {
  const cols = [[], []], h = [0, 0];
  items.forEach((it) => {
    const est = it.kind === "note" ? 0.35 + Math.min(1, (it.text || "").length / 150)
      : it.kind === "link" ? (it.thumbnailUrl ? it.ratio || 1 : Math.min(it.ratio || 1, 0.8)) + 0.42
      : (it.ratio || 1) + (it.title && (it.kind === "image" || it.kind === "pin") ? 0.14 : 0);
    const c = h[0] <= h[1] ? 0 : 1;
    cols[c].push(it); h[c] += est + 0.06;
  });
  return cols;
}
function PhbTileFace({ it }) {
  return (
    <>
      <MbmMedia item={it} radius={18} />
      {(it.kind === "image" || it.kind === "pin") && it.title ? (
        <span className="phb-tile-cap">{it.kind === "pin" ? <MbmPinMark size={12} /> : null}<span>{it.title}</span></span>
      ) : null}
    </>
  );
}
/* Hold a reference: it lifts and follows the finger 1:1; the reference under
   the finger gives up its place and the others slide (FLIP); the drop
   springs it into its slot. A hold released where it started opens its
   actions. A short press is a tap. Pins (read-only) only open. */
function PhbWall({ items, canEdit, onOpen, onHold, onOrder }) {
  const [order, setOrder] = React.useState(null);   /* ids while dragging */
  const [lift, setLift] = React.useState(null);
  const box = React.useRef(null);
  const D = React.useRef({ t: 0 }).current;
  const byId = {}; items.forEach((it) => { byId[it.id] = it; });
  const shown = order ? order.map((id) => byId[id]).filter(Boolean) : items;
  const cols = phbColumns(shown);
  const tileEl = (id) => box.current && box.current.querySelector('[data-phb-item="' + id + '"]');
  const rects = () => {
    const m = {};
    if (box.current) box.current.querySelectorAll("[data-phb-item]").forEach((el) => { m[el.getAttribute("data-phb-item")] = el.getBoundingClientRect(); });
    return m;
  };
  /* the lifted tile sits under the finger, wherever its slot now is */
  const follow = () => {
    const el = D.id != null ? tileEl(D.id) : null; if (!el) return;
    el.style.transform = "none";
    const r = el.getBoundingClientRect();
    el.style.transform = "translate3d(" + (D.x - D.gx - r.left).toFixed(1) + "px," + (D.y - D.gy - r.top).toFixed(1) + "px,0) scale(1.04)";
  };
  /* FLIP: the others slide from where they were */
  React.useLayoutEffect(() => {
    const before = D.before; D.before = null;
    if (!before || !box.current) return;
    box.current.querySelectorAll("[data-phb-item]").forEach((el) => {
      const id = el.getAttribute("data-phb-item"); if (id === String(D.id)) return;
      const a = before[id]; if (!a) return;
      const b = el.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) return;
      el.style.transition = "none"; el.style.transform = "translate3d(" + dx + "px," + dy + "px,0)";
      el.getBoundingClientRect();
      el.style.transition = pkReduced() ? "none" : "transform 0.3s cubic-bezier(0.2, 0.9, 0.24, 1)"; el.style.transform = "";
    });
    follow();
  }, [order]);
  const stop = () => { window.clearTimeout(D.t); D.t = 0; if (D.rel) { D.rel(); D.rel = null; } };
  React.useEffect(() => stop, []);
  const down = (e, it) => {
    if (e.button || !canEdit || it.kind === "pin") return;
    stop();
    const el = e.currentTarget, r = el.getBoundingClientRect();
    Object.assign(D, { id: it.id, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, gx: e.clientX - r.left, gy: e.clientY - r.top, pid: e.pointerId, el: el, lifted: false, moved: false, swallow: false, ids: items.map((x) => x.id) });
    D.t = window.setTimeout(() => {
      D.t = 0; D.lifted = true; D.swallow = true; D.rel = pkOwnGesture(D.pid);
      try { el.setPointerCapture(D.pid); } catch (err) { /* gone */ }
      window.needtPlatform.haptic("light");
      setLift(it.id); setOrder(D.ids.slice());
    }, PK_HOLD_MS);
  };
  const move = (e) => {
    if (D.id == null || e.pointerId !== D.pid) return;
    if (!D.lifted) { if (Math.hypot(e.clientX - D.sx, e.clientY - D.sy) > 8) { stop(); D.id = null; } return; }
    D.x = e.clientX; D.y = e.clientY;
    if (Math.hypot(D.x - D.sx, D.y - D.sy) > 8) D.moved = true;
    /* the reference under the finger (not the lifted one) gives up its place */
    const m = rects(); let hit = null;
    Object.keys(m).forEach((id) => { const r = m[id]; if (id !== String(D.id) && D.x > r.left && D.x < r.right && D.y > r.top + r.height * 0.2 && D.y < r.bottom - r.height * 0.2) hit = id; });
    const cur = D.order || D.ids;
    if (hit != null) {
      const from = cur.findIndex((x) => String(x) === String(D.id)), to = cur.findIndex((x) => String(x) === hit);
      if (from > -1 && to > -1 && from !== to) {
        const next = cur.slice(); next.splice(from, 1); next.splice(to, 0, D.id);
        D.order = next; D.before = m; setOrder(next); return;
      }
    }
    follow();
    /* near the scroller's edge, the wall scrolls under the hand */
    const sc = box.current && box.current.closest(".pk-scroll");
    if (sc) { const r = sc.getBoundingClientRect(); const v = D.y > r.bottom - 120 ? 10 : D.y < r.top + 110 ? -10 : 0; if (v) { sc.scrollTop += v; follow(); } }
  };
  const up = (e) => {
    if (D.id == null || (e && e.pointerId !== D.pid)) return;
    const id = D.id, wasLifted = D.lifted, moved = D.moved, next = D.order;
    stop(); D.id = null; D.lifted = false; D.order = null;
    if (!wasLifted) return;
    const el = tileEl(id);
    if (el) {
      el.style.transition = pkReduced() ? "none" : "transform 0.42s cubic-bezier(0.25, 1.35, 0.4, 1)";
      el.style.transform = "";
      window.setTimeout(() => { if (el) el.style.transition = ""; }, 460);
    }
    setLift(null); setOrder(null);
    if (moved && next && next.join() !== items.map((x) => x.id).join()) onOrder(next);
    else if (!moved) onHold(byId[id]);
  };
  const click = (it) => { if (D.swallow) { D.swallow = false; return; } onOpen(it); };
  return (
    <div ref={box} className={phbCx("phb-wall", lift != null && "is-lifting")}>
      {cols.map((col, ci) => (
        <div key={ci} className="phb-col">
          {col.map((it) => (
            <button key={it.id} type="button" className={phbCx("phb-tile", String(lift) === String(it.id) && "is-lifted")} data-phb-item={it.id}
              aria-label={"Open " + phbItemName(it)} onClick={() => click(it)}
              onPointerDown={(e) => down(e, it)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
              onContextMenu={(e) => { e.preventDefault(); if (!D.lifted && !it.pin) { stop(); D.id = null; onHold(it); } }}>
              <PhbTileFace it={it} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ── Pinterest under a board's references ── */
function PhbPinterest({ b, role, onSync, onOptions, onOpenPin }) {
  const [busy, setBusy] = React.useState(false);
  if (!b.pinterestBoardId) return null;
  const synced = b.pinterestSyncedAt ? Date.parse(b.pinterestSyncedAt) : 0;
  const owner = role === "owner", lost = b.pinterestStatus === "lost";
  const sync = () => { setBusy(true); window.setTimeout(() => { setBusy(false); onSync(); }, 700); };
  return (
    <PkSection title={"Pinterest · " + b.pinterestBoardId} className="phb-pin-sec"
      action={owner ? <PkButton kind="ghost" icon="ellipsis" onClick={onOptions} aria-label="Pinterest options" data-phb-pin-opts /> : null}>
      {!owner ? (
        <div className="phb-plaque pk-glass" data-mbm="plaque">
          <PkHueTile icon="lock" hue="var(--brand-pinterest)" />
          <span className="phb-plaque-text">
            <span className="phb-plaque-title">Visible only to {mbmOwner(b).name}</span>
            <span className="phb-plaque-line">Pins are read from their account and never copied into Needt.</span>
          </span>
        </div>
      ) : lost ? (
        <div className="phb-plaque is-lost pk-glass" data-mbm="lost">
          <PkHueTile icon="triangle-alert" hue="var(--destructive)" />
          <span className="phb-plaque-text">
            <span className="phb-plaque-title">Needt can&apos;t reach this board</span>
            <span className="phb-plaque-line">Pinterest stopped answering {mbmAgo(synced)} — nothing was stored, so nothing is lost.</span>
          </span>
          <PkButton kind="primary" small onClick={onSync} data-phb-pin-reconnect>Reconnect</PkButton>
        </div>
      ) : (
        <>
          <div className="phb-pin-head">
            <MbmPinMark size={18} />
            <span className="phb-pin-status">{busy ? "Syncing…" : "Synced " + mbmAgo(synced)}</span>
            <PkButton kind="chip" icon="refresh-cw" disabled={busy} onClick={sync} data-phb-pin-sync>Sync</PkButton>
          </div>
          <PhbWall items={mbmPins(b.pinterestBoardId).map((x, i) => Object.assign({ id: "pin-" + i }, x, { kind: "pin", pin: true, ratio: x.ratio || 1 }))}
            canEdit={false} onOpen={onOpenPin} onHold={onOpenPin} onOrder={() => {}} />
        </>
      )}
    </PkSection>
  );
}

/* ── one board ── */
function PhbBoardPage({ b, say, onBack, onItem, onHoldItem, onAdd, onShare, onMore, onOrder, onPatch }) {
  const role = mbmRole(b);
  const canEdit = role !== "view";
  const items = b.items || [];
  const others = (b.members || []).filter((m) => m.email !== MBM_ME.email);
  const access = role !== "owner"
    ? <span className="phb-bh-who"><MbmAvatar m={mbmOwner(b)} size={18} />{mbmOwner(b).name}&apos;s board · you can {role === "edit" ? "edit" : "view"}</span>
    : others.length ? <span className="phb-bh-who"><MbmFaces members={b.members} max={4} />Shared with {others.length}</span>
    : <span className="phb-bh-who"><PhbIcon name="lock" size={12} />{b.linkShare ? "Anyone with the link" : "Only you"}</span>;
  const pull = {
    search: (q) => {
      const s = q.toLowerCase();
      return items.filter((it) => [it.title, it.text, it.colorName, it.color, it.source && it.source.name].some((v) => String(v || "").toLowerCase().indexOf(s) > -1))
        .slice(0, 6).map((it) => ({ id: it.id, title: phbItemName(it), meta: phbKind(it)[0], it: it }));
    },
    onPick: (h) => onItem(h.it),
    placeholder: "Search this board", hint: "Titles, notes, colours and sites on this board."
  };
  const head = (
    <div className="phb-bh" data-phb-page={b.id}>
      <PkButton kind="ghost" icon="chevron-left" className="phb-back" onClick={onBack} data-phb-back>Moodboards</PkButton>
      <div className="phb-bh-row">
        {window.PkGlyph ? <window.PkGlyph place="moodboards" size="l" /> : null}
        <h1 className="pk-title phb-bh-title">{b.title}</h1>
      </div>
      <p className="pk-sub phb-bh-sub"><span className="phb-bh-n">{items.length} {items.length === 1 ? "reference" : "references"}</span>{access}</p>
      <div className="phb-bh-acts">
        {canEdit ? <PkButton kind="primary" small icon="plus" onClick={onAdd} data-phb-add>Add</PkButton> : null}
        <PkGlass as="button" round className="phb-gbtn" onClick={onShare} aria-label={role === "owner" ? "Share" : "People"} data-phb-share>
          <PhbIcon name={role === "owner" ? "share" : "users"} size={16} /><span>{role === "owner" ? "Share" : "People"}</span>
        </PkGlass>
        <PkGlass as="button" round className="phb-gbtn is-icon" onClick={onMore} aria-label="Board options" data-phb-more><PhbIcon name="ellipsis" size={18} /></PkGlass>
      </div>
    </div>
  );
  return (
    <PkScreen screen="moodboard" compactTitle={b.title} head={head} headClass="phb-bh-head" onPull={pull} className="phb-board-screen">
      {items.length ? <PhbWall items={items} canEdit={canEdit} onOpen={onItem} onHold={onHoldItem} onOrder={onOrder} /> : (
        <PkEmpty title="Nothing on this board yet" line="Photos, links, colours and notes — whatever you are looking at when it clicks."
          action={canEdit ? <PkButton kind="primary" icon="plus" onClick={onAdd}>Add a reference</PkButton> : null} />
      )}
      <PhbPinterest b={b} role={role}
        onSync={() => onPatch({ pinterestSyncedAt: phbNow(), pinterestStatus: "ok" })}
        onOptions={() => onMore("pinterest")}
        onOpenPin={(pin) => onItem(Object.assign({}, pin, { pin: true, source: { name: "Pinterest", domain: "pinterest.com" }, url: "https://www.pinterest.com/" }))} />
    </PkScreen>
  );
}

/* ── add: one sheet — pick a kind, then its small form ── */
function PhbAddSheet({ open, b, onClose, onPick, onSave }) {
  const [mode, setMode] = React.useState("pick");
  const [link, setLink] = React.useState(""), [err, setErr] = React.useState(null);
  const [sw, setSw] = React.useState(PHB_SWATCHES[3]), [hex, setHex] = React.useState("");
  const [note, setNote] = React.useState("");
  React.useEffect(() => { if (open) { setMode("pick"); setLink(""); setErr(null); setSw(PHB_SWATCHES[3]); setHex(""); setNote(""); } }, [open]);
  const owner = b && mbmRole(b) === "owner";
  const p = mbmParseUrl(link);
  const typed = /^#?[0-9a-f]{6}$/i.test(hex.trim()) ? "#" + hex.trim().replace(/^#/, "").toUpperCase() : null;
  const color = typed || sw[0], cname = typed ? "Custom" : sw[1];
  const saveLink = () => {
    if (!p) { setErr("That doesn't look like a link — it needs a domain."); return; }
    onSave({ id: mbmId("i"), kind: "link", url: p.url, color: null, text: null, title: p.title, source: { name: p.name, domain: p.domain }, ratio: 0.75, createdAt: phbNow() });
  };
  const kinds = [
    ["photo", "Photo", "From your library or camera", PHB_KINDS.image],
    ["link", "Link", "A page, a product, a post", PHB_KINDS.link],
    ["color", "Colour", "A swatch, by eye or by hex", PHB_KINDS.color],
    ["note", "Note", "In your words", PHB_KINDS.note],
    owner ? ["pinterest", b && b.pinterestBoardId ? "Pinterest board" : "Pinterest", "Show a board's pins — never stored", PHB_KINDS.pin] : null
  ].filter(Boolean);
  const titles = { pick: "Add to " + (b ? b.title : "board"), link: "Paste a link", color: "Choose a colour", note: "Note" };
  const footer = mode === "link" ? <><PkButton onClick={() => setMode("pick")}>Back</PkButton><PkButton kind="primary" disabled={!link.trim()} onClick={saveLink} data-phb-add-save>Add link</PkButton></>
    : mode === "color" ? <><PkButton onClick={() => setMode("pick")}>Back</PkButton><PkButton kind="primary" onClick={() => onSave({ id: mbmId("i"), kind: "color", url: null, color: color, text: null, colorName: cname, ratio: 0.8, createdAt: phbNow() })} data-phb-add-save>Add colour</PkButton></>
    : mode === "note" ? <><PkButton onClick={() => setMode("pick")}>Back</PkButton><PkButton kind="primary" disabled={!note.trim()} onClick={() => onSave({ id: mbmId("i"), kind: "note", url: null, color: null, text: note.trim(), ratio: 0.7, createdAt: phbNow() })} data-phb-add-save>Add note</PkButton></>
    : null;
  return (
    <PkSheet open={open} onClose={onClose} title={titles[mode]} label={titles[mode]} className="phb-add-sheet" footer={footer}>
      {mode === "pick" ? (
        <div className="phb-kinds" role="menu">
          {kinds.map(([k, l, hint, K]) => (
            <PkGlass key={k} as="button" className="phb-kind" role="menuitem" data-phb-kind={k}
              onClick={() => { if (k === "photo" || k === "pinterest") onPick(k); else setMode(k); }}>
              <PkHueTile icon={K[1]} hue={K[2]} size={44} />
              <span className="phb-kind-text"><span className="phb-kind-label">{l}</span><span className="phb-kind-hint">{hint}</span></span>
            </PkGlass>
          ))}
        </div>
      ) : mode === "link" ? (
        <div className="phb-form">
          <PkField label="Link" id="phb-link" value={link} onChange={(e) => { setLink(e.target.value); setErr(null); }} placeholder="https://"
            className={err ? "is-invalid" : null} inputProps={{ inputMode: "url", autoComplete: "off", "data-phb-link": "", onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); saveLink(); } } }} />
          {err ? <p className="phb-err">{err}</p> : null}
          <PkButton kind="chip" icon="copy" className="phb-clip" onClick={() => {
            const fb = () => setLink("https://www.are.na/block/1987");
            try { navigator.clipboard.readText().then((t) => { if (t) setLink(t); else fb(); }, fb); } catch (e) { fb(); }
          }}>Paste from clipboard</PkButton>
          {p ? (
            <div className="phb-preview pk-glass">
              <PkHueTile icon="link" hue={mbmHue(p.domain)} size={40} />
              <span className="phb-kind-text"><span className="phb-kind-label">{p.title}</span><span className="phb-kind-hint">{p.domain}</span></span>
            </div>
          ) : null}
        </div>
      ) : mode === "color" ? (
        <div className="phb-form">
          <div className="phb-swatch" style={{ "--swatch": color, "--ink": mbmInk(color) }} data-phb-swatch={color}>
            <span className="phb-swatch-name">{cname}</span><span className="phb-swatch-hex">{color}</span>
          </div>
          <div className="phb-swatches" role="radiogroup" aria-label="Colours">
            {PHB_SWATCHES.map((s) => {
              const on = !typed && sw[0] === s[0];
              return <button key={s[0]} type="button" role="radio" aria-checked={on} aria-label={s[1]} className={phbCx("phb-sw", on && "is-on")} style={{ "--swatch": s[0] }} onClick={() => { setSw(s); setHex(""); }} />;
            })}
          </div>
          <PkField label="Hex" id="phb-hex" value={hex} onChange={(e) => setHex(e.target.value)} placeholder="#000000" inputProps={{ autoComplete: "off", "data-phb-hex": "" }} />
        </div>
      ) : (
        <div className="phb-form">
          <PkField label="Note" id="phb-note" multiline grow rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Type something…" inputProps={{ "data-phb-note": "" }} />
        </div>
      )}
    </PkSheet>
  );
}

/* ── a reference, opened: look at it, edit it, move or remove it ── */
function PhbItemSheet({ item, b, canEdit, onClose, onSave, onMove, onRemove }) {
  const last = React.useRef(null); if (item) last.current = item;
  const it = item || last.current;
  const [f, setF] = React.useState({ title: "", text: "", colorName: "", color: "" });
  React.useLayoutEffect(() => { if (item) setF({ title: item.title || "", text: item.text || "", colorName: item.colorName || "", color: item.color || "" }); }, [item && item.id]);
  if (!it) return <PkSheet open={false} onClose={onClose} detents={[0.92]} label="Reference" className="phb-item-sheet" />;
  const K = phbKind(it), pin = !!it.pin, edit = canEdit && !pin;
  const hexOk = /^#?[0-9a-f]{6}$/i.test(String(f.color || "").trim());
  const close = () => {
    if (edit && item) {
      const p = {};
      if ((f.title || "") !== (item.title || "") && it.kind !== "note" && it.kind !== "color") p.title = f.title.trim() || null;
      if ((f.text || "") !== (item.text || "")) p.text = f.text.trim() || null;
      if (it.kind === "color" && (f.colorName || "") !== (item.colorName || "")) p.colorName = f.colorName.trim() || "Colour";
      if (it.kind === "color" && hexOk) { const h = "#" + f.color.trim().replace(/^#/, "").toUpperCase(); if (h !== String(item.color || "").toUpperCase()) p.color = h; }
      if (Object.keys(p).length) onSave(p);
    }
    onClose();
  };
  const src = it.source;
  const shown = Object.assign({}, it, it.kind === "color" && hexOk ? { color: "#" + f.color.trim().replace(/^#/, ""), colorName: f.colorName } : null);
  return (
    <PkSheet open={!!item} onClose={close} detents={[0.92]} label={K[0]} title={pin ? "Pinterest pin" : K[0]} meta={pin ? "Pins stay on Pinterest" : "Added " + mbmDay(it.createdAt ? Date.parse(it.createdAt) : Date.now()) + (b ? " · " + b.title : "")}
      className="phb-item-sheet" footer={edit ? (
        <>
          <PkButton icon="move-to" onClick={() => onMove(it)} data-phb-item-move>Move</PkButton>
          <PkButton icon="trash-2" className="phb-danger" onClick={() => onRemove(it)} aria-label="Remove from board" data-phb-item-remove />
          <PkButton kind="primary" onClick={close} data-phb-item-done>Done</PkButton>
        </>
      ) : <PkButton kind="primary" onClick={close} data-phb-item-done>Done</PkButton>}>
      <div className="phb-item" data-mbm="detail" data-phb-detail={it.id}>
        {it.kind !== "note" ? <div className="phb-item-media"><MbmMedia item={shown} radius={22} big /></div> : null}
        {it.kind === "note" ? (
          edit ? <PkField label="Note" id="phb-item-text" multiline grow rows={4} value={f.text} onChange={(e) => setF(Object.assign({}, f, { text: e.target.value }))} placeholder="Type something…" inputProps={{ "data-phb-item-text": "" }} />
            : <p className="phb-item-note">{it.text}</p>
        ) : it.kind === "color" ? (
          edit ? (
            <div className="phb-item-pair">
              <PkField label="Name" id="phb-item-cname" value={f.colorName} onChange={(e) => setF(Object.assign({}, f, { colorName: e.target.value }))} placeholder="Colour" />
              <PkField label="Hex" id="phb-item-hex" value={f.color} onChange={(e) => setF(Object.assign({}, f, { color: e.target.value }))} placeholder="#000000" className={hexOk ? null : "is-invalid"} inputProps={{ autoComplete: "off" }} />
            </div>
          ) : null
        ) : edit ? (
          <PkField label="Title" id="phb-item-title" value={f.title} onChange={(e) => setF(Object.assign({}, f, { title: e.target.value }))} placeholder="Untitled" inputProps={{ "data-phb-item-title": "" }} />
        ) : it.title ? <p className="phb-item-title">{it.title}</p> : null}
        {src && src.domain ? (
          <div className="phb-source pk-glass" data-mbm="source">
            {pin ? <MbmPinMark size={32} /> : <PkHueTile icon="link" hue={mbmHue(src.domain || src.name)} size={36} />}
            <span className="phb-kind-text"><span className="phb-kind-label">{src.name}</span><span className="phb-kind-hint">{src.domain}</span></span>
            {it.url && /^https?:/.test(it.url) ? <a className="phb-open" href={it.url} target="_blank" rel="noopener noreferrer">Open<PhbIcon name="arrow-up-right" size={14} /></a> : null}
          </div>
        ) : src ? <p className="phb-item-from"><PhbIcon name="image" size={13} />From {src.name}</p> : null}
        {it.kind !== "note" && !pin ? (
          edit ? <PkField label="Note" id="phb-item-note" multiline grow rows={2} value={f.text} onChange={(e) => setF(Object.assign({}, f, { text: e.target.value }))} placeholder="Why this one" inputProps={{ "data-phb-item-note": "" }} />
            : it.text ? <p className="phb-item-note">{it.text}</p> : null
        ) : null}
      </div>
    </PkSheet>
  );
}

/* ── name a board (new or rename) ── */
function PhbNameSheet({ ask, onClose, onSave }) {
  const [v, setV] = React.useState("");
  const last = React.useRef(null); if (ask) last.current = ask;
  const a = ask || last.current || {};
  React.useEffect(() => { if (ask) setV(ask.value || ""); }, [ask]);
  const ok = !!v.trim();
  const save = () => { if (ok) onSave(v.trim()); };
  return (
    <PkSheet open={!!ask} onClose={onClose} title={a.title || "Board"} label={a.title || "Board"} className="phb-name-sheet"
      footer={<><PkButton onClick={onClose}>Cancel</PkButton><PkButton kind="primary" disabled={!ok} onClick={save} data-phb-name-save>{a.verb || "Save"}</PkButton></>}>
      <PkField label="Name" id="phb-board-name" value={v} onChange={(e) => setV(e.target.value)} placeholder="Untitled board"
        inputProps={{ autoComplete: "off", "data-phb-board-name": "", onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } } }} />
    </PkSheet>
  );
}

/* ── share: invite, roles, the link ── */
function PhbShareSheet({ open, b, onClose, onPatch, say, onActs }) {
  const [email, setEmail] = React.useState(""), [role, setRole] = React.useState("view"), [err, setErr] = React.useState(null);
  const last = React.useRef(null); if (b) last.current = b;
  const x = b || last.current;
  React.useEffect(() => { if (open) { setEmail(""); setErr(null); setRole("view"); } }, [open]);
  if (!x) return <PkSheet open={false} onClose={onClose} detents={[0.92]} label="Share" className="phb-share-sheet" />;
  const mine = mbmRole(x) === "owner";
  const invite = () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setErr("Enter an email address."); return; }
    if ((x.members || []).some((m) => m.email === e)) { setErr("Already on this board."); return; }
    const nm = e.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    onPatch({ members: (x.members || []).concat([{ name: nm, email: e, role: role }]) });
    say(nm + " can " + (role === "edit" ? "edit" : "view") + " “" + x.title + "”");
    setEmail(""); setErr(null);
  };
  const setMember = (m, next) => onPatch({ members: next === "remove" ? x.members.filter((y) => y.email !== m.email) : x.members.map((y) => (y.email === m.email ? Object.assign({}, y, { role: next }) : y)) });
  return (
    <PkSheet open={open} onClose={onClose} title="Share" meta={x.title} label="Share" detents={[0.92]} className="phb-share-sheet"
      footer={<PkButton kind="primary" onClick={onClose} data-phb-share-done>Done</PkButton>}>
      {mine ? (
        <div className="phb-form" data-mbm="invite">
          <PkField label="Invite" id="phb-invite" value={email} onChange={(e) => { setEmail(e.target.value); setErr(null); }} placeholder="Email" className={err ? "is-invalid" : null}
            inputProps={{ inputMode: "email", autoComplete: "off", "data-phb-invite": "", onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); invite(); } } }} />
          {err ? <p className="phb-err">{err}</p> : null}
          <div className="phb-invite-row">
            <div className="phb-seg" role="radiogroup" aria-label="Access">
              {[["view", "Can view"], ["edit", "Can edit"]].map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={role === k} className={phbCx("phb-seg-btn", role === k && "is-on")} onClick={() => setRole(k)}>{l}</button>
              ))}
            </div>
            <PkButton kind="primary" small disabled={!email.trim()} onClick={invite} data-phb-invite-go>Invite</PkButton>
          </div>
        </div>
      ) : <p className="phb-note-line"><PhbIcon name="lock" size={13} />Only {mbmOwner(x).name} can change who has access.</p>}
      <span className="pk-label phb-label">People</span>
      <div className="phb-glist" data-mbm="members">
        {(x.members || []).map((m) => {
          const me = m.email === MBM_ME.email;
          const label = m.role === "owner" ? "Owner" : m.role === "edit" ? "Can edit" : "Can view";
          return (
            <div key={m.email} className="phb-person">
              <MbmAvatar m={m} size={36} />
              <span className="phb-kind-text"><span className="phb-kind-label">{m.name}{me ? " (you)" : ""}</span><span className="phb-kind-hint">{m.email}</span></span>
              {mine && m.role !== "owner" ? (
                <PkGlass as="button" round className="phb-role" data-phb-role={m.email} onClick={() => onActs({ title: m.name, meta: m.email, actions: [
                  { label: "Can view", hint: "Sees the board, adds nothing", icon: "eye", hue: "var(--info)", check: m.role === "view", onClick: () => setMember(m, "view") },
                  { label: "Can edit", hint: "Adds and removes references", icon: "pencil", hue: "var(--success)", check: m.role === "edit", onClick: () => setMember(m, "edit") },
                  { label: "Remove from board", icon: "x", danger: true, onClick: () => { const was = x.members; setMember(m, "remove"); say(m.name + " removed", () => onPatch({ members: was })); } }] })}>
                  {label}<PhbIcon name="chevron-down" size={13} />
                </PkGlass>
              ) : <span className="phb-role is-static">{label}</span>}
            </div>
          );
        })}
      </div>
      <div className={phbCx("phb-glist phb-linkshare", !mine && "is-locked")} data-mbm="linkshare">
        <div className="phb-person">
          <PkHueTile icon="link" hue="var(--v2p-lav)" size={36} />
          <span className="phb-kind-text"><span className="phb-kind-label">Anyone with the link</span><span className="phb-kind-hint">{x.linkShare ? "Can view — not edit" : "Off — only the people above"}</span></span>
          <button type="button" role="switch" aria-checked={!!x.linkShare} aria-label="Anyone with the link" disabled={!mine} className={phbCx("phb-switch", x.linkShare && "is-on")} onClick={() => onPatch({ linkShare: !x.linkShare })} data-phb-linkshare>
            <span className="phb-switch-knob" />
          </button>
        </div>
        {x.linkShare ? (
          <PkButton kind="chip" icon="copy" className="phb-copy" onClick={() => { window.needtPlatform.copy("https://needt.app/b/" + x.id); say("Link copied"); }} data-phb-copy>Copy link</PkButton>
        ) : null}
      </div>
      {x.pinterestBoardId ? <p className="phb-note-line"><MbmPinMark size={14} />Pinterest pins are never shared — people see a plaque instead.</p> : null}
    </PkSheet>
  );
}

/* ── Pinterest: pick one of your boards ── */
function PhbPinSheet({ open, current, onClose, onPick }) {
  return (
    <PkSheet open={open} onClose={onClose} title="Pinterest" meta="Pins are read, never stored" label="Pinterest" className="phb-pin-sheet">
      <div className="phb-glist">
        {MBM_PIN_BOARDS.map(([n, c]) => (
          <button key={n} type="button" className="phb-person is-btn" onClick={() => onPick(n)} data-phb-pinboard={n}>
            <span className="phb-pin-cover" aria-hidden="true">{mbmPins(n).slice(0, 4).map((p, k) => <span key={k} style={{ "--swatch": p.color || null }} />)}</span>
            <span className="phb-kind-text"><span className="phb-kind-label">{n}</span><span className="phb-kind-hint">{c} pins</span></span>
            {current === n ? <PhbIcon name="check" size={18} /> : <PhbIcon name="chevron-right" size={16} />}
          </button>
        ))}
      </div>
    </PkSheet>
  );
}

function PhbBoards({ say, screen }) {
  const [boards, setBoards] = useMbmBoards();
  const [openId, setOpenId] = React.useState(null);
  const [item, setItem] = React.useState(null);      /* the open reference (or pin) */
  const [sheet, setSheet] = React.useState(null);    /* add | share | pinterest */
  const [acts, setActs] = React.useState(null);
  const [name, setName] = React.useState(null);      /* { title, value, verb, save(v) } */
  const b = boards.filter((x) => x.id === openId)[0] || null;
  /* a board that went away (deleted, left, edge data) closes */
  React.useEffect(() => { if (openId && !b) { setOpenId(null); setItem(null); setSheet(null); } }, [openId, !!b]);
  const role = b ? mbmRole(b) : null;
  const canEdit = role === "owner" || role === "edit";
  const titleOf = (id) => (boards.filter((x) => x.id === id)[0] || {}).title || "board";
  const patchBoard = (id, p) => setBoards((l) => mbmPatch(l, id, (x) => (typeof p === "function" ? p(x) : p)));
  const addItem = (it, id) => {
    const bid = id || openId;
    patchBoard(bid, (x) => ({ items: [it].concat(x.items || []) }));
    setSheet(null);
    say("Added to " + titleOf(bid), () => patchBoard(bid, (x) => ({ items: (x.items || []).filter((y) => y.id !== it.id) })));
  };
  const removeItem = (bid, it0) => {
    const bd = boards.filter((x) => x.id === bid)[0]; if (!bd) return;
    const at = (bd.items || []).findIndex((y) => y.id === it0.id); if (at < 0) return;
    const it = bd.items[at];
    patchBoard(bid, (x) => ({ items: (x.items || []).filter((y) => y.id !== it.id) }));
    setItem(null);
    say("Reference removed", () => patchBoard(bid, (x) => { const l = (x.items || []).slice(); l.splice(Math.min(at, l.length), 0, it); return { items: l }; }));
  };
  const moveItem = (it, to) => {
    const from = openId; if (!from || to === from) return;
    const bd = boards.filter((x) => x.id === from)[0]; const at = bd ? (bd.items || []).findIndex((y) => y.id === it.id) : -1; if (at < 0) return;
    const cur = bd.items[at];
    setBoards((l) => l.map((x) => (x.id === from ? Object.assign({}, x, { items: x.items.filter((y) => y.id !== cur.id) })
      : x.id === to ? Object.assign({}, x, { items: [cur].concat(x.items || []) }) : x)));
    setItem(null);
    say("Moved to " + titleOf(to), () => setBoards((l) => l.map((x) => {
      if (x.id === to) return Object.assign({}, x, { items: (x.items || []).filter((y) => y.id !== cur.id) });
      if (x.id === from) { const li = (x.items || []).slice(); li.splice(Math.min(at, li.length), 0, cur); return Object.assign({}, x, { items: li }); }
      return x;
    })));
  };
  const moveMenu = (it) => {
    const targets = boards.filter((x) => x.id !== openId && mbmRole(x) !== "view");
    setActs({ title: "Move to…", meta: phbItemName(it), actions: targets.length ? targets.map((x) => ({ label: x.title, hint: (x.items || []).length + " references", icon: "gallery", hue: mbmHue(x.title), onClick: () => moveItem(it, x.id), data: { "data-phb-move-to": x.id } }))
      : [{ label: "No other board to move to", icon: "info", disabled: true }] });
  };
  const reorder = (ids) => {
    const bid = openId, before = (b.items || []).slice();
    patchBoard(bid, (x) => { const m = {}; (x.items || []).forEach((y) => { m[y.id] = y; }); return { items: ids.map((id) => m[id]).filter(Boolean) }; });
    say("Order changed", () => patchBoard(bid, { items: before }));
  };
  const newBoard = (title) => {
    const id = mbmId("mb");
    const nb = { id: id, title: title || "Untitled board", projectId: null, linkShare: false, pinterestBoardId: null, pinterestStatus: null, pinterestSyncedAt: null,
      createdAt: phbNow(), trashedAt: null, members: [{ boardId: id, email: MBM_ME.email, role: "owner", name: MBM_ME.name }], items: [] };
    setBoards((l) => [nb].concat(l));
    setOpenId(id);
    say("Board “" + nb.title + "” made", () => setBoards((l) => l.filter((x) => x.id !== id)));
  };
  const askNew = () => setName({ title: "New board", value: "", verb: "Create", save: (v) => { setName(null); newBoard(v); } });
  const askRename = (x) => setName({ title: "Rename board", value: x.title, verb: "Save", save: (v) => {
    setName(null); const was = x.title; if (v === was) return;
    patchBoard(x.id, { title: v }); say("Renamed to “" + v + "”", () => patchBoard(x.id, { title: was }));
  } });
  const del = (x) => {
    patchBoard(x.id, { trashedAt: phbNow() });
    if (openId === x.id) setOpenId(null);
    say("“" + x.title + "” moved to Trash", () => patchBoard(x.id, { trashedAt: null }));
  };
  const leave = (x) => {
    const was = x.members;
    patchBoard(x.id, { members: (x.members || []).filter((m) => m.email !== MBM_ME.email) });
    if (openId === x.id) setOpenId(null);
    say("You left “" + x.title + "”", () => patchBoard(x.id, { members: was }));
  };
  const boardActs = (x, inside) => {
    const own = mbmRole(x) === "owner";
    setActs({ title: x.title, meta: (x.items || []).length + " references", actions: [
      inside ? null : { label: "Open", icon: "arrow-up-right", glyph: "moodboards", onClick: () => setOpenId(x.id) },
      own ? { label: "Rename", icon: "pencil", hue: "var(--v2p-lav)", onClick: () => askRename(x), data: { "data-phb-act": "rename" } } : null,
      { label: own ? "Share…" : "People", hint: own ? "Invite, roles, the link" : "Who is on this board", icon: "users", hue: "var(--info)", onClick: () => { setOpenId(x.id); setSheet("share"); }, data: { "data-phb-act": "share" } },
      inside && own ? { label: x.pinterestBoardId ? "Pinterest board…" : "Connect Pinterest", hint: "Show a board's pins here — never stored", icon: "pinterest", onClick: () => setSheet("pinterest") } : null,
      own ? { label: "Delete board", hint: "Kept in Trash for 30 days", icon: "trash-2", danger: true, onClick: () => del(x), data: { "data-phb-act": "delete" } }
        : { label: "Leave board", icon: "log-out", danger: true, onClick: () => leave(x), data: { "data-phb-act": "leave" } }
    ] });
  };
  const pinActs = () => setActs({ title: "Pinterest · " + b.pinterestBoardId, actions: [
    { label: "Change board", icon: "refresh-cw", hue: "var(--brand-pinterest)", onClick: () => setSheet("pinterest") },
    { label: "Disconnect Pinterest", hint: "Pins disappear; nothing of yours is lost", icon: "unlink", danger: true, onClick: () => {
      const was = { pinterestBoardId: b.pinterestBoardId, pinterestStatus: b.pinterestStatus, pinterestSyncedAt: b.pinterestSyncedAt };
      patchBoard(b.id, { pinterestBoardId: null, pinterestStatus: null, pinterestSyncedAt: null }); say("Pinterest disconnected", () => patchBoard(b.id, was));
    } }] });
  const itemActs = (it) => {
    if (!it || it.pin) { if (it) setItem(it); return; }
    const src = it.url && it.kind === "link";
    setActs({ title: phbItemName(it), meta: phbKind(it)[0], actions: [
      { label: canEdit ? "Open and edit" : "Open", icon: "pencil", hue: phbKind(it)[2], onClick: () => setItem(it), data: { "data-phb-act": "open" } },
      canEdit ? { label: "Move to board…", icon: "move-to", hue: "var(--success)", more: true, onClick: () => moveMenu(it), data: { "data-phb-act": "move" } } : null,
      canEdit && b && (b.items || [])[0] && b.items[0].id !== it.id ? { label: "Move to top", icon: "to-top", hue: "var(--v2p-lav)", onClick: () => reorder([it.id].concat(b.items.filter((y) => y.id !== it.id).map((y) => y.id))), data: { "data-phb-act": "top" } } : null,
      src ? { label: "Open " + ((it.source && it.source.domain) || "link"), icon: "arrow-up-right", hue: "var(--info)", onClick: () => window.open(it.url, "_blank", "noopener") } : null,
      it.kind === "color" ? { label: "Copy " + String(it.color || "").toUpperCase(), icon: "copy", hue: "var(--hue-pink)", onClick: () => { window.needtPlatform.copy(it.color); say("Copied " + it.color); } } : null,
      canEdit ? { label: "Remove from board", icon: "trash-2", danger: true, onClick: () => removeItem(openId, it), data: { "data-phb-act": "remove" } } : null
    ] });
  };
  const photos = (fs) => {
    const files = fs || [];
    const bid = openId;
    files.forEach((f) => {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 900 / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        let data = null; try { data = c.toDataURL("image/jpeg", 0.8); } catch (err) { /* tainted */ }
        if (data) addItem({ id: mbmId("i"), kind: "image", url: data, color: null, text: null, title: (f.name || "Photo").replace(/\.[a-z0-9]+$/i, ""), ratio: +(h / w).toFixed(3), source: { name: "Photos", domain: "" }, createdAt: phbNow() }, bid);
      };
      img.onerror = () => { URL.revokeObjectURL(url); say("That file isn't an image Needt can read"); };
      img.src = url;
    });
  };

  const mine = boards.filter((x) => mbmRole(x) === "owner");
  const shared = boards.filter((x) => mbmRole(x) !== "owner");
  const refs = mine.reduce((s, x) => s + (x.items || []).length, 0);
  const pull = {
    search: (q) => phbBoardHits(boards, q),
    onPick: (hit) => { setOpenId(hit.board); if (hit.item) { const bd = boards.filter((x) => x.id === hit.board)[0]; const it = bd && (bd.items || []).filter((y) => y.id === hit.item)[0]; if (it) setItem(it); } },
    onAdd: (q) => newBoard(q),
    placeholder: "Search or add a board",
    hint: "Boards and everything on them — titles, notes, colours, sites. Enter starts a board.",
    addLabel: (q) => (q ? "New board “" + q + "”" : "New board")
  };
  const openItem = item ? ((!item.pin && b && (b.items || []).filter((y) => y.id === item.id)[0]) || item) : null;

  return (
    <div className="phb-mb" data-pk-screen={screen || "moodboards"} data-phb-view={b ? "board" : "list"}>
      {b ? (
        <div key={"b-" + b.id} className="phb-mb-stage is-board">
          <PhbBoardPage b={b} say={say} onBack={() => setOpenId(null)} onItem={setItem} onHoldItem={itemActs}
            onAdd={() => setSheet("add")} onShare={() => setSheet("share")} onMore={(w) => (w === "pinterest" ? pinActs() : boardActs(b, true))}
            onOrder={reorder} onPatch={(p) => patchBoard(b.id, p)} />
        </div>
      ) : (
        <div key="list" className="phb-mb-stage">
          <PkScreen screen="moodboards-list" title="Moodboards" glyph="moodboards" className="phb-mb-list"
            sub={mine.length + (mine.length === 1 ? " board" : " boards") + " · " + refs + (refs === 1 ? " reference" : " references")}
            right={<PkButton kind="chip" icon="plus" onClick={askNew} aria-label="New board" data-phb-newboard>New</PkButton>}
            onPull={pull}>
            {!boards.length ? (
              <PkEmpty title="No boards yet" line="A board keeps photos, links, colours and notes side by side."
                action={<PkButton kind="primary" icon="plus" onClick={askNew}>New board</PkButton>} />
            ) : null}
            {mine.length ? <div className="phb-boards">{mine.map((x) => <PhbBoardCard key={x.id} b={x} onOpen={setOpenId} onHold={(y) => boardActs(y, false)} />)}</div> : null}
            {shared.length ? (
              <PkSection title="Shared with you" count={shared.length} glyph="shared" className="phb-shared">
                <div className="phb-boards">{shared.map((x) => <PhbBoardCard key={x.id} b={x} onOpen={setOpenId} onHold={(y) => boardActs(y, false)} />)}</div>
              </PkSection>
            ) : null}
          </PkScreen>
        </div>
      )}

      <PhbAddSheet open={sheet === "add"} b={b} onClose={() => setSheet(null)} onSave={(it) => addItem(it)}
        onPick={(k) => { if (k === "photo") { setSheet(null); window.needtPlatform.pickFile({ accept: "image/*", multiple: true }).then(photos); } else setSheet("pinterest"); }} />
      <PhbItemSheet item={openItem} b={b} canEdit={canEdit} onClose={() => setItem(null)}
        onSave={(p) => { const id = openItem.id, bid = openId, was = (b.items || []).filter((y) => y.id === id)[0];
          patchBoard(bid, (x) => ({ items: (x.items || []).map((y) => (y.id === id ? Object.assign({}, y, p) : y)) }));
          say("Saved", was ? () => patchBoard(bid, (x) => ({ items: (x.items || []).map((y) => (y.id === id ? was : y)) })) : undefined); }}
        onMove={(it) => moveMenu(it)} onRemove={(it) => removeItem(openId, it)} />
      <PhbShareSheet open={sheet === "share" && !!b} b={b} onClose={() => setSheet(null)} onPatch={(p) => patchBoard(b.id, p)} say={say} onActs={setActs} />
      <PhbPinSheet open={sheet === "pinterest" && !!b} current={b && b.pinterestBoardId} onClose={() => setSheet(null)}
        onPick={(n) => { const was = { pinterestBoardId: b.pinterestBoardId, pinterestStatus: b.pinterestStatus, pinterestSyncedAt: b.pinterestSyncedAt };
          patchBoard(b.id, { pinterestBoardId: n, pinterestStatus: "ok", pinterestSyncedAt: phbNow() }); setSheet(null); say("Pinterest board linked", () => patchBoard(b.id, was)); }} />
      <PhbNameSheet ask={name} onClose={() => setName(null)} onSave={(v) => name && name.save(v)} />
      <PkActions acts={acts} onClose={() => setActs(null)} />
    </div>
  );
}

window.PkPlaces = window.PkPlaces || {};
window.PkPlaces.habits = PhbHabits;
window.PkPlaces.moodboards = PhbBoards;
Object.assign(window, { PhbHabits, PhbBoards });
