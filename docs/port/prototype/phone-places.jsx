/* phone-places.jsx — Plates screens (08.10.26): Connections, Templates,
 * Shared and Trash, registered with window.PkPlaces[id] (mobile-v2-plates.jsx
 * draws them instead of MobileApp's old pushes).
 *
 * Built on the phone kit (phone-kit.jsx: PkScreen, PkSection, PkButton,
 * PkSheet, PkEmpty). Data and rules are the phone's own (Mobile.jsx):
 *   Connections  the desktop's catalogue, AI tools, MCP / API connections
 *                and setup guides (connections-data.js window.cnData, one
 *                copy with connections.jsx); states through mbUseConn /
 *                mbReconnect / mbConnSet (the desktop's "needt.connections"
 *                store and event); a calendar's sync
 *                settings are needtSettings "google" / "apple" / "outlookCal"
 *                + "declined" / "allDay" / "writeBack" — the keys
 *                connections.jsx CnCalSync writes, through window.useSettings.
 *   Templates    MB_TEMPLATES; Use makes a page through stores.jsx
 *                docs.fromTemplate (the desktop's rule) and opens it.
 *   Shared       window.SHARED when the desktop has it, else MB_SHARED.
 *   Trash        the doc store's and the task store's trashedAt stamps
 *                (MbTrash's rules); Restore clears the stamp, Delete forever
 *                and Empty trash remove for good, each with Undo.
 * A page opens in a tall PkSheet that draws Mobile.jsx's MbDoc.
 *
 * Wave 3 (09.10.26) — the desktop's functions at phone size, each a hold
 * (PkHold → PkActions) or a sheet:
 *   Connections  tap / hold an account → its sheet: what Needt reads (the
 *                desktop's consent scopes), last synced, Sync now, sync
 *                settings (calendars), Disconnect (confirm, Undo). Connect
 *                asks for consent first, then connects.
 *   Templates    the desktop's set (places.jsx TEMPLATES) + your own
 *                ("needt.templates"); tap → a preview sheet with Use.
 *   Shared       each page says your access; hold / ⓘ → who shared it and
 *                what you can do with it (view / comment / edit).
 *   Trash        pages, tasks AND moodboards (Board.trashedAt), grouped,
 *                Restore all + Empty trash; hold a row → Restore / Delete.
 * Rows are calm: a lead (brand icon, cover, avatar), a title, one status
 * line, ONE action at the end. Strong contrast only for the primary action
 * (Reconnect when an account is broken, Use, Restore). Pull down at the top
 * searches what the place lists. Classes ppl-*, tokens --ppl-* (themes.css).
 * No `...rest` destructuring (Babel-standalone shares its helpers globally).
 */
const PplNS = window.NeedtDesignSystem_25d3c8;
const { Icon: PplIcon } = PplNS;
const pplCx = (...a) => a.filter(Boolean).join(" ");
const pplHas = (s, q) => String(s || "").toLowerCase().indexOf(q.toLowerCase()) > -1;

/* A calm row: lead · title + status line · one action. The text opens when
   onOpen is given (a real button, so the action never nests in it). */
function PplRow({ lead, title, meta, tone, action, onOpen, data }) {
  const main = (
    <>
      <span className="ppl-row-title">{title}</span>
      {meta ? <span className={pplCx("ppl-row-meta", tone && "is-" + tone)}>{tone === "late" ? <span className="pk-alert-dot" /> : null}<span className="ppl-row-meta-text">{meta}</span></span> : null}
    </>
  );
  return (
    <div className="ppl-row" {...(data || {})}>
      {lead ? <span className="ppl-row-lead">{lead}</span> : null}
      {onOpen
        ? <button type="button" className="ppl-row-main is-open" onClick={onOpen}>{main}</button>
        : <span className="ppl-row-main">{main}</span>}
      {action ? <span className="ppl-row-act">{action}</span> : null}
    </div>
  );
}

/* A doc, read in a tall sheet (the old phone pushed MbDoc as a screen). */
function PplDocSheet({ doc, onClose }) {
  const last = React.useRef(null); if (doc) last.current = doc;
  const shown = doc || last.current;
  return (
    <PkSheet open={!!doc} onClose={onClose} detents={[0.94]} label={shown ? shown.title || "Untitled" : "Page"} className="ppl-doc-sheet" bodyClass="ppl-doc-body"
      footer={<PkButton kind="primary" onClick={onClose} data-ppl-doc-done>Done</PkButton>}>
      {shown ? <div className="ppl-doc" data-ppl-doc={shown.id}><MbDoc id={shown.id} doc={shown.shared ? shown.shared : null} /></div> : null}
    </PkSheet>
  );
}

/* ── Connections ──────────────────────────────────────────────────────── */
/* The desktop's catalogue (09.10.26): connections-data.js window.cnData —
   the same apps, categories, AI tools, MCP / API connections and setup
   guides as connections.jsx, at phone size. Two tabs (the desktop's,
   "needt.connections.tab"): Apps & services (search, category chips, a
   section per category, "Needs you" first) and AI tools (the tools with
   their setup steps, your MCP and API connections — add, edit, revoke — and
   the API key for MCP clients). Free: one mail account; AI tools, MCP / API
   and Pinterest are Pro (the Upgrade chip opens the paywall). The calendar
   sync model is stores.jsx CN_CAL_SYNC / cnCalOn (one copy with the desktop). */
const PplD = () => window.cnData;
const pplMeta = (id) => PplD().CN_META[id] || { label: id, kind: "", scopes: [] };

function PplTile({ id, size }) {
  const BI = window.BrandIcon, z = size || 40, m = pplMeta(id);
  if (BI && BI.has(id)) return <BI id={id} size={z} />;
  return (
    <span className={pplCx("ppl-tile", m.tile && "is-ours")} aria-hidden="true" style={{ width: z, height: z }}>
      {m.tile && m.tile.icon === "plug" ? <PplIcon name="mcp" size={Math.round(z * 0.5)} /> : String(m.label).charAt(0)}
    </span>
  );
}
function PplLinkTile({ kind }) {
  return <span className="ppl-tile is-ours" aria-hidden="true"><PplIcon name={PplD().CN_LINK_KINDS[kind].icon} size={18} /></span>;
}

