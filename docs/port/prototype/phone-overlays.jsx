/* PHONE OVERLAYS — the shared sheets of the Plates phone (08.10.26).
 *
 * Everything that comes up over a screen, on the kit's PkSheet (frosted glass,
 * the screen blurred behind and harder toward the edges, swipe down / scrim /
 * Esc to close). They replace Mobile.jsx's MbTask, MbComposer, MbAsk and
 * MbmSnack in the live phone (V2pScreens / V2pLivePhone); data and rules stay
 * the phone's (window.pkDay, coParse, mbUseStates, NEEDT).
 * Styles: styles/phone-overlays.css (pov-*); colours: --v2p-* / --pk-* and
 * themes.css --pov-*. Dark: raised surfaces, inverse only on the primary.
 *
 *   <PkTaskSheet task open onClose onUpdate(id, patch) onDelete(t) onFocus(t) />
 *     MbTask's props. Autosave (a quiet "Saved" flashes). Title + done ring,
 *     First step (t.entry, one line under the title), facts (Date, Time,
 *     Duration, Project, Priority, Labels — a tap opens a row of choices
 *     under the fact), Scheduling (a folded glass card — Placement, Min. work
 *     block, Deadline, Hours; each row opens its picker in a sheet over the
 *     task sheet; the same keys as the desktop TaskDialog: isFixed/auto,
 *     chunk, deadline + hardDeadline, hours), Subtasks, Notes (t.notes, plain
 *     text), Attachments. Start focus is the one primary action; Delete sits quiet
 *     at the end of the body.
 *   <PkComposer open onClose onCreate(parsed) />
 *     one big field (coParse is the source of truth: the Date / Project /
 *     Priority chips write words into the line, like the desktop pickers),
 *     Attachment = hidden <input type=file> → chips; Add (primary) or Enter.
 *     parsed = coParse(line) + { attachments? } — hand it to pkDay.create,
 *     which reads what the line said (date, time, duration, project,
 *     priority, label, note); pkDay.added(id) says where it landed.
 *   <PkAsk open onClose />  Ask Needt: orb, suggestions, input at the bottom.
 *   <PkSnack snack={{text, undo?, key}} onDone />  a frosted toast above the
 *     pill with Undo (5 s with undo, 2.6 s without).
 *   <PkPaywall open onClose onCheckout feature />  window.Paywall (phone) as a
 *     full PkSheet, the PxSky sky inside it.
 *   <PkEventSheet open onClose title meta facts={[[label, value]]} footer />
 *     the event detail (Calendar's own sheet, as one component).
 */
const PovNS = window.NeedtDesignSystem_25d3c8;
const { Icon: PovIcon } = PovNS;
const povCx = (...a) => a.filter(Boolean).join(" ");

/* ── priority words (pkDay.prio is the one reading of them) ── */
const POV_PRIO = [["urgent", "Urgent"], ["high", "High"], ["medium", "Medium"], ["low", "Low"]];
const povPrio = (p) => pkDay.prio(p);
const povPrioLabel = (p) => { const k = povPrio(p); return k ? (POV_PRIO.filter((x) => x[0] === k)[0] || [k, k])[1] : null; };

/* ══ The task sheet ═══════════════════════════════════════════════════════ */
const POV_EST = [15, 30, 45, 60, 90, 120, 180];
const POV_DAYS = [["Today", 0], ["Tomorrow", 1], ["In 2 days", 2], ["Next week", 7]];
const POV_HOURS = [9, 11, 14, 17];
const povProjects = () => window.projects.list();
const povLabels = () => (window.CO_LABELS || ["errand", "money", "deep work", "admin", "reading"]);
/* Scheduling — the desktop TaskDialog's choices (Dialogs.jsx TD_CHUNK / TD_HOURS). */
const POV_CHUNK = [null, 15, 25, 30, 45, 60, 90];
const POV_SCHED_HOURS = [["work", "Work hours"], ["personal", "Personal"], ["any", "Any time"]];
const POV_DEADLINE = [["Today", 0], ["Tomorrow", 1], ["In 2 days", 2], ["Next week", 7], ["In 2 weeks", 14]];
const povIsoIn = (n) => { const N = window.NEEDT, d = N.today; return N.iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };

