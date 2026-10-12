const { Icon, IconButton } = window.NeedtDesignSystem_25d3c8;
const { ExposureWordmark } = window;

/* AUTH + ONBOARDING — the two screens before the product, on the painted sky
 * (scenes.jsx): the form on frosted glass, a few glass cards of the product
 * around it. Static styling lives in styles/auth.css; states (offline, a
 * failing server) come from window.needtStates, screen "auth". */

/* ── CRAFT-STYLE PIECES (06.10.26) ─────────────────────────────────────────
   Sign in and first run are calm: one centred card on the app ground, the
   wordmark above it, a big title and one line. Greys are text-colour alpha,
   accent only as a mark or a thin wash, no gradients. */
const AX_CSS = `
@keyframes ax-step-fwd { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }
@keyframes ax-step-back { from { opacity: 0; transform: translateX(-18px); } to { opacity: 1; transform: none; } }
.ax-step.nx-swap.is-fwd { animation-name: ax-step-fwd; }
.ax-step.nx-swap.is-back { animation-name: ax-step-back; }
.ax-btn { transition: box-shadow var(--transition-hover), background-color var(--transition-hover), opacity var(--transition-hover); }
.ax-btn:active { transform: translateY(0.5px); }
.ax-raised:hover { box-shadow: var(--shadow-floating) !important; }
.ax-dark:hover { opacity: 0.88; }
.ax-row:hover { background: var(--fill-1) !important; }
.ax-row.is-on:hover { background: var(--fill-accent) !important; }
.ax-link { border: 0; background: none; padding: 0; cursor: default; font: inherit; color: var(--text-primary); text-decoration: underline; text-decoration-color: var(--text-quaternary); text-underline-offset: 2px; }
.ax-link:hover { text-decoration-color: var(--text-primary); }
@media (prefers-reduced-motion: reduce) { .ax-step { animation-duration: 1ms !important; } }
`;
function AxStyle() { return <style>{AX_CSS}</style>; }

/* Own glyphs, deliberately plain: a leaf-topped apple and a ring with a bar —
   recognisable as "the Apple one" and "the Google one" without copying marks. */
function GlyphApple() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 4.6c-1-.9-2.6-1-3.7-.2C3 5.3 2.6 7.2 3.2 9.2c.5 1.7 1.6 3.5 2.8 3.7.7.1 1.2-.3 2-.3s1.3.4 2 .3c1.2-.2 2.3-2 2.8-3.7.6-2-.1-3.9-1.3-4.8-1.1-.8-2.6-.7-3.5.2z" fill="currentColor" />
      <path d="M8.2 4.2c0-1.3.8-2.4 2-2.7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
function GlyphGoogle() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M13.2 6.9H8.2v2.3h2.8c-.4 1.3-1.5 2.2-3 2.2a3.4 3.4 0 1 1 2.2-6l1.6-1.6A5.6 5.6 0 1 0 13.6 8c0-.4 0-.7-.1-1.1z" fill="currentColor" />
    </svg>
  );
}

function AxRaised({ children, onClick, glyph, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="ax-btn ax-raised auth-oauth">
      {glyph ? <span className="auth-raised-row">{glyph}</span> : null}{children}
    </button>
  );
}
/* A 44px field: white, a hairline ring, the accent ring only while focused. */
function AxField({ value, onChange, placeholder, type, invalid, autoFocus, onEnter, trailing, label }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <span className="auth-field-row">
      <input value={value} type={type || "text"} placeholder={placeholder} aria-label={label || placeholder} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
        className="auth-field-input" style={{ padding: trailing ? "0 40px 0 14px" : "0 14px", boxShadow: invalid ? "var(--shadow-focus-destructive), var(--shadow-ring)" : focus ? "var(--shadow-focus)" : "var(--shadow-ring)" }} />
      {trailing ? <span className="auth-field-abs">{trailing}</span> : null}
    </span>
  );
}

function AxError({ children }) {
  return <span className="auth-error-text">{children}</span>;
}

/* ── THE PAINTED SKY (07.10.26) ─────────────────────────────────────────────
   Sign in and first run happen on the painted sky (scenes.jsx): a living
   sky fills the window, the form is a frosted glass card on it, and around it
   a few glass cards of the product itself (a task, an event, a habit). Logic,
   copy and validation are unchanged. Without scenes.jsx the sky falls back to
   a plain blue gradient. */
const PW_AX_CSS = `
.axs-collage { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
@media (max-width: 1099px) { .axs-collage { display: none; } }
.axs-card { width: 100%; box-sizing: border-box; }
.axs-card h1 { margin: 0; text-align: center; font-size: 44px; color: var(--text-primary); }
.axs-card h1 em, .axs-h em { font-style: italic; font-variation-settings: "EXPO" 8; padding-right: .04em; }
/* Text under the card sits on a small Craft glass chip, so it reads on any cloud. */
.axs-note, .axs-switch { margin: 0; text-align: center; text-wrap: pretty; padding: 6px 14px; border-radius: 9999px; color: var(--text-secondary);
  background-color: var(--white-a55); background-image: linear-gradient(var(--white-a0), var(--white-a40));
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); box-shadow: var(--white-a70) 0 0 0 1px inset, var(--black-a6) 0 0 0 1px; }
.dark .axs-note, .dark .axs-switch { background-color: var(--smoke-a55); background-image: none; box-shadow: var(--white-a8) 0 0 0 1px inset, var(--white-a10) 0 0 0 1px; }
.axs-note { max-width: 380px; font-size: 12px; line-height: 1.45; border-radius: 14px; }
.axs-note .ax-link, .axs-switch .ax-link { color: var(--text-primary); }
.axs-switch { font-size: 13px; }
.axs-skip { height: 30px; padding: 0 12px; border-radius: 9999px; font: 500 13px/1 var(--font-sans); }
.axs-h { margin: 0; }
.axs-art { position: relative; width: 100%; height: 300px; }
@media (max-width: 1099px) { .axs-art { display: none; } .axs-left { flex-basis: auto !important; } }
.axs-back { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px; border: 0; border-radius: 11px; cursor: default; background: transparent;
  font: 500 14px/1 var(--font-sans); color: var(--text-tertiary); }
.axs-back:hover { background: var(--fill-3); color: var(--text-secondary); }
.axs-go { min-width: 140px; height: 40px; border-radius: 12px; font-size: 14px; }
`;
function PwAxStyle() { if (window.pxEnsureCss) window.pxEnsureCss(); return <style>{PW_AX_CSS}</style>; }
function PwAxFallbackScene({ children }) {
  return <div className="auth-ax-fallback-scene-abs"><div className="auth-ax-fallback-scene-box">{children}</div></div>;
}
function PwAxFallbackGlass({ children, width, pad, style, className }) {
  return <div className={className} style={Object.assign({ width: width, padding: pad == null ? 20 : pad, background: "var(--surface-raised)", borderRadius: 22, boxSizing: "border-box" }, style)}>{children}</div>;
}
const pwAxScene = () => window.PxSky || PwAxFallbackScene;
const pwAxPrint = () => window.GlassCard || PwAxFallbackGlass;
/* A glass card with mini UI on it, placed around the form. */
function PwAxPrint({ at, caption, width, delay, children }) {
  const P = pwAxPrint();
  return (
    <span className="nx-swap" style={Object.assign({ position: "absolute", animationDelay: (delay || 0) + "ms" }, at)}>
      <P caption={caption} width={width} pad={10} radius={20}>
        <span className="auth-stack-6">{children}</span>
      </P>
    </span>
  );
}
function PwAxCollage() {
  const T = window.PwMiniTask, E = window.PwMiniEvent, H = window.PwMiniHabit, D = window.PwDateCard, M = window.PwMoodPrint;
  if (!T) return null;
  return (
    <div className="axs-collage" aria-hidden="true">
      <PwAxPrint at={{ left: "calc(50% - 560px)", top: "15%" }} caption="Today · 3 left" width={250} delay={80}>
        <T title="Reply to Tom" chip="Mailbox" />
        <T title="Charge the flash" done />
        <T title="List the boots on Ricardo" chip="Resale" />
      </PwAxPrint>
      <PwAxPrint at={{ left: "calc(50% - 520px)", top: "58%" }} caption="Habit · day 6" width={262} delay={160}>
        <H title="Shoot one roll" streak="6 days" />
      </PwAxPrint>
      <span className="nx-swap auth-ax-collage-abs" style={{ animationDelay: "120ms" }}>{D ? <D width={118} /> : null}</span>
      <PwAxPrint at={{ left: "calc(50% + 296px)", top: "45%" }} caption="Calendar · Tue" width={236} delay={200}>
        <E time="09:30" title="Standup" hue="var(--hue-blue)" />
        <E time="14:00" title="Shoot · Kreis 4" />
      </PwAxPrint>
      <span className="nx-swap auth-ax-collage-abs-2" style={{ animationDelay: "260ms" }}>{M ? <M width={140} height={88} /> : null}</span>
    </div>
  );
}