function PplSwitch({ on, onChange, label, data }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} className={pplCx("ppl-switch", on && "is-on")} onClick={() => onChange(!on)} {...(data || {})}>
      <span className="ppl-switch-knob" />
    </button>
  );
}
function PplSyncRow({ title, desc, hue, on, onChange, data }) {
  return (
    <div className="ppl-sync-row">
      {hue ? <span className="pk-hue" style={{ "--hue": "var(--hue-" + hue + ")" }} /> : null}
      <span className="ppl-sync-text">
        <span className="ppl-sync-title">{title}</span>
        {desc ? <span className="ppl-sync-desc">{desc}</span> : null}
      </span>
      <PplSwitch on={on} onChange={onChange} label={title} data={data} />
    </div>
  );
}
/* A setting is written into the one settings object (needtSettings). */
function pplSettingSet(k, x) { if (window.needtSettings) window.needtSettings.set(k, x); }
function PplCalSync({ id }) {
  const m = pplMeta(id), d = CN_CAL_SYNC[id];
  const [v] = window.useSettings();
  const set = pplSettingSet;
  const on = cnCalOn(id, v);
  const flip = (name, yes) => set(d.key, d.cals.map((x) => x[0]).filter((n) => (n === name ? yes : on.indexOf(n) >= 0)));
  return (
    <div className="ppl-sync" data-ppl-sync={id}>
      <section className="ppl-sync-group">
        <span className="pk-label">Calendars</span>
        <div className="ppl-sync-list">
          {d.cals.map(([name, hue]) => <PplSyncRow key={name} title={name} hue={hue} on={on.indexOf(name) >= 0} onChange={(x) => flip(name, x)} data={{ "data-ppl-cal": name }} />)}
        </div>
        <p className="ppl-sync-hint">{on.length ? "Events from these fill your day, and Needt plans tasks around them." : "Nothing from " + m.label + " shows in your day."}</p>
      </section>
      <section className="ppl-sync-group">
        <span className="pk-label">Events</span>
        <div className="ppl-sync-list">
          <PplSyncRow title="Show declined events" on={!!v.declined} onChange={(x) => set("declined", x)} data={{ "data-ppl-declined": "" }} />
          <PplSyncRow title="Show all-day events" on={!!v.allDay} onChange={(x) => set("allDay", x)} data={{ "data-ppl-allday": "" }} />
          <PplSyncRow title="Write changes back" desc={"Moving an event in Needt moves it in " + m.label + " too"} on={!!v.writeBack} onChange={(x) => set("writeBack", x)} data={{ "data-ppl-writeback": "" }} />
        </div>
        <p className="ppl-sync-hint">These apply to every calendar you connect.</p>
      </section>
    </div>
  );
}

/* A list of choices on the glass (one is on). opts: [[key, title, desc]] */
function PplOpts({ opts, value, onPick, data }) {
  return (
    <div className="ppl-glist" role="radiogroup">
      {opts.map(([k, t, d]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={pplCx("ppl-opt", value === k && "is-on")} onClick={() => onPick(k)} {...{ [data]: k }}>
          <span className="ppl-perm-text"><span className="ppl-perm-title">{t}</span>{d ? <span className="ppl-perm-desc">{d}</span> : null}</span>
          <span className="ppl-opt-check">{value === k ? <PplIcon name="check" size={18} /> : null}</span>
        </button>
      ))}
    </div>
  );
}
/* A value you can copy: monospace line + Copy. */
function PplCopy({ value, what, say, shown, data }) {
  return (
    <div className="ppl-copy" {...(data || {})}>
      <span className="ppl-mono">{shown || value}</span>
      <PkButton kind="chip" icon="copy" onClick={() => { PplD().cnClip(value); say(what + " copied"); }}>Copy</PkButton>
    </div>
  );
}

/* The setup guide of one AI tool + "Check connection". */
function PplSetup({ id, say, apiKey, onKey, phase }) {
  const D = PplD();
  const [show, setShow] = React.useState(false);
  const steps = D.cnStepData(id, apiKey);
  return (
    <div className="ppl-acct-body">
      <ol className="ppl-steps" data-ppl-steps={id}>
        {steps.map((s, i) => (
          <li key={i} className="ppl-step">
            <span className="ppl-step-n">{i + 1}</span>
            <span className="ppl-step-t">{D.cnRich(s.t, "ppl-path")}</span>
            {s.x === "url" ? <PplCopy value={D.CN_MCP_URL} what="Server URL" say={say} data={{ "data-ppl-copy-url": "" }} />
              : s.x === "key" ? (apiKey ? (
                <div className="ppl-key" data-ppl-key={show ? "shown" : "masked"}>
                  <span className="ppl-mono">{show ? apiKey : D.cnKeyMask(apiKey)}</span>
                  <div className="ppl-key-acts">
                    <PkButton kind="chip" icon={show ? "eye-off" : "eye"} onClick={() => setShow(!show)}>{show ? "Hide" : "Reveal"}</PkButton>
                    <PkButton kind="chip" icon="copy" onClick={() => { D.cnClip(apiKey); say("API key copied"); }}>Copy</PkButton>
                    <PkButton kind="ghost" icon="refresh-cw" onClick={() => { setShow(false); onKey(true); }} data-ppl-regen="">Regenerate</PkButton>
                  </div>
                </div>
              ) : <PkButton kind="chip" icon="lock" onClick={() => onKey(false)} data-ppl-genkey="">Generate API key</PkButton>)
              : s.x ? (
                <div className="ppl-code">
                  <pre className="ppl-mono is-code">{s.x.code}</pre>
                  <PkButton kind="chip" icon="copy" onClick={() => { D.cnClip(s.x.copy); say("Config copied"); }}>Copy</PkButton>
                </div>
              ) : null}
          </li>
        ))}
      </ol>
      {phase === "ok" || phase === "fail" ? (
        <p className={pplCx("ppl-check", "is-" + phase)} role={phase === "fail" ? "alert" : "status"} data-ppl-check={phase}>
          <PplIcon name={phase === "ok" ? "circle-check" : "triangle-alert"} size={16} />
          {phase === "ok" ? "Connected — ask it about your day to try it." : "Needt didn’t hear from it yet. Finish the last step, then try again."}
        </p>
      ) : null}
    </div>
  );
}

/* One MCP / API connection: a new one (draft, Create) or an existing one
   (every change saves; Revoke asks first and has Undo). */
