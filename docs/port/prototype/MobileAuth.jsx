/* SIGN-IN AND SETUP, ON A PHONE.
 *
 * The desktop pairs a form with a live plate of the day, because a 1440px
 * window can afford to show what the product is while you sign into it. A
 * phone cannot: the plate would take the half of the screen the keyboard is
 * about to take. So the persuasion goes to the top as one line and a small
 * mark, and the rest of the screen is the thing you came to do.
 *
 * The same four steps as the desktop, one per screen instead of a column with
 * a rail: a phone has no room for a step list beside the step, so progress is
 * a strip of ticks and a count — you can see how many are left without a
 * second column.
 */
const MaNS = window.NeedtDesignSystem_25d3c8;
const { Icon: MaIcon } = MaNS;

function MaField({ label, hint, error, children }) {
  return (
    <label className={"mau-field" + (error ? " is-error" : "")}>
      <span className="mau-field-label">{label}</span>
      {children}
      {hint ? <span className="mau-field-hint">{hint}</span> : null}
    </label>
  );
}
/* A field on the glass (Plates: a soft raised fill, a lavender ring on focus). */
function MaInput({ type, value, defaultValue, onChange, placeholder, autoComplete, invalid, icon }) {
  const input = <input className={"mau-input" + (icon ? " has-icon" : "")} type={type} value={value} defaultValue={defaultValue} onChange={onChange} placeholder={placeholder}
    autoComplete={autoComplete} aria-invalid={invalid || undefined} />;
  if (!icon) return input;
  return <span className="mau-input-wrap">{input}<span className="mau-input-icon" aria-hidden="true"><MaIcon name={icon} size={17} /></span></span>;
}

/* Plates buttons, 52px: the step's ONE primary action is ink on the glass
   (black on light, white on dark); everything else is quiet (a soft raised
   fill) or plain text. Accent is never a button colour. (`tone="accent"` is
   kept as the prop name for the primary.) */
function MaButton({ children, tone, onClick, wide, disabled, data }) {
  return (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} {...(data || {})}
      className={"mau-btn " + (tone === "accent" ? "is-primary" : "is-quiet") + (wide === false ? " is-auto" : "")}>
      {children}
    </button>
  );
}

/* States (states.jsx): sign-in and setup read the same switcher as every
   screen — offline, the server not answering (load: error), working (loading). */
function maUseStates(screen) {
  const [, tick] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => (window.needtStates && window.needtStates.on ? window.needtStates.on(tick) : undefined), []);
  return window.needtStates && window.needtStates.get ? window.needtStates.get(screen) || {} : {};
}
function MaNote({ tone, icon, children }) {
  return (
    <span className={"ma-note mau-note" + (tone === "attention" ? " is-attention" : "")} role={tone === "attention" ? "alert" : "status"}>
      <MaIcon name={icon} size={15} />
      <span>{children}</span>
    </span>
  );
}

/* ICONS EVERYWHERE (wave 3, 09.10.26 — owner: every step, option, pick,
   field and button has an icon). A coloured glyph tile in the menu card's
   look: phone-kit's PkGlyph for a place or a type (popovers.jsx Art); a
   provider's own app icon (brand-icons.js BrandIcon); else an outline glyph
   on a tile washed with a token hue (passed as --ma-tile-hue). Pages without
   phone-kit fall back to the same drawings (MaPlaceGlyph / Art). */
const MA_TILE_PLACE = { today: "home" };
function MaTile({ place, kind, brand, icon, hue, size }) {
  const px = size || 40;
  if ((place || kind) && window.PkGlyph) return <window.PkGlyph place={place ? MA_TILE_PLACE[place] || place : undefined} kind={place ? undefined : kind} size={px} className="ma-tile-pk" />;
  if (brand && window.BrandIcon && window.BrandIcon.has(brand)) return <span className="ma-tile is-brand" aria-hidden="true"><window.BrandIcon id={brand} size={px} /></span>;
  const art = place ? <MaPlaceGlyph id={place} /> : kind && window.Art ? <window.Art name={kind} size={Math.round(px * 0.6)} /> : <MaIcon name={icon || "circle"} size={Math.round(px * 0.45)} />;
  return <span className="ma-tile" aria-hidden="true" style={{ "--ma-tile": px + "px", "--ma-tile-hue": hue || "var(--v2p-lav)" }}>{art}</span>;
}

/* THE SKY, ON A PHONE (Plates, 08.10.26): sign-in and setup are the only
   phone screens that keep the pixel sky (with the paywall and Pro). It fills
   the whole screen; the content scrolls under a progressive blur band at the
   status bar; the form sits on a GLASS PLATE whose blur grows toward its
   edges (three backdrop layers, 10 → 18 → 30px, each masked further out —
   the kit's rule: no opacity / filter / mask on an ancestor of a blur). */
function PwMaScene({ variant, children }) {
  const Sky = window.PxSky;
  const body = (
    <div className="mau-stage">
      {children}
      <div className="mau-band" aria-hidden="true"><span className="mau-band-blur is-1" /><span className="mau-band-blur is-2" /><span className="mau-band-blur is-3" /></div>
    </div>
  );
  return (
    <div className="mau-scene" data-mau-scene={variant}>
      {Sky ? <Sky variant={variant}>{body}</Sky> : <div className="mau-plain">{body}</div>}
    </div>
  );
}
function PwMaPaper({ children, className }) {
  return (
    <div className={"mau-glass" + (className ? " " + className : "")}>
      <span className="mau-glass-blur is-1" aria-hidden="true" /><span className="mau-glass-blur is-2" aria-hidden="true" /><span className="mau-glass-blur is-3" aria-hidden="true" />
      <span className="mau-glass-wash" aria-hidden="true" />
      <div className="mau-glass-in">{children}</div>
    </div>
  );
}
/* The mark, small; the big tight title with its second half quiet. */
function MaBrand({ date }) {
  const D = window.PwDateCard;
  return (
    <div className="mau-brand">
      <span className="needt-lockup needt-lockup-sm mau-lockup">{window.NeedtAppIcon ? <window.NeedtAppIcon size={34} /> : null}{window.ExposureWordmark ? <window.ExposureWordmark size={26} mode="still" className="mau-word" /> : null}</span>
      {date && D ? <span aria-hidden="true" className="mau-date"><D width={60} event={false} /></span> : null}
    </div>
  );
}
function MaHead({ kicker, a, b, line, className, tile }) {
  return (
    <header className={"mau-head" + (className ? " " + className : "")} data-px-calm>
      {kicker ? <span className="mau-kicker">{tile ? <MaTile size={32} {...tile} /> : null}{kicker}</span> : null}
      <h1 className="mau-title">{a}{b ? <> <span className="mau-title-2">{b}</span></> : null}</h1>
      {line ? <p className="mau-line">{line}</p> : null}
    </header>
  );
}