/* ── SIGN IN / SIGN UP ───────────────────────────────────────────────────── */
function AuthScreen({ mode, onMode, onDone, seed, embedded }) {
  const signup = mode !== "login";
  const [mail, setMail] = React.useState((seed && seed.mail) || "");
  const [pass, setPass] = React.useState((seed && seed.pass) || "");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [refused, setRefused] = React.useState((seed && seed.refused) || null);
  const [touched, setTouched] = React.useState(!!(seed && seed.touched));
  /* Craft asks for the address first; the password arrives under it once the
     address is in. A seeded password (the kit's error states) opens on both. */
  const [withPass, setWithPass] = React.useState(!!(seed && seed.pass));
  const short = pass.length > 0 && pass.length < 8;
  const badMail = touched && mail.length > 0 && mail.indexOf("@") < 1;
  const noMail = touched && mail.length === 0;
  /* States (07.10.26) from window.needtStates, screen "auth": offline turns
     every way in off with a quiet line; a load error ("the server didn't
     answer") makes the next attempt fail with "Couldn't sign in" + Retry.
     Try it: needtStates.set("offline", true) · needtStates.set("load", "error", "auth"). */
  const st = typeof useStStates === "function" ? useStStates("auth") : null;
  const offline = !!(st && st.offline);
  const failing = () => !!(window.needtStates && window.needtStates.get("auth").load === "error");
  const [netErr, setNetErr] = React.useState(!!(seed && seed.netError));
  const [retrying, setRetrying] = React.useState(false);
  const lastTry = React.useRef(null);
  /* Password recovery (08.10.26), sign-in only: null → "ask" (the address)
     → "sent" (check your email; resend after 30 s) → "reset" (the link was
     opened: a new password) → signed in. Mock: no mail leaves, and the new
     password lives in component state only — never logged, never stored. */
  const [recover, setRecover] = React.useState((seed && seed.recover) || null);
  const [fresh, setFresh] = React.useState("");
  const [freshTried, setFreshTried] = React.useState(false);
  const [resendIn, setResendIn] = React.useState(0);
  React.useEffect(() => {
    if (recover !== "sent" || resendIn <= 0) return undefined;
    const id = window.setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [recover, resendIn]);
  function openRecover() { setRefused(null); setNetErr(false); setPass(""); setFresh(""); setFreshTried(false); setTouched(false); setRecover("ask"); }
  function closeRecover() { setNetErr(false); setFresh(""); setRecover(null); setWithPass(false); }
  function sendLink() {
    if (busy || offline) return;
    setTouched(true);
    if (!mail || mail.indexOf("@") < 1) return;
    const run = () => {
      setBusy(true);
      window.setTimeout(() => {
        setBusy(false);
        if (failing()) { lastTry.current = run; setNetErr(true); return; }
        setNetErr(false); setResendIn(30); setRecover("sent");
      }, 700);
    };
    attempt(run);
  }
  function saveFresh() {
    if (busy || offline) return;
    setFreshTried(true);
    if (fresh.length < 8) return;
    const run = () => {
      setBusy(true);
      window.setTimeout(() => {
        setBusy(false);
        if (failing()) { lastTry.current = run; setNetErr(true); return; }
        setFresh(""); setRecover(null); onDone();
      }, 800);
    };
    attempt(run);
  }

  /* Every way in goes through here: offline does nothing, a failing server
     shows the error and remembers what to retry. */
  function attempt(fn) {
    if (offline) return;
    lastTry.current = fn;
    if (failing()) { setNetErr(true); return; }
    setNetErr(false);
    fn();
  }
  function retry() {
    if (retrying || offline) return;
    setRetrying(true);
    if (failing() && window.needtStates) window.needtStates.retry("auth");
    window.setTimeout(() => {
      setRetrying(false);
      if (failing()) { setNetErr(true); return; }
      setNetErr(false);
      if (lastTry.current) lastTry.current();
    }, 1300);
  }
  function send() {
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      if (failing()) { lastTry.current = send; setNetErr(true); return; }
      if (signup && mail.trim().toLowerCase() === "taken@needt.app") { setRefused("taken"); return; }
      if (!signup && pass !== "needt2026") { setRefused("wrong"); return; }
      onDone();
    }, 900);
  }
  function submit() {
    if (busy || offline) return;
    setTouched(true);
    if (!mail || mail.indexOf("@") < 1) return;
    if (!withPass) { setWithPass(true); return; }
    if (pass.length < 8) return;
    setNetErr(false);
    lastTry.current = send;
    send();
  }
  const refusal = refused === "taken" ? "That address already has an account. Sign in instead."
    : refused === "wrong" ? "That email and password do not match." : null;
  const Scene = pwAxScene(), Print = pwAxPrint();
  const netLine = recover === "reset" ? "Couldn't save the password — check your connection"
    : recover ? "Couldn't send the link — check your connection"
    : signup ? "Couldn't create your account — check your connection" : "Couldn't sign in — check your connection";
  const netRow = netErr && !offline ? (
    <div className="st-error auth-net" role="alert" data-auth-error>
      <span className="st-error-icon">{window.StGlyph ? <window.StGlyph name="cloud-off" size={16} /> : null}</span>
      <span className="st-error-text">{netLine}</span>
      <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" data-auth-retry disabled={retrying} onClick={retry}>
        {retrying ? <span className="st-spin" aria-hidden="true" /> : window.StGlyph ? <window.StGlyph name="refresh" size={13} /> : null}{retrying ? "Retrying" : "Retry"}
      </button>
    </div>
  ) : null;
  const offlineNote = offline ? (
    <p className="axs-note auth-offline" data-px-calm role="status" data-auth-offline>
      {window.StGlyph ? <window.StGlyph name="cloud-off" size={13} /> : null}
      <span>{recover ? "You’re offline — resetting a password needs a connection." : "You’re offline — signing in needs a connection."} Everything here works again once you’re back.</span>
    </p>
  ) : null;

  if (recover) {
    const freshShort = freshTried && fresh.length < 8;
    return (
      <div className="auth-enter" data-auth-screen={"recover-" + recover} style={embedded
        ? { position: "relative", height: "100%", overflow: "hidden" }
        : { position: "fixed", inset: 0, zIndex: 950 }}>
        <AxStyle /><PwAxStyle />
        <Scene variant="a">
          <PwAxCollage />
          <div className="scroll-inner auth-signin-abs">
            <div className="auth-signin-col">
              <span data-px-calm className="auth-flex needt-lockup">{window.NeedtAppIcon ? <window.NeedtAppIcon size={52} /> : null}<ExposureWordmark size={44} mode="breathe" style={{ color: "var(--px-ink)", textShadow: "0 0 18px var(--px-halo), 0 0 6px var(--px-halo)" }} /></span>
              <Print className="axs-card" pad={0} radius={24} width="100%" strong>
                <div key={recover} className="auth-signin-col-2 nx-swap">
                  <span className="px-kicker auth-signin-el">Reset password</span>
                  {recover === "ask" ? (<>
                    <h1 className="px-display">Forgot your <em>password</em>?</h1>
                    <p className="auth-signin-text">Enter the email you sign in with. We’ll send a link to set a new password.</p>
                    <div className="auth-signin-col-4">
                      <AxField value={mail} label="Email" placeholder="Enter your email address" autoFocus={!seed} invalid={badMail || noMail}
                        onChange={setMail} onEnter={sendLink} />
                      {noMail ? <AxError>Enter your email.</AxError> : badMail ? <AxError>Include an @ in the address.</AxError> : null}
                      {netRow}
                      <button type="button" onClick={sendLink} disabled={offline} className="nx-btn nx-btn-primary axs-go auth-signin-btn" data-auth-send-link>
                        {busy ? "Sending…" : "Send reset link"}
                      </button>
                    </div>
                  </>) : null}
                  {recover === "sent" ? (<>
                    <h1 className="px-display">Check your <em>email</em></h1>
                    <p className="auth-signin-text">We sent a reset link to <b className="auth-recover-mail">{mail}</b>. It works for 30 minutes — open it on this device.</p>
                    <div className="auth-signin-col-4">
                      {netRow}
                      <button type="button" className="nx-btn nx-btn-secondary axs-go auth-signin-btn" data-auth-open-link onClick={() => { setNetErr(false); setRecover("reset"); }}>
                        Open the link<span className="auth-recover-demo">prototype</span>
                      </button>
                      <p className="auth-recover-resend" data-auth-resend={resendIn > 0 ? resendIn : "ready"}>
                        {"Didn’t get it? Check spam, or "}
                        {resendIn > 0
                          ? <span className="auth-recover-wait">resend in 0:{String(resendIn).padStart(2, "0")}</span>
                          : <button type="button" className="ax-link" disabled={offline} onClick={() => attempt(() => { setResendIn(30); if (window.toast) window.toast("Sent another link to " + mail); })}>send it again</button>}
                        {". "}
                        <button type="button" className="ax-link" onClick={() => { setNetErr(false); setRecover("ask"); }}>Use a different email</button>
                      </p>
                    </div>
                  </>) : null}
                  {recover === "reset" ? (<>
                    <h1 className="px-display">Set a new <em>password</em></h1>
                    <p className="auth-signin-text">For <b className="auth-recover-mail">{mail || "your account"}</b>. You’ll be signed in right after.</p>
                    <div className="auth-signin-col-4">
                      <AxField value={fresh} type={show ? "text" : "password"} label="New password" placeholder="New password" autoFocus={!seed}
                        invalid={freshShort} onEnter={saveFresh} onChange={setFresh}
                        trailing={
                          <IconButton label={show ? "Hide password" : "Show password"} variant="ghost" onClick={() => setShow(!show)}>
                            <Icon name={show ? "eye-off" : "eye"} size={14} />
                          </IconButton>} />
                      <span className="auth-signin-text-3" style={{ color: freshShort ? "var(--destructive)" : "var(--text-tertiary)" }}>
                        {freshShort ? "Use at least 8 characters." : "At least 8 characters."}
                      </span>
                      {netRow}
                      <button type="button" onClick={saveFresh} disabled={offline} className="nx-btn nx-btn-primary axs-go auth-signin-btn" data-auth-save-password>
                        {busy ? "Signing you in…" : "Save and sign in"}
                      </button>
                    </div>
                  </>) : null}
                </div>
              </Print>
              {offlineNote}
              <p className="axs-switch" data-px-calm>
                {"Remembered it? "}
                <button type="button" className="ax-link auth-signin-text-4" data-auth-back-signin onClick={closeRecover}>Back to sign in</button>
              </p>
            </div>
          </div>
        </Scene>
      </div>
    );
  }

  return (
    <div className="auth-enter" data-auth-screen={signup ? "signup" : "login"} style={embedded
      ? { position: "relative", height: "100%", overflow: "hidden" }
      : { position: "fixed", inset: 0, zIndex: 950 }}>
      <AxStyle /><PwAxStyle />
      <Scene variant={signup ? "c" : "a"}>
        <PwAxCollage />
        <div className="scroll-inner auth-signin-abs">
          <div className="auth-signin-col">
            <span data-px-calm className="auth-flex needt-lockup">{window.NeedtAppIcon ? <window.NeedtAppIcon size={52} /> : null}<ExposureWordmark size={44} mode="breathe" style={{ color: "var(--px-ink)", textShadow: "0 0 18px var(--px-halo), 0 0 6px var(--px-halo)" }} /></span>
            <Print className="axs-card" pad={0} radius={24} width="100%" strong>
              <div className="auth-signin-col-2">
                <span className="px-kicker auth-signin-el">{signup ? "New account" : "Sign in"}</span>
                <h1 className="px-display">{signup ? <>Create your <em>account</em></> : <>Welcome <em>back</em></>}</h1>
                <p className="auth-signin-text">
                  {signup ? "One planner for your calendar, your tasks and your projects." : "Sign in — your day is where you left it."}
                </p>

                <div className="auth-stack-8">
                  <AxRaised glyph={<GlyphApple />} disabled={offline} onClick={() => attempt(onDone)}>Continue with Apple</AxRaised>
                  <AxRaised glyph={<GlyphGoogle />} disabled={offline} onClick={() => attempt(onDone)}>Continue with Google</AxRaised>
                </div>

                <div className="auth-signin-row-2">
                  <span className="auth-signin-el-2" />
                  <span className="auth-signin-text-2">or</span>
                  <span className="auth-signin-el-2" />
                </div>

                <div className="auth-signin-col-4">
                  <AxField value={mail} label="Email" placeholder="Enter your email address" invalid={badMail || noMail || refused === "taken"}
                    onChange={(v) => { setRefused(null); setMail(v); }} onEnter={submit} />
                  {noMail ? <AxError>Enter your email.</AxError> : badMail ? <AxError>Include an @ in the address.</AxError> : null}
                  {withPass ? (
                    <div key="pw" className="nx-swap auth-stack-6">
                      <AxField value={pass} type={show ? "text" : "password"} label="Password" placeholder={signup ? "Choose a password" : "Password"}
                        autoFocus={!seed} invalid={short || refused === "wrong"} onEnter={submit}
                        onChange={(v) => { setRefused(null); setPass(v); }}
                        trailing={
                          <IconButton label={show ? "Hide password" : "Show password"} variant="ghost" onClick={() => setShow(!show)}>
                            <Icon name={show ? "eye-off" : "eye"} size={14} />
                          </IconButton>} />
                      <span className="auth-pass-row">
                        <span className="auth-signin-text-3" style={{ color: short ? "var(--destructive)" : "var(--text-tertiary)" }}>
                          {short ? "Use at least 8 characters." : "At least 8 characters."}
                        </span>
                        {signup ? null : <button type="button" className="ax-link auth-forgot" data-auth-forgot onClick={openRecover}>Forgot password?</button>}
                      </span>
                    </div>
                  ) : null}
                  {refusal ? (
                    <span className="refusal auth-signin-row-3">
                      <Icon name="alert-circle" size={13} />{refusal}
                    </span>
                  ) : null}
                  {netRow}
                  <button type="button" onClick={submit} disabled={offline} className="nx-btn nx-btn-primary axs-go auth-signin-btn" data-auth-submit>
                    {busy ? "Setting up your day…" : withPass ? (signup ? "Create account" : "Sign in") : "Continue"}
                  </button>
                </div>
              </div>
            </Print>
            {offlineNote}
            <p className="axs-switch" data-px-calm>
              {signup ? "Already have an account? " : "New to Needt? "}
              <button type="button" className="ax-link auth-signin-text-4" data-auth-switch onClick={() => onMode(signup ? "login" : "signup")}>
                {signup ? "Sign in" : "Create one"}
              </button>
            </p>
            <p className="axs-note" data-px-calm>
              By continuing you agree to Needt's <button type="button" className="ax-link">Terms</button> and <button type="button" className="ax-link">Privacy Policy</button>.
            </p>
          </div>
        </div>
      </Scene>
    </div>
  );
}