/* One choice in a picker sheet: the words, a hint, a check when chosen. */
function PovPickRow({ on, onClick, hint, children, data }) {
  return (
    <button type="button" className={povCx("pov-pick-row", on && "is-on")} aria-pressed={!!on} onClick={onClick} {...(data || {})}>
      <span className="pov-pick-text"><span className="pov-pick-label">{children}</span>{hint ? <span className="pov-pick-hint">{hint}</span> : null}</span>
      <span className="pov-pick-check" aria-hidden="true">{on ? <PovIcon name="check" size={18} /> : null}</span>
    </button>
  );
}

function PovFact({ id, label, value, muted, late, open, onToggle, children }) {
  return (
    <div className={povCx("pov-fact", open && "is-open")} data-pov-fact={id}>
      <button type="button" className="pov-fact-row" aria-expanded={!!open} onClick={onToggle}>
        <span className="pov-fact-label">{label}</span>
        <span className={povCx("pov-fact-value", muted && "is-muted", late && "is-late")}>{value}</span>
        <span className="pov-fact-chev" aria-hidden="true"><PovIcon name="chevron-down" size={14} /></span>
      </button>
      {open ? <div className="pov-opts pk-no-drag">{children}</div> : null}
    </div>
  );
}
function PovOpt({ on, onClick, children, hue }) {
  return (
    <button type="button" className={povCx("pov-opt", on && "is-on")} aria-pressed={!!on} onClick={onClick} style={hue ? { "--hue": hue } : undefined}>
      {hue ? <span className="pov-hue" aria-hidden="true" /> : null}{children}
    </button>
  );
}

