/* phone-settings.jsx — Settings on the phone (wave 3, 09.10.26), registered
 * as window.PkPlaces.settings.
 *
 * ONE program: every control reads and writes the desktop's settings object
 * (stores.jsx needtSettings, "needt.settings" through needtSync — the keys
 * SettingsScreen.jsx uses), the plan (paywall.jsx needtPlan), the
 * connections store (stores.jsx window.connections) and the two tile lists:
 * "mobileTiles" (the phone's pill, MobileAuth.jsx maMenuSave) and
 * "sidebarTiles" (the desktop's sidebar, Sidebar.jsx applies it on load).
 * Mobile.jsx's mbPrefStore is a view of the same store, so psSet writes
 * needtSettings only.
 *
 *   Main      profile (avatar, name, Free/Pro) → the Pro sky plate → grouped
 *             glass lists: Account · Plan; General · Appearance · Your day ·
 *             Tasks · Focus · Notifications · Menu · Sidebar; Connections
 *             (a summary, opens the Connections place) · Data & privacy;
 *             About; Sign out.
 *   Pages     drill-in over the list (slides in from the right, a glass back
 *             chip at the top left, the large title collapses — PkScreen).
 *   Pickers   a row with its value; tap → a PkSheet of options (✓ on the
 *             chosen one). Switches and segmented controls in the row.
 *
 * The shell hooks (theme, upgrade, sign out, go to a place) are the place's
 * props — V2pLivePhone passes onTheme, onUpgrade(feature), onSignOut,
 * onScreen(id) to every place; without them a cancelable window event is
 * sent ("needt:theme", "needt:upgrade", "needt:signout", "needt:go" — the
 * shell listens too and calls preventDefault() when it handled it).
 *
 * Classes ps-*; colours only from tokens (--v2p-*, --pk-*, --ppl-*, the
 * hue tokens). No `...rest` (Babel-standalone shares its helpers globally).
 */
const PsNS = window.NeedtDesignSystem_25d3c8;
const { Icon: PsIcon } = PsNS;
const psCx = (...a) => a.filter(Boolean).join(" ");
const psReduced = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── the one settings object ─────────────────────────────────────────── */
function psRead() { const S = window.needtSettings; return S ? S.get() : {}; }
/* One writer: needtSettings (mbPrefStore is a view of it). */
function psSet(k, v) { if (window.needtSettings) window.needtSettings.set(k, v); }
function usePsSettings() {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => (window.needtSettings ? window.needtSettings.store.sub(bump) : undefined), []);
  return psRead();
}

/* ── the shell: prop → event ───────────────────────────────────────── */
const PS_PROP = { theme: "onTheme", upgrade: "onUpgrade", signout: "onSignOut", go: "onScreen" };
function psShell(props, kind, arg) {
  const fn = props && props[PS_PROP[kind]];
  if (typeof fn === "function") { fn(arg); return true; }
  let ev = null;
  try { ev = new CustomEvent("needt:" + kind, { detail: arg, cancelable: true }); } catch (e) { /* old browser */ }
  if (ev && !window.dispatchEvent(ev)) return true;
  if (kind === "upgrade" && window.openPaywall) { window.openPaywall(arg || undefined); return true; }
  return false;
}
/* System / Time resolve to light or dark now (the phone has two looks). */
const psResolve = (v) => (typeof v2pResolveTheme === "function" ? v2pResolveTheme(v) : v === "dark" ? "dark" : "light");

/* ── the person (the desktop's mock, SettingsScreen.jsx ME) ─────────── */
const PS_ME = { name: "Maksym K.", email: "maksym@needt.app", initials: "MK" };

/* ── pieces ──────────────────────────────────────────────────────────── */
/* The coloured glyph tile: a place's own drawing (PkGlyph) or a setting's
   icon on a tile washed with its hue. Same tile, same classes. */
const PS_GL_PX = { s: 32, m: 44, l: 56 };
function PsGlyph({ place, icon, hue, size }) {
  const px = typeof size === "number" ? size : PS_GL_PX[size || "s"];
  if (place && window.PkGlyph) return <window.PkGlyph place={place} size={px} />;
  return (
    <span className="pk-glyph is-tint ps-glyph" aria-hidden="true" style={{ "--pk-gl": px + "px", "--pk-gl-hue": hue || "var(--v2p-lav)" }}>
      <span className="ps-glyph-ico"><PsIcon name={icon || "circle"} size={Math.round(px * 0.5)} /></span>
    </span>
  );
}

function PsSwitch({ on, onChange, label, data }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} className={psCx("ps-switch", on && "is-on")} onClick={() => onChange(!on)} {...(data || {})}>
      <span className="ps-switch-knob" />
    </button>
  );
}

function PsSeg({ value, options, onChange, label, data }) {
  return (
    <span className="ps-seg" role="radiogroup" aria-label={label} {...(data || {})}>
      {options.map(([id, word]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} className={psCx("ps-seg-btn", value === id && "is-on")}
          onClick={() => onChange(id)} data-ps-seg={id}>{word}</button>
      ))}
    </span>
  );
}

/* A group: an optional label, a glass card of rows, an optional hint. */
function PsGroup({ title, hint, children, data }) {
  return (
    <section className="ps-group" {...(data || {})}>
      {title ? <span className="pk-label ps-group-label">{title}</span> : null}
      <div className="ps-card">{children}</div>
      {hint ? <p className="ps-hint">{hint}</p> : null}
    </section>
  );
}

/* A row: [glyph] title + desc · value / control · chevron. The row is one
   button when it opens something; a control sits beside the text, never in
   a button. */
function PsRow({ glyph, title, desc, value, control, onOpen, chevron, tone, data, out }) {
  const text = (
    <span className="ps-row-text">
      <span className={psCx("ps-row-title", tone && "is-" + tone)}>{title}</span>
      {desc ? <span className="ps-row-desc">{desc}</span> : null}
    </span>
  );
  const tail = (
    <>
      {value != null ? <span className="ps-row-value">{value}</span> : null}
      {onOpen && chevron !== false ? <span className="ps-row-chev" aria-hidden="true"><PsIcon name={out ? "arrow-up-right" : chevron === "pick" ? "chevrons-up-down" : "chevron-right"} size={chevron === "pick" ? 14 : 16} /></span> : null}
    </>
  );
  if (onOpen) {
    return (
      <button type="button" className={psCx("ps-row", "is-open", tone && "is-" + tone)} onClick={onOpen} {...(data || {})}>
        {glyph || null}{text}{tail}
      </button>
    );
  }
  return (
    <div className={psCx("ps-row", tone && "is-" + tone)} {...(data || {})}>
      {glyph || null}{text}{tail}
      {control ? <span className="ps-row-ctl">{control}</span> : null}
    </div>
  );
}