function PplLink({ kind, id, draft, setDraft, say }) {
  const D = PplD(), K = D.CN_LINK_KINDS[kind];
  const list = window.useLinks(K.store());
  /* the sheet is shared by every link: a new one starts at the top */
  const top = React.useRef(null);
  React.useLayoutEffect(() => { const b = top.current && top.current.closest(".pk-sheet-body"); if (b) b.scrollTop = 0; }, []);
  const l = draft || list.filter((x) => x.id === id)[0];
  if (!l) return null;
  const set = (p) => (draft ? setDraft(Object.assign({}, draft, p)) : K.store().patch(l.id, p));
  const setScope = (k) => {
    const p = { scope: k };
    if (l.name === D.cnAutoName(kind, l.scope)) p.name = D.cnAutoName(kind, k);
    if (k === "projects" && !(l.projectIds || []).length) { const first = D.cnProjects()[0]; p.projectIds = first ? [first.id] : []; }
    set(p);
  };
  const flip = (pid, yes) => { const cur = l.projectIds || []; set({ projectIds: yes ? cur.concat([pid]) : cur.filter((x) => x !== pid) }); };
  return (
    <div ref={top} className="ppl-acct-body" data-ppl-link={draft ? "new" : l.id}>
      <PkField label="Name" id="ppl-link-name" value={l.name} onChange={(e) => set({ name: e.target.value })} inputProps={{ "data-ppl-link-name": "" }} />
      {draft ? null : (
        <>
          <span className="pk-label ppl-label">URL</span>
          <PplCopy value={l.url} what="URL" say={say} shown={D.cnUrlShort(l.url)} data={{ "data-ppl-link-url": "" }} />
          <PkButton kind="ghost" icon="refresh-cw" className="ppl-link-regen" data-ppl-link-regen=""
            onClick={() => { const old = l.url; K.store().regenerate(l.id); say("New URL — the old one stopped working", () => K.store().patch(l.id, { url: old })); }}>New URL</PkButton>
        </>
      )}
      <span className="pk-label ppl-label">Documents</span>
      <PplOpts opts={D.CN_SCOPES} value={l.scope} onPick={setScope} data="data-ppl-scope" />
      {l.scope === "projects" ? (
        <div className="ppl-sync-list ppl-link-projects">
          {D.cnProjects().map((p) => <PplSyncRow key={p.id} title={p.name} on={(l.projectIds || []).indexOf(p.id) >= 0} onChange={(x) => flip(p.id, x)} data={{ "data-ppl-link-project": p.id }} />)}
        </div>
      ) : null}
      <span className="pk-label ppl-label">Permission</span>
      <PplOpts opts={D.CN_PERMS} value={l.permission} onPick={(k) => set({ permission: k })} data="data-ppl-perm" />
      <span className="pk-label ppl-label">Access</span>
      <PplOpts opts={D.CN_ACCESS} value={l.access} onPick={(k) => set({ access: k })} data="data-ppl-access" />
      {l.access === "public" && l.permission === "write" ? (
        <p className="ppl-warn"><PplIcon name="triangle-alert" size={14} />Anyone with the URL can change your {kind === "mcp" ? "docs and tasks" : "data"}. Keep it secret.</p>
      ) : null}
      {kind === "api" && !draft ? (
        <PkButton kind="chip" icon="download" className="ppl-link-bundle" data-ppl-bundle=""
          onClick={() => { D.cnDownload("needt-api-bundle.md", D.cnBundle(l)); say("AI bundle downloaded"); }}>Download AI bundle</PkButton>
      ) : null}
    </div>
  );
}