function PkTaskSheet({ task, open, onClose, onUpdate, onDelete, onFocus }) {
  const [held, setHeld] = React.useState(task || null);
  React.useEffect(() => { if (task) setHeld(task); }, [task]);
  const t = task || held || {};
  const [flash, setFlash] = React.useState(0);
  const [fact, setFact] = React.useState(null);
  const [newPart, setNewPart] = React.useState("");
  React.useEffect(() => { if (!flash) return undefined; const id = window.setTimeout(() => setFlash(0), 1400); return () => window.clearTimeout(id); }, [flash]);
  React.useEffect(() => { setNewPart(""); setFlash(0); setFact(null); }, [t.id]);
  const edit = (p) => { if (t.id == null || !task) return; onUpdate(t.id, p); setFlash(Date.now()); };
  const toggleFact = (k) => () => setFact((f) => (f === k ? null : k));
  const N = window.NEEDT;
  const parts = t.TaskPart || [];
  const closed = parts.filter((p) => p.done).length;
  const at = t.id != null ? mbAt(t) : null;
  const dueDay = t.id != null && t.dueDate ? mbDueDay(t) : null;
  const pname = t.id != null ? mbPName(t) : null;
  const prio = povPrio(t.priority);
  const labels = t.labels || [];
  const addPart = () => { const v = newPart.trim(); if (!v) return; edit({ TaskPart: parts.concat([{ id: t.id + "." + Date.now().toString(36), title: v, done: false }]) }); setNewPart(""); };
  const setDay = (n) => edit(Object.assign({ overdue: false }, N.moveDay(t, (MB_TODAY + n) + " Sep")));
  const noDay = () => edit({ dueDate: null, scheduledStart: null, scheduledEnd: null, isFixed: false, overdue: false });
  const setHour = (h) => edit(Object.assign({ overdue: false }, N.placeAt(t, t.dueDate || (MB_TODAY + " Sep"), h)));
  const anyTime = () => edit({ scheduledStart: null, scheduledEnd: null, isFixed: false });
  const flipLabel = (l) => edit({ labels: labels.indexOf(l) > -1 ? labels.filter((x) => x !== l) : labels.concat([l]) });

  /* Scheduling: folded by default, remembered (mbPrefs.taskSchedOpen); a
     row opens its picker in a sheet over this one. */
  const prefs = mbUse(mbPrefStore);
  const schedOpen = !!prefs.taskSchedOpen;
  const [pick, setPick] = React.useState(null);
  React.useEffect(() => { if (!open) setPick(null); }, [open]);
  React.useEffect(() => { setPick(null); }, [t.id]);
  const lastPick = React.useRef(null); if (pick) lastPick.current = pick;
  const pickShown = pick || lastPick.current;
  const fixed = t.isFixed === true || t.auto === false;
  const chunk = t.chunk ? +t.chunk : null;
  const deadline = t.deadline || null;
  const hours = t.hours || "work";
  const hoursLabel = (POV_SCHED_HOURS.filter((h) => h[0] === hours)[0] || [hours, hours])[1];
  const dlLabel = deadline ? (t.hardDeadline ? "Hard · " : "") + (N.dayLabel ? N.dayLabel(deadline) : deadline) : null;
  const schedSum = [
    (fixed ? "Fixed" : "Auto") + (at != null ? " " + mbTime(at) : ""),
    chunk ? "min block " + chunk + " min" : "no split",
    deadline ? (t.hardDeadline ? "hard deadline " : "deadline ") + (N.dayLabel ? N.dayLabel(deadline) : deadline) : null,
    hours !== "work" ? hoursLabel.toLowerCase() : null
  ].filter(Boolean).join(" · ");
  const choose = (p) => { edit(p); setPick(null); };
  const schedRow = (k, label, value, muted) => (
    <button type="button" className="pov-srow" onClick={() => setPick(k)} aria-haspopup="dialog" data-pov-srow={k}>
      <span className="pov-srow-label">{label}</span>
      <span className={povCx("pov-srow-value", muted && "is-muted")}>{value}</span>
      <span className="pov-srow-chev" aria-hidden="true"><PovIcon name="chevron-right" size={14} /></span>
    </button>
  );
  const PICK = {
    placement: { title: "Placement", body: (
      <>
        <PovPickRow on={!fixed} onClick={() => choose({ isFixed: false, auto: true })} hint={at != null ? "Planned " + mbTime(at) + " — Needt may move it" : "Needt finds the slot"} data={{ "data-pov-pick-opt": "auto" }}>Auto</PovPickRow>
        <PovPickRow on={fixed} onClick={() => choose({ isFixed: true, auto: false })} hint={at != null ? "Stays at " + mbTime(at) : "Stays where you put it"} data={{ "data-pov-pick-opt": "fixed" }}>Fixed</PovPickRow>
      </>
    ) },
    chunk: { title: "Min. work block", body: (
      <>
        {POV_CHUNK.map((c) => (
          <PovPickRow key={String(c)} on={chunk === c} onClick={() => choose({ chunk: c })} hint={c ? "Never shorter than " + c + " min" : "One sitting, in one piece"} data={{ "data-pov-pick-opt": String(c) }}>{c ? c + " min" : "Don’t split"}</PovPickRow>
        ))}
      </>
    ) },
    deadline: { title: "Deadline", body: (
      <>
        {POV_DEADLINE.map(([l, n]) => {
          const v = povIsoIn(n);
          return <PovPickRow key={l} on={deadline === v} onClick={() => choose({ deadline: v })} hint={N.dayLabel ? N.dayLabel(v) : v} data={{ "data-pov-pick-opt": String(n) }}>{l}</PovPickRow>;
        })}
        <PovPickRow on={!deadline} onClick={() => choose({ deadline: null, hardDeadline: false })} data={{ "data-pov-pick-opt": "none" }}>No deadline</PovPickRow>
        <div className="pov-pick-switch">
          <span className="pov-pick-text"><span className="pov-pick-label">Hard deadline</span><span className="pov-pick-hint">Needt never plans it past this day</span></span>
          <button type="button" role="switch" aria-checked={!!t.hardDeadline} aria-label="Hard deadline" disabled={!deadline} className={povCx("pov-switch", t.hardDeadline && "is-on")}
            onClick={() => edit({ hardDeadline: !t.hardDeadline })} data-pov-hard=""><span className="pov-switch-knob" /></button>
        </div>
      </>
    ) },
    hours: { title: "Hours", body: (
      <>
        {POV_SCHED_HOURS.map(([k, l]) => <PovPickRow key={k} on={hours === k} onClick={() => choose({ hours: k })} data={{ "data-pov-pick-opt": k }}>{l}</PovPickRow>)}
      </>
    ) }
  };

  const head = (
    <div className="pov-task-top">
      <span className="pov-task-proj">{pname ? <span className="pov-hue" style={{ "--hue": mbHue(t.projectId) }} aria-hidden="true" /> : null}{pname || "No project"}</span>
      <span className="pov-saved" data-pov-saved={flash ? "1" : "0"} aria-live="polite"><PovIcon name="check" size={12} />Saved</span>
    </div>
  );
  const footer = t.done ? (
    <PkButton kind="quiet" icon="rotate-ccw" onClick={() => edit({ done: false })}>Reopen</PkButton>
  ) : (
    <>
      <PkButton kind="quiet" icon="check" className="pov-foot-side" onClick={() => edit({ done: true })} aria-label="Mark done">Done</PkButton>
      <PkButton kind="primary" icon="target" onClick={() => onFocus(t)} data-pov-focus="">Start focus</PkButton>
    </>
  );

  return (
    <>
    <PkSheet open={open} onClose={() => (pick ? setPick(null) : onClose())} head={head} footer={footer} label={t.title || "Task"} className="pov-task" bodyClass="pov-task-body">
      <div className="pov-title-row" data-pov-task={t.id != null ? t.id : ""}>
        <button type="button" className={povCx("pov-ring", t.done && "is-on")} aria-pressed={!!t.done} aria-label={t.done ? "Mark not done" : "Mark done"} onClick={() => edit({ done: !t.done })}>
          {t.done ? <PovIcon name="check" size={16} /> : null}
        </button>
        <PkField className="pov-title" multiline grow rows={1} value={t.title || ""} placeholder="Name it"
          onChange={(e) => edit({ title: e.target.value })} inputProps={{ "aria-label": "Title", "data-pov-title": "" }} />
      </div>
      <div className="pov-step" data-pov-step="">
        <PovIcon name="arrow-right" size={14} />
        <label className="pov-step-label" htmlFor={"pov-entry-" + (t.id != null ? t.id : "x")}>First step</label>
        <input id={"pov-entry-" + (t.id != null ? t.id : "x")} className="pov-step-input" value={t.entry || ""} placeholder="The smallest thing that counts"
          onChange={(e) => edit({ entry: e.target.value || null })} data-pov-entry="" />
      </div>
      {t.overdue && !t.done ? <p className="pov-late">Overdue — this was due {mbDue(t)}. Move it or let it go.</p> : null}
      {t.TaskWait && N.person ? <p className="pov-quiet-line"><PovIcon name="clock" size={13} />Waiting on {N.person(t.TaskWait.personId).name} for {t.TaskWait.reason}</p> : null}

      <div className="pov-facts">
        <PovFact id="date" label="Date" value={t.dueDate ? mbDue(t) : "No date"} muted={!t.dueDate} late={t.overdue && !t.done} open={fact === "date"} onToggle={toggleFact("date")}>
          {POV_DAYS.map(([l, n]) => <PovOpt key={l} on={dueDay === MB_TODAY + n && !t.overdue} onClick={() => setDay(n)}>{l}</PovOpt>)}
          <PovOpt on={!t.dueDate} onClick={noDay}>No date</PovOpt>
        </PovFact>
        <PovFact id="time" label="Time" value={at != null ? mbTime(at) + (t.isFixed ? "" : " · auto") : "Any time"} muted={at == null} open={fact === "time"} onToggle={toggleFact("time")}>
          {POV_HOURS.map((h) => <PovOpt key={h} on={at === h} onClick={() => setHour(h)}>{mbTime(h)}</PovOpt>)}
          <PovOpt on={at == null} onClick={anyTime}>Any time</PovOpt>
        </PovFact>
        <PovFact id="duration" label="Duration" value={t.estimatedMinutes ? mbDur(t.estimatedMinutes) : "None"} muted={!t.estimatedMinutes} open={fact === "duration"} onToggle={toggleFact("duration")}>
          {POV_EST.map((m) => <PovOpt key={m} on={t.estimatedMinutes === m} onClick={() => edit({ estimatedMinutes: m })}>{mbDur(m)}</PovOpt>)}
        </PovFact>
        <PovFact id="project" label="Project" value={pname || "None"} muted={!pname} open={fact === "project"} onToggle={toggleFact("project")}>
          {povProjects().map((p) => <PovOpt key={p.id} hue={mbHue(p.id)} on={t.projectId === p.id} onClick={() => edit({ projectId: p.id })}>{p.name}</PovOpt>)}
          <PovOpt on={!t.projectId} onClick={() => edit({ projectId: null })}>None</PovOpt>
        </PovFact>
        <PovFact id="priority" label="Priority" value={povPrioLabel(prio) || "None"} muted={!prio} late={prio === "urgent"} open={fact === "priority"} onToggle={toggleFact("priority")}>
          {POV_PRIO.map(([k, l]) => <PovOpt key={k} on={prio === k} onClick={() => edit({ priority: k })}>{l}</PovOpt>)}
          <PovOpt on={!prio} onClick={() => edit({ priority: null })}>None</PovOpt>
        </PovFact>
        <PovFact id="labels" label="Labels" value={labels.length ? labels.join(", ") : "None"} muted={!labels.length} open={fact === "labels"} onToggle={toggleFact("labels")}>
          {povLabels().concat(labels.filter((l) => povLabels().indexOf(l) < 0)).map((l) => <PovOpt key={l} on={labels.indexOf(l) > -1} onClick={() => flipLabel(l)}>{l}</PovOpt>)}
        </PovFact>
      </div>

      <PkGlass as="section" className="pov-sched" aria-label="Scheduling" data-pov-sched={schedOpen ? "open" : "folded"}>
        <button type="button" className="pov-sched-head" aria-expanded={schedOpen} onClick={() => mbSetPref("taskSchedOpen", !schedOpen)} data-pov-sched-head="">
          <span className="pov-sched-text">
            <span className="pov-sched-title">Scheduling</span>
            {schedOpen ? null : <span className="pov-sched-sum">{schedSum}</span>}
          </span>
          <span className={povCx("pov-sched-chev", schedOpen && "is-open")} aria-hidden="true"><PovIcon name="chevron-down" size={16} /></span>
        </button>
        {schedOpen ? (
          <div className="pov-sched-rows">
            {schedRow("placement", "Placement", fixed ? "Fixed" : "Auto")}
            {schedRow("chunk", "Min. work block", chunk ? chunk + " min" : "Don’t split", !chunk)}
            {schedRow("deadline", "Deadline", dlLabel || "None", !deadline)}
            {schedRow("hours", "Hours", hoursLabel)}
          </div>
        ) : null}
      </PkGlass>

      <section className="pov-block" data-pov-subtasks="">
        <div className="pov-block-head"><span className="pk-label">Subtasks</span>{parts.length ? <span className="pov-count">{closed} of {parts.length}</span> : null}</div>
        {parts.map((p, i) => (
          <div key={p.id || i} className={povCx("pov-part", p.done && "is-done")}>
            <button type="button" className={povCx("pov-ring is-small", p.done && "is-on")} aria-pressed={!!p.done} aria-label={(p.done ? "Reopen " : "Done: ") + p.title}
              onClick={() => edit({ TaskPart: parts.map((x, j) => (j === i ? Object.assign({}, x, { done: !x.done }) : x)) })}>
              {p.done ? <PovIcon name="check" size={12} /> : null}
            </button>
            <span className="pov-part-title">{p.title}</span>
          </div>
        ))}
        <div className="pov-part is-add">
          <span className="pov-part-plus" aria-hidden="true"><PovIcon name="plus" size={14} /></span>
          <input className="pov-part-input" value={newPart} onChange={(e) => setNewPart(e.target.value)} placeholder="Add a subtask" aria-label="Add a subtask"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPart(); } }} onBlur={addPart} />
        </div>
      </section>

      <section className="pov-block">
        <PkField label="Notes" id={"pov-notes-" + (t.id != null ? t.id : "x")} multiline grow rows={2} value={t.notes || ""} placeholder="Add a note"
          onChange={(e) => edit({ notes: e.target.value || null })} inputProps={{ "data-pov-notes": "" }} />
      </section>

      {(t.attachments || []).length ? (
        <section className="pov-block" data-pov-attachments="">
          <div className="pov-block-head"><span className="pk-label">Attachments</span><span className="pov-count">{t.attachments.length}</span></div>
          <div className="pov-files">
            {t.attachments.map((f, i) => (
              <div key={i} className="pov-file"><PovIcon name="paperclip" size={14} /><span className="pov-file-name">{f.name}</span><span className="pov-file-size">{pkDay.fileSize(f.size)}</span></div>
            ))}
          </div>
        </section>
      ) : null}

      {t.source && t.source.kind ? (
        <p className="pov-quiet-line"><PovIcon name="download" size={12} />From {t.source.kind}{t.source.label ? " · " + t.source.label : ""}</p>
      ) : null}
      <div className="pov-delete-row">
        <PkButton kind="ghost" icon="trash-2" className="pov-delete" onClick={() => onDelete(t)}>Delete task</PkButton>
      </div>
    </PkSheet>
    <PkSheet open={!!(open && pick)} onClose={() => setPick(null)} title={pickShown ? PICK[pickShown].title : ""} label={pickShown ? PICK[pickShown].title : "Scheduling"}
      className="pov-pick" bodyClass="pov-pick-body">
      <div className="pov-pick-list" data-pov-pick={pickShown || ""}>{pickShown ? PICK[pickShown].body : null}</div>
    </PkSheet>
    </>
  );
}

