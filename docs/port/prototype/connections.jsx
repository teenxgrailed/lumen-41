/* CONNECTIONS — a place of its own (07.10.26, from Craft; v2 the same day).
   Two tabs: "Apps & services" (what Needt reads) and "AI tools" (what reads
   Needt, over Needt MCP). Cards in a 3/2/1-column grid on the pixel sky.
   States live in window.connections (MailScreen.jsx, event "needt-connections"):
     "connected" · "disconnected" (needs attention, red, explained) ·
     "connecting" · "none" / missing (never connected or switched off).
   Pinterest ("pinterest") is the same key Moodboards reads: connecting here or
   there is one state; disconnecting here ends access on every board. */
const cnNS = window.NeedtDesignSystem_25d3c8;
const { Icon: CnIcon } = cnNS;

/* The catalogue (CN_APPS / CN_AI / CN_CHIPS / CN_META), the MCP / API link
   options and the pure helpers live in connections-data.js (09.10.26) — one
   copy for this screen and the phone's Connections (phone-places.jsx).
   Tiles: real app icons (brand-icons.js → window.BrandIcon, Simple Icons
   marks, 08.10.26). Brands Simple Icons doesn't carry are letter tiles there;
   the port uses each brand's official brand-kit assets. Only "Other MCP
   client" keeps our own neutral tile (tile below). "reads" finishes the
   Disconnect copy ("Needt stops reading …"); "alias" is extra search words. */
const { CN_MCP_URL, CN_TABS, CN_APPS, CN_AI, CN_CHIPS, CN_META, cnReadSync, cnWriteSync, cnHay, cnLabel, cnByeText, cnKeyMask, cnKey,
  cnStepData, cnRich, CN_SCOPES, CN_PERMS, CN_ACCESS, CN_LINK_KINDS, cnOpt, cnProjects, cnScopeText, cnAutoName, cnUrlShort, cnMade,
  cnBundle, cnDownload, CN_FREE_MAIL, cnIsMail, cnProFeature, CN_PROMO_LINES, CN_CHECK_MS, cnCheckFails } = window.cnData;
const cnTabKey = "needt.connections.tab";
/* Screen memory (08.10.26, external QA: search "pinterest" → Documents → back
   showed the full catalog). Search text, chip, Connected/All and the scroll
   position live here, outside the component, and in sessionStorage
   (needt.cnState), so a normal screen switch brings you back exactly where
   you were. Only an explicit action resets them: clear ×, Esc, "Clear search"
   / "Show all". The tab itself stays in localStorage
   (needt.connections.tab) — other screens deep-link to the AI tab with it. */
const CN_STATE_KEY = "needt.cnState";
const cnState = (() => {
  let v = {}; try { v = JSON.parse(sessionStorage.getItem(CN_STATE_KEY)) || {}; } catch (e) {}
  return Object.assign({ show: "all", chip: "all", q: "", scroll: 0, scrollTab: null }, v);
})();
const cnSaveState = (patch) => {
  Object.assign(cnState, patch);
  try { sessionStorage.setItem(CN_STATE_KEY, JSON.stringify(cnState)); } catch (e) {}
};

const CN_CSS = `
@keyframes cn-spin { to { transform: rotate(360deg); } }
.cn-spin { animation: cn-spin .8s linear infinite; }
.cn-pill { flex: none; display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 6px; font: 500 12px/14px var(--font-sans); white-space: nowrap; }
.cn-badge { display: inline-flex; align-items: center; height: 18px; padding: 0 6px; border-radius: 5px; font: 600 10.5px/12px var(--font-sans); letter-spacing: .04em; text-transform: uppercase; background: var(--fill-3); color: var(--text-tertiary); }
.cn-iconbtn { width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 9px; background: transparent; color: var(--text-tertiary); cursor: default; transition: background-color 120ms ease, transform 90ms ease; }
.cn-iconbtn:hover, .cn-iconbtn[aria-expanded="true"] { background: var(--fill-3); color: var(--text-primary); }
.cn-iconbtn:active { transform: scale(.97); }
.cn-mi { display: flex; align-items: center; gap: 10px; width: 100%; height: 34px; padding: 0 10px; border: 0; border-radius: 9px; background: transparent; cursor: default; font: 400 14px/18px var(--font-sans); color: var(--text-primary); }
.cn-mi:hover { background: var(--fill-3); }
.cn-mi.is-danger { color: var(--destructive); }

/* Page frame + the grid: 3 columns from 1280 wide, 2 below, 1 when narrow. */
.cn-wrap { container-type: inline-size; container-name: cn; }
.cn-page { max-width: 1080px; margin: 0 auto; padding: 60px 40px 96px; display: flex; flex-direction: column; gap: 22px; box-sizing: border-box; }
.cn-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
@container cn (min-width: 600px) { .cn-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1280px) { @container cn (min-width: 900px) { .cn-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } } }
@container cn (max-width: 599px) { .cn-page { padding: 40px 16px 80px; } .cn-h1 { font-size: 56px !important; } }

/* Tabs: two big segments on Craft's glass track. */
.cn-tabs { display: inline-flex; gap: 4px; padding: 4px; align-self: center; }
.cn-tab { position: relative; display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 20px; border: 0; border-radius: 999px; background: transparent;
  font: 500 15px/1 var(--font-sans); color: var(--px-chip-ink); cursor: default; transition: background-color 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 90ms ease; }
.cn-tab:hover:not([aria-selected="true"]) { background: var(--white-a40); }
.dark .cn-tab:hover:not([aria-selected="true"]) { background: var(--white-a6); }
.cn-tab:active { transform: scale(.97); }
.cn-tab[aria-selected="true"] { background: var(--surface-raised); color: var(--text-primary); box-shadow: var(--shadow-raised); }
.cn-tab .cn-count { font: 500 12px/1 var(--font-sans); color: var(--text-tertiary); }
.cn-tab:not([aria-selected="true"]) .cn-count { color: inherit; opacity: .7; }
.cn-tab .cn-dot { width: 6px; height: 6px; border-radius: 3px; background: var(--destructive); }

/* Toolbar: segmented Connected/All, chips, search. */
.cn-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cn-seg { display: inline-flex; gap: 2px; padding: 3px; }
.cn-seg button { height: 26px; padding: 0 12px; border: 0; border-radius: 999px; background: transparent; font: 500 13px/1 var(--font-sans); color: var(--px-chip-ink); cursor: default; transition: background-color 140ms ease, transform 90ms ease; }
.cn-seg button[aria-pressed="true"] { background: var(--surface-raised); color: var(--text-primary); box-shadow: var(--shadow-raised); }
.cn-seg button:active { transform: scale(.97); }
.cn-chip { height: 28px; padding: 0 12px; border-radius: 999px; font: 500 13px/1 var(--font-sans); }
.cn-chip[aria-pressed="true"] { box-shadow: var(--px-chip-ink) 0 0 0 1.5px inset !important; }
.cn-search { position: relative; margin-left: auto; width: 240px; max-width: 100%; height: 32px; display: flex; align-items: center; }
.cn-search input { width: 100%; height: 32px; box-sizing: border-box; padding: 0 30px 0 32px; border: 0; border-radius: 999px; outline: none; font: 400 13.5px/1 var(--font-sans); color: var(--px-chip-ink); background: transparent; }
.cn-search input::placeholder { color: var(--px-chip-ink); opacity: .62; }
.cn-search input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cn-search .cn-sicon { position: absolute; left: 11px; display: flex; color: var(--px-chip-ink); opacity: .7; pointer-events: none; }
.cn-search .cn-sx { position: absolute; right: 4px; width: 24px; height: 24px; border-radius: 12px; }
@container cn (max-width: 720px) { .cn-search { margin-left: 0; width: 100%; } }

/* Cards. */
.cn-c { display: flex; flex-direction: column; gap: 12px; min-height: 172px; }
/* Head: the 40px tile is centred on the two-line block to its right (name 20
   + 2 + a 22px status row — the pill, or the kind label centred in the same
   22px), so cards with and without a status line line up the same. */
.cn-c-head { display: flex; align-items: center; gap: 14px; min-width: 0; }
.cn-c-name { font: 600 15px/20px var(--font-sans); color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cn-c-kind { font: 400 12.5px/16px var(--font-sans); color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cn-c-gives { margin: 0; font: 400 13.5px/19px var(--font-sans); color: var(--text-secondary); text-wrap: pretty; }
.cn-c-foot { margin-top: auto; display: flex; align-items: center; gap: 10px; min-height: 32px; padding-top: 12px; box-shadow: var(--border) 0 1px 0 0 inset; }
.cn-c.is-down { box-shadow: var(--black-a4) 0 8px 16px -4px, var(--black-a8) 0 12px 24px -4px, var(--color-white) 0 0 0 1px inset, color-mix(in oklch, var(--destructive) 45%, transparent) 0 0 0 1px; }
.dark .cn-c.is-down { box-shadow: var(--black-a30) 0 10px 20px -6px, var(--black-a45) 0 24px 48px -12px, var(--white-a8) 0 0 0 1px inset, color-mix(in oklch, var(--destructive) 55%, transparent) 0 0 0 1px; }

.dark .cn-pill[data-cn-pill="connected"] { color: color-mix(in oklch, var(--success) 70%, white) !important; }
.dark .cn-pill[data-cn-pill="disconnected"] { color: color-mix(in oklch, var(--destructive) 75%, white) !important; }

/* The AI explainer line and empty state on the sky. */
.cn-explain { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; font: 400 15px/21px var(--font-sans); color: var(--px-ink-2); text-align: center;
  text-shadow: 0 1px 2px var(--px-shadow), 0 0 14px var(--px-halo); }
.cn-explain b { font-weight: 600; color: var(--px-ink); }
.cn-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 36px 24px; text-align: center; }

/* Setup sheet. */
.cn-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; counter-reset: cn; }
.cn-step { display: grid; grid-template-columns: 24px minmax(0, 1fr); column-gap: 12px; row-gap: 8px; align-items: start; }
.cn-step-n { width: 24px; height: 24px; border-radius: 12px; display: grid; place-items: center; background: var(--fill-3); font: 600 12px/1 var(--font-sans); color: var(--text-secondary); }
.cn-step-t { font: 400 14px/24px var(--font-sans); color: var(--text-primary); text-wrap: pretty; }
.cn-step-t b { font-weight: 600; }
.cn-step-x { grid-column: 2; min-width: 0; }
.cn-url { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; height: 32px; padding: 0 10px; border-radius: 9px; background: var(--fill-2);
  box-shadow: var(--border) 0 0 0 1px inset; font: 500 12.5px/1 ui-monospace, "SF Mono", Menlo, monospace; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cn-code { position: relative; margin: 0; padding: 12px 14px; border-radius: 12px; background: var(--fill-2); box-shadow: var(--border) 0 0 0 1px inset;
  font: 500 12px/18px ui-monospace, "SF Mono", Menlo, monospace; color: var(--text-primary); white-space: pre; overflow-x: auto; }
.cn-code-copy { position: absolute; top: 8px; right: 8px; }
.cn-path { font: 500 12.5px/1 ui-monospace, "SF Mono", Menlo, monospace; padding: 2px 6px; border-radius: 6px; background: var(--fill-3); }
.cn-wait { display: inline-flex; align-items: center; gap: 8px; font: var(--type-meta); color: var(--text-tertiary); }
@media (prefers-reduced-motion: reduce) { .cn-spin { animation-duration: 2s; } }
`;

