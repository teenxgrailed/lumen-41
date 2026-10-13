/* FOCUS — the session window (08.10.26).
   The sidebar foot's Focus pill used to open a small popover; a session is
   bigger than a popover, so it is now a window over the app, in the
   Connections world: painted sky (PxSky), glass cards (GlassCard), the title
   in Exposure. Three views in one window, crossfading:
     setup — purpose, length (25 / 50 / 90 / custom), the task, ambient sound
             and "Hide other tasks", Start;
     run   — the clock, huge, on the sky; the task's subtasks (tick) and its
             notes (task.notes, plain text, written through App's updateTask →
             NEEDT.applyTaskPatch); Pause / +5 min / Stop; ambient chip;
             Minimise folds the window into the sidebar pill (the running
             clock) and the pill opens it again;
     end   — "50 min on Draft the launch brief", sessions today and the
             series, and what next: Next task · Take a 5-min break · Done.
   The session itself is still App's `focus` state ({intention, planned,
   elapsed, taskId}; App ticks it). Pause is written into that same object:
   planned is parked at the elapsed time (App's ticker stops there) and the
   real length kept in plannedFull until Resume.
   Keys: Esc closes setup / end; while a session runs Esc minimises.
   Mounted once by the Sidebar (window.FocusWindow); window.focusUi opens it.
   Mock: ambient sound plays nothing, "Hide other tasks" is stored only. */
const FcNS = window.NeedtDesignSystem_25d3c8;
const { Icon: FcIcon } = FcNS;

/* ---------- window state: open / view, shared by the pill and the window ---------- */
const fcUi = (function () {
  let st = { open: false, view: "setup", preset: null, summary: null, note: null };
  const subs = new Set();
  return {
    get: () => st,
    set: (p) => { st = Object.assign({}, st, typeof p === "function" ? p(st) : p); subs.forEach((f) => f(st)); },
    sub: (f) => { subs.add(f); return () => subs.delete(f); }
  };
})();
function fcUseUi() {
  const [s, setS] = React.useState(fcUi.get());
  React.useEffect(() => fcUi.sub(setS), []);
  return s;
}
/* Has the window seen the current session start? Module-level, so a sidebar
   that remounts (doc rail ↔ places) does not reopen a running session. */
let fcWasRunning = false;

/* ---------- small helpers ---------- */
const FC_LENGTHS = [["25", "25"], ["50", "50"], ["90", "90"], ["custom", "Custom"]];
const FC_SOUNDS = [["off", "Off"], ["rain", "Rain"], ["cafe", "Café"], ["noise", "White noise"]];
const FC_RULE = "The scheduler will not place anything inside the session, and the mark up there stops breathing until it ends.";
const fcSet = (k, v) => { if (window.needtSettings) window.needtSettings.set(k, v); };
const fcGet = (k, d) => { const S = window.needtSettings; return S && S.has && S.has(k) ? S.get(k) : d; };
function fcPlanned(f) { return f ? (f.paused ? f.plannedFull : f.planned) : 0; }
function fcClock(sec) {
  sec = Math.max(0, Math.round(sec));
  return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
}
function fcDur(min) { return window.cvDur ? window.cvDur(min) : min + " min"; }
function fcHue(t) {
  const p = t && window.cvProject ? window.cvProject(t.projectId) : null;
  return (p && p.color) || "var(--text-tertiary)";
}
function fcOpenTasks(tasks) { return (tasks || []).filter((t) => t && !t.done && !t.noSlot && !t.trashedAt); }
function fcTaskOf(tasks, f) {
  if (!f) return null;
  const list = tasks || [];
  return list.find((t) => f.taskId != null && f.taskId !== "" && String(t.id) === String(f.taskId))
    || list.find((t) => t.title === f.intention) || null;
}

/* Sessions log (needtSync needt.focus.log, one row per session
   of a minute or more) → "Session 3 today", minutes today, the series (days
   in a row with at least one session, ending today). */
