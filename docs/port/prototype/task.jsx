/* THE TASK — one component, three layouts (07.10.26).
 *
 * Before this file every screen drew the task itself: HdTask on Home and
 * Tasks, C2Block and C2Row on the Calendar, MbRow and MbNextUp on the phone,
 * a hand-built preview in Mail. Five copies of "what is the time label",
 * "which colour is this project", "is it late" — and they had started to
 * disagree (one rounded 09:15 to 09:30). Now:
 *
 *   taskView(task)  — the one data → view mapping: title, time and duration
 *                     labels, project + hue, overdue, done, parts, source.
 *   <Task layout="row" | "card" | "block" … />
 *     row   — the list row (Home, Tasks, Projects). density: "desk" (default,
 *             quiet right-hand columns), "touch" (phone: 44px check, one meta
 *             line under the title), "agenda" (Calendar › Days), "mini"
 *             (Inbox rail, project cards).
 *     card  — one task on its own surface. density: "desk" (Home Next up,
 *             project-tinted frame), "touch" (phone Next up, project rail),
 *             "preview" (Mail's "Make a task" result). Actions = children.
 *     block — a calendar block: project rail, tint, title, time; the caller
 *             places it (style) and passes the box it got (box) so the text
 *             can follow the <30 min one-line rule and the cascade.
 *
 * Calendar events go through the same block/agenda look (task.event), so a
 * day column is drawn by one thing. Top-level names are prefixed tk/Task —
 * every .jsx shares one global scope. */
const TkNS = window.NeedtDesignSystem_25d3c8;
const { Icon: TkIcon } = TkNS;

const TK_SRC_ICON = { mail: "mail", calendar: "calendar", "import": "download" };
const TK_SRC_NAME = { mail: "Mailbox", calendar: "Calendar", "import": "Import" };
const tkPad = (n) => String(n).padStart(2, "0");
/* "09:00" from a decimal hour, to the minute. */
const tkClock = (h) => { if (h == null) return null; const m = Math.round(h * 60); return tkPad(Math.floor(m / 60) % 24) + ":" + tkPad(m % 60); };
/* "45 min", "1 h 30" — the list's short form; "1 h 30 min" the calendar's. */
const tkDur = (min) => !min ? "" : min < 60 ? min + " min" : Math.floor(min / 60) + " h" + (min % 60 ? " " + (min % 60) : "");
const tkDurLong = (min) => { const h = Math.floor((min || 0) / 60), m = Math.round((min || 0) % 60); return h ? h + " h" + (m ? " " + m + " min" : "") : m + " min"; };

/* The neutral a block wears when it has no project (ColumnsView.jsx
   RB_NEUTRAL, so cvProject and the rows agree). */
const tkNeutral = () => (window.RB_NEUTRAL && window.RB_NEUTRAL.color) || "var(--text-tertiary)";

/* THE MAPPING. Pure: a task (database fields, Data.js) — or a calendar item
   ({ day, at, len, title, project, event }) — in, plain labels out. */
function taskView(t) {
  const N = window.NEEDT;
  if (!t) return null;
  const event = !!t.event;
  /* Calendar items carry their hour and length already; tasks carry stamps. */
  const at = t.scheduledStart ? N.at(t) : (t.at != null ? t.at : null);
  const minutes = t.estimatedMinutes != null ? t.estimatedMinutes : (t.len != null ? t.len : null);
  const len = minutes || 30;
  const pref = t.projectId !== undefined ? t.projectId : (t.project || null);
  const proj = !event && pref ? N.project(pref) : null;
  const parts = t.TaskPart || [];
  const partsDone = parts.filter((p) => p.done).length;
  const due = N.dueLabel(t);
  const src = t.source && t.source.kind ? {
    kind: t.source.kind, id: t.source.id, icon: TK_SRC_ICON[t.source.kind] || "download",
    label: t.source.label || TK_SRC_NAME[t.source.kind] || "",
    title: "From " + (TK_SRC_NAME[t.source.kind] || t.source.kind) + (t.source.label ? " · " + t.source.label : "")
  } : null;
  return {
    id: t.id, title: t.title || "", done: !!t.done, event: event, user: !!t.user,
    at: at, time: tkClock(at), end: at == null ? null : at + len / 60,
    range: at == null ? null : tkClock(at) + "–" + tkClock(at + len / 60),
    minutes: minutes, len: len, dur: tkDur(minutes), durLong: tkDurLong(len),
    due: due, overdue: !!t.overdue, lateTitle: due ? "Overdue — was due " + due : null,
    project: proj ? { id: proj.id, name: proj.name, color: proj.color || null } : null,
    projectName: proj ? proj.name : null,
    /* The project's colour, or null — each layout picks its own neutral. */
    hue: proj ? (proj.color || null) : null,
    where: event ? (t.user ? "Your events" : "Work calendar") : (proj ? proj.name : "Inbox"),
    chip: event ? (t.user ? "Event" : "Calendar") : (proj ? proj.name : "Inbox"),
    parts: parts.length ? { done: partsDone, total: parts.length, open: parts.length - partsDone } : null,
    value: t.value || null, entry: t.entry || null, source: src
  };
}