/* A setting with a list of values: the row shows the chosen one; tap opens
   the picker sheet (PsPicker, one per place). */
function PsPick({ title, desc, value, options, onChange, pick, data, glyph }) {
  const cur = options.filter((o) => o[0] === value)[0];
  return <PsRow glyph={glyph} title={title} desc={desc} value={cur ? cur[1] : value} chevron="pick" data={data}
    onOpen={() => pick({ title: title, value: value, options: options, onChange: onChange })} />;
}
function PsPicker({ pick, onClose }) {
  const last = React.useRef(null); if (pick) last.current = pick;
  const p = pick || last.current;
  return (
    <PkSheet open={!!pick} onClose={onClose} title={p ? p.title : ""} label={p ? p.title : "Choose"} className="ps-pick-sheet">
      {p ? (
        <div className="ps-card ps-pick-list" role="listbox" aria-label={p.title} data-ps-picker={p.title}>
          {p.options.map(([id, word, sub]) => (
            <button key={id} type="button" role="option" aria-selected={p.value === id} className={psCx("ps-row", "is-open", "ps-pick-row", p.value === id && "is-on")}
              onClick={() => { p.onChange(id); onClose(); }} data-ps-option={id}>
              <span className="ps-row-text"><span className="ps-row-title">{word}</span>{sub ? <span className="ps-row-desc">{sub}</span> : null}</span>
              <span className="ps-pick-check" aria-hidden="true">{p.value === id ? <PsIcon name="check" size={18} /> : null}</span>
            </button>
          ))}
        </div>
      ) : null}
    </PkSheet>
  );
}

function PsProTag({ locked }) { return <span className={psCx("ps-pro", locked && "is-locked")}>{locked ? <PsIcon name="lock" size={10} /> : null}Pro</span>; }

/* ── catalog: the pages and how their rows look in the list ──────────── */
const PS_HUE = { blue: "var(--info)", accent: "var(--accent)", green: "var(--success)", red: "var(--destructive)", violet: "var(--pk-violet)", lav: "var(--v2p-lav)", ink: "var(--v2p-ink-2)" };
const PS_PAGES = {
  account: { title: "Account", icon: "user", hue: PS_HUE.blue },
  plan: { title: "Plan & billing", icon: "credit-card", hue: PS_HUE.lav },
  general: { title: "General", icon: "sliders-horizontal", hue: PS_HUE.ink },
  appearance: { title: "Appearance", icon: "palette", hue: PS_HUE.violet },
  day: { title: "Your day", icon: "clock", hue: PS_HUE.red },
  tasks: { title: "Tasks", icon: "list-checks", hue: PS_HUE.accent },
  focus: { title: "Focus", icon: "target", hue: PS_HUE.green },
  alerts: { title: "Notifications", icon: "bell", hue: PS_HUE.red },
  menu: { title: "Menu", icon: "view-grid", hue: PS_HUE.lav },
  sidebar: { title: "Sidebar", icon: "sidebar-left", hue: PS_HUE.blue },
  data: { title: "Data & privacy", icon: "database", hue: PS_HUE.green },
  keys: { title: "Shortcuts", icon: "command", hue: PS_HUE.ink },
  about: { title: "About", icon: "info", hue: PS_HUE.ink }
};
const psPageGlyph = (id, size) => { const p = PS_PAGES[id]; return <PsGlyph icon={p.icon} hue={p.hue} size={size} />; };

const PS_HOURS = ["07:00", "08:00", "08:30", "09:00", "10:00", "17:00", "18:00", "19:00", "20:00"].map((h) => [h, h]);
const psMin = (a) => a.map((m) => [String(m), m + " min"]);
const PS_ORDER_WORD = { deadline: "nearest deadline first", short: "shortest first", project: "by project" };
const PS_THEMES = [["system", "System"], ["light", "Light"], ["dark", "Dark"], ["time", "Time"]];
const PS_FREE_ACCENT = "blue";
/* settings-kit.jsx's list (window.NEEDT_ACCENTS) where the page loads it; the
   phone page does not, so the same ids (themes.css data-accent) are here. */
const psAccents = () => window.NEEDT_ACCENTS || [
  ["blue", "Blue"], ["pink", "Pink"], ["mint", "Mint"], ["violet", "Violet"], ["amber", "Amber"], ["graphite", "Graphite"],
  ["aurora", "Aurora", true], ["sunset", "Sunset", true], ["lagoon", "Lagoon", true]];
const PS_PRO = [
  ["Plan my day", "Needt places what has no time yet into your free hours"],
  ["Week load", "Each day's plan against your working hours"],
  ["Document themes", "All Styles and backdrops for your pages"],
  ["Time theme and accents", "The theme that follows the sun, every accent colour"],
  ["Unlimited moodboards", "As many boards as you like, and Pinterest"],
  ["Every connection", "More than one mail account, AI tools, MCP and API"],
  ["Unlimited habits", "Free keeps three"]
];

/* The phone's menu (pill): three places (MobileAuth.jsx's list and rules). */
const PS_MENU_N = 3;
const psMenuPlaces = () => (typeof MA_MENU_PLACES !== "undefined" ? MA_MENU_PLACES : [
  ["today", "Home"], ["calendar", "Calendar"], ["tasks", "Tasks"], ["docs", "Docs"], ["mail", "Mailbox"], ["habits", "Habits"],
  ["moodboards", "Boards"], ["projects", "Projects"], ["ask", "Ask AI"]]);
const PS_GLYPH_OF = { today: "home" };
function psMenuNow() {
  if (typeof maMenuStart === "function") return maMenuStart();
  const S = window.needtSettings, v = S && S.has("mobileTiles") ? S.get("mobileTiles") : null;
  return Array.isArray(v) && v.length === PS_MENU_N ? v.slice() : ["today", "calendar", "tasks"];
}
function psMenuSave(list) {
  if (typeof maMenuSave === "function") { maMenuSave(list); return; }
  psSet("mobileTiles", list.slice(0, PS_MENU_N));
}