/* ══ The composer ═════════════════════════════════════════════════════════ */
const POV_PICK = {
  date: { label: "Date", icon: "calendar", rows: [["Today", "today"], ["Tomorrow", "tomorrow"], ["This weekend", "this weekend"], ["Next week", "next week"]] },
  project: { label: "Project", icon: "folder", rows: (window.CO_PROJECTS || ["Operations", "Design system", "German", "Resale", "Life"]).map((p) => [p, p]) },
  priority: { label: "Priority", icon: "flag", rows: [["Urgent", "urgent"], ["Important", "important"], ["Whenever", "whenever"]] }
};
const povTitle = (s) => String(s || "").replace(/^./, (c) => c.toUpperCase());

function PkComposer({ open, onClose, onCreate, from, onShut }) {
  const [text, setText] = React.useState("");
  const [pick, setPick] = React.useState(null);
  const [files, setFiles] = React.useState([]);
  const input = React.useRef(null);
  React.useEffect(() => {
    if (open) { const id = window.setTimeout(() => { if (input.current) input.current.focus({ preventScroll: true }); }, 320); return () => window.clearTimeout(id); }
    setPick(null); setFiles([]); setText("");
    return undefined;
  }, [open]);
  React.useLayoutEffect(() => { const el = input.current; if (!el) return; el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }, [text]);
  const p = window.coParse ? window.coParse(text) : { title: text, found: {} };
  const found = p.found || {};
  /* a pick writes words into the line, replacing what the line said before */
  const write = (k, words) => {
    setText((cur) => {
      const f = (window.coParse ? window.coParse(cur).found : {})[k];
      if (f && f.at) return (cur.slice(0, f.at[0]) + (words || "") + cur.slice(f.at[1])).replace(/\s{2,}/g, " ").replace(/^\s+/, "");
      return words ? (cur ? cur.replace(/\s+$/, "") + " " + words : words) : cur;
    });
    setPick(null);
    if (input.current) input.current.focus({ preventScroll: true });
  };
  const pickFiles = (fs) => {
    const list = (fs || []).map((f) => pkDay.fileOf(f));
    if (list.length) setFiles((l) => l.concat(list));
    if (input.current) input.current.focus({ preventScroll: true });
  };
  const commit = () => {
    const line = text.trim(); if (!line) return;
    const parsed = window.coParse ? window.coParse(line) : { title: line, rest: line, found: {} };
    if (files.length) parsed.attachments = files;
    onCreate(parsed);
    setText(""); setFiles([]); setPick(null);
  };
  const chip = (k) => {
    const spec = POV_PICK[k], v = found[k] ? found[k].value : null;
    return (
      <button key={k} type="button" className={povCx("pov-cchip", v && "is-set", pick === k && "is-open")} aria-expanded={pick === k} data-pov-chip={k}
        onClick={() => setPick((x) => (x === k ? null : k))}>
        <PovIcon name={spec.icon} size={14} /><span className="pov-cchip-text">{v ? povTitle(v) : spec.label}</span>
      </button>
    );
  };
  const footer = (
    <PkButton kind="primary" icon="arrow-up" disabled={!text.trim()} onClick={commit} data-pov-add="">Add</PkButton>
  );
  return (
    <PkSheet open={open} onClose={onClose} footer={footer} label="New task" className="pov-composer" bodyClass="pov-composer-body" from={from} onShut={onShut}>
      <textarea ref={input} className="pov-big" value={text} rows={2} spellCheck="false" placeholder="New task" aria-label="New task" data-pov-line=""
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); } }} />
      <p className="pov-hint">{text.trim() ? (found.time ? "At " + found.time.value : found.date ? "" : "Lands on today") : "Say when, which project, how urgent — or tap below."}</p>
      <div className="pov-cchips pk-no-drag">
        {chip("date")}{chip("project")}{chip("priority")}
        <button type="button" className="pov-cchip" onClick={() => window.needtPlatform.pickFile({ multiple: true }).then(pickFiles)} data-pov-attach-btn="">
          <PovIcon name="paperclip" size={14} /><span className="pov-cchip-text">Attachment</span>
        </button>
      </div>
      {pick ? (
        <div className="pov-opts is-composer pk-no-drag" data-pov-pick={pick}>
          {POV_PICK[pick].rows.map(([l, w]) => (
            <PovOpt key={l} on={found[pick] && String(found[pick].value).toLowerCase() === w.toLowerCase()} onClick={() => write(pick, w)}
              hue={pick === "project" ? mbHue(window.NEEDT.projectIdOf(l)) : null}>{l}</PovOpt>
          ))}
          {found[pick] ? <PovOpt onClick={() => write(pick, "")}>No {POV_PICK[pick].label.toLowerCase()}</PovOpt> : null}
        </div>
      ) : null}
      {files.length ? (
        <div className="pov-fchips" data-pov-files="">
          {files.map((f, i) => (
            <span key={"f" + i} className="pov-fchip" data-mb-attach={f.name}>
              <PovIcon name="paperclip" size={12} /><span className="pov-fchip-name">{f.name}</span>
              <button type="button" className="pov-fchip-x" aria-label={"Remove " + f.name} onClick={() => setFiles((l) => l.filter((x, j) => j !== i))}><PovIcon name="x" size={11} /></button>
            </span>
          ))}
        </div>
      ) : null}
    </PkSheet>
  );
}

