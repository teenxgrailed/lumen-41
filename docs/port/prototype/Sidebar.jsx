const NS = window.NeedtDesignSystem_25d3c8;
const { Avatar, Icon, Tooltip, Menu } = NS;

/* Pinned rows wear the page's own face (ground + first lines) once the docs
   module is loaded; until then the plain document glyph. */
function PinnedFace({ id }) {
  const doc = (window.docs && window.docs.find(id)) || (window.DOCS || []).find((d) => d.id === id);
  return doc && window.DocThumb ? <span className="shell-pinned-face-grid"><window.DocThumb doc={doc} w={14} h={18} /></span> : <Icon name="file-text" size={16} />;
}

/* The mark itself lives in ExposureWordmark.jsx — the sidebar, the account
   screen and the route veil all render that one component. */
const { ExposureWordmark } = window;

/* ---------- Account (08.10.26) ----------
   There is one workspace; teams will live inside it. So the top-left is the
   person, not a "space": avatar, name and a plan pill on one 32px line. Click opens the
   account menu (Craft's): who you are + plan, then settings, appearance,
   invite, teams, sign out (help lives in the top-right ? button). Plan comes from paywall.jsx (useNeedtPlan). */
const SB_USER = { name: "Maksym", email: "tox222tox@gmail.com", initials: "M" };
const sbUsePlan = window.useNeedtPlan || function () { return ["free", () => {}]; };
function sbPlanLine(s) {
  const left = window.needtPlan ? window.needtPlan.trialDaysLeft : 0;
  if (s === "trial") return "Pro trial · " + left + (left === 1 ? " day" : " days");
  if (s === "lifetime") return "Pro · Lifetime";
  if (s === "monthly" || s === "yearly") return "Pro";
  return "Free";
}
/* The pill beside the name (08.10.26, owner: "must be one line"): the plan in
   two or three words — "Trial · 9d", "Pro", "Free". The full line is its title. */
function sbPlanPill(s) {
  const left = window.needtPlan ? window.needtPlan.trialDaysLeft : 0;
  if (s === "trial") return { text: "Trial · " + left + "d", tone: "trial" };
  if (s === "monthly" || s === "yearly" || s === "lifetime") return { text: "Pro", tone: "pro" };
  return { text: "Free", tone: "free" };
}
function SbProPill() {
  return window.ProBadge ? <window.ProBadge /> : <span className="sb-acct-pro">PRO</span>;
}
function sbAcctAt(el) {
  const r = el ? el.getBoundingClientRect() : { left: 10, bottom: 60 };
  return { left: Math.max(8, Math.min(r.left, window.innerWidth - 344)), top: r.bottom + 6 };
}
const SB_THEMES = [["system", "System"], ["light", "Light"], ["dark", "Dark"], ["time", "Time"]];

function SbAcctRow({ icon, label, kbd, onClick, soon }) {
  return (
    <button type="button" role="menuitem" data-acct-nav="" className="sb-acct-row" onClick={soon ? undefined : onClick} aria-disabled={soon ? "true" : undefined}>
      <span className="sb-acct-ico"><Icon name={icon} size={16} /></span>
      <span className="sb-acct-label">{label}</span>
      {soon ? <span className="sb-acct-soon">Soon</span> : kbd ? <kbd className="sb-acct-kbd">{kbd}</kbd> : null}
    </button>
  );
}