/* The desktop's sidebar: every SK_PLACES id in order; the first five are
   tiles, the rest wait under More (Sidebar.jsx sbTilesPlaces). With no
   setting yet, the order is what the desktop's sidebar shows now. */
const PS_SB_MAX = 5;
function psSidebarNow() {
  const P = window.SK_PLACES || [];
  const known = (id) => P.some((p) => p.id === id);
  const S = window.needtSettings;
  if (S && S.has("sidebarTiles") && Array.isArray(S.get("sidebarTiles"))) {
    const v = S.get("sidebarTiles").filter((id, i, a) => known(id) && a.indexOf(id) === i);
    return v.concat(P.map((p) => p.id).filter((id) => v.indexOf(id) < 0));
  }
  let prefs = null;
  try { prefs = JSON.parse(localStorage.getItem("needt.sidebar.v2")); } catch (e) { /* none */ }
  const places = prefs && Array.isArray(prefs.places) ? prefs.places.filter((p) => known(p.id)) : P.map((p, i) => ({ id: p.id, on: i < PS_SB_MAX }));
  const on = places.filter((p) => p.on).map((p) => p.id), off = places.filter((p) => !p.on).map((p) => p.id);
  return on.concat(off).concat(P.map((p) => p.id).filter((id) => on.indexOf(id) < 0 && off.indexOf(id) < 0));
}
const PS_SB_GLYPH = { today: "home" };

/* ── the pages ───────────────────────────────────────────────────────── */
function PsAccount({ ctx }) {
  const note = (w) => () => ctx.say(w + " — opens on needt.app (prototype)");
  return (
    <>
      <div className="ps-profile is-page" data-ps-account-profile="">
        <span className="ps-avatar is-lg" aria-hidden="true">{PS_ME.initials}<span className="ps-avatar-cam"><PsIcon name="camera" size={13} /></span></span>
      </div>
      <PsGroup title="Profile">
        <PsRow title={PS_ME.name} desc="Name · visible on documents you share by link or email." />
        <PsRow title={PS_ME.email} desc="Email · where we write to you, and one way to sign in." />
      </PsGroup>
      <PsGroup title="Sign-in methods">
        <PsRow title="Password" desc="Last changed in August." control={<PkButton kind="chip" onClick={note("Change password")}>Change</PkButton>} />
        <PsRow glyph={<PsGlyph icon="chrome" hue={PS_HUE.blue} />} title="Google" desc="maksym.k@gmail.com" control={<PkButton kind="chip" onClick={note("Disconnect Google")}>Disconnect</PkButton>} />
        <PsRow glyph={<PsGlyph icon="apple" hue={PS_HUE.ink} />} title="Apple" desc="Not set up" control={<PkButton kind="chip" onClick={note("Connect Apple")}>Connect</PkButton>} />
      </PsGroup>
      <PsGroup title="Devices">
        <PsRow title="This Mac" desc="Signed in since 12 August · now" />
        <PsRow title="iPhone" desc="Signed in since 3 September · yesterday" control={<PkButton kind="chip" onClick={note("Sign out the iPhone")}>Sign out</PkButton>} />
      </PsGroup>
      <PsGroup>
        <PsRow glyph={<PsGlyph icon="users" hue={PS_HUE.violet} />} title="Teams" desc="Share projects and documents with the people you work with, inside your Needt." value={<span className="ps-soon">Soon</span>} />
      </PsGroup>
      <PsGroup>
        <PsRow title="Sign out" tone="link" chevron={false} onOpen={ctx.signOut} data={{ "data-ps-signout": "" }} />
      </PsGroup>
      <PsGroup title="Danger zone">
        <PsRow title="Delete account" tone="danger" desc="Your tasks, documents, habits and connections go at once. Export first under Data & privacy. This cannot be undone." chevron={false} onOpen={note("Delete account")} />
      </PsGroup>
    </>
  );
}

function PsPlan({ ctx }) {
  const { tier, info, upgrade, pick } = ctx;
  const PR = window.needtPrice || {}, PRc = window.NEEDT_PRICING || {};
  const left = window.needtPlan ? window.needtPlan.trialDaysLeft : 9;
  return (
    <>
      <section className="ps-plan-card" data-ps-plan-card={tier}>
        <span className="ps-plan-name">Your plan · {info.name}</span>
        <span className="ps-plan-line">{tier === "free" ? PR.trialShort + "." : info.line}</span>
        {tier === "trial" ? (
          <span className="ps-trial">
            <span><b>{left}</b> of <b>{PRc.trialDays}</b> trial days left</span>
            <span className="ps-trial-bar"><span className="ps-trial-fill" style={{ width: Math.round(left / (PRc.trialDays || 14) * 100) + "%" }} /></span>
          </span>
        ) : null}
        {tier === "free" || tier === "trial" ? <span className="ps-plan-terms">{PR.trialAfter}</span> : null}
        {tier === "free" ? <PkButton kind="primary" block onClick={() => upgrade()} data-ps-trial="">{PR.trialCta || "Start free trial"}</PkButton>
          : tier === "trial" ? <PkButton kind="primary" block onClick={() => upgrade({ cycle: "annual" })}>Choose a plan</PkButton> : null}
      </section>
      {tier === "free" ? (
        <PsGroup title="Plans" hint={PR.footnote}>
          {[["monthly", "Pro Monthly", PR.monthly + " / month", "Cancel any time"], ["annual", "Pro Yearly", PR.yearly + " / year", PR.yearlyPerMonth + "/mo · Save " + PR.saveAmount], ["lifetime", "Lifetime", PR.lifetime + " one-time", PR.lifetimeLeftLine]].map(([c, n, p, sub]) => (
            <PsRow key={c} title={n} desc={sub} value={p} onOpen={() => upgrade({ cycle: c })} data={{ "data-ps-price": c }} />
          ))}
        </PsGroup>
      ) : (
        <PsGroup hint={tier === "lifetime" ? "You're one of the first " + PRc.lifetimeCap + ". Every Pro feature, now and later — no renewals." : tier === "yearly" ? "You save " + PR.saveAmount + " a year against monthly." : tier === "monthly" ? "Switch to yearly and pay " + PR.yearlyPerMonth + "/mo — save " + PR.saveAmount + " a year." : null}>
          {tier === "monthly" ? <PsRow title="Switch to yearly" onOpen={() => upgrade({ cycle: "annual" })} /> : null}
          {tier !== "lifetime" && tier !== "monthly" ? <PsRow title="Compare plans" onOpen={() => upgrade()} /> : null}
          <PsRow title="Invoices" onOpen={() => ctx.say("Invoices open on needt.app (prototype)")} />
        </PsGroup>
      )}
      <PsGroup title={info.pro ? "Included in your plan" : "What Pro unlocks"} hint={info.pro ? "Everything marked PRO across Needt." : "Each one is marked PRO where it lives. Try them all free for " + (PRc.trialDays || 14) + " days."}>
        {PS_PRO.map(([t, d]) => info.pro
          ? <PsRow key={t} title={t} desc={d} value={<span className="ps-included"><PsIcon name="check" size={13} />Included</span>} />
          : <PsRow key={t} title={<span className="ps-title-pro">{t}<PsProTag locked /></span>} desc={d} onOpen={() => upgrade(t)} />)}
      </PsGroup>
      <PsGroup title="Prototype" hint="Preview how Settings looks on each plan. Not part of the product.">
        <PsPick title="Plan state" value={tier} onChange={(x) => window.needtPlan && window.needtPlan.set(x)} pick={pick} data={{ "data-ps-plan-state": "" }}
          options={[["free", "Free"], ["trial", "Pro trial · 9 days left"], ["monthly", "Pro monthly"], ["yearly", "Pro yearly"], ["lifetime", "Lifetime"]]} />
      </PsGroup>
      <PsGroup title="Troubleshooting">
        <PsRow title="Billing is wrong" desc="Read what to check before writing to us." onOpen={() => ctx.say("Opens the help centre (prototype)")} />
        <PsRow title="Report a billing issue" onOpen={() => ctx.say("Opens the help centre (prototype)")} />
        <PsRow title="License key" desc="Got a key from us? Activate it here." onOpen={() => ctx.say("License keys activate on needt.app (prototype)")} />
      </PsGroup>
    </>
  );
}