/* ══ Ask Needt ════════════════════════════════════════════════════════════ */
function PkAsk({ open, onClose }) {
  const st = mbUseStates("chat");
  const [msgs, setMsgs] = React.useState([]);
  const [draft, setDraft] = React.useState("");
  const list = React.useRef(null);
  const ASK = typeof MB_ASK !== "undefined" ? MB_ASK : [];
  const blocked = st.offline ? ["cloud-off", "You're offline", "Ask Needt needs a connection. Your edits still save and sync later."]
    : st.ai === "limit" ? ["clock", "AI paused until 14:00", "Plan my day and Ask Needt come back then — your tasks and calendar still work."]
    : st.ai === "down" ? ["alert", "Needt can't answer right now", "The AI service didn't respond. Try again in a minute."]
    : null;
  const send = (text) => {
    const q = String(text || "").trim();
    if (!q || blocked) return;
    const hit = ASK.filter((a) => a[0].toLowerCase() === q.toLowerCase())[0];
    setMsgs((m) => m.concat([["you", q], ["needt", hit ? hit[1] : "Noted — I've put it on this week's brief so it's there when you open the desktop."]]));
    setDraft("");
  };
  React.useLayoutEffect(() => { const el = list.current && list.current.closest(".pk-sheet-body"); if (el && msgs.length) el.scrollTop = el.scrollHeight; }, [msgs.length]);
  const head = (
    <div className="pov-ask-head">
      <span className="pov-orb" aria-hidden="true">{window.AiOrb ? <window.AiOrb size={44} /> : null}</span>
      <span className="pov-ask-titles"><span className="pov-ask-title">Ask Needt</span><span className="pov-ask-sub">Plans with your calendar and tasks</span></span>
    </div>
  );
  const footer = (
    <form className="pov-ask-field" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
      <input className="pov-ask-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask anything about your day" aria-label="Ask Needt" disabled={!!blocked} data-pov-ask-input="" />
      <button type="submit" className="pov-ask-send" aria-label="Send" disabled={!!blocked || !draft.trim()}><PovIcon name="arrow-up" size={18} /></button>
    </form>
  );
  return (
    <PkSheet open={open} onClose={onClose} head={head} footer={footer} detents={[0.86]} label="Ask Needt" className="pov-ask" bodyClass="pov-ask-body">
      <div ref={list} className="pov-ask-list" data-pov-ask="">
        {blocked ? (
          <div className="pov-ask-note" role="status">
            <MbStGlyph name={blocked[0]} size={16} fallback="info" />
            <span className="pov-ask-note-text"><b>{blocked[1]}</b><span>{blocked[2]}</span></span>
          </div>
        ) : null}
        <p className="pov-msg is-needt">Ask about your day — I can plan the afternoon, find what&apos;s overdue, or draft a reply.</p>
        {msgs.map(([who, text], i) => <p key={i} className={"pov-msg is-" + who}>{text}</p>)}
        {msgs.length ? null : (
          <div className="pov-ask-sugg">
            {ASK.map(([q]) => <button key={q} type="button" className="pov-sugg" disabled={!!blocked} onClick={() => send(q)}>{q}<PovIcon name="arrow-up-right" size={14} /></button>)}
          </div>
        )}
      </div>
    </PkSheet>
  );
}