/* Sign in / create account. Sign-in has the recovery path (08.10.26):
   "Forgot password?" → the address → "Check your email" (resend after 30 s)
   → (the link, mocked) a new password → signed in. The password only ever
   lives in an uncontrolled field or component state — never logged, never
   stored. Offline and a failing server (needtStates "auth") block each send
   with the same notes as signing in. */
function MbAuth({ mode, onMode, onDone }) {
  const signup = mode !== "login";
  const [mail, setMail] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const [recover, setRecover] = React.useState(null);
  const [fresh, setFresh] = React.useState("");
  const [freshTried, setFreshTried] = React.useState(false);
  const [mailTried, setMailTried] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);
  const [sending, setSending] = React.useState(false);
  const st = maUseStates("auth");
  const off = !!st.offline, busy = st.load === "loading" || sending, bad = st.load === "error" && tried;
  const go = () => { setTried(true); if (st.load === "error") return; onDone(); };
  React.useEffect(() => {
    if (recover !== "sent" || resendIn <= 0) return undefined;
    const id = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [recover, resendIn]);
  const badMail = mailTried && mail.indexOf("@") < 1;
  const openRecover = () => { setTried(false); setMailTried(false); setFresh(""); setFreshTried(false); setRecover("ask"); };
  const later = (fn) => { setTried(true); if (st.load === "error") return; setTried(false); setSending(true); window.setTimeout(() => { setSending(false); fn(); }, 700); };
  const sendLink = () => { setMailTried(true); if (off || mail.indexOf("@") < 1) return; later(() => { setResendIn(30); setRecover("sent"); }); };
  const saveFresh = () => { setFreshTried(true); if (off || fresh.length < 8) return; later(() => { setFresh(""); setRecover(null); onDone(); }); };

  if (recover) {
    const short = freshTried && fresh.length < 8;
    return (
      <PwMaScene variant="a">
        <div className="mau-scroll" data-ma-recover={recover}>
          <MaBrand />
          <MaHead kicker="Reset password" tile={{ icon: recover === "sent" ? "mail" : "lock", hue: recover === "sent" ? "var(--info)" : "var(--v2p-lav)" }} a={recover === "ask" ? "Forgot your" : recover === "sent" ? "Check your" : "Set a new"} b={recover === "sent" ? "email" : "password"}
            line={recover === "ask" ? "Enter the email you sign in with. We’ll send a link to set a new password."
              : recover === "sent" ? "We sent a reset link to " + mail + ". It works for 30 minutes."
              : "For " + (mail || "your account") + ". You’ll be signed in right after."} />
          <PwMaPaper>
            <div key={recover} className="mau-form mb-step">
              {off ? <MaNote icon="cloud-off">You're offline — resetting a password needs a connection.</MaNote> : null}
              {bad ? <MaNote tone="attention" icon="circle-alert">{recover === "reset" ? "Couldn't save the password — the server didn't answer. Try again in a moment." : "Couldn't send the link — the server didn't answer. Try again in a moment."}</MaNote> : null}
              {recover === "ask" ? (<>
                <MaField label="Email" error={badMail} hint={badMail ? "Include an @ in the address." : null}>
                  <MaInput type="email" value={mail} onChange={(e) => setMail(e.target.value)} placeholder="Email" icon="mail" invalid={badMail} />
                </MaField>
                <MaButton tone="accent" onClick={sendLink} disabled={off || busy}><MaIcon name="mail" size={16} />{busy ? "Sending…" : "Send reset link"}</MaButton>
              </>) : null}
              {recover === "sent" ? (<>
                <MaButton tone="accent" onClick={() => setRecover("reset")} disabled={busy}><MaIcon name="external-link" size={16} />Open the link<span className="mau-demo">prototype</span></MaButton>
                <span className="mau-resend" data-ma-resend={resendIn > 0 ? resendIn : "ready"}>
                  {"Didn’t get it? Check spam, or "}
                  {resendIn > 0 ? <span className="mau-wait">resend in 0:{String(resendIn).padStart(2, "0")}</span>
                    : <button type="button" className="mau-link" disabled={off} onClick={() => later(() => setResendIn(30))}>send it again</button>}
                  {". "}<button type="button" className="mau-link" onClick={() => setRecover("ask")}>Use a different email</button>
                </span>
              </>) : null}
              {recover === "reset" ? (<>
                <MaField label="New password" error={short} hint={short ? "Use at least 8 characters." : "At least 8 characters."}>
                  <MaInput type="password" value={fresh} onChange={(e) => setFresh(e.target.value)} placeholder="New password" icon="lock" autoComplete="new-password" invalid={short} />
                </MaField>
                <MaButton tone="accent" onClick={saveFresh} disabled={off || busy}><MaIcon name="check" size={16} />{busy ? "Signing you in…" : "Save and sign in"}</MaButton>
              </>) : null}
            </div>
          </PwMaPaper>
          <button type="button" onClick={() => { setTried(false); setFresh(""); setRecover(null); }} className="mau-chip" data-px-calm data-ma-back-signin>
            <MaIcon name="arrow-left" size={15} />Remembered it? <u>Back to sign in</u>
          </button>
        </div>
      </PwMaScene>
    );
  }

  return (
    <PwMaScene variant={signup ? "c" : "a"}>
      <div className="mau-scroll" data-ma-auth={signup ? "signup" : "login"}>
        <MaBrand date />
        <MaHead kicker={signup ? "New account" : "Sign in"} tile={{ place: signup ? "tasks" : "today" }} a={signup ? "Create your" : "Welcome"} b={signup ? "account" : "back"}
          line={signup ? "A planner that puts your work into the hours you actually have." : "Your day is where you left it."} />

        <PwMaPaper>
          <div className="mau-form">
            {/* The two ways in that need no typing come first: on a phone a
                password is the most expensive thing on the screen. */}
            {off ? <MaNote icon="cloud-off">You're offline — signing in needs a connection. Your day is still on this phone.</MaNote> : null}
            <div className="mau-pair">
              <MaButton onClick={go} disabled={off || busy} data={{ "aria-label": "Continue with Google" }}><MaIcon name="chrome" size={17} />Google</MaButton>
              <MaButton onClick={go} disabled={off || busy} data={{ "aria-label": "Continue with Apple" }}><MaIcon name="apple" size={17} />Apple</MaButton>
            </div>
            <span className="mau-or"><span aria-hidden="true" className="mau-or-rule" /><span>or with email</span><span aria-hidden="true" className="mau-or-rule" /></span>
            <MaField label="Email" error={bad}>
              <MaInput type="email" value={mail} onChange={(e) => setMail(e.target.value)} placeholder="Email" icon="mail" invalid={bad} />
            </MaField>
            <MaField label="Password" error={bad} hint={signup ? "Eight characters or more." : null}>
              <MaInput type="password" defaultValue="" placeholder="Password" icon="lock" invalid={bad} />
            </MaField>
            {signup ? null : (
              <button type="button" className="mau-link mau-forgot" data-ma-forgot onClick={openRecover}><MaIcon name="unlock" size={14} />Forgot password?</button>
            )}
            {bad ? <MaNote tone="attention" icon="circle-alert">{signup ? "Couldn't create the account — the server didn't answer. Try again in a moment." : "That email and password don't match. Try again, or continue with Google."}</MaNote> : null}
            <MaButton tone="accent" onClick={go} disabled={off || busy} data={{ "data-ma-go": "" }}><MaIcon name={signup ? "user" : "arrow-right"} size={16} />{busy ? (signup ? "Creating…" : "Signing in…") : signup ? "Create the account" : "Sign in"}</MaButton>
          </div>
        </PwMaPaper>

        <button type="button" onClick={() => onMode(signup ? "login" : "signup")} className="mau-chip" data-px-calm data-ma-mode>
          <MaIcon name="user" size={15} />{signup ? <>Already have an account? <u>Sign in</u></> : <>No account yet? <u>Create one</u></>}
        </button>
      </div>
    </PwMaScene>
  );
}

/* ── SETUP (08.10.26) ──────────────────────────────────────────────────────
   The desktop's four steps, one per screen: what you use Needt for (any mix),
   calendar + hours + time zone, the first task (typed into the phone's
   composer line, read by the Composer's parser window.coParse), and where
   Needt put it and why → Open my day. Theme is a small switch above the card
   when Mobile.jsx passes theme/onTheme; the start view is chosen (Week).

   The planner is Data.js's NEEDT.firstSlot / slotReason / firstTask, the
   same one the desktop onboarding uses (window.needtFirstSlot …). */
const MA_NOW = (window.NEEDT && window.NEEDT.planNow) || 14 + 20 / 60;
const maWeekday = (d, form) => window.NEEDT.planWeekday(d, form);
const maHour = (v) => window.NEEDT.planHour(v);
const maFirstTask = (parsed, prefs, tasks) => window.NEEDT.firstTask(parsed, prefs, tasks);

/* Working hours: half hours from 05:00 to 23:30. Time zone: the three the
   Settings sheet offers, the device's zone picked for you. */
const MA_TIMES = (() => { const l = []; for (let h = 5; h < 24; h += 0.5) l.push(window.NEEDT ? window.NEEDT.hhmm(h) : String(Math.floor(h)).padStart(2, "0") + (h % 1 ? ":30" : ":00")); return l; })();
const MA_ZONES = [["cet", "CET — Zürich, Berlin, Paris"], ["utc", "UTC — London, Lisbon"], ["est", "EST — New York, Toronto"]];
function maDetectZone() {
  let z = "";
  try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* no Intl */ }
  const key = /^Europe\/(London|Lisbon|Dublin)/.test(z) || /^(UTC|Etc\/)/.test(z) ? "utc"
    : /^Europe\//.test(z) ? "cet"
    : /^America\/(New_York|Toronto|Detroit|Montreal|Nassau|Indiana)/.test(z) ? "est" : "utc";
  return { iana: z || "UTC", key: key };
}
function MaSelect({ value, options, onChange, label, invalid, wide, icon }) {
  return (
    <span className={"auth-select" + (wide ? " is-wide" : "") + (invalid ? " is-invalid" : "") + (icon ? " has-icon" : "")}>
      {icon ? <span className="ma-select-icon" aria-hidden="true"><MaIcon name={icon} size={15} /></span> : null}
      <select value={value} aria-label={label} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
      </select>
      <span className="auth-select-chev" aria-hidden="true"><MaIcon name="chevrons-up-down" size={13} /></span>
    </span>
  );
}

/* The mini day: working hours as a ruler, events and timed tasks as blocks,
   the new task picked out (selection look: accent wash + ring), the now-line
   when it is today. Shared CSS (auth.css) with the phone. */
function MaDay({ slot, task, minutes, compact }) {
  const N = window.NEEDT;
  const H = compact ? 30 : 36;
  const lo = Math.floor(Math.min(slot.start, slot.at)), hi = Math.ceil(Math.max(slot.end, slot.at + minutes / 60));
  const hours = []; for (let h = lo; h <= hi; h++) hours.push(h);
  const y = (h) => (h - lo) * H;
  const isToday = slot.day === N.iso(N.today);
  const blocks = slot.busy.filter((b) => b.end > lo && b.at < hi);
  return (
    <div className="auth-tl" data-ob-day={slot.day} style={{ height: (hi - lo) * H + 1 }}>
      {hours.map((h) => (
        <span key={h} className="auth-tl-hour" style={{ top: y(h) }}><span className="auth-tl-label">{N.hhmm(h)}</span></span>
      ))}
      <span className="auth-tl-hours" style={{ top: y(slot.start), height: (slot.end - slot.start) * H }} aria-hidden="true" />
      {blocks.map((b, n) => (
        <span key={n} className={"auth-tl-block is-" + b.kind} style={{ top: y(Math.max(lo, b.at)) + 1, height: Math.max(12, (Math.min(hi, b.end) - Math.max(lo, b.at)) * H - 2) }}>
          <span className="auth-tl-time">{N.hhmm(b.at)}</span><span className="auth-tl-title">{b.title}</span>
        </span>
      ))}
      <span className="auth-tl-block is-new nx-swap" data-ob-placed={N.hhmm(slot.at)} style={{ top: y(slot.at) + 1, height: Math.max(16, minutes / 60 * H - 2), animationDelay: "160ms" }}>
        <MaIcon name="circle-check" size={12} />
        <span className="auth-tl-time">{N.hhmm(slot.at)}</span><span className="auth-tl-title">{task.title}</span>
        <span className="auth-tl-len">{minutes} min</span>
      </span>
      {isToday && MA_NOW > lo && MA_NOW < hi ? (
        <span className="auth-tl-now" style={{ top: y(MA_NOW) }} title={"Now · " + N.hhmm(MA_NOW)}><span>{N.hhmm(MA_NOW)}</span></span>
      ) : null}
    </div>
  );
}

/* The theme, as a small switch in the corner (it was a whole step). */
/* Each theme its icon (dark is a moon, drawn here: the icon set has none). */
function MaThemeIcon({ id }) {
  if (id === "dark") {
    return <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z" fill="currentColor" /></svg>;
  }
  return <MaIcon name={id === "light" ? "sun" : id === "time" ? "clock" : "desktop"} size={14} />;
}
function MaTheme({ theme, onTheme }) {
  const list = window.THEMES || [["system", "System"], ["light", "Light"], ["dark", "Dark"], ["time", "Time"]];
  if (!onTheme) return null;
  return (
    <div className="auth-theme mau-theme" role="radiogroup" aria-label="Theme" data-px-calm>
      {list.map(([id, l]) => (
        <button key={id} type="button" role="radio" aria-checked={theme === id} className={"auth-theme-b" + (theme === id ? " is-on" : "")}
          data-ma-theme={id} aria-label={l} title={l} onClick={() => onTheme(id)}><MaThemeIcon id={id} /><span className="ma-theme-l">{l}</span></button>
      ))}
    </div>
  );
}

const MA_STEPS = [
  ["use", "What you use it for", "Pick all that fit."],
  ["setup", "Calendar and hours", "Needt plans around your events, inside your hours."],
  ["menu", "Your menu", "Three sections live in the pill at the bottom. The rest are one swipe up."],
  ["first", "Your first task", "Type it the way you’d say it."],
  ["placed", "Where it went", "Move it any time — nothing is locked."]
];
const maStepIx = (k) => Math.max(0, MA_STEPS.findIndex((s) => s[0] === k));
/* Mobile.jsx still passes the old four-step index (2 = the first task); a
   string names the step directly ("menu"). */
const MA_OLD_STEPS = ["use", "setup", "first", "placed"];
const MA_SKY = { use: "a", setup: "c", menu: "a", first: "b", placed: "d" };
/* The step's title: the first words in ink, the last quiet. */
const PW_MA_HEAD = {
  use: ["What’s Needt", "for?"],
  setup: ["Calendar &", "hours"],
  menu: ["Build your", "menu"],
  first: ["Your first", "task"],
  placed: ["Where Needt", "put it"]
};
/* Each step's tile, beside its kicker. */
const MA_STEP_TILE = { use: { kind: "template" }, setup: { place: "calendar" }, menu: { place: "settings" }, first: { kind: "task" }, placed: { kind: "event" } };
const MA_USES = [
  ["work", "Work", "Projects, meetings and the tasks between them", { kind: "work" }],
  ["personal", "Personal", "Errands, habits, things you mean to do", { kind: "home" }],
  ["side", "Side business", "Listings, orders, a second income", { kind: "sheet" }]
];
/* Calendars wear their own app icons (brand-icons.js); Skip a clock tile. */
const MA_CALS = [["google", "Google Calendar", { brand: "gcal" }], ["apple", "Apple Calendar", { brand: "ical" }], ["outlook", "Outlook", { brand: "ocal" }], ["skip", "Skip for now", { icon: "clock", hue: "var(--v2p-ink-2)" }]];

/* A row with a check at the end — square when several can be picked. */
function MaPick({ on, multi, glyph, label, sub, note, status, onClick, data }) {
  const busy = status === "busy", bad = status === "error";
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-busy={busy || undefined} {...data}
      className={"mau-pick" + (on ? " is-on" : "") + (bad ? " is-error" : "")}>
      <span className="mau-pick-glyph"><MaTile size={40} {...glyph} /></span>
      <span className="mau-pick-text">
        <span className="mau-pick-label">{label}</span>
        {note || sub ? <span className={"mau-pick-sub" + (bad ? " is-error" : "")} role={note ? "status" : undefined}>{note || sub}</span> : null}
      </span>
      {busy ? <span aria-hidden="true" className="auth-row-spin" /> : (
        <span className={"mau-check" + (multi ? " is-multi" : "")} aria-hidden="true">{on ? <MaIcon name="check" size={13} /> : null}</span>
      )}
    </button>
  );
}

