/* The week's brief — a canvas that three kinds of author write on: you, Needt,
 * and whatever agents are connected over MCP. Authorship is carried by the
 * text colour and by the mark in the left margin, so a paragraph says who
 * wrote it without a label.
 *
 * The canvas is free: objects sit where they were put, and anything new lands
 * in the first clear space rather than on top of what is already there. It
 * grows downward — the page scrolls, the canvas does not.
 */
const { Icon, IconButton, Tooltip, Checkbox, Menu, MenuItem, MenuLabel } = window.NeedtDesignSystem_25d3c8;

const AUTHORS = {
  you:    { name: "You", icon: "user", color: "var(--text-primary)", mark: "var(--text-quaternary)" },
  needt:  { name: "Needt", icon: "sparkles", color: "var(--accent)", mark: "var(--accent)" },
  linear: { name: "Linear", icon: "folder-kanban", color: "var(--info)", mark: "var(--info)" },
  github: { name: "GitHub", icon: "code", color: "var(--success)", mark: "var(--success)" }
};

/* Written by Needt, character by character, the way it actually arrives. */
function Typed({ text, color, speed, onDone }) {
  /* Reduced motion: the whole text is there at once. */
  const [n, setN] = React.useState(() => (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) ? text.length : 0);
  React.useEffect(() => {
    if (n >= text.length) { if (onDone) onDone(); return undefined; }
    const id = window.setTimeout(() => setN(n + 1), speed || 18);
    return () => window.clearTimeout(id);
  }, [n, text]);
  return (
    <span style={{ color: color }}>
      {text.slice(0, n)}
      {n < text.length ? <span className="brief-caret" /> : null}
    </span>
  );
}

function AuthorMark({ author }) {
  const a = AUTHORS[author] || AUTHORS.you;
  if (author === "you") return null;
  return (
    <Tooltip label={a.name} side="left">
      <span className="shell-brief-author-mark-grid" style={{ color: a.mark }}>
        {author === "needt" && window.AiOrb ? <window.AiOrb size={18} /> : <Icon name={a.icon} size={14} />}
      </span>
    </Tooltip>
  );
}