/* ── ONBOARDING (08.10.26, owner-approved review) ───────────────────────────
   Five steps that end in the product doing its one trick:
     1 use      — what Needt is for: any mix of Work / Personal / Side business
     2 setup    — connect a calendar (skippable) + working hours + time zone
     3 sidebar  — "Make your sidebar": the 3×2 tile grid on top, the other
                  places floating on a sea of clouds below; drag one onto a
                  tile to swap it in (08.10.26, owner-approved mini-game)
     4 first    — the first task, typed into the real Composer
     5 placed   — "Here's where Needt put it and why": a mini day with the task
                  in its free slot and one line of reasoning → Open my day.
   Theme is a small switch in the top corner, not a step. The start view is
   chosen for the person (Calendar opens on Week); there is no view step. */
const STEPS = [
  ["use", "What you use it for", "Pick all that fit — it only changes what Needt suggests first."],
  ["setup", "Calendar and hours", "Needt plans tasks around your events, inside the hours you work."],
  ["sidebar", "Your sidebar", "Six tiles sit at the top of the sidebar. Swap in the places you’ll open most — the rest wait under More."],
  ["first", "Your first task", "Type it the way you’d say it — Needt reads the day, length and project from the words."],
  ["placed", "Where it went", "Nothing is locked: drag it, or let Needt move it when your day changes."]
];
const obStepIx = (id) => STEPS.findIndex((s) => s[0] === id);
const OB_SKY = { use: "a", setup: "c", sidebar: "a", first: "b", placed: "d" };
/* The headline, set big in Exposure on the scene: one italic word each. */
const PW_AX_HEAD = {
  use: <>What will you use Needt <em>for</em>?</>,
  setup: <>Your calendar and <em>hours</em></>,
  sidebar: <>Make your <em>sidebar</em></>,
  first: <>Your first <em>task</em></>,
  placed: <>Here’s where Needt <em>put</em> it</>
};