function PsGeneral({ ctx }) {
  const { v, set, pick } = ctx;
  return (
    <>
      <PsGroup title="Links">
        <PsPick title="Open document links in" desc="Whether needt.app links open in the browser or the app." value={v.links} onChange={set("links")} pick={pick}
          options={[["ask", "Always ask"], ["web", "Browser"], ["app", "Desktop app"]]} />
      </PsGroup>
      <PsGroup title="Offline">
        <PsRow title="Offline mode" desc="View and edit documents and tasks while offline. Changes sync when you are back." control={<PsSwitch on={v.offline} onChange={set("offline")} label="Offline mode" />} />
      </PsGroup>
    </>
  );
}

function PsThemeTile({ id, word, on, locked, onPick }) {
  const M = window.Miniature;
  const pic = !M ? null : id === "system" ? <M kind="day" width={64} half={["paper", "dark"]} /> : id === "time" ? <M kind="day" width={64} diagonal={["paper", "dark"]} /> : <M kind="day" width={64} theme={id === "dark" ? "dark" : "paper"} />;
  return (
    <button type="button" className={psCx("ps-theme", on && "is-on", locked && "is-locked")} aria-pressed={on} onClick={onPick} data-ps-theme={id}>
      <span className="ps-theme-pic">{pic}</span>
      <span className="ps-theme-word">{word}{locked ? <PsIcon name="lock" size={11} /> : null}</span>
    </button>
  );
}
function PsAppearance({ ctx }) {
  const { v, info, upgrade, setTheme, phoneTheme } = ctx;
  /* The phone shows two looks; System / Time are kept as the choice for both
     apps when they resolve to what the phone shows now. */
  const choice = psResolve(v.theme) === phoneTheme ? v.theme : phoneTheme;
  const accents = psAccents();
  const cur = accents.filter((a) => a[0] === v.accent)[0] || accents[0];
  const lock = (id) => !info.pro && id !== PS_FREE_ACCENT;
  const sw = (a) => (
    <button key={a[0]} type="button" data-accent={a[0]} className={psCx("ps-accent", v.accent === a[0] && "is-on", lock(a[0]) && "is-locked")}
      aria-label={a[1] + (lock(a[0]) ? " — Pro" : "")} aria-pressed={v.accent === a[0]} data-ps-accent={a[0]}
      onClick={() => (lock(a[0]) ? upgrade("Accent colours") : ctx.set("accent")(a[0]))}>
      {v.accent === a[0] ? <PsIcon name="check" size={14} /> : null}
    </button>
  );
  return (
    <>
      <PsGroup title="Theme" hint={choice === "time" ? "Follows the sun where you are: pale at dawn, Light by day, warm at golden hour, Dark after dusk." : choice === "system" ? "Follows this device's light or dark setting." : "Desktop and phone use the same theme."}>
        <div className="ps-themes">
          {PS_THEMES.map(([id, word]) => <PsThemeTile key={id} id={id} word={word} on={choice === id} locked={id === "time" && !info.pro}
            onPick={() => (id === "time" && !info.pro ? upgrade("Time theme") : setTheme(id))} />)}
        </div>
      </PsGroup>
      <PsGroup title={<span className="ps-title-pro">Accent colour{info.pro ? <PsProTag /> : null}</span>}
        hint={info.pro ? null : "Blue is yours on Free. The other eight come with Pro."}>
        <div className="ps-accents">
          <div className="ps-accent-row">{accents.filter((a) => !a[2]).map(sw)}</div>
          <div className="ps-accent-row">{accents.filter((a) => a[2]).map(sw)}</div>
          <div className="ps-accent-now" data-accent={cur[0]}><span className="ps-accent-bar" /><span className="ps-accent-word">{cur[1]}</span><span className="ps-accent-note">{cur[2] ? "Fills take the blend; text and rings take its middle." : "Selection, links, the now-line and progress."}</span></div>
        </div>
        {!info.pro ? <PsRow title="Unlock every accent" chevron onOpen={() => upgrade("Accent colours")} data={{ "data-ps-accent-up": "" }} /> : null}
      </PsGroup>
    </>
  );
}