/* The phone's composer line (Mobile.jsx MbComposer's look and parser),
   standing in the card instead of rising from the bottom. */
function MaFirstLine({ onCreate }) {
  const [text, setText] = React.useState("");
  const p = window.coParse ? window.coParse(text) : { title: text, found: {}, parts: [] };
  const said = [];
  if (p.found.date) said.push(["date", "calendar", "var(--accent)", p.found.date.value]);
  if (p.found.time) said.push(["time", "clock", "var(--accent)", p.found.time.value]);
  if (p.found.duration) said.push(["duration", "hourglass", "var(--text-tertiary)", p.found.duration.value]);
  if (p.found.deadline) said.push(["deadline", "calendar-clock", "var(--destructive)", p.found.deadline.value]);
  if (p.found.project) said.push(["project", "folder", "var(--accent)", p.found.project.value]);
  const commit = () => { const line = text.trim(); if (!line) return; onCreate(window.coParse ? window.coParse(line) : { title: line, rest: line, found: {} }); };
  return (
    <div className={"co-box auth-ma-composer" + (text.trim() ? " is-live" : "")} data-ma-composer>
      <span className="ma-first-row">
        <MaTile kind="task" size={32} />
        <input className="co-input mb-composer-7" value={text} spellCheck="false" aria-label="Task name"
          placeholder="New task" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
      </span>
      <div className="mb-composer-9">
        <span className="scroll-inner mb-composer-11">
          {said.length ? said.map(([k, glyph, tone, value]) => (
            <span key={k} className="mb-composer-12" style={{ background: "color-mix(in oklab, " + tone + " 13%, var(--surface-raised))", boxShadow: "inset 0 0 0 1px color-mix(in oklab, " + tone + " 30%, transparent)", color: tone }}>
              <MaIcon name={glyph} size={12} /><span className="mb-composer-13">{value}</span>
            </span>
          )) : <span className="mb-composer-14">Next free slot</span>}
        </span>
        <button type="button" onClick={commit} className="co-go mb-u-flex-none" aria-label="Add task" disabled={!text.trim()}>
          <MaIcon name="arrow-up" size={16} />
        </button>
      </div>
    </div>
  );
}

