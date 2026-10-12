/* phone-mail.jsx — Plates screens (08.10.26). Register with window.PkPlaces[id].
 *
 * MAILBOX on the phone kit — replaces MbMail / MbMailSheet / MbOutlookBanner.
 * A place, not a client: the same threads as the desktop (window.mailApi,
 * "needt.mail.threads"), the same connections store (mbUseConn /
 * mbReconnect in Mobile.jsx), so reading, archiving or making a task shows
 * on every screen.
 *
 *   header      "Mailbox" + a compact "2 unread" (rolling digits).
 *   banner      Outlook down → one quiet raised line + one action (Reconnect).
 *   rows        PkRow: avatar, sender, subject, time, a lavender unread dot.
 *               Swipe right = Archive (and read); left = Make task — the
 *               thread becomes an Inbox task (source: mail) and leaves the
 *               mailbox. mailApi has no snooze, so left is Make task.
 *   pull down   search by sender / subject / preview; a hit opens the thread.
 *   thread      PkSheet (detents 0.6 / 0.92): sender, subject, the message,
 *               a reply field; the foot: Reply (primary) · Make task · Archive.
 *   all read    the header says so in one line; the threads fold under "Read".
 *   wave 3      (09.10.26) the desktop's functions, at phone size: the three
 *               views (Needs you · All · Made into tasks, MailScreen.jsx's
 *               tabs) as glass chips; hold a thread → its actions (open,
 *               reply, make a task for today / later, add to Calendar, take
 *               a task back, mark unread, archive, move to Trash — the
 *               desktop's right-click menu, "needt-mail" acts); the thread
 *               sheet's foot: Reply · Make task (today / later / event) ·
 *               ⋯ (Forward, Calendar, Unread, Trash). Forward opens a small
 *               compose sheet (To, a note).
 *   compose     (09.10.26) "New" in the header opens the composer — a
 *               full-height glass PkSheet: From (the account picker, an
 *               action sheet), To with suggestions from everyone you have
 *               mail from, Cc / Bcc on demand, Subject, the message,
 *               attachments (needtPlatform.pickFile). Send puts it in Sent with
 *               a 5 s Undo (the snack) that reopens it; Save draft (or
 *               closing with something written) keeps it in Drafts. Reply,
 *               Reply all and Forward open the same composer. The views gain
 *               Sent and Drafts. The data is mailOut (MAIL OUT below — the
 *               same block as MailScreen.jsx).
 */
const { Icon: PmlIcon } = window.NeedtDesignSystem_25d3c8;

const pmlDay = (m) => window.NEEDT.mailDayLabel(m.receivedAt);
const pmlTime = (m) => window.NEEDT.mailTime(m.receivedAt);
const pmlWhen = (m) => (pmlDay(m) === "Today" ? pmlTime(m) : pmlDay(m));
const pmlAcct = (m) => (m.accountId === "outlook" ? "Outlook" : "Gmail");
const pmlInitials = (name) => String(name || "?").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const pmlPatch = (id, p) => window.mailApi.patch(id, p);
/* every thread, sent and drafts included (the views filter) */
const pmlUseAll = () => mbUse(window.mailApi.store);

/* MAIL OUT — compose, send, drafts, reply, forward: stores.jsx mailApi
   (window.mailOut is an alias of it). */


/* Make task: the same row MbMailSheet made — an Inbox task that remembers
   the thread (source), and the thread remembers it (taskId). Returns undo. */
