/* HABITS — the standing shape of a week.
 *
 * A habit is not a task, and one consequence decides the whole design: a miss
 * must never become debt. If a habit fell into the unplaced queue or the
 * overdue column, every skipped day would turn into a backlog — the guilt
 * spiral that makes people abandon trackers. A habit is not closed, it
 * returns; a missed dot stays empty and nothing else happens.
 *
 * WHAT IT IS MEASURED BY. Not a streak: a streak punishes one miss with total
 * loss, which is why streaks get broken once and then abandoned. The number is
 * the share of the last fourteen days — "10 of 14" — and the dots are the
 * pattern, which reads as a shape rather than as a verdict.
 *
 * WHERE IT LIVES IN THE DAY. A habit owns a SLOT, not a day: German at 18:00
 * is a standing block with the grey rail, which is the rail that says the
 * scheduler may not move it. Habits are therefore the skeleton the scheduler
 * plans around — a real function, not a widget beside the plan.
 */
const HbNS = window.NeedtDesignSystem_25d3c8;
const { Icon: HbIcon, Tooltip: HbTooltip } = HbNS;

/* THE STORE lives in stores.jsx (07.10.26), shared with the phone: Habit
   rows (window.habitStore) and HabitCheckin rows (window.habitCheckinStore)
   behind window.habitApi. Every reader (Home chips, the shelf, the rail, the
   Habits screen) subscribes through useHabits, so a new habit shows up
   everywhere at once, and ticking today on Home ticks it in Habits too. This
   file owns how a habit is drawn: the strip is NEEDT.habitDays (computed from
   checkins), the colour NEEDT.habitColor, the hour NEEDT.habitTime. */
const hbApi = window.habitApi;
const hbUseHabits = window.useHabits;
const hbDays = (h) => window.NEEDT.habitDays(h.id);
const hbHue = (h) => window.NEEDT.habitColor(h) || "var(--text-tertiary)";
const hbOnToday = (h) => window.NEEDT.habitDoneOn(h.id);

/* The strip is fourteen cells: filled for a day it happened, hollow for a day
   it did not, and the last cell is today — the only one you can still act on,
   so it is the only one drawn as a control. */
function HabitStrip({ done, hue, onToggle }) {
  return (
    <span className="hb-strip">
      {done.map((d, i) => {
        const today = i === done.length - 1;
        return (
          <span key={i} role={today ? "checkbox" : undefined} aria-checked={today ? !!d : undefined}
            aria-label={today ? "Done today" : undefined}
            onClick={today ? (e) => { e.stopPropagation(); onToggle(); } : undefined}
            title={today ? "Today" : null}
            className={"hb-cell" + (today ? " is-today" : "") + (d ? " is-on" : "")}
            style={d ? { background: hue } : today ? { boxShadow: "inset 0 0 0 1px " + hue } : undefined} />
        );
      })}
    </span>
  );
}

function StreakChip({ compact }) {
  const n = window.NEEDT.streak();
  const closed = window.NEEDT.closedDays;
  const of14 = closed.reduce((s, d) => s + d, 0);
  if (!n) return null;
  return (
    <HbTooltip label={"A day counts as closed when everything due that day was closed. Today is still open; " + of14 + " of the last 14 held."} side="top">
      <span className={"hb-streak" + (compact ? " is-compact" : "")}>
        <span aria-hidden="true" className="hb-streak-ico">
          <HbIcon name="flame" size={compact ? 11 : 12} />
        </span>
        <span className="hb-streak-n">
          {n} {n === 1 ? "day" : "days"} closed
        </span>
      </span>
    </HbTooltip>
  );
}

/* TODAY (08.10.26) — the main block of the Habits screen. One large
   check-in card per habit: tap marks it kept for today (HabitCheckin upsert,
   same habitApi.toggle as everywhere). The card wears the habit's colour —
   a ring while open, a tinted ground and a filled check once kept. The hour,
   "10 of 14" (or "2/3 this week") and the fourteen-day strip sit small under
   the name. A perWeek habit whose week is already met and that is not kept
   today reads "Week done" and steps back — it is not due. This replaces the
   old shelf list (same rows, same menu), so nothing is drawn twice. */