function PplConnections({ say, onUpgrade }) {
  const D = PplD();
  const conn = mbUseConn();
  const pro = window.useNeedtPro ? window.useNeedtPro() : true;
  const upgrade = (f) => (onUpgrade ? onUpgrade(f) : window.dispatchEvent(new CustomEvent("needt:upgrade", { detail: f, cancelable: true })));
  const [tab, setTabRaw] = React.useState(() => { try { return localStorage.getItem("needt.connections.tab") === "ai" ? "ai" : "apps"; } catch (e) { return "apps"; } });
  const setTab = (t) => { setTabRaw(t); if (window.needtSync) window.needtSync.set("needt.connections.tab", t); };
  const [chip, setChip] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [sync, setSync] = React.useState(null);     /* calendar sync settings */
  const [acct, setAcct] = React.useState(null);     /* the account sheet */
  const [consent, setConsent] = React.useState(null);
  const [bye, setBye] = React.useState(null);       /* disconnect, confirm */
  const [setup, setSetup] = React.useState(null);   /* an AI tool's setup */
  const [phase, setPhase] = React.useState("idle"); /* its check: idle · checking · ok · fail */
  const [link, setLink] = React.useState(null);     /* { kind, id } or { kind, draft } */
  const [revoke, setRevoke] = React.useState(null); /* { kind, id, name } */
  const [syncs, setSyncs] = React.useState(D.cnReadSync);
  React.useEffect(() => (window.needtSync ? window.needtSync.subscribe("needt.connections.sync", (v, info) => { if (info.origin !== "local") setSyncs(D.cnReadSync()); }) : undefined), []);
  const [busy, setBusy] = React.useState({});
  const [apiKey, setApiKey] = React.useState(D.cnKey.get);
  const keep = (v, ref) => { if (v) ref.current = v; return ref.current; };
  const rSync = React.useRef(null), rAcct = React.useRef(null), rCons = React.useRef(null), rBye = React.useRef(null), rSetup = React.useRef(null), rLink = React.useRef(null), rRev = React.useRef(null);
  const syncId = keep(sync, rSync), A = keep(acct, rAcct), C = keep(consent, rCons), B = keep(bye, rBye), T = keep(setup, rSetup), L = keep(link, rLink), R = keep(revoke, rRev);
  const checkT = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(checkT.current), []);

  const st = (id) => conn[id] || "none";
  const stamp = (id) => { const v = Object.assign({}, D.cnReadSync(), { [id]: "just now" }); D.cnWriteSync(v); setSyncs(v); };
  const syncNow = (id) => {
    setBusy((b) => Object.assign({}, b, { [id]: 1 }));
    window.setTimeout(() => { stamp(id); setBusy((b) => Object.assign({}, b, { [id]: 0 })); say(D.cnLabel(id) + " is up to date"); }, 900);
  };
  const allow = (id) => { setConsent(null); mbReconnect(id, D.cnLabel(id), say); window.setTimeout(() => stamp(id), 1250); };
  const disconnect = (id) => {
    setBye(null); setAcct(null);
    const was = st(id);
    mbConnSet(id, "none");
    say(D.cnLabel(id) + " disconnected", () => mbConnSet(id, was));
  };
  /* Free: one mail account; AI tools and Pinterest are Pro. */
  const mailUsed = D.CN_APPS.filter((id) => D.cnIsMail(id) && st(id) !== "none").length;
  const lockOf = (id) => {
    if (pro || st(id) !== "none") return null;
    if (pplMeta(id).ai || id === "pinterest") return D.cnProFeature(id);
    if (D.cnIsMail(id) && mailUsed >= D.CN_FREE_MAIL) return D.cnProFeature(id);
    return null;
  };
  const openSetup = (id) => { window.clearTimeout(checkT.current); setPhase("idle"); setSetup(id); };
  const check = () => {
    if (phase === "checking") return;
    setPhase("checking");
    window.clearTimeout(checkT.current);
    checkT.current = window.setTimeout(() => {
      if (D.cnCheckFails()) { setPhase("fail"); return; }
      setPhase("ok"); mbConnSet(T, "connected"); stamp(T);
    }, D.CN_CHECK_MS);
  };
  const makeKey = (regen) => { setApiKey(D.cnKey.make()); say(regen ? "New API key — the old one stopped working" : "API key created"); };

  const ids = tab === "apps" ? D.CN_APPS : D.CN_AI;
  const issues = ids.filter((id) => st(id) === "disconnected");
  const live = ids.filter((id) => st(id) === "connected").length;
  const sub = issues.length ? issues.map(D.cnLabel).join(", ") + (issues.length === 1 ? " needs reconnecting" : " need reconnecting")
    : !live ? (tab === "ai" ? "No AI tools connected yet" : "Nothing connected yet") : live + " connected" + (tab === "apps" ? " · all syncing" : "");

  const row = (id) => {
    const m = pplMeta(id), s = st(id), lock = lockOf(id);
    const on = s === "connected", wait = s === "connecting", lost = s === "disconnected";
    const meta = wait ? "Connecting…" : lost ? m.lost || "Lost access — reconnect to sync again" : on ? (m.ai ? "Needt MCP · last used " + (syncs[id] || "today") : m.account) : lock ? (m.ai || id === "pinterest" ? "Included in Pro" : "Free: 1 mail account") : m.kind;
    const action = lost || (wait && m.lost)
      ? <PkButton kind="primary" small className="ppl-act" disabled={wait} onClick={() => mbReconnect(id, m.label, say)} data-ppl-reconnect={id}>{wait ? "Connecting" : "Reconnect"}</PkButton>
      : on ? (CN_CAL_SYNC[id] ? <PkButton kind="chip" icon="sliders-horizontal" onClick={() => setSync(id)} aria-label={m.label + " sync settings"} data-ppl-sync-open={id}>Sync</PkButton> : null)
      : lock ? <PkButton kind="chip" icon="lock" onClick={() => upgrade(lock)} data-ppl-upgrade={id}>Upgrade</PkButton>
      : <PkButton kind="chip" disabled={wait} onClick={() => (m.ai ? openSetup(id) : setConsent(id))} data-ppl-connect={id}>{wait ? "Connecting" : "Connect"}</PkButton>;
    return (
      <PkHold key={id} onHold={() => setAcct(id)}>
        <PplRow lead={<PplTile id={id} />} tone={lost ? "late" : on ? "on" : null} onOpen={() => setAcct(id)}
          title={<>{m.label}{m.beta ? <span className="ppl-flag">Beta</span> : null}</>}
          meta={meta} action={action} data={{ "data-ppl-conn": id, "data-state": s }} />
      </PkHold>
    );
  };
  const needle = q.trim().toLowerCase();
  const apps = D.CN_APPS.filter((id) => (chip === "all" || pplMeta(id).cat === chip) && (!needle || D.cnHay(id).indexOf(needle) >= 0));
  const down = apps.filter((id) => st(id) === "disconnected" || (st(id) === "connecting" && pplMeta(id).lost));
  const cats = D.CN_CHIPS.filter((c) => c[0] !== "all").map(([k, label]) => [label, apps.filter((id) => pplMeta(id).cat === k && down.indexOf(id) < 0)]).filter((g) => g[1].length);

  const pull = {
    search: (x) => D.CN_APPS.concat(D.CN_AI).filter((id) => D.cnHay(id).indexOf(x.toLowerCase()) >= 0).slice(0, 6)
      .map((id) => ({ id: id, title: D.cnLabel(id), meta: st(id) === "connected" ? "Connected · " + (pplMeta(id).account || "Needt MCP") : st(id) === "disconnected" ? "Needs reconnecting" : pplMeta(id).kind })),
    onPick: (h) => { setTab(pplMeta(h.id).ai ? "ai" : "apps"); setAcct(h.id); },
    placeholder: "Search", hint: "Any app or AI tool by name. Pick one to see what it does and connect it."
  };

  const tabs = (
    <div className="ppl-tabs" role="tablist" aria-label="Connection type">
      {D.CN_TABS.map(([k, label]) => (
        <PkGlass key={k} as="button" round role="tab" aria-selected={tab === k} className={pplCx("ppl-tab", tab === k && "is-on")} onClick={() => setTab(k)} data-ppl-tab={k}>
          {label}{k === "ai" && !pro ? <PplIcon name="lock" size={13} /> : null}
          {D.CN_APPS.concat(D.CN_AI).filter((id) => (k === "ai") === !!pplMeta(id).ai && st(id) === "disconnected").length ? <span className="pk-alert-dot" /> : null}
        </PkGlass>
      ))}
    </div>
  );

  const appsTab = (
    <>
      <label className="ppl-search pk-glass is-round">
        <PplIcon name="search" size={16} />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps" aria-label="Search apps and services" data-ppl-search="" />
        {q ? <button type="button" className="ppl-search-x" aria-label="Clear search" onClick={() => setQ("")}><PplIcon name="x" size={14} /></button> : null}
      </label>
      <PkChips className="ppl-chips" label="Categories">
        {D.CN_CHIPS.map(([k, l]) => (
          <PkGlass key={k} as="button" round className={pplCx("ppl-chip", chip === k && "is-on")} aria-pressed={chip === k} onClick={() => setChip(k)} data-ppl-chip={k}>{l}</PkGlass>
        ))}
      </PkChips>
      {down.length ? <PkSection title="Needs you" tone="late" count={down.length} className="ppl-sec">{down.map(row)}</PkSection> : null}
      {cats.map(([name, l]) => <PkSection key={name} title={name} count={l.length} className="ppl-sec">{l.map(row)}</PkSection>)}
      {!apps.length ? <PkEmpty line={"Nothing matches “" + q.trim() + "”."} action={<PkButton kind="chip" onClick={() => { setQ(""); setChip("all"); }} data-ppl-clear="">Show all</PkButton>} /> : null}
    </>
  );

  const linkSection = (kind) => {
    const K = D.CN_LINK_KINDS[kind];
    return <PplLinkSection key={kind} kind={kind} K={K} onOpen={(id) => setLink({ kind: kind, id: id })}
      onNew={() => setLink({ kind: kind, draft: { name: D.cnAutoName(kind, "daily"), scope: "daily", permission: "read", access: "private", projectIds: [] } })} />;
  };
  const aiTab = !pro ? (
    <PkGlass className="ppl-promo" data-ppl-ai-promo="">
      <span className="ppl-promo-tiles" aria-hidden="true">{D.CN_AI.slice(0, 5).map((id) => <PplTile key={id} id={id} size={36} />)}</span>
      <span className="ppl-promo-title">Bring Needt into your AI tools</span>
      <span className="ppl-promo-line">Your tasks, calendar and notes — right where you already ask questions.</span>
      <ul className="ppl-promo-list">{D.CN_PROMO_LINES.map((t) => <li key={t}><PplIcon name="check" size={15} />{t}</li>)}</ul>
      <PkButton kind="primary" block onClick={() => upgrade("AI tools")} data-ppl-promo-try="">Try Pro free for 14 days</PkButton>
      <PkButton block onClick={() => upgrade()} data-ppl-promo-plans="">See plans</PkButton>
    </PkGlass>
  ) : (
    <>
      <p className="ppl-explain"><b>Needt MCP</b> — use your Needt tasks, calendar and notes in your favourite AI.<span className="ppl-flag">Beta</span></p>
      <PkSection title="AI tools" count={D.CN_AI.length} className="ppl-sec">{D.CN_AI.map(row)}</PkSection>
      {linkSection("mcp")}
      {linkSection("api")}
      <PkSection title="API key" className="ppl-sec">
        <PplRow lead={<span className="ppl-tile is-ours" aria-hidden="true"><PplIcon name="lock" size={18} /></span>} title={apiKey ? D.cnKeyMask(apiKey) : "No API key yet"}
          meta="For MCP clients that can’t sign in" data={{ "data-ppl-apikey": apiKey ? "set" : "none" }}
          action={<PkButton kind="chip" icon={apiKey ? "refresh-cw" : "plus"} onClick={() => makeKey(!!apiKey)} data-ppl-key-make="">{apiKey ? "New" : "Create"}</PkButton>} />
      </PkSection>
    </>
  );

  const aM = A ? pplMeta(A) : null, aSt = A ? st(A) : "none";
  const linkK = L ? D.CN_LINK_KINDS[L.kind] : null;
  return (
    <>
      <PkScreen screen="connections" title="Connections" glyph="connections" onPull={pull} sub={sub} head={tabs}>
        {tab === "apps" ? appsTab : aiTab}
      </PkScreen>

      {/* calendar sync settings */}
      <PkSheet open={!!sync} onClose={() => setSync(null)} title={syncId ? D.cnLabel(syncId) : ""} meta={syncId ? "Sync settings · " + pplMeta(syncId).account : null}
        head={syncId ? <span className="ppl-sheet-tile"><PplTile id={syncId} size={44} /></span> : null}
        footer={<PkButton kind="primary" onClick={() => setSync(null)} data-ppl-sync-done>Done</PkButton>}>
        {syncId ? <PplCalSync id={syncId} /> : null}
      </PkSheet>

      {/* one account or AI tool: what it gives, status, its actions */}
      <PkSheet open={!!acct} onClose={() => setAcct(null)} title={aM ? aM.label : ""} label={aM ? aM.label : "Account"} className="ppl-acct"
        meta={aM ? (aSt === "connected" ? (aM.ai ? "Needt MCP · maksym" : aM.account) : aSt === "disconnected" ? (aM.lost || "Lost access") : aSt === "connecting" ? "Connecting…" : aM.kind) : null}
        head={A ? <span className="ppl-sheet-tile"><PplTile id={A} size={44} /></span> : null}
        footer={!aM ? null : aSt === "connected"
          ? <><PkButton onClick={() => setBye(A)} className="ppl-danger-q" data-ppl-disconnect={A}>Disconnect</PkButton>
            {aM.ai ? <PkButton kind="primary" icon="list-numbers" onClick={() => { setAcct(null); openSetup(A); }} data-ppl-steps-again="">Setup steps</PkButton>
              : <PkButton kind="primary" icon="refresh-cw" disabled={!!busy[A]} onClick={() => syncNow(A)} data-ppl-syncnow={A}>{busy[A] ? "Syncing…" : "Sync now"}</PkButton>}</>
          : aSt === "disconnected"
            ? <PkButton kind="primary" onClick={() => { setAcct(null); mbReconnect(A, aM.label, say); }} data-ppl-acct-reconnect>Reconnect</PkButton>
            : lockOf(A) ? <PkButton kind="primary" icon="lock" onClick={() => { setAcct(null); upgrade(lockOf(A)); }} data-ppl-acct-upgrade>Upgrade</PkButton>
            : <PkButton kind="primary" disabled={aSt === "connecting"} onClick={() => { setAcct(null); if (aM.ai) openSetup(A); else setConsent(A); }} data-ppl-acct-connect>Connect</PkButton>}>
        {aM ? (
          <div className="ppl-acct-body">
            <p className="ppl-gives">{aM.gives}</p>
            <div className="ppl-glist">
              <div className="ppl-kv"><span>Status</span><span className={"ppl-kv-v is-" + aSt}>{aSt === "connected" ? "Connected" : aSt === "connecting" ? "Connecting…" : aSt === "disconnected" ? "Needs reconnecting" : "Not connected"}</span></div>
              {aSt === "connected" || aSt === "disconnected" ? <div className="ppl-kv"><span>{aM.ai ? "Last used" : "Last synced"}</span><span className="ppl-kv-v">{syncs[A] || "Today"}</span></div> : null}
              <div className="ppl-kv"><span>Kind</span><span className="ppl-kv-v">{aM.kind}</span></div>
            </div>
            {(aM.scopes || []).length ? <span className="pk-label ppl-label">Needt can</span> : null}
            {(aM.scopes || []).length ? <div className="ppl-glist">{aM.scopes.map((x) => <div key={x} className="ppl-kv"><span className="ppl-scope"><PplIcon name="check" size={15} />{x}</span></div>)}</div> : null}
            {aSt === "connected" && CN_CAL_SYNC[A] ? (
              <PkButton kind="chip" icon="sliders-horizontal" className="ppl-acct-sync" onClick={() => { setAcct(null); setSync(A); }} data-ppl-acct-settings>Calendars and events</PkButton>
            ) : null}
          </div>
        ) : null}
      </PkSheet>

      {/* consent before connecting (connections.jsx CnConsent) */}
      <PkSheet open={!!consent} onClose={() => setConsent(null)} title={C ? "Connect " + D.cnLabel(C) + "?" : ""} label="Connect" className="ppl-acct"
        meta={C ? (pplMeta(C).never || "Needt never posts or deletes anything for you.") + " You can disconnect any time." : null}
        head={C ? <span className="ppl-sheet-tile"><PplTile id={C} size={44} /></span> : null}
        footer={<><PkButton onClick={() => setConsent(null)}>Cancel</PkButton><PkButton kind="primary" onClick={() => allow(C)} data-ppl-allow>Allow</PkButton></>}>
        {C ? <div className="ppl-glist">{(pplMeta(C).scopes || []).map((x) => <div key={x} className="ppl-kv"><span className="ppl-scope"><PplIcon name="check" size={15} />{x}</span></div>)}</div> : null}
      </PkSheet>

      <PkSheet open={!!bye} onClose={() => setBye(null)} className="ppl-confirm" title={B ? "Disconnect " + D.cnLabel(B) + "?" : ""}
        meta={B ? D.cnByeText(B) : null}
        footer={<><PkButton onClick={() => setBye(null)}>Cancel</PkButton><PkButton kind="primary" className="ppl-danger" onClick={() => disconnect(B)} data-ppl-bye>Disconnect</PkButton></>} />

      {/* an AI tool's setup guide (connections.jsx CnSetup) */}
      <PkSheet open={!!setup} onClose={() => setSetup(null)} detents={[0.92]} title={T ? "Connect " + (T === "othermcp" ? "an MCP client" : D.cnLabel(T)) : ""} label="Setup" className="ppl-acct"
        meta={T ? (T === "othermcp" ? "Any app that speaks MCP" : D.cnLabel(T)) + " reads your tasks, calendar and notes through Needt MCP" : null}
        head={T ? <span className="ppl-sheet-tile"><PplTile id={T} size={44} /></span> : null}
        footer={phase === "ok"
          ? <PkButton kind="primary" onClick={() => setSetup(null)} data-ppl-setup-done="">Done</PkButton>
          : <><PkButton onClick={() => setSetup(null)}>Cancel</PkButton><PkButton kind="primary" disabled={phase === "checking"} onClick={check} data-ppl-check-btn="">{phase === "checking" ? "Checking…" : phase === "fail" ? "Try again" : "Check connection"}</PkButton></>}>
        {T ? <PplSetup id={T} say={say} apiKey={apiKey} onKey={makeKey} phase={phase} /> : null}
      </PkSheet>

      {/* an MCP / API connection: new (Create) or yours (Revoke) */}
      <PkSheet open={!!link} onClose={() => setLink(null)} detents={[0.92]} className="ppl-acct" label={linkK ? linkK.noun + " connection" : "Connection"}
        title={L ? (L.draft ? "New " + linkK.noun + " connection" : linkK.noun + " connection") : ""}
        meta={linkK ? linkK.sub : null}
        head={L ? <span className="ppl-sheet-tile"><PplLinkTile kind={L.kind} /></span> : null}
        footer={!L ? null : L.draft
          ? <><PkButton onClick={() => setLink(null)}>Cancel</PkButton><PkButton kind="primary" data-ppl-link-create=""
              onClick={() => { const S = linkK.store(); const x = S.create(L.draft); setLink(null); say(linkK.noun + " connection created", () => S.remove(x.id)); }}>Create</PkButton></>
          : <><PkButton className="ppl-danger-q" onClick={() => { const S = linkK.store(); const x = (S.store.get() || []).filter((y) => y.id === L.id)[0]; setRevoke({ kind: L.kind, id: L.id, name: x ? x.name : "" }); }} data-ppl-link-revoke="">Revoke</PkButton>
            <PkButton kind="primary" onClick={() => setLink(null)} data-ppl-link-done="">Done</PkButton></>}>
        {L ? <PplLink key={L.id || "new"} kind={L.kind} id={L.id} draft={L.draft} setDraft={(d) => setLink(Object.assign({}, L, { draft: d }))} say={say} /> : null}
      </PkSheet>

      <PkSheet open={!!revoke} onClose={() => setRevoke(null)} className="ppl-confirm" title={R ? "Revoke “" + R.name + "”?" : ""}
        meta={R ? (R.kind === "mcp" ? "AI tools using this URL lose access right away." : "Workflows and shortcuts using this URL stop working right away.") : null}
        footer={<><PkButton onClick={() => setRevoke(null)}>Cancel</PkButton><PkButton kind="primary" className="ppl-danger" data-ppl-revoke-yes=""
          onClick={() => { const r = revoke; setRevoke(null); setLink(null); const undo = D.CN_LINK_KINDS[r.kind].store().remove(r.id); say("Revoked “" + r.name + "”", undo); }}>Revoke</PkButton></>} />
    </>
  );
}