function PsDay({ ctx }) {
  const { v, set, pick, info, upgrade } = ctx;
  const [adv, setAdv] = React.useState(false);
  const summary = (v.auto ? "Plans automatically" : "Plans when you ask") + " · " + (PS_ORDER_WORD[v.order] || PS_ORDER_WORD.deadline) + " · " + (v.buffer || 0) + "-min gap";
  return (
    <>
      <PsGroup title="Working hours" hint="Needt only plans work between these times.">
        <PsPick title="Day starts" value={v.start} onChange={set("start")} options={PS_HOURS} pick={pick} data={{ "data-ps-pick": "start" }} />
        <PsPick title="Day ends" value={v.end} onChange={set("end")} options={PS_HOURS} pick={pick} data={{ "data-ps-pick": "end" }} />
        <PsRow title="Week starts" control={<PsSeg label="Week starts" value={v.week === "sun" ? "sun" : "mon"} onChange={set("week")} options={[["mon", "Monday"], ["sun", "Sunday"]]} data={{ "data-ps-week": "" }} />} />
        <PsPick title="Time zone" value={v.tz} onChange={set("tz")} options={[["cet", "CET — Zürich"], ["utc", "UTC"], ["est", "EST — New York"]]} pick={pick} />
      </PsGroup>
      <PsGroup title="Calendar" hint="Week shows the grid; Agenda lists each day's events and tasks in order.">
        <PsRow title="Opens in" control={<PsSeg label="Calendar opens in" value={v.view === "days" ? "days" : "week"} onChange={set("view")} options={[["week", "Week"], ["days", "Agenda"]]} />} />
        <PsRow title="Hide done" desc="Finished tasks leave the calendar." control={<PsSwitch on={!!v.calHideDone} onChange={set("calHideDone")} label="Hide done in calendar" />} />
      </PsGroup>
      <PsGroup>
        <PsRow title="Planning options" desc={adv ? "How Needt fills your free time." : summary} chevron={false} onOpen={() => setAdv((o) => !o)}
          value={<span className={psCx("ps-fold", adv && "is-open")} aria-hidden="true"><PsIcon name="chevron-down" size={16} /></span>}
          data={{ "aria-expanded": adv, "data-ps-adv": "" }} />
        {adv ? (
          <>
            <PsRow title="Plan automatically" desc="Tasks without a time are placed into your free hours." control={<PsSwitch on={v.auto} onChange={set("auto")} label="Plan automatically" />} />
            {info.pro
              ? <PsPick title="Plan my day puts first" desc="Which tasks get the earliest free time." value={v.order} onChange={set("order")} pick={pick} options={[["deadline", "Nearest deadline"], ["short", "Shortest task"], ["project", "Same project together"]]} />
              : <PsRow title={<span className="ps-title-pro">Plan my day puts first<PsProTag locked /></span>} desc="Which tasks get the earliest free time." onOpen={() => upgrade("Plan my day")} />}
            <PsRow title="Keep focus blocks free" desc="Nothing is placed inside a focus session." control={<PsSwitch on={v.protect} onChange={set("protect")} label="Keep focus blocks free" />} />
            <PsPick title="Shortest work block" desc="A task is never split into pieces shorter than this." value={v.chunk} onChange={set("chunk")} options={psMin([15, 30, 45, 60])} pick={pick} />
            <PsPick title="Gap between tasks" desc="Free time left between two planned tasks." value={v.buffer} onChange={set("buffer")} options={psMin([0, 5, 10, 15])} pick={pick} />
            <PsRow title="Plan on weekends" desc="Off keeps Saturday and Sunday empty." control={<PsSwitch on={v.weekends} onChange={set("weekends")} label="Plan on weekends" />} />
          </>
        ) : null}
      </PsGroup>
    </>
  );
}

function PsTasks({ ctx }) {
  const { v, set, pick } = ctx;
  const list = window.projects ? window.projects.list() : [];
  const projOpts = [["none", "No project"]].concat(list.map((p) => [p.id, p.name]));
  return (
    <>
      <PsGroup title="New tasks">
        <PsPick title="Default estimate" value={v.est} onChange={set("est")} options={psMin([15, 30, 45, 60, 90])} pick={pick} />
        <PsPick title="Default project" value={v.project} onChange={set("project")} options={projOpts} pick={pick} />
      </PsGroup>
      <PsGroup title="Display">
        <PsRow title="Show subtasks" desc="Subtasks show as rows under their task, not folded away." control={<PsSwitch on={v.parts} onChange={set("parts")} label="Show subtasks" />} />
        <PsRow title="Task value" desc="Shows what a group of tasks earns you once all of them are done." control={<PsSwitch on={v.money} onChange={set("money")} label="Task value" />} />
      </PsGroup>
    </>
  );
}

function PsFocus({ ctx }) {
  const { v, set, pick } = ctx;
  return (
    <>
      <PsGroup title="Session">
        <PsPick title="Length" value={v.len} onChange={set("len")} options={psMin([25, 50, 90])} pick={pick} />
        <PsPick title="Break" value={v.brk} onChange={set("brk")} options={psMin([5, 10, 15])} pick={pick} />
        <PsPick title="Start sound" value={v.sound} onChange={set("sound")} options={[["none", "Silent"], ["tick", "Tick"], ["chime", "Chime"]]} pick={pick} />
      </PsGroup>
      <PsGroup title="While a session runs">
        <PsRow title="Hide notifications" control={<PsSwitch on={v.hideAlerts} onChange={set("hideAlerts")} label="Hide notifications" />} />
        <PsRow title="Sound when a task snaps" desc="A short click as a dragged task lands on the quarter hour." control={<PsSwitch on={v.snapSound} onChange={set("snapSound")} label="Sound when a task snaps" />} />
        <PsRow title="Animate the logo" desc="The Needt logo moves gently during a session. Off keeps it still." control={<PsSwitch on={!v.stopMark} onChange={(x) => set("stopMark")(!x)} label="Animate the logo" />} />
        <PsRow title="Glow at the edges" desc="The screen's corners glow in your accent while a session runs." control={<PsSwitch on={v.aura !== false} onChange={set("aura")} label="Glow at the edges" />} />
      </PsGroup>
    </>
  );
}