/* Opening the message a task came from. */
const tkOpenSource = (src) => (e) => {
  e.stopPropagation();
  if (window.__app && window.__app.setScreen) window.__app.setScreen("mail");
  window.dispatchEvent(new CustomEvent("needt-mail", { detail: { id: src.id, act: "open" } }));
};

if (typeof document !== "undefined" && !document.getElementById("tk-css")) {
  const s = document.createElement("style");
  s.id = "tk-css";
  s.textContent =
    ".hd-meta{color:var(--text-tertiary);transition:color var(--transition-hover)}" +
    ".hd-meta.is-hot{color:var(--text-secondary)}" +
    ".hd-meta .hd-late{color:var(--destructive)}" +
    ".hd-srci{display:grid;place-items:center;width:16px;height:16px;padding:0;border:0;border-radius:4px;background:transparent;color:inherit;cursor:default}" +
    "button.hd-srci:hover{background:var(--fill-4);color:var(--text-primary)}";
  document.head.appendChild(s);
}

/* The tick reward plays on a real toggle only, never on mount: true for the
   render after `on` flips (a new `key` — another task, a closed card — just
   re-syncs). The animation itself is .is-ticking in styles/tasks.css. */
function useCheckTick(on, key) {
  const prev = React.useRef({ on: !!on, key: key });
  const [tick, setTick] = React.useState(false);
  React.useLayoutEffect(() => {
    const p = prev.current;
    prev.current = { on: !!on, key: key };
    if (p.key !== key) { setTick(false); return; }
    if (p.on !== !!on) setTick(!!on);
  }, [on, key]);
  return tick;
}
if (typeof window !== "undefined") window.useCheckTick = useCheckTick;

/* THE CHECKBOX. Craft's, measured 06.10.26: 16px, 5.7 radius, 1.5px ring at
   22%. `touch` wraps it in a 44px target at 20px (the phone's). Static look
   in styles/tasks.css (.tk-check…); only the state-driven fill stays inline. */
function TaskCheck({ on, onClick, hue, touch, size }) {
  const stop = (e) => { e.stopPropagation(); onClick && onClick(); };
  const tick = useCheckTick(!!on);
  if (touch) {
    const z = size || 20;
    return (
      <button type="button" className="mb-press tk-check-touch" aria-pressed={!!on} aria-label={on ? "Mark not done" : "Mark done"} onClick={stop}>
        <span aria-hidden="true" className={"tk-check-touch-box" + (on ? " is-on" : "") + (tick ? " is-ticking" : "")} style={{ width: z, height: z, borderRadius: z * 0.32, background: on ? (hue || "var(--text-primary)") : undefined }}>
          {on ? <TkIcon name="check" size={Math.round(z * 0.62)} /> : null}
        </span>
      </button>
    );
  }
  return (
    <button type="button" className={"nx-check tk-check" + (on ? " is-on" : "") + (tick ? " is-ticking" : "")} aria-pressed={on} aria-label={on ? "Mark not done" : "Mark done"} onClick={stop}
      style={on ? { background: hue || "var(--text-primary)" } : undefined}>
      {on ? <TkIcon name="check" size={11} /> : null}
    </button>
  );
}