/* ── "Build your menu" (step 3, 08.10.26) ──────────────────────────────────
   The phone's twin of the desktop's "Make your sidebar": the bottom pill
   holds three sections, everything else waits in the card a swipe above it.
   Saved as needtSettings "mobileTiles" (three SK_PLACES ids, plus "ask")
   when you leave the step forward; Skip saves the default. The desktop's
   "sidebarTiles" is never touched. Interactions:
     tap a section → it takes the next free slot (tap it again to take it out);
     tap a slot → it empties; drag a slot sideways → reorder;
     full pill + a new section → the pill shakes once and says why.
   Animations only on those taps (land / shake), none at rest. */
const MA_MENU_N = 3;
const MA_MENU_DEFAULT = ["today", "docs", "ask"];
const MA_MENU_PLACES = [
  ["today", "Home"], ["calendar", "Calendar"], ["tasks", "Tasks"],
  ["docs", "Docs"], ["mail", "Mailbox"], ["habits", "Habits"],
  ["moodboards", "Boards"], ["projects", "Projects"], ["ask", "Ask Needt"]
];
const maMenuName = (id) => { const p = MA_MENU_PLACES.find((x) => x[0] === id); return p ? p[1] : id; };
function maMenuValid(v) {
  if (!Array.isArray(v) || v.length !== MA_MENU_N) return null;
  const ok = v.filter((id, n) => MA_MENU_PLACES.some((p) => p[0] === id) && v.indexOf(id) === n);
  return ok.length === MA_MENU_N ? ok : null;
}
function maMenuStart() {
  const S = window.needtSettings;
  const a = S && S.has && S.has("mobileTiles") ? maMenuValid(S.get("mobileTiles")) : null;
  const b = window.mbPrefStore ? maMenuValid((window.mbPrefStore.get() || {}).mobileTiles) : null;
  return (a || b || MA_MENU_DEFAULT).slice();
}
/* One writer: needtSettings (mbPrefStore is a view of it). */
function maMenuSave(list) {
  const v = list.slice(0, MA_MENU_N);
  if (window.needtSettings) window.needtSettings.set("mobileTiles", v); else if (window.mbSetPref) window.mbSetPref("mobileTiles", v);
}