const USES = [
  ["work", "Work", "Projects, meetings and the tasks between them", "work"],
  ["personal", "Personal", "Errands, habits and the things you keep meaning to do", "home"],
  ["side", "Side business", "Listings, orders and the work around a second income", "stack"]
];
const CALS = [
  ["google", "Google Calendar", "Two-way sync with your Google account", "event"],
  ["apple", "Apple Calendar", "iCloud calendars, read and write", "calendarfile"],
  ["outlook", "Outlook", "Microsoft 365 or Outlook.com", "mail"],
  ["skip", "Skip for now", "Connect one later from Settings", "later"]
];

/* ── First-slot planner: Data.js (NEEDT.firstSlot / slotReason / firstTask),
   shared with the phone's MobileAuth.jsx. The first free run of `minutes`
   inside working hours from the prototype's now (Tue 1 Sep, 14:20) that
   touches no event and no hand-set (isFixed) task. Local names kept here. */
const OB_NOW = (window.NEEDT && window.NEEDT.planNow) || 14 + 20 / 60;
const obWeekday = (d, form) => window.NEEDT.planWeekday(d, form);
const obHour = (v) => window.NEEDT.planHour(v);
const needtFirstTask = (parsed, prefs, tasks) => window.NEEDT.firstTask(parsed, prefs, tasks);

/* Working hours: half hours from 05:00 to 23:30. Time zone: the three the
   Settings sheet offers, the device's zone picked for you. */
const OB_TIMES = (() => { const l = []; for (let h = 5; h < 24; h += 0.5) l.push(window.NEEDT ? window.NEEDT.hhmm(h) : String(Math.floor(h)).padStart(2, "0") + (h % 1 ? ":30" : ":00")); return l; })();
const OB_ZONES = [["cet", "CET — Zürich, Berlin, Paris"], ["utc", "UTC — London, Lisbon"], ["est", "EST — New York, Toronto"]];
function obDetectZone() {
  let z = "";
  try { z = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* no Intl */ }
  const key = /^Europe\/(London|Lisbon|Dublin)/.test(z) || /^(UTC|Etc\/)/.test(z) ? "utc"
    : /^Europe\//.test(z) ? "cet"
    : /^America\/(New_York|Toronto|Detroit|Montreal|Nassau|Indiana)/.test(z) ? "est" : "utc";
  return { iana: z || "UTC", key: key };
}
function ObSelect({ value, options, onChange, label, invalid, wide }) {
  return (
    <span className={"auth-select" + (wide ? " is-wide" : "") + (invalid ? " is-invalid" : "")}>
      <select value={value} aria-label={label} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
      </select>
      <span className="auth-select-chev" aria-hidden="true"><Icon name="chevrons-up-down" size={13} /></span>
    </span>
  );
}