function AccountMenu({ onSettings, theme, onTheme }) {
  const [open, setOpen] = React.useState(false);
  const [shown, leaving] = window.useExit(open, 140);
  const [plan] = sbUsePlan();
  const pro = plan !== "free";
  const wrap = React.useRef(null);
  const trigger = React.useRef(null);
  const panel = React.useRef(null);
  const close = (refocus) => { setOpen(false); if (refocus && trigger.current) trigger.current.focus(); };
  React.useEffect(() => {
    if (!open) return undefined;
    function away(e) { if (wrap.current && !wrap.current.contains(e.target) && !(panel.current && panel.current.contains(e.target))) setOpen(false); }
    document.addEventListener("mousedown", away);
    /* First stop gets focus so arrows work at once (keyboard or mouse). */
    const t = window.setTimeout(() => { const f = panel.current && panel.current.querySelector("[data-acct-nav]"); if (f) f.focus({ preventScroll: true }); }, 0);
    return () => { document.removeEventListener("mousedown", away); window.clearTimeout(t); };
  }, [open]);
  const app = () => window.__app || {};
  const run = (fn) => () => { close(false); fn && fn(); };
  const stops = () => Array.prototype.slice.call(panel.current ? panel.current.querySelectorAll("[data-acct-nav]:not([aria-disabled='true'])") : []);
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === "Tab") { close(false); return; }
    const list = stops(), i = list.indexOf(document.activeElement);
    const go = (n) => { const el = list[(n + list.length) % list.length]; if (el) el.focus(); };
    if (e.key === "ArrowDown") { e.preventDefault(); go(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); go(i < 0 ? list.length - 1 : i - 1); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(list.length - 1); }
    else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && document.activeElement && document.activeElement.hasAttribute("data-acct-theme")) {
      e.preventDefault();
      const k = SB_THEMES.findIndex(([v]) => v === theme), n = SB_THEMES[(k + (e.key === "ArrowRight" ? 1 : -1) + SB_THEMES.length) % SB_THEMES.length][0];
      onTheme && onTheme(n);
      window.setTimeout(() => { const el = panel.current && panel.current.querySelector('[data-acct-theme="' + n + '"]'); if (el) el.focus(); }, 0);
    }
  };
  return (
    <div className="shell-space-menu-div" ref={wrap}>
      <button type="button" ref={trigger} className="sb-profile" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} data-sb-profile={plan}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); setOpen(true); } }}>
        <Avatar initials={SB_USER.initials} name={SB_USER.name} size={22} />
        <span className="sb-profile-text">
          <span className="sb-profile-name">{SB_USER.name}</span>
          <span className={"sb-profile-pill is-" + sbPlanPill(plan).tone} data-sb-plan-pill="" title={sbPlanLine(plan)}>{sbPlanPill(plan).text}</span>
        </span>
        <span className="sb-profile-chev"><Icon name="chevrons-up-down" size={14} /></span>
      </button>
      {/* On the body: the rail clips (overflow hidden) and the card is wider
          than the rail at 768. Placed from the trigger's rectangle. */}
      {shown ? ReactDOM.createPortal(
        <div ref={panel} role="menu" aria-label="Account" className={"sb-acct" + (leaving ? " is-leaving" : "")} onKeyDown={onKey} style={sbAcctAt(trigger.current)}>
          <div className="sb-acct-head">
            <Avatar initials={SB_USER.initials} name={SB_USER.name} size={36} />
            <span className="sb-acct-who">
              <span className="sb-acct-name">{SB_USER.name}{pro ? <SbProPill /> : null}</span>
              <span className="sb-acct-mail">{SB_USER.email}</span>
            </span>
          </div>
          <div className="sb-acct-plan">
            <span className="sb-acct-plan-line">{pro ? (window.needtPlanInfo ? window.needtPlanInfo(plan).name : sbPlanLine(plan)) : "Free plan"}</span>
            {pro ? (
              <button type="button" role="menuitem" data-acct-nav="" className="nx-btn nx-btn-text nx-btn-sm sb-acct-plan-btn" onClick={run(() => { window.needtSettingsSection = "plan"; onSettings && onSettings(); })}>Manage</button>
            ) : (
              <button type="button" role="menuitem" data-acct-nav="" className="nx-btn nx-btn-primary nx-btn-sm sb-acct-plan-btn" onClick={run(() => window.openPaywall && window.openPaywall())}>
                <Icon name="sparkles" size={14} />Upgrade
              </button>
            )}
          </div>
          <span className="sb-acct-sep" role="separator" />
          <SbAcctRow icon="settings" label="Settings" kbd="⌘," onClick={run(onSettings)} />
          <div className="sb-acct-row sb-acct-row-static">
            <span className="sb-acct-ico"><Icon name="palette" size={16} /></span>
            <span className="sb-acct-label">Appearance</span>
            <span className="sb-acct-seg" role="radiogroup" aria-label="Theme">
              {SB_THEMES.map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={theme === v} data-acct-theme={v}
                  data-acct-nav={theme === v || (!SB_THEMES.some(([x]) => x === theme) && v === "system") ? "" : undefined}
                  tabIndex={-1} className={"sb-acct-seg-btn" + (theme === v ? " is-on" : "")} onClick={() => onTheme && onTheme(v)}>{l}</button>
              ))}
            </span>
          </div>
          {/* What's new, Get help and Keyboard shortcuts live in the top-right
              ? button (08.10.26) — not repeated here. */}
          <span className="sb-acct-sep" role="separator" />
          <SbAcctRow icon="link" label="Invite to Needt" onClick={run(() => {
            window.needtPlatform.copy("https://needt.app/invite/maksym");
            window.toast && window.toast("Invite link copied");
          })} />
          <SbAcctRow icon="users" label="Teams" soon />
          <span className="sb-acct-sep" role="separator" />
          <SbAcctRow icon="log-out" label="Sign out" onClick={run(() => app().setStage && app().setStage("auth"))} />
        </div>, document.body) : null}
    </div>
  );
}

/* Focus. Not a screen — a pill that knows whether a session is running. It
   opens the Focus window (focus.jsx: setup → running → summary, on the sky);
   while a session runs it shows the clock with a progress ring, and clicking
   it brings the minimised window back. Stopping lives in the window. */
function FocusControl({ focus }) {
  const ui = window.focusUi ? window.focusUi.get() : { open: false };
  const [, tick] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => (window.focusUi ? window.focusUi.sub(tick) : undefined), []);
  const running = !!focus;
  const planned = running ? (focus.paused ? focus.plannedFull : focus.planned) : 0;
  const total = planned * 60;
  const pct = running && total ? Math.min(focus.elapsed / total, 1) : 0;
  const left = running ? Math.max(Math.round(total - focus.elapsed), 0) : 0;
  const clock = String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0");
  const open = () => window.focusUi && window.focusUi.open();
  return (
    <Tooltip label={running ? (focus.paused ? "Focus paused · " : "Focus · ") + clock + " left — open" : "Start a focus session"} keys="⌘⇧F" side="top-start">
      <button type="button" aria-label={running ? "Focus session, " + clock + " left" + (focus.paused ? ", paused" : "") + " — open" : "Focus"} aria-haspopup="dialog"
        aria-expanded={!!ui.open} data-sb-focus={running ? (focus.paused ? "paused" : "live") : "idle"}
        className={"nx-press sb-focus sb-reveal" + (running ? " is-live" + (focus.paused ? " is-paused" : " focus-live") : "") + (ui.open ? " is-open" : "")}
        onClick={open}>
        <span className="sb-focus-mark" aria-hidden="true">
          {running ? (
            <svg width="20" height="20" viewBox="0 0 26 26" className="sb-focus-ring">
              <circle cx="13" cy="13" r="11" fill="none" stroke="var(--fill-5)" strokeWidth="2.4" />
              <circle className="shell-focus-control-circle" cx="13" cy="13" r="11" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 11} strokeDashoffset={2 * Math.PI * 11 * (1 - pct)} />
            </svg>
          ) : null}
          <Icon name="target" size={running ? 10 : 16} />
        </span>
        <span className="sb-focus-label sb-reveal-label">{running ? clock : "Focus"}</span>
      </button>
    </Tooltip>
  );
}

