/* MAIL — a place, not a client. Craft's list-and-page pattern on our tokens:
   the inbox is a list like All Docs (list view), the open message is a page in
   a window like a document. Every message can become a task in one click,
   because that is the only reason Needt shows mail at all. Since 09.10.26
   it also writes: New message, Reply / Reply all / Forward in a floating
   composer, Sent and Drafts (see MAIL OUT and THE COMPOSER below). */
const MlNS = window.NeedtDesignSystem_25d3c8;
const { Icon: MlIcon, IconButton: MlIconButton, Tooltip: MlTooltip } = MlNS;

/* THE THREADS (07.10.26) are MailThread rows — the seed lives in Data.js
   (NEEDT.mail), the live list in stores.jsx (window.mailApi, localStorage
   "needt.mail.threads"), shared with the phone. A thread carries its own
   state: isRead, isArchived, trashedAt, taskId (the task it became), plus
   its content: accountId, subject, from, fromEmail, receivedAt, preview,
   body, attachment, needsReply, suggestedTask. The day heading and the time
   are computed from receivedAt (NEEDT.mailDayLabel / mailTime).
   EDGE CASES: window.mailEdge("mail" | "empty" | "reset") swaps the list —
   200 threads over many days with long subjects, senders and previews
   (NEEDT.mailFixture("mail")), or no mail at all. It persists like real
   mail until reset. work.jsx's window.__edgeData drives it. */
const mlDay = (m) => window.NEEDT.mailDayLabel(m.receivedAt);
const mlTime = (m) => window.NEEDT.mailTime(m.receivedAt);

/* Account dots are identity, not status: neutral, so red stays for "disconnected". */
const ACCTS = { gmail: { label: "Gmail", hue: "var(--text-quaternary)" }, outlook: { label: "Outlook", hue: "var(--text-quaternary)" } };

/* CONNECTIONS — the store lives in stores.jsx (08.10.26) so the phone and
   onboarding share it: window.connections.get / set / reconnect / authorize. */
function useConnections() {
  const [v, setV] = React.useState(() => window.connections.get());
  React.useEffect(() => {
    const on = () => setV(window.connections.get());
    window.addEventListener("needt-connections", on);
    return () => window.removeEventListener("needt-connections", on);
  }, []);
  return v;
}
const ML_SPIN_CSS = "@keyframes ml-spin { to { transform: rotate(360deg); } } .ml-spin { animation: ml-spin 0.8s linear infinite; }";
function MlSpinner({ size }) {
  const z = size || 12;
  return <span aria-hidden="true" className="ml-spin ml-spinner" style={{ width: z, height: z }} />;
}

/* Outlook is down: say what is missing, from when, and fix it in place. */
function MlConnBanner({ id }) {
  const conn = useConnections();
  const state = conn[id];
  const [shown, leaving] = window.useExit ? window.useExit(state !== "connected", 200) : [state !== "connected", false];
  if (!shown) return null;
  const busy = state === "connecting";
  return (
    <div data-conn-banner={id} className={"ml-banner" + (leaving ? " is-leaving" : " nx-swap")} role="status">
      <style>{ML_SPIN_CSS}</style>
      <span className="ml-banner-ico"><MlIcon name="triangle-alert" size={15} /></span>
      <span className="ml-col">
        <span className="ml-banner-title">{busy ? "Reconnecting Outlook…" : "Outlook disconnected"}</span>
        <span className="ml-banner-line">
          Nothing new has arrived since 06:12 — replies from lena@needt.app and the Swisscom bill may be waiting there.
        </span>
      </span>
      <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm nx-press ml-banner-btn" data-conn-reconnect={id} disabled={busy}
        onClick={() => window.connections.reconnect(id)}>
        {busy ? <MlSpinner /> : null}{busy ? "Connecting" : "Reconnect"}
      </button>
    </div>
  );
}

function MlAvatar({ name, size }) {
  const z = size || 32;
  const ini = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return <span className="ml-avatar" style={{ width: z, height: z, fontSize: Math.round(z * 0.38) }}>{ini}</span>;
}