const FC_LOG = "needt.focus.log";
function fcDay(d) { const x = d || new Date(); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); }
function fcLogRead() { const v = window.needtSync ? window.needtSync.get(FC_LOG) : null; return Array.isArray(v) ? v : []; }
function fcLogAdd(row) { const l = fcLogRead().concat([row]).slice(-400); if (window.needtSync) window.needtSync.set(FC_LOG, l); }
function fcStats() {
  const log = fcLogRead(), today = fcDay();
  const mine = log.filter((r) => r.d === today);
  const days = {};
  log.forEach((r) => { days[r.d] = true; });
  let series = 0;
  const d = new Date();
  while (days[fcDay(d)]) { series++; d.setDate(d.getDate() - 1); }
  return { count: mine.length, minutes: mine.reduce((n, r) => n + (r.m || 0), 0), series: series };
}

/* End a session: the summary first (so the window knows what it is
   showing), then App's stop. A break ends back in setup. */
function fcFinish(f, how, tasks, onStop) {
  const minutes = Math.round((f.elapsed || 0) / 60);
  const task = fcTaskOf(tasks, f);
  const title = (task && task.title) || f.intention || "Focus";
  if (f.isBreak) {
    fcUi.set({ open: true, view: "setup", summary: null, note: how === "complete" ? "Break’s over — pick up where you left off." : null, preset: f.after || null });
  } else {
    if (minutes >= 1) fcLogAdd({ d: fcDay(), m: minutes, t: title });
    fcUi.set({ open: true, view: "end", summary: { minutes: minutes, title: title, taskId: task ? task.id : f.taskId, how: how } });
  }
  onStop && onStop();
}

/* Lucide glyphs the icon registry does not carry (pause, play, stop, the
   ambient sounds, minimise) — drawn here at the registry's 24 grid. */
const FC_GLYPHS = {
  pause: [["rect", { x: 6, y: 4, width: 4, height: 16, rx: 1 }], ["rect", { x: 14, y: 4, width: 4, height: 16, rx: 1 }]],
  play: [["path", { d: "M6 3.8v16.4a.8.8 0 0 0 1.2.7l13-8.2a.8.8 0 0 0 0-1.4l-13-8.2A.8.8 0 0 0 6 3.8z" }]],
  stop: [["rect", { x: 5, y: 5, width: 14, height: 14, rx: 2.5 }]],
  off: [["path", { d: "M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z" }], ["path", { d: "M22 9l-6 6" }], ["path", { d: "M16 9l6 6" }]],
  rain: [["path", { d: "M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2" }], ["path", { d: "M16 14v6" }], ["path", { d: "M8 14v6" }], ["path", { d: "M12 16v6" }]],
  cafe: [["path", { d: "M10 2v2" }], ["path", { d: "M14 2v2" }], ["path", { d: "M6 2v2" }], ["path", { d: "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" }]],
  noise: [["path", { d: "M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" }], ["path", { d: "M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" }], ["path", { d: "M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" }]],
  minimise: [["path", { d: "M4 14h6v6" }], ["path", { d: "M20 10h-6V4" }], ["path", { d: "M14 10l7-7" }], ["path", { d: "M3 21l7-7" }]],
  coffee: [["path", { d: "M10 2v2" }], ["path", { d: "M14 2v2" }], ["path", { d: "M6 2v2" }], ["path", { d: "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" }]]
};
function FcGlyph({ name, size }) {
  const s = size || 16, parts = FC_GLYPHS[name] || [];
  return (
    <svg className={"fc-glyph" + (name === "play" || name === "pause" || name === "stop" ? " is-solid" : "")} width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      {parts.map(([tag, at], i) => React.createElement(tag, Object.assign({ key: i }, at)))}
    </svg>
  );
}

/* GlassCard sets its padding inline (pad), so card padding is passed here,
   not in focus.css. */