function cnUseConn() {
  const read = () => (window.connections ? window.connections.get() : {});
  const [v, setV] = React.useState(read);
  React.useEffect(() => {
    const on = () => setV(read());
    window.addEventListener("needt-connections", on);
    return () => window.removeEventListener("needt-connections", on);
  }, []);
  return v;
}

function CnSpinner({ size }) {
  const z = size || 12;
  return <span aria-hidden="true" className="cn-spin cn-spinner-el" style={{ width: z, height: z }} />;
}
function CnTile({ id, size }) {
  const z = size || 40;
  const BI = window.BrandIcon;
  if (BI && BI.has(id)) return <BI id={id} size={z} />;
  /* Ours (Other MCP client): a neutral tile in the same shape as the brand tiles. */
  const t = CN_META[id].tile || { bg: "var(--fill-3)", fg: "var(--text-secondary)" };
  return (
    <span aria-hidden="true" className="cn-tile-grid" style={{ width: z, height: z, borderRadius: Math.round(z * 0.22), background: t.bg, color: t.fg,
      boxShadow: "var(--black-a10) 0 0 0 1px inset" }}>
      {t.icon === "plug" ? <CnIcon name="mcp" size={Math.round(z * 0.5)} />
        : <span style={{ font: "700 " + Math.round(z * 0.46) + "px/1 var(--font-sans)" }}>{CN_META[id].label.charAt(0)}</span>}
    </span>
  );
}
function CnPill({ state }) {
  const k = state === "connected" ? ["Connected", "var(--success)", "circle-check"]
    : state === "disconnected" ? ["Needs attention", "var(--destructive)", "triangle-alert"]
    : state === "connecting" ? ["Connecting…", "var(--text-tertiary)", null]
    : ["Not connected", "var(--text-tertiary)", null];
  return (
    <span className="cn-pill nx-swap" key={state} data-cn-pill={state}
      style={{ color: k[1], background: state === "connected" || state === "disconnected" ? "color-mix(in oklch, " + k[1] + " 12%, transparent)" : "var(--fill-3)" }}>
      {k[2] ? <CnIcon name={k[2]} size={12} /> : state === "connecting" ? <CnSpinner size={10} /> : null}{k[0]}
    </span>
  );
}

/* "…" — portalled under its trigger. items: [[icon, label, fn, danger, attr]] */
function CnMenu({ id, items }) {
  const [open, setOpen] = React.useState(false);
  const [at, setAt] = React.useState(null);
  const btn = React.useRef(null), pop = React.useRef(null);
  const [shown, leaving] = window.useExit ? window.useExit(open, 130) : [open, false];
  React.useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = 12 + items.length * 34;
    setAt(r.bottom + 6 + h > window.innerHeight - 8 ? { right: window.innerWidth - r.right, top: r.top - 6 - h, flip: true } : { right: window.innerWidth - r.right, top: r.bottom + 6 });
  }, [open]);
  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!(btn.current && btn.current.contains(e.target)) && !(pop.current && pop.current.contains(e.target))) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const pick = (fn) => { setOpen(false); fn(); };
  return (
    <>
      <button ref={btn} type="button" className="cn-iconbtn" aria-label={"Options for " + cnLabel(id)} aria-haspopup="menu" aria-expanded={open} data-cn-more={id} onClick={() => setOpen(!open)}>
        <CnIcon name="ellipsis" size={16} />
      </button>
      {shown && at ? ReactDOM.createPortal(
        <div ref={pop} role="menu" className={("nx-pop is-right" + (leaving ? " is-leaving" : "")) + " cn-menu-box"} data-cn-menu={id}
          style={{ transformOrigin: at.flip ? "bottom right" : "top right", right: at.right, top: at.top }}>
          {items.map(([ic, label, fn, danger, attr]) => (
            <button key={label} type="button" role="menuitem" className={"cn-mi" + (danger ? " is-danger" : "")} {...{ [attr]: id }} onClick={() => pick(fn)}>
              <span className="cn-menu-row" style={{ color: danger ? "inherit" : "var(--text-tertiary)" }}><CnIcon name={ic} size={15} /></span>{label}
            </button>
          ))}
        </div>, document.body) : null}
    </>
  );
}

/* A centred sheet over the page: consent, setup steps or a confirm. */
function CnSheet({ open, onClose, children, label, width, glass }) {
  const [shown, leaving] = window.useExit ? window.useExit(open, 170) : [open, false];
  React.useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  if (!shown) return null;
  return ReactDOM.createPortal(
    <div className={("nx-scrim" + (leaving ? " is-leaving" : "")) + " cn-sheet-grid" + (glass ? " cn-scrim-glass" : "")} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={label} data-cn-sheet className={("nx-sheet" + (leaving ? " is-leaving" : "")) + " cn-sheet-col" + (glass ? " is-glass" : "")}
        style={{ width: width || 400 }}>
        {glass ? <div className="cn-sheet-scroll">{children}</div> : children}
      </div>
    </div>, document.body);
}

