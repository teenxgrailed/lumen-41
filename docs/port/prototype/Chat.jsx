/* CHAT — one object, three states (restyled 06.10.26 to the Craft look).
 *
 * Closed it is a pill: "Ask Needt  ⌘J". Open it is a panel that grows out of
 * that pill, anchored to the same corner (product decision: chat = a growing
 * corner panel). Between the two there is the **island**, where the pill
 * swells for a few seconds to say one thing, then goes back to being a pill.
 *
 * The island is not a toast. A toast is a second object that appears beside
 * the thing it belongs to; here the object you already know grows, carries
 * the message, and shrinks. It is rare on purpose.
 */
const { Icon, IconButton } = window.NeedtDesignSystem_25d3c8;

/* What the island is allowed to say. Each one either teaches something the
   product can do or reports something it just did — never praise. */
const CHAT_NOTES = [
  { glyph: "wand-sparkles", tone: "var(--accent)", title: "Two hours opened up",
    body: "Factory call moved to Thu 3 Sep, so 14:00–16:00 today is free. Tank graphic there?", act: "Fill it", say: "plan my day" },
  { glyph: "keyboard", tone: "var(--text-tertiary)", title: "G then C",
    body: "Two-letter jumps move between screens. G H, G C, G W, G D." },
  { glyph: "list-plus", tone: "var(--success)", title: "Break a task into parts",
    body: "Type / while writing one, or add parts after — the counter appears on the block." },
  { glyph: "flame", tone: "var(--destructive)", title: "One task is holding up three",
    body: "Workspace → Flow names what to do first, by how much it frees.", act: "Show me", say: "flow" },
  { glyph: "clock", tone: "var(--accent)", title: "Say it in words",
    body: "Type a day, a time, a length or a #project in the line — the composer reads all of it." },
  { glyph: "moon", tone: "var(--text-tertiary)", title: "The paper warms after sunset",
    body: "Drift follows the sun where you are. Settings → Appearance." }
];


/* Needt's mark: the AI orb (AiOrb.jsx) — sky colours, not the accent. */
function ChatMark({ size, active }) {
  const z = size || 22;
  /* active: Needt is working — the orb moves only then, on mount and on hover. */
  return window.AiOrb ? <window.AiOrb size={z} active={active} /> : (
    <span className="chat-mark-grid" aria-hidden="true" style={{ width: z, height: z, borderRadius: Math.round(z * 0.3) }}>
      <Icon name="sparkles" size={Math.round(z * 0.6)} />
    </span>
  );
}

/* The tip (08.10.26): a small painted-sky card — the same sky as the sidebar
   Pro promo — that floats ABOVE the Ask pill, right-aligned with it, with two
   cloud puffs trailing down toward the pill. The pill itself never changes
   size, so Ask Needt stays where it is and stays clickable. Single letters and
   modifier glyphs in the title ("G then C") are drawn as kbd chips. */
const CHAT_KEY_RE = /^(?:[A-Z]|⌘|⌥|⇧|⌃|Esc|Tab|↵|\/)$/;
function chatTipTitle(title) {
  return String(title).split(" ").map((w, i) => (
    <React.Fragment key={i}>{i ? " " : null}{CHAT_KEY_RE.test(w) ? <kbd className="chat-tip-kbd">{w}</kbd> : w}</React.Fragment>
  ));
}

function ChatTip({ note, leaving, onOpen, onAct, onDismiss, onHold }) {
  const Sky = window.PxSky;
  /* The sky is absolutely positioned, so a hidden copy of the words sits in
     flow to give the card its height (one or two lines of body). */
  const inner = (live) => (
    <span className="chat-tip-in">
      <span className="chat-tip-title" data-px-calm={live ? "" : undefined}>{chatTipTitle(note.title)}</span>
      <span className="chat-tip-line" data-px-calm={live ? "" : undefined}>{note.body}</span>
      {note.act ? (
        <span className="chat-tip-acts">
          <button type="button" className="px-chip-btn chat-tip-act" tabIndex={live ? 0 : -1} data-chat-tip-act={live ? "" : undefined}
            onClick={live ? (e) => { e.stopPropagation(); onAct(); } : undefined}>{note.act}</button>
        </span>
      ) : null}
    </span>
  );
  const close = (
    <button type="button" className="px-chip-btn chat-tip-x" aria-label="Dismiss tip" data-chat-tip-close
      onClick={(e) => { e.stopPropagation(); onDismiss(); }}><Icon name="x" size={12} /></button>
  );
  return (
    <div className={"chat-tip" + (leaving ? " is-leaving" : "")} data-chat-tip role="status" aria-live="polite"
      onMouseEnter={() => onHold(true)} onMouseLeave={() => onHold(false)}
      onFocus={() => onHold(true)} onBlur={() => onHold(false)}>
      <div className="chat-tip-card nx-focus" data-px-promo role="button" tabIndex={0} aria-label={note.title + ". " + note.body + " Open Needt chat"}
        onClick={onOpen} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } }}>
        <span className="chat-tip-sizer" aria-hidden="true">{inner(false)}</span>
        {Sky ? <Sky variant="d" intensity={0.9} meadow={false} scene="promo"><span className="chat-tip-glow" aria-hidden="true" />{inner(true)}{close}</Sky>
          : <div className="chat-tip-plain">{inner(true)}{close}</div>}
      </div>
      <span className="chat-tip-puff is-1" aria-hidden="true" />
      <span className="chat-tip-puff is-2" aria-hidden="true" />
    </div>
  );
}

/* Where tips stay away (08.10.26): setup and money moments. The route comes
   from needtStates (App reports every route, Settings as "settings"); the
   paywall is a portalled sheet, so we look for it. */
const CHAT_QUIET_SCREENS = { connections: 1, settings: 1, paywall: 1, onboarding: 1, auth: 1 };
function chatQuietNow() {
  const S = window.needtStates;
  const scr = S && S.get ? S.get().screen : null;
  if (scr && CHAT_QUIET_SCREENS[scr]) return true;
  return !!document.querySelector("[data-cn-screen], .pw-scrim, .settings-sheet");
}
function useChatQuiet() {
  const [q, setQ] = React.useState(chatQuietNow);
  React.useEffect(() => {
    const check = () => setQ(chatQuietNow());
    const off = window.needtStates && window.needtStates.on ? window.needtStates.on(check) : null;
    /* Paywall / Settings sheets mount as portals: watch body's children (the
       host lands first, its sheet a frame later — look again shortly after). */
    let later = 0;
    const mo = typeof MutationObserver === "function" ? new MutationObserver(() => { check(); window.clearTimeout(later); later = window.setTimeout(check, 120); }) : null;
    if (mo) mo.observe(document.body, { childList: true });
    const t = window.setInterval(check, 1500);
    return () => { off && off(); mo && mo.disconnect(); window.clearInterval(t); window.clearTimeout(later); };
  }, []);
  return q;
}


/* PROPOSED CHANGES — what the assistant wants to move, shown before it moves
   anything. Each row says the exact new slot, the old one, and why
   (08.10.26: "Wed 2 Sep · 10:00–10:30 (was today 14:00) — no 30-min gap left
   today", never a bare "Tomorrow"). Rows can be left out; Apply writes through
   window.__app.updateTask and the toast's Undo puts every field back. */
const CHAT_DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CHAT_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const chatToday = () => window.NEEDT.iso(window.NEEDT.today);
const chatTomorrow = () => window.NEEDT.toDate("Tomorrow");
function chatDayName(isoDay) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay || "");
  if (!m) return "";
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return CHAT_DOW[d.getDay()] + " " + d.getDate() + " " + CHAT_MON[d.getMonth()];
}
const chatHour = (stampStr) => { const m = /T(\d{2}):(\d{2})/.exec(stampStr || ""); return m ? +m[1] + +m[2] / 60 : null; };
const chatHm = (h) => window.NEEDT.hhmm(h);
const chatMin = (t) => (t && t.estimatedMinutes) || 30;
/* "Wed 2 Sep · 10:00–10:30"; today says so: "Today, Tue 1 Sep · 15:00–15:30". */
function chatSlot(isoDay, hour, minutes) {
  return (isoDay === chatToday() ? "Today, " : "") + chatDayName(isoDay) + " · " + chatHm(hour) + "–" + chatHm(hour + minutes / 60);
}
/* Where the task was: "today 14:00", "due 31 Aug, overdue", "Thu 3 Sep, no time". */
function chatWas(t) {
  if (!t) return "no date";
  const day = t.scheduledStart ? t.scheduledStart.slice(0, 10) : t.dueDate;
  if (t.overdue) return "due " + (window.NEEDT.dueLabel(t) || "earlier") + ", overdue";
  if (!day) return "no date";
  const time = t.scheduledStart ? t.scheduledStart.slice(11, 16) : null;
  const name = day === chatToday() ? "today" : chatDayName(day);
  return time ? name + " " + time : name + ", no time";
}
/* Busy stretches on a day: open tasks with a time, and timed calendar events. */
function chatBusy(isoDay, skip) {
  const out = [];
  ((window.__app && window.__app.tasksNow) || []).forEach((t) => {
    if (t.done || skip[String(t.id)] || !t.scheduledStart || t.scheduledStart.slice(0, 10) !== isoDay) return;
    const h = chatHour(t.scheduledStart);
    out.push([h, h + chatMin(t) / 60]);
  });
  const ev = window.calEvents && window.calEvents.inRange ? window.calEvents.inRange(isoDay + "T00:00", isoDay + "T23:59") : [];
  ev.forEach((e) => {
    if (e.isAllDay || !e.startAt || e.startAt.slice(0, 10) !== isoDay) return;
    const a = chatHour(e.startAt), z = e.endAt && e.endAt.slice(0, 10) === isoDay ? chatHour(e.endAt) : 24;
    out.push([a, z]);
  });
  return out;
}
function chatDayBounds() {
  const S = window.needtSettings, g = (k, d) => (S && S.has && S.has(k) ? S.get(k) : d);
  const h = (x) => { const m = /^(\d{1,2}):(\d{2})/.exec(x || ""); return m ? +m[1] + +m[2] / 60 : null; };
  return [h(g("start", "09:00")) || 9, h(g("end", "18:00")) || 18];
}
/* First free quarter hour on a day, from `from`, that fits `minutes` inside
   working hours — or null. `busy` is added to as slots are handed out. */