/* ---------- the window ---------- */
function FocusWindow({ tasks, focus, onStart, onStop }) {
  const ui = fcUseUi();
  const [shown, leaving] = window.useExit ? window.useExit(ui.open, 180) : [ui.open, false];
  const running = !!focus;
  const live = React.useRef({ tasks: tasks, focus: focus, onStop: onStop });
  live.current = { tasks: tasks, focus: focus, onStop: onStop };

  /* A session that starts anywhere (this window, a drag onto the pill,
     Home's Start focus, ⌘⇧F) opens the window on its clock; one that stops
     elsewhere puts the window away. */
  React.useEffect(() => {
    if (running && !fcWasRunning) fcUi.set({ open: true, view: "run", note: null, summary: null });
    if (!running && fcWasRunning && fcUi.get().view === "run") fcUi.set({ open: false, view: "setup" });
    fcWasRunning = running;
  }, [running]);

  /* The clock ran out (not paused): the session is done. */
  const due = running && !focus.paused && focus.planned > 0 && focus.elapsed >= focus.planned * 60;
  React.useEffect(() => { if (due) fcFinish(live.current.focus, "complete", live.current.tasks, live.current.onStop); }, [due]);

  /* Esc: setup / end close, a running session minimises. */
  React.useEffect(() => {
    if (!ui.open) return undefined;
    const key = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".nt-menu, .sb-acct, .nx-up")) return;
      e.preventDefault(); e.stopPropagation();
      fcUi.set(fcUi.get().view === "end" ? { open: false, view: "setup", summary: null } : { open: false });
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [ui.open]);

  /* Focus moves into the window when it opens and back to the pill when it
     goes away. */
  const box = React.useRef(null);
  React.useEffect(() => {
    if (!ui.open) {
      const pill = document.querySelector("[data-sb-focus]");
      if (pill && box.current && box.current.contains(document.activeElement)) pill.focus({ preventScroll: true });
      return undefined;
    }
    const t = window.setTimeout(() => {
      const el = box.current && (box.current.querySelector("[data-fc-autofocus]") || box.current.querySelector("button"));
      if (el) el.focus({ preventScroll: true });
    }, 30);
    return () => window.clearTimeout(t);
  }, [ui.open, ui.view]);

  if (!shown) return null;
  const Sky = window.PxSky;
  const view = ui.view === "run" && !running ? "setup" : ui.view;
  const minimise = () => fcUi.set({ open: false });
  const onBackdrop = (e) => { if (e.target === e.currentTarget) minimise(); };
  /* Tab stays inside the window. */
  const trap = (e) => {
    if (e.key !== "Tab" || !box.current) return;
    const list = Array.prototype.slice.call(box.current.querySelectorAll("button:not([disabled]), input, textarea, [tabindex='0']"));
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const inner = (
    <div className="fc-scroll scroll-inner nx-scroll">
      <div key={view} className={"fc-view fc-view-" + view} data-fc-view={view}>
        {view === "run" ? <FcRun tasks={tasks} focus={focus} onStop={onStop} onMinimise={minimise} />
          : view === "end" && ui.summary ? <FcEnd tasks={tasks} summary={ui.summary} onStart={onStart} />
          : <FcSetup tasks={tasks} preset={ui.preset} note={ui.note} onStart={onStart} onClose={minimise} />}
      </div>
    </div>
  );
  return ReactDOM.createPortal(
    <div className={"fc-scrim" + (leaving ? " is-leaving" : "")} onMouseDown={onBackdrop} data-fc-scrim="">
      <div ref={box} role="dialog" aria-modal="true" aria-label={view === "run" ? "Focus session" : "Focus"} onKeyDown={trap}
        className={"fc-window" + (leaving ? " is-leaving" : "")} data-fc-window={view}>
        {Sky ? <Sky variant="a" radius={22}>{inner}</Sky> : <div className="fc-plain">{inner}</div>}
      </div>
    </div>, document.body);
}

/* Header shared by the three views: kicker + Exposure title on the sky, one
   round glass button on the right (close or minimise). */
function FcHead({ kicker, title, sub, action, actionLabel, actionGlyph, onAction }) {
  return (
    <header className="fc-head" data-px-calm="">
      <div className="fc-head-text">
        <span className="px-kicker">{kicker}</span>
        <h2 className="px-display px-on-sky fc-title">{title}</h2>
        {sub ? <span className="px-on-sky fc-sub">{sub}</span> : null}
      </div>
      {onAction ? (
        <button type="button" className="px-chip-btn fc-round" aria-label={actionLabel} title={actionLabel} onClick={onAction} data-fc-action={action}>
          {actionGlyph ? <FcGlyph name={actionGlyph} size={15} /> : <FcIcon name="x" size={15} />}
        </button>
      ) : null}
    </header>
  );
}