function PsAlerts({ ctx }) {
  const { v, set, pick } = ctx;
  const all = v.notify !== false;
  return (
    <>
      <PsGroup hint="Starts, overdue tasks and mail that needs you, on this phone.">
        <PsRow title="Notifications" control={<PsSwitch on={all} onChange={set("notify")} label="Notifications" data={{ "data-ps-notify": "" }} />} />
      </PsGroup>
      <PsGroup title="Daily plan" hint="Your day's planned tasks and events, sent before the day starts.">
        <PsRow title="Notification" control={<PsSwitch on={v.plan} onChange={set("plan")} label="Daily plan notification" data={{ "data-ps-plan-notif": "" }} />} />
        <PsRow title="Email" control={<PsSwitch on={v.mailPlan} onChange={set("mailPlan")} label="Daily plan email" />} />
        <PsPick title="Time" value={v.planTime} onChange={set("planTime")} options={PS_HOURS} pick={pick} />
      </PsGroup>
      <PsGroup title="Overdue tasks" hint="When a task passes its deadline and has no time yet.">
        <PsRow title="Notification" control={<PsSwitch on={v.nudge} onChange={set("nudge")} label="Overdue notification" />} />
      </PsGroup>
      <PsGroup title="Weekly review" hint="Friday, after your last planned task — what got done and what carries over.">
        <PsRow title="Notification" control={<PsSwitch on={v.review} onChange={set("review")} label="Weekly review notification" />} />
      </PsGroup>
    </>
  );
}

/* Menu: the three in the pill. Tap a place → it takes the next free slot
   (tap again to take it out); tap a slot → it empties. Saved when the pill
   is full again (three places). */
function PsMenu({ ctx }) {
  const [slots, setSlots] = React.useState(() => psMenuNow().slice(0, PS_MENU_N));
  const [shake, setShake] = React.useState(0);
  const places = psMenuPlaces();
  const word = (id) => { const p = places.filter((x) => x[0] === id)[0]; return p ? p[1] : id; };
  const commit = (next) => { setSlots(next); if (next.length === PS_MENU_N) psMenuSave(next); };
  const toggle = (id) => {
    if (slots.indexOf(id) > -1) { commit(slots.filter((x) => x !== id)); return; }
    if (slots.length >= PS_MENU_N) { setShake((n) => n + 1); ctx.say("The pill holds three — take one out first"); return; }
    commit(slots.concat(id));
  };
  return (
    <>
      <PsGroup title="In the pill" hint={slots.length < PS_MENU_N ? "Pick " + (PS_MENU_N - slots.length) + " more — the pill always holds three." : "Everything else waits in the menu card, a swipe up from the pill."}>
        <div key={shake} className={psCx("ps-slots", shake && "is-shake")} data-ps-slots={slots.join(",")}>
          {[0, 1, 2].map((i) => {
            const id = slots[i];
            return id ? (
              <button key={id} type="button" className="ps-slot is-full" onClick={() => toggle(id)} aria-label={"Take " + word(id) + " out of the pill"} data-ps-slot={id}>
                <PsGlyph place={PS_GLYPH_OF[id] || id} size="m" /><span className="ps-slot-word">{word(id)}</span>
              </button>
            ) : <span key={"e" + i} className="ps-slot is-empty" aria-hidden="true" />;
          })}
        </div>
      </PsGroup>
      <PsGroup title="Places">
        {places.map(([id, w]) => {
          const on = slots.indexOf(id) > -1;
          return (
            <PsRow key={id} glyph={<PsGlyph place={PS_GLYPH_OF[id] || id} />} title={w} chevron={false} onOpen={() => toggle(id)} data={{ "data-ps-menu-place": id, "aria-pressed": on }}
              value={<span className={psCx("ps-tick", on && "is-on")}>{on ? <PsIcon name="check" size={14} /> : null}</span>} />
          );
        })}
      </PsGroup>
    </>
  );
}

/* Sidebar (the desktop's): the first five are tiles, More is the sixth, the
   rest wait under it. Arrows move a place; the circle swaps it in or out. */
function PsSidebar({ ctx }) {
  const [list, setList] = React.useState(psSidebarNow);
  const P = window.SK_PLACES || [];
  const label = (id) => { const p = P.filter((x) => x.id === id)[0]; return p ? p.label : id; };
  const save = (next) => { setList(next); psSet("sidebarTiles", next.slice()); };
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; const n = list.slice(); const t = n[i]; n[i] = n[j]; n[j] = t; save(n); };
  const flip = (i) => {
    const n = list.slice(), id = n.splice(i, 1)[0];
    /* out: first under More (the first one waiting takes its tile);
       in: the fifth tile (the old fifth goes first under More) */
    n.splice(i < PS_SB_MAX ? PS_SB_MAX : PS_SB_MAX - 1, 0, id);
    save(n);
  };
  const row = (id, i) => (
    <PsRow key={id} glyph={<PsGlyph place={PS_SB_GLYPH[id] || id} />} title={label(id)} data={{ "data-ps-sb": id }}
      control={
        <span className="ps-sb-ctl">
          <button type="button" className="ps-mini" aria-label={"Move " + label(id) + " up"} disabled={i === 0} onClick={() => move(i, -1)} data-ps-sb-up={id}><PsIcon name="arrow-up" size={15} /></button>
          <button type="button" className="ps-mini" aria-label={"Move " + label(id) + " down"} disabled={i === list.length - 1} onClick={() => move(i, 1)}><PsIcon name="arrow-down" size={15} /></button>
          <button type="button" className={psCx("ps-tick", "is-btn", i < PS_SB_MAX && "is-on")} aria-label={i < PS_SB_MAX ? "Move " + label(id) + " under More" : "Make " + label(id) + " a tile"} onClick={() => flip(i)} data-ps-sb-flip={id}>
            {i < PS_SB_MAX ? <PsIcon name="check" size={14} /> : null}
          </button>
        </span>
      } />
  );
  return (
    <>
      <PsGroup title="Tiles" hint="The desktop's sidebar shows these five at the top; More is always the sixth.">
        {list.slice(0, PS_SB_MAX).map((id, i) => row(id, i))}
      </PsGroup>
      <PsGroup title="Under More">
        {list.slice(PS_SB_MAX).map((id, i) => row(id, i + PS_SB_MAX))}
      </PsGroup>
    </>
  );
}

