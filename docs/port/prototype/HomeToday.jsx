/* HOME — the day, laid out like the Tasks screen (07.10.26).
 *
 * Full width, no document card: the Tasks header (+, the date as title, tabs
 * Day | Week ahead and Plan my day on the right), a row of compact summary
 * cards (progress, next up, streak, habits) in the project mini-card frame,
 * then the day's sections on the left and a rail on the right with today's
 * schedule and the Inbox. Rows are HdTask — the same rows Tasks uses — with
 * quiet metadata. Overdue sits above the day because it competes for today's
 * hours. */
const HdNS = window.NeedtDesignSystem_25d3c8;
const { Icon: HdIcon, Tooltip: HdTooltip } = HdNS;

const HD_PART = (at) => at == null ? null : at < 12 ? "Morning" : at < 17 ? "Afternoon" : "Evening";
const hdDur = (min) => !min ? "" : min < 60 ? min + " min" : Math.floor(min / 60) + " h" + (min % 60 ? " " + (min % 60) : "");
/* Task fields come in the database's names (Data.js); these read them in
   the shapes this file draws with: a decimal hour, a "4 Sep" label, a name. */
const hdAt = (t) => window.NEEDT.at(t);
const hdDue = (t) => window.NEEDT.dueLabel(t);
const hdTime = (at) => at == null ? "" : String(Math.floor(at)).padStart(2, "0") + ":" + (at % 1 ? "30" : "00");

/* Quiet row metadata (time · duration · source icon · project columns) is
   drawn by Task (task.jsx). The habit / add / chevron hovers that used to be
   injected here live in styles/home.css now. */
/* The task row, the checkbox and the quiet metadata live in task.jsx now —
   one Task for Home, Tasks, Calendar, Mail and the phone. HdCheck stays as a
   thin alias of TaskCheck. */
const HdCheck = window.TaskCheck;

/* Many tasks (07.10.26): a section shows its first `cap` rows and a quiet
   "Show all N" under them, so a 500-task day still opens at once and the
   page never turns into a wall. Small overflows (≤ 5) are just shown. */
const HD_CAP = 25;
function HdCapped({ list, render, cap }) {
  const [all, setAll] = React.useState(false);
  const n = cap || HD_CAP;
  const over = list.length > n + 5;
  const shown = over && !all ? list.slice(0, n) : list;
  return (
    <>
      {shown.map(render)}
      {over ? (
        <button type="button" className="nx-btn nx-btn-text nx-btn-sm hd-more" data-hd-more={all ? "less" : "all"} onClick={() => setAll(!all)}
          title={all ? "Show the first " + n + " only" : (list.length - n) + " more not shown"}>
          {all ? "Show fewer" : "Show all " + list.length}
        </button>
      ) : null}
    </>
  );
}

/* Craft's section: a chevron that folds, the name, a quiet count, an action. */
function HdFold({ title, count, open, onToggle, action, tone, note, children }) {
  return (
    <section className="hd-fold">
      <header className="hd-fold-head">
        <button type="button" className={"hd-chev hd-fold-chev" + (open ? "" : " is-shut")} onClick={onToggle} aria-expanded={open} aria-label={(open ? "Fold " : "Unfold ") + title}>
          <HdIcon name="chevron-down" size={14} />
        </button>
        <span onClick={onToggle} title={typeof title === "string" && title.length > 32 ? title : undefined} className={"hd-fold-title" + (tone === "late" ? " is-late" : "")}>{title}</span>
        {count ? <span className="hd-fold-count">{count}</span> : null}
        <span className="hd-fold-action">{action}</span>
      </header>
      {note ? <p className="hd-fold-note">{note}</p> : null}
      <div className={"nx-fold" + (open ? "" : " is-shut")} aria-hidden={!open}><div className="hd-fold-body">{children}</div></div>
    </section>
  );
}

/* Habits read the shared store (stores.jsx), so a habit added on the Habits
   screen is a chip here at once, and ticking it here ticks it there. Kept
   today / of the last 14 are computed from HabitCheckin rows. */
const hdUseHabits = () => window.useHabits ? window.useHabits() : ((window.NEEDT && window.NEEDT.habits) || []);
const hdToggleHabit = (id, on) => { if (window.habitApi) window.habitApi.toggle(id, on); };
const hdHabitOn = (h) => window.NEEDT.habitDoneOn(h.id);
const hdHabitTip = (h) => { const t = window.NEEDT.habitTime(h); return (t ? t + " · " : "") + window.NEEDT.habitKept(h.id) + " of the last 14"; };

/* HOME, rebuilt on the Tasks layout (07.10.26). No document card any more: the
   same header as Tasks (+, title, tabs right), then the summary row, then the
   list on the left and the rail on the right. Layout + container queries live
   in styles/home.css (.hd-home is the container "hdhome").
   08.10.26: Next up is the main accent — it takes half the summary row and is
   taller; Progress / Streak / Habits (Week ahead: tasks / hours / overdue) are
   a compact secondary block beside it. */