function HabitTodayCard({ h, menu, i }) {
  const hue = hbHue(h);
  const on = hbOnToday(h);
  const days = hbDays(h);
  const hit = days.filter(Boolean).length;
  const perWeek = window.NEEDT.habitPerWeek(h), time = window.NEEDT.habitTime(h);
  const week = window.NEEDT.habitWeek(h.id);
  const streak = window.NEEDT.habitStreak(h.id);
  const rest = !!perWeek && !on && week >= perWeek;
  const label = perWeek ? week + "/" + perWeek + " this week" : hit + " of 14";
  const toggle = () => hbApi.toggle(h.id, !on);
  const say = h.title + (on ? " — kept today, press to undo" : rest ? " — week done, press to mark it kept anyway" : " — press to mark it kept today");
  return (
    <div role="checkbox" aria-checked={on} tabIndex={0} aria-label={say} title={say}
      data-ctx="habit" data-ctx-id={h.id} data-hb-today={h.id}
      className={"hb-today-card nx-swap nx-press nx-focus" + (on ? " is-on" : "") + (rest ? " is-rest" : "")}
      style={Object.assign({ animationDelay: (i * 30) + "ms", "--hb-hue": hue })}
      onClick={toggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}>
      <span className="hb-today-top">
        <span aria-hidden="true" className="hb-today-check">
          {on ? <HbIcon name="check" size={16} /> : null}
        </span>
        {time ? <span className="hb-today-time">{time}</span> : null}
        {menu ? <span className="hb-today-menu">{menu}</span> : null}
      </span>
      <span className="hb-today-title">{h.title}</span>
      <span className="hb-today-meta">
        <span className="hb-today-label">{on ? "Kept today" : rest ? "Week done" : "Not yet today"}</span>
        <span className="hb-today-sep" aria-hidden="true">·</span>
        <span className="hb-today-label">{label}{streak > 1 ? " · " + streak + " in a row" : ""}</span>
      </span>
      <HabitStrip done={days} hue={hue} onToggle={toggle} />
    </div>
  );
}

function HabitToday({ menu }) {
  const live = hbUseHabits();
  const kept = live.filter(hbOnToday).length;
  /* Many habits: the first twelve, then a quiet "Show all N" — the months
     and time-left below stay within reach. */
  const CAP = 12;
  const [all, setAll] = React.useState(false);
  const over = live.length > CAP + 2;
  const shown = over && !all ? live.slice(0, CAP) : live;
  return (
    <div className="hb-today">
      <div className="hb-today-head">
        <span className="hb-today-heading">Today</span>
        <span className="hb-today-count">{kept} of {live.length} kept</span>
        <span className="hb-today-streak"><StreakChip compact /></span>
      </div>
      <div className="hb-today-grid">
        {shown.map((h, i) => <HabitTodayCard key={h.id} h={h} i={i} menu={menu ? menu(h) : null} />)}
      </div>
      {over ? (
        <button type="button" className="nx-btn nx-btn-text nx-btn-sm hb-today-more" data-hb-more={all ? "less" : "all"} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : "Show all " + live.length}
        </button>
      ) : null}
      {/* No scolding, and no debt: a missed day is simply an empty dot. */}
      <p className="hb-today-foot">A missed day stays empty. Nothing carries over.</p>
    </div>
  );
}

const HB_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* MONTHS AS DOTS (08.10.26). One row block per month, one dot per day, the
   way a wall calendar reads: filled = kept, grey = missed, ring = still
   ahead. "All" shades the accent by the share of habits kept that day; one
   habit draws in its own colour. The last fourteen days come from checkins;
   older days in this prototype come from a stable walk per habit (the port
   reads real HabitCheckin rows for the whole range). */
const HB_MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function hbToday() {
  const t = window.NEEDT && window.NEEDT.today;
  return t instanceof Date ? new Date(t.getFullYear(), t.getMonth(), t.getDate()) : new Date(2026, 8, 1);
}
function hbKeptOn(h, idx, d, back) {
  if (back < 14) return window.NEEDT.habitDoneOn(h.id, d);
  const s = Math.sin(d.getTime() / 8.64e7 + (idx + 1) * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) < 0.62;
}
function HabitMonths({ live, pick, onToggleToday }) {
  const today = hbToday();
  const months = [];
  for (let k = 3; k >= 0; k--) months.push(new Date(today.getFullYear(), today.getMonth() - k, 1));
  const list = pick ? live.filter((h) => h.id === pick) : live;
  const hue = pick && list[0] ? (window.NEEDT.habitColor(list[0]) || "var(--accent)") : null;
  let activeThisMonth = 0;
  const rows = months.map((m) => {
    const n = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const dots = [];
    for (let day = 1; day <= n; day++) {
      const d = new Date(m.getFullYear(), m.getMonth(), day);
      const back = Math.round((today - d) / 8.64e7);
      if (back < 0) { dots.push({ day, kind: "ahead" }); continue; }
      const kept = list.filter((h) => hbKeptOn(h, live.indexOf(h), d, back)).length;
      const ratio = list.length ? kept / list.length : 0;
      if (ratio > 0 && m.getMonth() === today.getMonth()) activeThisMonth++;
      dots.push({ day, kind: ratio > 0 ? "on" : "miss", ratio, kept, today: back === 0 });
    }
    return { m, dots, current: m.getMonth() === today.getMonth() };
  });
  return (
    <div className="hb-months">
      {rows.map((r) => (
        <div key={r.m.getMonth()} className={"hb-month" + (r.current ? " is-current" : "")}>
          <span className="hb-month-name">{HB_MONTHS[r.m.getMonth()].toUpperCase()}</span>
          <div className="hb-month-dots">
            {r.dots.map((d) => {
              const label = d.day + " " + HB_MONTHS[r.m.getMonth()] + (d.kind === "ahead" ? " · ahead" : " · " + d.kept + " of " + list.length + " kept");
              const fill = d.kind === "on" ? (hue || (d.ratio >= 1 ? "var(--accent)" : "color-mix(in oklab, var(--accent) " + Math.round(35 + d.ratio * 55) + "%, transparent)")) : null;
              return (
                <span key={d.day} title={label} aria-label={label}
                  onClick={d.today ? onToggleToday : undefined}
                  className={"hb-dot is-" + d.kind + (d.today ? " is-today" : "")}
                  style={fill ? { background: fill } : undefined} />
              );
            })}
          </div>
        </div>
      ))}
      <span className="hb-months-sum"><b className="font-display">{activeThisMonth}</b> active {activeThisMonth === 1 ? "day" : "days"} in {HB_MONTH_LONG[today.getMonth()]}</span>
    </div>
  );
}