/* ══ The snack: a frosted toast above the pill ════════════════════════════ */
function PkSnack({ snack, onDone }) {
  const doneRef = React.useRef(onDone); doneRef.current = onDone;
  React.useEffect(() => {
    if (!snack) return undefined;
    const t = window.setTimeout(() => doneRef.current && doneRef.current(), snack.undo ? 5000 : 2600);
    return () => window.clearTimeout(t);
  }, [snack]);
  if (!snack) return null;
  return (
    <div key={snack.key} role="status" className="pov-snack" data-pov-snack="" data-mbm="snack">
      <span className="pov-snack-text">{snack.text}</span>
      {snack.undo ? <button type="button" className="pov-snack-undo" onClick={() => { snack.undo(); doneRef.current && doneRef.current(); }}>Undo</button> : null}
    </div>
  );
}

/* ══ The paywall as a sheet, with the sky inside ═════════════════════════
   window.Paywall (paywall-sheet.jsx) draws the sky, the plans and the bar;
   the sheet gives it the shared physics. Its own body scrolls, so a drag
   that starts in a scrolled body stays a scroll. */
function PkPaywall({ open, onClose, onCheckout, feature }) {
  const PW = window.Paywall;
  const guard = (e) => {
    const b = e.target.closest && e.target.closest(".pw-body");
    if (b && b.scrollTop > 0) e.stopPropagation();
  };
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const ts = (e) => { const b = e.target.closest && e.target.closest(".pw-body"); if (b && b.scrollTop > 0) e.stopPropagation(); };
    el.addEventListener("touchstart", ts, { passive: true });
    return () => el.removeEventListener("touchstart", ts);
  }, []);
  if (!PW) return null;
  return (
    <PkSheet open={open} onClose={onClose} detents={[0.95]} label="Needt Pro" className="pov-paywall" bodyClass="pov-paywall-body">
      <div ref={ref} className="pov-paywall-in" onPointerDown={guard} data-pov-paywall="">
        <PW phone open={open} onClose={onClose} onCheckout={onCheckout} feature={feature} />
      </div>
    </PkSheet>
  );
}

/* ══ Event detail ═════════════════════════════════════════════════════════ */
function PkEventSheet({ open, onClose, title, meta, facts, footer, children }) {
  return (
    <PkSheet open={open} onClose={onClose} title={title} meta={meta} className="pov-event"
      footer={footer !== undefined ? footer : <PkButton kind="primary" onClick={onClose}>Done</PkButton>}>
      {facts && facts.length ? (
        <dl className="pov-evfacts">
          {facts.map(([k, v]) => <div key={k} className="pov-evfact"><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      ) : null}
      {children}
    </PkSheet>
  );
}

Object.assign(window, { PkTaskSheet, PkComposer, PkAsk, PkSnack, PkPaywall, PkEventSheet });