/* "Now" on the prototype's day: Tuesday 1 September, 14:20. */
const HD_NOW = 14 + 20 / 60;
const hdClock = (h) => { const m = Math.round(h * 60); return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
const HD_WEEK = [[2, "Tomorrow", "Wednesday"], [3, "Thursday"], [4, "Friday"], [5, "Saturday"], [6, "Sunday"], [7, "Monday"], [8, "Tuesday"]];

/* The summary card: the Tasks mini-card frame (a hue-tinted 5px frame around
   a raised plate), only holding a number or an action instead of a project. */
function HdCard({ hue, className, children, title, label, pad }) {
  return (
    <div className={"hd-card nx-swap tk-card " + (className || "")} title={title}
      style={{ background: "color-mix(in oklab, " + hue + " 22%, var(--background))" }}>
      <div aria-label={label} className="tk-card-plate" style={pad ? { padding: pad } : undefined}>
        {children}
      </div>
    </div>
  );
}
const hdCardLabel = (text, right) => (
  <div className="tk-card-label">
    <span>{text}</span>
    {right ? <span className="tk-card-right">{right}</span> : null}
  </div>
);

function HdProgressCard({ done, total, mins, closed, empty }) {
  const Ring = window.Ring;
  const pct = total ? done / total : 0;
  return (
    <HdCard hue="var(--accent)" className="hd-card-progress hd-card-sm" label="Progress">
      {hdCardLabel("Progress", <span key="r" title={Math.round(pct * 100) + "% of today's tasks done"} className="hd-card-ring">{Ring ? <Ring pct={pct} hue="var(--accent)" size={22} /> : null}</span>)}
      <div className="hd-card-foot">
        <span className="hd-card-stack">
          <span key={done} className="nx-swap hd-progress-n hd-card-big">
            {empty ? "Nothing due" : done + " of " + total + " done"}
          </span>
          <span className="hd-card-sub">
            {closed ? "All of today is closed" : empty ? "A clear day" : (hdDur(mins) || "0 min") + " of work left"}
          </span>
        </span>
      </div>
    </HdCard>
  );
}

/* NEXT UP. One task, picked so the next action never needs deciding: the
   earliest one still open — overdue first, then today by hour. Skip
   only moves the pick; it changes nothing about the task. */
function HdNextUp({ t, after, moreLate, onFocus, onDone, onSkip, onOpen, canSkip }) {
  const start = Math.max(HD_NOW, hdAt(t) == null ? HD_NOW : hdAt(t));
  const end = start + (t.estimatedMinutes || 0) / 60;
  const why = t.overdue
    ? "Overdue since " + hdDue(t) + " · the oldest thing still open, " + (hdDur(t.estimatedMinutes) || "no estimate") + (moreLate ? " · +" + moreLate + " overdue" : "")
    : hdAt(t) != null && hdAt(t) < HD_NOW
    ? "Was planned for " + hdTime(hdAt(t)) + " · still open, " + (hdDur(t.estimatedMinutes) || "no estimate")
    : after && hdAt(after) != null && t.estimatedMinutes && end <= hdAt(after)
      ? "Due today · " + hdDur(t.estimatedMinutes) + " fits before " + hdTime(hdAt(after))
      : "Due today" + (t.estimatedMinutes ? " · " + hdDur(t.estimatedMinutes) + " of work" : "");
  return (
    <window.Task layout="card" task={t} label="Next up" note={why} onOpen={onOpen} className="hd-card-next hd-next">
      <button type="button" className="nx-btn nx-btn-primary hd-next-focus" onClick={onFocus}><HdIcon name="target" size={15} />Start focus</button>
      <button type="button" className="nx-btn nx-btn-secondary" onClick={onDone}><HdIcon name="check" size={14} />Done</button>
      {canSkip ? <button type="button" className="nx-btn nx-btn-sm nx-btn-text" onClick={onSkip}>Skip</button> : null}
    </window.Task>
  );
}

function HdStreakCard({ n }) {
  return (
    <HdCard hue="var(--success)" className="hd-card-streak hd-card-sm" label="Streak" title="A missed day doesn't reset it to zero — it just pauses.">
      {hdCardLabel("Streak", <span key="a" className="hd-card-art"><window.Art name="habit" size={26} /></span>)}
      <div className="hd-streak hd-card-foot">
        <span className="hd-card-stack">
          <span key={n} className="nx-swap hd-card-big">{n} days closed</span>
          <span className="hd-card-sub hd-card-clip">A miss only pauses it</span>
        </span>
      </div>
    </HdCard>
  );
}

/* Habits read the shared store (stores.jsx), so a habit added on the Habits
   screen is a chip here at once, and ticking it here ticks it there. */
function HdHabitsCard() {
  const list = hdUseHabits();
  const kept = list.filter(hdHabitOn).length;
  return (
    <HdCard hue="var(--text-primary)" className="hd-card-habits hd-card-sm" label="Habits">
      {hdCardLabel("Habits", list.length ? <span key="k">{kept} of {list.length} kept</span> : null)}
      <div className="hd-chips">
        {list.length ? list.map((h) => {
          const on = hdHabitOn(h);
          return (
            <HdTooltip key={h.id} label={hdHabitTip(h)} side="bottom">
              <div role="button" tabIndex={0} aria-pressed={on} data-ctx="habit" data-ctx-id={h.id} className={"hd-habit hd-chip" + (on ? " is-on" : "")} onClick={() => hdToggleHabit(h.id, !on)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hdToggleHabit(h.id, !on); } }}>
                <HdCheck on={on} hue="var(--success)" />
                <span className="hd-chip-name">{h.title}</span>
              </div>
            </HdTooltip>
          );
        }) : <span className="hd-meta-t">No habits yet — add one on Habits.</span>}
      </div>
    </HdCard>
  );
}

/* PRO (08.10.26, paywall.jsx): Plan my day and Week load are Pro. On Free
   the button wears a locked PRO pill and opens the paywall on that feature;
   on Pro/trial it works and keeps a small PRO pill so you see what you pay for. */