/* Your MCP / API connections: a row each (tap = its sheet) + New. */
function PplLinkSection({ kind, K, onOpen, onNew }) {
  const D = PplD();
  const list = window.useLinks(K.store());
  return (
    <PkSection title={K.title} count={list.length} className="ppl-sec"
      action={<PkButton kind="chip" icon="plus" onClick={onNew} aria-label={"New " + K.noun + " connection"} data-ppl-link-new={kind}>New</PkButton>}>
      {list.length ? list.map((l) => (
        <PplRow key={l.id} lead={<PplLinkTile kind={kind} />} title={l.name} onOpen={() => onOpen(l.id)} data={{ "data-ppl-link-row": l.id }}
          meta={D.cnScopeText(l) + " · " + D.cnOpt(D.CN_PERMS, l.permission)[1] + " · " + D.cnOpt(D.CN_ACCESS, l.access)[1]} />
      )) : <p className="ppl-sync-hint ppl-link-none">{K.sub} — none yet.</p>}
    </PkSection>
  );
}

/* ── Templates ────────────────────────────────────────────────────────── */
/* The cover: the template's own blocks drawn small — a heading is a bar, a
   to-do a ring and a line, a bullet a dot and a line. */
function PplCover({ body }) {
  return (
    <span className="ppl-cover" aria-hidden="true">
      <span className="ppl-cover-page">
        <span className="ppl-cover-title" />
        {body.slice(0, 6).map((b, i) => (
          <span key={i} className={"ppl-cover-b is-" + b[0]}>
            {b[0] === "todo" ? <span className="ppl-cover-ring" /> : b[0] === "li" ? <span className="ppl-cover-dot" /> : null}
            <span className="ppl-cover-line" />
          </span>
        ))}
      </span>
    </span>
  );
}
function PplTemplates({ say }) {
  const [doc, setDoc] = React.useState(null);
  const [peek, setPeek] = React.useState(null);     /* the template in preview */
  const lastPeek = React.useRef(null); if (peek) lastPeek.current = peek;
  const P = lastPeek.current;
  const docs = mbUseDocs();
  const list = mbTemplates();
  /* stores.jsx docs.fromTemplate: the desktop's rule, one copy. */
  const use = (t) => {
    setPeek(null);
    const d = window.docs.fromTemplate(t);
    say("Created from “" + t.title + "”", () => { setDoc(null); window.docs.remove(d.id); });
    setDoc(d.id);
  };
  const open = doc ? docs.filter((d) => String(d.id) === String(doc))[0] : null;
  const pull = {
    search: (q) => list.filter((t) => pplHas(t.title, q) || pplHas(t.meta, q)).map((t) => ({ id: t.id, title: t.title, meta: t.meta, t: t })),
    onPick: (h) => setPeek(h.t),
    placeholder: "Search templates", hint: "Templates by name. Pick one to preview it."
  };
  const card = (t) => (
    <PkHold key={t.id} className="ppl-card-hold" onHold={() => setPeek(t)}>
      <div className="ppl-card" data-ppl-template={t.title}>
        <button type="button" className="ppl-card-open" onClick={() => setPeek(t)} aria-label={"Preview " + t.title} data-ppl-peek={t.title}>
          <PplCover body={t.body || []} />
          <span className="ppl-card-text">
            <span className="ppl-card-title">{t.title}</span>
            <span className="ppl-card-meta">{t.meta || (t.body || []).length + " blocks"}</span>
          </span>
        </button>
        <PkButton kind="primary" small className="ppl-card-use" onClick={() => use(t)} data-ppl-use={t.title} aria-label={"Use " + t.title}>Use</PkButton>
      </div>
    </PkHold>
  );
  const mine = list.filter((t) => t.mine), built = list.filter((t) => !t.mine);
  return (
    <>
      <PkScreen screen="templates" title="Templates" glyph="templates" sub={list.length + " to start from"} onPull={pull}>
        {mine.length ? <PkSection title="Yours" count={mine.length} className="ppl-sec"><div className="ppl-grid">{mine.map(card)}</div></PkSection> : null}
        <div className="ppl-grid">{built.map(card)}</div>
      </PkScreen>
      <PkSheet open={!!peek} onClose={() => setPeek(null)} detents={[0.94]} label={P ? P.title : "Template"} className="ppl-doc-sheet" bodyClass="ppl-doc-body"
        footer={<><PkButton onClick={() => setPeek(null)}>Close</PkButton><PkButton kind="primary" onClick={() => use(P)} data-ppl-peek-use>Use template</PkButton></>}>
        {P ? <div className="ppl-doc" data-ppl-preview={P.id}><MbDoc doc={Object.assign({}, P, { projectId: null, updated: null })} /></div> : null}
      </PkSheet>
      <PplDocSheet doc={open} onClose={() => setDoc(null)} />
    </>
  );
}