function pmlMakeTask(m, archive, when) {
  const id = Date.now();
  const before = { taskId: m.taskId, isArchived: m.isArchived, isRead: m.isRead };
  /* MailScreen.jsx mlMakeTask: "today" has today's date, "later" no slot. */
  const day = when === "today" ? { dueDate: window.NEEDT.toDate("Today") } : when === "later" ? { dueDate: null, noSlot: true } : null;
  mbTaskStore.set((l) => [Object.assign({ id: id, title: m.suggestedTask || m.subject, projectId: null, estimatedMinutes: 15, done: false,
    source: { kind: "mail", label: m.from, id: m.id } }, day)].concat(l));
  pmlPatch(m.id, Object.assign({ taskId: id, isRead: true }, archive ? { isArchived: true } : null));
  return () => { mbTaskStore.set((l) => l.filter((t) => t.id !== id)); pmlPatch(m.id, before); };
}
/* Take the task back (the desktop's "Task made" toggle). */
function pmlUntask(m) {
  const tid = m.taskId, t = mbTaskStore.get().filter((x) => x.id === tid)[0];
  mbTaskStore.set((l) => l.filter((x) => x.id !== tid));
  pmlPatch(m.id, { taskId: null });
  return () => { if (t) mbTaskStore.set((l) => [t].concat(l)); pmlPatch(m.id, { taskId: tid }); };
}
/* Tomorrow 10:00, 30 min — an Event row, as MailScreen.jsx mlToCalendar. */
function pmlToCalendar(m) {
  if (!window.calEvents) return null;
  const N = window.NEEDT;
  const ev = window.calEvents.add(N.eventAt(N.toDate("Tomorrow"), 10, 30, { title: m.subject }));
  return () => window.calEvents.remove(ev.id);
}
function pmlTrash(m) {
  pmlPatch(m.id, { trashedAt: new Date().toISOString() });
  return () => pmlPatch(m.id, { trashedAt: null });
}
function pmlUnread(m) {
  const was = m.isRead;
  pmlPatch(m.id, { isRead: !was });
  return () => pmlPatch(m.id, { isRead: was });
}
/* One list of what can be done to a thread — the hold menu and the sheet's
   ⋯ read it, so both always offer the same things. */
function pmlActions(m, say, h) {
  const made = !!m.taskId;
  return [
    h.open ? { label: "Open", icon: "mail", glyph: "mail", onClick: () => h.open(m), data: { "data-pml-act": "open" } } : null,
    h.reply ? { label: "Reply", icon: "reply", hue: "var(--info)", onClick: () => h.reply(m), data: { "data-pml-act": "reply" } } : null,
    made ? { label: "Take the task back", hint: "The thread stays; the task goes", icon: "rotate-ccw", hue: "var(--accent)", onClick: () => say("Task taken back", pmlUntask(m)), data: { "data-pml-act": "untask" } } : null,
    made ? null : { label: "Task for today", hint: "“" + (m.suggestedTask || m.subject) + "”", icon: "circle-check", hue: "var(--accent)", onClick: () => say("Task made · today", pmlMakeTask(m, false, "today")), data: { "data-pml-act": "today" } },
    made ? null : { label: "Task for later", hint: "No date — in Inbox", icon: "inbox", hue: "var(--v2p-lav)", onClick: () => say("Task made for later", pmlMakeTask(m, false, "later")), data: { "data-pml-act": "later" } },
    window.calEvents ? { label: "Add to Calendar", hint: "Tomorrow 10:00 · 30 min", icon: "calendar-clock", glyph: "calendar", onClick: () => say("Added to Calendar — tomorrow 10:00", pmlToCalendar(m)), data: { "data-pml-act": "calendar" } } : null,
    h.replyAll ? { label: "Reply all", icon: "reply-all", hue: "var(--info)", onClick: () => h.replyAll(m), data: { "data-pml-act": "reply-all" } } : null,
    h.forward ? { label: "Forward", icon: "forward", hue: "var(--info)", onClick: () => h.forward(m), data: { "data-pml-act": "forward" } } : null,
    { label: m.isRead ? "Mark as unread" : "Mark as read", icon: "mail-unread", hue: "var(--v2p-lav)", onClick: () => say(m.isRead ? "Marked as unread" : "Marked as read", pmlUnread(m)), data: { "data-pml-act": "unread" } },
    { label: "Archive", icon: "archive", hue: "var(--success)", onClick: () => { if (h.closed) h.closed(); say("Archived", pmlArchive(m)); }, data: { "data-pml-act": "archive" } },
    { label: "Move to Trash", icon: "trash-2", danger: true, onClick: () => { if (h.closed) h.closed(); say("Moved to Trash", pmlTrash(m)); }, data: { "data-pml-act": "trash" } }
  ];
}