function chatFind(isoDay, minutes, busy, from) {
  const [ds, de] = chatDayBounds();
  let h = Math.max(ds, from || 0);
  h = Math.ceil(h * 4 - 1e-6) / 4;
  for (; h + minutes / 60 <= de + 1e-6; h += 0.25) {
    const z = h + minutes / 60;
    if (!busy.some(([a, b]) => h < b - 1e-6 && z > a + 1e-6)) { busy.push([h, z]); return h; }
  }
  return null;
}
const chatNowHour = () => { const n = new Date(); return n.getHours() + n.getMinutes() / 60; };
function chatChange(t, isoDay, hour, why) {
  return { id: t.id, title: t.title, to: chatSlot(isoDay, hour, chatMin(t)), was: chatWas(t), overdue: !!t.overdue, why,
    patch: Object.assign({ overdue: false }, window.NEEDT.placeAt(t, isoDay, hour)) };
}
function chatPlanDay() {
  const list = ((window.__app && window.__app.tasksNow) || []).filter((t) => !t.done);
  const today = chatToday(), tom = chatTomorrow();
  const overdue = list.filter((t) => t.overdue).slice(0, 2);
  const moving = {};
  overdue.forEach((t) => { moving[String(t.id)] = 1; });
  /* The one that waits: something placed today that nobody fixed and that
     has no project or deadline pulling on it. */
  const low = list.find((t) => !moving[String(t.id)] && !t.overdue && !t.isFixed && !t.projectId && t.scheduledStart && t.scheduledStart.slice(0, 10) === today)
    || list.find((t) => !moving[String(t.id)] && !t.overdue && !t.isFixed && t.scheduledStart && t.scheduledStart.slice(0, 10) === today);
  if (low) moving[String(low.id)] = 1;
  const busyToday = chatBusy(today, moving), busyTom = chatBusy(tom, moving);
  const changes = [];
  overdue.forEach((t) => {
    const n = chatMin(t), since = window.NEEDT.dueLabel(t) || "earlier";
    const h = chatFind(today, n, busyToday, chatNowHour());
    if (h != null) { changes.push(chatChange(t, today, h, "Overdue since " + since + " — first free " + n + " min today")); return; }
    const h2 = chatFind(tom, n, busyTom, 0);
    if (h2 != null) changes.push(chatChange(t, tom, h2, "Overdue since " + since + " — no " + n + "-min gap left today"));
  });
  if (low) {
    const n = chatMin(low);
    const h = chatFind(tom, n, busyTom, chatHour(low.scheduledStart) || 0) ?? chatFind(tom, n, busyTom, 0);
    if (h != null) changes.push(chatChange(low, tom, h, (low.projectId ? "No deadline" : "No deadline or project") + " — the first to wait so overdue work fits"));
  }
  if (!changes.length) return { text: "Nothing to move — today already holds everything that's due." };
  const intoToday = changes.filter((c) => c.patch.dueDate === today).length;
  return { text: (overdue.length ? overdue.length + " overdue " + (overdue.length === 1 ? "task" : "tasks") + (intoToday ? " fit into today's free time" : " move to the first free time tomorrow — today has no gap left") : "Nothing is overdue")
    + (low ? ", and one task without a deadline can wait a day." : ".") + " Nothing moves until you apply:", changes };
}
function chatMoveTomorrow(name) {
  const q = name.trim().toLowerCase().replace(/^the\s+/, "");
  const list = ((window.__app && window.__app.tasksNow) || []).filter((t) => !t.done);
  const t = list.find((x) => x.title.toLowerCase() === q) || list.find((x) => x.title.toLowerCase().indexOf(q) > -1);
  if (!t) return { text: "I can't find an open task called “" + name.trim() + "”." };
  const tom = chatTomorrow(), n = chatMin(t), skip = {};
  skip[String(t.id)] = 1;
  const busy = chatBusy(tom, skip), was = chatHour(t.scheduledStart);
  let h = was != null ? chatFind(tom, n, busy, was) : null, why;
  if (h != null) why = Math.abs(h - was) < 1e-6 ? "Same time tomorrow is free" : chatHm(was) + " tomorrow is taken — next free " + n + " min after it";
  else {
    h = chatFind(tom, n, busy, 0);
    why = was != null ? "Nothing free after " + chatHm(was) + " tomorrow — first free " + n + " min" : "First free " + n + " min tomorrow";
  }
  if (h == null) return { text: "Tomorrow has no free " + n + " minutes inside your working hours. Want me to look at Thursday?" };
  return { text: "Here's the move — apply it when it looks right:", changes: [chatChange(t, tom, h, why)] };
}


/* What stops the assistant (states.jsx). The numeric limit is never shown —
   only when it comes back. */
function stChatBlock(st) {
  if (!st) return null;
  if (st.account === "trial-ended") return { icon: "lock", title: "Ask Needt is read-only", body: "Your trial ended — earlier answers stay here.", act: "See plans" };
  if (st.ai === "limit") return { icon: "clock", title: "AI paused until 14:00", body: "Your tasks and calendar still work.", hint: "Paused until 14:00" };
  if (st.ai === "down") return { icon: "cloud-off", title: "AI is temporarily unavailable", body: "Your tasks and calendar still work.", act: "Retry", hint: "Unavailable right now" };
  if (st.offline) return { icon: "cloud-off", title: "You're offline", body: "Ask Needt needs a connection. Your edits still save and sync later.", hint: "Needs a connection" };
  return null;
}

/* CONTEXT (08.10.26) — what a request applies to, shown as a chip above the
   input: Workspace · This day · This doc: <title> · Task: <title>. It is set
   from where you are (the screen, the task you last clicked on it) and can be
   switched from its menu; the reply and its preview name it. */
const CHAT_SCOPE_ICON = { workspace: "layout-template", day: "calendar-days", doc: "file-text", task: "circle-check" };
const CHAT_DAY_SCREENS = { today: 1, calendar: 1 };
const chatScreenNow = () => { const S = window.needtStates; return S && S.get ? S.get().screen : null; };
function chatScopeLabel(sc) {
  if (!sc || sc.kind === "workspace") return "Everything";
  if (sc.kind === "day") return "This day";
  if (sc.kind === "doc") return "This doc: " + sc.title;
  return "Task: " + sc.title;
}
/* Every scope that makes sense from here, the one that fits best first. */
function chatScopes(lastTask) {
  const scr = chatScreenNow(), out = [];
  if (lastTask && lastTask.screen === scr) {
    const t = ((window.__app && window.__app.tasksNow) || []).find((x) => String(x.id) === String(lastTask.id));
    if (t) out.push({ kind: "task", id: t.id, title: t.title });
  }
  if (scr === "doc") {
    const el = document.querySelector("[data-doc-title]");
    out.push({ kind: "doc", title: (el && el.textContent.trim()) || "Untitled" });
  }
  const day = { kind: "day", title: chatDayName(chatToday()) };
  if (CHAT_DAY_SCREENS[scr]) out.push(day);
  out.push({ kind: "workspace" });
  if (!CHAT_DAY_SCREENS[scr]) out.push(day);
  return out;
}
const chatSameScope = (a, b) => !!a && !!b && a.kind === b.kind && String(a.id || a.title || "") === String(b.id || b.title || "");
/* What the reply says it looked at. */
function chatScopeLine(sc) {
  if (!sc || sc.kind === "workspace") return "Looked across all your tasks and docs";
  if (sc.kind === "day") return "Looked at " + sc.title;
  if (sc.kind === "doc") return "Looked at the doc “" + sc.title + "”";
  return "Looked at the task “" + sc.title + "”";
}

/* ================================================================
   ASK NEEDT v2 (08.10.26, owner: "make the AI chat better — more
   functionality, more animations, a better look").

   - Glass header: orb · "Ask Needt" · context chip · new chat · ⋯ (New chat,
     History, Clear, Open the brief) · close.
   - Empty thread: a greeting by the hour and six suggestion cards that follow
     the context (doc / task / day / workspace).
   - Replies think first (orb active, a shimmering line naming each step), then
     stream in word by word with a Stop button; result cards stagger in.
   - Composer: / commands (/plan /summarize /find /draft) and @-mentions
     (task / doc / project) with a keyboard menu; attach a file (mock);
     Enter sends, ⇧Enter is a new line, ↑ in an empty field edits your last
     message.
   - Message actions: Copy, Retry, 👍 / 👎, Insert into doc (on a doc).
   - Chats persist through needtSync `needt.chats` (History, New chat, Clear).
   Everything is a deterministic mock; the only writes are the same task
   writes as before (Add to today, Apply changes) plus Insert into doc.
   Motion runs on events only — nothing loops while the panel is at rest.
   ================================================================ */

const CHAT_KEY = "needt.chats";
const CHAT_CMDS = [
  { cmd: "/plan", title: "Plan my day", sub: "Fit overdue work into today's free time", icon: "plan-day" },
  { cmd: "/summarize", title: "Summarise a doc", sub: "This doc, or one you @-mention", icon: "file-text" },
  { cmd: "/find", title: "Find", sub: "Tasks and docs — or “free time”", icon: "search" },
  { cmd: "/draft", title: "Draft a reply", sub: "Short, in your voice, ready to copy", icon: "pen-line" }
];
const CHAT_KIND_ICON = { task: "circle-check", doc: "file-text", project: "folder", mail: "mail", file: "paperclip" };
const CHAT_NAME = () => (window.NEEDT && window.NEEDT.userName) || "Maksym";

/* Glyphs the icon registry doesn't carry (lucide paths, drawn here). */
const CHAT_GLYPHS = {
  "thumbs-up": <><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></>,
  "thumbs-down": <><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></>,
  history: <><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></>,
  at: <><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></>,
  stop: <rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor" stroke="none" />,
  "file-in": <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M12 12v6" /><path d="m9 15 3 3 3-3" /></>
};
function ChatGlyph({ name, size }) {
  const z = size || 14;
  return (
    <svg className="chat-glyph" width={z} height={z} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {CHAT_GLYPHS[name]}
    </svg>
  );
}

