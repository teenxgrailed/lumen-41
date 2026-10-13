/* PHONE v2 — "Plates" (08.10.26): the live phone's Home and Calendar, and the
 * shell that is mobile.html (mobile-dev.html renders V2pLivePhone).
 *
 * Home and Calendar in the material of menu A (nav-a.jsx), built from the
 * phone kit (phone-kit.jsx: PkScreen, usePkPlate, PkTaskRow, PkSection, PkSheet,
 * PkNumber, PkButton, PkField; the day rules are window.pkDay).
 *
 *   Home      date → a small progress line ("Done 6 of 10" + thin bar) →
 *             the nearest task on a compact SKY plate (PkSkyPlate: the brand
 *             sky, mood by time of day; time, Start focus, Done)
 *             → the rest of today as rows → Habits folded ("1 of 4") →
 *             Tomorrow / Done today folded → "Notes for the day" (saved per
 *             date, needt.dayNotes.<yyyy-mm-dd>). A finished day is one
 *             line, "All done for today ✓" (with a small sky, PkSkyBadge),
 *             + See tomorrow.
 *   Calendar  Schedule: week strip over one day; today shows now / next on
 *             a SKY plate (PkSkyPlate, like Home's Next up), then what is coming (lavender now-line); "No time"
 *             and "Earlier today" fold. Month: a dot grid; picking a day
 *             keeps the month and lists that day under it. Items that
 *             collide with a calendar event carry an "Overlaps · <other>"
 *             mark (task-on-task overlaps are not marked). Events open
 *             PkEventSheet (phone-overlays.jsx).
 *   Dark      plates are the kit's muted surface (usePkPlate); only the
 *             primary action keeps full contrast.
 *   Colour    (wave 3, 09.10.26) each screen's header carries its section
 *             glyph tile (PkScreen glyph), sections that are a place carry a
 *             small one (Habits, Inbox); the composer grows out of menu A's
 *             pill (PkComposer from=pkPillRect) and the pill steps out while
 *             it is up (NeedtNavA morph); a Done on Next up sweeps the plate.
 *   Gestures  task rows swipe right = done, left = tomorrow · pulling down at
 *             the top of either screen drops a plate with search + quick add.
 *
 * The shell (V2pLivePhone): ONE live phone. Every place is a Plates screen —
 * Home and Calendar here, the rest registered by the phone-*.jsx files in
 * window.PkPlaces — under menu A (nav-a.jsx). The sheets over them (task,
 * composer, Ask, paywall, snack) are phone-overlays.jsx. Signing out shows
 * Sign in (MobileAuth.jsx MbAuth) → Setup (MbSetup) → Home. Data and rules
 * are the phone's (Mobile.jsx stores and formatters, stores.jsx).
 */
const V2pNS = window.NeedtDesignSystem_25d3c8;
const { Icon: V2pIcon } = V2pNS;

/* Places. Screen files register themselves with
   window.PkPlaces[id] = Component({ tasks, onOpen, onFocus, say, pull, screen, onCover });
   onCover(bool): a full-screen layer of the place is up (a board item, the
   share walkthrough) — menu A's pill steps aside. Home and Calendar are this
   file's. */
window.PkPlaces = window.PkPlaces || {};
const V2P_BASE = ["home", "calendar"];
const v2pCx = (...a) => a.filter(Boolean).join(" ");

/* Notes for the day: a real field, saved per date. */
const v2pNotesKey = () => "needt.dayNotes." + window.NEEDT.iso(window.NEEDT.today);
function V2pNotes() {
  const key = v2pNotesKey();
  const S = window.needtSync;
  const [v, setV] = React.useState(() => (S ? S.getRaw(key) : null) || "");
  /* Another window's notes for the day land here. */
  React.useEffect(() => (S ? S.subscribe(key, (val, info) => { if (info.origin !== "local") setV(S.getRaw(key) || ""); }) : undefined), [key]);
  const change = (e) => {
    const next = e.target.value; setV(next);
    if (S) { if (next) S.set(key, next); else S.remove(key); }
  };
  return <PkField className="v2p-notes" label="Notes" id="v2p-notes-field" multiline grow rows={2} value={v} onChange={change} placeholder="Notes for the day…" inputProps={{ "data-v2p-notes": key }} />;
}

/* ── Home ─────────────────────────────────────────────────────────────── */
/* Help over report: the date, a small progress line, the nearest task with
   its time and actions, the rest of today as rows, habits folded, then done.
   A finished day is one line ("All done for today ✓") + See tomorrow. */