/* The mini day: working hours as a ruler, events and timed tasks as blocks,
   the new task picked out (selection look: accent wash + ring), the now-line
   when it is today. Shared CSS (auth.css) with the phone. */
function ObDay({ slot, task, minutes, compact }) {
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
        <Icon name="circle-check" size={12} />
        <span className="auth-tl-time">{N.hhmm(slot.at)}</span><span className="auth-tl-title">{task.title}</span>
        <span className="auth-tl-len">{minutes} min</span>
      </span>
      {isToday && OB_NOW > lo && OB_NOW < hi ? (
        <span className="auth-tl-now" style={{ top: y(OB_NOW) }} title={"Now · " + N.hhmm(OB_NOW)}><span>{N.hhmm(OB_NOW)}</span></span>
      ) : null}
    </div>
  );
}

/* The theme, as a small switch in the corner (it was a whole step). */
function ObTheme({ theme, onTheme }) {
  const list = window.THEMES || [["system", "System"], ["light", "Light"], ["dark", "Dark"], ["time", "Time"]];
  if (!onTheme) return null;
  return (
    <div className="auth-theme" role="radiogroup" aria-label="Theme" data-px-calm>
      {list.map(([id, l]) => (
        <button key={id} type="button" role="radio" aria-checked={theme === id} className={"auth-theme-b" + (theme === id ? " is-on" : "")}
          data-ob-theme={id} onClick={() => onTheme(id)}>{l}</button>
      ))}
    </div>
  );
}

/* Craft's rich row: illustration, title, one line; picked = a thin accent wash
   and an accent ring, with a filled check at the end.
   status (calendar rows): "busy" = OAuth running (spinner, "Connecting…"),
   "error" = it failed (destructive ring + the reason), "waiting" = picked
   while offline. The sub line then says what is happening. */
function AxRow({ art, title, sub, on, onClick, delay, multi, status, note, cal, compact }) {
  const Art = window.Art;
  const busy = status === "busy", bad = status === "error";
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-busy={busy || undefined} data-ax-status={status || undefined} data-ax-cal={cal || undefined}
      className={("ax-row nx-swap" + (on ? " is-on" : "") + (bad ? " is-error" : "") + (compact ? " is-compact" : "")) + " auth-row-row"}
      style={{ animationDelay: (delay || 0) + "ms", background: on ? "var(--fill-accent)" : "var(--surface-raised)", boxShadow: bad ? "inset 0 0 0 1px var(--destructive)" : on ? "inset 0 0 0 1.5px var(--accent)" : "var(--shadow-ring)" }}>
      <span className="auth-row-row-2">{Art ? <Art name={art} size={compact ? 30 : 38} /> : null}</span>
      <span className="auth-row-col">
        <span className="auth-row-text">{title}</span>
        <span className={"auth-row-text-2" + (bad ? " is-error" : "")} role={status ? "status" : undefined}>{note || sub}</span>
      </span>
      {busy ? <span aria-hidden="true" className="auth-row-spin" /> : (
        <span aria-hidden="true" className="auth-row-grid" style={{ borderRadius: multi ? 6 : 10, background: on ? "var(--accent)" : "transparent", boxShadow: on ? "none" : "inset 0 0 0 1.5px var(--text-muted)" }}>
          {on ? <Icon name="check" size={12} /> : null}
        </span>
      )}
    </button>
  );
}

/* Each step's illustration: glass cards of the product. */
const OB_USE_ROWS = {
  work: [["Draft the launch brief", "Work"], ["Reply to Tom", "Mailbox"]],
  personal: [["Pick up the prints", "Errand"], ["Call mum", null]],
  side: [["List the boots on Ricardo", "Side"], ["Ship order #2041", "Side"]]
};
function PwAxStepArt({ id, uses, cals, hours, first }) {
  const T = window.PwMiniTask, E = window.PwMiniEvent, H = window.PwMiniHabit, D = window.PwDateCard;
  const P = pwAxPrint();
  if (!T || id === "sidebar") return null;
  const pin =(at, delay, child) => <span className="nx-swap" style={Object.assign({ position: "absolute", animationDelay: delay + "ms" }, at)}>{child}</span>;
  if (id === "use") {
    const pickd = uses.length ? uses : ["work"];
    const rows = [].concat.apply([], pickd.map((u) => OB_USE_ROWS[u] || [])).slice(0, 4);
    return (
      <div className="axs-art" aria-hidden="true">
        {pin({ left: 0, top: 10 }, 60, <P width={262} caption={"Inbox · " + rows.length} pad={10} radius={20}><span className="auth-stack-6">{rows.map(([t, c]) => <T key={t} title={t} chip={c} />)}</span></P>)}
        {pin({ left: 190, top: 196 }, 140, <P width={238} caption="Habit · day 6" pad={10} radius={20}><H title="Shoot one roll" streak="6 days" /></P>)}
      </div>
    );
  }
  if (id === "setup") {
    const on = (k) => cals.indexOf(k) >= 0;
    return (
      <div className="axs-art" aria-hidden="true">
        {pin({ left: 0, top: 10 }, 60, D ? <D width={118} /> : null)}
        {pin({ left: 134, top: 40 }, 120, (
          <P width={250} pad={10} radius={20} caption={"Tue · your hours " + hours}>
            <span aria-label="A day with events" className="auth-stack-6">
              {[["08:00", "Coffee · Kreis 5", "var(--demo-hue-green)", "apple"], ["09:30", "Standup", "var(--hue-blue)", "google"], ["12:00", "Lunch with Ana", "var(--demo-hue-gray)", "outlook"], ["14:00", "Shoot · Kreis 4", "var(--demo-hue-orange)", "google"]].map(([t, l, h, k]) => (
                <span key={l} className="auth-ax-step-art-el" style={{ opacity: on(k) ? 1 : 0.38 }}><E time={t} title={l} hue={h} /></span>
              ))}
            </span>
          </P>))}
      </div>
    );
  }
  if (id === "first") {
    return (
      <div className="axs-art" aria-hidden="true">
        {pin({ left: 0, top: 16 }, 60, <P width={292} caption="Needt reads the words" pad={10} radius={20}>
          <span className="auth-stack-6">
            <T title="Plan the week" chip="30 min" />
            <T title="Pay the rent" chip="by Friday" />
            <T title="Draft the brief" chip="Work" />
          </span></P>)}
      </div>
    );
  }
  return (
    <div className="axs-art" aria-hidden="true">
      {pin({ left: 0, top: 10 }, 60, D ? <D width={118} event={false} /> : null)}
      {first ? pin({ left: 134, top: 60 }, 140, <P width={250} caption="Placed by Needt" pad={10} radius={20}>
        <E time={window.NEEDT.hhmm(first.slot.at)} title={first.task.title} hue="var(--accent)" /></P>) : null}
      {pin({ left: 140, top: 150 }, 220, window.PxBadge ? <window.PxBadge className="auth-ax-step-art-text-2">Ready</window.PxBadge> : null)}
    </div>
  );
}