function FcSeg({ items, value, onChange, label, icons }) {
  return (
    <div className="fc-seg px-track" role="radiogroup" aria-label={label}>
      {items.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={"fc-seg-btn" + (value === v ? " is-on" : "")}
          onClick={() => onChange(v)} data-fc-seg={v}>
          {icons ? <FcGlyph name={v} size={14} /> : null}{l}
        </button>
      ))}
    </div>
  );
}

/* ---------- setup ---------- */
function FcSetup({ tasks, preset, note, onStart, onClose }) {
  const Glass = window.GlassCard;
  const open = fcOpenTasks(tasks);
  const first = preset && open.some((t) => String(t.id) === String(preset)) ? String(preset) : String((open[0] || {}).id || "");
  const deflen = String(fcGet("len", "50"));
  const [purpose, setPurpose] = React.useState("");
  const [len, setLen] = React.useState(["25", "50", "90"].indexOf(deflen) >= 0 ? deflen : "custom");
  const [custom, setCustom] = React.useState(["25", "50", "90"].indexOf(deflen) >= 0 ? "40" : deflen);
  const [taskId, setTaskId] = React.useState(first);
  const [sound, setSoundRaw] = React.useState(fcGet("focusAmbient", "off"));
  const [hide, setHideRaw] = React.useState(!!fcGet("focusHideOthers", false));
  const setSound = (v) => { setSoundRaw(v); fcSet("focusAmbient", v); };
  const setHide = (v) => { setHideRaw(v); fcSet("focusHideOthers", v); };
  /* The chosen task first, then the next open ones — six cards at most. */
  const chosen = open.find((t) => String(t.id) === taskId);
  const list = (chosen ? [chosen] : []).concat(open.filter((t) => t !== chosen)).slice(0, 6);
  const minutes = len === "custom" ? Math.max(1, Math.min(240, parseInt(custom, 10) || 0)) : parseInt(len, 10);
  const bad = len === "custom" && !(parseInt(custom, 10) >= 1 && parseInt(custom, 10) <= 240);
  const start = () => {
    if (bad) return;
    const t = open.find((x) => String(x.id) === taskId);
    fcUi.set({ view: "run", note: null, summary: null, preset: null });
    onStart({ intention: purpose.trim() || (t ? t.title : "Focus"), planned: minutes, taskId: t ? t.id : "", ambient: sound, hideOthers: hide });
  };
  return (
    <div className="fc-stack">
      <FcHead kicker={note ? "Break over" : "Focus session"} title="Focus" sub={note || "One thing, one stretch of time."} action="close" actionLabel="Close" onAction={onClose} />

      <Glass pad="16px 18px" radius={20} className="fc-card fc-card-form">
        <label className="fc-group">
          <span className="fc-label">What is this session for?</span>
          <input className="fc-field" data-fc-autofocus="" data-fc-purpose="" value={purpose} onChange={(e) => setPurpose(e.target.value)}
            placeholder={chosen ? "e.g. " + chosen.title : "e.g. the first draft"} onKeyDown={(e) => { if (e.key === "Enter") start(); }} />
        </label>
        <div className="fc-group">
          <span className="fc-label">Length</span>
          <div className="fc-len-row">
            <FcSeg items={FC_LENGTHS.map(([v, l]) => [v, v === "custom" ? l : l + " min"])} value={len} onChange={setLen} label="Length" />
            {len === "custom" ? (
              <span className={"fc-custom" + (bad ? " is-bad" : "")}>
                <input className="fc-field fc-field-num" inputMode="numeric" aria-label="Minutes" aria-invalid={bad || undefined} data-fc-custom=""
                  value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} />
                <span className="fc-unit">min</span>
              </span>
            ) : null}
          </div>
          {bad ? <span className="fc-error">Pick between 1 and 240 minutes.</span> : null}
        </div>
      </Glass>

      <div className="fc-group">
        <span className="fc-label fc-label-sky px-on-sky">Choose a task</span>
        {list.length ? (
          <div className="fc-tasks" role="group" aria-label="Task">
            {list.map((t) => {
              const on = String(t.id) === taskId;
              return (
                <Glass key={t.id} pad="10px 14px" radius={16} strong={on} best={on} className="fc-task" aria-pressed={on} data-fc-task={t.id}
                  label={t.title} onClick={() => setTaskId(on ? "" : String(t.id))}>
                  <span className="fc-ring" style={{ "--fc-hue": fcHue(t) }} aria-hidden="true" />
                  <span className="fc-task-text">
                    <span className="fc-task-title">{t.title}</span>
                    <span className="fc-task-meta">{[window.NEEDT && window.NEEDT.projectName(t), t.estimatedMinutes ? fcDur(t.estimatedMinutes) : null].filter(Boolean).join(" · ") || "No project"}</span>
                  </span>
                  {on ? <span className="fc-task-check" aria-hidden="true"><FcIcon name="check" size={13} /></span> : null}
                </Glass>
              );
            })}
          </div>
        ) : <span className="fc-empty px-on-sky">Nothing open — a session can still run on its purpose alone.</span>}
      </div>

      <Glass pad="16px 18px" radius={20} className="fc-card fc-card-opts">
        <div className="fc-opt">
          <span className="fc-label">Ambient sound</span>
          <FcSeg items={FC_SOUNDS} value={sound} onChange={setSound} label="Ambient sound" icons />
        </div>
        <button type="button" role="switch" aria-checked={hide} className={"fc-switch-row" + (hide ? " is-on" : "")} onClick={() => setHide(!hide)} data-fc-hide="">
          <FcIcon name="eye-off" size={15} />
          <span className="fc-switch-label">Hide other tasks</span>
          <span className="fc-switch" aria-hidden="true"><span className="fc-switch-knob" /></span>
        </button>
      </Glass>

      <div className="fc-foot">
        <button type="button" className="nx-btn nx-btn-primary fc-start" onClick={start} disabled={bad} data-fc-start="">
          <FcIcon name="target" size={15} />Start {minutes} min
        </button>
        <span className="fc-info px-on-sky"><FcIcon name="info" size={13} />{FC_RULE}</span>
      </div>
    </div>
  );
}