function PsData({ ctx }) {
  const { v, set } = ctx;
  const [importing, setImporting] = React.useState(false);
  const [reset, setReset] = React.useState(false);
  const note = (w) => () => ctx.say(w);
  const doReset = () => { if (window.needtSync) window.needtSync.resetAll(); window.location.reload(); };
  return (
    <>
      <PsGroup title="Export" hint="Everything you have in Needt is yours to take with you.">
        <PsRow title="Tasks" desc="Every task with its project, estimate and dates." control={<PkButton kind="chip" icon="download" onClick={note("Tasks export — prototype")}>CSV</PkButton>} />
        <PsRow title="Documents" desc="One Markdown file per page." control={<PkButton kind="chip" icon="download" onClick={note("Documents export — prototype")}>Markdown</PkButton>} />
        <PsRow title="Export all" desc="Tasks, documents, habits, boards and settings in one file." control={<PkButton kind="chip" icon="download" onClick={note("Full export — prototype")}>JSON</PkButton>} />
      </PsGroup>
      <PsGroup title="Import">
        <PsRow title="Bring in your work" desc="Markdown, Notion, Google Docs, a calendar file (.ics) or a CSV of tasks." onOpen={() => setImporting(true)} data={{ "data-ps-import": "" }} />
      </PsGroup>
      <PsGroup title="Privacy">
        <PsRow title="Share usage data" desc="Anonymous counts of which features get used. Never the content of your tasks, documents or mail." control={<PsSwitch on={v.usage} onChange={set("usage")} label="Share usage data" />} />
      </PsGroup>
      <PsGroup title="This device">
        <PsRow title="Download everything again" desc="Clears what this device keeps and fetches it fresh. Nothing is deleted." control={<PkButton kind="chip" onClick={note("Downloading again — prototype")}>Download</PkButton>} />
        <PsRow title="Reset prototype data" tone="danger" desc="Stars, trash, task and mail changes go back to the demo. The menus reset too." chevron={false} onOpen={() => setReset(true)} data={{ "data-ps-reset": "" }} />
      </PsGroup>
      <PkSheet open={importing} onClose={() => setImporting(false)} title="Import" label="Import">
        <div className="ps-card">
          {[["markdown", "Markdown files", "file-text"], ["notion", "Notion export", "package"], ["gdocs", "Google Docs", "file"], ["ics", "Calendar file (.ics)", "calendar-days"], ["csv", "CSV of tasks", "list-checks"]].map(([k, l, ic]) => (
            <PsRow key={k} glyph={<PsGlyph icon={ic} hue={PS_HUE.green} />} title={l} data={{ "data-ps-import-kind": k }}
              onOpen={() => { setImporting(false); if (window.needtImport) window.needtImport(k); else ctx.say(l + " — import from the desktop app for now"); }} />
          ))}
        </div>
      </PkSheet>
      <PkSheet open={reset} onClose={() => setReset(false)} title="Reset prototype data?" label="Reset prototype data"
        footer={<div className="ps-sheet-actions"><PkButton onClick={() => setReset(false)}>Cancel</PkButton><PkButton kind="primary" className="ps-danger-btn" onClick={doReset} data-ps-reset-go="">Reset</PkButton></div>}>
        <p className="ps-sheet-text">Everything you changed here goes back to the demo, on this device. The page reloads.</p>
      </PkSheet>
    </>
  );
}

function PsKeys() {
  return (window.NEEDT_KEYS || []).map(([group, rows]) => (
    <PsGroup key={group} title={group}>
      {rows.map((r) => <PsRow key={r.label} title={r.label} value={<span className="ps-keys">{r.keys.map((k, j) => <span key={j} className="ps-kbd">{k}</span>)}</span>} />)}
    </PsGroup>
  ));
}

function PsAbout({ ctx }) {
  return (
    <PsGroup>
      <PsRow title="Version" value="Needt 0.9 · prototype" />
      <PsRow title="What's new" onOpen={() => ctx.say("What's new — opens on needt.app (prototype)")} />
      <PsRow title="Help centre" out onOpen={() => ctx.say("Help centre — opens on needt.app (prototype)")} />
      <PsRow title="Terms and privacy" out onOpen={() => ctx.say("Terms and privacy — open on needt.app (prototype)")} />
    </PsGroup>
  );
}

const PS_BODY = { account: PsAccount, plan: PsPlan, general: PsGeneral, appearance: PsAppearance, day: PsDay, tasks: PsTasks, focus: PsFocus,
  alerts: PsAlerts, menu: PsMenu, sidebar: PsSidebar, data: PsData, keys: PsKeys, about: PsAbout };

/* ── the main list ───────────────────────────────────────────────────── */
function psDaySummary(v) { return (v.start || "09:00") + " – " + (v.end || "18:00") + " · week from " + (v.week === "sun" ? "Sunday" : "Monday"); }
function psConnSummary() {
  const C = window.connections, st = C ? C.get() : {};
  const meta = (C && C.meta) || {};
  const ids = Object.keys(st).filter((k) => meta[k]);
  const on = ids.filter((k) => st[k] === "connected");
  const lost = ids.filter((k) => st[k] === "disconnected" && meta[k].lost);
  return { on: on, lost: lost, meta: meta };
}
function usePsConn() {
  const [, bump] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => { window.addEventListener("needt-connections", bump); return () => window.removeEventListener("needt-connections", bump); }, []);
  return psConnSummary();
}