/* ── "Make your sidebar" (step 3, 08.10.26) ─────────────────────────────────
   The order is every SK_PLACES id (sidebar-kit.jsx); the first OB_SB_N are the
   tiles, More is always the sixth tile and holds the rest, in order. Saved as
   needtSettings "sidebarTiles" when you leave the step forward (Sidebar.jsx
   reads it). Interactions:
     drag a sea place onto a tile → they swap (the old tile springs back into
       the sea where the new one was); drag a tile onto another → they swap;
     click / Enter a place, then a tile (or the other way round) → same swap;
     Esc drops the pick. Reset → the default order. More cannot move.
   The sea tiles settle once when the step mounts, then hold still; they
   never move with reduced motion (auth.css). */
const OB_SB_N = 5;
const obSbPlaces = () => (window.SK_PLACES || []).map((p) => p.id);
const obSbPlace = (id) => (window.skPlace && window.skPlace(id)) || { id: id, label: id, art: "page" };
/* Tile labels use the sidebar's short names (Sidebar.jsx SB_TILE_SHORT). */
const OB_SB_SHORT = { moodboards: "Boards" };
function obSbStart(S) {
  const all = obSbPlaces();
  const saved = S && S.has("sidebarTiles") ? S.get("sidebarTiles") : null;
  if (!Array.isArray(saved)) return all;
  const l = saved.filter((id, n) => all.indexOf(id) >= 0 && saved.indexOf(id) === n);
  all.forEach((id) => { if (l.indexOf(id) < 0) l.push(id); });
  return l;
}
function ObSbGlyph({ id, art }) {
  if (window.PlaceGlyph) return <window.PlaceGlyph id={id} />;
  if (id === "more") return <span className="ob-sb-more" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((n) => <i key={n} />)}</span>;
  return window.Art ? <window.Art name={art} size={24} /> : null;
}
/* One tile, drawn like Sidebar.jsx's PlaceTile (same .sb-place ground). */
function ObSbTile({ id, picked, over, back, land, drag, onDown, onPick, slot, label }) {
  const p = id === "more" ? { id: "more", label: "More", art: "more" } : obSbPlace(id);
  const cls = "sb-place ob-sb-tile" + (picked ? " is-picked" : "") + (over ? " is-over" : "") + (back ? " is-back" : "") + (land ? " is-land" : "") + (drag ? " is-lifted" : "");
  if (id === "more") {
    return (
      <span className={cls + " sb-place-box is-fixed"} data-ob-slot={slot} data-ob-more="" title="More always stays last — it holds every other place">
        <ObSbGlyph id="more" /><span className="sb-place-label">More</span>
      </span>
    );
  }
  return (
    <button type="button" className={cls + " sb-place-box"} data-ob-tile={id} data-ob-slot={slot == null ? undefined : slot} aria-pressed={picked || undefined}
      aria-label={label || p.label} onPointerDown={onDown} onClick={onPick}>
      <ObSbGlyph id={p.id} art={p.art} /><span className="sb-place-label">{OB_SB_SHORT[p.id] || p.label}</span>
    </button>
  );
}
function ObSidebarGame({ order, onOrder }) {
  const [pick, setPick] = React.useState(null);      /* id picked by click/keyboard */
  const [ghost, setGhost] = React.useState(null);    /* {id, x, y, w, h, over, home} */
  const [fx, setFx] = React.useState({});            /* id → "back" | "land" (one-shot) */
  const [say, setSay] = React.useState("");
  const drag = React.useRef(null), root = React.useRef(null), justDragged = React.useRef(false);
  const grid = order.slice(0, OB_SB_N), sea = order.slice(OB_SB_N);
  const name = (id) => obSbPlace(id).label;

  /* The sea's tiles settle once on mount (auth.css .ob-sb-bob), then hold
     still: no idle timer or visibility watch is needed. */
  React.useEffect(() => {
    if (!pick) return undefined;
    const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); setPick(null); setSay("Pick dropped."); } };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [pick]);

  /* a and b trade places in the order. */
  function swap(a, b) {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    if (ia < 0 || ib < 0 || ia === ib) return;
    const l = order.slice(); l[ia] = b; l[ib] = a;
    onOrder(l);
    const intoGrid = ia >= OB_SB_N ? a : ib >= OB_SB_N ? b : null;
    const out = intoGrid === a ? b : intoGrid === b ? a : null;
    const f = {}; f[a] = "land"; f[b] = "land"; if (out) f[out] = "back";
    setFx(f);
    window.setTimeout(() => setFx({}), 700);
    setSay(out ? name(intoGrid) + " is a tile now; " + name(out) + " moved to More." : name(a) + " and " + name(b) + " swapped places.");
  }
  function onPick(id) {
    if (justDragged.current) { justDragged.current = false; return; }
    if (!pick) { setPick(id); setSay(name(id) + " picked — now choose " + (order.indexOf(id) < OB_SB_N ? "another tile or a place below" : "a tile to put it on") + ". Esc cancels."); return; }
    if (pick === id) { setPick(null); setSay("Pick dropped."); return; }
    const pg = order.indexOf(pick) < OB_SB_N, ig = order.indexOf(id) < OB_SB_N;
    if (!pg && !ig) { setPick(id); setSay(name(id) + " picked — now choose a tile to put it on."); return; }
    setPick(null); swap(pick, id);
  }

  /* Pointer drag: lifts after 5 px; the ghost lives in a portal on <body>
     (the glass card's backdrop-filter would trap a fixed child). */
  function onDown(e, id) {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { id: id, sx: e.clientX, sy: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, home: { x: r.left, y: r.top }, on: false };
    const overOf = (x, y) => {
      const el = document.elementFromPoint(x, y);
      const t = el && el.closest && el.closest("[data-ob-slot]");
      if (!t || !root.current || !root.current.contains(t) || t.hasAttribute("data-ob-more")) return null;
      const target = t.getAttribute("data-ob-tile");
      /* A place from the sea can only land on a tile, never on another place. */
      if (!target || target === id || (order.indexOf(id) >= OB_SB_N && order.indexOf(target) >= OB_SB_N)) return null;
      return target;
    };
    const move = (ev) => {
      const d = drag.current; if (!d) return;
      if (!d.on && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 5) return;
      d.on = true;
      d.over = overOf(ev.clientX, ev.clientY);
      setPick(null);
      setGhost({ id: d.id, x: ev.clientX - d.dx, y: ev.clientY - d.dy, w: d.w, h: d.h, over: d.over, home: d.home });
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      const d = drag.current; drag.current = null;
      if (!d || !d.on) return;
      justDragged.current = true;
      window.setTimeout(() => { justDragged.current = false; }, 0);
      const fromGrid = order.indexOf(d.id) < OB_SB_N, toGrid = d.over && order.indexOf(d.over) < OB_SB_N;
      if (d.over && (fromGrid || toGrid)) { setGhost(null); swap(d.id, d.over); return; }
      /* Nowhere useful: spring back home, then land. */
      setGhost((g) => g && Object.assign({}, g, { x: d.home.x, y: d.home.y, over: null, returning: true }));
      window.setTimeout(() => setGhost(null), 260);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  }
  const lifted = ghost && ghost.id;
  const ghostEl = ghost && window.ReactDOM ? window.ReactDOM.createPortal(
    <div className={"ob-sb-ghost" + (ghost.returning ? " is-returning" : "")} aria-hidden="true"
      style={{ "--ob-x": ghost.x + "px", "--ob-y": ghost.y + "px", "--ob-w": ghost.w + "px", "--ob-h": ghost.h + "px" }}>
      <ObSbTile id={ghost.id} />
    </div>, document.body) : null;

  return (
    <div ref={root} className={"ob-sb" + (ghost ? " is-dragging" : "") + (pick ? " is-picking" : "")} data-ob-sidebar="">
      <span className="px-kicker auth-onboarding-el-2">Your sidebar · 5 tiles and More</span>
      <div className="ob-sb-panel">
        <div className="ob-sb-grid" role="group" aria-label="Sidebar tiles">
          {grid.map((id, n) => (
            <div key={id} className="ob-sb-cell">
              <ObSbTile id={id} slot={n} picked={pick === id} over={ghost && ghost.over === id} land={fx[id] === "land"} drag={lifted === id}
                label={"Tile " + (n + 1) + ": " + name(id)} onDown={(e) => onDown(e, id)} onPick={() => onPick(id)} />
            </div>
          ))}
          <div className="ob-sb-cell"><ObSbTile id="more" slot={OB_SB_N} /></div>
        </div>
      </div>
      <span className="px-kicker auth-onboarding-el-2 auth-ob-gap">Everything else · drag one up</span>
      <div className="ob-sb-sea">
        {window.PxSky ? <window.PxSky variant="b" horizon="cloudsea" radius={16} className="ob-sb-sky" /> : null}
        <div className="ob-sb-float" role="group" aria-label="Places under More">
          {sea.map((id, n) => (
            <span key={id} className={"ob-sb-bob is-b" + (n % 4)}>
              <ObSbTile id={id} picked={pick === id} over={ghost && ghost.over === id} back={fx[id] === "back"} drag={lifted === id}
                slot={OB_SB_N + 1 + n} label={name(id) + " (under More)"} onDown={(e) => onDown(e, id)} onPick={() => onPick(id)} />
            </span>
          ))}
        </div>
      </div>
      <span className="auth-ob-hint" role="status" aria-live="polite" data-ob-say>{say || "Drag a place onto a tile to swap it in, or drag tiles to reorder. Or click one, then a tile."}</span>
      {ghostEl}
    </div>
  );
}