function MlRow({ m, active, onClick, made }) {
  const [hot, setHot] = React.useState(false);
  /* Sent / Drafts rows (mailOut) name who it goes to; they have no context menu. */
  const out = m.folder === "sent" || m.folder === "drafts";
  const who = out ? ((m.to || []).length ? "To " + (m.to || []).map((r) => r.name || r.email).join(", ") : "No recipients") : m.from;
  return (
    <div onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }} data-ctx={out ? undefined : "mail"} data-ctx-id={out ? undefined : m.id}
      data-ml-row={m.id} onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      className={"nx-focus ml-row" + (active ? " is-active" : hot ? " is-hot" : "") + (!m.isRead ? " is-unread" : "")}>
      {!m.isRead ? <span className="ml-row-dot" /> : null}
      <MlAvatar name={out ? ((m.to || [])[0] || {}).name || "?" : m.from} />
      <div className="ml-row-body">
        <span className="ml-row-top">
          <span className="ml-row-from" title={who}>{m.folder === "drafts" ? <span className="ml-row-draft">Draft</span> : null}{who}</span>
          <span className="ml-row-time">{mlTime(m)}</span>
        </span>
        <span className="ml-row-subject" title={m.subject}>{m.subject || (out ? "No subject" : "")}</span>
        <span className="ml-row-preview">{m.preview || ((m.attachments || []).length ? (m.attachments || []).map((f) => f.name).join(", ") : "")}</span>
        {made || m.needsReply ? (
          <span className="ml-row-tags">
            {made ? <span className="ml-tag"><MlIcon name="check" size={11} />Task</span>
              : <span className="ml-tag">Needs you</span>}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* The open thread is screen state (which row is showing), kept in a small
   module store so the right-click "Open" works before the screen mounts.
   Everything else is on the thread itself (window.mailApi). */
const mailStore = window.makeStore({ openId: 1 });
const mlPatch = (id, p) => window.mailApi.patch(id, p);
/* "Make a task" makes a real task, and the task remembers where it came from:
   source = { kind: "mail", label: <sender>, id: <mail id> }; the thread
   remembers it as taskId. Undo takes both back. */
const mlMakeTask = (id, when) => {
  const m = window.mailApi.get(id);
  if (!m) return;
  const app = window.__app;
  const tid = "mail-" + id + "-" + Date.now();
  if (app && app.setTasksRaw) {
    app.setTasksRaw((l) => l.concat([{ id: tid, title: m.suggestedTask || m.subject, projectId: null, status: "todo", Stage: "todo", holder: "you",
      estimatedMinutes: 15, done: false, dueDate: when === "later" ? null : window.NEEDT.toDate("Today"), noSlot: when === "later" ? true : undefined,
      source: { kind: "mail", label: m.from, id: m.id } }]));
  }
  mlPatch(id, { taskId: tid });
  window.toast(when === "later" ? "Task made for later" : "Task made — it's in Inbox", { undo: () => {
    mlPatch(id, { taskId: null });
    if (window.__app && window.__app.setTasksRaw) window.__app.setTasksRaw((l) => l.filter((t) => t.id !== tid));
  } });
};
/* Tomorrow 10:00, 30 min — an Event row (source "needt"). */
const mlToCalendar = (id) => {
  const m = window.mailApi.get(id); if (!m || !window.calEvents) return;
  const N = window.NEEDT;
  const ev = window.calEvents.add(N.eventAt(N.toDate("Tomorrow"), 10, 30, { title: m.subject }));
  window.toast("Added to Calendar — tomorrow 10:00", { undo: () => window.calEvents.remove(ev.id) });
};
/* MAIL OUT — compose, send, drafts, reply, forward: stores.jsx mailApi
   (window.mailOut is an alias of it). */

/* THE COMPOSER (09.10.26) — New message / Reply / Reply all / Forward / a
   draft, one floating window at the bottom right (Craft, Superhuman): From
   (the account picker, when there is more than one), To with suggestions
   from everyone you have mail from, Cc / Bcc on demand, Subject, the
   message, attachments (needtPlatform.pickFile). ⌘↵ sends; Send goes to Sent
   with a 5 s "Undo send" that reopens the draft. Esc or × keeps what you
   wrote in Drafts; the bin throws it away (Undo). */
function MlRecipients({ label, list, onChange, auto, fieldRef, end }) {
  const [q, setQ] = React.useState("");
  const [hi, setHi] = React.useState(0);
  const [focus, setFocus] = React.useState(false);
  const sug = focus ? window.mailOut.suggest(q, list) : [];
  const commit = (text) => {
    const r = window.mailOut.person(text);
    if (!r) return false;
    if (!list.some((x) => x.email.toLowerCase() === r.email.toLowerCase())) onChange(list.concat([r]));
    setQ(""); setHi(0); return true;
  };
  const pick = (c) => { if (!list.some((x) => x.email === c.email)) onChange(list.concat([{ name: c.name, email: c.email }])); setQ(""); setHi(0); };
  const key = (e) => {
    if (sug.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); setHi((h) => (h + (e.key === "ArrowDown" ? 1 : -1) + sug.length) % sug.length); return; }
    if ((e.key === "Enter" || e.key === "Tab") && sug.length && q.trim()) { e.preventDefault(); pick(sug[Math.min(hi, sug.length - 1)]); return; }
    if ((e.key === "Enter" || e.key === "," || e.key === ";" || e.key === " ") && q.trim()) { if (commit(q)) e.preventDefault(); return; }
    if (e.key === "Backspace" && !q && list.length) onChange(list.slice(0, -1));
  };
  return (
    <div className="ml-co-row ml-co-to" data-ml-co-field={label.toLowerCase()}>
      <span className="ml-co-label">{label}</span>
      <span className="ml-co-chips">
        {list.map((r) => (
          <span key={r.email} className={"ml-co-chip" + (window.mailOut.isEmail(r.email) ? "" : " is-bad")} title={r.email} data-ml-co-chip={r.email}>
            {r.name && r.name !== r.email ? r.name : r.email}
            <button type="button" className="ml-co-chip-x" aria-label={"Remove " + (r.name || r.email)} onClick={() => onChange(list.filter((x) => x !== r))}><MlIcon name="x" size={11} /></button>
          </span>
        ))}
        <input ref={fieldRef} className="ml-co-input" value={q} autoFocus={auto} aria-label={label} data-ml-co-input={label.toLowerCase()}
          placeholder={list.length ? "" : "Name or email"} autoComplete="off" spellCheck={false}
          onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={key}
          onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); if (q.trim()) commit(q); }} />
      </span>
      {end}
      {sug.length ? (
        <div className="nx-pop ml-co-sug" role="listbox" aria-label="Suggestions" data-ml-co-sug="">
          {sug.map((c, i) => (
            <button key={c.email} type="button" role="option" aria-selected={i === hi} className={"ml-co-sug-row" + (i === hi ? " is-on" : "")}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }} onMouseEnter={() => setHi(i)}>
              <MlAvatar name={c.name} size={24} />
              <span className="ml-co-sug-name">{c.name}</span>
              <span className="ml-co-sug-mail">{c.email}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const ML_CO_TITLE = (d) => d.inReplyTo != null ? "Reply" : d.forwardOf != null ? "Forward" : d.id != null ? "Draft" : "New message";
function MlComposer({ start, onClose }) {
  const [d, setD] = React.useState(start);
  const [cc, setCc] = React.useState(() => !!((start.cc || []).length || (start.bcc || []).length));
  const [err, setErr] = React.useState(null);
  const body = React.useRef(null), toRef = React.useRef(null);
  const live = React.useRef(d); live.current = d;
  const done = React.useRef(false);
  const set = (p) => { setErr(null); setD((x) => Object.assign({}, x, p)); };
  const accts = window.mailOut.accounts();
  const acct = accts.filter((a) => a.id === d.accountId)[0] || null;
  const conn = useConnections();
  /* A new message starts in To; a reply, or a draft that has someone to go
     to, in the message (a reply at its top, a draft at its end). */
  React.useEffect(() => {
    const b = body.current;
    if (!b || (start.inReplyTo == null && !(start.to || []).length)) return;
    const at = start.inReplyTo != null && !start.text ? 0 : b.value.length;
    b.focus(); b.setSelectionRange(at, at);
  }, []);
  /* Leaving the Mailbox with something written keeps it as a draft. */
  React.useEffect(() => () => { if (!done.current && window.mailOut.filled(live.current)) window.mailOut.saveDraft(live.current); }, []);
  const close = () => {
    if (done.current) return;
    done.current = true;
    if (window.mailOut.filled(d)) { window.mailOut.saveDraft(d); window.toast("Saved to Drafts"); }
    onClose();
  };
  const discard = () => {
    done.current = true;
    const keep = d;
    const undo = d.id != null ? window.mailOut.discard(d.id) : null;
    onClose();
    if (window.mailOut.filled(keep) || undo) window.toast("Draft discarded", { undo: () => { if (undo) undo(); onClose(keep); } });
  };
  const send = () => {
    const why = window.mailOut.check(d);
    if (why) { setErr(why); if (!(d.to || []).length && toRef.current) toRef.current.focus(); return; }
    done.current = true;
    const r = window.mailOut.send(d);
    onClose(null, r.id);
    const who = window.mailOut.names(d.to.length ? d.to : d.cc.length ? d.cc : d.bcc);
    window.toast("Sent to " + who, { ms: 5000, undo: () => onClose(r.undo()) });
  };
  const attach = (files) => {
    const fs = (files || []).map(window.mailOut.fileOf);
    if (fs.length) set({ attachments: (d.attachments || []).concat(fs) });
  };
  const keys = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); send(); }
  };
  const from = accts.length > 1 ? (
    <window.RichMenu small width={280} prompt="Send from" trigger={
      <button type="button" className="ml-co-from" data-ml-co-from="">
        <span className="ml-co-from-name">{acct ? acct.label : "Choose an account"}</span>
        {acct ? <span className="ml-co-from-mail">{acct.email}</span> : null}
        <MlIcon name="chevron-down" size={12} />
      </button>}
      items={accts.map((a) => ({ title: a.label, sub: a.email + (a.state === "connected" ? "" : " · disconnected"), onClick: () => set({ accountId: a.id }) }))} />
  ) : <span className="ml-co-from is-static">{acct ? acct.label + " · " + acct.email : "No mail account connected"}</span>;
  const down = acct && conn[acct.id] && conn[acct.id] !== "connected";
  return ReactDOM.createPortal(
    <div className="nx-up ml-co" role="dialog" aria-label={ML_CO_TITLE(d)} data-ml-composer={d.inReplyTo != null ? "reply" : d.forwardOf != null ? "forward" : "new"} onKeyDown={keys}>
      <div className="ml-co-head">
        <span className="ml-co-title">{ML_CO_TITLE(d)}</span>
        <MlIconButton label="Close — keep as draft" variant="ghost" onClick={close}><MlIcon name="x" size={15} /></MlIconButton>
      </div>
      <div className="ml-co-row">
        <span className="ml-co-label">From</span>
        {from}
      </div>
      <MlRecipients label="To" list={d.to} onChange={(to) => set({ to: to })} auto={start.inReplyTo == null && !(start.to || []).length} fieldRef={toRef}
        end={cc ? null : <button type="button" className="ml-co-ccbtn" data-ml-co-cc="" onClick={() => setCc(true)}>Cc / Bcc</button>} />
      {cc ? <MlRecipients label="Cc" list={d.cc} onChange={(x) => set({ cc: x })} /> : null}
      {cc ? <MlRecipients label="Bcc" list={d.bcc} onChange={(x) => set({ bcc: x })} /> : null}
      <div className="ml-co-row">
        <input className="ml-co-subject" value={d.subject} placeholder="Subject" aria-label="Subject" data-ml-co-subject=""
          onChange={(e) => set({ subject: e.target.value })} />
      </div>
      <div className="ml-co-scroll">
        <textarea ref={body} className="ml-co-body" value={d.text} placeholder="Type something…" aria-label="Message" data-ml-co-body=""
          onChange={(e) => set({ text: e.target.value })} />
        {d.quote ? (
          <div className="ml-co-quote" data-ml-co-quote="">
            <span className="ml-co-quote-head">{d.forwardOf != null ? "Forwarded message · " : ""}{d.quote.from} · {d.quote.when}</span>
            <span className="ml-co-quote-text">{d.quote.text}</span>
          </div>
        ) : null}
        {(d.attachments || []).length ? (
          <div className="ml-co-files">
            {d.attachments.map((f, i) => (
              <span key={f.name + i} className="ml-co-file" data-ml-co-file={f.name}>
                <MlIcon name="paperclip" size={13} /><span className="ml-co-file-name">{f.name}</span>
                {f.size != null ? <span className="ml-co-file-size">{window.mailOut.fileSize(f.size)}</span> : null}
                <button type="button" className="ml-co-chip-x" aria-label={"Remove " + f.name} onClick={() => set({ attachments: d.attachments.filter((x, j) => j !== i) })}><MlIcon name="x" size={11} /></button>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      {err || down ? <div className="ml-co-err" role="alert" data-ml-co-err="">{err || (acct.label + " is disconnected — reconnect it to send.")}</div> : null}
      <div className="ml-co-foot">
        <button type="button" className="nx-btn nx-btn-primary ml-co-send" data-ml-co-send="" onClick={send}>Send<span className="ml-co-kbd">⌘↵</span></button>
        <MlIconButton label="Attach files" variant="ghost" onClick={() => window.needtPlatform.pickFile({ multiple: true }).then(attach)}><MlIcon name="paperclip" size={16} /></MlIconButton>
        <button type="button" className="nx-btn nx-btn-text" data-ml-co-save="" onClick={close}>Save draft</button>
        <span className="ml-push"><MlIconButton label="Discard" variant="ghost" onClick={discard}><MlIcon name="trash-2" size={16} /></MlIconButton></span>
      </div>
    </div>, document.body);
}

window.mailEdge = (kind) => {
  const n = window.mailApi.reset(kind === "mail" || kind === "empty" ? kind : "seed");
  const first = window.mailApi.live()[0];
  mailStore.set((s) => Object.assign({}, s, { openId: first ? first.id : null }));
  return n;
};
/* Right-click actions arrive as events, so the context menu stays generic. */
window.addEventListener("needt-mail", (e) => {
  const id = Number(e.detail.id), act = e.detail.act;
  if (act === "archive") { mlPatch(id, { isArchived: true }); window.toast("Archived", { undo: () => mlPatch(id, { isArchived: false }) }); }
  if (act === "delete") { mlPatch(id, { trashedAt: new Date().toISOString() }); window.toast("Moved to Trash", { undo: () => mlPatch(id, { trashedAt: null }) }); }
  if (act === "unread") { mlPatch(id, { isRead: false }); window.toast("Marked as unread", { undo: () => mlPatch(id, { isRead: true }) }); }
  if (act === "task") mlMakeTask(id, "today");
  if (act === "open") { mailStore.set((s) => Object.assign({}, s, { openId: id })); mlPatch(id, { isRead: true }); }
  if (act === "calendar") mlToCalendar(id);
});

/* Empty tab: the place's picture, one line, one way forward. */
const ML_EMPTY = {
  needs: ["Inbox zero", "Nothing needs you right now.", "Show all mail", "all"],
  done: ["No tasks from mail yet", "Open a message and choose Make a task.", "Show what needs you", "needs"],
  all: ["No mail", "Nothing has arrived from your connected accounts.", "Open Connections", null],
  sent: ["Nothing sent yet", "Messages you send from Needt show up here.", "New message", "compose"],
  drafts: ["No drafts", "Close a message before sending it and it waits here.", "New message", "compose"]
};
const ML_CSS = ".ml-tab { background: transparent; } .ml-tab[aria-pressed=\"false\"]:hover { background: var(--fill-3); color: var(--text-secondary) !important; }";
function MlEmpty({ tab, onTab, onCompose }) {
  const [title, line, cta, to] = ML_EMPTY[tab] || ML_EMPTY.all;
  return (
    <div className="nx-swap ml-empty">
      <window.Art name="mail" size={56} />
      <span className="ml-empty-title">{title}</span>
      <span className="ml-empty-line">{line}</span>
      <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm ml-empty-cta"
        onClick={() => { if (to === "compose") onCompose(); else if (to) onTab(to); else if (window.__app) window.__app.setScreen("connections"); }}>{cta}</button>
    </div>
  );
}

/* The tabs: what needs you, everything, what became tasks — and what you
   wrote (09.10.26): Sent and Drafts (mailOut). */
const ML_TABS = [["needs", "Needs you"], ["all", "All"], ["done", "Made into tasks"], ["sent", "Sent"], ["drafts", "Drafts"]];
function MailScreen() {
  const [tab, setTab] = React.useState("needs");
  const conn = useConnections();
  const { openId } = window.useStore(mailStore);
  const all = window.useMail();
  const setOpenId = (id) => mailStore.set((s) => Object.assign({}, s, { openId: id }));
  const O = window.mailOut;
  const live = O.inbox(all);
  const sent = O.folder(all, "sent"), drafts = O.folder(all, "drafts");
  const list = tab === "sent" ? sent : tab === "drafts" ? drafts : live.filter((m) => tab === "all" || (tab === "needs" ? m.needsReply && !m.taskId : !!m.taskId));
  /* The reading pane: Sent reads its own rows; a draft opens in the composer. */
  const open = tab === "drafts" ? null : tab === "sent" ? sent.find((m) => m.id === openId) || sent[0] || null
    : all.find((m) => m.id === openId && !O.isOut(m)) || live[0] || null;
  const days = list.reduce((a, m) => (a.indexOf(mlDay(m)) < 0 ? a.concat(mlDay(m)) : a), []);
  const counts = { needs: live.filter((m) => m.needsReply && !m.taskId).length, all: live.length, done: live.filter((m) => m.taskId).length, sent: sent.length, drafts: drafts.length };
  /* The composer: null, or the draft it starts from (key = a fresh window). */
  const [co, setCo] = React.useState(null);
  const compose = (d) => setCo({ d: d || O.blank(), key: Date.now() });
  /* closed: reopen = a draft to open again (Undo send / Undo discard), sentId = the row just sent */
  const coClosed = (reopen, sentId) => {
    setCo(reopen ? { d: reopen, key: Date.now() } : null);
    if (sentId != null) { setTab("sent"); setOpenId(sentId); }
  };
  /* Tablet (07.10.26): under 900 the list and the open message stack —
     the list first, a message opens over it, Back returns to the list. */
  const [narrow, setNarrow] = React.useState(() => window.innerWidth < 900);
  const [reading, setReading] = React.useState(false);
  React.useEffect(() => {
    const fit = () => setNarrow(window.innerWidth < 900);
    window.addEventListener("resize", fit); return () => window.removeEventListener("resize", fit);
  }, []);
  React.useEffect(() => {
    const on = (e) => { if (e.detail && e.detail.act === "open") setReading(true); };
    window.addEventListener("needt-mail", on); return () => window.removeEventListener("needt-mail", on);
  }, []);
  const showList = !narrow || !reading, showMsg = !narrow || reading;
  const out = open && open.folder === "sent";
  const archive = (m) => { mlPatch(m.id, { isArchived: true }); window.toast("Archived", { undo: () => mlPatch(m.id, { isArchived: false }) }); };
  const trash = (m) => { mlPatch(m.id, { trashedAt: new Date().toISOString() }); window.toast("Moved to Trash", { undo: () => mlPatch(m.id, { trashedAt: null }) }); };
  const pick = (m) => {
    if (m.folder === "drafts") { compose(O.fromRow(m)); return; }
    setOpenId(m.id); setReading(true); if (!m.isRead) mlPatch(m.id, { isRead: true });
  };

  return (
    <div className="ml-screen">
      <style>{ML_CSS}</style>
      <header className="ml-head">
        <h1 className="ml-title">Mailbox</h1>
        <span className="ml-accts">
          {Object.keys(ACCTS).map((k) => (
            <span key={k} className="ml-acct">
              <span className="ml-acct-dot" style={{ background: ACCTS[k].hue }} />{ACCTS[k].label}
              {conn[k] && conn[k] !== "connected" ? <MlTooltip label="Disconnected since 06:12 — reconnect below" side="bottom"><span className="ml-acct-down" /></MlTooltip> : null}
            </span>
          ))}
        </span>
        {/* Craft's tab pill (Tasks: Inbox / Today / Upcoming), same build. */}
        <span className="ml-tabs">
          {ML_TABS.map(([id, l], i) => (
            <React.Fragment key={id}>
              {id === "sent" ? <span className="ml-tabs-sep" aria-hidden="true" /> : null}
              <button type="button" className={"ml-tab" + (tab === id ? " is-on" : "")} onClick={() => setTab(id)} aria-pressed={tab === id} data-ml-tab={id}>
                {l}{counts[id] || id !== "drafts" ? <span className="ml-tab-n">{counts[id]}</span> : null}
              </button>
            </React.Fragment>
          ))}
        </span>
        <button type="button" className="nx-btn nx-btn-primary ml-new" data-ml-new="" aria-label="New message" onClick={() => compose()}>
          <MlIcon name="pen-line" size={14} /><span className="ml-new-label">New message</span>
        </button>
      </header>

      <div data-ml-layout={narrow ? (reading ? "reading" : "list") : "split"} className="ml-layout">
        {showList ? <div key={tab} className={"scroll-inner nx-swap ml-list" + (narrow ? " is-narrow" : "")} data-ml-list={tab}>
          {tab === "sent" || tab === "drafts" ? null : <MlConnBanner id="outlook" />}
          {!list.length ? <MlEmpty tab={tab} onTab={setTab} onCompose={() => compose()} /> : null}
          {days.map((d) => (
            <React.Fragment key={d}>
              <span className="ml-day">{d}</span>
              {list.filter((m) => mlDay(m) === d).map((m) => (
                <MlRow key={m.id} m={m} made={m.taskId} active={m.id === (open && open.id)} onClick={() => pick(m)} />
              ))}
            </React.Fragment>
          ))}
        </div> : null}

        {/* The open message is a page in a window, like a document. */}
        {showMsg && open ? <article key={open.id} className="scroll-inner nx-swap ml-msg" data-ml-msg={open.id}>
          <div className="ml-msg-bar">
            {narrow ? (
              <button type="button" className="nx-btn nx-btn-text ml-back" data-ml-back="" onClick={() => setReading(false)} aria-label="Back to the list">
                <MlIcon name="chevron-left" size={16} />Mailbox
              </button>
            ) : null}
            {out ? null : open.taskId ? (
              <button type="button" className="nx-btn nx-btn-secondary" onClick={() => { const tid = open.taskId; mlPatch(open.id, { taskId: null }); if (typeof tid === "string" && window.__app && window.__app.setTasksRaw) window.__app.setTasksRaw((l) => l.filter((t) => t.id !== tid)); }}
                title="Task made — click to take it back">
                <MlIcon name="check" size={14} />Task made
              </button>
            ) : (
              <window.RichMenu small prompt="Turn this email into…" width={232} trigger={
                <button type="button" className="nx-btn nx-btn-secondary ml-make">
                  <MlIcon name="list-checks" size={14} />Make a task<MlIcon name="chevron-down" size={12} />
                </button>}
                items={[
                  { art: "task", title: "Task for today", onClick: () => mlMakeTask(open.id, "today") },
                  { art: "later", title: "Task for later", onClick: () => mlMakeTask(open.id, "later") },
                  { art: "event", title: "Calendar event", sub: "Tomorrow 10:00 · 30 min", onClick: () => mlToCalendar(open.id) },
                  { art: "page", title: "Doc" }
                ]} />
            )}
            {out ? null : <MlIconButton label="Add to Calendar" variant="ghost" onClick={() => mlToCalendar(open.id)}><MlIcon name="calendar-clock" size={16} /></MlIconButton>}
            <MlIconButton label="Reply" variant="ghost" onClick={() => compose(O.reply(open, false))}><span data-ml-act="reply"><MlIcon name="reply" size={16} /></span></MlIconButton>
            <MlIconButton label="Reply all" variant="ghost" onClick={() => compose(O.reply(open, true))}><span data-ml-act="reply-all"><MlIcon name="reply-all" size={16} /></span></MlIconButton>
            <MlIconButton label="Forward" variant="ghost" onClick={() => compose(O.forward(open))}><span data-ml-act="forward"><MlIcon name="forward" size={16} /></span></MlIconButton>
            {out ? <MlIconButton label="Move to Trash" variant="ghost" onClick={() => trash(open)}><MlIcon name="trash-2" size={16} /></MlIconButton>
              : <MlIconButton label="Archive" variant="ghost" onClick={() => archive(open)}><MlIcon name="archive" size={16} /></MlIconButton>}
          </div>
          <h2 className="ml-subject">{open.subject || "No subject"}</h2>
          <div className="ml-from">
            <MlAvatar name={out ? ((open.to || [])[0] || {}).name || "?" : open.from} size={36} />
            <span className="ml-from-col">
              <span className="ml-from-name">{out ? "To " + (open.to || []).map((r) => r.name || r.email).join(", ") : open.from}</span>
              <span className="ml-meta">{out
                ? ["From " + (open.fromEmail || O.label(open.accountId)), (open.cc || []).length ? "Cc " + O.names(open.cc) : null, (open.bcc || []).length ? "Bcc " + O.names(open.bcc) : null].filter(Boolean).join(" · ")
                : open.fromEmail + " · " + ((ACCTS[open.accountId] || {}).label || O.label(open.accountId))}</span>
            </span>
            <span className="ml-meta ml-push">{mlDay(open)}, {mlTime(open)}</span>
          </div>
          {!out && open.taskId && open.suggestedTask ? (
            /* The task this mail became, drawn by Task (card · preview): the
               real one from app state when it is there, else its shape. */
            <window.Task layout="card" density="preview" task={(window.__app && window.__app.tasksNow || []).find((t) => t.id === open.taskId)
              || { id: open.taskId, title: open.suggestedTask, projectId: null, dueDate: window.NEEDT.toDate("Today"), source: { kind: "mail", label: open.from, id: open.id } }}
              onOpen={(id) => window.__app && window.__app.openTask && window.__app.openTask(id)} />
          ) : null}
          <div className="ml-body">
            {(open.body || []).map((p, i) => <p key={i} className="ml-p">{p}</p>)}
          </div>
          {open.quote ? (
            <div className="ml-co-quote is-read">
              <span className="ml-co-quote-head">{open.forwardOf != null ? "Forwarded message · " : ""}{open.quote.from} · {open.quote.when}</span>
              <span className="ml-co-quote-text">{open.quote.text}</span>
            </div>
          ) : null}
          {open.attachment ? (
            <span className="ml-attach">
              <span className="ml-attach-ico">PDF</span>{open.attachment}
            </span>
          ) : null}
          {(open.attachments || []).map((f, i) => (
            <span key={f.name + i} className="ml-attach">
              <span className="ml-attach-ico is-file"><MlIcon name="paperclip" size={12} /></span>{f.name}
              {f.size != null ? <span className="ml-meta">{O.fileSize(f.size)}</span> : null}
            </span>
          ))}
          <button type="button" className="ml-reply" data-ml-reply-box="" onClick={() => compose(out ? O.forward(open) : O.reply(open, false))}>
            <MlIcon name={out ? "forward" : "reply"} size={14} />{out ? "Forward…" : "Reply to " + String(open.from).split(" ")[0] + "…"}
          </button>
        </article> : null}
        {showMsg && !open && !narrow && list.length ? (
          <div className="nx-swap ml-msg is-quiet" data-ml-msg-empty="">
            <span className="ml-meta">{tab === "drafts" ? "Pick a draft to keep writing." : "Pick a message to read it."}</span>
          </div>
        ) : null}
      </div>
      {co ? <MlComposer key={co.key} start={co.d} onClose={coClosed} /> : null}
    </div>
  );
}

Object.assign(window, { MailScreen, mailStore, useConnections, MlSpinner, MlComposer });
/* MAIL: the live thread list, for readers that still look for the old global. */
try { Object.defineProperty(window, "MAIL", { configurable: true, get: () => window.mailApi.list() }); } catch (e) {}