function pmlArchive(m) {
  const before = { isArchived: m.isArchived, isRead: m.isRead };
  pmlPatch(m.id, { isArchived: true, isRead: true });
  return () => pmlPatch(m.id, before);
}

function PmlAvatar({ name, big }) {
  return <span className={pkCx("pml-avatar", big && "is-big")} aria-hidden="true">{pmlInitials(name)}</span>;
}

/* Outlook down: one quiet line, one action. */
function PmlOutlook({ conn, say }) {
  const st = conn.outlook;
  if (st !== "disconnected" && st !== "connecting") return null;
  const busy = st === "connecting";
  return (
    <div className="pml-banner" role="status" data-pml-banner="outlook" data-state={st}>
      <span className="pk-alert-dot" aria-hidden="true" />
      <span className="pml-banner-text">
        <span className="pml-banner-title">{busy ? "Reconnecting Outlook…" : "Outlook disconnected"}</span>
        <span className="pml-banner-line">Nothing new since 06:12</span>
      </span>
      <PkButton kind="chip" disabled={busy} onClick={() => mbReconnect("outlook", "Outlook", say)} data-pml-reconnect>
        {busy ? "Connecting" : "Reconnect"}
      </PkButton>
    </div>
  );
}

function PmlRow({ m, X, onOpen, onHold }) {
  const unread = !m.isRead;
  const out = window.mailOut.isOut(m);
  const title = out
    ? <span className="pml-from">{m.folder === "drafts" ? <span className="pml-draft">Draft</span> : null}{(m.to || []).length ? "To " + (m.to || []).map((r) => r.name || r.email).join(", ") : "No recipients"}</span>
    : <span className={pkCx("pml-from", unread && "is-unread")}>{m.from}</span>;
  if (out) {
    return (
      <PkHold onHold={() => onHold(m)} data={{ "data-pml-row": m.id }}>
        <PkRow id={m.id} title={title} meta={<span className="pml-subject">{m.subject || "No subject"}</span>} time={<span className="pml-time">{pmlWhen(m)}</span>}
          lead={<PmlAvatar name={((m.to || [])[0] || {}).name || "?"} />} check={false} canDone={false} canLater={false} onOpen={() => onOpen(m)} />
      </PkHold>
    );
  }
  const meta = (
    <>
      {m.taskId ? <span className="pml-tag"><PmlIcon name="circle-check" size={12} />Task</span> : null}
      <span className="pml-subject">{m.subject}</span>
    </>
  );
  const time = (
    <span className="pml-time">
      {unread ? <span className="pml-dot" aria-label="Unread" role="img" /> : null}
      {pmlWhen(m)}
    </span>
  );
  return (
    <PkHold onHold={() => onHold(m)} data={{ "data-pml-row": m.id }}>
      <PkRow id={m.id} title={title} meta={meta} time={time} lead={<PmlAvatar name={m.from} />} check={false}
        phase={X.phase[m.id]} out={!!X.out[m.id]} canDone canLater={!m.taskId}
        doneLabel="Archive" doneIcon="archive" laterLabel="Make task" laterIcon="circle-check"
        onOpen={() => onOpen(m)} onSwipe={(side) => X.exit(m, side)} />
    </PkHold>
  );
}