/* ── Shared ───────────────────────────────────────────────────────────── */
function PplAvatar({ name }) {
  const parts = String(name || "?").split(" ");
  const ini = (parts[0][0] || "?") + (parts[1] ? parts[1][0] : "");
  return <span className="ppl-avatar" aria-hidden="true" style={{ "--hue": mbmHue(name) }}>{ini}</span>;
}
const PPL_ROLE = {
  "Can edit": ["Can edit", "You can change the page; changes show for everyone.", "pencil", "var(--success)"],
  "Can comment": ["Can comment", "You can read it and leave comments; the text stays theirs.", "comment", "var(--info)"],
  "Can view": ["Can view", "You can read it. Ask for edit access to change it.", "eye", "var(--v2p-lav)"]
};
function PplShared({ say }) {
  const list = (window.TrashScreen && window.SHARED) || MB_SHARED;
  const [doc, setDoc] = React.useState(null);
  const [info, setInfo] = React.useState(null);
  const lastInfo = React.useRef(null); if (info) lastInfo.current = info;
  const I = lastInfo.current, R = I ? PPL_ROLE[I.role] || PPL_ROLE["Can view"] : null;
  const first = (d) => String(d.sharedBy || "").split(" ")[0];
  const people = new Set(list.map((d) => d.sharedBy)).size;
  const pull = {
    search: (q) => list.filter((d) => pplHas(d.title, q) || pplHas(d.sharedBy, q)).map((d) => ({ id: d.id, title: d.title, meta: "From " + first(d), d: d })),
    onPick: (h) => setDoc(h.d),
    placeholder: "Search shared pages", hint: "By title, or by who shared it."
  };
  return (
    <>
      <PkScreen screen="shared" title="Shared" glyph="shared" sub={list.length ? list.length + (list.length === 1 ? " page" : " pages") + " from " + people + (people === 1 ? " person" : " people") : "Nothing shared yet"} onPull={pull}>
        {list.length ? (
          <div className="ppl-list">
            {list.map((d) => {
              const r = PPL_ROLE[d.role] || PPL_ROLE["Can view"];
              return (
                <PkHold key={d.id} onHold={() => setInfo(d)}>
                  <PplRow lead={<PplAvatar name={d.sharedBy} />} title={d.title}
                    meta={<><span className="ppl-role" style={{ "--hue": r[3] }}><PplIcon name={r[2]} size={12} />{r[0]}</span>{first(d) + (d.updated ? " · " + d.updated : "")}</>}
                    onOpen={() => setDoc(d)} data={{ "data-ppl-shared": d.id }}
                    action={<button type="button" className="ppl-forget" onClick={() => setInfo(d)} aria-label={"Access to " + d.title} data-ppl-access={d.id}><PplIcon name="info" size={18} /></button>} />
                </PkHold>
              );
            })}
          </div>
        ) : <PkEmpty line="When someone shares a page with you, it shows up here." />}
      </PkScreen>
      <PplDocSheet doc={doc ? { id: doc.id, title: doc.title, shared: doc } : null} onClose={() => setDoc(null)} />
      <PkSheet open={!!info} onClose={() => setInfo(null)} title={I ? I.title : ""} meta={I ? "Shared by " + I.sharedBy + (I.updated ? " · edited " + I.updated : "") : null} label="Access" className="ppl-acct"
        footer={<><PkButton onClick={() => { const d = I; setInfo(null); setDoc(d); }} data-ppl-access-open>Open</PkButton>
          {I && I.role !== "Can edit" ? <PkButton kind="primary" onClick={() => { setInfo(null); say("Asked " + first(I) + " for edit access"); }} data-ppl-ask>Ask to edit</PkButton> : <PkButton kind="primary" onClick={() => setInfo(null)}>Done</PkButton>}</>}>
        {I ? (
          <div className="ppl-acct-body">
            <span className="pk-label ppl-label">Your access</span>
            <div className="ppl-glist">
              {Object.keys(PPL_ROLE).map((k) => {
                const r = PPL_ROLE[k], on = (I.role || "Can view") === k;
                return (
                  <div key={k} className={pplCx("ppl-perm", on && "is-on")} data-ppl-perm={k}>
                    <PkHueTile icon={r[2]} hue={r[3]} size={36} />
                    <span className="ppl-perm-text"><span className="ppl-perm-title">{r[0]}</span><span className="ppl-perm-desc">{r[1]}</span></span>
                    {on ? <PplIcon name="check" size={18} /> : null}
                  </div>
                );
              })}
            </div>
            <span className="pk-label ppl-label">People</span>
            <div className="ppl-glist">
              <div className="ppl-perm"><PplAvatar name={I.sharedBy} /><span className="ppl-perm-text"><span className="ppl-perm-title">{I.sharedBy}</span><span className="ppl-perm-desc">Owner</span></span></div>
              <div className="ppl-perm"><PplAvatar name="Maksym" /><span className="ppl-perm-text"><span className="ppl-perm-title">Maksym (you)</span><span className="ppl-perm-desc">{I.role || "Can view"}</span></span></div>
            </div>
            <p className="ppl-sync-hint">Only {first(I)} can change who has access.</p>
          </div>
        ) : null}
      </PkSheet>
    </>
  );
}

