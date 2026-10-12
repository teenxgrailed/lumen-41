/* THE COMPOSER — one line that makes anything.
 *
 * Creating is a hurry and editing is a sit-down, so they are different objects:
 * this is the hurry. You type a sentence, the app shows you what it understood
 * inside the sentence itself, and Enter commits. Nothing here is a form.
 *
 * WHAT IT UNDERSTANDS, and how you see it
 *   Every recognised run of words is underlined in the line where you typed it
 *   and restated as a chip below. Two readings of one thing: the underline says
 *   WHICH WORDS were taken, the chip says WHAT THEY BECAME. A parser that only
 *   showed chips would leave you guessing which part of your sentence it ate.
 *
 * SAID versus ASSUMED
 *   A chip you caused carries its colour. A chip the app supplied — the day,
 *   when you named none — is grey and dimmed. Todoist draws both alike, so its
 *   row mixes what you decided with what it decided; here you can see the
 *   difference without reading.
 *
 * NO SIGILS. #project and @label are a syntax to learn; the vocabulary is
 * already known — the projects have names — so the words are enough.
 *
 * THE TYPE IS INFERRED. "call Anna tomorrow 3pm" is an event, "call Anna" is a
 * task, "notes on the factory" is a document, "every day" is a habit. The type
 * chip states the verdict and can be overruled, which is faster than choosing
 * from a menu you have to read first.
 */
const CoNS = window.NeedtDesignSystem_25d3c8;
const { Icon: CoIcon, IconButton: CoIconButton, Tooltip: CoTooltip } = CoNS;

const CO_PROJECTS = ["Operations", "Design system", "German", "Resale", "Life"];
const CO_LABELS = ["errand", "money", "deep work", "admin", "reading"];
const CO_DOW = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/* Each rule owns one attribute and one vocabulary. Order matters: the longest
   and most specific patterns claim their words first, so "by friday" becomes a
   deadline before "friday" can become a date. */
const CO_RULES = [
  { k: "repeat", tone: "var(--info)", re: /\b(every day|every week|every month|every (?:mon|tues|wednes|thurs|fri|satur|sun)day|daily|weekly|monthly)\b/i,
    read: (m) => m[0].toLowerCase() },
  { k: "deadline", tone: "var(--destructive)", re: /\b(?:by|due) (today|tomorrow|tonight|this weekend|next week|mon|tues|wednes|thurs|fri|satur|sun)(?:day)?\b/i,
    read: (m) => "by " + m[1].toLowerCase() },
  { k: "duration", tone: "var(--text-tertiary)", re: /\b(?:for )?(\d+)\s?(m|min|mins|minutes|h|hr|hrs|hours)\b/i,
    read: (m) => (/^h/i.test(m[2]) ? m[1] + " h" : m[1] + " min") },
  { k: "date", tone: "var(--accent)", re: /\b(today|tonight|tomorrow|tom|this weekend|next week|in \d+ days?|mon|tues|wednes|thurs|fri|satur|sun)(?:day)?\b/i,
    read: (m) => {
      const w = m[1].toLowerCase();
      if (w === "tom") return "Tomorrow";
      const dow = CO_DOW.filter((d) => d.indexOf(w) === 0)[0];
      if (dow && w.length >= 3) return dow.charAt(0).toUpperCase() + dow.slice(1);
      return w.charAt(0).toUpperCase() + w.slice(1);
    } },
  { k: "time", tone: "var(--accent)", re: /\b(?:at )?(\d{1,2}(?::\d{2})?\s?(?:am|pm)|\d{1,2}:\d{2}|noon|midnight)\b/i,
    read: (m) => m[1].toLowerCase().replace(/\s+/, "") },
  { k: "priority", tone: "var(--destructive)", re: /\b(urgent|important|asap|whenever|sometime)\b/i,
    read: (m) => ({ urgent: "Urgent", asap: "Urgent", important: "Important", whenever: "Whenever", sometime: "Whenever" })[m[0].toLowerCase()] },
  { k: "project", tone: null, re: new RegExp("\\b(" + CO_PROJECTS.join("|") + ")\\b", "i"),
    read: (m) => CO_PROJECTS.filter((p) => p.toLowerCase() === m[1].toLowerCase())[0] },
  { k: "label", tone: "var(--success)", re: new RegExp("\\b(" + CO_LABELS.join("|") + ")\\b", "i"),
    read: (m) => m[1].toLowerCase() }
];

