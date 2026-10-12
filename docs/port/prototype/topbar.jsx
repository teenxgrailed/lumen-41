/* TOP RIGHT — the bell and the help mark on every screen (06.10.26, from
   Craft): Notifications with Activity / Reminders, a "…" or "+" per tab, an
   empty state drawn in the page's own parts; Help as a short list with What's
   new marked by a dot until it is opened. */
const TbNS = window.NeedtDesignSystem_25d3c8;
const { Icon: TbIcon, Avatar: TbAvatar, Tooltip: TbTooltip } = TbNS;

/* A panel anchored under its trigger, portalled so nothing clips it. */
function useAnchored(open, align, gap) {
  const ref = React.useRef(null);
  const [at, setAt] = React.useState(null);
  React.useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setAt(align === "right" ? { right: window.innerWidth - r.right, top: r.bottom + (gap || 8) } : { left: r.left, top: r.bottom + (gap || 8) });
  }, [open]);
  return [ref, at];
}
function useAway(open, refs, close) {
  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (refs.every((r) => !r.current || !r.current.contains(e.target))) close(); };
    const esc = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
}
function Dot({ show }) {
  return <span className="shell-dot-layer" aria-hidden="true" style={{ transform: show ? "scale(1)" : "scale(0)" }} />;
}
/* Background only when open, so .tb-icon:hover (TB_CSS) can show through. */
const iconBtn = (on) => ({ position: "relative", width: 32, height: 32, display: "grid", placeItems: "center", padding: 0, border: 0, borderRadius: 10, cursor: "default",
  background: on ? "var(--fill-4)" : undefined, color: "var(--text-primary)", transition: "background-color 140ms ease" });
const panelBox = { position: "fixed", zIndex: 1100, boxSizing: "border-box", borderRadius: 20, background: "var(--surface-raised)", boxShadow: "var(--shadow-floating)", transformOrigin: "top right" };

/* Hover: one step of fill (UI-RULES). Inline styles leave the ground unset
   so these rules can apply. */
const TB_CSS = ".tb-icon { background: transparent; } .tb-icon:hover { background: var(--fill-3); } .tb-seg[aria-pressed=\"false\"]:hover { color: var(--text-secondary) !important; }";

/* ---------- data ---------- */
const NOTES = [
  { id: 1, who: "Lena Fischer", what: "commented on", where: "Needt design rules", text: "“13/12 everywhere in chrome, agreed.”", when: "12 min", unread: true },
  { id: 2, who: "Tom Berger", what: "mentioned you in", where: "Factory quote — round 2", text: "“@Maksym can you confirm the MOQ?”", when: "1 h", unread: true },
  { id: 3, who: "Anna Keller", what: "shared", where: "Launch checklist", text: null, when: "Yesterday", unread: false },
  { id: 4, who: "Needt", what: "placed 3 tasks into", where: "Tuesday", text: "Your morning had 2 h free.", when: "Yesterday", unread: false, bot: true }
];
const REMINDERS = [
  { id: 1, title: "Confirm the print proof", when: "Today, 13:30" },
  { id: 2, title: "Book the B1 exam date", when: "Tomorrow" },
  { id: 3, title: "Call the tax office back", when: "Later" }
];

/* ---------- segmented control, Craft's: a white thumb slides between ---------- */
function Seg2({ value, options, onChange }) {
  const i = options.findIndex((o) => o[0] === value);
  return (
    <div className="shell-seg2-grid" style={{ gridTemplateColumns: "repeat(" + options.length + ", 1fr)" }}>
      <span className="shell-seg2-layer" aria-hidden="true" style={{ width: "calc((100% - 6px) / " + options.length + ")", transform: "translateX(" + (i * 100) + "%)" }} />
      {options.map(([id, l]) => (
        <button key={id} type="button" className="tb-seg shell-seg2-seg" onClick={() => onChange(id)} aria-pressed={value === id}
          style={{ font: value === id ? "500 14px/18px var(--font-sans)" : "400 14px/18px var(--font-sans)", color: value === id ? "var(--text-primary)" : "var(--text-tertiary)" }}>{l}</button>
      ))}
    </div>
  );
}