/* ---------- running ---------- */
function FcRun({ tasks, focus, onStop, onMinimise }) {
  const Glass = window.GlassCard;
  const task = fcTaskOf(tasks, focus);
  const planned = fcPlanned(focus);
  const total = planned * 60;
  const left = Math.max(total - focus.elapsed, 0);
  const pct = total ? Math.min(focus.elapsed / total, 1) : 0;
  const title = focus.isBreak ? "Break" : (task && task.title) || focus.intention || "Focus";
  const purpose = !focus.isBreak && focus.intention && task && focus.intention !== task.title ? focus.intention : null;
  const [sound, setSoundRaw] = React.useState(focus.ambient || fcGet("focusAmbient", "off"));
  const cycle = () => {
    const i = FC_SOUNDS.findIndex(([v]) => v === sound), n = FC_SOUNDS[(i + 1) % FC_SOUNDS.length][0];
    setSoundRaw(n); fcSet("focusAmbient", n);
  };
  const setFocus = window.__app && window.__app.setFocus;
  const pause = () => setFocus && setFocus((f) => (f ? (f.paused
    ? Object.assign({}, f, { paused: false, planned: f.plannedFull, plannedFull: undefined })
    : Object.assign({}, f, { paused: true, plannedFull: f.planned, planned: (f.elapsed - 0.001) / 60 })) : f));
  const more = () => setFocus && setFocus((f) => (f ? (f.paused ? Object.assign({}, f, { plannedFull: f.plannedFull + 5 }) : Object.assign({}, f, { planned: f.planned + 5 })) : f));
  const stop = () => fcFinish(focus, "stopped", tasks, onStop);
  const soundName = (FC_SOUNDS.find(([v]) => v === sound) || FC_SOUNDS[0])[1];
  return (
    <div className="fc-stack fc-run">
      <FcHead kicker={focus.paused ? "Paused" : focus.isBreak ? "On a break" : "In focus"} title={title} sub={purpose} action="minimise" actionLabel="Minimise (Esc)" actionGlyph="minimise" onAction={onMinimise} />

      <div className="fc-clock-wrap" data-px-calm="">
        <span className={"px-display px-on-sky fc-clock" + (focus.paused ? " is-paused" : "")} data-fc-clock="" role="timer" aria-label={fcClock(left) + " left"}>{fcClock(left)}</span>
        <span className="fc-bar" aria-hidden="true"><span className="fc-bar-fill" style={{ "--fc-pct": pct }} /></span>
        <span className="fc-clock-meta px-on-sky">{fcDur(Math.round(planned))} session · ends {fcEndsAt(left)}</span>
      </div>

      <div className="fc-controls">
        <button type="button" className="nx-btn nx-btn-primary fc-ctl" onClick={pause} data-fc-pause="" data-fc-autofocus="">
          <FcGlyph name={focus.paused ? "play" : "pause"} size={14} />{focus.paused ? "Resume" : "Pause"}
        </button>
        <button type="button" className="nx-btn nx-btn-secondary fc-ctl" onClick={more} data-fc-more="">
          <FcIcon name="plus" size={14} />5 min
        </button>
        <button type="button" className="nx-btn nx-btn-secondary fc-ctl" onClick={stop} data-fc-stop="">
          <FcGlyph name="stop" size={13} />Stop
        </button>
        <button type="button" className="px-chip-btn fc-chip" onClick={cycle} data-fc-sound={sound} title="Ambient sound — click to change" aria-label={"Ambient sound: " + soundName}>
          <FcGlyph name={sound} size={14} />{soundName}
        </button>
      </div>

      {task && !focus.isBreak ? <FcTaskCard task={task} Glass={Glass} /> : focus.isBreak ? (
        <Glass pad="16px 18px" radius={20} className="fc-card fc-card-note">
          <span className="fc-break-line"><FcGlyph name="coffee" size={16} />Stand up, drink some water, look at something far away.</span>
        </Glass>
      ) : null}
    </div>
  );
}
function fcEndsAt(leftSec) {
  /* Prototype clock runs fast; the end time is shown in real minutes. */
  const d = new Date(Date.now() + leftSec * 1000);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

/* The task in the session: its subtasks to tick and its notes. Notes are the
   task's notes (plain text), saved as you type (debounced) and on blur. */
function FcTaskCard({ task, Glass }) {
  const app = () => window.__app || {};
  const [notes, setNotes] = React.useState(task.notes || "");
  const timer = React.useRef(0);
  const last = React.useRef(task.notes || "");
  const write = (v) => {
    window.clearTimeout(timer.current);
    if (v === last.current) return;
    last.current = v;
    if (app().updateTask) app().updateTask(task.id, { notes: v || null });
  };
  React.useEffect(() => () => { window.clearTimeout(timer.current); }, []);
  const parts = task.TaskPart || [];
  const tick = (i) => app().updateTask && app().updateTask(task.id, { TaskPart: parts.map((p, j) => (j === i ? Object.assign({}, p, { done: !p.done }) : p)) });
  const doneN = parts.filter((p) => p.done).length;
  return (
    <Glass pad="16px 18px" radius={20} className="fc-card fc-card-task" data-fc-taskcard={task.id}>
      {parts.length ? (
        <div className="fc-group">
          <span className="fc-label">Subtasks <span className="fc-count">{doneN}/{parts.length}</span></span>
          <div className="fc-parts">
            {parts.map((p, i) => (
              <button key={p.id || i} type="button" role="checkbox" aria-checked={!!p.done} className={"fc-part" + (p.done ? " is-done" : "")} onClick={() => tick(i)} data-fc-part={i}>
                <span className="fc-box" aria-hidden="true">{p.done ? <FcIcon name="check" size={11} /> : null}</span>
                <span className="fc-part-title">{p.title}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <label className="fc-group">
        <span className="fc-label">Notes</span>
        <textarea className="fc-field fc-notes" rows={3} value={notes} placeholder="What you found, what is left…" data-fc-notes=""
          onChange={(e) => { const v = e.target.value; setNotes(v); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => write(v), 500); }}
          onBlur={() => write(notes)} />
      </label>
    </Glass>
  );
}

/* ---------- end ---------- */
function FcEnd({ tasks, summary, onStart }) {
  const Glass = window.GlassCard;
  const st = fcStats();
  const next = fcOpenTasks(tasks).find((t) => String(t.id) !== String(summary.taskId));
  const close = () => fcUi.set({ open: false, view: "setup", summary: null });
  const pieces = [
    { id: "next", glyph: <FcIcon name="arrow-right" size={16} />, title: "Next task", sub: next ? next.title : "Nothing else open",
      on: next ? () => fcUi.set({ view: "setup", summary: null, preset: String(next.id), note: null }) : null },
    { id: "break", glyph: <FcGlyph name="coffee" size={16} />, title: "Take a 5-min break", sub: "Starts now, then back to setup",
      on: () => { fcUi.set({ view: "run", summary: null }); onStart({ intention: "Break", planned: 5, isBreak: true, after: next ? String(next.id) : null }); } },
    { id: "done", glyph: <FcIcon name="check" size={16} />, title: "Done for now", sub: "Close and get back to the day", on: close }
  ];
  const mins = summary.minutes < 1 ? "Under a minute" : fcDur(summary.minutes);
  return (
    <div className="fc-stack fc-end">
      <FcHead kicker={summary.how === "complete" ? "Session complete" : "Session ended"} title={mins} sub={"on " + summary.title} action="close" actionLabel="Close" onAction={close} />
      <Glass pad={0} radius={20} className="fc-card fc-stats" data-fc-stats="">
        <span className="fc-stat">
          <span className="fc-stat-num">{st.count || (summary.minutes >= 1 ? 1 : 0)}</span>
          <span className="fc-stat-label">{st.count === 1 ? "session today" : "sessions today"}</span>
          <span className="fc-pips" aria-hidden="true">{Array.from({ length: Math.min(st.count, 8) }).map((_, i) => <span key={i} className="fc-pip" />)}</span>
        </span>
        <span className="fc-stat">
          <span className="fc-stat-num">{fcDur(st.minutes)}</span>
          <span className="fc-stat-label">focused today</span>
        </span>
        <span className="fc-stat">
          <span className="fc-stat-num">{st.series}</span>
          <span className="fc-stat-label">{st.series === 1 ? "day in a row" : "days in a row"}</span>
        </span>
      </Glass>
      <div className="fc-group">
        <span className="fc-label fc-label-sky px-on-sky">What next</span>
        <div className="fc-next">
          {pieces.map((p, i) => (
            <Glass key={p.id} pad="14px 16px 16px" radius={16} className={"fc-next-card" + (p.on ? "" : " is-off")} onClick={p.on || undefined} label={p.title} data-fc-next={p.id}
              data-fc-autofocus={i === 0 && p.on ? "" : undefined} aria-disabled={p.on ? undefined : "true"}>
              <span className="fc-next-glyph">{p.glyph}</span>
              <span className="fc-next-title">{p.title}</span>
              <span className="fc-next-sub">{p.sub}</span>
            </Glass>
          ))}
        </div>
      </div>
      <span className="fc-info px-on-sky"><FcIcon name="info" size={13} />{FC_RULE}</span>
    </div>
  );
}

/* Open from anywhere: setup, or the clock when a session runs. */
const focusUi = {
  get: fcUi.get, sub: fcUi.sub,
  open(preset) { fcUi.set({ open: true, view: fcWasRunning ? "run" : (fcUi.get().view === "end" && fcUi.get().summary ? "end" : "setup"), preset: preset == null ? null : String(preset), note: null }); },
  close() { fcUi.set({ open: false }); }
};

Object.assign(window, { FocusWindow, focusUi, fcStats });