const chatUid = (p) => (p || "m") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const chatPad = (n) => (n < 10 ? "0" : "") + n;
const chatClock = (ts) => { const d = new Date(ts); return chatPad(d.getHours()) + ":" + chatPad(d.getMinutes()); };
function chatWhen(ts) {
  const d = new Date(ts), now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 864e5);
  if (diff <= 0) return "Today " + chatClock(ts);
  if (diff === 1) return "Yesterday " + chatClock(ts);
  return CHAT_DOW[d.getDay()] + " " + d.getDate() + " " + CHAT_MON[d.getMonth()];
}
function chatGreeting() {
  const h = new Date().getHours();
  return (h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening") + ", " + CHAT_NAME();
}
const chatTitleOf = (msgs) => {
  const f = (msgs || []).find((m) => m.from === "you");
  let t = f ? f.text.replace(/\s+/g, " ").trim() : "New chat";
  /* "/plan" reads as "Plan my day", "/find free time" as "Find: free time". */
  const c = /^\/(\w+)\s*(.*)$/.exec(t), cmd = c ? CHAT_CMDS.find((x) => x.cmd === "/" + c[1].toLowerCase().replace("summarise", "summarize")) : null;
  if (cmd) t = cmd.title + (c[2] ? ": " + c[2] : "");
  return t.length > 48 ? t.slice(0, 46).trimEnd() + "…" : t;
};
const chatCalm = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

/* Past chats seed the history on first run, so History is never a blank list. */
function chatSeed() {
  const now = Date.now(), H = 36e5, D = 864e5;
  const a = now - D - 2.4 * H, b = now - 3 * D - 5 * H, c = now - 6 * D - 1 * H;
  return [
    { id: "c-seed-1", title: "Plan Thursday around the factory call", at: a + 4e4, messages: [
      { id: "s1a", from: "you", text: "Plan Thursday around the factory call", at: a, scope: "This day" },
      { id: "s1b", from: "needt", at: a + 4e4, scope: "This day", scopeLine: "Looked at Thu 3 Sep",
        text: "The call holds 10:00–11:00. I'd keep the quiet morning for the tank graphic and push admin after lunch:",
        cards: [{ kind: "timeline", title: "Thu 3 Sep", rows: [
          { time: "08:30–10:00", title: "Tank graphic — first pass", fresh: true },
          { time: "10:00–11:00", title: "Factory call", busy: true },
          { time: "13:30–14:00", title: "Reply to the factory about lead times", fresh: true },
          { time: "16:00–16:45", title: "List the boots on Ricardo" }] }] }] },
    { id: "c-seed-2", title: "Draft a reply to Jonas", at: b + 3e4, messages: [
      { id: "s2a", from: "you", text: "Draft a reply to Jonas", at: b, scope: "Everything" },
      { id: "s2b", from: "needt", at: b + 3e4, scope: "Everything", scopeLine: "Read the thread “Berlin pickup — Thursday or Friday?”",
        text: "Short, and it pins the evening down:",
        cards: [{ kind: "draft", to: "Jonas", subject: "Re: Berlin pickup — Thursday or Friday?",
          text: "Hi Jonas, yes — both pairs are still on hold for you. Thursday after six works; I'm home from 18:30. Cash on pickup is fine. Best, Maksym" }] }] },
    { id: "c-seed-3", title: "What's overdue?", at: c + 3e4, messages: [
      { id: "s3a", from: "you", text: "What's overdue?", at: c, scope: "Everything" },
      { id: "s3b", from: "needt", at: c + 3e4, scope: "Everything", scopeLine: "Looked across all your tasks and docs", feedback: "up",
        text: "Two things were past their date — the August invoices and the domain renewal. Both fit into Tuesday morning before the call." }] }
  ];
}
function chatLoad() {
  const v = window.needtSync ? window.needtSync.get(CHAT_KEY, null) : null;
  if (Array.isArray(v)) return v;
  const s = chatSeed();
  chatSave(s);
  return s;
}
/* Persisted through needtSync (CHAT_SRC marks this window's own writes; the
   panel takes everyone else's live — see "Live" in ChatPanel). */
const CHAT_SRC = {};
function chatSave(list) { if (window.needtSync) window.needtSync.set(CHAT_KEY, list.slice(0, 30), { source: CHAT_SRC }); }

/* ---------- context-aware suggestions ---------- */
function chatSuggestions(sc) {
  const doc = sc && sc.kind === "doc" ? sc.title : null;
  const task = sc && sc.kind === "task" ? sc.title : null;
  const S = {
    plan: { id: "plan", icon: "plan-day", title: "Plan my day", sub: "Fit overdue work into free time", say: "Plan my day", pro: true },
    overdue: { id: "overdue", icon: "hourglass", title: "What's overdue?", sub: "Past its date, oldest first", say: "What's overdue?" },
    summary: { id: "summary", icon: "file-text", title: "Summarise this doc", sub: doc ? "“" + doc + "” in three lines" : "Or one you @-mention", say: "/summarize" },
    draft: { id: "draft", icon: "reply", title: "Draft a reply", sub: "To Jonas — the Berlin pickup", say: "Draft a reply to Jonas" },
    free: { id: "free", icon: "calendar-days", title: "Find free time this week", sub: "Stretches of an hour or more", say: "Find free time this week" },
    low: { id: "low", icon: "move-right", title: "Move low-priority to tomorrow", sub: "Make room for what's due", say: "Move low-priority to tomorrow" },
    steps: { id: "steps", icon: "list-checks", title: "Break it into steps", sub: task ? "“" + task + "”" : "Three steps you can tick", say: "Break it into steps" },
    moveit: { id: "moveit", icon: "move-right", title: "Move it to tomorrow", sub: "Next free slot, with the reason", say: "Move it to tomorrow" },
    todos: { id: "todos", icon: "list-plus", title: "Turn it into tasks", sub: "The open to-dos in this doc", say: "Turn this doc into tasks" }
  };
  if (doc) return [S.summary, S.todos, S.draft, S.plan, S.free, S.overdue];
  if (task) return [S.steps, S.moveit, S.plan, S.free, S.overdue, S.low];
  if (sc && sc.kind === "day") return [S.plan, S.overdue, S.free, S.low, S.draft, S.summary];
  return [S.plan, S.overdue, S.summary, S.draft, S.free, S.low];
}

/* ---------- the mock model: line + scope + chips → steps, text, cards ---------- */
const chatOpenTasks = () => ((window.__app && window.__app.tasksNow) || []).filter((t) => !t.done);
function chatDocFor(sc, chips) {
  const chip = (chips || []).find((c) => c.kind === "doc");
  if (chip && window.docs) return window.docs.find(chip.id) || null;
  if (sc && sc.kind === "doc" && window.docs && window.docs.current) return window.docs.current();
  return null;
}
const chatLen = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return (h ? h + " h" : "") + (h && m ? " " : "") + (m ? m + " min" : ""); };
/* What a day looks like: timed tasks and events, plus the proposed blocks. */
function chatTimeline(isoDay, changes) {
  const moving = {};
  (changes || []).forEach((c) => { moving[String(c.id)] = 1; });
  const rows = [];
  chatOpenTasks().forEach((t) => {
    if (moving[String(t.id)] || !t.scheduledStart || t.scheduledStart.slice(0, 10) !== isoDay) return;
    const a = chatHour(t.scheduledStart);
    rows.push({ a, z: a + chatMin(t) / 60, title: t.title });
  });
  const ev = window.calEvents && window.calEvents.inRange ? window.calEvents.inRange(isoDay + "T00:00", isoDay + "T23:59") : [];
  ev.forEach((e) => {
    if (e.isAllDay || !e.startAt || e.startAt.slice(0, 10) !== isoDay) return;
    const a = chatHour(e.startAt), z = e.endAt && e.endAt.slice(0, 10) === isoDay ? chatHour(e.endAt) : 24;
    rows.push({ a, z, title: e.title || "Event", busy: true });
  });
  (changes || []).forEach((c) => {
    if (!c.patch || c.patch.dueDate !== isoDay || !c.patch.scheduledStart) return;
    const a = chatHour(c.patch.scheduledStart), z = c.patch.scheduledEnd ? chatHour(c.patch.scheduledEnd) : a + 0.5;
    rows.push({ a, z, title: c.title, fresh: true });
  });
  rows.sort((x, y) => x.a - y.a);
  const keep = rows.filter((r) => r.fresh);
  const rest = rows.filter((r) => !r.fresh).slice(0, Math.max(0, 6 - keep.length));
  return rows.filter((r) => r.fresh || rest.indexOf(r) > -1).map((r) => ({ time: chatHm(r.a) + "–" + chatHm(r.z), title: r.title, busy: !!r.busy, fresh: !!r.fresh }));
}
/* Free stretches of ≥ 60 min, next five working days. */
function chatFreeWeek() {
  const N = window.NEEDT, out = [];
  const S = window.needtSettings, weekends = !!(S && S.has && S.has("weekends") && S.get("weekends"));
  const [ds, de] = chatDayBounds();
  const base = new Date(N.today);
  for (let i = 0, days = 0; days < 5 && i < 9; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    if (!weekends && (d.getDay() === 0 || d.getDay() === 6)) continue;
    days++;
    const iso = N.iso(d);
    const busy = chatBusy(iso, {}).filter((b) => b[1] > ds && b[0] < de).sort((x, y) => x[0] - y[0]);
    let h = i === 0 ? Math.max(ds, Math.ceil(chatNowHour() * 4) / 4) : ds;
    const found = [];
    busy.concat([[de, de]]).forEach(([a, z]) => {
      if (a - h >= 1 - 1e-6 && found.length < 2) found.push([h, a]);
      h = Math.max(h, z);
    });
    found.forEach(([a, z]) => out.push({ day: (iso === chatToday() ? "Today, " : "") + chatDayName(iso), time: chatHm(a) + "–" + chatHm(z), len: chatLen((z - a) * 60) }));
  }
  return out.slice(0, 6);
}
function chatSearch(q) {
  const s = q.toLowerCase(), out = [];
  chatOpenTasks().filter((t) => t.title.toLowerCase().indexOf(s) > -1).slice(0, 4)
    .forEach((t) => out.push({ kind: "task", id: t.id, title: t.title, meta: [window.NEEDT.projectName(t), t.overdue ? "overdue" : (t.dueDate ? "due " + (window.NEEDT.dueLabel(t) || t.dueDate) : null)].filter(Boolean).join(" · ") || "Task" }));
  const docs = window.docStore ? window.docStore.get() : [];
  docs.filter((d) => !d.trashedAt && (d.title || "").toLowerCase().indexOf(s) > -1).slice(0, 3)
    .forEach((d) => out.push({ kind: "doc", id: d.id, title: d.title, meta: "Doc · edited " + (d.updated || "").toLowerCase() }));
  return out;
}
function chatHourFor(min, from) {
  const busy = chatBusy(chatToday(), {});
  const h = chatFind(chatToday(), min, busy, Math.max(from || 0, chatNowHour()));
  return h != null ? h : 16;
}
function chatReply(line, sc, chips) {
  const low = line.toLowerCase().trim().replace(/[.!?]+$/, "");
  const n = chatOpenTasks().length;
  const cmd = /^\/(\w+)\s*(.*)$/.exec(line.trim());
  const c = cmd ? cmd[1].toLowerCase() : null, arg = cmd ? cmd[2] : "";
  const todayName = chatDayName(chatToday());
  /* Plan the day: a timeline of today with the proposed blocks, then the change list. */
  if (c === "plan" || /^plan (my|the) day$/.test(low)) {
    const r = chatPlanDay();
    const cards = [];
    if (r.changes) {
      /* The timeline shows the day the work lands on: today if anything fits, else tomorrow. */
      const day = r.changes.some((x) => x.patch.dueDate === chatToday()) ? chatToday() : chatTomorrow();
      cards.push({ kind: "timeline", title: (day === chatToday() ? "Today · " : "Tomorrow · ") + chatDayName(day), rows: chatTimeline(day, r.changes) }, { kind: "changes", changes: r.changes });
    }
    return { steps: ["Reading your calendar…", "Checking " + n + " open tasks…", "Finding free time…"], text: r.text, cards,
      followups: r.changes ? ["Move low-priority to tomorrow", "Find free time this week"] : ["Find free time this week"] };
  }
  if (/^plan my afternoon$/.test(low)) {
    const tasks = [
      { title: "Finish the tank graphic", meta: "13:30–15:00", hour: 13.5, estimatedMinutes: 90, projectId: "ds", tone: "accent" },
      { title: "Reply to the factory about lead times", meta: "15:00–15:30", hour: 15, estimatedMinutes: 30, projectId: "ops", tone: "info" },
      { title: "List the boots on Ricardo", meta: "16:00–16:45", hour: 16, estimatedMinutes: 45, projectId: "resale", tone: "success" }];
    return { steps: ["Reading your calendar…", "Checking " + n + " open tasks…"], text: "You have 13:30–17:00 mostly free. I'd place these three, hardest first while it's quiet:",
      cards: [{ kind: "tasks", label: "This afternoon", items: tasks }] };
  }
  if (/overdue/.test(low)) {
    const od = chatOpenTasks().filter((t) => t.overdue).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    if (!od.length) return { steps: ["Checking " + n + " open tasks…"], text: "Nothing is overdue — everything open still has time.", followups: ["Find free time this week"] };
    return { steps: ["Checking " + n + " open tasks…", "Sorting by due date…"],
      text: od.length + (od.length === 1 ? " task is" : " tasks are") + " past " + (od.length === 1 ? "its" : "their") + " date, oldest first. Planning your day pulls them into today's free time:",
      cards: [{ kind: "overdue", items: od.slice(0, 5).map((t) => ({ id: t.id, title: t.title, due: "Due " + (window.NEEDT.dueLabel(t) || t.dueDate), len: chatLen(chatMin(t)) })) }],
      followups: ["Plan my day", "Move low-priority to tomorrow"] };
  }
  if (c === "summarize" || c === "summarise" || /^summari[sz]e/.test(low) || /^turn (this|the|it) (doc )?into tasks$/.test(low) || /^turn it into tasks$/.test(low)) {
    const d = chatDocFor(sc, chips);
    if (!d) return { steps: ["Looking for a doc…"], text: "Which doc? Open one, or mention it with @ and ask again.", followups: ["Find free time this week"] };
    const title = d.title || "Untitled", body = d.body || [];
    /* the words of a text block, plain or spans (doc-style.jsx dxText) */
    const txt = (a) => (window.dxText ? window.dxText(a) : typeof a[1] === "string" ? a[1] : "");
    const first = body.find((a) => /^(lead|p|callout|quote)$/.test(a[0]) && txt(a));
    const lis = body.filter((a) => a[0] === "li" && txt(a)).map(txt);
    const heads = body.filter((a) => a[0] === "h" && txt(a)).map(txt);
    const todos = body.filter((a) => a[0] === "todo" && !a[2] && txt(a)).map(txt);
    const bullets = [];
    if (first) { const f0 = txt(first), cut = f0.search(/\.\s/); bullets.push(cut > -1 ? f0.slice(0, cut + 1) : f0); }
    lis.slice(0, 2).forEach((l) => bullets.push(l));
    if (bullets.length < 3 && heads.length) bullets.push("Sections: " + heads.join(", ") + ".");
    if (bullets.length < 3 && todos.length) bullets.push(todos.length + " open " + (todos.length === 1 ? "to-do" : "to-dos") + " — " + todos[0] + (todos.length > 1 ? ", …" : "."));
    const onlyTasks = /into tasks/.test(low);
    if (!bullets.length && !todos.length) return { steps: ["Reading “" + title + "”…"], text: "“" + title + "” is empty so far — nothing to summarise yet." };
    const cards = [];
    if (!onlyTasks && bullets.length) cards.push({ kind: "doc", docId: d.id, title, bullets: bullets.slice(0, 3) });
    if (todos.length) {
      let h = chatHourFor(30);
      cards.push({ kind: "tasks", label: "Open to-dos in the doc", items: todos.slice(0, 4).map((t, i) => {
        const it = { title: t, meta: "30 min", hour: h, estimatedMinutes: 30, projectId: d.projectId || null, tone: "info" };
        h += 0.5; return it; }) });
    }
    return { steps: ["Reading “" + title + "”…", onlyTasks ? "Pulling out the to-dos…" : "Pulling out what matters…"],
      text: onlyTasks ? (todos.length ? todos.length + " open " + (todos.length === 1 ? "to-do" : "to-dos") + " in “" + title + "”. Pick the ones to add to today:" : "“" + title + "” has no open to-dos.")
        : "“" + title + "” in " + Math.min(3, bullets.length) + (bullets.length === 1 ? " line" : " lines") + (todos.length ? ", and the to-dos it still holds:" : ":"),
      cards, followups: ["Draft a reply"] };
  }
  if (c === "find" || /^find\b/.test(low)) {
    const q = (c === "find" ? arg : line.trim().replace(/^find\s*/i, "")).trim();
    if (!q || /free|time|slot|gap|hour/.test(q.toLowerCase())) {
      const slots = chatFreeWeek();
      return { steps: ["Reading your calendar…", "Finding free stretches…"],
        text: slots.length ? slots.length + " free stretches of an hour or more in the next five working days:" : "No free hour left in the next five working days.",
        cards: slots.length ? [{ kind: "slots", items: slots }] : [], followups: ["Plan my day"] };
    }
    const found = chatSearch(q);
    return { steps: ["Searching tasks and docs…"], text: found.length ? found.length + (found.length === 1 ? " match" : " matches") + " for “" + q + "”:" : "Nothing called “" + q + "” in your tasks or docs.",
      cards: found.length ? [{ kind: "found", items: found }] : [] };
  }
  if (c === "draft" || /^draft\b/.test(low)) {
    const about = c === "draft" ? arg.trim() : "";
    if (about && !/jonas/i.test(about)) {
      return { steps: ["Reading the context…", "Drafting…"], text: "A short one you can send as it is:",
        cards: [{ kind: "draft", to: null, subject: about, text: "Hi — quick note on " + about.replace(/[.!?]+$/, "") + ". I've looked at it and I'm happy to go ahead; let's confirm the details by Friday so nothing slips. Best, " + CHAT_NAME() }] };
    }
    return { steps: ["Reading the thread with Jonas…", "Drafting…"], text: "Short, friendly, and it pins the evening down:",
      cards: [{ kind: "draft", to: "Jonas", subject: "Re: Berlin pickup — Thursday or Friday?",
        text: "Hi Jonas, yes — both pairs are still on hold for you. Thursday after six works; I'm home from 18:30. Cash on pickup is fine. Best, " + CHAT_NAME() }] };
  }
  if (/^move low.?priority( tasks)? to tomorrow$/.test(low)) {
    const today = chatToday(), tom = chatTomorrow();
    const open = chatOpenTasks().filter((t) => !t.overdue && !t.isFixed && t.scheduledStart && t.scheduledStart.slice(0, 10) === today);
    const pick = open.filter((t) => t.priority === "low" || !t.projectId).concat(open.filter((t) => !(t.priority === "low" || !t.projectId))).slice(0, 2);
    if (!pick.length) return { steps: ["Checking today…"], text: "Nothing low-priority is placed today — there's nothing to push." };
    const skip = {}; pick.forEach((t) => { skip[String(t.id)] = 1; });
    const busy = chatBusy(tom, skip), changes = [];
    pick.forEach((t) => {
      const was = chatHour(t.scheduledStart);
      const h = chatFind(tom, chatMin(t), busy, was || 0) ?? chatFind(tom, chatMin(t), busy, 0);
      if (h != null) changes.push(chatChange(t, tom, h, (t.priority === "low" ? "Low priority" : t.projectId ? "No deadline" : "No deadline or project") + " — first free " + chatMin(t) + " min tomorrow"));
    });
    if (!changes.length) return { steps: ["Checking tomorrow…"], text: "Tomorrow has no free time inside your working hours for these." };
    return { steps: ["Checking today…", "Finding room tomorrow…"], text: changes.length + (changes.length === 1 ? " task" : " tasks") + " can wait a day without missing anything. Nothing moves until you apply:",
      cards: [{ kind: "changes", changes }], followups: ["Plan my day"] };
  }
  const mv = low.match(/^move (.+) to tomorrow$/);
  if (mv) {
    const name = /^(it|this|this task)$/.test(mv[1]) && sc && sc.kind === "task" ? sc.title : line.trim().slice(5, line.trim().toLowerCase().lastIndexOf(" to tomorrow"));
    const r = chatMoveTomorrow(name);
    return { steps: ["Reading tomorrow…", "Finding the next free slot…"], text: r.text, cards: r.changes ? [{ kind: "changes", changes: r.changes }] : [] };
  }
  if (/^break (it|this|this task) into steps$/.test(low)) {
    const t = sc && sc.kind === "task" ? sc.title : (chips || []).find((x) => x.kind === "task") ? (chips || []).find((x) => x.kind === "task").chip : null;
    if (!t) return { steps: ["Looking for a task…"], text: "Which task? Click one first, or mention it with @." };
    let h = chatHourFor(25);
    const parts = ["Outline — " + t, "First pass", "Check it and send it off"].map((title, i) => { const it = { title, meta: [25, 45, 15][i] + " min", hour: h, estimatedMinutes: [25, 45, 15][i], projectId: null, tone: "info" }; h += [25, 45, 15][i] / 60; return it; });
    return { steps: ["Reading “" + t + "”…", "Splitting it up…"], text: "Three steps, smallest first so it's easy to start:", cards: [{ kind: "tasks", label: "Steps", items: parts }] };
  }
  if (/^(focus|start focus|add|capture)\b/.test(low)) return { agent: true };
  return { steps: ["Thinking it through…"],
    text: sc && (sc.kind === "doc" || sc.kind === "task") ? "Noted on “" + sc.title + "”. I can also summarise it, break it into steps, or plan it into your day — type / to see what I can do."
      : "Noted — it's on the brief for this week. I can plan your day, find free time, summarise a doc or draft a reply; type / to see all of it.",
    followups: ["Plan my day", "Find free time this week"] };
}

