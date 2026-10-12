const { Card, CalendarStrip, CalendarDay, CalendarBlock, FreeTime } = window.NeedtDesignSystem_25d3c8;

const WEEK = [
  { weekday: "MON", date: 31, blocks: [{ title: "Standup", time: "10:30" }] },
  { weekday: "TUE", date: 1, today: true, blocks: [{ title: "Draft the launch brief", time: "09:00–10:30", movable: true, color: "var(--info)", priority: "high" }, { title: "Invoices", time: "yesterday", overdue: true }] },
  { weekday: "WED", date: 2, blocks: [{ title: "Deep work", time: "09:00–11:00", movable: true, color: "var(--accent)" }, { title: "Review", time: "15:00", done: true }] },
  { weekday: "THU", date: 3, blocks: [{ title: "1:1 Anna", time: "11:00" }] },
  { weekday: "FRI", date: 4, blocks: [{ title: "German", time: "18:00", movable: true, color: "var(--success)" }] },
  { weekday: "SAT", date: 5, blocks: [] },
  { weekday: "SUN", date: 6, blocks: [] }
];

/* The day. Decimal hours; the timeline derives every position from them.
   `movable` colours the rail — the scheduler placed it and can move it again. */
const DAY = { start: 8, end: 19, now: 14.33, nowLabel: "14:20" };
const PLACED = [
  { title: "Draft the launch brief", time: "09:00–10:30", start: 9, end: 10.5, movable: true, color: "var(--info)", priority: "high", parts: { closed: 1, total: 3 }, entry: "Pull last month's numbers", heat: 0.7 },
  { title: "Standup", time: "10:30–10:45", start: 10.5, end: 10.75 },
  { title: "Deep work — design system", time: "11:00–13:00", start: 11, end: 13, movable: true, color: "var(--accent)" },
  { title: "Lunch", time: "13:00–13:45", start: 13, end: 13.75 },
  { title: "Send invoices for August", time: "14:00–14:30 · overdue", start: 14, end: 14.5, movable: true, overdue: true },
  { title: "1:1 Anna", time: "16:00–16:30", start: 16, end: 16.5 },
  { title: "German — B2 unit 4", time: "18:00–19:00", start: 18, end: 19, movable: true, color: "var(--success)" }
];

function WeekStrip({ selected, onSelect }) {
  return (
    <CalendarStrip>
      {WEEK.map((d) => (
        <CalendarDay key={d.date} weekday={d.weekday} date={d.date} today={d.today} selected={selected === d.date} onClick={() => onSelect && onSelect(d.date)} style={{ flex: "1 1 0", minWidth: 96 }}>
          {d.blocks.map((b) => <CalendarBlock key={b.title} {...b} />)}
        </CalendarDay>
      ))}
    </CalendarStrip>
  );
}

function TodayScreen({ tasks, onOpen, onToggle, form, onForm, brief, dragProps, drag }) {
  const [selected, setSelected] = React.useState(1);
  const placed = PLACED;
  /* Unplaced = not done, no time, and not already on the day. Derived rather
     than held, so a task captured in the sidebar or dropped on a date appears
     and disappears here without a second source of truth. */
  const onDay = placed.map((b) => b.title);
  const queue = window.NEEDT.liveTasks(tasks).filter((t) => !t.done && !t.isFixed && !t.noSlot && onDay.indexOf(t.title) === -1).map((t) => t.title);

  const free = FreeTime(placed, DAY.start, DAY.end, DAY.now);

  return (
    <>
      <div className={"home-top" + (form === "prose" || form === "today" ? " is-hidden" : "")}>
        {/* One object, not two: the date at display size with its weekday
            under it. The tab bar already says which screen this is, so the
            word "Today" is not repeated here — the number is the heading. */}
        {/* The day number is the heading, and it stands alone: a dotted
            numeric date reads as data, while the number with the month set
            beside it reads as a page in a diary. Weekday and week sit under
            the month, so nothing is said twice. */}
        <div className="home-date">
          <span className="display home-date-n">
            1
          </span>
          <span className="home-date-col">
            <span className="display home-date-month">
              September
            </span>
            <span className="home-date-row">
              <span className="display home-date-wd">
                Tuesday
              </span>
              <span className="home-date-week">
                week 36
              </span>
            </span>
          </span>
        </div>
        <div className="home-strip">
          <WeekStrip selected={selected} onSelect={setSelected} />
        </div>
      </div>

      {/* The week's brief: what the week is about, written by whoever is
          working on it. It grows downward and the page scrolls with it. */}
      {/* Home owns its own header and scroll (Tasks layout, 07.10.26). */}
      {form === "today" && window.HomeToday
        ? <window.HomeToday tasks={tasks} onOpen={onOpen} onToggle={onToggle || (() => {})} dragProps={dragProps} drag={drag} />
        : <div className="scroll-inner home-brief">
            <Brief onOpenTask={onOpen} form={form} onForm={onForm} marks={brief.marks} timeline={brief.timeline} />
          </div>}

    </>
  );
}

Object.assign(window, { TodayScreen, WeekStrip, WEEK, DAY, PLACED });