/* The source mark: an icon (a Mail one opens the message). */
function tkSourceIcon(v, desk) {
  const src = v.source;
  if (!src) return null;
  const icon = <TkIcon name={src.icon} size={12} />;
  if (!desk) return <span key="s" title={src.title} aria-label={src.title} className="tk-src">{icon}</span>;
  if (src.kind === "mail" && src.id != null) return <button type="button" className="hd-srci" title={src.title} aria-label={src.title + " — open in Mailbox"} onClick={tkOpenSource(src)}>{icon}</button>;
  return <span className="hd-srci" title={src.title} aria-label={src.title}>{icon}</span>;
}

/* Desk meta (07.10.26): one line of plain text in fixed columns — time 44 ·
   duration 52 · source icon 16 · project 120 — tertiary, secondary on hover.
   The column widths live in tasks.css (.tk-cell-*). */
function tkDeskMeta(v, late, hot, hideProject) {
  return (
    <span className={"hd-meta tk-dmeta" + (hot ? " is-hot" : "")}>
      <span className="tk-cell tk-cell-time">
        {late && v.due ? <span className="hd-late" title={v.lateTitle}>{v.due}</span> : v.time}
      </span>
      <span className="tk-cell tk-cell-dur">{v.minutes ? v.dur : null}</span>
      <span className="tk-cell tk-cell-src">{tkSourceIcon(v, true)}</span>
      {hideProject ? null : (
        <span className="tk-cell tk-cell-proj" title={v.projectName || undefined}>
          {v.projectName ? [
            <span key="d" aria-hidden="true" className="tk-dot" style={{ background: v.hue || "var(--text-muted)" }} />,
            <span key="n" className="tk-ellip">{v.projectName}</span>
          ] : null}
        </span>
      )}
    </span>
  );
}
/* Inline meta: time · duration · source · project, one quiet line (phone,
   and the label row of a card). */
function tkLineMeta(v, late, hideProject, gap) {
  const bits = [];
  if (late && v.due) bits.push(<span key="d" title={v.lateTitle} className="tk-late">{v.due}</span>);
  else if (v.time) bits.push(<span key="t">{v.time}</span>);
  if (v.minutes) bits.push(<span key="e">{v.dur}</span>);
  if (v.source) bits.push(tkSourceIcon(v, false));
  if (v.projectName && !hideProject) bits.push(
    <span key="p" className="tk-lm-proj">
      <span aria-hidden="true" className="tk-dot" style={{ background: v.hue || "var(--text-muted)" }} />
      <span className="tk-lm-name">{v.projectName}</span>
    </span>);
  if (!bits.length) return null;
  return <span className="tk-lmeta" style={gap ? { gap: gap } : undefined}>{bits}</span>;
}
/* Parts: a small progress ring and "1/2" in readable grey (tertiary, ≥ 4.5:1
   on both grounds) — the old counter sat at --text-muted and was missed. */
function TkPartRing({ done, total }) {
  const z = 12, r = 4.5, c = 2 * Math.PI * r, pct = total ? done / total : 0;
  return (
    <svg width={z} height={z} viewBox="0 0 12 12" className="tk-ring" aria-hidden="true">
      <circle cx="6" cy="6" r={r} className="tk-ring-track" />
      <circle cx="6" cy="6" r={r} className="tk-ring-fill" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
    </svg>
  );
}
const tkCount = (v) => v.parts ? (
  <span className="tk-count" title={v.parts.done + " of " + v.parts.total + " parts done"}>
    <TkPartRing done={v.parts.done} total={v.parts.total} />{v.parts.done}/{v.parts.total}
  </span>
) : null;
const tkValue = (v) => v.value ? <span className="tk-value">CHF {v.value.toLocaleString("de-CH")}</span> : null;