const hdUsePro = () => (window.useNeedtPro ? window.useNeedtPro() : true);
function HdProPill({ pro }) { return window.ProBadge ? <window.ProBadge size="sm" locked={!pro} /> : null; }
function HdPlanButton({ pro, canPlan, onPlan, primary, size }) {
  const locked = !pro;
  return (
    <button type="button" data-agent-plan={primary ? "" : undefined} data-hd-plan={locked ? "locked" : "on"}
      className={"nx-btn nx-btn-secondary" + (size === "sm" ? " nx-btn-sm" : "")} disabled={!locked && !canPlan}
      onClick={locked ? () => window.openPaywall && window.openPaywall("Plan my day") : onPlan}
      title={locked ? "Unlock Plan my day with Pro" : canPlan ? "Place what has no time yet into today's free hours" : "Everything already has a time"}>
      <HdIcon name="wand-sparkles" size={size === "sm" ? 14 : 15} />Plan my day<HdProPill pro={pro} />
    </button>
  );
}

/* NOTHING PLANNED. The calm empty day: a picture, one line, a way in. */
function HdEmptyDay({ onNew, onPlan, pro, canPlan }) {
  return (
    <div data-hd-empty="1" className="nx-swap hd-empty">
      <window.Art name="event" size={56} />
      <h2 className="hd-empty-title">Nothing planned for today</h2>
      <p className="hd-empty-line">A clear day. Add what matters, or let Needt fill the free hours.</p>
      <div className="hd-empty-acts">
        <button type="button" className="nx-btn nx-btn-primary" onClick={onNew}><HdIcon name="plus" size={14} />New task</button>
        <HdPlanButton pro={pro} canPlan={canPlan} onPlan={onPlan} size="md" />
      </div>
    </div>
  );
}

/* DAY CLOSED. Not a celebration — a calm stop across the full width: what the
   day held, and the two things worth doing next. */
function HdDayClosed({ count, mins, habits, lateN, onPlan, onUndo }) {
  return (
    <div className="nx-sheet hd-closed">
      <window.Art name="task" size={56} />
      <div className="hd-closed-text">
        <h2 className="hd-closed-title">Day closed</h2>
        <p className="hd-closed-line">
          {count} tasks · {hdDur(mins) || "0 min"} of work · {habits} {habits === 1 ? "habit" : "habits"} kept. {lateN ? lateN + (lateN === 1 ? " overdue task is" : " overdue tasks are") + " still open." : "The rest of the evening is yours."}
        </p>
      </div>
      <div className="hd-closed-acts">
        <button type="button" className="nx-btn nx-btn-text" onClick={onUndo}>Undo last</button>
        <button type="button" className="nx-btn nx-btn-primary" onClick={onPlan}>Plan tomorrow</button>
      </div>
    </div>
  );
}

/* Today's timed events (Event rows: startAt / endAt): the calendar's synced
   seed (a shared top-level const) plus what the user added through
   window.calEvents, drawn as {at, len} by NEEDT.eventBlock. */
const hdEventsOn = (day) => {
  const N = window.NEEDT, d = N.dayIso(day);
  const seed = typeof C2_EVENTS !== "undefined" ? C2_EVENTS : [];
  const user = window.calEvents ? window.calEvents.list() : [];
  return N.eventsInRange(seed.concat(user), d + "T00:00", d + "T23:59")
    .map(N.eventBlock).filter((b) => b.date === d && b.at != null);
};

/* TODAY'S SCHEDULE. A compact agenda of events and timed tasks with the now
   line where 14:20 falls. Events wear a grey rail, tasks their project hue. */
function HdSchedule({ tasks, onOpen }) {
  const [, bump] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { window.addEventListener("needt-events", bump); return () => window.removeEventListener("needt-events", bump); }, []);
  const hueOf = (p) => (window.projectHue && p ? window.projectHue(p) : null) || "var(--text-muted)";
  const items = hdEventsOn(1).map((e) => ({ key: "e" + e.id, at: e.at, len: e.len || 30, title: e.title, event: true }))
    .concat(tasks.map((t) => ({ key: "t" + t.id, id: t.id, at: hdAt(t), len: t.estimatedMinutes || 30, title: t.title, done: t.done, hue: hueOf(t.projectId) })))
    .sort((a, b) => a.at - b.at || (a.event ? -1 : 1));
  const nowIdx = items.findIndex((x) => x.at > HD_NOW);
  const nowLine = (
    <div key="__now" className="hd-now" title={"Now · " + hdClock(HD_NOW)}>
      <span className="hd-now-time">{hdClock(HD_NOW)}</span>
      <span aria-hidden="true" className="hd-now-dot" />
      <span aria-hidden="true" className="hd-now-line" />
    </div>
  );
  const rows = [];
  items.forEach((x, i) => {
    if (i === nowIdx) rows.push(nowLine);
    const past = x.at + x.len / 60 <= HD_NOW;
    const live = x.at <= HD_NOW && !past;
    rows.push(
      <div key={x.key} className="hd-sched-row hd-sched-item" data-ctx={x.event ? undefined : "task"} data-ctx-id={x.event ? undefined : x.id}
        onClick={() => !x.event && onOpen && onOpen(x.id)} title={x.title + " · " + hdTime(x.at) + (x.len ? " · " + hdDur(x.len) : "")}
        style={live ? { background: "var(--fill-2)" } : undefined}>
        <span className={"hd-sched-time" + (past ? " is-past" : "")}>{hdTime(x.at)}</span>
        <span aria-hidden="true" className={"hd-sched-rail" + (past || x.done ? " is-dim" : "")} style={{ background: x.event ? "var(--fill-5)" : x.hue }} />
        <span className={"hd-sched-title" + (x.event ? " is-event" : "") + (x.done ? " is-done" : past ? " is-past" : "")}>
          {x.event ? <span className="hd-sched-ico"><HdIcon name="calendar" size={12} /></span> : null}{x.title}
        </span>
        <span className="hd-sched-dur">{hdDur(x.len)}</span>
      </div>
    );
  });
  if (nowIdx < 0) rows.push(nowLine);
  const evN = items.filter((x) => x.event).length;
  /* A packed day (500 tasks) shows a window of 24 rows around now, not all. */
  const [allRows, setAllRows] = React.useState(false);
  const SCH_CAP = 24;
  let vis = rows;
  if (!allRows && rows.length > SCH_CAP + 4) {
    const ni = rows.indexOf(nowLine);
    const from = Math.max(0, Math.min(ni - 6, rows.length - SCH_CAP));
    vis = rows.slice(from, from + SCH_CAP);
  }
  return (
    <section className="hd-sched hd-panel">
      <header className="hd-sched-head">
        <span className="hd-sched-heading">
          <span className="hd-panel-title">Today's schedule</span>
          <span className="hd-meta-t hd-num">{evN} {evN === 1 ? "event" : "events"} · {items.length - evN} timed {items.length - evN === 1 ? "task" : "tasks"}</span>
        </span>
        <button type="button" className="hd-link hd-push" onClick={() => window.__app && window.__app.setScreen && window.__app.setScreen("calendar")}>Calendar</button>
      </header>
      <div className="hd-sched-list">
        {items.length ? vis : <span className="hd-sched-none">Nothing timed today.</span>}
      </div>
      {vis.length < rows.length || allRows ? (
        <button type="button" className="hd-link hd-sched-more" data-hd-sched-more="" onClick={() => setAllRows(!allRows)}>
          {allRows ? "Show around now" : "Show all " + items.length}
        </button>
      ) : null}
    </section>
  );
}