/* Insert into doc: the doc editor can take it live (event, cancelable);
   otherwise it is appended to the stored page with an Undo. */
function chatInsertDoc(text, bullets) {
  const d = window.docs && window.docs.current ? window.docs.current() : null;
  if (!d) return;
  const blocks = bullets && bullets.length ? bullets.map((b) => ["li", b]) : String(text || "").split(/\n+/).filter(Boolean).map((p) => ["p", p]);
  const ev = new CustomEvent("needt:doc-insert", { detail: { docId: d.id, body: blocks }, cancelable: true });
  const handled = !window.dispatchEvent(ev);
  const name = "“" + (d.title || "Untitled") + "”";
  if (handled) { if (window.toast) window.toast("Added to " + name, ev.detail.undo ? { undo: ev.detail.undo } : undefined); return; }
  const before = d.body || [];
  window.docs.patch(d.id, { body: before.concat(blocks), updated: "Just now" });
  if (window.toast) window.toast("Added to " + name, { undo: () => window.docs.patch(d.id, { body: before }) });
}

/* ---------- result cards ---------- */
function ChatCardHead({ icon, glyph, label, meta }) {
  return (
    <div className="chat-card-head">
      {glyph ? <ChatGlyph name={glyph} size={13} /> : <Icon name={icon} size={13} />}
      <span className="chat-card-label">{label}</span>
      {meta ? <span className="chat-card-meta">{meta}</span> : null}
    </div>
  );
}

function ChatTasksCard({ card, readOnly, onAdd }) {
  const items = card.items;
  const [picked, setPicked] = React.useState(() => items.map(() => true));
  const [added, setAdded] = React.useState(false);
  const Check = window.HdCheck;
  const n = picked.filter(Boolean).length;
  const live = !readOnly && !added;
  const flip = (i) => live && setPicked((p) => p.map((v, j) => (j === i ? !v : v)));
  return (
    <div className="chat-card" data-chat-card="tasks">
      <ChatCardHead icon="list-checks" label={card.label || "Tasks"} meta={items.length + (items.length === 1 ? " task" : " tasks")} />
      {items.map((t, i) => (
        <div key={i} className={"chat-card-row chat-task-row" + (picked[i] ? "" : " is-off")} onClick={() => flip(i)}>
          {Check ? <Check on={picked[i]} onClick={(e) => { if (e && e.stopPropagation) e.stopPropagation(); flip(i); }} /> : <input type="checkbox" checked={picked[i]} readOnly />}
          <span className="chat-task-title">{t.title}</span>
          <span className="chat-task-meta">{t.meta}</span>
        </div>
      ))}
      <div className="chat-card-foot">
        <span className="chat-card-note">{readOnly ? "From an earlier chat" : added ? n + " added to today" : n + " of " + items.length + " selected"}</span>
        {readOnly ? null : added ? <span className="chat-card-done"><Icon name="check" size={14} />Added</span> : (
          <button type="button" className="nx-btn nx-btn-primary nx-btn-sm nx-press" data-chat-add disabled={!n}
            onClick={() => { if (!n) return; setAdded(true); onAdd(items.filter((_, i) => picked[i])); }}>
            Add {n} {n === 1 ? "task" : "tasks"}
          </button>
        )}
      </div>
    </div>
  );
}

/* PROPOSED CHANGES — what the assistant wants to move, shown before it moves
   anything. Each row says the exact new slot, the old one, and why
   ("Wed 2 Sep · 10:00–10:30 (was today 14:00) — no 30-min gap left today",
   never a bare "Tomorrow"). Rows can be left out; Apply writes through
   window.__app.updateTask and the toast's Undo puts every field back. */