/* ── the thread ── */
function PmlThread({ m, open, onClose, conn, say, onActs, onCompose }) {
  if (!m) return <PkSheet open={false} onClose={onClose} detents={[0.6, 0.92]} label="Thread" />;
  const O = window.mailOut;
  const sent = m.folder === "sent";
  const made = !!m.taskId;
  const down = !sent && m.accountId === "outlook" && conn.outlook !== "connected";
  const reply = () => onCompose(O.reply(m, false));
  /* Make a task: the desktop's "Turn this email into…" (today · later · event);
     once made, the same button takes it back. */
  const task = () => {
    if (made) { say("Task taken back", pmlUntask(m)); return; }
    onActs({ title: "Turn this email into…", meta: m.subject, actions: pmlActions(m, say, {}).filter((a) => a && /today|later|calendar/.test(a.data["data-pml-act"])) });
  };
  const h = { replyAll: (x) => onCompose(O.reply(x, true)), forward: (x) => onCompose(O.forward(x)), closed: onClose };
  const more = () => onActs({ title: m.subject, meta: sent ? "To " + O.names(m.to) : m.from,
    actions: sent
      ? [h.replyAll ? { label: "Reply all", icon: "reply-all", hue: "var(--info)", onClick: () => h.replyAll(m), data: { "data-pml-act": "reply-all" } } : null,
        { label: "Move to Trash", icon: "trash-2", danger: true, onClick: () => { onClose(); say("Moved to Trash", pmlTrash(m)); }, data: { "data-pml-act": "trash" } }]
      : pmlActions(m, say, h).filter((a) => a && !/today|later|untask/.test(a.data["data-pml-act"])) });
  const head = (
    <div className="pml-head">
      <PmlAvatar name={sent ? ((m.to || [])[0] || {}).name || "?" : m.from} big />
      <span className="pml-head-text">
        <span className="pml-head-from">{sent ? "To " + (m.to || []).map((r) => r.name || r.email).join(", ") : m.from}</span>
        <span className="pml-head-meta">{(sent ? ["From " + (m.fromEmail || O.label(m.accountId)), pmlDay(m) + " " + pmlTime(m)] : [m.fromEmail, pmlDay(m) + " " + pmlTime(m), pmlAcct(m)]).filter(Boolean).join(" · ")}</span>
      </span>
    </div>
  );
  /* The actions in the sheet's foot: the kit keeps it on screen at the 0.6
     detent too. */
  const actions = sent ? (
    <>
      <PkButton kind="primary" icon="forward" onClick={() => h.forward(m)} data-pml-act="forward">Forward</PkButton>
      <PkButton icon="ellipsis" onClick={more} data-pml-act="more" aria-label="More" className="pml-act-archive" />
    </>
  ) : (
    <>
      <PkButton kind="primary" icon="reply" onClick={reply} data-pml-act="reply">Reply</PkButton>
      <PkButton icon={made ? "circle-check" : "list-checks"} onClick={task} data-pml-act="task" aria-label={made ? "Task made — take it back" : "Make a task"}>{made ? "Task made" : "Make task"}</PkButton>
      <PkButton icon="ellipsis" onClick={more} data-pml-act="more" aria-label="More" className="pml-act-archive" />
    </>
  );
  return (
    <PkSheet open={open} onClose={onClose} detents={[0.6, 0.92]} label={m.subject} className="pml-sheet" head={head} title={m.subject || "No subject"} footer={actions}>
      <div className="pml-body" data-pml-thread={m.id}>
        {(m.body || []).map((p, i) => <p key={i} className="pml-para">{p}</p>)}
        {m.quote ? (
          <div className="pml-quote pk-glass">
            <span className="pml-quote-from">{m.forwardOf != null ? "Forwarded · " : ""}{m.quote.from} · {m.quote.when}</span>
            <span className="pml-quote-text">{m.quote.text}</span>
          </div>
        ) : null}
        {m.attachment ? <span className="pml-file"><PmlIcon name="paperclip" size={14} />{m.attachment}</span> : null}
        {(m.attachments || []).map((f, i) => <span key={f.name + i} className="pml-file"><PmlIcon name="paperclip" size={14} />{f.name}{f.size != null ? " · " + O.fileSize(f.size) : ""}</span>)}
      </div>
      {sent ? null : (
        <p className="pml-as-task">
          {made ? <><PmlIcon name="circle-check" size={14} />Task made — find it in Tasks</>
            : <>As a task: “{m.suggestedTask || m.subject}”</>}
        </p>
      )}
      {down ? <p className="pml-down"><span className="pk-alert-dot" />Outlook is disconnected — replies wait until it is back.</p> : null}
    </PkSheet>
  );
}