const CO_TYPES = {
  task: { label: "Task", glyph: "circle-check" },
  event: { label: "Event", glyph: "calendar" },
  doc: { label: "Document", glyph: "file-text" },
  habit: { label: "Habit", glyph: "repeat" }
};

/* THE PARSE. One pass per rule over the words not already claimed, so no run of
   text can mean two things at once — the reason the underline can be trusted. */
function coParse(text) {
  const body = text.split("/")[0];
  const parts = text.split("/").slice(1).map((s) => s.trim()).filter(Boolean);
  const taken = [];
  const found = {};
  CO_RULES.forEach((rule) => {
    if (found[rule.k]) return;
    let m = null;
    const re = new RegExp(rule.re.source, "gi");
    let hit;
    while ((hit = re.exec(body))) {
      const a = hit.index, b = a + hit[0].length;
      if (taken.some((t) => a < t[1] && t[0] < b)) continue;
      m = hit; break;
    }
    if (!m) return;
    taken.push([m.index, m.index + m[0].length, rule.k]);
    found[rule.k] = { value: rule.read(m), at: [m.index, m.index + m[0].length] };
  });

  /* The verdict. A recurring thing is a habit whatever else it says; a thing
     with a clock is an event; a thing that is written is a document. */
  let type = "task";
  if (found.repeat) type = "habit";
  else if (found.time || /\b(meeting|call with|lunch|dinner|sync|standup|stand-up|1:1|interview)\b/i.test(body)) type = "event";
  else if (/\b(notes?|draft|write up|write-up|doc|document|brief|memo)\b/i.test(body)) type = "doc";

  const title = body.replace(/\s+/g, " ").trim();
  /* What the parse did not claim — the name the thing is saved under. */
  let rest = "", at = 0;
  taken.slice().sort((x, y) => x[0] - y[0]).forEach(([x, y]) => { rest += body.slice(at, x) + " "; at = y; });
  rest = (rest + body.slice(at)).replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
  return { title: title, rest: rest || title, parts: parts, found: found, taken: taken.sort((x, y) => x[0] - y[0]), type: type };
}

function coHue(p) {
  const proj = window.cvProject ? window.cvProject(p) : null;
  return proj ? proj.color : "var(--accent)";
}

/* THE UNDERLAY. The input's own text is transparent; this draws the same string
   underneath it with the claimed runs marked. It shares the input's metrics and
   its scroll position, so the marks sit exactly under the letters. */
function CoUnderlay({ text, taken, scroll }) {
  const out = [];
  let at = 0;
  taken.forEach(([a, b, k], i) => {
    if (a > at) out.push(<span key={"p" + i}>{text.slice(at, a)}</span>);
    const rule = CO_RULES.filter((r) => r.k === k)[0];
    const tone = k === "project" ? coHue(text.slice(a, b)) : rule.tone;
    out.push(
      <span className="shell-underlay-span" key={"m" + i} style={{ boxShadow: "inset 0 -2px 0 0 color-mix(in oklab, " + tone + " 55%, transparent)", background: "color-mix(in oklab, " + tone + " 12%, transparent)" }}>{text.slice(a, b)}</span>
    );
    at = b;
  });
  const tail = text.slice(at);
  const slash = tail.indexOf("/");
  if (slash >= 0) {
    out.push(<span key="t">{tail.slice(0, slash)}</span>);
    out.push(<span className="shell-underlay-span-2" key="parts">{tail.slice(slash)}</span>);
  } else if (tail) out.push(<span key="t">{tail}</span>);
  return (
    <div aria-hidden="true" className="co-mirror" style={{ transform: "translateX(" + -scroll + "px)" }}>{out}</div>
  );
}


/* The sheet's own rules (.cmp-*) live in styles/shell.css. composer.css is
   shared with the phone, Help and Bug and keeps the old line's .co-* rules. */

function CoChip({ tone, glyph, children, quiet, onClear, folder }) {
  return (
    <span className={"cmp-chip" + (quiet ? " is-quiet" : "")}>
      {glyph ? <span className="shell-chip-grid" aria-hidden="true" style={{ color: tone }}><CoIcon name={folder ? "folder" : glyph} size={13} /></span> : null}
      <span>{children}</span>
      {onClear ? (
        <button type="button" className="cmp-chip-x" onClick={onClear} aria-label="Remove"><CoIcon name="x" size={11} /></button>
      ) : null}
    </span>
  );
}