function Body({ o, typing, onTyped }) {
  const a = AUTHORS[o.author] || AUTHORS.you;
  if (o.kind === "heading") {
    return <span className="shell-brief-body-text" style={{ color: a.color }}>{o.text}</span>;
  }
  if (o.kind === "text") {
    return (
      <p className="shell-brief-body-text-2" style={{ color: a.color }}>
        {typing ? <Typed text={o.text} color={a.color} onDone={onTyped} /> : o.text}
      </p>
    );
  }
  if (o.kind === "checklist") {
    return (
      <span className="base-stack">
        {o.items.map((it, i) => <Checkbox key={i} checked={it.done} label={it.label} onChange={() => {}} />)}
      </span>
    );
  }
  if (o.kind === "metric") {
    return (
      <span className="base-stack">
        <span className="display shell-brief-body-display" style={{ color: a.color }}>{o.value}</span>
        <span className="base-meta-muted">{o.caption}</span>
      </span>
    );
  }
  if (o.kind === "marey") {
    const days = o.days || ["M", "T", "W", "T", "F", "S", "S"];
    const total = o.total || 20;
    const actual = o.actual || [];
    const W = 100, H = 100;
    /* The plan is a straight line because an even rate is a straight line —
       nothing is being modelled, the geometry IS the claim. */
    const px = (i) => (i / (days.length - 1)) * W;
    const py = (v) => H - (v / total) * H;
    const fact = actual.map((v, i) => px(i) + "," + py(v)).join(" ");
    const done = actual.length ? actual[actual.length - 1] : 0;
    const owed = (done / total) * 100;
    const should = ((actual.length - 1) / (days.length - 1)) * 100;
    const behind = Math.round(should - owed);
    return (
      <span className="shell-brief-body-stack">
        <span className="shell-nf-card-row-2">
          <span className="display shell-brief-body-display-2" style={{ color: a.color }}>{done}<span className="shell-brief-body-span">/{total}</span></span>
          {/* The verdict in words, because an angle is read but not quoted. */}
          <span className="shell-notes-panel-text-6" style={{ color: behind > 6 ? "var(--destructive)" : "var(--text-muted)" }}>
            {behind > 6 ? behind + "% behind the even rate" : "on the rate"}
          </span>
        </span>
        <span className="shell-brief-body-span-2">
          <svg className="shell-brief-body-svg" viewBox={"0 0 " + W + " " + H} preserveAspectRatio="none" width="100%" height="96">
            {/* The wedge between plan and fact — the thing actually being
                looked at, so it is the only filled area. */}
            {actual.length > 1 ? (
              <polygon points={"0,100 " + fact + " " + px(actual.length - 1) + "," + py((total * (actual.length - 1)) / (days.length - 1))}
                fill={behind > 6 ? "var(--destructive)" : a.color} opacity="0.14" />
            ) : null}
            <line x1="0" y1={H} x2={W} y2="0" stroke="var(--text-disabled)" strokeWidth="1"
              strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            {actual.length > 1 ? (
              <polyline points={fact} fill="none" stroke={behind > 6 ? "var(--destructive)" : a.color}
                strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ) : null}
            {actual.map((v, i) => (
              <circle key={i} cx={px(i)} cy={py(v)} r="2.5" fill={behind > 6 ? "var(--destructive)" : a.color}
                vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        </span>
        <span className="shell-brief-body-row">
          {days.map((d, i) => (
            <span className="shell-notes-panel-text-6" key={i} style={{ color: i < actual.length ? "var(--text-tertiary)" : "var(--text-disabled)" }}>{d}</span>
          ))}
        </span>
      </span>
    );
  }
  if (o.kind === "card") {
    return (
      <span className="shell-brief-body-row-2">
        <span className="shell-brief-body-span-3" style={{ background: o.tone || "var(--info)" }} />
        <span className="shell-brief-body-stack-2">
          <span className="base-strong">{o.title}</span>
          <span className="shell-brief-body-text-3">{o.meta}</span>
        </span>
      </span>
    );
  }
  if (o.kind === "quote") {
    return (
      <span className="shell-brief-body-stack-3">
        <span className="shell-brief-body-text-4">{o.text}</span>
        <span className="base-meta-muted">{o.source}</span>
      </span>
    );
  }
  if (o.kind === "image") {
    return (
      <span className="shell-brief-body-grid" style={{ width: o.w || 260, height: o.h || 150 }}>
        <Icon name="image" size={24} />
      </span>
    );
  }
  if (o.kind === "drawing") {
    return (
      <span className="shell-brief-body-span-4" style={{ width: o.w || 220, height: o.h || 120 }}>
        <svg viewBox="0 0 220 120" width="100%" height="100%" aria-label="Sketch">
          <path d={o.path} fill="none" stroke="var(--text-quaternary)" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  if (o.kind === "email") {
    return (
      <span className="shell-brief-body-stack-4" style={{ width: o.w || 320 }}>
        <span className="base-row shell-brief-body-row-3">
          <Icon name="mail" size={14} />
          <span className="shell-brief-body-text-5">Draft</span>
          <span className="shell-brief-body-text-6">Send</span>
        </span>
        <span className="shell-brief-body-stack-5">
          <span className="shell-bug-sheet-text">To {o.to}</span>
          <span className="base-strong">{o.subject}</span>
          <span className="base-meta shell-day-menu-text">{o.body}</span>
        </span>
      </span>
    );
  }
  return null;
}

const TOOLS = [
  ["text", "type", "Text"],
  ["checklist", "list-checks", "Checklist"],
  ["image", "image", "Image"],
  ["drawing", "pen-line", "Drawing"],
  ["card", "circle", "Task or event"],
  ["metric", "hash", "Number of the week"],
  ["marey", "trending-up", "Plan against fact"],
  ["email", "mail", "Email draft"],
  ["quote", "quote", "Quote"]
];

/* Laid out as a document at rest — words down the left, material in the
   margin — but every object is free: drag it, drop a new one anywhere, and
   the canvas keeps it where you put it. */
const SEED = [
  { id: "o1", kind: "heading", author: "you", x: 40, y: 32, w: 460, text: "Week 36 — the September batch" },
  { id: "o2", kind: "text", author: "you", x: 40, y: 72, w: 460,
    text: "Legal sign-off is the only thing between us and the factory. Everything else can move." },
  { id: "o4", kind: "text", author: "needt", x: 40, y: 148, w: 460, typed: true,
    text: "Three tasks are unplaced and 18 hours are open. Two of them fit before Thursday — say the word and I will place them." },
  { id: "o5", kind: "checklist", author: "you", x: 40, y: 248, w: 300, items: [
    { label: "Ask counsel for a date", done: true },
    { label: "Send the print files", done: false },
    { label: "Confirm the courier", done: false }
  ] },
  { id: "o6", kind: "card", author: "linear", x: 40, y: 372, w: 300, title: "Print files to the factory", meta: "8–9 Sep · blocked", tone: "var(--info)" },
  { id: "o7", kind: "quote", author: "you", x: 40, y: 452, w: 380,
    text: "Density over comfort — whitespace that costs a visible row costs a scroll.", source: "Needt design rules" },
  { id: "m1", kind: "metric", author: "needt", x: 600, y: 32, w: 240, value: "18 h", caption: "free this week, Monday to Friday" },
  { id: "m2", kind: "image", author: "you", x: 600, y: 140, w: 268, h: 160 },
  { id: "m3", kind: "drawing", author: "you", x: 600, y: 328, w: 268, h: 130, path: "M20 100 C 60 24, 120 118, 168 60 S 230 20, 250 48" },
  { id: "m4", kind: "email", author: "github", x: 600, y: 484, w: 300,
    to: "anna@needt.app", subject: "Sign-off — where are we", body: "Short note: we need a date, not an answer." }
];

const LOG = [
  ["Legal came back: sign-off possible, no date yet", "Fri, 16:45"],
  ["Print files finished — waiting on the factory to confirm the run", "Thu, 11:20"],
  ["Courier quote in: two days cheaper than the old one", "Wed, 09:05"],
  ["Batch photographed, three items still unlisted", "Tue, 18:30"],
  ["Week planned: 18 free hours, 3 tasks unplaced", "Mon, 08:40"]
];

/* THE WRITING LAYER — the brief is not a report you read, it is a page you
   write on. Every block with words is editable in place; a slash opens the
   block menu at the caret; selecting text raises the mark bar over it.
   The blocks are the same objects the canvas holds, so a line written here is
   an object there. */

/* One editable block. It is uncontrolled while the caret is in it — writing
   back on every keystroke would move the caret to the end of the line — and
   reconciles with its object on blur and whenever the object changes from
   somewhere else. */
function Editable({ html, placeholder, tag, style, onCommit, onSlash, onEnter, onEmptyBackspace }) {
  const el = React.useRef(null);
  const Tag = tag || "div";
  React.useEffect(() => {
    if (el.current && document.activeElement !== el.current && el.current.innerHTML !== (html || "")) {
      el.current.innerHTML = html || "";
    }
  }, [html]);
  return (
    <Tag ref={el} className="prose-block" contentEditable suppressContentEditableWarning data-ph={placeholder}
      style={Object.assign({ outline: "none", minHeight: "1em" }, style)}
      onBlur={() => onCommit && onCommit(el.current.innerHTML)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && onEnter) { e.preventDefault(); onCommit && onCommit(el.current.innerHTML); onEnter(); }
        if (e.key === "Backspace" && onEmptyBackspace && !el.current.innerText.trim()) { e.preventDefault(); onEmptyBackspace(); }
      }}
      onKeyUp={(e) => {
        if (e.key !== "/" || !onSlash) return;
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const r = sel.getRangeAt(0).getBoundingClientRect();
        onSlash({ x: r.left || 0, y: (r.bottom || 0) + 6, node: el.current });
      }} />
  );
}

/* The block menu. It lists what a brief can hold, in the order a person
   reaches for them, and it is the same list the canvas toolbar carries. */
const PROSE_BLOCKS = [
  ["text", "type", "Text"],
  ["heading", "heading", "Heading"],
  ["checklist", "list-checks", "Checklist"],
  ["quote", "quote", "Quote"],
  ["card", "circle", "Task or event"],
  ["metric", "hash", "Number"],
  ["marey", "trending-up", "Plan against fact"],
  ["email", "mail", "Email draft"]
];

function SlashMenu({ at, onPick, onClose }) {
  React.useEffect(() => {
    function away() { onClose(); }
    function esc(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [onClose]);
  return ReactDOM.createPortal(
    <div className="shell-brief-slash-menu-layer" style={{ left: Math.min(at.x, window.innerWidth - 248), top: Math.min(at.y, window.innerHeight - 300) }}
      onMouseDown={(e) => e.preventDefault()}>
      <Menu width={240}>
        <MenuLabel>Insert</MenuLabel>
        {PROSE_BLOCKS.map(([kind, icon, label]) => (
          <MenuItem key={kind} icon={<Icon name={icon} size={14} />} onClick={() => onPick(kind)}>{label}</MenuItem>
        ))}
      </Menu>
    </div>, document.body);
}

/* The mark bar. It appears over a selection and nowhere else, carries only
   what applies to a run of words, and is the one pill-radius surface the
   system allows besides the toggle group. */
function BriefSelectionBar({ scope }) {
  const [rect, setRect] = React.useState(null);
  React.useEffect(() => {
    function read() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return setRect(null);
      const node = sel.anchorNode;
      if (!node || !scope.current || !scope.current.contains(node.nodeType === 1 ? node : node.parentNode)) return setRect(null);
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (!r.width && !r.height) return setRect(null);
      setRect(r);
    }
    document.addEventListener("selectionchange", read);
    return () => document.removeEventListener("selectionchange", read);
  }, [scope]);
  if (!rect) return null;
  const mark = (cmd, value) => (e) => { e.preventDefault(); document.execCommand(cmd, false, value); };
  const items = [["bold", "bold", "Bold"], ["italic", "italic", "Italic"], ["strikeThrough", "strikethrough", "Strike"], ["insertUnorderedList", "list", "List"]];
  return ReactDOM.createPortal(
    <div className="mark-bar shell-brief-selection-bar-mark-bar" onMouseDown={(e) => e.preventDefault()}
      style={{ left: Math.max(8, Math.min(rect.left + rect.width / 2 - 96, window.innerWidth - 200)), top: Math.max(8, rect.top - 44) }}>
      {items.map(([cmd, icon, label]) => (
        <IconButton key={cmd} label={label} variant="ghost" size="sm" onClick={mark(cmd)}><Icon name={icon} size={14} /></IconButton>
      ))}
      <span className="shell-brief-selection-bar-bar" aria-hidden="true" />
      <IconButton label="Link" variant="ghost" size="sm" onClick={(e) => { e.preventDefault();
        const href = window.prompt("Link to"); if (href) document.execCommand("createLink", false, href); }}>
        <Icon name="link" size={14} />
      </IconButton>
      <IconButton label="Clear marks" variant="ghost" size="sm" onClick={mark("removeFormat")}><Icon name="eraser" size={14} /></IconButton>
    </div>, document.body);
}

/* THE PROSE VIEW — the same brief written rather than arranged. It reads as a
   document: a title, the week in two sentences, the log with its times in the
   right margin, and the actions inline where you decide on them. Objects that
   carry material (image, drawing) belong to the canvas and do not appear here;
   everything with words does. */
function ProseBrief({ objects, onToggleItem, marks, timeline, onEdit, onAdd, onRemove, onCloseWeek }) {
  const heading = objects.filter((o) => o.kind === "heading")[0];
  const texts = objects.filter((o) => o.kind === "text" && !o.tail);
  const metric = objects.filter((o) => o.kind === "metric")[0];
  const list = objects.filter((o) => o.kind === "checklist" && !o.tail)[0];
  const cards = objects.filter((o) => (o.kind === "card" || o.kind === "email") && !o.tail);
  const tail = objects.filter((o) => o.tail);
  const sheet = React.useRef(null);
  const [slash, setSlash] = React.useState(null);

  /* A slash asks for a block; picking one takes the slash back out of the
     line it was typed on, so the page never keeps the command. */
  function pick(kind) {
    if (slash && slash.node) {
      slash.node.innerHTML = slash.node.innerHTML.replace(/\/$/, "");
      if (slash.id) onEdit(slash.id, slash.node.innerHTML);
    }
    setSlash(null);
    onAdd(kind);
  }

  return (
    /* The brief is a sheet of paper on a desk: a raised surface with real
       margins, the way a document reads, not text loose on the app ground. */
    <article ref={sheet} className="prose-sheet shell-brief-prose-brief-prose-sheet">
      <BriefSelectionBar scope={sheet} />
      {slash ? <SlashMenu at={slash} onPick={pick} onClose={() => setSlash(null)} /> : null}
      <header className="shell-brief-prose-brief-row">
        {window.AiOrb ? <Tooltip label="Needt writes this brief with you" side="bottom"><span className="shell-brief-orb"><window.AiOrb size={28} /></span></Tooltip> : null}
        <Editable tag="h2" html={heading ? heading.text : "Week 36 — the September batch"} placeholder="Name the week"
          style={{ margin: 0, flex: 1, minWidth: 0, font: "var(--type-page-title)", color: "var(--text-primary)", textWrap: "pretty" }}
          onCommit={(v) => heading && onEdit(heading.id, v)}
          onSlash={(at) => setSlash(Object.assign({ id: heading && heading.id }, at))} />
        {metric ? (
          <span className="shell-brief-prose-brief-stack">
            <span className="display shell-brief-prose-brief-display">{metric.value}</span>
            <span className="base-meta-muted shell-brief-prose-brief-text">free, Monday to Friday</span>
          </span>
        ) : null}
      </header>

      <div className="shell-focus-control-stack-3">
        {texts.map((o) => (
          <Editable key={o.id} tag="p" html={o.text} placeholder="Write, or press / for a block"
            style={{ margin: 0, font: "var(--type-body)", color: marks === false ? "var(--text-primary)" : (AUTHORS[o.author] || AUTHORS.you).color, textWrap: "pretty" }}
            onCommit={(v) => onEdit(o.id, v)}
            onSlash={(at) => setSlash(Object.assign({ id: o.id }, at))}
            onEnter={() => onAdd("text")} />
        ))}
      </div>

      <section className="shell-brief-prose-brief-stack-2" style={{ display: timeline === false ? "none" : "flex" }}>
        <span className="base-meta-muted">Timeline</span>
        <div className="shell-sidebar-sb-connections">
          {LOG.map((e, i) => (
            <div className="shell-brief-prose-brief-row-2" key={e[1]}>
              {/* The dot and the rule are one mark: entries belong to one thread. */}
              <span className="shell-brief-prose-brief-layer" aria-hidden="true" />
              {i < LOG.length - 1 ? <span className="shell-brief-prose-brief-layer-2" aria-hidden="true" /> : null}
              <span className="shell-brief-prose-brief-span">{e[0]}</span>
              <span className="shell-brief-prose-brief-span-2">{e[1]}</span>
            </div>
          ))}
        </div>
      </section>

      {list ? (
        <section className="shell-focus-control-stack-2">
          <span className="base-meta-muted">Open</span>
          <div className="base-stack">
            {list.items.map((it, i) => (
              <span className="base-row shell-brief-prose-brief-row-3" key={list.id + i}>
                <Checkbox checked={it.done} onChange={() => onToggleItem(list.id, i)} style={{ minHeight: 0 }} />
                <Editable html={it.label} placeholder="A thing to close"
                  style={{ flex: 1, minWidth: 0, font: "var(--type-body)", color: it.done ? "var(--text-muted)" : "var(--text-primary)", textDecoration: it.done ? "line-through" : "none", textWrap: "pretty" }}
                  onCommit={(v) => onEdit(list.id, v, i)} />
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {cards.length ? (
        <section className="shell-brief-prose-brief-stack-3">
          <span className="base-meta-muted">Actions</span>
          {cards.map((o) => (
            <div className="shell-brief-prose-brief-row-4" key={o.id}>
              {marks === false ? null : <AuthorMark author={o.author} />}
              <div className="shell-brief-prose-brief-div"><Body o={o} /></div>
            </div>
          ))}
        </section>
      ) : null}

      {/* What gets written today lands here, in the order it was written. */}
      {tail.length ? (
        <div className="shell-focus-control-stack-3">
          {tail.map((o) => (
            o.kind === "text" || o.kind === "heading" || o.kind === "quote" ? (
              <Editable key={o.id} tag={o.kind === "heading" ? "h3" : "p"} html={o.text} placeholder={o.kind === "heading" ? "Heading" : "Write, or press / for a block"}
                style={o.kind === "heading"
                  ? { margin: 0, font: "var(--type-card-title)", color: "var(--text-primary)" }
                  : o.kind === "quote"
                  ? { margin: 0, paddingLeft: 11, boxShadow: "var(--border) 1px 0 0 0 inset", font: "var(--type-body)", fontStyle: "italic", color: "var(--text-secondary)" }
                  : { margin: 0, font: "var(--type-body)", color: "var(--text-primary)", textWrap: "pretty" }}
                onCommit={(v) => onEdit(o.id, v)}
                onSlash={(at) => setSlash(Object.assign({ id: o.id }, at))}
                onEnter={() => onAdd("text")}
                onEmptyBackspace={() => onRemove(o.id)} />
            ) : (
              <div className="shell-brief-prose-brief-div-2" key={o.id}><Body o={o} onToggleItem={onToggleItem} /></div>
            )
          ))}
        </div>
      ) : null}

      {/* THE SHEET — the page keeps going under what is written. It is real
          paper: a hairline where the written part ends, then blank space that
          takes a caret wherever you click it. Clicking does not stack empty
          lines — if the last thing written is already an empty one, the caret
          goes back into it. */}
      <div className="shell-brief-prose-brief-div-3" onClick={() => {
        const last = tail[tail.length - 1];
        if (last && last.kind === "text" && !(last.text || "").replace(/<[^>]*>/g, "").trim()) {
          const nodes = document.querySelectorAll(".prose-sheet .prose-block");
          if (nodes.length) { nodes[nodes.length - 1].focus(); return; }
        }
        onAdd("text");
      }}
       >
        {tail.length ? null : (
          <span className="shell-brief-prose-brief-text-2">Write, or press / for a block</span>
        )}
      </div>
      {onCloseWeek ? (
        <div className="shell-brief-prose-brief-row-5">
          <button className="shell-brief-prose-brief-row-6" type="button" onClick={(e) => { e.stopPropagation(); onCloseWeek(); }}
           >
            <Icon name="wand-sparkles" size={14} />Close the week
          </button>
          <span className="base-meta-muted shell-brief-prose-brief-span-3">
            Needt writes what the week came to, in its own ink — you edit it like anything else here.
          </span>
        </div>
      ) : null}
    </article>
  );
}

function Brief({ form: formProp, onForm, marks, timeline }) {
  const [objects, setObjects] = React.useState(SEED);
  /* Prose is the resting state; the canvas is the second gear. The screen owns
     the choice when it cares — Today hides its date plate in prose. */
  const [ownForm, setOwnForm] = React.useState("prose");
  const form = formProp || ownForm;
  const head = React.useRef(null);
  const [tool, setTool] = React.useState(null);
  const [editing, setEditing] = React.useState(null);
  const [draft, setDraft] = React.useState("");
  const [typedDone, setTypedDone] = React.useState({});
  const [selected, setSelected] = React.useState(null);
  const [held, setHeld] = React.useState(null);
  const canvas = React.useRef(null);
  const widthOf = () => (canvas.current ? canvas.current.getBoundingClientRect().width : 1000);
  const bottom = objects.reduce((m, o) => Math.max(m, o.y + (o.h || 120)), 0);

  React.useEffect(() => {
    function key(e) {
      if (!selected || editing) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      e.preventDefault();
      setObjects((l) => l.filter((o) => o.id !== selected));
      setSelected(null);
    }
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [selected, editing]);

  /* Objects are dragged by their own body; the canvas keeps them inside
     itself and on an 8px grid, so a hand-placed canvas still lines up. */
  React.useEffect(() => {
    if (!held) return undefined;
    function move(e) {
      const r = canvas.current.getBoundingClientRect();
      const o = objects.filter((x) => x.id === held.id)[0];
      if (!o) return;
      const x = Math.max(8, Math.min(Math.round((e.clientX - r.left - held.dx) / 8) * 8, r.width - (o.w || 240) - 8));
      const y = Math.max(8, Math.round((e.clientY - r.top - held.dy) / 8) * 8);
      setObjects((l) => l.map((it) => (it.id === held.id ? Object.assign({}, it, { x: x, y: y }) : it)));
    }
    function up() { setHeld(null); }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [held, objects]);

  function freeSpotFor(w, h) {
    const right = widthOf() - w - 24;
    for (let y = 32; y < bottom + 400; y += 24) {
      for (let x = 40; x < right; x += 24) {
        const clash = objects.some((o) => !(x + w < o.x - 16 || x > o.x + (o.w || 240) + 16 || y + h < o.y - 16 || y > o.y + (o.h || 110) + 16));
        if (!clash) return { x: x, y: y };
      }
    }
    return { x: 40, y: bottom + 32 };
  }

  /* Editing a block is editing its object: the prose view and the canvas are
     two readings of one list, never two copies of it. */
  function editObject(id, value, index) {
    setObjects((l) => l.map((o) => {
      if (o.id !== id) return o;
      if (index != null && o.items) return Object.assign({}, o, { items: o.items.map((it, i) => (i === index ? Object.assign({}, it, { label: value }) : it)) });
      return Object.assign({}, o, { text: value });
    }));
  }
  function removeObject(id) { setObjects((l) => l.filter((o) => o.id !== id)); }
  /* A block written in the flow is tagged so prose keeps it in writing order,
     and it still takes a place on the canvas. */
  function addToFlow(kind) {
    const id = "w" + Date.now();
    const y = objects.reduce((m, o) => Math.max(m, o.y + (o.h || 120)), 0) + 20;
    const base = { id: id, kind: kind, author: "you", x: 40, y: y, w: 460, tail: true };
    setObjects((l) => l.concat([
      kind === "checklist" ? Object.assign(base, { items: [{ label: "", done: false }] })
      : kind === "metric" ? Object.assign(base, { value: "0", caption: "what this counts" })
      : kind === "marey" ? Object.assign(base, { total: 20, actual: [0, 3, 5, 8, 9] })
      : kind === "card" ? Object.assign(base, { title: "Pick a task", meta: "no date" })
      : kind === "email" ? Object.assign(base, { to: "someone@needt.app", subject: "Subject", body: "" })
      : kind === "quote" ? Object.assign(base, { text: "", source: "" })
      : Object.assign(base, { text: "" })
    ]));
    window.setTimeout(() => {
      const nodes = document.querySelectorAll(".prose-sheet .prose-block");
      const last = nodes[nodes.length - 1];
      if (last) { last.focus(); }
    }, 30);
  }

  function closeWeek() {
    const now = Date.now();
    const y = objects.reduce((m, o) => Math.max(m, o.y + (o.h || 120)), 0) + 28;
    const lists = objects.filter((o) => o.kind === "checklist");
    const items = lists.reduce((all, o) => all.concat(o.items || []), []);
    const kept = items.filter((i) => i.done);
    const over = items.filter((i) => !i.done);
    const closed = kept.length;
    const total = items.length || 1;
    const pace = Math.round((closed / total) * 100);

    const line = closed
      ? "Closed " + closed + " of " + total + " — " + pace + "% of the week. "
        + (over.length ? over.length + (over.length === 1 ? " thing did not move: " : " things did not move: ")
          + over.map((i) => i.label).join(", ") + ". They carry into next week unless you drop them." : "Nothing carried over.")
      : "Nothing was closed this week. Everything on the list carries over.";

    setObjects((l) => l.concat([
      { id: "w" + now, kind: "heading", author: "needt", x: 40, y: y, w: 460, tail: true, text: "Week 36 — closed" },
      { id: "w" + (now + 1), kind: "text", author: "needt", x: 40, y: y + 44, w: 460, tail: true, typed: true, text: line },
      { id: "w" + (now + 2), kind: "marey", author: "needt", x: 520, y: y, w: 300, tail: true,
        total: total, actual: [0, Math.round(closed * 0.2), Math.round(closed * 0.45), Math.round(closed * 0.7), closed] },
      over.length ? { id: "w" + (now + 3), kind: "checklist", author: "needt", x: 40, y: y + 130, w: 300, tail: true,
        items: over.map((i) => ({ label: i.label, done: false })) } : null
    ].filter(Boolean)));
    /* The eye should be on the sentence being written, so the brief's own
       scroller goes to its end. */
    window.setTimeout(() => {
      const sc = document.querySelector(".brief-scroll");
      if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: "smooth" });
    }, 40);
  }

  function add(kind, at) {
    const w = kind === "metric" ? 240 : kind === "marey" ? 300 : kind === "image" || kind === "drawing" ? 268 : 320;
    const spot = at || freeSpotFor(w, 120);
    const id = "n" + Date.now();
    const base = { id: id, kind: kind, author: "you", x: spot.x, y: spot.y, w: w };
    const filled =
      kind === "text" || kind === "heading" ? Object.assign(base, { text: "" })
      : kind === "checklist" ? Object.assign(base, { items: [{ label: "New item", done: false }] })
      : kind === "metric" ? Object.assign(base, { value: "0", caption: "what this counts" })
      : kind === "marey" ? Object.assign(base, { total: 20, actual: [0, 3, 5, 8, 9] })
      : kind === "card" ? Object.assign(base, { title: "Pick a task", meta: "no date" })
      : kind === "quote" ? Object.assign(base, { text: "A line worth keeping.", source: "Source" })
      : kind === "email" ? Object.assign(base, { to: "someone@needt.app", subject: "Subject", body: "…" })
      : kind === "drawing" ? Object.assign(base, { h: 130, path: "M20 100 C 60 30, 120 110, 250 44" })
      : Object.assign(base, { h: 160 });
    setObjects((l) => l.concat([filled]));
    if (kind === "text" || kind === "heading") { setEditing(id); setDraft(""); }
    setTool(null);
  }

  function onCanvas(e) {
    if (e.target !== e.currentTarget) return;
    setSelected(null);
    const r = e.currentTarget.getBoundingClientRect();
    const kind = tool || "text";
    const w = kind === "metric" ? 240 : kind === "marey" ? 300 : kind === "image" || kind === "drawing" ? 268 : 320;
    const at = {
      x: Math.max(16, Math.min(Math.round((e.clientX - r.left) / 8) * 8, r.width - w - 16)),
      y: Math.max(16, Math.round((e.clientY - r.top) / 8) * 8)
    };
    add(kind, at);
  }

  function commit(id) {
    const text = draft.trim();
    setObjects((l) => {
      const o = l.filter((x) => x.id === id)[0];
      if (!text && (!o || !o.text)) return l.filter((x) => x.id !== id);
      return l.map((x) => (x.id === id
        ? Object.assign({}, x, {
            text: text.indexOf("/") === 0 ? text.slice(1).trim() : (text || x.text),
            kind: text.indexOf("/") === 0 ? "heading" : x.kind
          })
        : x));
    });
    setEditing(null);
    setDraft("");
  }

  function toggleItem(id, i) {
    setObjects((l) => l.map((o) => (o.id === id
      ? Object.assign({}, o, { items: o.items.map((it, j) => (j === i ? Object.assign({}, it, { done: !it.done }) : it)) })
      : o)));
  }

  return (
    <section className="shell-brief-stack">
      <div className="shell-brief-div" ref={head}></div>
      {form === "prose" ? <ProseBrief objects={objects} onToggleItem={toggleItem} marks={marks} timeline={timeline}
        onEdit={editObject} onAdd={addToFlow} onRemove={removeObject} onCloseWeek={closeWeek} /> : (
    <div className="shell-brief-row">
      <div className="base-stack shell-brief-stack-2">
        {TOOLS.map(([kind, icon, label]) => (
          <Tooltip key={kind} label={label} side="right">
            <IconButton label={label} variant={tool === kind ? "accent" : "ghost"} onClick={() => setTool(tool === kind ? null : kind)}>
              <Icon name={icon} size={16} />
            </IconButton>
          </Tooltip>
        ))}
        <span className="shell-brief-bar" aria-hidden="true" />
        <Tooltip label="Close the week — Needt writes the summary" side="right">
          <IconButton label="Close the week" variant="ghost" onClick={closeWeek}>
            <Icon name="wand-sparkles" size={16} />
          </IconButton>
        </Tooltip>
      </div>

      <div className="shell-brief-div-2" ref={canvas} onClick={onCanvas}
        style={{ height: bottom + 160, cursor: tool ? "copy" : "text" }}>
        {objects.map((o) => {
          const a = AUTHORS[o.author] || AUTHORS.you;
          return (
            <div key={o.id} className="group shell-brief-group"
              onClick={(e) => { e.stopPropagation(); setSelected(o.id); }}
              onPointerDown={(e) => {
                if (editing === o.id || e.button !== 0) return;
                const r = canvas.current.getBoundingClientRect();
                setHeld({ id: o.id, dx: e.clientX - r.left - o.x, dy: e.clientY - r.top - o.y });
              }}
              style={{ left: o.x, top: o.y, width: o.w, cursor: held && held.id === o.id ? "grabbing" : "default", boxShadow: selected === o.id ? "var(--shadow-focus)" : "none", opacity: held && held.id === o.id ? 0.85 : 1 }}>
              <AuthorMark author={o.author} />
              <div className="shell-nf-card-stack">
                {editing === o.id ? (
                  <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commit(o.id)} onKeyDown={(e) => { if (e.key === "Enter") commit(o.id); }}
                    placeholder="Write, or / for a heading"
                    className="nt-input nt-input-plain shell-brief-nt-input"
                    style={{ color: a.color }} />
                ) : (
                  <Body o={o} typing={o.typed && !typedDone[o.id]} onTyped={() => setTypedDone((d) => Object.assign({}, d, { [o.id]: true }))} />
                )}
              </div>
              <span className="reveal-on-hover shell-brief-reveal-on-hover">
                <IconButton label="Remove" variant="ghost"
                  onClick={(e) => { e.stopPropagation(); setObjects((l) => l.filter((x) => x.id !== o.id)); setSelected(null); }}>
                  <Icon name="x" size={13} />
                </IconButton>
              </span>
            </div>
          );
        })}

        <div className="base-row shell-brief-layer">
          {["needt", "linear", "github"].map((k) => (
            <Tooltip key={k} label={AUTHORS[k].name + " can write here"} side="top">
              <span className="shell-brief-grid" style={{ color: AUTHORS[k].mark }}>
                {k === "needt" && window.AiOrb ? <window.AiOrb size={18} /> : <Icon name={AUTHORS[k].icon} size={13} />}
              </span>
            </Tooltip>
          ))}
          <span className="base-meta-muted">write here too</span>
        </div>
      </div>
    </div>
      )}
    </section>
  );
}

/* Body is exported so the object inventory can draw canvas objects through the
   product's own renderer instead of redrawing them. */
/* The miniatures are exported so the screen's own settings popover can show the
   forms rather than name them. */
Object.assign(window, { Brief, ProseBrief, Body, AUTHORS });