/* ── the composer: New message, Reply, Reply all, Forward, a draft ── */
function PmlRecipients({ label, list, onChange, fieldId, auto, end }) {
  const O = window.mailOut;
  const [q, setQ] = React.useState("");
  const [focus, setFocus] = React.useState(false);
  const sug = focus ? O.suggest(q, list) : [];
  const commit = (text) => {
    const r = O.person(text);
    if (!r) return false;
    if (!list.some((x) => x.email.toLowerCase() === r.email.toLowerCase())) onChange(list.concat([r]));
    setQ(""); return true;
  };
  const pick = (c) => { if (!list.some((x) => x.email === c.email)) onChange(list.concat([{ name: c.name, email: c.email }])); setQ(""); };
  const key = (e) => {
    if (e.key === "Enter" && sug.length && q.trim()) { e.preventDefault(); pick(sug[0]); return; }
    if ((e.key === "Enter" || e.key === "," || e.key === ";" || e.key === " ") && q.trim()) { if (commit(q)) e.preventDefault(); return; }
    if (e.key === "Backspace" && !q && list.length) onChange(list.slice(0, -1));
  };
  return (
    <div className="pml-co-field" data-pml-co-field={label.toLowerCase()}>
      <div className="pml-co-line">
        <label className="pml-co-label" htmlFor={fieldId}>{label}</label>
        <span className="pml-co-chips">
          {list.map((r) => (
            <span key={r.email} className={pkCx("pml-co-chip", !O.isEmail(r.email) && "is-bad")} data-pml-co-chip={r.email}>
              <span className="pml-co-chip-name">{r.name && r.name !== r.email ? r.name : r.email}</span>
              <button type="button" className="pml-co-chip-x" aria-label={"Remove " + (r.name || r.email)} onClick={() => onChange(list.filter((x) => x !== r))}><PmlIcon name="x" size={12} /></button>
            </span>
          ))}
          <input id={fieldId} className="pml-co-input" value={q} autoFocus={auto} inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false}
            placeholder={list.length ? "" : "Name or email"} data-pml-co-input={label.toLowerCase()}
            onChange={(e) => setQ(e.target.value)} onKeyDown={key} onFocus={() => setFocus(true)}
            onBlur={() => { window.setTimeout(() => setFocus(false), 120); if (q.trim()) commit(q); }} />
        </span>
        {end || null}
      </div>
      {sug.length ? (
        <div className="pml-co-sug" role="listbox" aria-label="Suggestions" data-pml-co-sug="">
          {sug.map((c) => (
            <button key={c.email} type="button" role="option" aria-selected="false" className="pml-co-sug-row" onPointerDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
              <PmlAvatar name={c.name} />
              <span className="pml-co-sug-text"><span className="pml-co-sug-name">{c.name}</span><span className="pml-co-sug-mail">{c.email}</span></span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const PML_CO_TITLE = (d) => (d.inReplyTo != null ? "Reply" : d.forwardOf != null ? "Forward" : d.id != null ? "Draft" : "New message");
function PmlComposer({ co, onClose, say, onSent }) {
  const O = window.mailOut;
  const last = React.useRef(null); if (co) last.current = co;
  const c0 = co || last.current;
  const [d, setD] = React.useState(c0 ? c0.d : O.blank());
  const [cc, setCc] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [acts, setActs] = React.useState(null);
  /* a new composer (key) starts from its draft */
  React.useEffect(() => {
    if (!co) return;
    setD(co.d); setErr(null);
    setCc(!!((co.d.cc || []).length || (co.d.bcc || []).length));
  }, [co && co.key]);
  const set = (p) => { setErr(null); setD((x) => Object.assign({}, x, p)); };
  const accts = O.accounts();
  const acct = accts.filter((a) => a.id === d.accountId)[0] || null;
  /* closing (swipe, scrim, Esc, Close) keeps what you wrote */
  const close = () => {
    if (!co) return;
    if (O.filled(d)) { const id = O.saveDraft(d); setD((x) => Object.assign({}, x, { id: id })); say("Saved to Drafts"); }
    onClose();
  };
  const saveDraft = () => { const id = O.saveDraft(d); onClose(); say("Saved to Drafts"); return id; };
  const discard = () => {
    const keep = d, undo = d.id != null ? O.discard(d.id) : null;
    onClose();
    say("Draft discarded", () => { if (undo) undo(); onSent(null, keep); });
  };
  const send = () => {
    const why = O.check(d);
    if (why) { setErr(why); return; }
    const r = O.send(d);
    onClose();
    onSent(r.id);
    say("Sent to " + O.names(d.to.length ? d.to : d.cc.length ? d.cc : d.bcc), () => onSent(null, r.undo()));
  };
  const attach = (files) => {
    const fs = (files || []).map(O.fileOf);
    if (fs.length) set({ attachments: (d.attachments || []).concat(fs) });
  };
  const pickFrom = () => setActs({ title: "Send from", actions: accts.map((a) => ({ label: a.label, hint: a.email + (a.state === "connected" ? "" : " · disconnected"), icon: "mail", glyph: "mail",
    check: a.id === d.accountId, onClick: () => set({ accountId: a.id }), data: { "data-pml-co-acct": a.id } })) });
  const fromRow = (
    <div className="pml-co-field pml-co-line pml-co-fromline">
      <span className="pml-co-label">From</span>
      {accts.length > 1
        ? <PkGlass as="button" round className="pml-co-from" onClick={pickFrom} data-pml-co-from="">{acct ? acct.label : "Choose"}<span className="pml-co-from-mail">{acct ? acct.email : ""}</span><PmlIcon name="chevron-down" size={14} /></PkGlass>
        : <span className="pml-co-from is-static">{acct ? acct.label + " · " + acct.email : "No mail account connected"}</span>}
    </div>
  );
  const footer = (
    <>
      <PkButton onClick={saveDraft} data-pml-co-save="">Save draft</PkButton>
      <PkButton kind="primary" icon="move-right" onClick={send} data-pml-co-send="">Send</PkButton>
    </>
  );
  return (
    <>
      <PkSheet open={!!co} onClose={close} detents={[0.94]} title={PML_CO_TITLE(d)} label={PML_CO_TITLE(d)} footer={footer} className="pml-co" bodyClass="pml-co-body">
        <div className="pml-co-form" data-pml-composer={d.inReplyTo != null ? "reply" : d.forwardOf != null ? "forward" : "new"}>
          {fromRow}
          <PmlRecipients label="To" list={d.to} onChange={(to) => set({ to: to })} fieldId="pml-co-to"
            end={cc ? null : <button type="button" className="pml-co-ccbtn" onClick={() => setCc(true)} data-pml-co-cc="">Cc / Bcc</button>} />
          {cc ? <PmlRecipients label="Cc" list={d.cc} onChange={(x) => set({ cc: x })} fieldId="pml-co-cc" /> : null}
          {cc ? <PmlRecipients label="Bcc" list={d.bcc} onChange={(x) => set({ bcc: x })} fieldId="pml-co-bcc" /> : null}
          <div className="pml-co-field">
            <input className="pml-co-subject" value={d.subject} placeholder="Subject" aria-label="Subject" onChange={(e) => set({ subject: e.target.value })} data-pml-co-subject="" />
          </div>
          <PkField className="pml-co-text" multiline grow rows={6} value={d.text} onChange={(e) => set({ text: e.target.value })} placeholder="Type something…"
            inputProps={{ "aria-label": "Message", "data-pml-co-body": "" }} />
          {d.quote ? (
            <div className="pml-quote pk-glass" data-pml-co-quote="">
              <span className="pml-quote-from">{d.forwardOf != null ? "Forwarded · " : ""}{d.quote.from} · {d.quote.when}</span>
              <span className="pml-quote-text">{d.quote.text}</span>
            </div>
          ) : null}
          {(d.attachments || []).length ? <div className="pml-co-files">
            {d.attachments.map((f, i) => (
              <span key={f.name + i} className="pml-file pml-co-file" data-pml-co-file={f.name}>
                <PmlIcon name="paperclip" size={14} /><span className="pml-co-file-name">{f.name}</span>{f.size != null ? <span className="pml-co-file-size">{O.fileSize(f.size)}</span> : null}
                <button type="button" className="pml-co-chip-x" aria-label={"Remove " + f.name} onClick={() => set({ attachments: d.attachments.filter((x, j) => j !== i) })}><PmlIcon name="x" size={12} /></button>
              </span>
            ))}
          </div> : null}
          <div className="pml-co-tools">
            <PkButton kind="chip" icon="paperclip" onClick={() => window.needtPlatform.pickFile({ multiple: true }).then(attach)} data-pml-co-attach-btn="">Attach</PkButton>
            <PkButton kind="ghost" icon="trash-2" onClick={discard} data-pml-co-discard="" aria-label="Discard">Discard</PkButton>
          </div>
          {err ? <p className="pml-err" role="alert" data-pml-co-err="">{err}</p> : null}
        </div>
      </PkSheet>
      <PkActions acts={acts} onClose={() => setActs(null)} />
    </>
  );
}

/* The desktop's views (MailScreen.jsx tabs), with what you wrote. */
const PML_VIEWS = [["needs", "Needs you"], ["all", "All"], ["done", "Made into tasks"], ["sent", "Sent"], ["drafts", "Drafts"]];
const pmlIn = (v, m) => v === "all" || (v === "needs" ? m.needsReply && !m.taskId : !!m.taskId);
const PML_EMPTY = { needs: ["Nothing needs you right now.", "all", "Show all mail"], done: ["No tasks from mail yet — hold a message and choose a task.", "needs", "Show what needs you"], all: ["Inbox clear ✓ — nothing waiting on you.", null, null],
  sent: ["Nothing sent yet.", "compose", "New message"], drafts: ["No drafts. Close a message before sending and it waits here.", "compose", "New message"] };

/* ── the mailbox ── */
function PmlMailbox({ say }) {
  const O = window.mailOut;
  const every = pmlUseAll();
  const live = O.inbox(every);
  const outs = { sent: O.folder(every, "sent"), drafts: O.folder(every, "drafts") };
  const [view, setView] = React.useState("needs");
  const [acts, setActs] = React.useState(null);
  const [co, setCo] = React.useState(null);
  const compose = (d) => setCo({ d: d || O.blank(), key: Date.now() });
  const list = outs[view] || live.filter((m) => pmlIn(view, m));
  const counts = { needs: live.filter((m) => pmlIn("needs", m)).length, all: live.length, done: live.filter((m) => pmlIn("done", m)).length, sent: outs.sent.length, drafts: outs.drafts.length };
  const conn = mbUseConn();
  const [openId, setOpenId] = React.useState(null);
  const [readOpen, setReadOpen] = React.useState(false);
  const X = usePkExit((m, kind) => {
    if (kind === "later") say("Task made · in Inbox", pmlMakeTask(m, true));
    else say("Archived", pmlArchive(m));
  });
  const all = window.mailApi.list();
  const thread = openId != null ? all.filter((m) => String(m.id) === String(openId))[0] || null : null;
  /* the sheet keeps the last thread on screen while it slides away */
  const last = React.useRef(null);
  if (thread) last.current = thread.id;
  const shown = thread || (last.current != null ? all.filter((m) => String(m.id) === String(last.current))[0] || null : null);
  const openThread = (m) => {
    if (m.folder === "drafts") { compose(O.fromRow(m)); return; }
    setOpenId(m.id); if (!m.isRead) pmlPatch(m.id, { isRead: true });
  };
  /* from a sheet: close it, then the composer comes up */
  const composeFrom = (d) => { setOpenId(null); compose(d); };
  /* sent → Sent view; reopen → the composer again (Undo send / Undo discard) */
  const sent = (id, reopen) => { if (reopen) compose(reopen); else if (id != null) setView("sent"); };

  const unread = list.filter((m) => !m.isRead).length;
  const days = [];
  list.forEach((m) => { const d = pmlDay(m); if (days.indexOf(d) < 0) days.push(d); });
  const hold = (m) => setActs(O.isOut(m)
    ? { title: m.subject || "No subject", meta: "To " + O.names(m.to), actions: [
      m.folder === "drafts" ? { label: "Edit", icon: "pen-line", hue: "var(--info)", onClick: () => compose(O.fromRow(m)), data: { "data-pml-act": "edit" } }
        : { label: "Forward", icon: "forward", hue: "var(--info)", onClick: () => compose(O.forward(m)), data: { "data-pml-act": "forward" } },
      { label: m.folder === "drafts" ? "Discard draft" : "Move to Trash", icon: "trash-2", danger: true,
        onClick: () => m.folder === "drafts" ? say("Draft discarded", O.discard(m.id)) : say("Moved to Trash", pmlTrash(m)), data: { "data-pml-act": "trash" } }] }
    : { title: m.subject, meta: m.from + " · " + pmlWhen(m), actions: pmlActions(m, say, { open: openThread, reply: (x) => compose(O.reply(x, false)), replyAll: (x) => compose(O.reply(x, true)), forward: (x) => compose(O.forward(x)) }) });
  const rows = (l) => l.map((m) => <PmlRow key={m.id} m={m} X={X} onOpen={openThread} onHold={hold} />);

  const pull = {
    search: (q) => {
      const s = q.toLowerCase();
      return live.concat(outs.sent).filter((m) => [m.from, m.subject, m.preview, O.names(m.to)].some((x) => String(x || "").toLowerCase().indexOf(s) > -1)).slice(0, 5)
        .map((m) => ({ id: m.id, title: m.subject, meta: (O.isOut(m) ? "To " + O.names(m.to) : m.from) + " · " + pmlWhen(m), mail: m }));
    },
    onPick: (hit) => openThread(hit.mail),
    placeholder: "Search",
    hint: "Mail, by sender, subject or any word in it."
  };

  const unreadAll = live.filter((m) => !m.isRead).length;
  const sub = live.length
    ? (unreadAll
      ? <span className="pml-sub" data-pml-unread={unreadAll}><PkNumber value={unreadAll} label={unreadAll + " unread"} /><span>unread</span></span>
      : <span className="pml-sub" data-pml-unread="0">All read ✓</span>)
    : null;
  const outView = view === "sent" || view === "drafts";
  const empty = PML_EMPTY[view];

  return (
    <>
      <PkScreen screen="mail" title="Mailbox" glyph="mail" sub={sub} onPull={pull}
        right={<PkButton kind="chip" icon="plus" onClick={() => compose()} aria-label="New message" data-pml-new="">New</PkButton>}>
        {outView ? null : <PmlOutlook conn={conn} say={say} />}
        {live.length || outs.sent.length || outs.drafts.length ? (
          <PkChips className="pml-views" label="Show">
            {PML_VIEWS.map(([k, l]) => (
              <PkGlass key={k} as="button" round className={pkCx("pml-view", view === k && "is-on")} aria-pressed={view === k} onClick={() => setView(k)} data-pml-view={k}>
                {l}<span className="pml-view-n">{counts[k]}</span>
              </PkGlass>
            ))}
          </PkChips>
        ) : null}
        {!list.length ? <PkEmpty line={empty[0]} action={empty[1] === "compose" ? <PkButton kind="chip" icon="plus" onClick={() => compose()}>{empty[2]}</PkButton>
            : empty[1] && live.length ? <PkButton kind="chip" onClick={() => setView(empty[1])}>{empty[2]}</PkButton> : null} />
          : !outView && !unread && view === "all" ? (
            <>
              <PkSection title="Read" count={list.length} folded={!readOpen} onFold={() => setReadOpen((v) => !v)} className="pml-sec">
                {rows(list)}
              </PkSection>
            </>
          ) : days.map((d) => (
            <PkSection key={d} title={d} count={null} className="pml-sec">
              {rows(list.filter((m) => pmlDay(m) === d))}
            </PkSection>
          ))}
      </PkScreen>
      <PmlThread m={shown} open={!!thread} onClose={() => setOpenId(null)} conn={conn} say={say} onActs={setActs} onCompose={composeFrom} />
      <PmlComposer co={co} onClose={() => setCo(null)} say={say} onSent={sent} />
      <PkActions acts={acts} onClose={() => setActs(null)} />
    </>
  );
}

window.PkPlaces = window.PkPlaces || {};
window.PkPlaces.mail = PmlMailbox;