/* Everything the line does not parse lives here, opening upward so the line you
   are typing in never moves. */
const CO_MORE = [
  ["Description", "align-left", "note", "var(--text-tertiary)", ""],
  ["Attachment", "paperclip", "file", "var(--text-tertiary)", ""],
  ["Subtasks", "list-plus", "insert", "var(--text-tertiary)", "/"],
  ["Duration", "clock", "insert", "var(--text-tertiary)", "for 30 min"],
  ["Priority", "flag", "insert", "var(--destructive)", "urgent"],
  ["Deadline", "calendar-clock", "insert", "var(--destructive)", "by friday"],
  ["Repeat", "repeat", "insert", "var(--accent)", "every day"],
  ["Labels", "tag", "insert", "var(--success)", "errand"]
];

/* The pickers. Each one writes words into the line rather than setting a
   hidden field, so the sentence stays the single source of truth and the
   parse — underline and chip — reports the pick like anything typed. */
const CO_PICK = {
  date: { title: "Date", rows: [["Today", "sun", "today"], ["Tomorrow", "sunrise", "tomorrow"], ["This weekend", "calendar-days", "this weekend"], ["Next week", "arrow-right", "next week"],
    null, ["Monday", "calendar", "monday"], ["Friday", "calendar", "friday"]] },
  duration: { title: "Duration", rows: [["15 min", "clock", "15 min"], ["30 min", "clock", "30 min"], ["45 min", "clock", "45 min"], ["1 h", "clock", "1 h"], ["2 h", "clock", "2 h"]] },
  priority: { title: "Priority", rows: [["Urgent", "flag", "urgent"], ["Important", "flag", "important"], ["Whenever", "flag", "whenever"]] },
  project: { title: "Project", rows: CO_PROJECTS.map((p) => [p, "folder", p]) }
};

function CoMenu2({ open, kind, current, onPick, onClear }) {
  const [shown, leaving] = window.useExit ? window.useExit(open, 120) : [open, false];
  const [last, setLast] = React.useState(kind);
  React.useEffect(() => { if (kind) setLast(kind); }, [kind]);
  const k = kind || last;
  if (!shown || !k) return null;
  const spec = CO_PICK[k];
  return (
    <div role="menu" className={"cmp-menu nx-pop" + (leaving ? " is-leaving" : "")} onMouseDown={(e) => e.stopPropagation()}>
      <div className="cmp-menu-title">{spec.title}</div>
      {spec.rows.map((r, i) => r == null ? <span key={"s" + i} className="cmp-sep" /> : (
        <button key={r[0]} type="button" role="menuitem" className="cmp-row" onClick={() => onPick(k, r[2])}>
          <span className="shell-chip-grid" aria-hidden="true" style={{ color: k === "project" ? coHue(r[0]) : k === "priority" ? "var(--destructive)" : "var(--text-tertiary)" }}>
            <CoIcon name={r[1]} size={14} />
          </span>
          {r[0]}
          {current && current.toLowerCase() === r[0].toLowerCase() ? <span className="cmp-hint"><CoIcon name="check" size={13} /></span> : null}
        </button>
      ))}
      {current ? <>
        <span className="cmp-sep" />
        <button type="button" role="menuitem" className="cmp-row shell-menu2-row" onClick={() => onClear(k)}>
          <span className="shell-menu2-grid" aria-hidden="true"><CoIcon name="x" size={14} /></span>
          No {spec.title.toLowerCase()}
        </button>
      </> : null}
    </div>
  );
}

function CoShelf({ open, onPick }) {
  return (
    <div className={"co-shelf" + (open ? " is-open" : "")} aria-hidden={open ? undefined : "true"}>
      <div className="co-shelf-inner"><div className="co-shelf-body">
        <div className="shell-shelf-grid">
          {CO_MORE.map(([label, glyph, does, tone, ins]) => (
            <button key={label} type="button" tabIndex={open ? 0 : -1} className="cmp-row shell-shelf-row"
              onMouseDown={(e) => e.stopPropagation()} onClick={() => onPick(does, ins)}
             >
              <span className="shell-shelf-grid-2" aria-hidden="true" style={{ color: tone }}><CoIcon name={glyph} size={14} /></span>
              <span className="shell-nf-card-span">{label}</span>
            </button>
          ))}
        </div>
      </div></div>
    </div>
  );
}