function V2pHome({ tasks, onOpen, onFocus, say, pull }) {
  const [fold, setFold] = React.useState({ tomorrow: true, done: true, habits: true });
  const flip = (k) => () => setFold((f) => Object.assign({}, f, { [k]: !f[k] }));
  const [skipped, setSkipped] = React.useState([]);
  const X = usePkExit((t, kind) => { if (kind === "later") say("Moved to tomorrow", pkDay.later(t)); else pkDay.toggle(t.id); });

  const sec = pkDay.sections(tasks);
  const { late, day, inbox, next } = sec;
  const openOf = (l) => l.filter((t) => !t.done);
  const doneToday = late.concat(day, inbox, next).filter((t) => t.done);
  const left = openOf(day);
  const tdone = day.filter((t) => t.done).length;
  const dayClosed = day.length > 0 && !left.length;
  const N = pkDay.nextUp(sec, { skipped: skipped, busy: X.phase });
  const nu = N.nu, nuAfter = N.after;
  /* the nearest task is on the card, so not again in the rows */
  const notNu = (l) => openOf(l).filter((t) => !nu || t.id !== nu.id);
  const parts = pkDay.parts(notNu(day));
  const lateRows = notNu(late);
  const allDone = dayClosed && !nu;

  const moveToToday = () => { const r = pkDay.moveOverdue(tasks); if (r) say(r.label, r.undo); };
  const row = (t, opts) => {
    const o = opts || {};
    return (
      <PkTaskRow key={t.id} t={t} late={!!o.late && !t.done} phase={X.phase[t.id]} out={!!X.out[t.id]}
        canDone={!t.done} canLater={!t.done && !o.tomorrow}
        onCheck={(x) => (x.done ? pkDay.toggle(x.id) : X.exit(x, "check"))} onOpen={onOpen} onSwipe={(side) => X.exit(t, side)} />
    );
  };

  const why = !nu ? "" : nu.overdue
    ? "Overdue since " + mbDue(nu) + (N.lateOpen.length > 1 ? " · +" + (N.lateOpen.length - 1) + " overdue" : "")
    : nuAfter && mbAt(nuAfter) != null && mbAt(nu) != null && nu.estimatedMinutes && mbAt(nu) + nu.estimatedMinutes / 60 <= mbAt(nuAfter)
      ? "Fits before " + mbTime(mbAt(nuAfter))
      : "Due today";
  const habits = mbUseHabits();
  const habitsDone = habits.filter((h) => window.NEEDT.habitDoneOn(h.id)).length;
  const lateN = openOf(late).length;
  const d = window.NEEDT.today;
  const tomorrowRef = React.useRef(null);
  const seeTomorrow = () => {
    setFold((f) => Object.assign({}, f, { tomorrow: false }));
    requestAnimationFrame(() => { const el = tomorrowRef.current; if (el) el.scrollIntoView({ block: "start", behavior: pkReduced() ? "auto" : "smooth" }); });
  };

  /* Progress is a small part of the header; a finished day is one line. */
  const head = allDone ? (
    <div className="v2p-prog is-done" data-v2p-alldone="">
      <span className="v2p-prog-sky"><PkSkyBadge /><p className="v2p-prog-line"><span className="v2p-prog-done">All done for today <V2pIcon name="check" size={16} /></span></p></span>
      {openOf(next).length ? <PkButton kind="chip" onClick={seeTomorrow} data-v2p-see-tomorrow>See tomorrow</PkButton> : null}
    </div>
  ) : day.length ? (
    <div className="v2p-prog" data-v2p-count={tdone + "/" + day.length}>
      <p className="v2p-prog-line">
        <span className="v2p-prog-count">{"Done "}<PkNumber value={tdone} label={String(tdone)} />{" of " + day.length}</span>
        {lateN ? <span className="v2p-prog-late"><span className="pk-alert-dot" />{lateN} overdue</span> : null}
      </p>
      <span className="v2p-prog-bar" aria-hidden="true"><span className="v2p-prog-fill" style={{ "--p": (tdone / day.length).toFixed(3) }} /></span>
    </div>
  ) : null;

  return (
    <PkScreen screen="home" glyph="home" title="Today" sub={MB_WEEKDAY[d.getDay()] + ", " + d.getDate() + " " + d.toLocaleDateString("en-GB", { month: "long" }) + " · week 36"}
      head={head} onPull={pull}>
      {nu ? (
        <PkSkyPlate className="v2p-next" data-v2p-next={nu.id} key={nu.id}>
          <div className="v2p-next-top">
            <span className={v2pCx("v2p-next-label", nu.overdue && "is-late")}>{nu.overdue ? <span className="pk-alert-dot" /> : null}{nu.overdue ? "Overdue" : "Next up"}</span>
            {mbAt(nu) != null ? <span className="v2p-next-time">{mbTime(mbAt(nu))}</span> : null}
            {nu.estimatedMinutes ? <span className="v2p-next-when">{mbDur(nu.estimatedMinutes)}</span> : null}
            {N.cands.length > 1 ? <PkButton kind="ghost" className="v2p-next-skip" onClick={() => setSkipped(N.skip)} data-v2p-skip>Skip</PkButton> : null}
          </div>
          <button type="button" className="v2p-next-title" onClick={() => onOpen(nu)}>{nu.title}</button>
          <p className="v2p-next-why">{why}</p>
          <div className="v2p-next-actions">
            <PkButton kind="primary" small icon="target" onClick={() => onFocus(nu)}>Start focus</PkButton>
            <PkButton small icon="check" onClick={() => { pkDotSweep("[data-v2p-next=\"" + nu.id + "\"]", "row"); X.exit(nu, "check"); }} data-v2p-next-done>Done</PkButton>
          </div>
        </PkSkyPlate>
      ) : null}

      {!day.length && !openOf(late).length && !openOf(inbox).length && !openOf(next).length && !doneToday.length
        ? <PkEmpty line="A clear day. Nothing is due and nothing is waiting — pull down to add something." /> : null}

      <div className="v2p-day">
        {lateRows.length ? (
          <PkSection title="Overdue" tone="late" count={lateRows.length} action={<PkButton kind="chip" onClick={moveToToday}>Move to today</PkButton>}>
            {lateRows.slice(0, MB_CAP_HOME).map((t) => row(t, { late: true }))}
          </PkSection>
        ) : null}
        {parts.map(([p, list]) => <PkSection key={p} title={p} count={list.length}>{list.slice(0, MB_CAP_HOME).map((t) => row(t))}</PkSection>)}
        {notNu(inbox).length ? <PkSection title="Inbox" glyph="tasks" count={notNu(inbox).length}>{notNu(inbox).slice(0, MB_CAP_HOME).map((t) => row(t))}</PkSection> : null}
        {habits.length ? (
          <PkSection className="v2p-habits" glyph="habits" title="Habits" count={habitsDone + " of " + habits.length} folded={fold.habits} onFold={flip("habits")}>
            {habits.map((h) => {
              const on = window.NEEDT.habitDoneOn(h.id);
              return (
                <button key={h.id} type="button" className={v2pCx("v2p-hab", on && "is-on")} style={{ "--hue": mbHabitHue(h) }} aria-pressed={on}
                  onClick={() => mbHabitApi().toggle(h.id, !on)} data-v2p-habit={h.id}>
                  <span className="v2p-hab-mark" aria-hidden="true">{on ? <V2pIcon name="check" size={12} /> : null}</span>
                  <span className="v2p-hab-title">{h.title}</span>
                </button>
              );
            })}
          </PkSection>
        ) : null}
        {openOf(next).length ? (
          <div ref={tomorrowRef} className="v2p-anchor">
            <PkSection title="Tomorrow" count={openOf(next).length} folded={fold.tomorrow} onFold={flip("tomorrow")}>
              {openOf(next).slice(0, MB_CAP_HOME).map((t) => row(t, { tomorrow: true }))}
            </PkSection>
          </div>
        ) : null}
        {doneToday.length ? (
          <PkSection title="Done today" count={doneToday.length} folded={fold.done} onFold={flip("done")}>
            {doneToday.slice(0, MB_CAP_HOME).map((t) => row(t))}
          </PkSection>
        ) : null}
      </div>

      <V2pNotes />
    </PkScreen>
  );
}