function EmptyNotes() {
  return (
    <div className="nx-swap shell-empty-notes-swap">
      <div className="shell-empty-notes-stack">
        {[0, 1, 2].map((k) => (
          <div className="nx-swap shell-empty-notes-row" key={k} style={{ animationDuration: "300ms", animationDelay: (80 + k * 60) + "ms" }}>
            <span className="shell-empty-notes-bar" />
            <span className="shell-empty-notes-stack-2"><span className="shell-empty-notes-bar-2" /><span className="shell-empty-notes-bar-3" /></span>
          </div>
        ))}
      </div>
      <span className="shell-empty-notes-text">No notifications yet</span>
      <span className="shell-empty-notes-text-2">You'll be notified here when someone mentions you, comments on your page or Needt moves your day.</span>
    </div>
  );
}

function NotesPanel({ notes, setNotes, close }) {
  const [tab, setTab] = React.useState("activity");
  const [more, setMore] = React.useState(false);
  const [rem, setRem] = React.useState(REMINDERS.map((r) => Object.assign({ done: false }, r)));
  const [showDone, setShowDone] = React.useState(false);
  const live = rem.filter((r) => !r.done), done = rem.filter((r) => r.done);
  const resolve = (id, v) => { setRem((l) => l.map((r) => r.id === id ? Object.assign({}, r, { done: v }) : r)); if (v) window.toast("Reminder resolved", { undo: () => resolve(id, false) }); };
  return (
    <div className="shell-notes-panel-stack">
      <header className="shell-notes-panel-row">
        <span className="shell-notes-panel-text">Notifications</span>
        {tab === "activity" ? (
          <button type="button" aria-label="Notification options" className="tb-icon" onClick={() => setMore(!more)} style={Object.assign(iconBtn(more), { marginLeft: "auto" })}><TbIcon name="ellipsis" size={16} /></button>
        ) : (
          <button type="button" aria-label="New reminder" className="tb-icon" onClick={() => { setRem((l) => [{ id: Date.now(), title: "New reminder", when: "Today, 18:00", done: false }].concat(l)); }} style={Object.assign(iconBtn(false), { marginLeft: "auto" })}><TbIcon name="plus" size={17} /></button>
        )}
        {more ? (
          <div className="nx-pop is-right shell-notes-panel-pop">
            {[["bell-off", "Mark all as read", () => setNotes((l) => l.map((n) => Object.assign({}, n, { unread: false })))], ["refresh-cw", "Reload notifications", () => window.toast("Up to date")], ["trash-2", "Clear all", () => { const b = notes; setNotes([]); window.toast("Notifications cleared", { undo: () => setNotes(b) }); }]].map(([ic, l, fn], k) => (
              <button key={l} type="button" className="nx-swap sk-row shell-notes-panel-sk-row" onClick={() => { setMore(false); fn(); }}
                style={{ animationDuration: "200ms", animationDelay: (k * 25) + "ms" }}>
                <span className="shell-notes-panel-row-2"><TbIcon name={ic} size={15} /></span>{l}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      <Seg2 value={tab} onChange={(v) => { setTab(v); setMore(false); }} options={[["activity", "Activity"], ["reminders", "Reminders"]]} />

      <div key={tab} className="nx-swap shell-notes-panel-swap">
        {tab === "activity" ? (!notes.length ? <EmptyNotes /> : notes.map((n, k) => (
          <div key={n.id} className="nx-swap sk-row shell-notes-panel-sk-row-2" onClick={() => setNotes((l) => l.map((x) => x.id === n.id ? Object.assign({}, x, { unread: false }) : x))}
            style={{ animationDelay: (k * 35) + "ms" }}>
            {n.bot ? <window.Art name="task" size={28} /> : <TbAvatar initials={n.who.split(" ").map((w) => w[0]).join("")} name={n.who} size={28} />}
            <span className="shell-notes-panel-stack-2">
              <span className="shell-notes-panel-text-2"><b className="shell-notes-panel-b">{n.who}</b> {n.what} <b className="shell-notes-panel-b-2">{n.where}</b></span>
              {n.text ? <span className="shell-notes-panel-text-3">{n.text}</span> : null}
              <span className="base-meta">{n.when}</span>
            </span>
            <span className="shell-notes-panel-span" aria-hidden="true" style={{ transform: n.unread ? "scale(1)" : "scale(0)" }} />
          </div>
        ))) : (
          <>
            <span className="shell-notes-panel-span-2">In progress</span>
            {!live.length ? <span className="shell-notes-panel-text-4">Nothing waiting. Press + to add one.</span> : null}
            {live.map((r, k) => (
              <div key={r.id} className="nx-swap sk-row shell-notes-panel-sk-row-3" style={{ animationDuration: "220ms", animationDelay: (k * 30) + "ms" }}>
                {window.HdCheck ? <window.HdCheck on={false} onClick={() => resolve(r.id, true)} /> : null}
                <span className="base-stack shell-notes-panel-stack-3">
                  <span className="shell-notes-panel-text-5">{r.title}</span>
                  <span className="shell-notes-panel-text-6" style={{ color: r.when.indexOf("Today") === 0 ? "var(--accent)" : "var(--text-tertiary)" }}>{r.when}</span>
                </span>
                <span className="shell-notes-panel-row-3"><TbIcon name="ellipsis" size={15} /></span>
              </div>
            ))}
            {showDone && done.length ? done.map((r) => (
              <div key={r.id} className="nx-swap shell-notes-panel-swap-2">
                {window.HdCheck ? <window.HdCheck on onClick={() => resolve(r.id, false)} /> : null}
                <span className="shell-notes-panel-text-7">{r.title}</span>
              </div>
            )) : null}
            <button type="button" className="nx-btn nx-btn-secondary shell-notes-panel-btn" onClick={() => setShowDone(!showDone)}>
              {showDone ? "Hide Resolved Reminders" : "Show Resolved Reminders" + (done.length ? " (" + done.length + ")" : "")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const TB_HELP = [
  ["message-square", "Send feedback"],
  ["sparkles", "What's new", "new"],
  ["circle-help", "Frequently asked questions"],
  ["bug", "Report a problem", "bug"],
  ["keyboard", "Keyboard shortcuts", "keys", "⌘/"],
  ["hash", "Markdown shortcuts"]
];

function WhatsNew({ open, onClose }) {
  const [shown, leaving] = window.useExit(open, 170);
  if (!shown) return null;
  const items = [
    ["home", "Home is a page", "Your day as a Daily Note: habits on one line, tasks written into the page."],
    ["mail", "Mailbox", "Every message can become a task in one click."],
    ["work", "Customize the sidebar", "Pick your tiles, hide the rest in More, drag to reorder."],
    ["template", "Right click everywhere", "Star, move, duplicate and delete — with Undo."]
  ];
  return ReactDOM.createPortal(
    <div className={"base-scrim " + "nx-scrim" + (leaving ? " is-leaving" : "")} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
     >
      <div className={"shell-whats-new-stack " + "nx-sheet" + (leaving ? " is-leaving" : "")}>
        <header className="shell-whats-new-row">
          <span className="base-stack">
            <span className="shell-whats-new-text">What's new in Needt</span>
            <span className="base-meta">6 October 2026</span>
          </span>
          <button type="button" aria-label="Close" onClick={onClose} className="nx-press base-close shell-sidebar-toggle-text"><TbIcon name="x" size={13} /></button>
        </header>
        {items.map(([art, t, s], k) => (
          <div className="nx-swap shell-whats-new-row-2" key={t} style={{ animationDuration: "260ms", animationDelay: (80 + k * 50) + "ms" }}>
            <window.Art name={art} size={40} />
            <span className="base-stack shell-day-menu-span">
              <span className="shell-whats-new-text-2">{t}</span>
              <span className="shell-notes-panel-text-3">{s}</span>
            </span>
          </div>
        ))}
        <button type="button" className="nx-btn nx-btn-primary shell-whats-new-btn" onClick={onClose}>Got it</button>
      </div>
    </div>, document.body);
}

function TopIcons() {
  const [which, setWhich] = React.useState(null);
  const [notes, setNotes] = React.useState(NOTES);
  const [seenNew, setSeenNew] = React.useState(false);
  const [news, setNews] = React.useState(false);
  const [bellRef, bellAt] = useAnchored(which === "bell", "right");
  const [helpRef, helpAt] = useAnchored(which === "help", "right");
  const panel = React.useRef(null);
  const [shownBell, leavingBell] = window.useExit(which === "bell", 130);
  const [shownHelp, leavingHelp] = window.useExit(which === "help", 130);
  useAway(!!which, [bellRef, helpRef, panel], () => setWhich(null));
  const unread = notes.some((n) => n.unread);
  const app = () => window.__app || {};
  /* What's new opens from here and from the Sidebar's account menu, which
     calls window.openWhatsNew() (or fires "needt-whats-new"). */
  React.useEffect(() => {
    const open = () => { setWhich(null); setSeenNew(true); setNews(true); };
    window.openWhatsNew = open;
    window.addEventListener("needt-whats-new", open);
    return () => { if (window.openWhatsNew === open) delete window.openWhatsNew; window.removeEventListener("needt-whats-new", open); };
  }, []);
  return (
    <span className="shell-top-icons-row">
      <style>{TB_CSS}</style>
      <span className="shell-sidebar-drop" ref={bellRef}>
        {(() => { const b = (
          <button type="button" aria-label="Notifications" className="nx-press tb-icon" onClick={() => setWhich(which === "bell" ? null : "bell")} style={iconBtn(which === "bell")}>
            <TbIcon name="bell" size={18} /><Dot show={unread} />
          </button>); return which ? b : <TbTooltip label="Notifications" side="bottom">{b}</TbTooltip>; })()}
      </span>
      <span className="shell-sidebar-drop" ref={helpRef}>
        {(() => { const b = (
          <button type="button" aria-label="Help" className="nx-press tb-icon" onClick={() => setWhich(which === "help" ? null : "help")} style={iconBtn(which === "help")}>
            <TbIcon name="circle-help" size={18} /><Dot show={!seenNew} />
          </button>); return which ? b : <TbTooltip label="Help" side="bottom">{b}</TbTooltip>; })()}
      </span>
      {shownBell && bellAt ? ReactDOM.createPortal(
        <div ref={panel} className={"nx-pop is-right" + (leavingBell ? " is-leaving" : "")} style={Object.assign({ width: 360, padding: 16 }, panelBox, bellAt)}>
          <NotesPanel notes={notes} setNotes={setNotes} close={() => setWhich(null)} />
        </div>, document.body) : null}
      {shownHelp && helpAt ? ReactDOM.createPortal(
        <div ref={panel} className={"nx-pop is-right" + (leavingHelp ? " is-leaving" : "")} style={Object.assign({ width: 260, padding: 6, borderRadius: 14 }, panelBox, helpAt)}>
          {TB_HELP.map(([ic, l, act, kbd], k) => (
            <button key={l} type="button" className="nx-swap sk-row shell-top-icons-sk-row" onClick={() => {
              setWhich(null);
              if (act === "new") { setSeenNew(true); setNews(true); }
              else if (act === "bug") app().setBugOpen && app().setBugOpen(true);
              else if (act === "keys") app().setKeysOpen && app().setKeysOpen(true);
              else window.toast(l + " — opens in the browser");
            }}
              style={{ animationDuration: "200ms", animationDelay: (k * 22) + "ms" }}>
              <span className="shell-notes-panel-row-2"><TbIcon name={ic} size={15} /></span>{l}
              {act === "new" && !seenNew ? <span className="shell-top-icons-bar" /> : null}
              {kbd ? <span className="base-meta shell-sidebar-toggle-text">{kbd}</span> : null}
            </button>
          ))}
        </div>, document.body) : null}
      <WhatsNew open={news} onClose={() => setNews(false)} />
    </span>
  );
}

Object.assign(window, { TopIcons, Seg2 });