function ChatChanges({ changes, scope, readOnly }) {
  const [picked, setPicked] = React.useState(() => changes.map(() => true));
  const [state, setState] = React.useState(readOnly ? "old" : "open"); /* open | applied | undone | dismissed | old */
  const Check = window.HdCheck;
  const n = picked.filter(Boolean).length;
  const live = state === "open";
  const flip = (i) => live && setPicked((p) => p.map((v, j) => (j === i ? !v : v)));
  function apply() {
    const app = window.__app;
    if (!app || !app.updateTask || !n) return;
    const now = app.tasksNow || [];
    const undo = [];
    changes.forEach((c, i) => {
      if (!picked[i]) return;
      const t = now.find((x) => String(x.id) === String(c.id));
      if (!t) return;
      const prev = {};
      Object.keys(c.patch).forEach((k) => { prev[k] = t[k]; });
      undo.push([c.id, prev]);
      app.updateTask(c.id, c.patch);
    });
    setState("applied");
    if (window.toast) window.toast("Applied " + undo.length + (undo.length === 1 ? " change" : " changes"), {
      undo: () => { undo.forEach(([id, prev]) => window.__app.updateTask(id, prev)); setState("undone"); }
    });
  }
  return (
    <div className={"chat-card chat-changes-changes" + (state === "dismissed" ? " is-dismissed" : "")} data-chat-card="changes" data-chat-changes data-state={state}>
      <ChatCardHead icon="calendar-clock" label="Proposed changes" meta={changes.length + (changes.length === 1 ? " move" : " moves")} />
      {changes.map((c, i) => (
        <div key={c.id} className={"chat-card-row chat-change-row chat-changes-change" + (picked[i] ? "" : " is-off")} data-chat-change={c.id} onClick={() => flip(i)}>
          <span className="chat-changes-span">
            {Check ? <Check on={picked[i]} onClick={(e) => { if (e && e.stopPropagation) e.stopPropagation(); flip(i); }} /> : <input type="checkbox" checked={picked[i]} readOnly />}
          </span>
          <span className="base-stack chat-changes-stack">
            <span className="chat-changes-span-2">{c.title}</span>
            <span className="chat-changes-row chat-changes-when" data-chat-change-to>
              <span className="chat-changes-span-4">{c.to}</span>
              <span className={"chat-changes-was" + (c.overdue ? " is-overdue" : "") + (state === "applied" && picked[i] ? " is-gone" : "")} data-chat-change-was
                title={c.overdue ? "Past its due date — this move fixes that" : undefined}>(was {c.was})</span>
            </span>
            {c.why ? <span className="chat-changes-why" data-chat-change-why>{c.why}</span> : null}
          </span>
        </div>
      ))}
      <div className="chat-card-foot">
        <span className="chat-card-note">
          {state === "old" ? "From an earlier chat" : state === "applied" ? "Applied" : state === "undone" ? "Undone — nothing changed" : state === "dismissed" ? "Dismissed" : n + " of " + changes.length + " selected"}
          {scope && state !== "old" ? <span className="chat-changes-scope"> · {scope}</span> : null}
        </span>
        {live ? (
          <>
            <button type="button" className="nx-btn nx-btn-text nx-btn-sm nx-press" data-chat-dismiss onClick={() => setState("dismissed")}>Dismiss</button>
            <button type="button" className="nx-btn nx-btn-primary nx-btn-sm nx-press" data-chat-apply disabled={!n} onClick={apply}>Apply{n ? " " + n : ""}</button>
          </>
        ) : state === "applied" ? <span className="chat-card-done"><Icon name="check" size={14} />Applied</span> : null}
      </div>
    </div>
  );
}

function ChatTimeline({ card }) {
  return (
    <div className="chat-card" data-chat-card="timeline">
      <ChatCardHead icon="calendar-days" label={card.title} meta={card.rows.filter((r) => r.fresh).length ? card.rows.filter((r) => r.fresh).length + " new" : null} />
      <div className="chat-tl">
        {card.rows.length ? card.rows.map((r, i) => (
          <div key={i} className={"chat-card-row chat-tl-row" + (r.fresh ? " is-fresh" : "") + (r.busy ? " is-busy" : "")}>
            <span className="chat-tl-time">{r.time}</span>
            <span className="chat-tl-dot" aria-hidden="true" />
            <span className="chat-tl-title">{r.title}</span>
            {r.fresh ? <span className="chat-tl-tag">New</span> : r.busy ? <span className="chat-tl-tag is-busy">Event</span> : null}
          </div>
        )) : <div className="chat-card-row chat-tl-empty">Nothing timed yet — the whole day is free.</div>}
      </div>
    </div>
  );
}

function ChatDraftCard({ card, canInsert }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="chat-card" data-chat-card="draft">
      <ChatCardHead icon="reply" label={card.to ? "Reply to " + card.to : "Draft"} meta={card.subject} />
      <div className="chat-draft-body">{card.text}</div>
      <div className="chat-card-foot is-start">
        <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm nx-press" onClick={() => { window.needtPlatform.copy(card.text); setCopied(true); }}>
          <Icon name={copied ? "check" : "copy"} size={13} />{copied ? "Copied" : "Copy"}
        </button>
        {canInsert ? <button type="button" className="nx-btn nx-btn-text nx-btn-sm nx-press" data-chat-insert onClick={() => chatInsertDoc(card.text)}><ChatGlyph name="file-in" size={13} />Insert into doc</button> : null}
        {card.to ? <button type="button" className="nx-btn nx-btn-text nx-btn-sm nx-press" onClick={() => window.__go && window.__go("mail")}>Open in Mailbox</button> : null}
      </div>
    </div>
  );
}