function OnboardingScreen({ onDone, theme, onTheme, embedded, seed }) {
  const N = window.NEEDT;
  const [i, setI] = React.useState(() => {
    const k = seed && typeof seed.step === "string" ? obStepIx(seed.step) : (seed && seed.step) || 0;
    return Math.max(0, Math.min(STEPS.length - 1, k));
  });
  const [dir, setDir] = React.useState(1);
  const [uses, setUses] = React.useState(["work"]);
  /* Hours and zone start from Settings (needtSettings); the zone, unless the
     person chose one before, from this device. */
  const S = window.needtSettings;
  const zone = React.useMemo(obDetectZone, []);
  const [start, setStart] = React.useState(() => (S ? S.get("start") : "09:00"));
  const [end, setEnd] = React.useState(() => (S ? S.get("end") : "18:00"));
  const [tz, setTz] = React.useState(() => (S && S.has("tz") ? S.get("tz") : zone.key));
  /* The sidebar's place order (step 3): first OB_SB_N are tiles, More holds the rest. */
  const [tiles, setTiles] = React.useState(() => obSbStart(S));
  const tilesDefault = React.useMemo(obSbPlaces, []);
  const tilesChanged = tiles.join() !== tilesDefault.join();
  const badHours = (obHour(end) || 0) - (obHour(start) || 0) < 1;
  /* The first task and where it went: {task, slot, minutes, reason}. */
  const [first, setFirst] = React.useState(null);
  const [planning, setPlanning] = React.useState(false);
  /* Offline (needtStates): setup still works; calendars connect once back. */
  const st = typeof useStStates === "function" ? useStStates("auth") : null;
  const offline = !!(st && st.offline);
  const cal = window.useCalConnect(offline);
  const cals = cal.skip ? ["skip"] : cal.picked;
  const step = STEPS[i];
  const tasksNow = () => (window.__app && window.__app.tasksNow) || [];
  const prefs = () => ({ start: start, end: end, weekends: S ? S.get("weekends") : false });
  /* A kit page opened straight on step 4 gets a sample first task. */
  const shown = first || (step[0] === "placed" && seed && window.coParse ? needtFirstTask(window.coParse("Draft the launch brief"), prefs(), tasksNow()) : null);

  /* What a step decided is written when you leave it (forward). */
  function save(k) {
    if (!S) return;
    if (k === "use") S.set("uses", uses.slice());
    if (k === "setup") S.patch({ start: start, end: end, tz: tz });
    if (k === "sidebar" && tiles.length) S.set("sidebarTiles", tiles.slice());
  }
  function go(n) {
    const to = Math.max(0, Math.min(STEPS.length - 1, n));
    if (to === obStepIx("placed") && !first) return;
    if (to > i && step[0] === "setup" && badHours) return;
    if (to > i) for (let k = i; k < to; k++) save(STEPS[k][0]);
    setDir(to > i ? 1 : -1); setI(to);
  }
  function toggleUse(id) { setUses((l) => (l.indexOf(id) >= 0 ? l.filter((x) => x !== id) : l.concat(id))); }
  function created(parsed) {
    const r = needtFirstTask(parsed, prefs(), tasksNow());
    setFirst(r); setDir(1); setI(obStepIx("placed"));
  }
  function finish(skipped) {
    if (planning) return;
    if (skipped !== true) save(step[0]);
    /* The start view is chosen for the person: Calendar opens on Week. */
    if (S && !S.has("view")) S.set("view", "week");
    if (skipped === true) { onDone({ skipped: true }); return; }
    setPlanning(true);
    window.setTimeout(() => onDone({ task: first ? first.task : null }), 700);
  }
  const Scene = pwAxScene(), Print = pwAxPrint();
  const Composer = window.Composer;

  return (
    <div className="auth-enter" data-onboarding-step={step[0]} style={embedded
      ? { position: "relative", height: "100%", overflow: "hidden" }
      : { position: "fixed", inset: 0, zIndex: 950 }}>
      <AxStyle /><PwAxStyle />
      <Scene variant={OB_SKY[step[0]] || "a"}>
        <div className="auth-onboarding-abs">
          {/* Top: the mark, four pill dots as progress, the theme switch, Skip. */}
          <div className="auth-onboarding-row">
            <span data-px-calm className="auth-flex needt-lockup needt-lockup-sm">{window.NeedtAppIcon ? <window.NeedtAppIcon size={40} /> : null}<ExposureWordmark size={30} mode="breathe" style={{ color: "var(--px-ink)", textShadow: "0 0 18px var(--px-halo), 0 0 6px var(--px-halo)" }} /></span>
            {window.PxDots ? <window.PxDots count={STEPS.length} index={i} onPick={go} label="Setup" names={STEPS.map((s) => s[1])} className="auth-onboarding-text" /> : <span className="auth-onboarding-text" />}
            <ObTheme theme={theme} onTheme={onTheme} />
            <button type="button" className="axs-skip px-chip-btn" data-ob-skip onClick={() => finish(true)}>Skip setup</button>
          </div>

          <div className="auth-onboarding-row-2">
            {/* Left: the headline on the scene and the step's prints. */}
            <div key={"h" + step[0]} className={("axs-left ax-step nx-swap " + (dir > 0 ? "is-fwd" : "is-back")) + " auth-onboarding-col"}>
              <span className="px-kicker auth-onboarding-el" data-px-calm>Step {i + 1} of {STEPS.length}</span>
              <h1 className="px-display px-on-sky axs-h auth-onboarding-text-2" data-px-calm>{PW_AX_HEAD[step[0]]}</h1>
              <p className="px-on-sky auth-onboarding-text-3" data-px-calm>{step[2]}</p>
              <PwAxStepArt id={step[0]} uses={uses} cals={cals} hours={start + "–" + end} first={shown} />
            </div>

            {/* Right: the choices, on frosted glass. */}
            <Print pad={0} radius={24} strong width={step[0] === "first" ? 600 : 520} className="axs-card auth-onboarding-card">
              <div className="auth-onboarding-col-2">
                <div key={step[0]} className={("ax-step nx-swap scroll-inner " + (dir > 0 ? "is-fwd" : "is-back")) + " auth-onboarding-col-3"}>

                  {step[0] === "use" ? (<>
                    <span className="px-kicker auth-onboarding-el-2">Pick any · one or more</span>
                    <div className="auth-stack-8" role="group" aria-label="What you use Needt for">
                      {USES.map(([id, t, s, a], n) => (
                        <AxRow key={id} art={a} title={t} sub={s} multi on={uses.indexOf(id) >= 0} onClick={() => toggleUse(id)} delay={60 + n * 40} />
                      ))}
                    </div>
                    {!uses.length ? <span className="auth-ob-hint">Nothing picked is fine too — Needt starts neutral.</span> : null}
                  </>) : null}

                  {step[0] === "setup" ? (<>
                    <span className="px-kicker auth-onboarding-el-2">Calendar · pick any, or skip</span>
                    <div className="auth-stack-6">
                      {CALS.map(([id, t, s, a], n) => (
                        <AxRow key={id} compact art={a} title={t} sub={s} multi={id !== "skip"} cal={id}
                          on={id === "skip" ? cal.skip : cal.link[id] === "on" || cal.link[id] === "waiting"}
                          status={id === "skip" ? null : cal.link[id] === "on" ? null : cal.link[id] || null}
                          note={id !== "skip" && cal.link[id] && window.CAL_CONNECT_NOTE[cal.link[id]] ? window.CAL_CONNECT_NOTE[cal.link[id]](id) : null}
                          onClick={() => cal.toggle(id)} delay={60 + n * 40} />
                      ))}
                      {offline ? (
                        <p className="auth-cal-offline" role="status" data-auth-offline>
                          {window.StGlyph ? <window.StGlyph name="cloud-off" size={13} /> : null}
                          <span>You’re offline — Needt connects {cal.picked.length ? "these calendars" : "a calendar"} once you’re back. Your picks are kept.</span>
                        </p>
                      ) : null}
                    </div>
                    <span className="px-kicker auth-onboarding-el-2 auth-ob-gap">Working hours</span>
                    <div className="auth-ob-hours nx-swap" style={{ animationDelay: "220ms" }}>
                      <div className="auth-ob-line">
                        <span className="auth-ob-label">Day</span>
                        <ObSelect label="Day starts" value={start} options={OB_TIMES.map((t) => [t, t])} onChange={setStart} />
                        <span className="auth-ob-to">to</span>
                        <ObSelect label="Day ends" value={end} invalid={badHours} options={OB_TIMES.map((t) => [t, t])} onChange={setEnd} />
                      </div>
                      {badHours ? <AxError>The day has to end at least an hour after it starts.</AxError> : null}
                      <div className="auth-ob-line">
                        <span className="auth-ob-label">Time zone</span>
                        <ObSelect wide label="Time zone" value={tz} options={OB_ZONES} onChange={setTz} />
                      </div>
                      <span className="auth-ob-hint" data-ob-zone={zone.iana}>{tz === zone.key ? "Found from this device (" + zone.iana.replace(/_/g, " ") + ")." : "This device says " + zone.iana.replace(/_/g, " ") + "."} Needt only places work inside these hours.</span>
                    </div>
                  </>) : null}

                  {step[0] === "sidebar" ? <ObSidebarGame order={tiles} onOrder={setTiles} /> : null}

                  {step[0] === "first" ? (<>
                    <span className="px-kicker auth-onboarding-el-2">New task</span>
                    {/* The real Composer, held in place by .auth-composer (auth.css):
                        no scrim, no Cancel, no kind switch — this step makes a task. */}
                    <div className="auth-composer" data-ob-composer>
                      {Composer ? <Composer open from={null} onClose={() => {}} onCreate={created} /> : null}
                    </div>
                    <span className="auth-ob-hint">Press Enter to add it — Needt finds it a free slot in your hours.</span>
                  </>) : null}

                  {step[0] === "placed" && shown ? (<>
                    <span className="px-kicker auth-onboarding-el-2">{obWeekday(shown.slot.day, "short") + " " + N.dayLabel(shown.slot.day)} · your hours {N.hhmm(shown.slot.start)}–{N.hhmm(shown.slot.end)}</span>
                    <ObDay slot={shown.slot} task={shown.task} minutes={shown.minutes} />
                    <p className="auth-ob-why" data-ob-reason>
                      <Icon name="sparkles" size={14} />
                      <span>{shown.reason}</span>
                    </p>
                  </>) : null}
                </div>

                <div className="auth-onboarding-row-6">
                  {i > 0 ? <button type="button" className="axs-back" data-axs-back onClick={() => go(i - 1)}><Icon name="arrow-left" size={15} />Back</button> : null}
                  <span className="auth-onboarding-text-10" />
                  {step[0] === "sidebar" ? (<>
                    <button type="button" className="nx-btn nx-btn-text" data-ob-sb-reset disabled={!tilesChanged} onClick={() => setTiles(tilesDefault.slice())}>Reset</button>
                    <button type="button" className="nx-btn nx-btn-text" data-ob-sb-skip onClick={() => { setTiles(tilesDefault.slice()); if (S) S.set("sidebarTiles", tilesDefault.slice()); setDir(1); setI(i + 1); }}>Skip</button>
                  </>) : null}
                  {step[0] === "first"
                    ? <button type="button" className="nx-btn nx-btn-text" data-ob-skip-task onClick={() => finish()}>Skip — open Needt</button>
                    : step[0] === "placed"
                      ? <button type="button" className="nx-btn nx-btn-primary axs-go" data-axs-next onClick={() => finish()}>{planning ? "Opening…" : "Open my day"}</button>
                      : <button type="button" className="nx-btn nx-btn-primary axs-go" data-axs-next disabled={step[0] === "setup" && badHours} onClick={() => go(i + 1)}>Continue</button>}
                </div>
              </div>
            </Print>
          </div>
        </div>
      </Scene>
    </div>
  );
}

Object.assign(window, { AuthScreen, OnboardingScreen, needtFirstTask });