/* ROW ─────────────────────────────────────────────────────────────────── */
function TkRow({ task, v, onToggle, onOpen, dragProps, late, phase, back, hideProject, density, compact, stacked, style, className }) {
  const [hot, setHot] = React.useState(false);
  const open = () => onOpen && onOpen(task.id, task);
  if (density === "touch") {
    /* `phase`: "strike" → the box fills and the title strikes; "out" fades. */
    const struck = !!phase;
    return (
      <div role="button" tabIndex={0} className={"mb-row tk-touch" + (className ? " " + className : "")} data-mb-task={v.id} data-task={v.id} onClick={open}
        style={Object.assign({ opacity: phase === "out" ? 0 : 1 }, style)}>
        <span className="tk-touch-check"><TaskCheck touch on={v.done || struck} onClick={onToggle} /></span>
        <span className="tk-touch-body">
          <span className="tk-touch-line">
            <span className={"tk-touch-title" + (v.done || struck ? " is-done" : "")}>{v.title}</span>
            {tkCount(v)}
            {tkValue(v)}
          </span>
          {tkLineMeta(v, late, hideProject)}
        </span>
      </div>
    );
  }
  if (density === "mini") {
    /* A small row: check, title, and (unless compact) the duration. */
    return (
      <div className={"tk-mini" + (className ? " " + className : "")} data-ctx="task" data-ctx-id={v.id} data-task={v.id} onClick={open} style={style}>
        <TaskCheck on={v.done} onClick={onToggle} />
        <span title={v.title} className={"tk-mini-title" + (v.done ? " is-done" : "")}>{v.title}</span>
        {!compact && v.minutes ? <span className="tk-mini-dur">{v.dur}</span> : null}
      </div>
    );
  }
  if (density === "agenda") {
    /* Calendar › Days: time, rail, title, then duration + where. `compact`
       (seven columns) folds time into the title column; `stacked` puts the
       meta under the title. Events wear grey and open nothing. */
    const hue = v.event ? "var(--text-tertiary)" : (v.hue || tkNeutral());
    const canOpen = !v.event && !!onOpen;
    const meta = (
      <span className="tk-ag-meta">
        {v.minutes ? v.durLong : null}
        <span className="tk-ag-chip" style={{ background: "color-mix(in oklch, " + hue + " 12%, var(--fill-2))" }}>
          <span aria-hidden="true" className="tk-dot" style={{ background: hue }} />
          <span className="tk-clip">{v.chip}</span>
        </span>
      </span>
    );
    return (
      <div data-c2-row={v.id} data-task={v.event ? undefined : v.id} data-ctx={v.event ? undefined : "task"} data-ctx-id={v.event ? undefined : v.id} role={canOpen ? "button" : undefined} tabIndex={canOpen ? 0 : undefined}
        onClick={canOpen ? open : undefined} onKeyDown={canOpen ? (e) => { if (e.key === "Enter") open(); } : undefined} onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
        className={"tk-agenda" + (hot ? " is-hot" : "") + (v.done ? " is-done" : "")} style={style}>
        {compact ? null : <span className={"tk-ag-time" + (v.at == null ? " is-allday" : "")}>{v.at == null ? "All day" : v.time}</span>}
        <span aria-hidden="true" className="tk-rail" style={{ background: hue }} />
        <div className={"tk-ag-body" + (stacked ? " is-stacked" : "")}>
          {compact ? <span className="tk-ag-ctime">{v.at == null ? "All day" : v.time}{v.minutes ? <span className="tk-ag-cdur"> · {v.durLong}</span> : null}</span> : null}
          <span className={"tk-ag-title" + (v.done ? " is-done" : "")}>{v.title}</span>
          {compact ? null : meta}
        </div>
      </div>
    );
  }
  /* desk (default). `phase` drives the reward on check: "strike" (the box
     springs, a line draws through the title), then "collapse" (the row folds
     shut). `back` marks a row that just returned from Done, so it swaps in. */
  const struck = !!phase;
  return (
    <div className={"hd-row" + (phase === "collapse" ? " is-collapsing" : "") + (struck ? " is-striking" : "") + (back ? " nx-swap" : "") + (className ? " " + className : "")} style={style}><div>
    <div {...(dragProps ? dragProps(task, "place") : {})}>
      <div onClick={open} data-ctx="task" data-ctx-id={v.id} data-task={v.id} onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
        className={"tk-desk" + (hot ? " is-hot" : "")}>
        <TaskCheck on={v.done} onClick={onToggle} />
        <span className="tk-desk-body">
          <span className={"hd-title tk-desk-title" + (struck ? " is-struck" : "") + (v.done ? " is-done" : "") + (v.done && !struck ? " is-crossed" : "")} title={v.title}>{v.title}</span>
          {tkCount(v)}
          {tkValue(v)}
        </span>
        {tkDeskMeta(v, late, hot, hideProject)}
      </div>
      {v.entry && (!v.done || struck) ? (
        <div className="tk-entry">
          <TkIcon name="arrow-right" size={12} />{v.entry}
        </div>
      ) : null}
    </div>
    </div></div>
  );
}