function ChatDocCard({ card, canInsert }) {
  const Art = window.Art;
  return (
    <div className="chat-card" data-chat-card="doc">
      <div className="chat-doc-head">
        {Art ? <Art name="doc" size={28} /> : <Icon name="file-text" size={16} />}
        <span className="chat-doc-name">
          <span className="chat-doc-title">{card.title}</span>
          <span className="chat-card-meta">Summary</span>
        </span>
      </div>
      <ul className="chat-doc-list">
        {card.bullets.map((b, i) => <li key={i} className="chat-card-row chat-doc-li">{b}</li>)}
      </ul>
      <div className="chat-card-foot is-start">
        {canInsert ? <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm nx-press" data-chat-insert onClick={() => chatInsertDoc("", card.bullets)}><ChatGlyph name="file-in" size={13} />Insert into doc</button> : null}
        <button type="button" className="nx-btn nx-btn-text nx-btn-sm nx-press" onClick={() => window.docs && window.docs.open(card.docId)}>Open doc</button>
      </div>
    </div>
  );
}

function ChatSlots({ card }) {
  return (
    <div className="chat-card" data-chat-card="slots">
      <ChatCardHead icon="calendar-days" label="Free this week" meta="≥ 1 h, inside working hours" />
      {card.items.map((s, i) => (
        <div key={i} className="chat-card-row chat-slot-row">
          <span className="chat-slot-day">{s.day}</span>
          <span className="chat-slot-time">{s.time}</span>
          <span className="chat-slot-len">{s.len}</span>
        </div>
      ))}
    </div>
  );
}

function ChatFound({ card }) {
  const Art = window.Art;
  const open = (it) => {
    if (it.kind === "doc" && window.docs) window.docs.open(it.id);
    else if (it.kind === "task" && window.__app && window.__app.openTask) window.__app.openTask(it.id);
  };
  return (
    <div className="chat-card" data-chat-card="found">
      <ChatCardHead icon="search" label="Results" meta={card.items.length + (card.items.length === 1 ? " match" : " matches")} />
      {card.items.map((it, i) => (
        <button key={i} type="button" className="chat-card-row chat-found-row" onClick={() => open(it)}>
          {Art ? <Art name={it.kind === "doc" ? "doc" : "task"} size={20} /> : null}
          <span className="chat-found-text">
            <span className="chat-task-title">{it.title}</span>
            <span className="chat-task-meta">{it.meta}</span>
          </span>
          <Icon name="arrow-up-right" size={13} />
        </button>
      ))}
    </div>
  );
}

function ChatOverdue({ card, readOnly, onPlan }) {
  return (
    <div className="chat-card" data-chat-card="overdue">
      <ChatCardHead icon="hourglass" label="Overdue" meta={card.items.length + (card.items.length === 1 ? " task" : " tasks")} />
      {card.items.map((t, i) => (
        <div key={i} className="chat-card-row chat-od-row">
          <span className="chat-od-dot" aria-hidden="true" />
          <span className="chat-task-title">{t.title}</span>
          <span className="chat-od-due" title={"Past its due date — plan it in or let it go · " + t.len}>{t.due}</span>
        </div>
      ))}
      <div className="chat-card-foot">
        <span className="chat-card-note">{readOnly ? "From an earlier chat" : "These were due before today."}</span>
        {readOnly ? null : <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm nx-press" onClick={onPlan}><Icon name="plan-day" size={13} />Plan them in</button>}
      </div>
    </div>
  );
}

function ChatCards({ m, readOnly, canInsert, onAdd, onSend }) {
  if (!m.cards || !m.cards.length) return null;
  return (
    <div className="chat-cards">
      {m.cards.map((c, i) => {
        if (c.kind === "tasks") return <ChatTasksCard key={i} card={c} readOnly={readOnly} onAdd={onAdd} />;
        if (c.kind === "changes") return <ChatChanges key={i} changes={c.changes} scope={m.scope} readOnly={readOnly} />;
        if (c.kind === "timeline") return <ChatTimeline key={i} card={c} />;
        if (c.kind === "draft") return <ChatDraftCard key={i} card={c} canInsert={canInsert} />;
        if (c.kind === "doc") return <ChatDocCard key={i} card={c} canInsert={canInsert} />;
        if (c.kind === "slots") return <ChatSlots key={i} card={c} />;
        if (c.kind === "found") return <ChatFound key={i} card={c} />;
        if (c.kind === "overdue") return <ChatOverdue key={i} card={c} readOnly={readOnly} onPlan={() => onSend("Plan my day")} />;
        return null;
      })}
    </div>
  );
}

/* Thinking: the orb works, one shimmering line names the current step, the
   steps already done sit above it with a tick. */
function ChatThinking({ job }) {
  return (
    <div className="chat-msg is-ai chat-msg-in chat-thinking" data-chat-thinking aria-live="polite">
      <span className="chat-avatar"><ChatMark size={22} active /></span>
      <span className="chat-think-body">
        {job.steps.slice(0, job.step).map((s, i) => (
          <span key={i} className="chat-think-done"><Icon name="check" size={12} />{s}</span>
        ))}
        <span key={job.step} className="chat-think-now">{job.steps[Math.min(job.step, job.steps.length - 1)] || "Thinking…"}</span>
      </span>
    </div>
  );
}

function Chat({ onOpenBrief, hidden, open: openProp, onOpenChange, dock, narrow }) {
  const st = window.useStStates ? window.useStStates("chat") : null;
  const aiBlock = stChatBlock(st);
  const [stRetrying, setStRetrying] = React.useState(false);
  const StGlyph = window.StGlyph;
  function stAct() {
    if (!aiBlock) return;
    if (aiBlock.act === "See plans") { if (window.openPaywall) window.openPaywall(); return; }
    setStRetrying(true);
    window.setTimeout(() => { setStRetrying(false); if (window.needtStates) window.needtStates.set("ai", "none", (window.needtStates.raw().screens.chat || {}).ai ? "chat" : undefined); }, 1200);
  }
  /* Pro (paywall.jsx): free users see a PRO mark with a way to upgrade. */
  const [plan] = window.useNeedtPlan ? window.useNeedtPlan() : ["pro"];
  const ProBadge = window.ProBadge;
  const showPro = !!ProBadge && !(window.needtPlanInfo && window.needtPlanInfo(plan).pro);
  const upgrade = () => { if (window.openPaywall) window.openPaywall(); };

  const [ownOpen, setOwnOpen] = React.useState(false);
  const [inset, setInset] = React.useState(window.__chatInset || 0);
  React.useEffect(() => {
    const on = (e) => setInset(e.detail || 0);
    window.addEventListener("needt:chat-inset", on);
    return () => window.removeEventListener("needt:chat-inset", on);
  }, []);
  const open = openProp != null ? !!openProp : ownOpen;
  const openRef = React.useRef(open);
  openRef.current = open;
  const setOpen = (v) => {
    const next = typeof v === "function" ? v(openRef.current) : v;
    if (onOpenChange) onOpenChange(!!next); else setOwnOpen(!!next);
  };

  /* Threads: the open one in state, every one with messages in needt.chats. */
  const [chats, setChats] = React.useState(chatLoad);
  const [chatId, setChatId] = React.useState(() => chatUid("c"));
  const [messages, setMessages] = React.useState([]);
  const [view, setView] = React.useState("chat"); /* chat | history */
  const [draft, setDraft] = React.useState("");
  const [job, setJob] = React.useState(null);       /* thinking: { steps, step } */
  const [stream, setStream] = React.useState(null); /* streaming: { id, n } */
  const [editing, setEditing] = React.useState(null); /* index of the user message being edited */
  const [note, setNote] = React.useState(null);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [chips, setChips] = React.useState([]);
  const [menuIdx, setMenuIdx] = React.useState(0);
  const [menuOff, setMenuOff] = React.useState(null);
  const [scrolled, setScrolled] = React.useState(false);
  const timers = React.useRef([]);
  const clearTimers = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  React.useEffect(() => () => clearTimers(), []);
  const busy = !!job || !!stream;

  /* Context: the last task row clicked (and on which screen), the screen we
     are on, and a pick from the chip menu that holds until the screen changes. */
  const lastTask = React.useRef(null);
  const [scr, setScr] = React.useState(chatScreenNow);
  const [scopePick, setScopePick] = React.useState(null);
  const [scopeOpen, setScopeOpen] = React.useState(false);
  const [scopeShown, scopeLeaving] = window.useExit ? window.useExit(scopeOpen, 130) : [scopeOpen, false];
  const [scopeTick, setScopeTick] = React.useState(0);
  React.useEffect(() => {
    function down(e) {
      const row = e.target && e.target.closest ? e.target.closest("[data-task]") : null;
      if (row && !row.closest("[data-chat-panel]")) { lastTask.current = { id: row.getAttribute("data-task"), screen: chatScreenNow() }; setScopeTick((n) => n + 1); }
    }
    document.addEventListener("pointerdown", down, true);
    const off = window.needtStates && window.needtStates.on ? window.needtStates.on(() => setScr(chatScreenNow())) : null;
    return () => { document.removeEventListener("pointerdown", down, true); off && off(); };
  }, []);
  React.useEffect(() => { setScopePick(null); setScopeOpen(false); }, [scr]);
  const scopeList = React.useMemo(() => chatScopes(lastTask.current), [scr, open, scopeTick, scopeOpen]);
  const scope = (scopePick && scopeList.some((x) => chatSameScope(x, scopePick)) ? scopePick : null) || scopeList[0];
  const seen = React.useRef(0);
  const field = React.useRef(null);
  const scroller = React.useRef(null);
  const [panelShown, panelLeaving] = window.useExit ? window.useExit(open, dock && !narrow ? 220 : 200) : [open, false];
  const [moreShown, moreLeaving] = window.useExit ? window.useExit(moreOpen, 130) : [moreOpen, false];

  /* Setup places stay quiet (08.10.26, owner): no tip while you're in
     Connections, Settings or the paywall (onboarding never mounts Chat). */
  const quiet = useChatQuiet();
  const quietRef = React.useRef(quiet);
  quietRef.current = quiet;
  React.useEffect(() => { if (quiet) setNote(null); }, [quiet]);

  /* Rare, and never while you are reading the panel or being shown something
     by the agent: the island is for the quiet moments. */
  React.useEffect(() => {
    if (hidden) return undefined;
    let live = true;
    function surface() {
      if (!live || open || quietRef.current || chatQuietNow() || (window.__agent && window.__agent.busy())) return;
      setNote(CHAT_NOTES[seen.current % CHAT_NOTES.length]);
      seen.current += 1;
    }
    /* Prototype hook: window.__chatTip(i) shows note i now. */
    window.__chatTip = (i) => { if (!open && !quietRef.current && !chatQuietNow()) setNote(CHAT_NOTES[(i || 0) % CHAT_NOTES.length]); };
    const first = window.setTimeout(surface, 9000);
    const every = window.setInterval(surface, 75000);
    return () => { live = false; window.clearTimeout(first); window.clearInterval(every); };
  }, [hidden, open]);

  /* Auto-dismiss after 8 s; hovering or focusing the tip pauses the clock. */
  const [tipHold, setTipHold] = React.useState(false);
  const tipLeft = React.useRef(8000);
  React.useEffect(() => { tipLeft.current = 8000; setTipHold(false); }, [note]);
  React.useEffect(() => {
    if (!note || tipHold) return undefined;
    const t0 = Date.now();
    const id = window.setTimeout(() => setNote(null), tipLeft.current);
    return () => { window.clearTimeout(id); tipLeft.current = Math.max(1200, tipLeft.current - (Date.now() - t0)); };
  }, [note, tipHold]);

  React.useEffect(() => {
    if (open && field.current) field.current.focus();
    if (!open) { setMoreOpen(false); setScopeOpen(false); }
  }, [open]);

  /* Keep the newest line in view while it thinks and streams. */
  React.useEffect(() => {
    const el = scroller.current;
    if (el && view === "chat") el.scrollTop = el.scrollHeight;
  }, [messages, job, stream && Math.floor(stream.n / 24), view]);

  /* Live: another window's chats replace the list; the open thread takes its
     new messages unless this panel is mid-reply. */
  const busyRef = React.useRef(false);
  busyRef.current = busy;
  const chatIdRef = React.useRef(chatId);
  chatIdRef.current = chatId;
  React.useEffect(() => {
    const S = window.needtSync;
    if (!S) return undefined;
    return S.subscribe(CHAT_KEY, (v, info) => {
      if (info.source === CHAT_SRC || info.origin === "error" || !Array.isArray(v)) return;
      setChats(v);
      const cur = v.find((c) => c.id === chatIdRef.current);
      if (cur && !busyRef.current) setMessages((m) => (JSON.stringify(m) === JSON.stringify(cur.messages) ? m : cur.messages));
    });
  }, []);

  /* Save the thread: newest first, title from the first question. */
  React.useEffect(() => {
    if (!messages.length) return;
    setChats((list) => {
      const prev = list.find((c) => c.id === chatId);
      /* unchanged (e.g. it just arrived from another window): no new write */
      if (prev && JSON.stringify(prev.messages) === JSON.stringify(messages)) return list;
      const entry = { id: chatId, title: prev && prev.title !== "New chat" ? prev.title : chatTitleOf(messages), at: Date.now(), messages };
      const next = [entry].concat(list.filter((c) => c.id !== chatId));
      chatSave(next);
      return next;
    });
  }, [messages]);

  /* Streaming: the reply is revealed a few characters a frame; cards follow. */
  React.useEffect(() => {
    if (!stream) return undefined;
    const m = messages.find((x) => x.id === stream.id);
    if (!m || stream.n >= m.text.length) { setStream(null); return undefined; }
    const id = window.setTimeout(() => setStream((s) => (s && s.id === stream.id ? { id: s.id, n: Math.min(m.text.length, s.n + 3) } : s)), 20);
    return () => window.clearTimeout(id);
  }, [stream, messages]);

  /* ⌘J / Ctrl+J toggles; Escape closes the menu first, then the panel. */
  React.useEffect(() => {
    function key(e) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "j") {
        if (hidden) return;
        e.preventDefault();
        setNote(null);
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        const other = Array.prototype.some.call(document.querySelectorAll(".nx-pop, [role=menu]"), (el) => !el.closest("[data-chat-panel]"));
        if (other && !moreOpen && !scopeOpen) return;
        if (moreOpen || scopeOpen) { setMoreOpen(false); setScopeOpen(false); }
        else if (view === "history") setView("chat");
        else setOpen(false);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [hidden, open, moreOpen, scopeOpen, view]);

  /* The agent walk-through (focus / capture): the cursor does it on screen. */
  function act(text) {
    const t = text.toLowerCase();
    if (!window.__agent) return false;
    if (/focus|фокус/.test(t)) {
      window.__agent.run([{ sel: "[data-drop=focus] button", act: "click", say: "Starting a focus session" }]);
      return true;
    }
    if (/capture|add|задач/.test(t)) {
      window.__agent.run([
        { sel: "[data-agent-capture] input", act: "type", text: "Call the courier back", say: "Capturing it" },
        { sel: "[data-agent-capture] input", act: "click", say: null }
      ]);
      return true;
    }
    return false;
  }

  function addToToday(list) {
    try {
      const app = window.__app;
      if (app && app.setTasksRaw) {
        const stamp = Date.now();
        const day = window.NEEDT.iso(window.NEEDT.today);
        app.setTasksRaw((l) => l.concat(list.map((t, i) => Object.assign({ id: "chat-" + stamp + "-" + i, title: t.title, projectId: t.projectId, tone: t.tone,
          estimatedMinutes: t.estimatedMinutes, status: "todo", Stage: "todo", holder: "you", done: false },
          window.NEEDT.placeAt({ estimatedMinutes: t.estimatedMinutes }, day, t.hour)))));
      }
      if (window.__notify) window.__notify({ title: list.length + (list.length === 1 ? " task" : " tasks") + " added to today", body: "From Needt chat", ms: 3200 });
    } catch (e) { /* prototype: the chat still says it is done */ }
  }

  /* Think (one step every ~0.55 s), then stream the answer in. */
  function run(line, sc, withChips) {
    const reply = chatReply(line, sc, withChips);
    const base = { scope: chatScopeLabel(sc), scopeLine: chatScopeLine(sc) };
    if (reply.agent) {
      const doing = act(line);
      setMessages((m) => m.concat([Object.assign({ id: chatUid(), from: "needt", at: Date.now(), text: doing ? "Watch — doing it now." : "Done — it is on the brief for this week." }, base)]));
      if (doing) setOpen(false);
      return;
    }
    clearTimers();
    const steps = reply.steps && reply.steps.length ? reply.steps : ["Thinking…"];
    setJob({ steps, step: 0 });
    const per = chatCalm() ? 260 : 560;
    steps.forEach((_, i) => { if (i) timers.current.push(window.setTimeout(() => setJob((j) => (j ? { steps: j.steps, step: i } : j)), per * i)); });
    timers.current.push(window.setTimeout(() => {
      const id = chatUid();
      setJob(null);
      setMessages((m) => m.concat([Object.assign({ id, from: "needt", at: Date.now(), text: reply.text, cards: reply.cards || null, followups: reply.followups || null }, base)]));
      setStream(chatCalm() ? null : { id, n: 0 });
    }, per * steps.length));
  }

  function send(text) {
    const line = (text != null ? text : draft).trim();
    if (!line || aiBlock || busy) return;
    const withChips = chips.length ? chips.slice() : null;
    const sc = scope;
    const user = { id: chatUid(), from: "you", text: line, chips: withChips, scope: chatScopeLabel(sc), scopeObj: sc, at: Date.now() };
    setMessages((m) => (editing != null ? m.slice(0, editing) : m).concat([user]));
    setEditing(null);
    setDraft("");
    setChips([]);
    setMenuOff(null);
    setView("chat");
    run(line, sc, withChips);
  }

  function stop() {
    if (job) {
      clearTimers(); setJob(null);
      setMessages((m) => m.concat([{ id: chatUid(), from: "needt", at: Date.now(), text: "Stopped before answering.", stopped: true }]));
    } else if (stream) {
      const s = stream;
      setMessages((ms) => ms.map((x) => (x.id === s.id ? Object.assign({}, x, { text: x.text.slice(0, s.n).trimEnd() + "…", cards: null, followups: null, stopped: true }) : x)));
      setStream(null);
    }
    if (field.current) field.current.focus();
  }

  function retry(i) {
    if (busy) return;
    let u = i - 1;
    while (u >= 0 && messages[u].from !== "you") u--;
    if (u < 0) return;
    const um = messages[u];
    setMessages((m) => m.slice(0, i));
    run(um.text, um.scopeObj || scope, um.chips);
  }
  const setFeedback = (i, v) => setMessages((m) => m.map((x, j) => (j === i ? Object.assign({}, x, { feedback: x.feedback === v ? null : v }) : x)));
  function copy(m) {
    const extra = (m.cards || []).map((c) => (c.kind === "draft" ? c.text : c.kind === "doc" ? c.bullets.map((b) => "• " + b).join("\n") : "")).filter(Boolean);
    window.needtPlatform.copy([m.text].concat(extra).join("\n\n"));
    if (window.toast) window.toast("Copied");
  }
  function editLast() {
    let u = messages.length - 1;
    while (u >= 0 && messages[u].from !== "you") u--;
    if (u < 0) return false;
    setEditing(u);
    setDraft(messages[u].text);
    setChips(messages[u].chips || []);
    return true;
  }

  function newChat() {
    clearTimers(); setJob(null); setStream(null);
    setChatId(chatUid("c")); setMessages([]); setChips([]); setDraft(""); setEditing(null);
    setView("chat"); setMoreOpen(false);
    if (field.current) field.current.focus();
  }
  function openChat(c) {
    clearTimers(); setJob(null); setStream(null); setEditing(null);
    setChatId(c.id);
    setMessages((c.messages || []).map((m) => Object.assign({}, m, { old: true })));
    setView("chat");
  }
  function clearChat() {
    setMoreOpen(false);
    if (!messages.length) return;
    const id = chatId, before = messages, list = chats;
    clearTimers(); setJob(null); setStream(null);
    setMessages([]);
    setChats((l) => { const next = l.filter((c) => c.id !== id); chatSave(next); return next; });
    setChatId(chatUid("c"));
    if (window.toast) window.toast("Chat cleared", { undo: () => { setChatId(id); setMessages(before); setChats(list); chatSave(list); } });
  }
  function deleteChat(c) {
    const list = chats;
    setChats((l) => { const next = l.filter((x) => x.id !== c.id); chatSave(next); return next; });
    if (c.id === chatId) { setMessages([]); setChatId(chatUid("c")); }
    if (window.toast) window.toast("Chat deleted", { undo: () => { setChats(list); chatSave(list); } });
  }

  /* ---------- composer menus: / commands and @ mentions ---------- */
  const slashM = /^\/([a-z]*)$/i.exec(draft);
  const mentionM = /(?:^|\s)@([^\s@]*)$/.exec(draft);
  const menuKind = draft === menuOff ? null : slashM ? "slash" : mentionM ? "mention" : null;
  const menuItems = React.useMemo(() => {
    if (menuKind === "slash") {
      const q = slashM[1].toLowerCase();
      return CHAT_CMDS.filter((c) => c.cmd.slice(1).indexOf(q) === 0 || (q === "summarise" && c.cmd === "/summarize"));
    }
    if (menuKind === "mention") {
      const q = mentionM[1].toLowerCase();
      const has = (s) => String(s || "").toLowerCase().indexOf(q) > -1;
      const out = [];
      chatOpenTasks().filter((t) => has(t.title)).slice(0, 4).forEach((t) => out.push({ kind: "task", id: t.id, art: "task", chip: t.title, sub: window.NEEDT.projectName(t) || "Task", section: "Tasks" }));
      (window.docStore ? window.docStore.get() : []).filter((d) => !d.trashedAt && d.title && has(d.title)).slice(0, 3)
        .forEach((d) => out.push({ kind: "doc", id: d.id, art: "doc", chip: d.title, sub: "Doc", section: "Docs" }));
      (window.NEEDT.projects || []).filter((p) => has(p.name)).slice(0, 3)
        .forEach((p) => out.push({ kind: "project", id: p.id, art: "folder", chip: p.name, sub: "Project", section: "Projects" }));
      return out;
    }
    return [];
  }, [menuKind, draft]);
  const menuOn = !!menuKind && menuItems.length > 0;
  React.useEffect(() => { setMenuIdx(0); }, [menuKind, menuItems.length]);
  function pick(it) {
    if (!it) return;
    if (menuKind === "slash") setDraft(it.cmd + " ");
    else {
      setChips((c) => (c.some((x) => x.kind === it.kind && String(x.id) === String(it.id)) ? c : c.concat([{ kind: it.kind, id: it.id, art: it.art, chip: it.chip }])));
      setDraft((d) => d.replace(/(^|\s)@[^\s@]*$/, "$1"));
    }
    if (field.current) field.current.focus();
  }
  function insertAt() { setDraft((d) => (d && !/\s$/.test(d) ? d + " @" : d + "@")); setMenuOff(null); if (field.current) field.current.focus(); }
  function onFile(fs) {
    const f = fs && fs[0];
    if (!f) return;
    setChips((c) => c.concat([{ kind: "file", id: chatUid("f"), chip: f.name }]));
    if (field.current) field.current.focus();
  }
  function onKey(e) {
    if (e.nativeEvent && e.nativeEvent.isComposing) return;
    if (menuOn) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMenuIdx((i) => (i + 1) % menuItems.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMenuIdx((i) => (i - 1 + menuItems.length) % menuItems.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pick(menuItems[Math.min(menuIdx, menuItems.length - 1)]); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setMenuOff(draft); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); return; }
    if (e.key === "ArrowUp" && !draft && !busy) { if (editLast()) e.preventDefault(); return; }
    if (e.key === "Escape" && editing != null) { e.preventDefault(); e.stopPropagation(); setEditing(null); setDraft(""); setChips([]); }
  }

  const island = !!note && !open && !hidden && !quiet;
  const [tipShown, tipLeaving] = window.useExit ? window.useExit(island, 200) : [island, false];
  const lastNote = React.useRef(null);
  if (note) lastNote.current = note;
  /* Lift the prototype States pill above the tip while it is up. */
  const tipRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    if (!tipShown || tipLeaving || !tipRef.current) { root.style.removeProperty("--chat-tip-lift"); return undefined; }
    root.style.setProperty("--chat-tip-lift", Math.ceil(tipRef.current.offsetHeight + 12) + "px");
    return () => root.style.removeProperty("--chat-tip-lift");
  }, [tipShown, tipLeaving, note]);
  const canInsert = scope && scope.kind === "doc";

  /* Where the panel lives. Wide window: a 360 column of the app's main row
     (App animates the column's width). Narrow: a right sheet over a scrim.
     No dock (another shell): the old corner panel. */
  const frame = (inner) => {
    if (dock && !narrow) return ReactDOM.createPortal(
      <div className="chat-frame-panel" data-chat-panel role="complementary" aria-label="Ask Needt">
        <div className={"chat-box chat-dock-card" + (panelLeaving ? " is-leaving" : "")}>{inner}</div>
      </div>, dock);
    if (dock) return ReactDOM.createPortal(
      <>
        <div className={"chat-frame-layer chat-scrim" + (panelLeaving ? " is-leaving" : "")} aria-hidden="true" onMouseDown={() => setOpen(false)} />
        <div className={"chat-box chat-sheet" + (panelLeaving ? " is-leaving" : "")} role="dialog" aria-label="Ask Needt" data-chat-panel>{inner}</div>
      </>, dock);
    return <div className={"chat-box chat-panel" + (panelLeaving ? " is-leaving" : "")} role="dialog" aria-label="Ask Needt" data-chat-panel>{inner}</div>;
  };

  const menuRow = (key, icon, label, onClick, extra) => (
    <button key={key} type="button" role="menuitem" className="chat-row chat-menu-row-row" onClick={onClick}>
      {icon}<span className="chat-scope-item-t">{label}</span>{extra || null}
    </button>
  );
  const suggestions = chatSuggestions(scope);
  const lastAi = (() => { for (let i = messages.length - 1; i >= 0; i--) if (messages[i].from === "needt") return i; return -1; })();
  const blocked = st && st.load !== "none";
  const empty = !messages.length && !job;

  const header = (
    <div className={"chat-head" + (scrolled || view === "history" ? " is-scrolled" : "")}>
      {view === "history" ? (
        <IconButton label="Back to chat" variant="ghost" size="sm" onClick={() => setView("chat")}><Icon name="arrow-left" size={15} /></IconButton>
      ) : <span className="chat-head-orb"><ChatMark size={28} active={busy} /></span>}
      <div className="chat-head-text">
        <span className="chat-head-title">
          {view === "history" ? "History" : "Ask Needt"}
          {showPro && view !== "history" ? <button type="button" className="chat-pro" data-chat-pro title="Ask Needt plans and moves are Pro — see plans" onClick={upgrade}><ProBadge /></button> : null}
        </span>
        {view === "history" ? <span className="chat-head-sub">{chats.length + (chats.length === 1 ? " chat" : " chats")} · synced across your devices</span> : (
          <button type="button" className="chat-scope" data-chat-scope={scope.kind} aria-haspopup="menu" aria-expanded={scopeOpen} disabled={!!aiBlock}
            title={"Applies to: " + chatScopeLabel(scope) + " — change"} onClick={() => { setMoreOpen(false); setScopeOpen((o) => !o); }}>
            <Icon name={CHAT_SCOPE_ICON[scope.kind]} size={12} />
            <span className="chat-scope-t">{chatScopeLabel(scope)}</span>
            <Icon name="chevron-down" size={12} />
          </button>
        )}
      </div>
      {view === "chat" ? <IconButton label="New chat" variant="ghost" size="sm" onClick={newChat}><Icon name="new-doc" size={15} /></IconButton> : null}
      <IconButton label="More" variant="ghost" size="sm" onClick={() => { setScopeOpen(false); setMoreOpen((v) => !v); }}><Icon name="ellipsis" size={15} /></IconButton>
      <IconButton label="Close" variant="ghost" size="sm" onClick={() => setOpen(false)}><Icon name="x" size={15} /></IconButton>
      {moreShown ? (
        <div className={"chat-layer nx-pop is-right" + (moreLeaving ? " is-leaving" : "")} role="menu" data-chat-more>
          {menuRow("new", <Icon name="new-doc" size={14} />, "New chat", newChat)}
          {menuRow("history", <ChatGlyph name="history" size={14} />, "History", () => { setMoreOpen(false); setView("history"); }, <span className="chat-menu-count">{chats.length}</span>)}
          {menuRow("clear", <Icon name="eraser" size={14} />, "Clear this chat", clearChat)}
          <div className="chat-menu-sep" />
          {menuRow("brief", <Icon name="file-text" size={14} />, "Open the brief", () => { setMoreOpen(false); if (onOpenBrief) onOpenBrief(); })}
        </div>
      ) : null}
      {scopeShown ? (
        <div className={"chat-scope-menu nx-pop" + (scopeLeaving ? " is-leaving" : "")} role="menu" aria-label="What this applies to" data-chat-scope-menu>
          <div className="chat-scope-menu-label">Ask about</div>
          {scopeList.map((x) => {
            const on = chatSameScope(x, scope);
            return (
              <button key={x.kind + (x.id || x.title || "")} type="button" role="menuitemradio" aria-checked={on} className="chat-row chat-menu-row-row chat-scope-item"
                onClick={() => { setScopePick(x); setScopeOpen(false); if (field.current) field.current.focus(); }}>
                <Icon name={CHAT_SCOPE_ICON[x.kind]} size={14} />
                <span className="chat-scope-item-t">{chatScopeLabel(x)}</span>
                {on ? <Icon name="check" size={13} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );

  const history = (
    <div className="chat-history" data-chat-history>
      <button type="button" className="chat-row chat-hist-new" onClick={newChat}><Icon name="plus" size={14} />New chat</button>
      {chats.length ? chats.map((c) => {
        const last = (c.messages || []).filter((m) => m.from === "needt").slice(-1)[0];
        return (
          <div key={c.id} className={"chat-hist-row" + (c.id === chatId ? " is-current" : "")}>
            <button type="button" className="chat-hist-open" data-chat-hist={c.id} onClick={() => openChat(c)}>
              <span className="chat-hist-top">
                <span className="chat-hist-title">{c.title}</span>
                <span className="chat-hist-when">{chatWhen(c.at)}</span>
              </span>
              <span className="chat-hist-prev">{last ? last.text : (c.messages || []).length + " messages"}</span>
            </button>
            <button type="button" className="chat-hist-x" aria-label={"Delete “" + c.title + "”"} title="Delete chat" onClick={() => deleteChat(c)}><Icon name="trash-2" size={13} /></button>
          </div>
        );
      }) : <div className="base-empty">No chats yet — ask something and it will be kept here.</div>}
    </div>
  );

  const emptyState = (
    <div className="chat-empty" data-chat-empty>
      <span className="chat-empty-orb"><ChatMark size={40} /></span>
      <div className="chat-hello">{chatGreeting()}</div>
      <div className="chat-hello-sub">
        {scope.kind === "doc" ? "I'm looking at “" + scope.title + "”. Ask about it, or about your day."
          : scope.kind === "task" ? "I'm looking at “" + scope.title + "”. Ask what to do with it."
          : "Ask about your day, your tasks or a doc. I'll show what changes before anything moves."}
      </div>
      <div className="chat-suggest-grid">
        {suggestions.map((s) => (
          <button key={s.id} type="button" className="chat-suggest-card" data-chat-suggest={s.id} onClick={() => send(s.say)} disabled={!!aiBlock}>
            <i className="chat-suggest-icon"><Icon name={s.icon} size={15} /></i>
            <strong className="chat-suggest-title">{s.title}{s.pro && showPro ? <i className="chat-suggest-pro"><ProBadge /></i> : null}</strong>
            <em className="chat-suggest-sub">{s.sub}</em>
          </button>
        ))}
      </div>
      {showPro ? (
        <div className="chat-upsell">
          <span>Free plan: answers and drafts. Pro plans and moves your day.</span>
          <button type="button" className="nx-btn nx-btn-text nx-btn-sm" data-chat-upgrade onClick={upgrade}>See plans</button>
        </div>
      ) : null}
      <div className="chat-hints"><kbd>/</kbd> commands <kbd>@</kbd> mention <kbd>↑</kbd> edit last</div>
    </div>
  );

  const thread = (
    <>
      {messages.map((m, i) => {
        const streaming = stream && stream.id === m.id;
        const text = streaming ? m.text.slice(0, stream.n) : m.text;
        if (m.from === "you") return (
          <div key={m.id || i} className={"chat-msg is-you" + (m.old ? "" : " chat-msg-in") + (editing === i ? " is-editing" : "")} data-chat-msg="you">
            {m.chips ? (
              <span className="chat-msg-chips">
                {m.chips.map((c, j) => <span className="chat-chip" key={j}><Icon name={CHAT_KIND_ICON[c.kind] || "paperclip"} size={12} />{c.chip}</span>)}
              </span>
            ) : null}
            <span className="chat-bubble-row">
              <span className="chat-time">{chatClock(m.at)}</span>
              <span className="chat-bubble">{m.text}</span>
            </span>
          </div>
        );
        return (
          <div key={m.id || i} className={"chat-msg is-ai" + (m.old ? "" : " chat-msg-in") + (i === lastAi && !busy ? " is-last" : "")} data-chat-msg="needt">
            <span className="chat-avatar"><ChatMark size={22} active={!!streaming} /></span>
            <span className="chat-ai-body">
              {m.scopeLine ? <span className="chat-scope-said" data-chat-scope-said>{m.scopeLine}</span> : null}
              <span className={"chat-ai-text" + (m.stopped ? " is-stopped" : "")}>{text}{streaming ? <span className="chat-caret" aria-hidden="true" /> : null}</span>
              {!streaming ? <ChatCards m={m} readOnly={!!m.old} canInsert={canInsert} onAdd={addToToday} onSend={send} /> : null}
              {!streaming && !m.old && m.followups && i === lastAi && !busy ? (
                <span className="chat-follow">
                  {m.followups.map((f) => <button key={f} type="button" className="chat-follow-btn" data-chat-follow onClick={() => send(f)}>{f}</button>)}
                </span>
              ) : null}
              {!streaming ? (
                <span className="chat-acts" data-chat-acts>
                  <button type="button" className="chat-act" aria-label="Copy" title="Copy" onClick={() => copy(m)}><Icon name="copy" size={13} /></button>
                  <button type="button" className="chat-act" aria-label="Retry" title="Retry" disabled={busy} onClick={() => retry(i)}><Icon name="rotate-ccw" size={13} /></button>
                  <button type="button" className={"chat-act" + (m.feedback === "up" ? " is-on" : "")} aria-label="Good answer" aria-pressed={m.feedback === "up"} title="Good answer" onClick={() => setFeedback(i, "up")}><ChatGlyph name="thumbs-up" size={13} /></button>
                  <button type="button" className={"chat-act" + (m.feedback === "down" ? " is-on" : "")} aria-label="Bad answer" aria-pressed={m.feedback === "down"} title="Bad answer" onClick={() => setFeedback(i, "down")}><ChatGlyph name="thumbs-down" size={13} /></button>
                  {canInsert && !m.stopped ? <button type="button" className="chat-act is-wide" data-chat-insert onClick={() => chatInsertDoc(m.text)}><ChatGlyph name="file-in" size={13} />Insert into doc</button> : null}
                  {m.feedback ? <span className="chat-thanks">{m.feedback === "up" ? "Thanks!" : "Thanks — noted"}</span> : null}
                  <span className="chat-time">{chatClock(m.at)}</span>
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
      {job ? <ChatThinking job={job} /> : null}
    </>
  );

  return (
    <div className={"chat-agent-anchor" + (hidden ? " is-hidden" : "")} data-agent-anchor style={{ right: inset ? 20 + inset + 12 : 20 }}>
      {/* The tip floats above the pill; it never covers it. */}
      {tipShown && lastNote.current ? (
        <div ref={tipRef} className="chat-tip-anchor">
          <ChatTip note={lastNote.current} leaving={tipLeaving}
            onHold={setTipHold}
            onAct={() => { const n = lastNote.current; setNote(null); setOpen(true); send(n.say); }}
            onDismiss={() => setNote(null)}
            onOpen={() => { setNote(null); setOpen(true); }} />
        </div>
      ) : null}

      {/* The pill. It stays put underneath while the panel is open. */}
      <div className={"chat-div chat-shell" + (open ? " is-open" : "")}>
        <button type="button" data-agent-home data-chat-pill className="chat-pill base-row chat-agent-home" onClick={() => setOpen(true)} aria-label="Ask Needt (⌘J)">
          <ChatMark size={20} active={busy && !open} />
          <span className="chat-span">Ask Needt</span>
          <span className="chat-grid">⌘J</span>
        </button>
      </div>

      {panelShown ? frame(
        <>
          {header}
          <div ref={scroller} className={"scroll-inner chat-scroll" + (view === "history" ? " is-history" : "")} data-chat-scroll
            onScroll={(e) => { const s = e.currentTarget.scrollTop > 4; if (s !== scrolled) setScrolled(s); }}>
            {view === "history" ? history : (
              <>
                {st && st.load === "loading" && window.StSkeleton ? <div className="chat-div-2">{window.StSkeleton("chat")}</div> : null}
                {st && st.load === "error" && window.StError ? <div className="chat-div-3"><window.StError screen="chat" /></div> : null}
                {blocked ? null : empty ? emptyState : thread}
              </>
            )}
          </div>

          {/* Composer */}
          {view === "chat" ? (
            <div className="chat-composer-wrap">
              {aiBlock ? (
                <div className="st-chat-note" role="status" data-st-chat-block>
                  {StGlyph ? <span className="st-chat-note-icon"><StGlyph name={aiBlock.icon} size={14} /></span> : null}
                  <span className="chat-stack">
                    <span className="chat-span-4">{aiBlock.title}</span>
                    <span className="chat-span-8">{aiBlock.body}</span>
                  </span>
                  {aiBlock.act ? (
                    <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" data-st-chat-act disabled={stRetrying} onClick={stAct}>
                      {stRetrying ? <span className="st-spin" aria-hidden="true" /> : null}{stRetrying ? "Retrying" : aiBlock.act}
                    </button>
                  ) : null}
                </div>
              ) : null}
              {menuOn ? (
                <div className="chat-cmd-menu nx-up" role="listbox" aria-label={menuKind === "slash" ? "Commands" : "Mention"} data-chat-menu={menuKind}>
                  <div className="chat-scope-menu-label">{menuKind === "slash" ? "Commands" : "Attach as context"}</div>
                  {menuItems.map((it, i) => (
                    <React.Fragment key={(it.cmd || it.kind + it.id)}>
                      {menuKind === "mention" && (!i || menuItems[i - 1].section !== it.section) ? <div className="chat-cmd-section">{it.section}</div> : null}
                      <button type="button" role="option" aria-selected={i === menuIdx} className={"chat-cmd-row" + (i === menuIdx ? " is-active" : "")}
                        onMouseEnter={() => setMenuIdx(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(it)}>
                        <i className="chat-cmd-icon"><Icon name={menuKind === "slash" ? it.icon : CHAT_KIND_ICON[it.kind]} size={14} /></i>
                        <span className="chat-cmd-text">
                          <span className="chat-cmd-title">{menuKind === "slash" ? <><b>{it.cmd}</b> {it.title}</> : it.chip}</span>
                          <span className="chat-cmd-sub">{it.sub}</span>
                        </span>
                        {i === menuIdx ? <kbd className="chat-cmd-kbd">↵</kbd> : null}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              ) : null}
              {editing != null ? (
                <div className="chat-editing" data-chat-editing>
                  <Icon name="pencil" size={12} /><span>Editing your last message</span>
                  <button type="button" className="chat-editing-x" onClick={() => { setEditing(null); setDraft(""); setChips([]); }}>Cancel <kbd>Esc</kbd></button>
                </div>
              ) : null}
              <div className={"chat-composer" + (draft.trim() ? " has-text" : "")}>
                {chips.length ? (
                  <div className="chat-row-6">
                    {chips.map((c) => (
                      <span key={c.kind + c.id + c.chip} className="chat-chip is-removable chat-chip-in">
                        <Icon name={CHAT_KIND_ICON[c.kind] || "paperclip"} size={12} />{c.chip}
                        <button className="chat-grid-2" type="button" aria-label={"Remove " + c.chip} onClick={() => setChips((l) => l.filter((x) => x !== c))}><Icon name="x" size={11} /></button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <textarea className="chat-input" ref={field} rows={1} value={draft} disabled={!!aiBlock} data-chat-input
                  onChange={(e) => { setDraft(e.target.value); if (menuOff != null && e.target.value !== menuOff) setMenuOff(null); }}
                  onKeyDown={onKey}
                  title={aiBlock ? aiBlock.title + " — " + aiBlock.body : undefined}
                  placeholder={aiBlock ? (aiBlock.hint || aiBlock.title) : editing != null ? "Edit and press Enter" : "Ask, or type / for commands"} />
                <div className="chat-tools">
                  <button type="button" aria-label="Attach a file" title="Attach a file" className="chat-tool" disabled={!!aiBlock} onClick={() => window.needtPlatform.pickFile({}).then(onFile)}><Icon name="paperclip" size={15} /></button>
                  <button type="button" aria-label="Mention a task, doc or project" title="Mention a task, doc or project (@)" className="chat-tool" data-chat-at disabled={!!aiBlock} onClick={insertAt}><ChatGlyph name="at" size={15} /></button>
                  <button type="button" aria-label="Commands" title="Commands (/)" className="chat-tool is-text" data-chat-slash disabled={!!aiBlock} onClick={() => { setDraft("/"); setMenuOff(null); if (field.current) field.current.focus(); }}>/</button>
                  <span className="chat-tools-gap" />
                  {busy ? (
                    <button className="chat-send is-stop" type="button" aria-label="Stop" title="Stop" data-chat-stop onClick={stop}><ChatGlyph name="stop" size={12} /></button>
                  ) : (
                    <button className="chat-send" type="button" aria-label="Send" data-chat-send onClick={() => send()} disabled={!draft.trim() || !!aiBlock}><Icon name="arrow-up" size={15} /></button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

Object.assign(window, { Chat, ChatTip, CHAT_NOTES });