/* The registry lives in work.jsx (loaded later); until it is there, an empty
   stand-in keeps the hook order stable. */
const sbNoProjects = { get: () => ({ list: [], sort: "manual" }), sub: () => () => {} };
const sbUseProjects = () => (window.useProjects ? window.useProjects() : window.useStore(sbNoProjects));

/* Live badges for Mail and Calendar (07.10.26): pulled from the screens that
   own them, refreshed on their events and on a minute clock (08.10.26: once
   a minute, aligned to the minute, and the sidebar re-renders only when a
   badge's text actually changed). */
function sbUseLive() {
  const [, tick] = React.useReducer((n) => n + 1, 0);
  const sig = React.useRef("");
  React.useEffect(() => {
    let t = 0;
    const clock = () => {
      const now = sbLiveRead(), s = JSON.stringify(now);
      if (s !== sig.current) tick();
      t = window.setTimeout(clock, 60000 - (Date.now() % 60000) + 50);
    };
    t = window.setTimeout(clock, 60000 - (Date.now() % 60000) + 50);
    window.addEventListener("needt-mail-count", tick);
    window.addEventListener("needt-events", tick);
    return () => { window.clearTimeout(t); window.removeEventListener("needt-mail-count", tick); window.removeEventListener("needt-events", tick); };
  }, []);
  const out = sbLiveRead();
  sig.current = JSON.stringify(out);
  return out;
}
function sbLiveRead() {
  let unread = null, next = null;
  try { unread = window.mailUnread ? window.mailUnread() : null; } catch (e) {}
  try { next = window.calNext ? window.calNext() : null; } catch (e) {}
  let cal = null;
  if (next && next.at) {
    const at = next.at instanceof Date ? next.at : new Date(next.at);
    const mins = Math.ceil((at.getTime() - Date.now()) / 60000);
    if (!isNaN(mins) && mins >= 0) cal = {
      text: mins < 60 ? mins + "m" : String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0"),
      urgent: mins <= 10 ? "“" + (next.title || "Event") + "” starts in " + mins + " min" : null
    };
  }
  return { mail: unread ? { text: String(unread), accent: true } : null, cal: cal };
}

/* Place glyphs: small filled duotone pictures in the token hues, drawn for
   Needt (no SF Symbols). They are marks, not chrome icons: the one place the
   currentColor rule bends. Tint = hue at 22% over the tile, never a gradient. */
const tint = (c, n) => "color-mix(in oklch, " + c + " " + (n || 22) + "%, transparent)";
function PlaceGlyph({ id }) {
  const A = "var(--accent)", I = "var(--info)", S = "var(--success)", D = "var(--destructive)", V = window.VIOLET || "oklch(0.62 0.17 295)", W = "var(--surface-raised)", R = "var(--border)";
  const g = {
    today: (<g>
      <path d="M4 11.2 12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" fill={tint(A, 26)} />
      <path d="M2.6 11.6 12 3.6l9.4 8" fill="none" stroke={A} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="9.6" y="13.5" width="4.8" height="7" rx="1.2" fill={A} />
    </g>),
    projects: (<g>
      <rect x="6" y="3" width="15" height="11.5" rx="2.4" fill={tint(V, 30)} />
      <rect x="3" y="8" width="15" height="12.5" rx="2.4" fill={V} />
      <rect x="6" y="12" width="7" height="1.8" rx=".9" fill={W} />
      <rect x="6" y="15.6" width="9" height="1.8" rx=".9" fill={W} opacity=".7" />
    </g>),
    tasks: (<g>
      <rect x="3" y="3" width="18" height="18" rx="4.5" fill={A} />
      <path d="M7.6 12.3l3 3 5.8-6.4" fill="none" stroke={W} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </g>),
    boards: (<g>
      <rect x="2.5" y="3.5" width="5.6" height="17" rx="1.8" fill={tint(I, 30)} />
      <rect x="9.2" y="3.5" width="5.6" height="12" rx="1.8" fill={I} />
      <rect x="15.9" y="3.5" width="5.6" height="8" rx="1.8" fill={tint(I, 55)} />
    </g>),
    moodboards: (<g>
      <rect x="2.5" y="3" width="9" height="11" rx="2" fill={tint(D, 70)} />
      <rect x="2.5" y="15.5" width="9" height="5.5" rx="2" fill={tint(A, 40)} />
      <rect x="12.8" y="3" width="8.7" height="6" rx="2" fill={tint(S, 60)} />
      <rect x="12.8" y="10.5" width="8.7" height="10.5" rx="2" fill={tint("var(--text-primary)", 22)} />
    </g>),
    calendar: (<g>
      <rect x="3" y="4" width="18" height="17" rx="3" fill={W} stroke={R} strokeWidth="1" />
      <path d="M6 4h12a3 3 0 0 1 3 3v2H3V7a3 3 0 0 1 3-3z" fill={D} />
      <text x="12" y="18.4" textAnchor="middle" fontSize="8.6" fontWeight="600" fontFamily="Inter, system-ui, sans-serif" fill="var(--text-primary)">6</text>
    </g>),
    mail: (<g>
      <rect x="2.5" y="5" width="19" height="14" rx="2.6" fill={I} />
      <path d="M3.6 6.6 12 12.8l8.4-6.2" fill="none" stroke={W} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </g>),
    docs: (<g>
      <path d="M6 2.8h8.2L19 7.6V19.6A1.6 1.6 0 0 1 17.4 21.2H6A1.6 1.6 0 0 1 4.4 19.6V4.4A1.6 1.6 0 0 1 6 2.8z" fill={W} stroke={R} strokeWidth="1" />
      <path d="M14.2 2.8v4.8H19" fill={tint("var(--text-primary)", 8)} />
      <rect x="7" y="10" width="8.5" height="1.9" rx=".95" fill={A} />
      <rect x="7" y="13.6" width="6" height="1.9" rx=".95" fill={S} />
      <rect x="7" y="17.2" width="7.4" height="1.9" rx=".95" fill={I} />
    </g>),
    "new": (<g>
      <circle cx="12" cy="12" r="9" fill={tint("var(--text-primary)", 7)} />
      <path d="M12 7.8v8.4M7.8 12h8.4" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" />
    </g>),
    more: (<g>
      {[[A, 5, 7], [D, 12, 7], [I, 19, 7], [S, 5, 15], ["var(--text-tertiary)", 12, 15], [tint(A, 60), 19, 15]].map(([c, x, y], i) => <circle key={i} cx={x} cy={y + 1} r="3" fill={c} />)}
    </g>)
  }[id];
  if (!g && window.Art) {
    const P = window.skPlace && window.skPlace(id);
    return <window.Art name={P ? P.art : "page"} size={24} />;
  }
  return <svg className="shell-place-glyph-svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">{g}</svg>;
}