/* ── Calendar ─────────────────────────────────────────────────────────── */
const V2P_WD = ["M", "T", "W", "T", "F", "S", "S"];
function v2pDayLoad(n) { return n <= 0 ? 0 : n <= 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4; }
/* Timed items of one day that collide with a calendar event: id → titles of
   the others. Two tasks overlapping each other are not marked — the scheduling
   engine spreads them; only a clash that involves an event is the user's call. */
function v2pOverlaps(timed) {
  const out = {};
  timed.forEach((a) => {
    const others = timed.filter((b) => b !== a && (a.event || b.event) && a.at < b.at + b.len / 60 && b.at < a.at + a.len / 60);
    if (others.length) out[a.id] = others.map((b) => b.title);
  });
  return out;
}

function V2pWeek({ week, selDay, onPick, count }) {
  const plate = usePkPlate();
  return (
    <div className="v2p-week" role="tablist" aria-label="Days of the week">
      {week.map(([d, wd, mo], i) => {
        const on = d === selDay, today = d === C2_TODAY;
        const n = count(d);
        return (
          <button key={d + mo} type="button" role="tab" aria-selected={on} className={v2pCx("v2p-wd", on && "is-on", today && "is-today")} onClick={() => onPick(d)}
            data-v2p-day={d} aria-label={C2_LONG[wd] + " " + d + " " + mo + (n ? ", " + n + " planned" : "")}>
            {on ? <span className={"v2p-wd-plate " + plate} aria-hidden="true" /> : null}
            <span className={v2pCx("v2p-wd-in", on && plate)}>
              <span className="v2p-wd-letter">{V2P_WD[i]}</span>
              <span className="v2p-wd-num">{d}</span>
              <span className="v2p-wd-dots" aria-hidden="true">
                {[0, 1, 2].map((k) => <span key={k} className={v2pCx("v2p-wd-dot", k < Math.min(3, n) && "is-on")} />)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function V2pMonth({ selDay, onPick, count }) {
  const plate = usePkPlate();
  const inRange = (d, mo) => C2_RANGE.some((x) => x[0] === d && x[2] === mo);
  /* September 2026 from Monday 31 Aug; days past the planning range are drawn
     but quiet. */
  const cells = [[31, "Aug"]];
  for (let d = 1; d <= 30; d++) cells.push([d, "Sep"]);
  while (cells.length % 7) cells.push(null);
  return (
    <div className="v2p-month" data-v2p-month="">
      <div className="v2p-month-wd" aria-hidden="true">{V2P_WD.map((l, i) => <span key={i}>{l}</span>)}</div>
      <div className="v2p-month-grid" role="grid" aria-label="September">
        {cells.map((c, i) => {
          if (!c) return <span key={"x" + i} className="v2p-mc is-blank" />;
          const [d, mo] = c;
          const live = inRange(d, mo);
          const n = live ? count(d) : 0;
          const on = live && d === selDay, today = d === C2_TODAY && mo === "Sep";
          return (
            <button key={mo + d} type="button" disabled={!live} aria-pressed={on} className={v2pCx("v2p-mc", on && "is-on", today && "is-today", !live && "is-off", mo !== "Sep" && "is-other")}
              onClick={() => onPick(d)} data-v2p-mc={d} aria-label={d + " " + mo + (n ? ", " + n + " planned" : "")}>
              {on ? <span className={"v2p-mc-plate " + plate} aria-hidden="true" /> : null}
              <span className={v2pCx("v2p-mc-in", on && plate)}>
                <span className="v2p-mc-num">{d}</span>
                <span className={"v2p-mc-dot is-" + v2pDayLoad(n)} aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
      <p className="v2p-month-key"><span className="v2p-mc-dot is-1" />light <span className="v2p-mc-dot is-2" /><span className="v2p-mc-dot is-3" /><span className="v2p-mc-dot is-4" />full</p>
    </div>
  );
}

/* Calendar: the week strip over one day's schedule (Schedule), or the month
   grid over the picked day's items (Month — picking keeps the month). Today
   shows what is now and coming first; the past folds under "Earlier today",
   items with no time fold under "No time". Items colliding with an event
   say so (two tasks overlapping each other are not marked). */
function V2pCalendar({ tasks, onOpen, pull }) {
  const mine = window.useStore(c2Store);
  const titles = window.useStore(c2Titles);
  const hideDone = !!mbUse(mbPrefStore).calHideDone;
  const [view, setView] = React.useState("schedule");
  const todayI = Math.max(0, C2_RANGE.findIndex((x) => x[0] === C2_TODAY));
  const [sel, setSel] = React.useState(todayI);
  const [ev, setEv] = React.useState(null);
  const [fold, setFold] = React.useState({ past: true, loose: true });
  const flip = (k) => () => setFold((f) => Object.assign({}, f, { [k]: !f[k] }));
  const { blocks, loose } = mbCalData((tasks || []).filter((t) => !hideDone || !t.done), mine, titles);
  const W = Math.floor(sel / 7), weeks = Math.ceil(C2_RANGE.length / 7);
  const week = C2_RANGE.slice(W * 7, W * 7 + 7);
  const stepWeek = (k) => setSel((i) => Math.min(C2_RANGE.length - 1, Math.max(0, i + 7 * k)));
  const swipe = mbSwipe(stepWeek);
  const count = (d) => blocks.filter((b) => b.day === d).length + loose.filter((b) => b.day === d).length;
  const tap = (b) => { if (!b.event) { const t = (tasks || []).filter((x) => x.id === b.id)[0]; if (t && onOpen) onOpen(t); return; } setEv(b); };
  const pick = (d) => setSel(C2_RANGE.findIndex((x) => x[0] === d));
  const selD = C2_RANGE[sel];
  const day = selD[0];
  const isToday = day === C2_TODAY;
  const isPast = sel < todayI;
  const timed = blocks.filter((b) => b.day === day).sort((a, b) => a.at - b.at);
  const allDay = loose.filter((b) => b.day === day);
  const clash = v2pOverlaps(timed);
  const clashN = Object.keys(clash).reduce((s, k) => s + clash[k].length, 0) / 2; /* pairs */
  const ended = (b) => isToday && b.at + b.len / 60 <= C2_NOW;
  /* The plate: today, what is on now or next; a day ahead, its first item. */
  const nowB = isToday ? timed.filter((b) => b.at <= C2_NOW && b.at + b.len / 60 > C2_NOW)[0] : null;
  const nextB = isToday ? timed.filter((b) => b.at > C2_NOW)[0] : null;
  const plate = isToday ? nowB || nextB : !isPast ? timed[0] : null;
  const rest = timed.filter((b) => b !== plate);
  const coming = rest.filter((b) => !ended(b));
  const earlier = rest.filter(ended);
  const booked = timed.reduce((s, b) => s + b.len, 0);
  const plateLine = !plate ? "" : plate === nowB ? "until " + c2Time(plate.at + plate.len / 60)
    : isToday ? "in " + (Math.round((plate.at - C2_NOW) * 60) >= 60 ? c2Dur(Math.round((plate.at - C2_NOW) * 60)) : Math.round((plate.at - C2_NOW) * 60) + " min") : "";
  const nowAt = isToday ? coming.findIndex((b) => b.at > C2_NOW) : -1;
  const label = (b) => (b.event ? (b.user ? "Your events" : (b.source && C2_SOURCE_NAME[b.source]) || "Work calendar") : b.project || "Task");
  /* the sheet keeps its last event while it slides away */
  const lastEv = React.useRef(null); if (ev) lastEv.current = ev;
  const shown = ev || lastEv.current;
  const evDay = shown ? C2_RANGE.filter((x) => x[0] === shown.day)[0] : null;

  const overlap = (b) => (clash[b.id] ? (
    <span className="v2p-clash" data-v2p-clash={b.id}><span className="v2p-clash-mark" aria-hidden="true" /><span className="v2p-clash-text">Overlaps · {clash[b.id].join(", ")}</span></span>
  ) : null);
  const line = (b) => (
    <button key={b.id} type="button" className={v2pCx("v2p-tl", ended(b) && "is-past", b.done && "is-done")} onClick={() => tap(b)} data-v2p-tl={b.id}>
      <span className="v2p-tl-time"><span>{c2Time(b.at)}</span><span className="v2p-tl-end">{c2Time(b.at + b.len / 60)}</span></span>
      <span className="v2p-tl-main">
        <span className="v2p-tl-title">{b.title}</span>
        <span className="v2p-tl-meta"><span className="pk-hue" style={{ "--hue": b.event ? "var(--v2p-ink-3)" : c2Hue(b.project) }} />{c2Dur(b.len)} · {label(b)}</span>
        {overlap(b)}
      </span>
    </button>
  );
  const looseLine = (b) => (
    <button key={b.id} type="button" className={v2pCx("v2p-tl is-loose", b.done && "is-done")} onClick={() => tap(b)} data-v2p-tl={b.id}>
      <span className="v2p-tl-main">
        <span className="v2p-tl-title">{b.title}</span>
        <span className="v2p-tl-meta"><span className="pk-hue" style={{ "--hue": b.event ? "var(--v2p-ink-3)" : c2Hue(b.project) }} />{b.len ? c2Dur(b.len) + " · " : ""}{label(b)}</span>
      </span>
    </button>
  );
  const nowLine = <div key="now" className="v2p-now" data-v2p-now=""><span className="v2p-now-dot" /><span className="v2p-now-text">now {c2Time(C2_NOW)}</span><span className="v2p-now-rule" /></div>;
  const seg = (
    <span className="v2p-seg" role="radiogroup" aria-label="View">
      {[["schedule", "Schedule"], ["month", "Month"]].map(([id, l]) => (
        <button key={id} type="button" role="radio" aria-checked={view === id} className={v2pCx("v2p-seg-btn", view === id && "is-on")} onClick={() => setView(id)} data-v2p-view-btn={id}>{l}</button>
      ))}
    </span>
  );
  const sub = (
    <>
      {view === "schedule" ? "Week " + (36 + W) + " · " + mbCalFmt(week[0]) + " – " + mbCalFmt(week[week.length - 1]) : "2026 · tap a day"}
      {sel !== todayI ? <PkButton kind="inline" onClick={() => setSel(todayI)}>Today</PkButton> : null}
    </>
  );
  const head = (name) => (
    <div className="v2p-dayhead">
      <span className="v2p-dayhead-name">{name}</span>
      <span className="v2p-dayhead-meta">
        {timed.length + allDay.length ? (timed.length + allDay.length) + " planned" + (booked ? " · " + c2Dur(booked) + " booked" : "") : "Nothing planned"}
        {clashN ? <span className="v2p-dayhead-clash"> · {clashN + (clashN === 1 ? " overlap" : " overlaps")}</span> : null}
      </span>
    </div>
  );
  /* No time: one folded line, after the schedule — it never pushes it down. */
  const noTime = allDay.length ? (
    <PkSection className="v2p-fold" title="No time" count={allDay.length} folded={fold.loose} onFold={flip("loose")}>{allDay.map(looseLine)}</PkSection>
  ) : null;
  const empty = !timed.length && !allDay.length ? <PkEmpty line="A free day. Pull down to add something to it." /> : null;

  return (
    <>
      <PkScreen screen="calendar" glyph="calendar" title="September" headClass="is-cal" right={seg} sub={sub} onPull={pull}>
        <div data-v2p-view={view} className="v2p-cal-body">
          {view === "schedule" ? (
            <div key="schedule" className="v2p-swap" {...swipe}>
              <div className="v2p-week-row">
                <button type="button" className="v2p-step" aria-label="Previous week" disabled={W === 0} onClick={() => stepWeek(-1)}><V2pIcon name="chevron-left" size={16} /></button>
                <V2pWeek week={week} selDay={day} count={count} onPick={pick} />
                <button type="button" className="v2p-step" aria-label="Next week" disabled={W >= weeks - 1} onClick={() => stepWeek(1)}><V2pIcon name="chevron-right" size={16} /></button>
              </div>

              <div key={day} className="v2p-swap">
                {head(isToday ? "Today" : C2_LONG[selD[1]])}

                {plate ? (
                  <PkSkyPlate as="button" type="button" className="v2p-evplate" onClick={() => tap(plate)} data-v2p-plate={plate.id}>
                    <span className="v2p-next-top">
                      <span className={v2pCx("v2p-next-label", plate === nowB && "is-now")}>{plate === nowB ? <span className="v2p-now-dot" /> : null}{plate === nowB ? "Now" : isToday ? "Next" : "First up"}</span>
                      <span className="v2p-next-when">{plateLine}</span>
                    </span>
                    <span className="v2p-ev-title">{plate.title}</span>
                    <span className="v2p-ev-line">{c2Range(plate)} · {c2Dur(plate.len)} · {label(plate)}</span>
                    {overlap(plate)}
                    {plate === nowB ? (
                      <span className="v2p-ev-bar" aria-hidden="true"><span className="v2p-ev-bar-fill" style={{ "--p": Math.min(1, (C2_NOW - plate.at) / (plate.len / 60)).toFixed(3) }} /></span>
                    ) : null}
                  </PkSkyPlate>
                ) : null}

                {coming.length || (isToday && plate) ? (
                  <div className="v2p-timeline" data-v2p-coming="">
                    {coming.map((b, i) => (i === nowAt ? [nowLine, line(b)] : line(b)))}
                    {isToday && nowAt < 0 ? nowLine : null}
                  </div>
                ) : null}
                {noTime}
                {earlier.length ? (
                  <PkSection className="v2p-fold" title="Earlier today" count={earlier.length} folded={fold.past} onFold={flip("past")}>
                    <div data-v2p-earlier="">{earlier.map(line)}</div>
                  </PkSection>
                ) : null}
                {empty}
              </div>
            </div>
          ) : (
            <div key="month" className="v2p-swap">
              <V2pMonth selDay={day} count={count} onPick={pick} />
              <div key={day} className="v2p-swap v2p-month-day" data-v2p-month-day={day}>
                {head((isToday ? "Today" : selD[1]) + " " + day + " " + selD[2])}
                {timed.length ? <div className="v2p-timeline">{timed.map(line)}</div> : null}
                {noTime}
                {empty}
              </div>
            </div>
          )}
        </div>
      </PkScreen>

      <PkEventSheet open={!!ev} onClose={() => setEv(null)} title={shown ? shown.title : ""} meta={evDay ? C2_LONG[evDay[1]] + " " + evDay[0] + " " + evDay[2] : null}
        facts={shown ? [["Time", c2Range(shown)], ["Length", c2Dur(shown.len)], ["Calendar", label(shown)]].concat(clash[shown.id] ? [["Overlaps", clash[shown.id].join(", ")]] : []) : []} />
    </>
  );
}

/* ── The screens with their sheets, in the app's root. Edits go through
   pkDay. ── */
function V2pScreens({ theme, screen, composeKey, onSay, onCover, onComposing, shell }) {
  const tasks = mbUse(mbTaskStore).filter(mbLive);
  mbUse(mbEdgeStore);
  const [taskId, setTaskId] = React.useState(null);
  const [composer, setComposer] = React.useState(false);
  const [snack, setSnack] = React.useState(null);
  const say = (text, undo) => setSnack({ text: text, undo: undo, key: Date.now() });
  React.useEffect(() => { if (onSay) onSay.current = say; });
  /* The composer grows out of menu A's pill (PkSheet from=pkPillRect) and
     goes back into it; the pill steps out while it is up (onComposing). */
  mbOnKey(composeKey, () => { setComposer(true); if (onComposing) onComposing(true); });

  const startFocus = (t) => { setTaskId(null); say("Focus started · 25 min on “" + t.title + "”"); };
  const open = (t) => setTaskId(t.id);
  const task = taskId != null ? tasks.filter((t) => t.id === taskId)[0] : null;
  const pull = pkTaskPull({ tasks: tasks, onOpen: open, onAdd: (title) => { pkDay.create({ title: title }); say("Added to today"); } });
  const themeClass = theme === "dark" ? "dark" : "paper";
  const Place = V2P_BASE.indexOf(screen) < 0 ? window.PkPlaces[screen] : null;
  /* a place switch (menu A) gets the one-shot halftone sweep; the first
     screen does not */
  const firstScreen = React.useRef(screen);
  const switched = React.useRef(false);
  if (screen !== firstScreen.current) switched.current = true;

  return (
    <div className={"app mb-root v2p-root " + themeClass} data-v2p-root={screen}>
      <div key={screen} className="v2p-stage">
        {Place
          ? React.createElement(Place, Object.assign({ tasks: tasks, onOpen: open, onFocus: startFocus, say: say, pull: pull, screen: screen, onCover: onCover }, shell))
          : screen === "calendar"
          ? <V2pCalendar tasks={tasks} onOpen={open} pull={pull} />
          : <V2pHome tasks={tasks} onOpen={open} onFocus={startFocus} say={say} pull={pull} />}
      </div>
      {switched.current ? <PkSweep key={"sweep-" + screen} kind="screen" /> : null}

      <PkComposer open={composer} onClose={() => setComposer(false)} from={window.pkPillRect} onShut={() => { if (onComposing) onComposing(false); }}
        onCreate={(p) => { const id = pkDay.create(p); setComposer(false); say(pkDay.added(id)); }} />
      <PkTaskSheet task={task} open={!!task} onClose={() => setTaskId(null)} onUpdate={pkDay.update} onFocus={startFocus}
        onDelete={(t) => { setTaskId(null); say("Moved to Trash", pkDay.trash(t.id)); }} />
      <PkSnack snack={snack} onDone={() => setSnack(null)} />
    </div>
  );
}

/* ── Signed out: Sign in → Setup, then Home (MobileAuth.jsx). The theme
   switch there picks the phone's theme (System / Time resolve to light or
   dark now). ── */
function v2pResolveTheme(v) {
  if (v === "dark" || v === "light") return v;
  if (v === "system") return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const h = new Date().getHours();
  return v === "time" && (h >= 19 || h < 7) ? "dark" : "light";
}
function V2pAuth({ theme, onTheme, onDone }) {
  const [stage, setStage] = React.useState("auth");
  const [mode, setMode] = React.useState("login");
  const [choice, setChoice] = React.useState(theme);
  const accent = (() => { try { return localStorage.getItem("needt.accent") || "blue"; } catch (e) { return "blue"; } })();
  const pick = (v) => { setChoice(v); onTheme(v2pResolveTheme(v)); };
  return (
    <div className={"app mb-root " + (theme === "dark" ? "dark" : "paper")} data-accent={accent} data-v2p-auth={stage}>
      <div className="mb-u-flex-none-height-52px" />
      {stage === "setup"
        ? <window.MbSetup step={0} theme={choice} onTheme={pick} onDone={(view) => { if (view) mbSetPref("view", view); onDone(); }} />
        : <window.MbAuth mode={mode} onMode={setMode} onDone={() => setStage("setup")} />}
    </div>
  );
}

/* ── The live phone: every place in Plates, menu A over it. bare = no
   device frame (a real phone's viewport). ── */
function v2pInfo(tasks) {
  let unread = 0;
  try { unread = window.NEEDT.liveMail(window.mailApi.store.get()).filter((m) => !m.isRead).length; } catch (e) { /* no mail store */ }
  let outlookDown = false;
  try { outlookDown = mbConnRead().outlook === "disconnected"; } catch (e) { /* none */ }
  return {
    overdue: tasks.filter((t) => t.overdue && !t.done && !t.noSlot).length,
    unread: unread,
    unplaced: tasks.filter((t) => !t.done && !t.isFixed && !t.noSlot && !t.scheduledStart).length,
    outlookDown: outlookDown
  };
}

function V2pLivePhone({ theme, onTheme, bare }) {
  const tasks = mbUse(mbTaskStore).filter(mbLive);
  const [screen, setScreen] = React.useState("home");
  const [composeKey, setComposeKey] = React.useState(0);
  const [ask, setAsk] = React.useState(false);
  /* false, or open: true / the feature that asked ("Accent colours") */
  const [paywall, setPaywall] = React.useState(false);
  const [authing, setAuthing] = React.useState(false);
  const [cover, setCover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const [frameEl, setFrameEl] = React.useState(null);
  const sayRef = React.useRef(null);

  const go = (id) => { setCover(false); setScreen(V2P_BASE.indexOf(id) > -1 || window.PkPlaces[id] ? id : "home"); };
  const onScreen = (id) => { if (id === "ask") setAsk(true); else go(id); };
  const onSignOut = () => { setAsk(false); setPaywall(false); setCover(false); setAuthing(true); };
  const onCover = React.useCallback((v) => setCover(!!v), []);
  const onUpgrade = (feature) => setPaywall(typeof feature === "string" && feature ? feature : true);
  /* The shell's hooks, handed to every place (phone-settings.jsx uses them). */
  const shell = { onUpgrade: onUpgrade, onTheme: onTheme, onSignOut: onSignOut, onScreen: onScreen };
  /* The same hooks as window events, for a place that has no props: a
     cancelable "needt:upgrade" / "needt:theme" / "needt:signout" /
     "needt:go" (detail = the feature, "light"|"dark", —, a place id); a
     handled one is preventDefault()-ed so the sender knows. */
  const shellRef = React.useRef(shell); shellRef.current = shell;
  React.useEffect(() => {
    const on = { upgrade: (d) => shellRef.current.onUpgrade(d), theme: (d) => shellRef.current.onTheme(d === "dark" ? "dark" : "light"),
      signout: () => shellRef.current.onSignOut(), go: (d) => shellRef.current.onScreen(String(d || "home")) };
    const fns = Object.keys(on).map((k) => { const f = (e) => { on[k](e.detail); e.preventDefault(); }; window.addEventListener("needt:" + k, f); return [k, f]; });
    return () => fns.forEach(([k, f]) => window.removeEventListener("needt:" + k, f));
  }, []);
  /* Settings live: the pill's tiles (mobileTiles) and the accent follow the
     settings object the moment Settings writes it. */
  mbUse(window.needtSettings ? window.needtSettings.store : mbPrefStore);
  mbUse(mbPrefStore);
  const accent = window.needtSettings ? window.needtSettings.get("accent") || "blue" : "blue";

  const counts = typeof mnCounts === "function" ? mnCounts(v2pInfo(tasks)) : {};
  const tiles = typeof mnTiles === "function" ? mnTiles() : ["home", "docs", "ask"];
  const Nav = window.NeedtNavA;
  const themeClass = theme === "dark" ? "dark" : "paper";
  const away = ask || paywall || cover;
  const body = (
    <PkTheme.Provider value={theme}>
      <div className="mn-screen v2p-frame" ref={setFrameEl} data-v2p-frame="" data-accent={accent}>
        {authing
          ? <V2pAuth theme={theme} onTheme={onTheme} onDone={() => { setAuthing(false); setScreen("home"); }} />
          : <V2pScreens theme={theme} screen={screen} composeKey={composeKey} onSay={sayRef} onCover={onCover} onComposing={setComposing} shell={shell} />}
        <div className={"v2p-over " + themeClass}>
          <PkAsk open={ask} onClose={() => setAsk(false)} />
          {window.Paywall ? <PkPaywall open={!!paywall} feature={typeof paywall === "string" ? paywall : undefined} onClose={() => setPaywall(false)}
            onCheckout={(c) => {
              if (c === "lifetime") { if (sayRef.current) sayRef.current("Checkout opens here — prototype"); return; }
              if (window.needtPlan) window.needtPlan.set("trial");
              setPaywall(false);
              if (sayRef.current) sayRef.current("Pro trial started — 14 days, no card.");
            }} /> : null}
        </div>
        {authing || !Nav ? null : (
          <Nav theme={theme} screen={screen} onScreen={onScreen} tiles={tiles} counts={counts} frameEl={frameEl} onTheme={onTheme}
            onCompose={() => setComposeKey((k) => k + 1)} onUpgrade={() => onUpgrade()} onSignOut={onSignOut} away={away} morph={composing} />
        )}
      </div>
    </PkTheme.Provider>
  );
  if (bare) return <div className={"v2p-bare " + themeClass} data-v2p-bare="">{body}</div>;
  return <IOSDevice width={402} height={874} dark={theme === "dark"}>{body}</IOSDevice>;
}

window.V2pLivePhone = V2pLivePhone;