function PsMain({ ctx, open }) {
  const { v, info, tier, upgrade, phoneTheme } = ctx;
  const conn = usePsConn();
  const accents = psAccents();
  const accentWord = (accents.filter((a) => a[0] === v.accent)[0] || [0, "Blue"])[1];
  const themeWord = (PS_THEMES.filter((t) => t[0] === (psResolve(v.theme) === phoneTheme ? v.theme : phoneTheme))[0] || [0, "Light"])[1];
  const menuWord = psMenuNow().map((id) => (psMenuPlaces().filter((p) => p[0] === id)[0] || [0, id])[1]).join(" · ");
  const row = (id, desc, value) => <PsRow key={id} glyph={psPageGlyph(id)} title={PS_PAGES[id].title} desc={desc} value={value} onOpen={() => open(id)} data={{ "data-ps-open": id }} />;
  const PR = window.needtPrice || {};
  return (
    <>
      <button type="button" className="ps-profile" onClick={() => open("account")} data-ps-profile="">
        <span className="ps-avatar" aria-hidden="true">{PS_ME.initials}</span>
        <span className="ps-profile-text">
          <span className="ps-profile-name">{PS_ME.name}</span>
          <span className="ps-profile-mail">{PS_ME.email}</span>
        </span>
        <span className={psCx("ps-badge", info.pro && "is-pro")} data-ps-tier={tier}>{info.badge}</span>
        <span className="ps-row-chev" aria-hidden="true"><PsIcon name="chevron-right" size={16} /></span>
      </button>

      {info.pro ? null : (
        <PkSkyPlate as="section" className="ps-pro-plate" radius={26} data-ps-pro="">
          <span className="ps-pro-head"><span className="ps-pro-word">Needt</span><span className="ps-pro-mark">Pro</span></span>
          <span className="ps-pro-line">{tier === "trial" ? info.name : "Plan my day, the Time theme, every accent and connection. " + (PR.trialShort || "14 days free · no card needed") + "."}</span>
          <PkButton kind="primary" small onClick={() => upgrade()} data-ps-upgrade="">{tier === "trial" ? "Choose a plan" : "Try Pro free"}</PkButton>
        </PkSkyPlate>
      )}

      <PsGroup>
        {row("account", PS_ME.email)}
        {row("plan", info.name)}
      </PsGroup>
      <PsGroup title="Preferences">
        {row("general", "Links, offline")}
        {row("appearance", themeWord + " · " + accentWord)}
        {row("day", psDaySummary(v))}
        {row("tasks", (v.est || "45") + "-min estimate")}
        {row("focus", (v.len || "50") + "-min sessions")}
        {row("alerts", v.notify === false ? "Off on this phone" : v.plan ? "Daily plan at " + (v.planTime || "08:30") : "On")}
      </PsGroup>
      <PsGroup title="Menus" hint="The phone's pill and the desktop's sidebar — set either one here.">
        {row("menu", menuWord)}
        {row("sidebar", "Five tiles and More, on the desktop")}
      </PsGroup>
      <PsGroup>
        <PsRow glyph={<PsGlyph place="connections" />} title="Connections" out data={{ "data-ps-connections": "" }}
          desc={conn.lost.length ? <span className="ps-alert"><span className="pk-alert-dot" />{conn.meta[conn.lost[0]].label} needs reconnecting</span> : conn.on.length + " connected"}
          value={conn.on.length ? <span className="ps-conn-dots" aria-hidden="true">{conn.on.slice(0, 4).map((id) => window.BrandIcon && window.BrandIcon.has(id) ? <window.BrandIcon key={id} id={id} size={20} /> : null)}</span> : null}
          onOpen={ctx.goConnections} />
        {row("data", "Export, import, privacy")}
      </PsGroup>
      <PsGroup>
        {window.NEEDT_KEYS ? row("keys", "With a keyboard") : null}
        {row("about", "Needt 0.9")}
      </PsGroup>
      <PsGroup>
        <PsRow title="Sign out" tone="link" chevron={false} onOpen={ctx.signOut} data={{ "data-ps-signout": "" }} />
      </PsGroup>
    </>
  );
}

/* ── a drill-in page: over the list, a glass back chip, the large title
   collapses into the compact one (PkScreen). ── */
function PsPage({ id, leaving, onBack, children }) {
  const p = PS_PAGES[id];
  return (
    <div className={psCx("ps-page", leaving ? "is-leaving" : "is-coming")} data-ps-page={id}>
      <PkScreen screen={"settings-" + id} className="ps-screen" title={<span className="ps-title">{psPageGlyph(id, "m")}<span className="ps-title-word">{p.title}</span></span>} compactTitle={p.title}>
        {children}
      </PkScreen>
      {window.PkGlass
        ? <window.PkGlass as="button" round className="ps-back" onClick={onBack} aria-label="Back to Settings" data-ps-back=""><PsIcon name="chevron-left" size={18} /><span className="ps-back-word">Settings</span></window.PkGlass>
        : <button type="button" className="ps-back pk-glass is-round" onClick={onBack} aria-label="Back to Settings" data-ps-back=""><PsIcon name="chevron-left" size={18} /><span className="ps-back-word">Settings</span></button>}
    </div>
  );
}

/* ── the place ───────────────────────────────────────────────────────── */
function PsSettings(props) {
  const say = props.say || ((t) => window.toast && window.toast(t));
  const v = usePsSettings();
  const [tier] = (window.useNeedtPlan || (() => ["free"]))();
  const info = window.needtPlanInfo ? window.needtPlanInfo(tier) : { name: "Free", line: "", badge: "Free", pro: false };
  const phoneTheme = React.useContext(window.PkTheme || React.createContext("light")) === "dark" ? "dark" : "light";
  const [page, setPage] = React.useState(null);
  const [leaving, setLeaving] = React.useState(false);
  const [pick, setPick] = React.useState(null);
  const timer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const open = (id) => { window.clearTimeout(timer.current); setLeaving(false); setPage(id); };
  const back = () => {
    if (!page || leaving) return;
    if (psReduced()) { setPage(null); return; }
    setLeaving(true);
    timer.current = window.setTimeout(() => { setPage(null); setLeaving(false); }, 240);
  };
  React.useEffect(() => {
    if (!page) return undefined;
    const esc = (e) => { if (e.key === "Escape" && !pick) back(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  });

  const ctx = {
    v: v, tier: tier, info: info, say: say, phoneTheme: phoneTheme,
    set: (k) => (x) => psSet(k, x),
    pick: setPick,
    upgrade: (feature) => { if (!psShell(props, "upgrade", feature)) say("Needt Pro — the paywall opens here"); },
    setTheme: (id) => {
      psSet("theme", id);
      const look = psResolve(id);
      if (look !== phoneTheme) psShell(props, "theme", look);
      else if (window.needtSync) window.needtSync.set("needt.phone.theme", look);
    },
    signOut: () => { if (!psShell(props, "signout")) say("Signed out — prototype"); },
    goConnections: () => { if (!psShell(props, "go", "connections")) say("Connections is in the menu"); }
  };
  const Body = page ? PS_BODY[page] : null;
  return (
    <div className="ps-root" data-ps-root={page || "main"}>
      <PkScreen screen="settings" className={psCx("ps-screen", page && "is-under")} title="Settings" glyph={window.PkGlyph ? "settings" : undefined}>
        <PsMain ctx={ctx} open={open} />
      </PkScreen>
      {page ? <PsPage key={page} id={page} leaving={leaving} onBack={back}><Body ctx={ctx} /></PsPage> : null}
      <PsPicker pick={pick} onClose={() => setPick(null)} />
    </div>
  );
}

window.PkPlaces = window.PkPlaces || {};
window.PkPlaces.settings = PsSettings;
Object.assign(window, { PsSettings });