/* A place, not a link: the tile is where you go AND what is waiting there.
   Calendar carries the next event from every connected calendar, Mail the
   unread count from every inbox, so a source never needs a tile of its own. */
/* Tile labels must fit a third of the rail at 13px; a long name gets a short
   one on the tile (owner: "Moodboards is too long") — the full name stays in
   the tooltip, the More menu, Customize and the page title. */
const SB_TILE_SHORT = { moodboards: "Boards" };
function PlaceTile({ p, active, onClick, progress, urgent, wide }) {
  /* The urgent wash breathes three times (app.css .sb-urgent), then rests
     as a still wash (.is-rested — no animation, so selecting or leaving the
     tile does not start it again). A new issue (a different reason) plays
     the three breaths again; a countdown ticking is the same issue. */
  const [rested, setRested] = React.useState(false);
  const issue = urgent ? String(urgent).replace(/starts in \d+ min/, "starts soon") : "";
  React.useEffect(() => { setRested(false); }, [issue]);
  const onAnimEnd = (e) => { if (e.target === e.currentTarget && String(e.animationName).indexOf("sb-urgent") === 0) setRested(true); };
  const pct = progress ? Math.max(0, Math.min(1, progress.done / Math.max(progress.total, 1))) : 0;
  const full = progress && progress.total > 0 && progress.done >= progress.total;
  const label = progress ? (full ? <React.Fragment><Icon name="check" size={11} />{progress.done}/{progress.total}</React.Fragment> : progress.done + "/" + progress.total) : null;
  const short = SB_TILE_SHORT[p.id];
  return (
    <button type="button" className={"sb-place sb-place-box" + (wide ? " is-wide" : "") + (urgent ? " sb-urgent is-urgent" + (rested ? " is-rested" : "") : "")} aria-label={p.label} onAnimationEnd={urgent ? onAnimEnd : undefined} aria-current={active ? "page" : undefined} onClick={onClick}
      /* Selected = ring only (app.css .sb-place). Urgent = a red wash that
         breathes (.sb-urgent). */
      title={urgent || (short ? p.label : undefined)} data-sb-place={p.id}>
      <PlaceGlyph id={p.id} />
      <span className={"sb-place-label" + (active ? " is-on" : "")}>{short || p.label}</span>
      {/* Today's progress (07.10.26 v2): the done/total badge itself fills
         with accent from the left; the label is drawn twice and the white
         copy is clipped to the filled part, so it reads over both. */}
      {progress ? (
        <span className={"sb-count" + (full ? " is-full" : "")} data-pct={Math.round(pct * 100)} title={progress.done + " of " + progress.total + " due today done"}>
          <span className="sb-count-label">{label}</span>
          <span className="sb-count-fill" aria-hidden="true" style={{ clipPath: "inset(0 " + ((1 - pct) * 100).toFixed(2) + "% 0 0 round 9999px)" }}>
            <span className="sb-count-label">{label}</span>
          </span>
        </span>
      ) : p.badge ? (
        <span className="sb-badge shell-place-tile-badge" title={p.badge.title || undefined} style={{ background: urgent ? "color-mix(in oklch, var(--destructive) 18%, transparent)" : p.badge.danger ? "var(--destructive)" : p.badge.accent ? "var(--fill-accent)" : "var(--fill-5)", color: urgent ? "var(--destructive)" : p.badge.danger ? "var(--text-on-fill)" : p.badge.accent ? "var(--accent)" : "var(--text-secondary)" }}>{p.badge.text}</span>
      ) : null}
      {p.alert && !(p.id === "mail" && window.connections && window.connections.get().outlook === "connected") ? <span className="shell-place-tile-layer" title={p.alert} style={{ right: p.badge ? 36 : 10 }} /> : null}
    </button>
  );
}