function CnConsent({ id, onAllow, onCancel }) {
  const m = CN_META[id];
  return (
    <>
      <div className="cn-consent-row">
        <span className="cn-consent-grid">N</span>
        <span className="cn-consent-row-2">{[0, 1, 2].map((k) => <span key={k} className="cn-consent-el" />)}</span>
        <CnTile id={id} size={40} />
        {m.beta ? <span className="cn-badge cn-consent-text">Beta</span> : null}
      </div>
      <div className="cn-consent-col">
        <span className="cn-sheet-title">Needt wants to access your {m.label} account</span>
        <span className="cn-meta">{id === "pinterest" ? "Signed in to Pinterest as teenx" : m.account}</span>
      </div>
      <div className="cn-consent-col-2">
        <span className="cn-consent-text-4">Needt wants to</span>
        {m.scopes.map((s) => (
          <span key={s} className="cn-consent-row-3">
            <span className="cn-consent-row-4"><CnIcon name="check" size={14} /></span>{s}
          </span>
        ))}
      </div>
      <span className="cn-consent-text-5">{m.never || "Needt never posts or deletes anything for you."} You can disconnect any time in Connections.</span>
      <div className="cn-consent-row-5">
        <button type="button" className="nx-btn nx-btn-text" onClick={onCancel}>Cancel</button>
        <button type="button" className="nx-btn nx-btn-primary" data-cn-allow={id} autoFocus onClick={onAllow}>Allow</button>
      </div>
    </>
  );
}

function CnConfirm({ id, onConfirm, onCancel }) {
  const m = CN_META[id];
  const body = cnByeText(id);
  return (
    <>
      <div className="cn-confirm-col">
        <span className="cn-sheet-title">Disconnect {m.label}?</span>
        <span className="cn-confirm-text">{body}</span>
      </div>
      <div className="cn-consent-row-5">
        <button type="button" className="nx-btn nx-btn-text" autoFocus onClick={onCancel}>Cancel</button>
        <button type="button" className="nx-btn nx-btn-danger" data-cn-confirm={id} onClick={onConfirm}>Disconnect</button>
      </div>
    </>
  );
}

/* ---------- AI tool setup: numbered steps per tool ---------- */
function cnCopy(text, what) {
  window.needtPlatform.copy(text);
  window.toast && window.toast(what + " copied");
}
function CnCopyRow({ value, what, onCopied, attr }) {
  return (
    <div className="cn-copy-row-row">
      <span className="cn-url" title={value}>{value}</span>
      <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" {...{ [attr || "data-cn-copy-url"]: "" }} onClick={() => { cnCopy(value, what); onCopied && onCopied(); }}>
        <CnIcon name="copy" size={13} />Copy</button>
    </div>
  );
}
function CnCode({ code, copyText, onCopied }) {
  return (
    <div className="cn-code-box">
      <pre className="cn-code" data-cn-code="">{code}</pre>
      <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm cn-code-copy" data-cn-copy-config="" onClick={() => { cnCopy(copyText || code, "Config"); onCopied && onCopied(); }}>
        <CnIcon name="copy" size={13} />Copy</button>
    </div>
  );
}
function CnKey({ apiKey, onMake }) {
  const [show, setShow] = React.useState(false);
  if (!apiKey) return (
    <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" data-cn-genkey="" onClick={() => onMake(false)}><CnIcon name="lock" size={13} />Generate API key</button>
  );
  return (
    <div className="cn-key-col">
      <span className="cn-url cn-key-el" data-cn-key={show ? "shown" : "masked"}>{show ? apiKey : cnKeyMask(apiKey)}</span>
      <div className="cn-key-row">
        <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" data-cn-reveal="" onClick={() => setShow(!show)}><CnIcon name={show ? "eye-off" : "eye"} size={13} />{show ? "Hide" : "Reveal"}</button>
        <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" data-cn-copy-key="" onClick={() => cnCopy(apiKey, "API key")}><CnIcon name="copy" size={13} />Copy</button>
        <button type="button" className="nx-btn nx-btn-text nx-btn-sm" data-cn-regen="" onClick={() => { setShow(false); onMake(true); }}><CnIcon name="refresh-cw" size={13} />Regenerate</button>
      </div>
      <span className="cn-meta">Treat it like a password. Regenerating stops the old key at once.</span>
    </div>
  );
}

/* The steps are data (connections-data.js cnStepData — the phone reads the
   same list); x says what goes under a step: the URL, a config, the key. */
function cnSteps(id, ctx) {
  return cnStepData(id, ctx.apiKey).map((s) => [cnRich(s.t, "cn-path"),
    s.x === "url" ? <CnCopyRow value={CN_MCP_URL} what="Server URL" onCopied={ctx.copied} />
      : s.x === "key" ? <CnKey apiKey={ctx.apiKey} onMake={ctx.makeKey} />
      : s.x ? <CnCode code={s.x.code} copyText={s.x.copy} onCopied={ctx.copied} /> : null]);
}

/* "Check connection" (08.10.26, owner): the user says they're done, Needt
   checks it really works — Checking… (1.6 s mock) → success ("Connected —
   Needt can see Claude", the card behind turns Connected) or failure (why,
   Try again, setup help). Failure path: needtStates offline, or load: error
   on screen "connections" or "mcp" (needtStates.set("load", "error", "mcp")
   fails the check without covering the page). */
function CnSetup({ id, apiKey, onMakeKey, onConnected, onClose, connected }) {
  const m = CN_META[id];
  const name = id === "othermcp" ? "your MCP client" : m.label;
  const [phase, setPhase] = React.useState("idle"); /* idle · checking · ok · fail */
  const [why, setWhy] = React.useState(null);
  const t = React.useRef(null);
  React.useEffect(() => () => window.clearTimeout(t.current), []);
  const check = () => {
    if (phase === "checking") return;
    setPhase("checking"); setWhy(null);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => {
      const bad = cnCheckFails();
      if (bad) { setWhy(bad); setPhase("fail"); return; }
      setPhase("ok"); onConnected();
    }, CN_CHECK_MS);
  };
  const help = (e) => { e.preventDefault(); onClose(); window.__app && window.__app.setHelpOpen && window.__app.setHelpOpen(true); };
  const steps = cnSteps(id, { copied: null, apiKey, makeKey: onMakeKey });
  const failLine = why === "offline"
    ? "You’re offline, so Needt can’t reach " + name + ". Check again when you’re back online."
    : "Needt didn’t hear from " + name + " yet. Make sure the last step finished — " + (id === "othermcp" || id === "cursor" || id === "gemini" ? "the config is saved and the app restarted" : "you signed in and approved Needt") + " — then try again.";
  return (
    <>
      <div className="cn-setup-row">
        <CnTile id={id} size={44} />
        <span className="cn-setup-col">
          <span className="cn-sheet-title">Connect {id === "othermcp" ? "an MCP client" : m.label}</span>
          <span className="cn-meta">{id === "othermcp" ? "Any app that speaks MCP" : m.label} reads your tasks, calendar and notes through Needt MCP</span>
        </span>
        <span className="cn-badge cn-setup-el">Beta</span>
      </div>
      <ol className="cn-steps" data-cn-steps={id}>
        {steps.map(([text, extra], i) => (
          <li key={i} className="cn-step">
            <span className="cn-step-n">{i + 1}</span>
            <span className="cn-step-t">{text}</span>
            {extra ? <div className="cn-step-x">{extra}</div> : null}
          </li>
        ))}
      </ol>
      {phase === "ok" || phase === "fail" ? (
        <div className={"cn-check nx-swap" + (phase === "ok" ? " is-ok" : " is-fail")} data-cn-check={phase} role={phase === "fail" ? "alert" : "status"}>
          <span className="cn-check-icon"><CnIcon name={phase === "ok" ? "circle-check" : "triangle-alert"} size={16} /></span>
          <span className="cn-check-text">
            <b>{phase === "ok" ? "Connected — Needt can see " + name : "Couldn’t reach " + name}</b>
            <span>{phase === "ok" ? "Ask it about your day to try it." : failLine}</span>
            {phase === "fail" ? <a href="#" className="cn-check-help" data-cn-help="" onClick={help}>Setup help</a> : null}
          </span>
        </div>
      ) : null}
      <div className="cn-setup-row-2">
        <span className="cn-wait" data-cn-wait={phase} aria-live="polite">
          {phase === "checking" ? <><CnSpinner />Checking…</> : phase === "idle" && connected ? "Already connected" : null}
        </span>
        <span className="cn-setup-el-2" />
        {phase === "ok" ? (
          <button type="button" className="nx-btn nx-btn-primary" data-cn-done={id} autoFocus onClick={onClose}>Done</button>
        ) : (
          <>
            <button type="button" className="nx-btn nx-btn-text" onClick={onClose}>Cancel</button>
            <button type="button" className="nx-btn nx-btn-primary" data-cn-check-btn={id} aria-disabled={phase === "checking" ? "true" : undefined}
              onClick={check}>{phase === "fail" ? "Try again" : "Check connection"}</button>
          </>
        )}
      </div>
    </>
  );
}