/* INBOX in the rail: how many have no time yet, and the first three. */
function HdInboxCard({ list, total, onCheck, onOpen, phase }) {
  return (
    <section className="hd-inbox hd-panel">
      <header className="hd-inbox-head">
        <span className="hd-panel-title">Inbox</span>
        <span className="hd-meta-t hd-num">{total ? total + " with no time yet" : "Clear"}</span>
        <button type="button" className="hd-link hd-push" onClick={() => window.__app && window.__app.setScreen && window.__app.setScreen("tasks")}>All</button>
      </header>
      {list.length ? list.map((t) => (
        <window.Task key={t.id} layout="row" density="mini" task={t} className="hd-inbox-row hd-inbox-item" onToggle={() => onCheck(t)} onOpen={onOpen}
          style={{ opacity: phase[t.id] === "collapse" ? 0 : 1 }} />
      )) : <p className="hd-inbox-none">Anything you jot down without a time lands here.</p>}
      {total > list.length ? <p className="hd-inbox-more">+{total - list.length} more — drag onto the day</p> : null}
    </section>
  );
}

/* WEEK AHEAD — what fits (08.10.26). Capacity is the working day from
   Settings (Day starts / Day ends, needt.settings start / end); weekends have
   none unless "Fill weekends" is on. Planned = task estimates + event lengths
   on that day. Nothing here is stored: it is read from tasks, events and
   settings. */
const hdHm = (s) => { const m = String(s || "").split(":"); return (+m[0] || 0) + (+m[1] || 0) / 60; };
function hdCapacity() {
  const st = window.needtSettings ? window.needtSettings.get() : { start: "09:00", end: "18:00", weekends: false };
  const h = Math.max(0, hdHm(st.end) - hdHm(st.start));
  return { min: Math.round(h * 60), weekends: !!st.weekends, start: st.start, end: st.end };
}
const hdHours = (min) => { if (!min) return "0 h"; const h = Math.floor(min / 60), m = Math.round(min % 60); return (h ? h + " h" : "") + (m ? (h ? " " : "") + m + (h ? "" : " min") : ""); };

/* Week ahead stats (the compact block beside Next up). */
function HdWeekStats({ tasksN, doneN, plannedMin, capMin, overdueN }) {
  const Ring = window.Ring;
  const pct = capMin ? Math.min(1, plannedMin / capMin) : 0;
  return (
    <>
      <HdCard hue="var(--accent)" className="hd-card-progress hd-card-sm" label="This week">
        {hdCardLabel("This week")}
        <div className="hd-card-foot">
          <span className="hd-card-stack">
            <span className="hd-card-big hd-num">{tasksN} {tasksN === 1 ? "task" : "tasks"}</span>
            <span className="hd-card-sub">{tasksN ? doneN + " done · " + (tasksN - doneN) + " open" : "Nothing planned yet"}</span>
          </span>
        </div>
      </HdCard>
      <HdCard hue="var(--text-primary)" className="hd-card-streak hd-card-sm" label="Hours planned" title={hdHours(plannedMin) + " planned against " + hdHours(capMin) + " of working hours this week"}>
        {hdCardLabel("Hours planned", <span key="r" className="hd-card-ring">{Ring ? <Ring pct={pct} hue="var(--accent)" size={22} /> : null}</span>)}
        <div className="hd-card-foot">
          <span className="hd-card-stack">
            <span className="hd-card-big hd-num">{hdHours(plannedMin)}</span>
            {plannedMin > capMin
              ? <span className="hd-card-sub is-late">{hdHours(plannedMin - capMin)} more than {hdHours(capMin)} of working time</span>
              : <span className="hd-card-sub">of {hdHours(capMin)} working time</span>}
          </span>
        </div>
      </HdCard>
      <HdCard hue={overdueN ? "var(--destructive)" : "var(--text-primary)"} className="hd-card-habits hd-card-sm" label="Overdue"
        title={overdueN ? overdueN + (overdueN === 1 ? " task was" : " tasks were") + " due before today and are still open" : "Nothing left behind"}>
        {hdCardLabel("Overdue")}
        <div className="hd-card-foot">
          <span className="hd-card-stack">
            <span className={"hd-card-big hd-num" + (overdueN ? " is-late" : "")}>{overdueN ? overdueN + " overdue" : "Nothing overdue"}</span>
            <span className="hd-card-sub hd-card-clip">{overdueN ? "Due before today and still open — they eat into this week." : "Nothing from before today is still open."}</span>
          </span>
        </div>
      </HdCard>
    </>
  );
}