/* CARD ────────────────────────────────────────────────────────────────── */
function TkCard({ task, v, onToggle, onOpen, late, density, label, note, children, className, style }) {
  const open = () => onOpen && onOpen(task.id, task);
  if (density === "preview") {
    /* What a mail became: the check, the title, where it landed. */
    const today = window.NEEDT && task.dueDate === window.NEEDT.iso(window.NEEDT.today);
    const where = (v.projectName || "Inbox") + " · " + (today ? "today" : v.due || "later");
    return (
      <div className={"tk-prev" + (className ? " " + className : "")} data-task={v.id} onClick={onOpen ? open : undefined} style={style}>
        <TaskCheck on={v.done} onClick={onToggle} />
        <span className={"tk-prev-title" + (v.done ? " is-done" : "")}>{v.title}</span>
        <span className="tk-prev-where">{where}</span>
      </div>
    );
  }
  if (density === "touch") {
    return (
      <div data-mb="next" data-task={v.id} className={"tk-tcard" + (className ? " " + className : "")} style={style}>
        <span aria-hidden="true" className="tk-tcard-rail" style={{ background: v.projectName ? (v.hue || "var(--text-muted)") : "var(--text-muted)" }} />
        <span className="tk-tcard-head">
          {label ? <span className="tk-label">{label}</span> : null}
          <span className="tk-tcard-meta">{tkLineMeta(v, late)}</span>
        </span>
        <span onClick={open} className="tk-tcard-title">{v.title}</span>
        {note ? <span className="tk-tcard-note">{note}</span> : null}
        {children ? <span className="tk-tcard-acts">{children}</span> : null}
      </div>
    );
  }
  /* desk: the summary-card frame (a hue-tinted 5px frame around a raised
     plate) in the project's colour; label row with the meta on the right,
     the title, a why-line, actions along the bottom. */
  const hue = v.hue || "var(--text-muted)";
  return (
    <div className={"hd-card nx-swap tk-card" + (className ? " " + className : "")} data-task={v.id}
      style={Object.assign({ background: "color-mix(in oklab, " + hue + " 22%, var(--background))" }, style)}>
      <div aria-label={label} className="tk-card-plate">
        <div className="tk-card-label">
          <span>{label}</span>
          <span className="tk-card-right">
            {late && v.due ? <span key="d" className="tk-late" title={v.lateTitle}>{v.due}</span> : v.time ? <span key="a">{v.time}</span> : null}
            {v.minutes ? <span key="e">{v.dur}</span> : null}
            {v.projectName ? <span key="p" className="tk-card-proj">
              <span aria-hidden="true" className="tk-dot" style={{ background: hue }} /><span className="tk-clip">{v.projectName}</span></span> : null}
          </span>
        </div>
        <div key={v.id} className="nx-swap tk-card-text">
          <div onClick={open} data-ctx="task" data-ctx-id={v.id} title={v.title} className="tk-card-title">{v.title}</div>
          {note ? <div title={note} className="tk-card-note">{note}</div> : null}
        </div>
        {children ? <div className="tk-card-acts">{children}</div> : null}
      </div>
    </div>
  );
}