/* ---------- Craft-style sections (07.10.26) ----------
   A section header is a full-width row: hover grounds it and brings out "+"
   and the fold chevron on the right; the chevron folds the section (nx-fold)
   and the fold is remembered in the sidebar prefs. */
function SbHeadBtn({ label, onClick, children, on, btnRef }) {
  return (
    <Tooltip label={label} side="top-end">
      <button type="button" ref={btnRef} aria-label={label} aria-expanded={on || undefined} className={"sb-hbtn" + (on ? " is-on" : "")}
        onClick={(e) => { e.stopPropagation(); onClick(e); }}>{children}</button>
    </Tooltip>
  );
}
function SbSectionHead({ id, title, shut, addLabel, onAdd, addOpen, addRef }) {
  return (
    <div className={"sb-head" + (addOpen ? " is-hot" : "")} role="button" tabIndex={0} aria-expanded={!shut} data-sb-head={id}
      onClick={() => window.skFold(id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); window.skFold(id); } }}>
      <span className="sb-head-title">{title}</span>
      <span className="sb-head-tools">
        <SbHeadBtn label={addLabel} onClick={onAdd} on={addOpen} btnRef={addRef}><Icon name="plus" size={16} /></SbHeadBtn>
        <SbHeadBtn label={shut ? "Expand" : "Collapse"} onClick={() => window.skFold(id)}>
          <span className="sb-chev" style={{ transform: shut ? "rotate(-90deg)" : "none" }}><Icon name="chevron-down" size={15} /></span>
        </SbHeadBtn>
      </span>
    </div>
  );
}
function SbFold({ shut, children }) {
  return <div className={"nx-fold" + (shut ? " is-shut" : "")} aria-hidden={shut || undefined}><div className="base-stack">{children}</div></div>;
}

/* A nav row: 32px, radius 10, 14px, 16px icon — the one sidebar rhythm
   (styles/shell.css "Sidebar rhythm"); hover fill-3, press fill-4 + .98,
   selected fill-3 + primary medium. */
function SbRow({ icon, label, current, onClick, trailing, hoverTrailing }) {
  return (
    <div className={"sb-row" + (current ? " is-current" : "")} role="button" tabIndex={0} aria-current={current ? "page" : undefined}
      onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}>
      <span className="sb-row-icon">{icon}</span>
      <span className="sb-row-label" title={typeof label === "string" && label.length > 22 ? label : undefined}>{label}</span>
      {trailing != null || hoverTrailing ? (
        <span className="sb-row-trail">
          {trailing != null ? <span className="sb-row-count">{trailing}</span> : null}
          {hoverTrailing ? <span className="sb-row-more">{hoverTrailing}</span> : null}
        </span>
      ) : null}
    </div>
  );
}

/* Pin a doc — Craft's "Star a Doc": a small floating panel to the right of
   the header, search first, arrows + Enter, click pins. */