/* ── Trash ────────────────────────────────────────────────────────────── */
/* Moodboards in Trash: Board.trashedAt in the board tables (stores.jsx
   boardsView) — the desktop's TrashScreen lists them too. */
const pplBoardsView = () => window.boardsView;
function pplUseTrashedBoards() {
  const v = pplBoardsView();
  const [l, setL] = React.useState(() => (v ? v.get() : []));
  React.useEffect(() => (v ? v.sub((x) => setL(x)) : undefined), [v]);
  return (l || []).filter((b) => b && b.trashedAt);
}
function PplTrash({ say }) {
  const docs = mbUseDocs().filter((d) => d.trashedAt);
  const tasks = mbUse(mbTaskStore).filter((t) => t.trashedAt);
  const boards = pplUseTrashedBoards();
  const by = (a, b) => String(b.at).localeCompare(String(a.at));
  const G = [
    ["Pages", "docs", docs.map((d) => ({ kind: "doc", id: d.id, at: d.trashedAt, d: d, title: d.title || "Untitled" })).sort(by)],
    ["Tasks", "tasks", tasks.map((t) => ({ kind: "task", id: t.id, at: t.trashedAt, t: t, title: t.title })).sort(by)],
    ["Moodboards", "moodboards", boards.map((b) => ({ kind: "board", id: b.id, at: b.trashedAt, b: b, title: b.title || "Untitled moodboard" })).sort(by)]
  ].filter((g) => g[2].length);
  const items = G.reduce((a, g) => a.concat(g[2]), []);
  const [ask, setAsk] = React.useState(null); /* null | "all" | an item */
  const [acts, setActs] = React.useState(null);
  const lastAsk = React.useRef(null); if (ask) lastAsk.current = ask;
  const shown = ask || lastAsk.current;

  const snap = () => ({ d: mbDocStore.get(), t: mbTaskStore.get(), b: pplBoardsView() ? pplBoardsView().get() : null });
  const back = (x) => () => { mbDocStore.set(x.d); mbTaskStore.set(x.t); if (x.b && pplBoardsView()) pplBoardsView().set(x.b); };
  const unstamp = (x) => {
    if (x.kind === "doc") mbDocPatch(x.id, { trashedAt: null });
    else if (x.kind === "task") mbTaskStore.set((l) => l.map((t) => (t.id === x.id ? Object.assign({}, t, { trashedAt: null }) : t)));
    else pplBoardsView().set((l) => l.map((b) => (b.id === x.id ? Object.assign({}, b, { trashedAt: null }) : b)));
  };
  const restore = (x) => { const before = snap(); unstamp(x); say("Restored “" + x.title + "”", back(before)); };
  const restoreAll = () => { const before = snap(); items.forEach(unstamp); say(items.length + (items.length === 1 ? " item restored" : " items restored"), back(before)); };
  const forget = (x) => {
    const before = snap();
    if (x === "all") {
      mbDocStore.set((l) => l.filter((d) => !d.trashedAt));
      mbTaskStore.set((l) => l.filter((t) => !t.trashedAt));
      if (pplBoardsView()) pplBoardsView().set((l) => l.filter((b) => !b.trashedAt));
      say("Trash emptied", back(before));
    } else {
      if (x.kind === "doc") mbDocStore.set((l) => l.filter((d) => String(d.id) !== String(x.id)));
      else if (x.kind === "task") mbTaskStore.set((l) => l.filter((t) => t.id !== x.id));
      else pplBoardsView().set((l) => l.filter((b) => b.id !== x.id));
      say("“" + x.title + "” deleted for good", back(before));
    }
    setAsk(null);
  };
  const hold = (x) => setActs({ title: x.title, meta: "Deleted " + mbAgo(x.at), actions: [
    { label: "Restore", hint: x.kind === "board" ? "Back to Moodboards" : x.kind === "task" ? "Back to its list" : "Back to Docs", icon: "rotate-ccw", hue: "var(--success)", onClick: () => restore(x), data: { "data-ppl-act": "restore" } },
    { label: "Delete forever", hint: "You can undo it for a few seconds", icon: "trash-2", danger: true, onClick: () => setAsk(x), data: { "data-ppl-act": "forget" } }
  ] });
  const pull = {
    search: (q) => items.filter((x) => pplHas(x.title, q)).slice(0, 6).map((x) => ({ id: x.kind + x.id, title: x.title, meta: "Restore · deleted " + mbAgo(x.at), x: x })),
    onPick: (h) => restore(h.x),
    placeholder: "Search Trash", hint: "Anything deleted in the last 30 days. Pick it to restore it."
  };
  const all = shown === "all";
  const lead = (x) => (x.kind === "doc" ? <span className="ppl-thumb"><MbDocThumb d={x.d} /></span>
    : x.kind === "board" ? <span className="ppl-thumb ppl-board-thumb"><MbmCover items={x.b.items} /></span>
    : window.PkGlyph ? <window.PkGlyph kind="task" size={40} /> : <span className="ppl-glyph"><PplIcon name="circle-check" size={18} /></span>);
  const metaOf = (x) => {
    const from = x.kind === "doc" ? window.NEEDT.projectName(x.d) : x.kind === "task" ? mbPName(x.t) : (x.b.items || []).length + " references";
    const left = mbLeft(x.at);
    return "Deleted " + mbAgo(x.at) + (from ? " · " + from : "") + (left ? " · " + left : "");
  };
  return (
    <>
      <PkScreen screen="trash" title="Trash" glyph="trash" onPull={pull}
        sub={items.length ? items.length + (items.length === 1 ? " item" : " items") + " · kept 30 days" : "Kept for 30 days, then gone for good"}
        right={items.length ? <PkButton kind="chip" onClick={() => setAsk("all")} data-ppl-empty>Empty</PkButton> : null}>
        {items.length ? (
          <>
            {items.length > 1 ? <PkButton kind="quiet" icon="rotate-ccw" className="ppl-restore-all" onClick={restoreAll} data-ppl-restore-all>Restore all</PkButton> : null}
            {G.map(([name, glyph, list]) => (
              <PkSection key={name} title={name} count={list.length} glyph={glyph} className="ppl-sec">
                {list.map((x) => (
                  <PkHold key={x.kind + x.id} onHold={() => hold(x)}>
                    <PplRow title={x.title} data={{ "data-ppl-trash": x.kind + ":" + x.id }} lead={lead(x)} meta={metaOf(x)}
                      action={
                        <span className="ppl-acts">
                          <button type="button" className="ppl-forget" onClick={() => setAsk(x)} aria-label={"Delete “" + x.title + "” forever"} data-ppl-forget={x.kind + ":" + x.id}><PplIcon name="trash-2" size={17} /></button>
                          <PkButton kind="primary" small className="ppl-act" onClick={() => restore(x)} data-ppl-restore={x.kind + ":" + x.id}>Restore</PkButton>
                        </span>
                      } />
                  </PkHold>
                ))}
              </PkSection>
            ))}
          </>
        ) : <PkEmpty line="Trash is empty. Anything you delete waits here for 30 days." />}
      </PkScreen>
      <PkSheet open={!!ask} onClose={() => setAsk(null)} className="ppl-confirm"
        title={shown ? (all ? "Empty trash?" : "Delete “" + shown.title + "” forever?") : ""}
        meta={shown ? (all ? items.length + (items.length === 1 ? " item goes" : " items go") + " for good. You can undo it for a few seconds." : "Gone for good — you can undo it for a few seconds.") : null}
        footer={<>
          <PkButton onClick={() => setAsk(null)}>Cancel</PkButton>
          <PkButton kind="primary" className="ppl-danger" onClick={() => forget(shown)} data-ppl-confirm>{all ? "Empty trash" : "Delete forever"}</PkButton>
        </>} />
      <PkActions acts={acts} onClose={() => setActs(null)} />
    </>
  );
}

Object.assign(window.PkPlaces, { connections: PplConnections, templates: PplTemplates, shared: PplShared, trash: PplTrash });