/* BLOCK ───────────────────────────────────────────────────────────────── */
/* The caller owns placement: `style` carries position/top/left/width/height/
   zIndex, `box` what the text needs to know about it — { h, w, padTop, tight,
   cascade } — and `lit` / `selected` (hover, open peek). Under 30 minutes, or
   too little height left, a block is one line: time (if it fits) + title. */
function TkBlock({ task, v, box, lit, selected, style, events, className }) {
  const x = box || {};
  const h = x.h || Math.max((v.len / 60) * 52 - 3, 20);
  const hue = v.event ? "var(--text-tertiary)" : (v.hue || tkNeutral());
  const pt = x.padTop || 0, short = v.len < 30 || h - pt < 34, w = x.w || 999, tight = x.tight, lines = Math.max(1, Math.floor((h - pt - (tight ? 5 : 23)) / 15));
  /* time prefix only when "09:00 " plus at least ~6 characters of title fit */
  const fitTime = w - 15 >= 38 + Math.min(v.title.length, 6) * 6.4;
  const ring = x.cascade ? "var(--surface-raised) 0 0 0 1px" : null;
  const shadow = [lit ? "var(--shadow-raised)" : null, ring, selected ? "var(--accent) 0 0 0 1.5px inset" : null].filter(Boolean).join(", ") || "none";
  return (
    <div className={"tk-block" + (className ? " " + className : "")} data-task={v.event ? undefined : v.id} data-ctx={v.event ? undefined : "task"} data-ctx-id={v.event ? undefined : v.id} {...(events || {})}
      style={Object.assign({ padding: (short ? 2 : 5) + pt + "px 6px 2px 9px",
        background: v.event ? (lit ? "var(--fill-5)" : "var(--fill-4)") : "color-mix(in oklch, " + hue + " " + (lit ? 22 : 14) + "%, var(--surface-raised))",
        boxShadow: shadow, opacity: v.done ? 0.5 : 1, transform: lit ? "translateY(-1px)" : "none" }, style)}>
      <span aria-hidden="true" className="tk-block-rail" style={{ background: hue }} />
      {short ? (
        <div className="tk-block-line">
          {fitTime ? <span className="tk-block-time">{v.time}</span> : null}
          <span className={"tk-block-ltitle" + (v.done ? " is-done" : "")}>{v.title}</span>
        </div>
      ) : (
        <React.Fragment>
          <div className={"tk-block-title" + (v.done ? " is-done" : "")} style={{ WebkitLineClamp: lines }}>{v.title}</div>
          {!tight ? <div className="tk-block-range">{v.range}</div> : null}
        </React.Fragment>
      )}
    </div>
  );
}

/* CLOSING (07.10.26). One way to tick a task from any screen: the app's
   toggle runs first (its own side effects: offline queue, notes), then, when
   the task closed, every still-open TaskPart closes with it through the same
   update path — NEEDT.completeTask is the rule. Reopening reopens the task
   only. Returns nothing; safe without an app (the phone passes its own). */
function taskToggle(onToggle, t, update) {
  if (!t) return;
  const closing = !t.done;
  if (onToggle) onToggle(t.id);
  const upd = update || (window.__app && window.__app.updateTask);
  if (closing && upd && window.NEEDT && window.NEEDT.completeTask) {
    const p = window.NEEDT.completeTask(t, true);
    if (p.TaskPart) upd(t.id, { TaskPart: p.TaskPart });
  }
}

/* THE COMPONENT. Common props: task, layout, onToggle, onOpen(id, task),
   style, className, density. Row: dragProps, late, phase, back, hideProject,
   compact, stacked. Card: label, note, children (actions), late. Block: box,
   lit, selected, events (handlers/aria for the root). */
function Task(props) {
  const task = props.task || props.t;
  if (!task) return null;
  const v = taskView(task);
  const p = Object.assign({}, props, { task: task, v: v, late: props.late != null ? props.late : (props.layout === "card" ? v.overdue : false) });
  if (props.layout === "card") return <TkCard {...p} />;
  if (props.layout === "block") return <TkBlock {...p} />;
  return <TkRow {...p} />;
}

Object.assign(window, { Task, taskView, TaskCheck, taskToggle, tkDur, tkDurLong, tkClock });