/* Calendar sync settings: CN_CAL_SYNC / cnCalOn live in stores.jsx (one
   copy for this screen and the phone's Connections). */
/* A project's colour (var(--hue-…)) as the dot's data-hue name; any other
   colour keeps the dot's default. (Was called here but defined nowhere — the
   MCP / API link sheet threw on "Selected projects", 09.10.26.) */
const cnHueOf = (color) => { const m = /--hue-(\w+)/.exec(String(color || "")); return m ? m[1] : undefined; };
function CnSyncRow({ title, desc, hue, checked, onChange, attr }) {
  const Sw = cnNS.Switch;
  return (
    <label className="cn-sync-row" {...{ [attr]: "" }}>
      {hue ? <span className="cn-sync-dot" data-hue={hue} aria-hidden="true" /> : null}
      <span className="cn-sync-text">
        <span className="cn-sync-title">{title}</span>
        {desc ? <span className="cn-sync-desc">{desc}</span> : null}
      </span>
      <Sw checked={checked} onChange={onChange} />
    </label>
  );
}
function CnCalSync({ id, onClose }) {
  const m = CN_META[id], d = CN_CAL_SYNC[id];
  const [v, set] = window.useSettings();
  const on = cnCalOn(id, v);
  const flip = (name, yes) => set(d.key, d.cals.map((c) => c[0]).filter((n) => (n === name ? yes : on.indexOf(n) >= 0)));
  return (
    <>
      <div className="cn-setup-row">
        <CnTile id={id} size={44} />
        <span className="cn-setup-col">
          <span className="cn-sheet-title">Sync settings</span>
          <span className="cn-meta">{m.label} · {m.account}</span>
        </span>
      </div>
      <section className="cn-sync-group" data-cn-sync-cals={id}>
        <span className="cn-sync-label">Calendars</span>
        <div className="cn-sync-list">
          {d.cals.map(([name, hue]) => (
            <CnSyncRow key={name} title={name} hue={hue} attr="data-cn-cal" checked={on.indexOf(name) >= 0} onChange={(x) => flip(name, x)} />
          ))}
        </div>
        <span className="cn-sync-hint">{on.length ? "Events from these fill your day, and Needt plans tasks around them." : "Nothing from " + m.label + " shows in your day."}</span>
      </section>
      <section className="cn-sync-group">
        <span className="cn-sync-label">Events</span>
        <div className="cn-sync-list">
          <CnSyncRow title="Show declined events" attr="data-cn-declined" checked={!!v.declined} onChange={(x) => set("declined", x)} />
          <CnSyncRow title="Show all-day events" attr="data-cn-allday" checked={!!v.allDay} onChange={(x) => set("allDay", x)} />
          <CnSyncRow title="Write changes back" desc={"Moving an event in Needt moves it in " + m.label + " too"} attr="data-cn-writeback"
            checked={!!v.writeBack} onChange={(x) => set("writeBack", x)} />
        </div>
        <span className="cn-sync-hint">These apply to every calendar you connect.</span>
      </section>
      <div className="cn-setup-row-2">
        <span className="cn-setup-el-2" />
        <button type="button" className="nx-btn nx-btn-primary" data-cn-sync-done={id} autoFocus onClick={onClose}>Done</button>
      </div>
    </>
  );
}

/* ---------- Your MCP / API connections (08.10.26, owner, from Craft) ----------
   Under the AI tool cards: the user's own access points into Needt, each a
   card; "+" makes one and opens its sheet. Stores: window.mcpLinks /
   window.apiLinks (stores.jsx). Integration guides live on the landing page
   later — for now a tile shows "coming soon" and links to needt.app/guides/<tool>. */

function CnLinkTile({ kind, size }) {
  return <span aria-hidden="true" className={"cn-l-tile is-" + (size || 36)}><CnIcon name={CN_LINK_KINDS[kind].icon} size={size === 44 ? 20 : 17} /></span>;
}

/* One option picker, portalled under its row. opts: [[key, title, desc]] */
function CnPick({ open, anchor, opts, value, onPick, onClose, attr }) {
  const pop = React.useRef(null);
  const [at, setAt] = React.useState(null);
  const [shown, leaving] = window.useExit ? window.useExit(open, 130) : [open, false];
  React.useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect(), h = 12 + opts.length * 52;
    const w = Math.min(280, r.width);
    setAt(r.bottom + 4 + h > window.innerHeight - 8 ? { left: r.right - w, top: r.top - 4 - h, w: w, flip: true } : { left: r.right - w, top: r.bottom + 4, w: w });
  }, [open]);
  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!(pop.current && pop.current.contains(e.target)) && !(anchor.current && anchor.current.contains(e.target))) onClose(); };
    const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc, true); };
  }, [open]);
  if (!shown || !at) return null;
  return ReactDOM.createPortal(
    <div ref={pop} role="menu" data-cn-pick={attr} className={"nx-pop is-right cn-menu-box cn-pick" + (leaving ? " is-leaving" : "") + (at.flip ? " is-flip" : "")}
      style={{ left: at.left, top: at.top, width: at.w }}>
      {opts.map(([k, t, d]) => (
        <button key={k} type="button" role="menuitemradio" aria-checked={value === k} className="cn-pick-opt" data-cn-opt={k} autoFocus={value === k}
          onClick={() => { onPick(k); onClose(); }}>
          <span className="cn-pick-text"><span className="cn-pick-t">{t}</span>{d ? <span className="cn-pick-d">{d}</span> : null}</span>
          <span className="cn-pick-check">{value === k ? <CnIcon name="check" size={15} /> : null}</span>
        </button>
      ))}
    </div>, document.body);
}

/* A settings row in the sheet: icon · label · value · chevron. */
function CnLRow({ icon, label, value, onClick, open, danger, end, attr, rowRef, href, children }) {
  const cls = "cn-lrow" + (danger ? " is-danger" : "") + (open ? " is-open" : "");
  const inner = (
    <>
      <span className="cn-lrow-ic"><CnIcon name={icon} size={16} /></span>
      <span className="cn-lrow-label">{label}</span>
      {children || (value != null ? <span className="cn-lrow-value">{value}</span> : <span className="cn-lrow-fill" />)}
      {end === false ? null : <span className="cn-lrow-end"><CnIcon name={end || "chevron-right"} size={15} /></span>}
    </>
  );
  if (href) return <a ref={rowRef} className={cls} href={href} target="_blank" rel="noopener noreferrer" {...{ [attr]: "" }}>{inner}</a>;
  if (!onClick) return <div ref={rowRef} className={cls} {...{ [attr]: "" }}>{inner}</div>;
  return <button ref={rowRef} type="button" className={cls} aria-expanded={open} {...{ [attr]: "" }} onClick={onClick}>{inner}</button>;
}