/* The desktop's place glyphs (Sidebar.jsx PlaceGlyph). The phone page does
   not load Sidebar.jsx, so the same drawings are mirrored here for that case;
   wherever PlaceGlyph is on window it is used as is. Habits is the desktop's
   fallback (popovers.jsx Art "habit"); Ask AI is the AI's own mark (AiOrb). */
const maTint = (c, n) => "color-mix(in oklch, " + c + " " + (n || 22) + "%, transparent)";
function MaPlaceGlyph({ id }) {
  if (id === "ask") return window.AiOrb ? <window.AiOrb size={24} /> : <MaIcon name="sparkles" size={20} />;
  if (window.PlaceGlyph && id !== "habits") return <window.PlaceGlyph id={id} />;
  const A = "var(--accent)", I = "var(--info)", S = "var(--success)", D = "var(--destructive)", V = window.VIOLET || "oklch(0.62 0.17 295)", W = "var(--surface-raised)", R = "var(--border)";
  if (id === "habits") {
    return (
      <svg className="ma-menu-svg" width="24" height="24" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="14" fill={"color-mix(in oklch, " + S + " 22%, " + W + ")"} />
        <path d="M27.5 15A9 9 0 1 0 29 22" fill="none" stroke={S} strokeWidth="3.2" strokeLinecap="round" />
        <path d="M24 13.6l4.4 1.5L29.6 10" fill="none" stroke={S} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  const g = {
    today: (<g>
      <path d="M4 11.2 12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" fill={maTint(A, 26)} />
      <path d="M2.6 11.6 12 3.6l9.4 8" fill="none" stroke={A} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="9.6" y="13.5" width="4.8" height="7" rx="1.2" fill={A} />
    </g>),
    projects: (<g>
      <rect x="6" y="3" width="15" height="11.5" rx="2.4" fill={maTint(V, 30)} />
      <rect x="3" y="8" width="15" height="12.5" rx="2.4" fill={V} />
      <rect x="6" y="12" width="7" height="1.8" rx=".9" fill={W} />
      <rect x="6" y="15.6" width="9" height="1.8" rx=".9" fill={W} opacity=".7" />
    </g>),
    tasks: (<g>
      <rect x="3" y="3" width="18" height="18" rx="4.5" fill={A} />
      <path d="M7.6 12.3l3 3 5.8-6.4" fill="none" stroke={W} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </g>),
    moodboards: (<g>
      <rect x="2.5" y="3" width="9" height="11" rx="2" fill={maTint(D, 70)} />
      <rect x="2.5" y="15.5" width="9" height="5.5" rx="2" fill={maTint(A, 40)} />
      <rect x="12.8" y="3" width="8.7" height="6" rx="2" fill={maTint(S, 60)} />
      <rect x="12.8" y="10.5" width="8.7" height="10.5" rx="2" fill={maTint("var(--text-primary)", 22)} />
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
      <path d="M14.2 2.8v4.8H19" fill={maTint("var(--text-primary)", 8)} />
      <rect x="7" y="10" width="8.5" height="1.9" rx=".95" fill={A} />
      <rect x="7" y="13.6" width="6" height="1.9" rx=".95" fill={S} />
      <rect x="7" y="17.2" width="7.4" height="1.9" rx=".95" fill={I} />
    </g>)
  }[id];
  return <svg className="ma-menu-svg" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">{g || null}</svg>;
}

function MaMenuStep({ tiles, onTiles }) {
  const [say, setSay] = React.useState("");
  const [land, setLand] = React.useState(null);     /* id that just landed in a slot (one-shot) */
  const [nudge, setNudge] = React.useState(false);  /* full pill shook (one-shot) */
  const [drag, setDrag] = React.useState(null);     /* {id, from, dx, over} */
  const drg = React.useRef(null), justDragged = React.useRef(false);
  const full = tiles.length >= MA_MENU_N;

  function remove(id) {
    onTiles(tiles.filter((x) => x !== id));
    setSay(maMenuName(id) + " left the pill — tap a section to fill the slot.");
  }
  function add(id) {
    if (tiles.indexOf(id) >= 0) { remove(id); return; }
    if (full) { setNudge(true); setSay("The pill holds three. Tap one in it to free a slot."); return; }
    onTiles(tiles.concat(id)); setLand(id);
    setSay(maMenuName(id) + " is in slot " + (tiles.length + 1) + (tiles.length + 1 === MA_MENU_N ? " — your pill is ready." : "."));
  }
  function onSlotClick(id) {
    if (justDragged.current) { justDragged.current = false; return; }
    if (id) remove(id);
  }
  /* Drag a filled slot sideways to reorder; under 6px it stays a tap. */
  function onSlotDown(e, id, from) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = e.currentTarget, w = el.getBoundingClientRect().width + 6;
    drg.current = { id: id, from: from, sx: e.clientX, w: w, on: false, over: from };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* old engines */ }
    const move = (ev) => {
      const d = drg.current; if (!d) return;
      const dx = ev.clientX - d.sx;
      if (!d.on && Math.abs(dx) < 6) return;
      d.on = true;
      const max = Math.max(0, tiles.length - 1);
      d.over = Math.max(0, Math.min(max, Math.round(d.from + dx / d.w)));
      setDrag({ id: d.id, from: d.from, w: d.w, dx: Math.max(-d.from * d.w - 8, Math.min((max - d.from) * d.w + 8, dx)), over: d.over });
    };
    const up = () => {
      el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      const d = drg.current; drg.current = null;
      setDrag(null);
      if (!d || !d.on) return;
      justDragged.current = true;
      window.setTimeout(() => { justDragged.current = false; }, 0);
      if (d.over === d.from) return;
      const l = tiles.slice(); l.splice(d.from, 1); l.splice(d.over, 0, d.id);
      onTiles(l); setLand(d.id);
      setSay(maMenuName(d.id) + " moved to slot " + (d.over + 1) + ".");
    };
    el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  }

  const slots = []; for (let k = 0; k < MA_MENU_N; k++) slots.push(tiles[k] || null);
  return (
    <div className="ma-menu" data-ma-menu="">
      <span className="px-kicker ma-menu-kicker"><MaIcon name="layers" size={13} />Your pill · three sections</span>
      <div className="ma-menu-preview">
        <span className="ma-menu-screen" aria-hidden="true">
          <span className="ma-menu-line is-title" /><span className="ma-menu-line" /><span className="ma-menu-line is-short" /><span className="ma-menu-line" />
        </span>
        <div className={"ma-menu-pill" + (nudge ? " is-nudge" : "")} role="group" aria-label="Bottom menu" data-ma-pill={tiles.join(",")}
          onAnimationEnd={(e) => { if (e.target === e.currentTarget) setNudge(false); }}>
          {slots.map((id, k) => {
            const lifted = drag && drag.id === id;
            /* While one slot is dragged, the others step aside to show where it lands. */
            const step = drag && !lifted && id ? (drag.from < drag.over && k > drag.from && k <= drag.over ? -1 : drag.from > drag.over && k >= drag.over && k < drag.from ? 1 : 0) : 0;
            const cls = "ma-menu-slot" + (id ? " is-filled" : " is-empty") + (!id && k === tiles.length ? " is-next" : "")
              + (lifted ? " is-lifted" : "") + (step ? " is-shifting" : "");
            return (
              <button key={id || "empty-" + k} type="button" className={cls} data-ma-slot={k} data-ma-slot-id={id || undefined}
                aria-label={id ? "Slot " + (k + 1) + ": " + maMenuName(id) + " — tap to remove" : "Slot " + (k + 1) + ": empty"}
                disabled={!id} style={lifted ? { transform: "translateX(" + drag.dx + "px) scale(1.08)" } : step ? { transform: "translateX(" + step * drag.w + "px)" } : undefined}
                onPointerDown={id ? (e) => onSlotDown(e, id, k) : undefined} onClick={() => onSlotClick(id)}>
                {id ? (
                  <span className={"ma-menu-chip" + (land === id ? " is-land" : "")} onAnimationEnd={() => setLand(null)}>
                    <MaPlaceGlyph id={id} />
                  </span>
                ) : <span className="ma-menu-hole" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
      <span className="ma-menu-row">
        <span className="ma-menu-names" data-ma-names>{tiles.length ? tiles.map(maMenuName).join(" · ") : "Empty — tap three sections below"}</span>
        {tiles.join() !== MA_MENU_DEFAULT.join() ? (
          <button type="button" className="ma-menu-reset" data-ma-menu-reset onClick={() => { onTiles(MA_MENU_DEFAULT.slice()); setSay("Back to Home · Docs · Ask Needt."); }}><MaIcon name="rotate-ccw" size={13} />Reset</button>
        ) : null}
      </span>

      <span className="px-kicker ma-menu-gap ma-menu-kicker"><MaIcon name="view-grid" size={13} />Sections · tap to add</span>
      <div className="ma-menu-grid" role="group" aria-label="Sections">
        {MA_MENU_PLACES.map(([id, label]) => {
          const at = tiles.indexOf(id);
          return (
            <button key={id} type="button" className={"ma-menu-tile" + (at >= 0 ? " is-in" : "")} aria-pressed={at >= 0} data-ma-tile={id}
              onClick={() => add(id)}>
              <MaTile place={id} size={32} />
              <span className="ma-menu-label">{label}</span>
              {at >= 0 ? <span className="ma-menu-num" aria-hidden="true">{at + 1}</span> : null}
            </button>
          );
        })}
      </div>
      <span className="mau-hint ma-menu-say" role="status" aria-live="polite" data-ma-say>
        {say || "Tap a section to put it in the next free slot. Tap a slot to empty it, or drag it sideways to reorder."}
      </span>
    </div>
  );
}

function MbSetup({ onDone, step, theme, onTheme }) {
  const N = window.NEEDT;
  const [i, setI] = React.useState(() => maStepIx(typeof step === "string" ? step : MA_OLD_STEPS[step || 0] || "use"));
  const [uses, setUses] = React.useState(["work"]);
  /* The phone's settings store (Mobile.jsx mbPrefStore → "needt.settings"). */
  const pref = (k, fb) => { const s = window.mbPrefStore ? window.mbPrefStore.get() : {}; return s && s[k] != null ? s[k] : fb; };
  const setPref = (k, v) => { if (window.mbSetPref) window.mbSetPref(k, v); };
  const zone = React.useMemo(maDetectZone, []);
  const [start, setStart] = React.useState(() => pref("start", "09:00"));
  const [end, setEnd] = React.useState(() => pref("end", "18:00"));
  const [tz, setTz] = React.useState(() => {
    let had = false; try { const s = JSON.parse(localStorage.getItem("needt.settings")); had = !!(s && s.tz); } catch (e) { /* no storage */ }
    return had ? pref("tz", zone.key) : zone.key;
  });
  const badHours = (maHour(end) || 0) - (maHour(start) || 0) < 1;
  const [first, setFirst] = React.useState(null);
  const st = maUseStates("setup");
  /* Calendars connect for real (mock OAuth) through the shared store — stores.jsx useCalConnect. */
  const cal = window.useCalConnect(!!st.offline);
  const id = MA_STEPS[i][0];
  const tasksNow = () => (window.mbTaskStore ? window.mbTaskStore.get() : []);
  const prefs = () => ({ start: start, end: end, weekends: !!pref("weekends", false) });
  const shown = first || (id === "placed" && window.coParse ? maFirstTask(window.coParse("Draft the launch brief"), prefs(), tasksNow()) : null);

  /* The pill's three sections (step "menu"). */
  const [menu, setMenu] = React.useState(maMenuStart);
  const menuChanged = menu.join() !== MA_MENU_DEFAULT.join();

  function save(k) {
    if (k === "use") setPref("uses", uses.slice());
    if (k === "setup") { setPref("start", start); setPref("end", end); setPref("tz", tz); }
    if (k === "menu" && menu.length === MA_MENU_N) maMenuSave(menu);
  }
  function next() {
    if (id === "setup" && badHours) return;
    if (id === "menu" && menu.length !== MA_MENU_N) return;
    save(id); setI(i + 1);
  }
  function skipMenu() { setMenu(MA_MENU_DEFAULT.slice()); maMenuSave(MA_MENU_DEFAULT); setI(i + 1); }
  function created(parsed) { setFirst(maFirstTask(parsed, prefs(), tasksNow())); setI(maStepIx("placed")); }
  function finish(skip) {
    if (!skip) save(id);
    const t = !skip && (first || null);
    if (t && window.mbTaskStore) window.mbTaskStore.set((l) => [t.task].concat(l));
    onDone("week");
  }

  return (
    <PwMaScene variant={MA_SKY[id] || "a"}>
    <div className="mau-setup" data-ma-setup={id}>
      {/* Progress: pill dots, one per step; the theme switch; Skip. */}
      <div className="mau-top">
        {window.PxDots ? <window.PxDots count={MA_STEPS.length} index={i} label="Setup" className="mau-dots" /> : null}
        <MaTheme theme={theme} onTheme={onTheme} />
        <button type="button" className="mau-skip" data-ma-skip data-px-calm onClick={() => finish(true)}>Skip<MaIcon name="chevron-right" size={14} /></button>
      </div>

      <MaHead key={"h" + id} className="is-step mb-step" kicker={"Step " + (i + 1) + " of " + MA_STEPS.length} tile={MA_STEP_TILE[id]} a={PW_MA_HEAD[id][0]} b={PW_MA_HEAD[id][1]} line={MA_STEPS[i][2]} />

      <PwMaPaper className="is-fill">
      <div key={id} className="mb-step mau-step" data-ma-step={id}>
        {st.offline ? <MaNote icon="cloud-off">You're offline — your answers stay on this phone and are sent when you're back.</MaNote> : null}

        {id === "use" ? (
          <div className="mau-picks" role="group" aria-label="What you use Needt for">
            {MA_USES.map(([k, label, sub, glyph]) => (
              <MaPick key={k} multi on={uses.indexOf(k) >= 0} glyph={glyph} label={label} sub={sub} data={{ "data-ma-use": k }}
                onClick={() => setUses((l) => (l.indexOf(k) >= 0 ? l.filter((x) => x !== k) : l.concat(k)))} />
            ))}
            <span className="mau-hint has-icon"><MaIcon name="info" size={14} />Pick one or more — it only changes what Needt suggests first.</span>
          </div>
        ) : null}

        {id === "setup" ? (<>
          <div className="mau-picks">
            {MA_CALS.map(([k, label, glyph]) => {
              const s = k === "skip" ? null : cal.link[k];
              const on = k === "skip" ? cal.skip : s === "on" || s === "waiting";
              const note = s && window.CAL_CONNECT_NOTE[s] ? window.CAL_CONNECT_NOTE[s](k) : null;
              return <MaPick key={k} multi={k !== "skip"} on={on} glyph={glyph} label={label} note={note} status={s} data={{ "data-ma-cal": k, "data-ma-status": s || undefined }} onClick={() => cal.toggle(k)} />;
            })}
          </div>
          <div className="ma-hours mau-hours">
            <span className="mau-field-label has-tile"><MaTile icon="clock" hue="var(--accent)" size={28} />Working hours</span>
            <div className="ma-hours-line">
              <MaSelect label="Day starts" icon="sunrise" value={start} options={MA_TIMES.map((t) => [t, t])} onChange={setStart} />
              <span className="auth-ob-to">to</span>
              <MaSelect label="Day ends" icon="sunset" value={end} invalid={badHours} options={MA_TIMES.map((t) => [t, t])} onChange={setEnd} />
            </div>
            {badHours ? <span className="auth-error-text">The day has to end at least an hour after it starts.</span> : null}
            <span className="mau-field-label has-tile"><MaTile icon="globe" hue="var(--info)" size={28} />Time zone</span>
            <MaSelect wide icon="map-pin" label="Time zone" value={tz} options={MA_ZONES} onChange={setTz} />
            <span className="mau-hint has-icon" data-ma-zone={zone.iana}><MaIcon name="info" size={14} />{tz === zone.key ? "Found from this phone (" + zone.iana.replace(/_/g, " ") + ")." : "This phone says " + zone.iana.replace(/_/g, " ") + "."} Work is only placed inside these hours.</span>
          </div>
        </>) : null}

        {id === "menu" ? <MaMenuStep tiles={menu} onTiles={setMenu} /> : null}

        {id === "first" ? (
          <div className="mau-picks">
            <MaFirstLine onCreate={created} />
            <span className="mau-hint has-icon"><MaIcon name="sparkles" size={14} />Needt reads the day, length and project from the words, then finds a free slot in your hours.</span>
          </div>
        ) : null}

        {id === "placed" && shown ? (
          <div className="mau-picks">
            <span className="mau-kicker is-in"><MaTile place="calendar" size={28} />{maWeekday(shown.slot.day, "short") + " " + N.dayLabel(shown.slot.day)} · {N.hhmm(shown.slot.start)}–{N.hhmm(shown.slot.end)}</span>
            <MaDay compact slot={shown.slot} task={shown.task} minutes={shown.minutes} />
            <p className="auth-ob-why mau-why" data-ma-reason>
              {window.AiOrb ? <window.AiOrb size={18} /> : <MaIcon name="sparkles" size={14} />}
              <span>{shown.reason}</span>
            </p>
          </div>
        ) : null}
      </div>

      <div className="mau-foot">
        {i > 0 ? (
          <button type="button" onClick={() => setI(i - 1)} data-ma-back className="mau-text">
            <MaIcon name="arrow-left" size={15} />Back
          </button>
        ) : null}
        {id === "menu" ? (
          <button type="button" className="mau-text" data-ma-menu-skip onClick={skipMenu}>Skip<MaIcon name="chevron-right" size={15} /></button>
        ) : null}
        <span className="mau-foot-main">
          {id === "menu"
            ? <MaButton tone="accent" disabled={menu.length !== MA_MENU_N} onClick={next}>
                {menu.length === MA_MENU_N ? "Continue" : "Pick " + (MA_MENU_N - menu.length) + " more"}
                <MaIcon name={menu.length === MA_MENU_N ? "arrow-right" : "plus"} size={15} />
              </MaButton>
          : id === "first"
            ? <button type="button" className="mau-text mau-skiptask" data-ma-skip-task onClick={() => finish(true)}>Skip — open Needt<MaIcon name="arrow-right" size={15} /></button>
            : <MaButton tone="accent" disabled={id === "setup" && badHours} onClick={() => (id === "placed" ? finish(false) : next())}>
                {id === "placed" ? "Open my day" : "Continue"}
                <MaIcon name="arrow-right" size={15} />
              </MaButton>}
        </span>
      </div>
      </PwMaPaper>
    </div>
    </PwMaScene>
  );
}

Object.assign(window, { MbAuth, MbSetup });