/* WEEK LOAD (rail, Week ahead). One row a day: planned against capacity as a
   bar (grey up to capacity, red past it), the hours, and what is still free.
   Red is always explained: the row's tooltip and the line under the list. */
function HdWeekLoad({ days, cap, pro }) {
  const scale = Math.max(cap.min, ...days.map((d) => Math.max(d.cap, d.planned))) || 1;
  const over = days.filter((d) => d.cap && d.planned > d.cap);
  const planned = days.reduce((s, d) => s + d.planned, 0);
  const free = days.reduce((s, d) => s + Math.max(0, d.cap - d.planned), 0);
  return (
    <section className="hd-load hd-panel" data-hd-load="">
      <header className="hd-sched-head">
        <span className="hd-sched-heading">
          <span className="hd-panel-title hd-pro-title">Week load<HdProPill pro={pro} /></span>
          <span className="hd-meta-t hd-num">{pro ? hdHours(planned) + " planned · " + hdHours(free) + " free" : "Planned against your working hours, day by day"}</span>
        </span>
        {pro ? <button type="button" className="hd-link hd-push" onClick={() => window.__app && window.__app.setScreen && window.__app.setScreen("calendar")}>Calendar</button> : null}
      </header>
      <div className={"hd-load-list" + (pro ? "" : " is-locked")} aria-hidden={pro ? undefined : "true"}>
        {days.map((d) => {
          const isOver = d.cap > 0 && d.planned > d.cap;
          const off = !d.cap;
          const inCap = Math.min(d.planned, d.cap || d.planned);
          const why = off
            ? d.short + " · day off" + (d.planned ? " · " + hdHours(d.planned) + " planned anyway" : "")
            : d.short + " · " + hdHours(d.planned) + " planned of " + hdHours(d.cap) + (isOver ? " — " + hdHours(d.planned - d.cap) + " more than your working hours" : " · " + hdHours(d.cap - d.planned) + " free");
          return (
            <div key={d.d} className={"hd-load-row" + (isOver ? " is-over" : "") + (off ? " is-off" : "")} title={why} aria-label={why} data-hd-load-day={d.d}>
              <span className="hd-load-day">
                <span className="hd-load-name">{d.short}</span>
                <span className="hd-load-date hd-num">{d.d}</span>
              </span>
              <span className="hd-load-bar">
                <span className="hd-load-track" style={{ width: (off ? 0 : d.cap / scale * 100) + "%" }} />
                {inCap ? <span className={"hd-load-fill" + (off ? " is-off" : "")} style={{ width: (inCap / scale * 100) + "%" }} /> : null}
                {isOver ? <span className="hd-load-over" style={{ left: (d.cap / scale * 100) + "%", width: ((d.planned - d.cap) / scale * 100) + "%" }} /> : null}
                {!off ? <span aria-hidden="true" className="hd-load-cap" style={{ left: (d.cap / scale * 100) + "%" }} /> : null}
              </span>
              <span className="hd-load-nums">
                <span className="hd-load-planned hd-num">{off && !d.planned ? "Day off" : hdHours(d.planned)}</span>
                <span className={"hd-load-free hd-num" + (isOver ? " is-over" : "")}>
                  {off ? (d.planned ? "day off" : "") : isOver ? "+" + hdHours(d.planned - d.cap) + " over" : hdHours(d.cap - d.planned) + " free"}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {!pro ? (
        <div className="hd-load-lock" data-hd-load-locked="">
          <span className="hd-load-lock-line">See which days are over capacity before they happen.</span>
          <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" onClick={() => window.openPaywall && window.openPaywall("Week load")}>
            <HdIcon name="lock" size={13} />Upgrade</button>
        </div>
      ) : <p className="hd-load-note">
        {over.length
          ? <><span className="hd-load-note-over">{over.map((d) => d.short).join(", ")} {over.length === 1 ? "holds" : "hold"} more than your working hours ({cap.start}–{cap.end}).</span> Move something to a day with free time.</>
          : "Every day fits inside your working hours (" + cap.start + "–" + cap.end + ")."}
      </p>}
    </section>
  );
}

function HomeToday({ tasks: allTasks, onOpen, onToggle, dragProps }) {
  /* Trashed tasks (trashedAt) live on the Trash screen only. */
  const tasks = window.NEEDT.liveTasks(allTasks);
  const today = 1;
  const [tab, setTab] = React.useState("day");
  const [fold, setFold] = React.useState({ done: true });
  const flip = (k) => () => setFold((f) => Object.assign({}, f, { [k]: !f[k] }));
  const habitList = hdUseHabits();
  /* The reward: id -> "strike" | "collapse" while a checked row is leaving;
     `back` holds rows that just came back from Done; `closed` is the order
     things were closed in, so Undo last knows what last means. */
  const [leaving, setLeaving] = React.useState({});
  const [back, setBack] = React.useState({});
  const [skipped, setSkipped] = React.useState([]);
  const closed = React.useRef([]);
  const timers = React.useRef({});
  const scrollRef = React.useRef(null);
  const tasksRef = React.useRef(tasks);
  tasksRef.current = tasks;
  React.useEffect(() => () => Object.values(timers.current).forEach((l) => l.forEach(clearTimeout)), []);

  const dueDay = (t) => window.NEEDT.dueDay(t);
  const isDay = (t) => !t.overdue && !t.noSlot && dueDay(t) === today;
  const late = tasks.filter((t) => t.overdue && !t.noSlot);
  const day = tasks.filter(isDay).sort((a, b) => (hdAt(a) == null ? 99 : hdAt(a)) - (hdAt(b) == null ? 99 : hdAt(b)));
  const inbox = tasks.filter((t) => !t.overdue && !t.noSlot && !t.dueDate && !t.isFixed);
  /* One rule for every section: it lists open tasks (plus a row still playing
     its exit), its counter counts open tasks only, and a section with nothing
     open is not drawn at all. Done rows live in "Done today". */
  const shown = (t) => !t.done || leaving[t.id];
  const openN = (list) => list.filter((t) => !t.done).length;
  const live = (list) => list.some((t) => !t.done || leaving[t.id]);
  const lateShown = late.filter(shown);
  const parts = ["Morning", "Afternoon", "Evening"].map((p) => [p, day.filter((t) => HD_PART(hdAt(t)) === p && shown(t))])
    .concat([["Anytime today", day.filter((t) => hdAt(t) == null && shown(t))]]).filter((x) => live(x[1]));
  const doneToday = late.concat(day, inbox).filter((t) => t.done && !leaving[t.id]);
  const left = day.filter((t) => !t.done);
  const mins = left.reduce((s, t) => s + (t.estimatedMinutes || 0), 0);
  const dayClosed = day.length > 0 && left.length === 0 && !day.some((t) => leaving[t.id]);
  /* An empty day: nothing due today and nothing overdue still open. */
  const dayEmpty = day.length === 0 && !live(late);
  const newTask = () => { if (window.__app && window.__app.openComposer) window.__app.openComposer(); else if (onOpen) onOpen(); };
  const canPlan = tasks.some((t) => !t.done && !t.isFixed);
  const pro = hdUsePro();
  /* Plan my day: the agent's walk, moved here from the old controls row. */
  const planDay = () => {
    if (window.__agent && canPlan) window.__agent.run([
      { sel: "[data-agent-queue] article", act: "hold", say: "Taking what has no time yet", title: "Finish the tank graphic" },
      { sel: "[data-drop=\"timeline\"][data-date=\"1\"]", act: "drop", say: "Into the first free stretch today" },
      { sel: "[data-agent-plan]", act: "click", say: "Two more fit before Thursday" }
    ]);
    else if (window.__app && window.__app.setChatOpen) window.__app.setChatOpen(true);
  };

  const clearTimers = (id) => { (timers.current[id] || []).forEach(clearTimeout); delete timers.current[id]; };
  const drop = (setter, id) => setter((m) => { const n = Object.assign({}, m); delete n[id]; return n; });
  /* onToggle fires first, always: the app's state (and the sidebar's progress)
     moves at once; the row's exit is only the page catching up. */
  const check = (t) => {
    /* Closing a parent closes its parts with it; reopening it reopens none.
       Same path as everywhere (task.jsx → taskToggle, rule in Data.js). */
    window.taskToggle(onToggle, t);
    clearTimers(t.id);
    if (!t.done) {
      closed.current = closed.current.filter((x) => x !== t.id).concat(t.id);
      setLeaving((m) => Object.assign({}, m, { [t.id]: "strike" }));
      timers.current[t.id] = [
        setTimeout(() => setLeaving((m) => m[t.id] ? Object.assign({}, m, { [t.id]: "collapse" }) : m), 600),
        setTimeout(() => { drop(setLeaving, t.id); delete timers.current[t.id]; }, 870)
      ];
    } else {
      closed.current = closed.current.filter((x) => x !== t.id);
      drop(setLeaving, t.id);
      setBack((m) => Object.assign({}, m, { [t.id]: true }));
      timers.current[t.id] = [setTimeout(() => { drop(setBack, t.id); delete timers.current[t.id]; }, 320)];
    }
  };
  const undoLast = () => {
    const ids = closed.current;
    const id = ids[ids.length - 1];
    const t = id != null ? tasksRef.current.find((x) => x.id === id && x.done) : tasksRef.current.filter(isDay).filter((x) => x.done).pop();
    if (t) check(t);
  };
  /* Plan tomorrow: the Week ahead tab, Tomorrow first and unfolded. */
  const planTomorrow = () => {
    setTab("week");
    setFold((f) => Object.assign({}, f, { w2: false }));
    setTimeout(() => scrollRef.current && scrollRef.current.scrollTo({ top: 0, behavior: "smooth" }), 60);
  };
  /* Closing the last open part closes the parent. Only on the transition
     (some open -> none open), so reopening a parent with all parts done
     doesn't snap it shut again. */
  const partsOpen = React.useRef(null);
  React.useEffect(() => {
    const prev = partsOpen.current;
    const now = {};
    tasks.forEach((t) => { if (t.TaskPart && t.TaskPart.length) now[t.id] = t.TaskPart.filter((p) => !p.done).length; });
    partsOpen.current = now;
    if (!prev || !window.__app || !window.__app.updateTask) return;
    tasks.forEach((t) => {
      if (!t.done && now[t.id] === 0 && prev[t.id] > 0) {
        closed.current = closed.current.filter((x) => x !== t.id).concat(t.id);
        window.__app.updateTask(t.id, { done: true });
      }
    });
  }, [tasks]);

  /* Test hook: close every task due today at once, no animation. */
  React.useEffect(() => {
    window.__closeDay = () => {
      tasksRef.current.filter(isDay).filter((t) => !t.done).forEach((t) => {
        closed.current = closed.current.concat(t.id);
        onToggle(t.id);
      });
    };
    return () => { delete window.__closeDay; };
  }, [onToggle]);

  /* Next up candidates (07.10.26): the EARLIEST open thing first — overdue
     (oldest day, then hour), then today's by hour, untimed last. Whatever was
     left behind is what comes next, not whatever happens to be after now. */
  const hdMon = (window.NEEDT && window.NEEDT.MONTHS) || ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dayKey = (t) => { const m = String(hdDue(t) || "").trim().split(/\s+/); const mi = hdMon.indexOf(m[1]); const d = parseInt(m[0], 10); return (mi < 0 ? 0 : mi) * 40 + (isNaN(d) ? 0 : d); };
  const atKey = (t) => hdAt(t) == null ? 99 : hdAt(t);
  const lateOpen = late.filter((t) => !t.done && !leaving[t.id]).sort((a, b) => dayKey(a) - dayKey(b) || atKey(a) - atKey(b));
  const open = day.filter((t) => !t.done && !leaving[t.id]);
  const cands = lateOpen.concat(open);
  const fresh = cands.filter((t) => skipped.indexOf(t.id) < 0);
  const nu = (fresh.length ? fresh : cands)[0];
  const nuAfter = nu && !nu.overdue ? open.filter((t) => hdAt(t) != null && hdAt(nu) != null && hdAt(t) > hdAt(nu))[0] : null;
  const skip = () => {
    if (!nu) return;
    setSkipped((s) => fresh.length <= 1 ? [] : s.concat(nu.id));
  };
  /* Move every open overdue task onto today; one Undo puts them all back. */
  const moveToToday = () => {
    const app = window.__app; if (!app || !app.updateTask) return;
    const list = tasksRef.current.filter((t) => t.overdue && !t.done && !t.noSlot);
    if (!list.length) return;
    const before = list.map((t) => [t.id, { overdue: t.overdue, dueDate: t.dueDate, scheduledStart: t.scheduledStart, scheduledEnd: t.scheduledEnd }]);
    list.forEach((t) => app.updateTask(t.id, Object.assign({ overdue: false }, window.NEEDT.moveDay(t, "1 Sep"))));
    window.toast && window.toast(list.length + (list.length === 1 ? " task" : " tasks") + " moved to today", { undo: () => before.forEach(([id, b]) => app.updateTask(id, b)) });
  };
  const startFocus = () => {
    if (!nu) return;
    const f = { intention: nu.title, planned: 25, taskId: nu.id, elapsed: 0 };
    if (window.__app && window.__app.setFocus) window.__app.setFocus(f);
    window.toast && window.toast("Focus started · 25 min on “" + nu.title + "”");
  };

  const streakBase = window.NEEDT && window.NEEDT.streak ? window.NEEDT.streak() : 5;
  const streakN = streakBase + (dayClosed ? 1 : 0);
  const habitsKept = habitList.filter(hdHabitOn).length;
  const row = (t, isLate) => <window.Task key={t.id} layout="row" task={t} late={isLate} phase={leaving[t.id]} back={back[t.id]} onToggle={() => check(t)} onOpen={onOpen} dragProps={dragProps} />;

  /* Week ahead: the next seven days, read from the same tasks, grouped by day. */
  const week = HD_WEEK.map(([d, name, long]) => {
    const list = tasks.filter((t) => !t.overdue && !t.noSlot && dueDay(t) === d).sort((a, b) => atKey(a) - atKey(b));
    return { d, title: name + ", " + d + " Sep", sub: long, list, events: hdEventsOn(d).slice().sort((a, b) => a.at - b.at) };
  });
  const weekOpen = week.reduce((s, w) => s + openN(w.list), 0);
  const cap = hdCapacity();
  const loadDays = week.map((w) => {
    const dow = new Date(2026, 8, w.d).getDay();
    const weekend = dow === 0 || dow === 6;
    const planned = w.list.reduce((s, t) => s + (t.estimatedMinutes || 0), 0) + w.events.reduce((s, e) => s + (e.len || 0), 0);
    return { d: w.d, short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow], planned, cap: weekend && !cap.weekends ? 0 : cap.min };
  });
  const weekTasks = week.reduce((s, w) => s + w.list.length, 0);
  const weekDone = weekTasks - weekOpen;
  const weekPlanned = loadDays.reduce((s, d) => s + d.planned, 0);
  const weekCap = loadDays.reduce((s, d) => s + d.cap, 0);
  const timed = day.filter((t) => hdAt(t) != null);
  const inboxOpen = inbox.filter(shown);

  const tabs = [["day", "Day", left.length], ["week", "Week ahead", weekOpen]];

  return (
    <div className="hd-home hd-screen">
      <header className="hd-head">
        <window.PageAddButton label="New" items={[
          { art: "task", title: "New Task", sub: "Placed into a free hour", kbd: "N", onClick: newTask },
          { art: "event", title: "New Event", sub: "Blocks time on your calendar", onClick: () => window.pageNew("calendar", "event") },
          { art: "doc", title: "New Doc", sub: "A page for anything", onClick: () => window.docs && window.docs.newDoc() }
        ]} />
        <div className="hd-titlebox">
          <h1 className="hd-title-h1">Tuesday, 1 September</h1>
          <span className="hd-meta-line hd-meta-t">Today · week 36</span>
        </div>
        <span className="hd-head-right">
          <span role="tablist" className="wk-tabs hd-tabs">
            {tabs.map(([id, l, n]) => (
              <button key={id} type="button" role="tab" data-hd-tab={id} className={"wk-tab wk-tabbtn" + (tab === id ? " is-on" : "")} onClick={() => setTab(id)} aria-pressed={tab === id} aria-selected={tab === id}>
                {l}{n ? <span className="hd-meta-t hd-num">{n}</span> : null}
              </button>
            ))}
          </span>
          <HdPlanButton primary pro={pro} canPlan={canPlan} onPlan={planDay} />
        </span>
      </header>

      <div ref={scrollRef} className="scroll-inner hd-scroll">
        {dayClosed ? <HdDayClosed count={day.length} mins={day.reduce((s, t) => s + (t.estimatedMinutes || 0), 0)} habits={habitsKept} lateN={lateOpen.length} onPlan={planTomorrow} onUndo={undoLast} /> : null}

        <div className="hd-cards" data-hd-cards="" data-hd-mode={tab}>
          {/* Next up whenever anything is open — a closed day with overdue
              work left still points at the oldest of it. */}
          {nu ? (
            <HdNextUp t={nu} after={nuAfter} moreLate={nu.overdue ? lateOpen.length - 1 : 0} canSkip={cands.length > 1} onOpen={onOpen} onFocus={startFocus} onDone={() => check(nu)} onSkip={skip} />
          ) : (
            <HdCard hue="var(--text-primary)" className="hd-card-next" label="Next up">
              {hdCardLabel("Next up")}
              <div className="hd-next-none">
                <span className="hd-next-none-title">{dayClosed ? "Nothing left today" : "Nothing open"}</span>
                <span className="hd-meta-t">{dayClosed ? "Tomorrow is a tab away — Week ahead." : "Add a task, or let Needt plan the day."}</span>
              </div>
            </HdCard>
          )}
          <div key={tab} className="hd-side nx-swap" data-hd-side={tab}>
            {tab === "week" ? (
              <HdWeekStats tasksN={weekTasks} doneN={weekDone} plannedMin={weekPlanned} capMin={weekCap} overdueN={openN(late)} />
            ) : (
              <>
                <HdProgressCard done={day.length - left.length} total={day.length} mins={mins} closed={dayClosed} empty={day.length === 0} />
                <HdStreakCard n={streakN} />
                <HdHabitsCard />
              </>
            )}
          </div>
        </div>

        <div className="hd-main" data-hd-mode={tab}>
          <div key={tab} className="hd-list nx-swap">
            {tab === "week" ? week.map((w) => {
              const shownList = w.list.filter(shown);
              const doneN = w.list.length - openN(w.list);
              return (
                <HdFold key={w.d} title={w.title} count={openN(w.list)} open={!fold["w" + w.d]} onToggle={flip("w" + w.d)}
                  action={doneN ? <span className="hd-meta-t">{doneN} done</span> : null}>
                  {w.events.map((e) => (
                    <div key={"e" + e.id} className="hd-week-ev">
                      <span className="hd-week-ev-ico"><HdIcon name="calendar" size={13} /></span>
                      <span className="hd-week-ev-title">{e.title}</span>
                      <span className="hd-meta-t hd-num">{hdTime(e.at)} · {hdDur(e.len)}</span>
                    </div>
                  ))}
                  <HdCapped list={shownList} render={(t) => row(t)} />
                  {!shownList.length && !w.events.length ? <span className="hd-week-none">Nothing planned yet.</span> : null}
                </HdFold>
              );
            }) : (
              <>
                {dayEmpty ? <HdEmptyDay onNew={newTask} onPlan={planDay} pro={pro} canPlan={canPlan} /> : null}

                {/* The one soft upsell on Home (Free only, dismissible for good). */}
                {!pro && !dayEmpty && !dayClosed && window.ProUpsell ? (
                  <window.ProUpsell id="home-plan" feature="Plan my day" title="Let Needt plan your day"
                    line={"Tasks without a time go into your free hours. Try Pro free for " + ((window.NEEDT_PRICING && window.NEEDT_PRICING.trialDays) || 14) + " days — no card."}
                    cta="Try Pro free" className="hd-upsell" />
                ) : null}

                {live(late) ? (
                  <HdFold title="Overdue" tone="late" count={openN(late)} open={!fold.late} onToggle={flip("late")}
                    note="These were due before today — move them or let them go."
                    action={<button type="button" className="nx-btn nx-btn-sm nx-btn-secondary hd-move-today" onClick={moveToToday}>Move to today</button>}>
                    <HdCapped list={lateShown} render={(t) => row(t, true)} />
                  </HdFold>
                ) : null}

                {!dayClosed ? parts.map(([p, list]) => (
                  <HdFold key={p} title={p} count={openN(list)} open={!fold[p]} onToggle={flip(p)}
                    action={<span className="hd-meta-t hd-num">{hdDur(list.filter((t) => !t.done).reduce((s, t) => s + (t.estimatedMinutes || 0), 0))}</span>}>
                    <HdCapped list={list} render={(t) => row(t)} />
                  </HdFold>
                )) : null}

                {!dayClosed && !dayEmpty ? (
                  <button type="button" className="hd-add hd-add-row" onClick={newTask}>
                    <span className="hd-add-box" />Add a task
                  </button>
                ) : null}

                {doneToday.length ? (
                  <HdFold title="Done today" count={doneToday.length} open={!fold.done} onToggle={flip("done")}>
                    <HdCapped list={doneToday} render={(t) => row(t, false)} />
                  </HdFold>
                ) : null}

                <p className="hd-notes">
                  Notes for the day…
                </p>
              </>
            )}
          </div>

          <aside className="hd-rail" aria-label={tab === "week" ? "The week at a glance" : "Today at a glance"}>
            {tab === "week" ? <HdWeekLoad days={loadDays} cap={cap} pro={pro} /> : <HdSchedule tasks={timed} onOpen={onOpen} />}
            <HdInboxCard list={inboxOpen.slice(0, 3)} total={openN(inbox)} onCheck={check} onOpen={onOpen} phase={leaving} />
          </aside>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { HomeToday, HdCheck, HdFold, HdCapped });