/* Dictation makes several things at once, so it does not commit several things
   at once: the drafts stack above the line, you strike out the wrong ones, and
   one button accepts what is left. Undoing five things across five screens is
   the alternative, and it is much worse. */
const CO_HEARD = [
  "Finish the Q3 budget tomorrow urgent Operations",
  "Schedule the team sync friday at 10am",
  "Buy milk after work today errand"
];

function CoDrafts({ drafts, onDrop, onAccept, onCancel }) {
  return (
    <div className="base-stack">
      {drafts.map((d, i) => {
        const p = coParse(d);
        return (
          <span key={i} className="co-draft base-row shell-drafts-draft">
            <span className="shell-menu2-grid"><CoIcon name={CO_TYPES[p.type].glyph} size={14} /></span>
            <span className="shell-drafts-span">{p.title}</span>
            {p.found.date ? <CoChip tone="var(--accent)" glyph="calendar">{p.found.date.value}</CoChip> : null}
            {p.found.project ? <CoChip tone={coHue(p.found.project.value)} glyph="folder">{p.found.project.value}</CoChip> : null}
            <CoIconButton label="Drop it" variant="ghost" size="sm" onClick={() => onDrop(i)}><CoIcon name="x" size={13} /></CoIconButton>
          </span>
        );
      })}
      <span className="shell-drafts-row">
        <button type="button" className="nx-btn nx-btn-text nx-btn-sm" onClick={onCancel}>Discard</button>
        <button type="button" className="nx-btn nx-btn-primary nx-btn-sm" onClick={onAccept}>Add {drafts.length}</button>
      </span>
    </div>
  );
}

/* THE SHEET. Creating is a hurry, so it is one centred surface above a dimmed
   day: a type switch, the sentence in the title size, what the sentence was
   understood to say as chips, and a footer of pickers for what it did not say.
   It used to fly out of the chat pill along an arc with a glow; the rest of the
   app now opens its sheets in place with nx-sheet, so this one does too. The
   `from` rectangle is still accepted and simply unused. */
const CO_SEG = ["task", "event", "doc"];