function CnLinkSheet({ kind, id, onClose }) {
  const K = CN_LINK_KINDS[kind], S = K.store();
  const list = window.useLinks(S);
  const l = list.find((x) => x.id === id);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [urlOpen, setUrlOpen] = React.useState(false);
  const [pick, setPick] = React.useState(null);
  const [confirm, setConfirm] = React.useState(false);
  const [guide, setGuide] = React.useState(null);
  const docRef = React.useRef(null), permRef = React.useRef(null), accRef = React.useRef(null);
  if (!l) return null;
  const set = (p) => S.patch(l.id, p);
  const saveName = () => { const v = draft.trim(); if (v && v !== l.name) set({ name: v }); setEditing(false); };
  const setScope = (k) => {
    const p = { scope: k };
    if (l.name === cnAutoName(kind, l.scope)) p.name = cnAutoName(kind, k);
    if (k === "projects" && !(l.projectIds || []).length) { const first = cnProjects()[0]; p.projectIds = first ? [first.id] : []; }
    set(p);
  };
  const flipProject = (pid, yes) => { const cur = l.projectIds || []; set({ projectIds: yes ? cur.concat([pid]) : cur.filter((x) => x !== pid) }); };
  const regen = () => {
    const old = l.url; S.regenerate(l.id);
    window.toast && window.toast("New URL — the old one stopped working", { undo: () => S.patch(l.id, { url: old }) });
  };
  const del = () => {
    const name = l.name; onClose();
    const undo = S.remove(l.id);
    window.toast && window.toast("Deleted “" + name + "”", { undo: undo });
  };
  const guideTool = guide && K.guides.find((g) => g[0] === guide);
  const BI = window.BrandIcon;
  return (
    <div className="cn-ls" data-cn-link-sheet={kind}>
      <div className="cn-ls-head">
        <CnLinkTile kind={kind} size={44} />
        <span className="cn-setup-col">
          <span className="cn-sheet-title cn-ls-title" data-cn-link-title="">{l.name}</span>
          <span className="cn-meta">{K.sub} · {cnMade(l.createdAt)}</span>
        </span>
        <button type="button" className="cn-iconbtn cn-setup-el" aria-label="Close" onClick={onClose}><CnIcon name="x" size={16} /></button>
      </div>

      <div className="cn-lgroup">
        {editing ? (
          <div className="cn-lrow is-edit" data-cn-link-name="">
            <span className="cn-lrow-ic"><CnIcon name="pen-line" size={16} /></span>
            <span className="cn-lrow-label">Name</span>
            <input className="cn-lrow-input" autoFocus value={draft} aria-label="Name" data-cn-name-input=""
              onChange={(e) => setDraft(e.target.value)} onBlur={saveName}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { e.stopPropagation(); setEditing(false); } }} />
          </div>
        ) : (
          <CnLRow icon="pen-line" label="Name" value={l.name} attr="data-cn-link-name" onClick={() => { setDraft(l.name); setEditing(true); }} />
        )}
        <CnLRow icon="link" label="URL" value={<span className="cn-lrow-mono">{cnUrlShort(l.url)}</span>} attr="data-cn-link-url" open={urlOpen}
          end={urlOpen ? "chevron-down" : "chevron-right"} onClick={() => setUrlOpen(!urlOpen)} />
        {urlOpen ? (
          <div className="cn-lurl nx-swap" data-cn-url-full="">
            <span className="cn-lurl-text">{l.url}</span>
            <div className="cn-key-row">
              <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" data-cn-url-copy="" onClick={() => cnCopy(l.url, "URL")}><CnIcon name="copy" size={13} />Copy</button>
              <button type="button" className="nx-btn nx-btn-text nx-btn-sm" data-cn-url-regen="" onClick={regen}><CnIcon name="refresh-cw" size={13} />Regenerate</button>
            </div>
            <span className="cn-meta">{l.access === "public" ? "Anyone with this URL can use it — share it only with tools you trust." : "Tools also need your sign-in token. Regenerating stops the old URL at once."}</span>
          </div>
        ) : null}
        <CnLRow icon="docs" label="Documents" value={cnScopeText(l)} rowRef={docRef} attr="data-cn-link-scope" open={pick === "scope"}
          end="chevrons-up-down" onClick={() => setPick(pick === "scope" ? null : "scope")} />
        {l.scope === "projects" ? (
          <div className="cn-sync-list cn-lprojects" data-cn-link-projects="">
            {cnProjects().map((p) => (
              <CnSyncRow key={p.id} title={p.name} hue={cnHueOf(p.color)} attr="data-cn-link-project"
                checked={(l.projectIds || []).indexOf(p.id) >= 0} onChange={(x) => flipProject(p.id, x)} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="cn-lgroup">
        <CnLRow icon={l.permission === "write" ? "pencil" : "eye"} label="Permission level" value={cnOpt(CN_PERMS, l.permission)[1]} rowRef={permRef}
          attr="data-cn-link-perm" open={pick === "perm"} end="chevrons-up-down" onClick={() => setPick(pick === "perm" ? null : "perm")} />
        <CnLRow icon={l.access === "public" ? "globe" : "lock"} label="Access mode" value={cnOpt(CN_ACCESS, l.access)[1]} rowRef={accRef}
          attr="data-cn-link-access" open={pick === "access"} end="chevrons-up-down" onClick={() => setPick(pick === "access" ? null : "access")} />
      </div>
      {l.access === "public" && l.permission === "write" ? (
        <span className="cn-lwarn" data-cn-link-warn=""><CnIcon name="triangle-alert" size={14} />Anyone with the URL can change your {kind === "mcp" ? "docs and tasks" : "data"}. Keep it secret.</span>
      ) : null}

      {kind === "api" ? (
        <div className="cn-lgroup">
          <CnLRow icon="file-text" label="API reference" href="https://needt.app/docs/api" end="arrow-up-right" attr="data-cn-api-ref" />
          <CnLRow icon="download" label="Download AI bundle" end="arrow-down" attr="data-cn-api-bundle"
            onClick={() => { cnDownload("needt-api-bundle.md", cnBundle(l)); window.toast && window.toast("AI bundle downloaded"); }} />
        </div>
      ) : null}

      {confirm ? (
        <div className="cn-ldel nx-swap" data-cn-link-confirm="">
          <span className="cn-confirm-col">
            <b className="cn-ldel-t">Delete “{l.name}”?</b>
            <span className="cn-confirm-text">{kind === "mcp" ? "AI tools using this URL lose access right away." : "Workflows and shortcuts using this URL stop working right away."}</span>
          </span>
          <div className="cn-consent-row-5">
            <button type="button" className="nx-btn nx-btn-text nx-btn-sm" autoFocus onClick={() => setConfirm(false)}>Cancel</button>
            <button type="button" className="nx-btn nx-btn-danger nx-btn-sm" data-cn-link-delete-yes="" onClick={del}>Delete</button>
          </div>
        </div>
      ) : (
        <div className="cn-lgroup">
          <CnLRow icon="trash-2" label={"Delete this " + K.noun} danger end={false} attr="data-cn-link-delete" onClick={() => setConfirm(true)} />
        </div>
      )}

      <div className="cn-lguides">
        <span className="cn-sync-label">View integration guide for…</span>
        <div className="cn-lguide-row" role="group" aria-label="Integration guides">
          {K.guides.map(([g, label]) => (
            <button key={g} type="button" className="cn-lguide" aria-label={label + " guide"} title={label} aria-pressed={guide === g} data-cn-guide={g}
              onClick={() => setGuide(guide === g ? null : g)}>
              {BI && BI.has(g) ? <BI id={g} size={32} /> : <span className="cn-l-tile is-32">{label.charAt(0)}</span>}
            </button>
          ))}
        </div>
        {guideTool ? (
          <span className="cn-lguide-note nx-swap" key={guide} data-cn-guide-note={guide}>
            <CnIcon name="info" size={14} />
            <span>{guideTool[1]} guide is coming soon on needt.app.</span>
            <a href={"https://needt.app/guides/" + guide} target="_blank" rel="noopener noreferrer">needt.app/guides/{guide}</a>
          </span>
        ) : null}
      </div>

      <CnPick open={pick === "scope"} anchor={docRef} opts={CN_SCOPES} value={l.scope} attr="scope" onPick={setScope} onClose={() => setPick(null)} />
      <CnPick open={pick === "perm"} anchor={permRef} opts={CN_PERMS} value={l.permission} attr="perm" onPick={(k) => set({ permission: k })} onClose={() => setPick(null)} />
      <CnPick open={pick === "access"} anchor={accRef} opts={CN_ACCESS} value={l.access} attr="access" onPick={(k) => set({ access: k })} onClose={() => setPick(null)} />
    </div>
  );
}

function CnLinkCard({ kind, link, index, onOpen }) {
  const Glass = window.GlassCard;
  return (
    <Glass className="cn-l nx-swap" pad={16} radius={18} data-cn-link={link.id} label={"Open " + link.name} onClick={onOpen}
      style={{ animationDelay: (index * 30) + "ms" }}>
      <CnLinkTile kind={kind} />
      <span className="cn-l-text">
        <span className="cn-l-name">{link.name}</span>
        <span className="cn-l-meta">{(link.name.indexOf(cnScopeText(link)) >= 0 ? "" : cnScopeText(link) + " · ") + cnOpt(CN_PERMS, link.permission)[1] + " · " + cnOpt(CN_ACCESS, link.access)[1]}</span>
      </span>
      <span className="cn-lrow-end"><CnIcon name="chevron-right" size={15} /></span>
    </Glass>
  );
}

/* Pro (08.10.26, paywall.jsx): Free keeps one mail account; AI tools, MCP
   and API connections and Pinterest are Pro. A locked card trades Connect for
   Upgrade (opens the paywall on that feature) and says the limit; on Pro the
   AI tab, its section headers and Pinterest keep a small PRO pill. */
const cnUsePro = () => (window.useNeedtPro ? window.useNeedtPro() : true);
function CnProPill({ pro }) { return window.ProBadge ? <window.ProBadge size="sm" locked={!pro} /> : null; }

function CnLinkSection({ kind, needle, onOpen, onNew, pro }) {
  const K = CN_LINK_KINDS[kind];
  const all = window.useLinks(K.store());
  const list = needle ? all.filter((l) => (l.name + " " + K.noun + " api mcp").toLowerCase().indexOf(needle) >= 0) : all;
  if (needle && !list.length) return null;
  return (
    <section className="cn-lsec nx-swap" data-cn-links={kind} aria-label={K.title}>
      <div className="cn-lsec-head" data-px-calm>
        <span className="cn-lsec-titles">
          <h2 className="cn-lsec-title">{K.title}</h2>
          <span className="cn-lsec-sub">{K.sub}</span>
        </span>
        <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm cn-lsec-add" aria-label={"New " + K.noun + " connection"} data-cn-link-new={kind} onClick={onNew}>
          <CnIcon name="plus" size={13} />New</button>
      </div>
      <div className="cn-grid cn-lgrid">
        {list.map((l, i) => <CnLinkCard key={l.id} kind={kind} link={l} index={i} onOpen={() => onOpen(l.id)} />)}
        <button type="button" className="cn-l-new" data-cn-link-add={kind} onClick={onNew}>
          <CnIcon name="plus" size={15} />New {K.noun} connection</button>
      </div>
    </section>
  );
}

/* Free, AI tools tab: the whole tab is this one panel. The tool icons sit
   hazy behind a lock; the only things you can press are the two buttons. */
function CnAiPromo() {
  const Glass = window.GlassCard;
  const pay = (f) => () => window.openPaywall && window.openPaywall(f);
  return (
    <Glass className="cn-promo nx-swap" pad={0} radius={24} data-cn-ai-promo="">
      <div className="cn-promo-in">
      <div className="cn-promo-icons" aria-hidden="true">
        <span className="cn-promo-haze">{CN_AI.map((id) => <CnTile key={id} id={id} size={44} />)}</span>
        <span className="cn-promo-lock"><CnIcon name="lock" size={18} /></span>
      </div>
      <div className="cn-promo-text">
        <h2 className="cn-promo-title">Bring Needt into your AI tools</h2>
        <p className="cn-promo-line">Your tasks, calendar and notes — right where you already ask questions.</p>
      </div>
      <ul className="cn-promo-list">
        {CN_PROMO_LINES.map((t) => (
          <li key={t} className="cn-promo-li"><span className="cn-promo-check"><CnIcon name="check" size={13} /></span>{t}</li>))}
      </ul>
      <div className="cn-promo-cta">
        <button type="button" className="nx-btn nx-btn-primary cn-promo-btn" data-cn-promo-try="" onClick={pay("AI tools")}>Try Pro free for 14 days</button>
        <button type="button" className="nx-btn nx-btn-secondary cn-promo-btn" data-cn-promo-plans="" onClick={pay()}>See plans</button>
      </div>
      </div>
    </Glass>
  );
}

/* ---------- a card ---------- */
function CnCard({ id, state, sync, busy, index, onConnect, onReconnect, onSync, onDisconnect, onSettings, locked, limit, pro }) {
  const Glass = window.GlassCard;
  const m = CN_META[id];
  const on = state === "connected", down = state === "disconnected";
  const wait = state === "connecting" || busy === "connect";
  const account = m.ai ? "Needt MCP · maksym" : m.account;
  const meta = busy === "sync" ? "Syncing…" : on ? (m.ai ? "Last used " : "Synced ") + (sync || "just now") : down ? (m.lost || "Access ended — reconnect to sync") : null;
  const items = m.ai
    ? [["list-numbers", "Show setup steps", onConnect, false, "data-cn-steps-again"], ["unlink", "Disconnect…", onDisconnect, true, "data-cn-disconnect"]]
    : [].concat(CN_CAL_SYNC[id] ? [["sliders-horizontal", "Sync settings", onSettings, false, "data-cn-sync-settings"]] : [],
      [["refresh-cw", "Sync now", onSync, false, "data-cn-sync"], ["unlink", "Disconnect…", onDisconnect, true, "data-cn-disconnect"]]);
  return (
    <Glass className={"cn-c nx-swap" + (down ? " is-down" : "")} pad={18} radius={20} data-cn-card={id} data-state={wait ? "connecting" : state || "none"}
      style={{ animationDelay: (index * 30) + "ms" }}>
      <div className="cn-c-head">
        <CnTile id={id} size={40} />
        <span className="cn-card-col">
          <span className="cn-card-row">
            <span className="cn-c-name">{m.label}</span>
            {m.beta ? <span className="cn-badge">Beta</span> : null}
            {pro && id === "pinterest" ? <CnProPill pro /> : null}
          </span>
          <span className="cn-card-row-2">{on || down || wait ? <CnPill state={wait ? "connecting" : state} /> : <span className="cn-c-kind">{m.kind}</span>}</span>
        </span>
        {on && !wait ? <span className="cn-card-text"><CnMenu id={id} items={items} /></span> : null}
      </div>
      <p className="cn-c-gives">{m.gives}</p>
      <div className="cn-c-foot">
        {on || down ? (
          <span className="cn-card-col-2">
            <span className="cn-card-text-2" data-cn-account="">{account}</span>
            <span className="cn-card-text-3" style={{ color: down ? "var(--destructive)" : "var(--text-tertiary)" }}
              data-cn-meta="">{busy === "sync" ? <span className="cn-card-row-3"><CnSpinner size={10} />Syncing…</span> : meta}</span>
          </span>
        ) : locked && limit ? <span className="cn-setup-el-2 cn-limit" data-cn-limit="">{limit}</span> : <span className="cn-setup-el-2" />}
        {down || state === "connecting" ? (
          <button type="button" className="nx-btn nx-btn-primary nx-btn-sm cn-card-btn" data-cn-reconnect={id} disabled={state === "connecting"} onClick={onReconnect}>
            {state === "connecting" ? <CnSpinner /> : <CnIcon name="reconnect" size={13} />}{state === "connecting" ? "Reconnecting" : "Reconnect"}
          </button>
        ) : !on && locked ? (
          <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm cn-card-btn-2" data-cn-upgrade={id} title={"Unlock " + locked + " with Pro"}
            onClick={() => window.openPaywall && window.openPaywall(locked)}>
            <CnIcon name="lock" size={13} />Upgrade
          </button>
        ) : !on ? (
          <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm cn-card-btn-2" data-cn-connect={id} disabled={wait} onClick={onConnect}>
            {wait ? <CnSpinner /> : <CnIcon name="plus" size={13} />}{wait ? "Connecting" : "Connect"}
          </button>
        ) : null}
      </div>
    </Glass>
  );
}

function ConnectionsScreen() {
  const conn = cnUseConn();
  const [sync, setSync] = React.useState(cnReadSync);
  const [busy, setBusy] = React.useState({});
  const [consent, setConsent] = React.useState(null);
  const [confirm, setConfirm] = React.useState(null);
  const [setup, setSetup] = React.useState(null);
  const [calSync, setCalSync] = React.useState(null);
  const [linkSheet, setLinkSheet] = React.useState(null);
  const [tab, setTabRaw] = React.useState(() => { try { return localStorage.getItem(cnTabKey) === "ai" ? "ai" : "apps"; } catch (e) { return "apps"; } });
  const [show, setShow] = React.useState(() => (cnState.show === "connected" ? "connected" : "all"));
  const [chip, setChip] = React.useState(() => (CN_CHIPS.some(([k]) => k === cnState.chip) ? cnState.chip : "all"));
  const [q, setQ] = React.useState(() => (typeof cnState.q === "string" ? cnState.q : ""));
  React.useEffect(() => { cnSaveState({ show: show, chip: chip, q: q }); }, [show, chip, q]);
  const [apiKey, setApiKey] = React.useState(cnKey.get);
  const timers = React.useRef({});
  const searchRef = React.useRef(null);
  /* Sticky toolbar (08.10.26, owner): tabs, filters and search stay pinned
     while 33 cards scroll under them. A 1px sentinel above the bar tells us
     when it is stuck (IntersectionObserver on the window's own scroller);
     only then does it get its glass, hairline and shadow. */
  const scrollRef = React.useRef(null), sentinel = React.useRef(null);
  const [stuck, setStuck] = React.useState(false);
  React.useEffect(() => {
    const root = scrollRef.current, el = sentinel.current;
    if (!root || !el || typeof IntersectionObserver !== "function") return undefined;
    const io = new IntersectionObserver(([e]) => {
      setStuck(!e.isIntersecting && e.boundingClientRect.top < (e.rootBounds ? e.rootBounds.top : 0) + 20);
    }, { root, rootMargin: "-9px 0px 0px 0px", threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  /* Scroll memory: restore once on arrival (same tab only), record as you go. */
  const tabRef = React.useRef(tab);
  tabRef.current = tab;
  React.useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return undefined;
    const want = cnState.scrollTab === tab ? cnState.scroll || 0 : 0;
    if (want) {
      /* Instantly — the scroller is smooth for user scrolls. Cards may still
         be laying out on the first frame, so try once more. */
      const jump = () => root.scrollTo({ top: want, behavior: "instant" });
      jump();
      window.requestAnimationFrame(() => { if (root.scrollTop < want - 1) jump(); });
    }
    let raf = 0;
    const on = () => {
      cnState.scroll = root.scrollTop; cnState.scrollTab = tabRef.current;
      if (!raf) raf = window.requestAnimationFrame(() => { raf = 0; cnSaveState({}); });
    };
    root.addEventListener("scroll", on, { passive: true });
    return () => { root.removeEventListener("scroll", on); window.cancelAnimationFrame(raf); cnSaveState({}); };
  }, []);
  /* Changing tab / filter while stuck: bring the first card up under the bar
     instead of leaving you somewhere in an empty stretch. */
  const stuckRef = React.useRef(false);
  stuckRef.current = stuck;
  const toTop = () => {
    const root = scrollRef.current, el = sentinel.current;
    if (!stuckRef.current || !root || !el) return;
    window.requestAnimationFrame(() => root.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior: "auto" }));
  };
  /* Sheets keep their last content while they animate out. */
  const lastConsent = React.useRef(null), lastConfirm = React.useRef(null), lastSetup = React.useRef(null), lastCalSync = React.useRef(null);
  const lastLink = React.useRef(null);
  if (linkSheet) lastLink.current = linkSheet;
  if (calSync) lastCalSync.current = calSync;
  if (consent) lastConsent.current = consent;
  if (confirm) lastConfirm.current = confirm;
  if (setup) lastSetup.current = setup;
  React.useEffect(() => () => Object.values(timers.current).forEach((t) => window.clearTimeout(t)), []);
  /* Switching tab keeps the search (the empty state points you to the other
     tab) and the chip (AI tools ignores it). */
  const setTab = (t) => { setTabRaw(t); toTop(); if (window.needtSync) window.needtSync.set(cnTabKey, t); };
  /* Another window's sync stamps land here. */
  React.useEffect(() => (window.needtSync ? window.needtSync.subscribe("needt.connections.sync", (v, info) => { if (info.origin !== "local") setSync(cnReadSync()); }) : undefined), []);
  const stamp = (id, v) => setSync((s) => { const n = Object.assign({}, s, { [id]: v }); cnWriteSync(n); return n; });
  const setB = (id, v) => setBusy((b) => Object.assign({}, b, { [id]: v }));
  const later = (id, ms, fn) => { window.clearTimeout(timers.current[id]); timers.current[id] = window.setTimeout(fn, ms); };
  const st = (id) => conn[id] || "none";
  const C = window.connections;

  const allow = (id) => {
    setConsent(null); setB(id, "connect");
    later(id, 1200, () => {
      setB(id, null); C.set(id, "connected"); stamp(id, "just now");
      window.toast && window.toast(cnLabel(id) + " connected" + (id === "pinterest" ? " — your boards are ready in Moodboards" : ""));
    });
  };
  const reconnect = (id) => { C.reconnect(id); later(id, 1250, () => stamp(id, "just now")); };
  const syncNow = (id) => {
    setB(id, "sync");
    later(id, 900, () => { setB(id, null); stamp(id, "just now"); window.toast && window.toast(cnLabel(id) + " is up to date"); });
  };
  const disconnect = (id) => {
    setConfirm(null);
    const before = st(id);
    C.set(id, "none");
    window.toast && window.toast(cnLabel(id) + " disconnected", { undo: () => C.set(id, before) });
  };
  /* The check passed: the card behind turns Connected now; the sheet stays
     up showing the success line until Done. */
  const aiDone = (id) => { C.set(id, "connected"); stamp(id, "just now"); };
  const makeKey = (regen) => {
    setApiKey(cnKey.make());
    window.toast && window.toast(regen ? "New API key — the old one stopped working" : "API key created");
  };

  /* "+ New MCP / API connection": make one and open its sheet. */
  const newLink = (kind) => {
    const S = CN_LINK_KINDS[kind].store();
    const l = S.create({ name: cnAutoName(kind, "daily"), scope: "daily" });
    setLinkSheet({ kind: kind, id: l.id });
  };

  const pro = cnUsePro();
  /* Free: one mail account. Disconnected still counts (it is still yours). */
  const mailUsed = CN_APPS.filter((id) => cnIsMail(id) && st(id) !== "none").length;
  const mailFull = !pro && mailUsed >= CN_FREE_MAIL;
  const lockOf = (id) => {
    if (pro || st(id) !== "none") return null;
    if (CN_META[id].ai || id === "pinterest") return cnProFeature(id);
    if (cnIsMail(id) && mailFull) return cnProFeature(id);
    return null;
  };
  const limitOf = (id) => cnIsMail(id) ? (mailUsed > CN_FREE_MAIL ? "Free: " + CN_FREE_MAIL + " mail account" : mailUsed + " of " + CN_FREE_MAIL + " mail accounts")
    : CN_META[id].ai || id === "pinterest" ? "Included in Pro" : null;
  /* Free + AI tools tab (08.10.26, owner: "this menu is entirely unavailable
     on Free"): the tab still opens, but shows one promo panel instead of the
     cards, filters and MCP / API sections. */
  const aiPromo = tab === "ai" && !pro;
  const ids = tab === "apps" ? CN_APPS : CN_AI;
  /* Every status line counts only the tab in front of you (08.10.26, owner:
     the AI tab said "6 connected · all syncing" with nothing connected). */
  const issues = ids.filter((id) => st(id) === "disconnected");
  const live = ids.filter((id) => st(id) === "connected").length;
  const status = issues.length
    ? issues.map(cnLabel).join(", ") + (issues.length === 1 ? " needs reconnecting" : " need reconnecting")
    : !live ? (tab === "ai" ? "No AI tools connected yet" : "Nothing connected yet")
    : live + " connected" + (tab === "apps" ? " · all syncing" : "");
  const statusTone = issues.length ? "bad" : live ? "ok" : "none";
  const needle = q.trim().toLowerCase();
  const list = ids.filter((id) => {
    const m = CN_META[id], s = st(id);
    if (show === "connected" && s !== "connected" && s !== "disconnected" && s !== "connecting") return false;
    if (tab === "apps" && chip !== "all" && m.cat !== chip) return false;
    if (needle && cnHay(id).indexOf(needle) < 0) return false;
    return true;
  });
  const tabCount = (tids) => tids.filter((id) => st(id) === "connected").length;
  const tabIssues = (tids) => tids.filter((id) => st(id) === "disconnected");

  const Sky = window.PxSky, Glass = window.GlassCard;
  const onTabKey = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault(); const n = tab === "apps" ? "ai" : "apps"; setTab(n);
    const el = document.querySelector('[data-cn-tab="' + n + '"]'); el && el.focus();
  };

  const empty = (
    <Glass className="cn-empty nx-swap" pad={0} radius={20} data-cn-empty="">
      <span className="cn-screen-grid">
        <CnIcon name={needle ? "search" : "connections"} size={18} /></span>
      <span className="cn-screen-text">
        {needle ? "Nothing matches “" + q.trim() + "”" : tab === "ai" ? "No AI tools connected yet" : "Nothing connected here yet"}</span>
      <span className="cn-screen-text-2">
        {needle ? (tab === "apps" ? "Check the spelling — or look in AI tools." : "Check the spelling — or look in Apps & services.")
          : "Switch to All apps to see what you can connect."}</span>
      <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm cn-screen-text-3" data-cn-clear=""
        onClick={() => { setQ(""); setShow("all"); setChip("all"); }}>{needle ? "Clear search" : "Show all"}</button>
    </Glass>
  );

  return (
    /* A window, not a wall (07.10.26, Craft): the sky sits in an inset with
       a 12px gap to the right and bottom edges (the same gap as top bar ->
       content), 14px corners, a hairline, and its own thin scrollbar. */
    <div data-cn-screen className="nx-window cn-screen-box">
      <style>{CN_CSS}</style>
      <Sky variant="a" radius={14}>
        <div ref={scrollRef} className="scroll-inner nx-scroll cn-wrap cn-screen-abs" data-cn-scroll>
          <div className="cn-page">
            <header className="nx-swap cn-screen-col" data-px-calm>
              <span className="px-kicker">Sources</span>
              <h1 className="px-display px-on-sky cn-h1 cn-screen-text-4">Connections</h1>
              <span className="px-on-sky cn-screen-text-5">
                Where Needt reads your mail, calendars and files — and how your AI tools read Needt.</span>
              <span data-cn-status={statusTone} className={"cn-screen-row-2 cn-status is-" + statusTone}
                title={issues.length ? issues.map(cnLabel).join(", ") + " lost access — reconnect to keep syncing" : undefined}>
                <span className="cn-screen-el" />{status}
              </span>
            </header>

            <div ref={sentinel} className="cn-sentinel" aria-hidden="true" />
            <div className={"cn-sticky" + (stuck ? " is-stuck" : "")} data-px-calm data-cn-sticky={stuck ? "stuck" : "rest"}>
              <div role="tablist" aria-label="Connection type" className="cn-tabs px-track nx-swap" style={{ animationDelay: "40ms" }} onKeyDown={onTabKey}>
                {CN_TABS.map(([k, label]) => {
                  const tids = k === "apps" ? CN_APPS : CN_AI, bad = tabIssues(tids), n = tabCount(tids);
                  return (
                    <button key={k} type="button" role="tab" id={"cn-tab-" + k} aria-controls="cn-panel" aria-selected={tab === k} tabIndex={tab === k ? 0 : -1}
                      className="cn-tab" data-cn-tab={k} onClick={() => setTab(k)}>
                      {label}{k === "ai" ? <CnProPill pro={pro} /> : null}{n ? <span className="cn-count" data-cn-count={k}>{n} connected</span> : null}
                      {bad.length ? <span className="cn-dot" title={bad.map(cnLabel).join(", ") + (bad.length === 1 ? " needs" : " need") + " attention"} /> : null}
                    </button>
                  );
                })}
              </div>

              {aiPromo ? null : <div className="cn-bar">
                <div className="cn-seg px-track" role="group" aria-label="Show">
                  {[["connected", "Connected"], ["all", "All apps"]].map(([k, l]) => (
                    <button key={k} type="button" aria-pressed={show === k} data-cn-show={k} onClick={() => { setShow(k); toTop(); }}>{l}</button>))}
                </div>
                {tab === "apps" ? <span aria-hidden="true" className="cn-screen-el-3" /> : null}
                {tab === "apps" ? CN_CHIPS.map(([k, l]) => (
                  <button key={k} type="button" className="px-chip-btn cn-chip" aria-pressed={chip === k} data-cn-chip={k} onClick={() => { setChip(k); toTop(); }}>{l}</button>
                )) : null}
                <label className="cn-search px-track">
                  <span className="cn-sicon"><CnIcon name="search" size={14} /></span>
                  <input ref={searchRef} type="search" value={q} data-cn-search="" aria-label={tab === "apps" ? "Search apps and services" : "Search AI tools"}
                    placeholder={tab === "apps" ? "Search apps" : "Search AI tools"} onChange={(e) => { setQ(e.target.value); toTop(); }}
                    onKeyDown={(e) => { if (e.key === "Escape" && q) { e.stopPropagation(); setQ(""); } }} />
                  {q ? <button type="button" className="cn-iconbtn cn-sx" aria-label="Clear search" onClick={() => { setQ(""); searchRef.current && searchRef.current.focus(); }}><CnIcon name="x" size={13} /></button> : null}
                </label>
              </div>}
            </div>

            <div id="cn-panel" role="tabpanel" aria-labelledby={"cn-tab-" + tab} className="cn-screen-col-2">
              {aiPromo ? <CnAiPromo /> : null}
              {aiPromo ? null : tab === "ai" ? (
                <p className="cn-explain nx-swap cn-screen-text-6" data-px-calm data-cn-explain="">
                  <span><b>Needt MCP</b> — use your Needt tasks, calendar and notes in your favourite AI.</span>
                  <span className="cn-badge cn-screen-el-2">Beta</span>
                </p>
              ) : null}
              {aiPromo ? null : list.length ? (
                <div className="cn-grid" key={tab + show + chip} data-cn-grid={tab}>
                  {list.map((id, i) => (
                    <CnCard key={id} id={id} index={i} state={st(id)} sync={sync[id]} busy={busy[id]} pro={pro} locked={lockOf(id)} limit={limitOf(id)}
                      onConnect={() => (CN_META[id].ai ? setSetup(id) : setConsent(id))} onReconnect={() => reconnect(id)}
                      onSync={() => syncNow(id)} onDisconnect={() => setConfirm(id)} onSettings={() => setCalSync(id)} />
                  ))}
                </div>
              ) : empty}

              {tab === "ai" && !aiPromo ? ["mcp", "api"].map((k) => (
                <CnLinkSection key={k} kind={k} needle={needle} pro={pro} onOpen={(id) => setLinkSheet({ kind: k, id: id })}
                  onNew={pro ? () => newLink(k) : () => window.openPaywall && window.openPaywall("MCP & API connections")} />
              )) : null}
            </div>
          </div>
        </div>
      </Sky>
      <CnSheet open={!!consent} label="Allow access" onClose={() => setConsent(null)}>
        {lastConsent.current ? <CnConsent id={lastConsent.current} onAllow={() => allow(lastConsent.current)} onCancel={() => setConsent(null)} /> : null}
      </CnSheet>
      <CnSheet open={!!setup} width={500} label={"Connect " + (lastSetup.current ? cnLabel(lastSetup.current) : "")} onClose={() => setSetup(null)}>
        {lastSetup.current ? <CnSetup key={lastSetup.current} id={lastSetup.current} apiKey={apiKey} onMakeKey={makeKey}
          connected={st(lastSetup.current) === "connected"}
          onConnected={() => aiDone(lastSetup.current)} onClose={() => setSetup(null)} /> : null}
      </CnSheet>
      <CnSheet open={!!calSync} width={440} label={(lastCalSync.current ? cnLabel(lastCalSync.current) + " " : "") + "sync settings"} onClose={() => setCalSync(null)}>
        {lastCalSync.current ? <CnCalSync id={lastCalSync.current} onClose={() => setCalSync(null)} /> : null}
      </CnSheet>
      <CnSheet open={!!linkSheet} glass width={480} label={lastLink.current ? CN_LINK_KINDS[lastLink.current.kind].noun + " connection" : "Connection"} onClose={() => setLinkSheet(null)}>
        {lastLink.current ? <CnLinkSheet key={lastLink.current.id} kind={lastLink.current.kind} id={lastLink.current.id} onClose={() => setLinkSheet(null)} /> : null}
      </CnSheet>
      <CnSheet open={!!confirm} label="Disconnect" onClose={() => setConfirm(null)}>
        {lastConfirm.current ? <CnConfirm id={lastConfirm.current} onConfirm={() => disconnect(lastConfirm.current)} onCancel={() => setConfirm(null)} /> : null}
      </CnSheet>
    </div>
  );
}

Object.assign(window, { ConnectionsScreen, cnLabel });