function SbPinPop({ anchor, onClose }) {
  const all = window.useDocs ? window.useDocs() : [];
  const [q, setQ] = React.useState("");
  const [i, setI] = React.useState(0);
  const panel = React.useRef(null);
  const list = all.filter((d) => !d.trashedAt && !d.isFavorite && (d.title || "Untitled").toLowerCase().indexOf(q.trim().toLowerCase()) >= 0);
  React.useEffect(() => { setI(0); }, [q]);
  React.useEffect(() => {
    const away = (e) => { if (panel.current && !panel.current.contains(e.target) && !(anchor && anchor.contains(e.target))) onClose(); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);
  React.useEffect(() => {
    const el = panel.current && panel.current.querySelector('[data-i="' + i + '"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [i]);
  const pin = (d) => {
    if (!d) return;
    window.docs.patch(d.id, { isFavorite: true });
    window.toast && window.toast("Pinned “" + (d.title || "Untitled") + "”", { undo: () => window.docs.patch(d.id, { isFavorite: false }) });
    onClose();
  };
  const host = anchor ? (anchor.closest(".sb-head") || anchor) : null;
  const r = host ? host.getBoundingClientRect() : { right: 280, top: 100 };
  const left = Math.min(r.right + 10, window.innerWidth - 300), top = Math.max(8, Math.min(r.top - 8, window.innerHeight - 380));
  return ReactDOM.createPortal(
    <div ref={panel} role="dialog" aria-label="Pin a doc" className="nx-pop sb-pinpop" style={{ left: left, top: top }}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.stopPropagation(); onClose(); }
        else if (e.key === "ArrowDown") { e.preventDefault(); setI((n) => Math.min(n + 1, list.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setI((n) => Math.max(n - 1, 0)); }
        else if (e.key === "Enter") { e.preventDefault(); pin(list[i]); }
      }}>
      <span className="sb-pinpop-grab" aria-hidden="true" />
      <input autoFocus className="sb-pinpop-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pin a doc" aria-label="Pin a doc" />
      <div className="sb-pinpop-list scroll-inner" role="listbox">
        {list.length ? list.map((d, n) => (
          <button key={d.id} type="button" role="option" aria-selected={n === i} data-i={n} className={"sb-pinpop-item" + (n === i ? " is-on" : "")}
            onMouseEnter={() => setI(n)} onClick={() => pin(d)}>
            <span className="sb-row-icon"><Icon name="file-text" size={16} /></span>
            <span className="sb-row-label" title={d.title || "Untitled"}>{d.title || "Untitled"}</span>
          </button>
        )) : <span className="sb-pinpop-empty">{q ? "No docs match" : "Every doc is pinned"}</span>}
      </div>
    </div>, document.body);
}

/* "…" on a project row opens the same menu a right-click does (ctx.jsx). */
function sbOpenCtx(e) {
  e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left, clientY: r.bottom + 4 }));
}

/* Tiles from Settings (08.10.26): onboarding writes needtSettings.sidebarTiles
   — every SK_PLACES id in order, never "more"; the first five become tiles,
   More is always the sixth, and the rest wait under More in that order.
   The list seeds the sidebar prefs (needt.sidebar.v2) whenever it changes, so
   Customize Sidebar keeps working on top of it. No setting = the default set. */
const SB_TILES_MAX = 5;
const SB_TILES_APPLIED = "needt.sidebarTiles.applied";
function sbTilesWanted() {
  const S = window.needtSettings;
  if (!S || !S.has || !S.has("sidebarTiles")) return null;
  const v = S.get("sidebarTiles");
  if (!Array.isArray(v)) return null;
  const seen = {};
  return v.filter((id) => window.skPlace && window.skPlace(id) && !seen[id] && (seen[id] = true));
}
function sbTilesApplied() { try { return localStorage.getItem(SB_TILES_APPLIED); } catch (e) { return null; } }
/* The setting as sidebar prefs: first five on, the rest off, in order; places
   the list leaves out follow, off. */
function sbTilesPlaces(want, places) {
  return want.map((id, i) => ({ id: id, on: i < SB_TILES_MAX }))
    .concat(places.filter((p) => want.indexOf(p.id) < 0).map((p) => ({ id: p.id, on: false })));
}
/* A list not applied yet (null when there is none, or it is applied). */
function sbTilesPending() {
  const want = sbTilesWanted();
  return want && want.length && JSON.stringify(want) !== sbTilesApplied() ? want : null;
}
function sbApplyTiles(setPrefs) {
  const want = sbTilesPending();
  if (!want) return;
  if (window.needtSync) window.needtSync.set(SB_TILES_APPLIED, want);
  setPrefs((s) => Object.assign({}, s, { places: sbTilesPlaces(want, s.places) }));
}
/* A passive effect, declared after useSidebarPrefs: its store subscription is
   in place before the write, so the rail re-renders. Until then the render
   draws a pending list directly (no frame of the old tiles). */
function sbUseTileSetting(setPrefs) {
  React.useEffect(() => {
    sbApplyTiles(setPrefs);
    const on = () => sbApplyTiles(setPrefs);
    window.addEventListener("needt-settings", on);
    return () => window.removeEventListener("needt-settings", on);
  }, []);
}

function Sidebar({ screen, onScreen, theme, onTheme, onOpenPalette, onSettings, tasks, onCapture, onTask, dragProps, drag, focus, onStartFocus, onStopFocus, selectedDate, onSelectDate }) {
  const [, iconsTick] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => { window.addEventListener("needt-icons", iconsTick); return () => window.removeEventListener("needt-icons", iconsTick); }, []);
  React.useEffect(() => { window.addEventListener("needt-connections", iconsTick); return () => window.removeEventListener("needt-connections", iconsTick); }, []);
  const [prefs, setPrefs] = window.useSidebarPrefs();
  sbUseTileSetting(setPrefs);
  const pendingTiles = sbTilesPending();
  const places = pendingTiles ? sbTilesPlaces(pendingTiles, prefs.places) : prefs.places;
  const tiles = places.filter((p) => p.on).map((p) => window.skPlace(p.id)).filter(Boolean);
  const rest = places.filter((p) => !p.on).map((p) => window.skPlace(p.id)).filter(Boolean);
  const sections = prefs.sections.filter((x) => x.on);
  const starred = window.useDocs().filter((d) => d.isFavorite && !d.trashedAt);
  const openDoc = window.useOpenDoc ? window.useOpenDoc() : null;
  const fold = prefs.collapsed || {};
  const [pinOpen, setPinOpen] = React.useState(false);
  const [projSheet, setProjSheet] = React.useState(false);
  const pinRef = React.useRef(null);
  /* Pull, not push: today's progress fills Home; a tile turns red only when
     something there needs you now, and says why on hover. */
  const todayList = (tasks || []).filter((t) => !t.noSlot && !t.overdue && String(window.NEEDT.dueLabel(t) || "").trim().indexOf("1 Sep") === 0);
  const dayProgress = todayList.length ? { done: todayList.filter((t) => t.done).length, total: todayList.length } : null;
  const overdueN = (tasks || []).filter((t) => t.overdue && !t.done && !t.noSlot).length;
  const live = sbUseLive();
  const reg = sbUseProjects();
  const sbProjects = (window.projectsSorted ? window.projectsSorted(reg.list, reg.sort, tasks || []) : reg.list)
    .map((p) => [p.name, window.projectHue ? window.projectHue(p.name) : (p.color || "var(--text-tertiary)"), (tasks || []).filter((t) => t.projectId === p.id && !t.done && !t.noSlot).length, p.id]);
  const urgentOf = (id) => id === "today" && overdueN ? overdueN + " overdue — they compete for today's hours"
    : id === "calendar" && live.cal ? live.cal.urgent : null;
  /* Badges are computed here, never the static ones in SK_PLACES. */
  const tileOf = (p) => p.id === "tasks" && overdueN ? Object.assign({}, p, { badge: { text: String(overdueN), danger: true, title: overdueN + (overdueN === 1 ? " overdue task" : " overdue tasks") } })
    : p.id === "mail" ? Object.assign({}, p, { badge: live.mail })
    : p.id === "calendar" ? Object.assign({}, p, { badge: live.cal ? { text: live.cal.text } : null })
    : p;
  return (
    <aside className="shell-sidebar-stack">
      <div className="shell-sidebar-row">
        <AccountMenu onSettings={onSettings} theme={theme} onTheme={onTheme} />
      </div>

      <div className="scroll-inner shell-sidebar-scroll-inner" onScroll={(e) => { if (e.currentTarget.scrollLeft) e.currentTarget.scrollLeft = 0; }}>
        <div className="shell-sidebar-grid">
          {tiles.map((p, i) => (
            <div key={p.id} className="sb-tile" style={{ animationDelay: (i * 25) + "ms" }} data-ctx="place" data-ctx-id={p.id} data-ctx-child="">
              <PlaceTile p={tileOf(p)} active={screen === p.id || (screen === "doc" && p.id === "docs")} onClick={() => onScreen(p.go || p.id)} progress={p.id === "today" ? dayProgress : null} urgent={urgentOf(p.id)} />
            </div>
          ))}
          {/* More: every place that is not a tile, in the big create-style
              menu, plus the way to change which ones are tiles. */}
          {/* Tiles fill whole rows of three: a full row (6 tiles, say) puts
              More on a short full-width row of its own below. */}
          <div className={"sb-tile" + (tiles.length % 3 === 0 && tiles.length ? " sb-tile-wide" : "")} style={{ animationDelay: (tiles.length * 25) + "ms" }} data-ctx="section">
            <window.RichMenu block align={tiles.length % 3 === 2 ? "right" : "left"} width={300}
              trigger={(open) => <PlaceTile wide={tiles.length % 3 === 0 && tiles.length > 0} p={{ id: "more", label: "More" }} active={open || rest.some((p) => screen === (p.go || p.id))} onClick={() => {}} />}
              items={(rest.length ? rest.map((p) => ({ art: p.art, title: p.label, sub: p.sub, onClick: () => onScreen(p.go || p.id) })) : [{ art: "page", title: "Everything is a tile", sub: "Hide a place to keep it here" }])
                .concat([{ sep: true }, { art: "tune", title: "Customize Sidebar", sub: "Choose tiles and sections", onClick: () => window.__app && window.__app.setCustomize(true) }])} />
          </div>
        </div>

        {/* Connections — Craft's cloud row: one place for every account
            Needt reads; says "1 issue" in red while one is down. */}
        {(() => {
          const c = window.connections ? window.connections.get() : {};
          const down = Object.keys(c).filter((id) => c[id] === "disconnected");
          const name = (id) => (window.cnLabel ? window.cnLabel(id) : (window.connections.meta[id] || {}).label || id);
          return (
            <div className="sb-tile shell-sidebar-sb-connections" data-sb-connections="">
              <SbRow label="Connections" current={screen === "connections"} onClick={() => onScreen("connections")}
                icon={<Icon name="connections" size={16} />}
                trailing={down.length ? (
                  <span className="shell-sidebar-sb-conn-issue" data-sb-conn-issue="" title={down.map(name).join(", ") + (down.length === 1 ? " needs" : " need") + " reconnecting"}
                   >
                    <span className="shell-sidebar-bar" aria-hidden="true" />
                    {down.length + (down.length === 1 ? " issue" : " issues")}
                  </span>
                ) : null} />
            </div>
          );
        })()}

        {sections.map((sec) => sec.id === "starred" ? (
          <div key="starred" className="sb-tile base-stack" data-ctx="section">
            <SbSectionHead id="starred" title="Pinned" shut={!!fold.starred} addLabel="Pin a doc" addOpen={pinOpen} addRef={pinRef}
              onAdd={() => setPinOpen((v) => !v)} />
            <SbFold shut={!!fold.starred}>
              {starred.length ? starred.map((d) => (
                <div key={d.id} className="nx-swap" data-ctx="doc" data-ctx-id={d.id} data-ctx-child="">
                  <SbRow label={d.title || "Untitled"} current={screen === "doc" && openDoc && String(openDoc.id) === String(d.id)}
                    onClick={() => window.docs.open(d.id)} icon={<PinnedFace id={d.id} />} />
                </div>
              )) : <span className="nx-swap base-meta shell-sidebar-swap">Pin docs to keep them close</span>}
            </SbFold>
            {pinOpen ? <SbPinPop anchor={pinRef.current} onClose={() => setPinOpen(false)} /> : null}
          </div>
        ) : (
          <div key="projects" className="sb-tile base-stack" data-ctx="section">
            <SbSectionHead id="projects" title="Projects" shut={!!fold.projects} addLabel="New project" addOpen={projSheet} onAdd={() => setProjSheet(true)} />
            <SbFold shut={!!fold.projects}>
              {/* a task dragged onto a project row moves into it (Drag.jsx
                  data-drop="project": highlighted, the tag says "Move to …") */}
              {sbProjects.map(([name, hue, n, pid]) => (
                <div key={name} data-ctx="project" data-ctx-id={name} data-ctx-child="" data-drop={pid != null ? "project" : undefined} data-id={pid != null ? String(pid) : undefined} data-label={name}>
                  <SbRow label={name} onClick={() => (window.needtOpenProject ? window.needtOpenProject(name) : onScreen("projects"))}
                    icon={<span className="shell-sidebar-grid-2" style={{ color: hue }}><Icon name="folder" size={16} /></span>}
                    trailing={n ? n : null}
                    hoverTrailing={<button type="button" className="sb-hbtn sb-hbtn-sm" aria-label={"Actions for " + name} onClick={sbOpenCtx}><Icon name="ellipsis" size={15} /></button>} />
                </div>
              ))}
            </SbFold>
            {window.NewProjectSheet ? <window.NewProjectSheet open={projSheet} onClose={() => setProjSheet(false)} taken={reg.list.map((p) => p.name)}
              onCreate={(p) => { const np = window.projects && window.projects.create(p); setProjSheet(false); if (np && window.toast) window.toast("Created “" + np.name + "”"); }} /> : null}
          </div>
        ))}
      </div>

      <div className="shell-sidebar-stack-2">
        {/* Needt Pro — a small strip of pixel sky above the foot (paywall.jsx). */}
        {window.PwPromoCard ? <window.PwPromoCard /> : null}
        {/* Craft's foot: quiet icons; each label slides out under the hand. */}
        <div className="sb-foot shell-sidebar-foot">
          <span data-drop="focus" className="pop-up focus-icon shell-sidebar-drop"><FocusControl focus={focus} /></span>
          {window.FocusWindow ? <window.FocusWindow tasks={tasks} focus={focus} onStart={onStartFocus} onStop={onStopFocus} /> : null}
          <window.RichMenu up small prompt="Where would you like to import from?" width={264} trigger={(open) => (
              /* Icon-only at rest; the label slides out on hover / focus
                 (styles/shell.css .sb-reveal). No aria-label: the label text
                 is the name, and app.css sizes [aria-label="Import"]. */
              <button type="button" aria-expanded={!!open} data-sb-import="" className={"nx-press sb-reveal sb-import" + (open ? " is-open" : "")}>
                <Icon name="move-to" size={16} /><span className="sb-reveal-label">Import</span>
              </button>
            )}
            items={[
              { art: "markdown", title: "From Markdown files", onClick: () => window.needtImport && window.needtImport("markdown") },
              { art: "stack", title: "From Notion", onClick: () => window.needtImport && window.needtImport("notion") },
              { art: "gdoc", title: "From Google Docs", onClick: () => window.needtImport && window.needtImport("gdocs") },
              { art: "calendarfile", title: "From a calendar file (.ics)", onClick: () => window.needtImport && window.needtImport("ics") },
              { art: "sheet", title: "From a CSV of tasks", onClick: () => window.needtImport && window.needtImport("csv") }
            ]} />
          <span className="shell-sidebar-row-2">
          {/* The one create button for everything, at the foot like Craft's
              "New". A page's own + only makes that page's thing. */}
          <window.RichMenu up align="right" width={300}
            trigger={(open) => (
              <button type="button" aria-label="Create" aria-expanded={!!open} className="nx-btn nx-btn-secondary sb-create">
                <Icon name="plus" size={16} />Create
              </button>
            )}
            items={[
              { art: "task", title: "New task", sub: "Placed into a free hour", kbd: "N", onClick: () => onTask && onTask() },
              { art: "doc", title: "New doc", sub: "A page for anything", onClick: () => window.docs ? window.docs.newDoc() : onScreen("doc") },
              { art: "event", title: "New event", sub: "Blocks time on your calendar", onClick: () => { onScreen("calendar"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("needt-new", { detail: "event" })), 300); } },
              { art: "work", title: "New project", sub: "A folder with its own colour", onClick: () => { onScreen("projects"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("needt-new", { detail: "project" })), 300); } },
              { art: "habit", title: "New habit", sub: "Comes back daily, never piles up", onClick: () => { onScreen("habits"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("needt-new", { detail: "habit" })), 300); } },
              { art: "stack", title: "New moodboard", sub: "References side by side", onClick: () => { onScreen("moodboards"); window.setTimeout(() => window.dispatchEvent(new CustomEvent("needt-new", { detail: "moodboard" })), 300); } }
            ]} />
          </span>
        </div>
        {/* A doc is open but the rail shows places: the switcher stays at
            the bottom-left so the document's panel is one click away. */}
        {screen === "doc" && window.SidebarSwitcher ? <window.SidebarSwitcher value="app" /> : null}
      </div>
    </aside>
  );
}