function Composer({ open, onClose, onCreate, from }) {
  const [text, setText] = React.useState("");
  const [scroll, setScroll] = React.useState(0);
  const [more, setMore] = React.useState(false);
  const [menu, setMenu] = React.useState(null);
  const [note, setNote] = React.useState(null);
  const [files, setFiles] = React.useState([]);
  const [listening, setListening] = React.useState(false);
  const [drafts, setDrafts] = React.useState(null);
  const [type, setType] = React.useState(null);
  const [flight, setFlight] = React.useState(null);
  const [shown, leaving] = window.useExit ? window.useExit(open, 170) : [open, false];
  const input = React.useRef(null);
  const foot = React.useRef(null);

  const p = coParse(text);
  const kind = type || p.type;

  React.useEffect(() => {
    if (!open) { setMenu(null); setMore(false); setListening(false); return; }
    setText(""); setDrafts(null); setType(null); setNote(null); setFiles([]);
    window.setTimeout(() => { if (input.current) input.current.focus(); }, 60);
  }, [open]);

  /* A picker closes on any press outside it. */
  React.useEffect(() => {
    if (!menu) return undefined;
    function away(e) { if (foot.current && foot.current.contains(e.target)) return; setMenu(null); }
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [menu]);

  function refocus() { window.setTimeout(() => { if (input.current) input.current.focus(); }, 20); }

  function insert(snippet) {
    setMore(false);
    if (!snippet) return;
    setText((t) => (t ? t.replace(/\s+$/, "") + " " + snippet : snippet));
    refocus();
  }

  /* Cut one recognised run out of the sentence, tidying the spaces it leaves. */
  function strip(t, k) {
    const f = coParse(t).found[k];
    if (!f) return t;
    return (t.slice(0, f.at[0]) + t.slice(f.at[1])).replace(/\s{2,}/g, " ").replace(/^\s+/, "");
  }

  function pick(k, words) {
    setMenu(null);
    setText((t) => { const base = strip(t, k).replace(/\s+$/, ""); return base ? base + " " + words : words; });
    refocus();
  }

  function clear(k) {
    setMenu(null);
    setText((t) => strip(t, k));
    refocus();
  }

  function commit(str) {
    const line = (str == null ? text : str).trim();
    if (!line) return;
    const parsed = coParse(line);
    if (type) parsed.type = type;
    if (note && note.trim()) parsed.note = note.trim();
    if (files.length) parsed.files = files.slice();
    onCreate(parsed);
    setNote(null);
    setFiles([]);
    /* What was made lifts off the sheet and fades upward; the sheet stays,
       because nobody captures exactly one thing. */
    setFlight({ title: parsed.title, key: Date.now() });
    window.setTimeout(() => setFlight(null), 460);
    setText("");
    setType(null);
    setMenu(null);
    if (input.current) input.current.focus();
  }

  function hear() {
    setListening(true);
    window.setTimeout(() => { setListening(false); setDrafts(CO_HEARD.slice()); }, 1700);
  }

  if (!shown) return null;

  const chips = [];
  if (p.found.date) chips.push(["date", "calendar", "var(--accent)", p.found.date.value]);
  if (p.found.time) chips.push(["time", "clock", "var(--accent)", p.found.time.value]);
  if (p.found.duration) chips.push(["duration", "hourglass", "var(--text-tertiary)", p.found.duration.value]);
  if (p.found.deadline) chips.push(["deadline", "calendar-clock", "var(--destructive)", p.found.deadline.value]);
  if (p.found.repeat) chips.push(["repeat", "repeat", "var(--info)", p.found.repeat.value]);
  if (p.found.priority) chips.push(["priority", "flag", "var(--destructive)", p.found.priority.value]);
  if (p.found.project) chips.push(["project", "folder", coHue(p.found.project.value), p.found.project.value]);
  if (p.found.label) chips.push(["label", "tag", "var(--success)", p.found.label.value]);
  if (p.parts.length) chips.push(["parts", "list-plus", "var(--text-tertiary)", p.parts.length + (p.parts.length === 1 ? " subtask" : " subtasks")]);

  const footBtn = (k, glyph, label, value, tone) => (
    <span className="shell-mini-month-div">
      <button type="button" className={"cmp-btn" + (menu === k ? " is-open" : "") + (value ? " is-set" : "")}
        aria-haspopup="menu" aria-expanded={menu === k}
        onClick={() => { setMore(false); setMenu(menu === k ? null : k); }}>
        <span className="shell-chip-grid" aria-hidden="true" style={{ color: value ? tone : "var(--text-tertiary)" }}><CoIcon name={glyph} size={14} /></span>
        {value || label}
      </button>
      <CoMenu2 open={menu === k} kind={menu === k ? k : null} current={value}
        onPick={pick} onClear={clear} />
    </span>
  );

  return (
    <div className={"cmp-scrim nx-scrim" + (leaving ? " is-leaving" : "")} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label="New task" className={"cmp-sheet nx-sheet" + (leaving ? " is-leaving" : "")}>
        {flight ? <span key={flight.key} className="co-flight">{flight.title}</span> : null}
        <div className="cmp-body">
          <div className="base-row">
            {/* The verdict is inferred from the sentence and shown here; a click
                overrules it. A habit is never a segment — "every day" says it,
                and the repeat chip shows it. */}
            <div className="cmp-seg" role="tablist" aria-label="Kind">
              {CO_SEG.map((k) => (
                <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? "is-on" : ""}
                  onClick={() => { setType(k === p.type ? null : k); refocus(); }}>
                  <CoIcon name={CO_TYPES[k].glyph} size={13} />{k === "doc" ? "Doc" : CO_TYPES[k].label}
                </button>
              ))}
            </div>
            {kind === "habit" ? <span className="shell-composer-text">Habit, from “{p.found.repeat.value}”</span> : null}
            {!type && text.trim() && kind !== "habit" ? <span className="shell-composer-text-2">inferred</span> : null}
          </div>

          {drafts ? (
            <CoDrafts drafts={drafts}
              onDrop={(i) => setDrafts((d) => d.filter((_, j) => j !== i))}
              onAccept={() => { drafts.forEach((d) => onCreate(coParse(d))); setDrafts(null); }}
              onCancel={() => setDrafts(null)} />
          ) : null}

          {listening ? (
            <div className="shell-composer-row">
              <span className="co-bars" aria-hidden="true">{[0, 1, 2, 3, 4, 5, 6].map((i) => <i key={i} style={{ animationDelay: (i * 0.09) + "s" }} />)}</span>
              <span className="shell-composer-text-3">Listening — say everything you need to get done.</span>
              <span className="base-push">
                <CoIconButton label="Stop" variant="ghost" size="sm" onClick={() => setListening(false)}><CoIcon name="x" size={14} /></CoIconButton>
              </span>
            </div>
          ) : (
            <div className="co-line">
              <CoUnderlay text={text} taken={p.taken} scroll={scroll} />
              <input ref={input} className="co-input" value={text} spellCheck="false" aria-label="Task name"
                placeholder="New task"
                onChange={(e) => { setText(e.target.value); setScroll(e.target.scrollLeft); }}
                onScroll={(e) => setScroll(e.target.scrollLeft)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && (menu || more)) { e.preventDefault(); e.stopPropagation(); setMenu(null); setMore(false); return; }
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
                }} />
            </div>
          )}

          {/* The description: a second line in the body size — prose, not an attribute. */}
          {note != null ? (
            <div className="co-note shell-composer-note">
              <textarea className="shell-composer-textarea" autoFocus value={note} rows={2} spellCheck="false"
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape" && !note.trim()) { e.stopPropagation(); setNote(null); refocus(); } }}
                placeholder="Description"
                />
              <CoIconButton label="Drop the description" variant="ghost" size="sm" onClick={() => setNote(null)}>
                <CoIcon name="x" size={13} />
              </CoIconButton>
            </div>
          ) : null}

          {/* What the sentence was understood to say. Only what you said is here;
              what the app assumes (the day) is a quiet outline, not a chip. */}
          {chips.length || files.length || (!p.found.date && !p.found.repeat && text.trim()) ? (
            <div className="cmp-chips">
              {chips.map(([k, glyph, tone, value]) => (
                <CoChip key={k + value} tone={tone} glyph={glyph}
                  onClear={() => setText((t) => (k === "parts" ? t.split("/")[0].replace(/\s+$/, "") : strip(t, k)))}>{value}</CoChip>
              ))}
              {files.map((f, i) => (
                <CoChip key={f + i} tone="var(--text-tertiary)" glyph="paperclip"
                  onClear={() => setFiles((all) => all.filter((_, j) => j !== i))}>{f}</CoChip>
              ))}
              {!p.found.date && !p.found.repeat && text.trim() ? <CoChip quiet tone="var(--text-quaternary)" glyph="calendar">Today</CoChip> : null}
            </div>
          ) : null}

          <CoShelf open={more} onPick={(does, ins) => {
            setMore(false);
            if (does === "note") { setNote((n) => (n == null ? "" : n)); return; }
            if (does === "file") { setFiles((f) => f.concat(["Q3-roadmap.pdf"])); return; }
            insert(ins);
          }} />
        </div>

        <div className="cmp-foot" ref={foot}>
          {footBtn("date", "calendar", "Date", p.found.date ? p.found.date.value : null, "var(--accent)")}
          {footBtn("duration", "clock", "Duration", p.found.duration ? p.found.duration.value : null, "var(--text-secondary)")}
          {footBtn("project", "folder", "Project", p.found.project ? p.found.project.value : null, p.found.project ? coHue(p.found.project.value) : null)}
          {footBtn("priority", "flag", "Priority", p.found.priority ? p.found.priority.value : null, "var(--destructive)")}
          <CoTooltip label="More" side="top">
            <button type="button" className={"cmp-btn cmp-icon" + (more ? " is-open" : "")} aria-label="More"
              onClick={() => { setMenu(null); setMore(!more); }}><CoIcon name="ellipsis" size={15} /></button>
          </CoTooltip>
          <CoTooltip label="Say several at once" side="top">
            <button type="button" className="cmp-btn cmp-icon" aria-label="Dictate" onClick={hear}><CoIcon name="audio-lines" size={14} /></button>
          </CoTooltip>
          <span className="shell-composer-row-2">
            <button type="button" className="nx-btn nx-btn-text" onClick={onClose}>Cancel</button>
            <button type="button" className="nx-btn nx-btn-primary cmp-go" disabled={!text.trim()} onClick={() => commit()}>
              {kind === "event" ? "Add event" : kind === "doc" ? "Add doc" : kind === "habit" ? "Add habit" : "Add task"}<kbd className="cmp-kbd" aria-hidden="true">↵</kbd>
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Composer, CO_MORE, coParse, CO_PROJECTS, CO_LABELS });