/* TIME LEFT — two quiet counters: the hours left today (a dot an hour,
   spent ones dim) and the days left in the year (a dot a day). Not a score;
   a sense of how much of the day and the year is still open. */
function hbUseNow() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  return now;
}
function HabitLeft() {
  const now = hbUseNow();
  const today = hbToday();
  const hour = now.getHours();
  const hoursLeft = 24 - hour - (now.getMinutes() > 0 ? 1 : 0);
  const y = today.getFullYear();
  const len = (new Date(y + 1, 0, 1) - new Date(y, 0, 1)) / 8.64e7;
  const dayOfYear = Math.round((today - new Date(y, 0, 1)) / 8.64e7);
  const daysLeft = len - dayOfYear - 1;
  const hours = [];
  for (let i = 0; i < 24; i++) hours.push(i < hour ? "spent" : i === hour ? "now" : "open");
  const days = [];
  for (let i = 0; i < len; i++) days.push(i < dayOfYear ? "spent" : i === dayOfYear ? "now" : "open");
  return (
    <div className="hb-left-wrap"><div className="hb-left">
      <div className="hb-left-card">
        <div className="hb-left-dots is-hours">{hours.map((k, i) => <span key={i} className={"hb-ldot is-" + k} />)}</div>
        <span className="hb-left-cap"><span><b className="font-display">{hoursLeft}</b> {hoursLeft === 1 ? "hour" : "hours"} left today</span></span>
      </div>
      <div className="hb-left-card">
        <div className="hb-left-dots is-year">{days.map((k, i) => <span key={i} className={"hb-ldot is-" + k} />)}</div>
        <span className="hb-left-cap"><span>{y}</span><span><b className="font-display">{daysLeft}</b> days left</span></span>
      </div>
    </div></div>
  );
}

function HabitRail() {
  const live = hbUseHabits();
  const allOn = live.length > 0 && live.every(hbOnToday);
  const todayDone = live.filter(hbOnToday).length;
  function toggleAll() {
    live.forEach((h) => hbApi.toggle(h.id, !allOn));
  }
  const [pick, setPick] = React.useState(null);
  const picked = pick && live.some((h) => h.id === pick) ? pick : null;
  return (
    <div className="hb-rail">
      <div className="hb-picks" role="tablist" aria-label="Show">
        <button type="button" role="tab" aria-selected={!picked} className={"hb-pick" + (!picked ? " is-on" : "")} onClick={() => setPick(null)}>All</button>
        {live.map((h) => (
          <button key={h.id} type="button" role="tab" aria-selected={picked === h.id} className={"hb-pick" + (picked === h.id ? " is-on" : "")} onClick={() => setPick(h.id)}>
            <span className="hb-pick-dot" style={{ background: window.NEEDT.habitColor(h) || "var(--accent)" }} />{h.title}
          </button>
        ))}
      </div>
      <HabitMonths live={live} pick={picked} onToggleToday={picked ? () => hbApi.toggle(picked, !hbOnToday(live.find((h) => h.id === picked))) : toggleAll} />
    </div>
  );
}

Object.assign(window, { hbKeptOn, HabitToday, HabitTodayCard, HabitRail, StreakChip, HabitStrip, HabitMonths, HabitLeft });