/* PageAddButton (07.10.26) — the page header's own "+", one build for every
   screen: a 36px raised round-square left of the title. With items it opens
   the page's small create menu (RichMenu); with onClick it creates directly.
   A page's + only makes that page's thing; the sidebar's Create makes all. */
function PageAddButton({ items, onClick, label, width, prompt, small }) {
  const NSi = window.NeedtDesignSystem_25d3c8;
  const btn = (open) => (
    <button type="button" aria-label={label || "New"} title={open ? undefined : (label || "New")} aria-expanded={items ? !!open : undefined}
      data-page-add="" className="nx-btn nx-btn-secondary page-add" onClick={items ? undefined : onClick}>
      <NSi.Icon name="plus" size={18} />
    </button>
  );
  if (!items) return btn(false);
  return <window.RichMenu width={width || 300} small={small} prompt={prompt} trigger={(open) => btn(open)} items={items} />;
}
/* Open a place and ask it for its new thing (the screens listen for needt-new). */
function pageNew(screen, what) {
  const app = window.__app;
  if (app && app.setScreen) app.setScreen(screen);
  window.setTimeout(() => window.dispatchEvent(new CustomEvent("needt-new", { detail: what })), 300);
}

Object.assign(window, { Sidebar, PlaceGlyph, FocusControl, PageAddButton, pageNew });
