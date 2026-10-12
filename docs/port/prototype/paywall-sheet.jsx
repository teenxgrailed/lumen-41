/* PAYWALL SHEET — the upgrade sheet itself (Paywall, its plans, scene and
   features), the mini Needt UI used on its glass cards (and by auth and
   onboarding), and PwHost, which openPaywall() mounts. Split from
   paywall.jsx (08.10.26) so the lazy build loads it on demand; pricing, plan
   state, openPaywall/closePaywall and the Pro badges stay in paywall.jsx. */

const pwNS = window.NeedtDesignSystem_25d3c8 || {};
const PwIcon = pwNS.Icon || (() => null);

/* ── Mini Needt UI, for prints ─────────────────────────────────────────── */
function PwMiniTask({ title, chip, done, style }) {
  return (
    <span className="pw-mini" style={style}>
      <span className={"pw-check" + (done ? " is-done" : "")}>{done ? <PwIcon name="check" size={9} /> : null}</span>
      <span style={done ? { color: "var(--mock-done-ink)", textDecoration: "line-through" } : null}>{title}</span>
      {chip ? <span className="pw-chip">{chip}</span> : null}
    </span>
  );
}
function PwMiniEvent({ time, title, hue, style }) {
  const h = hue || "var(--demo-hue-orange)";
  return (
    <span className="pw-mini" style={Object.assign({ background: "color-mix(in oklab, " + h + " 10%, var(--color-white))", gap: 8 }, style)}>
      <span className="pw-mini-event-el" style={{ background: h }} />
      <span className="pw-mini-event-text">{time}</span>
      <span>{title}</span>
    </span>
  );
}
function PwMiniHabit({ title, streak, days, style }) {
  const d = days || [1, 1, 1, 0, 1, 1, 1];
  return (
    <span className="pw-mini" style={style}>
      <span className="pw-mini-habit-row">
        {d.map((on, i) => <span key={i} className="pw-mini-habit-el" style={{ background: on ? "var(--demo-hue-green)" : "var(--mock-habit-off)" }} />)}
      </span>
      <span>{title}</span>
      {streak ? <span className="pw-chip pw-mini-habit-el-2">{streak}</span> : null}
    </span>
  );
}
function PwNoteCard({ width, style, className }) {
  const G = window.GlassCard;
  if (!G) return null;
  return (
    <G width={width || 176} pad={14} radius={18} caption="Daily note" className={className} style={style}>
      <span className="pw-note-card-col">
        <span className="pw-note-card-text">TUE · 1 SEP</span>
        <span className="pw-note-card-text-2">Shoot day</span>
        {[["Charge the flash", true], ["Scout Kreis 4", false], ["Reply to Tom", false]].map(([t, d]) => (
          <span key={t} className="pw-note-card-row" style={{ color: d ? "var(--text-tertiary)" : "var(--text-primary)", textDecoration: d ? "line-through" : "none" }}>
            <span className={("pw-check" + (d ? " is-done" : "")) + " pw-note-card-el"} style={{ boxShadow: d ? "none" : "var(--text-tertiary) 0 0 0 1.5px inset", background: d ? "var(--text-primary)" : "transparent" }}>{d ? <PwIcon name="check" size={8} /> : null}</span>{t}
          </span>
        ))}
        <span className="pw-note-card-el-2" />
        <span className="pw-note-card-el-3" />
      </span>
    </G>
  );
}
function PwDateCard({ width, style, className, event }) {
  const G = window.GlassCard;
  if (!G) return null;
  return (
    <G width={width || 120} pad={0} radius={18} className={className} style={style}>
      <span className="pw-date-card-col">
        <span className="pw-date-card-grid">SEP</span>
        <span className="px-display pw-date-card-text">1</span>
        <span className="pw-date-card-el">Tuesday</span>
        {event === false ? null : (
          <span className="pw-date-card-el-2">14:00 Shoot</span>
        )}
      </span>
    </G>
  );
}
function PwMoodPrint({ width, height, style, className }) {
  const G = window.GlassCard;
  if (!G) return null;
  const w = width || 168, h = height || 118;
  return (
    <G pad={6} radius={18} caption="Moodboard" className={className} style={Object.assign({ width: w + 12 }, style)}>
      <span aria-label="A moodboard" className="pw-mood-print-grid" style={{ width: w, height: h }}>
        <span className="pw-mood-print-el" />
        <span className="pw-mood-print-el-2" />
        <span className="pw-mood-print-el-3" />
      </span>
    </G>
  );
}

/* ── The sheet ─────────────────────────────────────────────────────────── */
/* cycle names: "monthly" | "annual" (Pro yearly) | "lifetime". */
const pwCycle = (c) => (c === "monthly" || c === "lifetime" ? c : "annual");

/* 08.10.26 (owner): one Pro card with a Monthly / Yearly switch instead of
   two cards; the price always reads per month (yearly = $59 / 12). Lifetime
   stays its own card. pick is still "monthly" | "annual" | "lifetime". */
function PwPlans({ pick, onPick, phone }) {
  const Badge = window.PxBadge, G = window.GlassCard || ((pr) => <div className={(pr.className) + " pw-plans-box"} onClick={pr.onClick} style={{ padding: pr.pad, borderRadius: pr.radius }}>{pr.children}</div>);
  const P = NEEDT_PRICING, D = window.needtPrice;
  const pad = phone ? 16 : 22, rad = phone ? 20 : 24;
  const lastPro = React.useRef(pick === "monthly" ? "monthly" : "annual");
  if (pick === "monthly" || pick === "annual") lastPro.current = pick;
  const cyc = lastPro.current, proOn = pick !== "lifetime";
  const radio = (on) => <span className={"pw-radio" + (on ? " is-on" : "")} aria-hidden="true" />;
  const seg = (id, label, extra) => (
    <button type="button" role="radio" aria-checked={cyc === id} data-pw-cycle={id}
      className={"pw-seg-b" + (cyc === id ? " is-on" : "")}
      onClick={(e) => { e.stopPropagation(); lastPro.current = id; onPick(id); }}>{label}{extra}</button>
  );
  const pro = (
    <G key="pro" best={proOn} pad={pad} radius={rad} className={"pw-plan pw-plan-pro" + (proOn ? " is-picked" : "")} data-pw-plan={cyc}
      onClick={() => onPick(cyc)} label={"Pro " + (cyc === "monthly" ? "monthly" : "yearly")} aria-pressed={proOn}>
      <span className="pw-name">{radio(proOn)}Pro
        <span className="pw-seg" role="radiogroup" aria-label="Billing">
          {seg("monthly", "Monthly")}
          {seg("annual", "Yearly", <span className="pw-seg-save" data-pw-save>−{D.savePct}%</span>)}
        </span>
      </span>
      <span className="pw-price"><span className="px-display" data-pw-price={cyc}>{cyc === "monthly" ? D.monthly : D.yearlyPerMonth}</span><span className="pw-per">/ month</span></span>
      <span className="pw-sub">{cyc === "monthly" ? "Billed monthly · cancel any time" : <>Billed {D.yearly} yearly · <b className="pw-save">save {D.saveAmount}</b></>}</span>
    </G>
  );
  const pctLeft = Math.round(P.lifetimeLeft / P.lifetimeCap * 100);
  const lifetime = (
    <G key="lifetime" best={pick === "lifetime"} pad={pad} radius={rad} className={"pw-plan" + (pick === "lifetime" ? " is-picked" : "")} data-pw-plan="lifetime"
      onClick={() => onPick("lifetime")} label="Lifetime" aria-pressed={pick === "lifetime"}>
      <span className="pw-name">{radio(pick === "lifetime")}Lifetime
        {Badge ? <Badge style={{ marginLeft: "auto" }}>Limited</Badge> : null}</span>
      <span className="pw-price"><span className="px-display" data-pw-price="lifetime">{D.lifetime}</span><span className="pw-per">one-time</span></span>
      <span className="pw-sub">For the first {P.lifetimeCap} people</span>
      <span className="pw-meter" data-pw-left><span className="pw-meter-bar"><span style={{ width: pctLeft + "%" }} /></span><span className="pw-meter-t">{D.lifetimeLeftLine}</span></span>
    </G>
  );
  return <div className="pw-plans" role="group" aria-label="Plans">{pro}{lifetime}</div>;
}

function PwFreeLine() {
  return (
    <div className="pw-freeline" data-pw-free>
      <span className="pw-freeline-tag">Current plan</span>
      <span><b>Free</b> — {PW_FREE.join(", ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}. Yours to keep.</span>
    </div>
  );
}

function PwFeatures({ phone }) {
  const G = window.GlassCard || ((pr) => <div className={pr.className}>{pr.children}</div>);
  return (
    <G pad={phone ? 16 : 20} radius={phone ? 20 : 24} className="pw-feats-card">
      <span className="pw-kick">Every Pro plan includes</span>
      <ul className="pw-list pw-feats">
        {PW_PRO.map(([t, n]) => (
          <li key={t}><span className="pw-ck"><PwIcon name="check" size={11} /></span><span>{t}{n ? <span className="pw-note"> — {n}</span> : null}</span></li>
        ))}
      </ul>
    </G>
  );
}

function pwCtaFor(pick) {
  const D = window.needtPrice;
  if (pick === "lifetime") return { label: "Get Lifetime · " + D.lifetime, sub: "One payment · Pro for good" };
  /* 08.10.26: no "then $59/year" — it read as an automatic charge. Say what
     really happens: Free again, unless the person picks the plan. */
  return { label: D.trialCta, sub: D.trialShort + ". " + D.trialAfter };
}
function PwGo({ pick, onCheckout, disabled, status }) {
  const c = pwCtaFor(pick);
  return (
    <div className="pw-go">
      <button type="button" className="pw-btn is-primary pw-btn-lg" data-pw-cta={pick} disabled={disabled} onClick={() => onCheckout(pick)}>{c.label}</button>
      {status || <span className="pw-go-sub" data-pw-cta-sub>{c.sub}</span>}
    </div>
  );
}
/* States (07.10.26): offline — the CTA is off and one quiet line says why;
   checkout error — "Checkout couldn't start" with Retry. Both read
   window.needtStates for screen "paywall" (try needtStates.set("offline", true)
   or needtStates.set("load", "error", "paywall"), then press the CTA). */
function PwStatus({ kind, onRetry, retrying }) {
  const G = window.StGlyph;
  if (kind === "offline") return (
    <div className="pw-state is-offline" role="status" data-pw-offline>
      {G ? <G name="cloud-off" size={14} /> : null}<span>You’re offline — checkout needs a connection. Your plan hasn’t changed.</span>
    </div>);
  return (
    <div className="pw-state is-error" role="alert" data-pw-error>
      {G ? <G name="alert" size={14} /> : null}
      <span className="pw-state-t"><b>Checkout couldn’t start.</b> Check your connection and try again — you haven’t been charged.</span>
      <button type="button" className="pw-btn is-secondary pw-state-btn" data-pw-retry disabled={retrying} onClick={onRetry}>
        {retrying ? <span className="pw-spin" aria-hidden="true" /> : null}{retrying ? "Retrying" : "Retry"}</button>
    </div>);
}

/* Opened from a locked feature: one line at the top names it. */
function PwFeatureLine({ feature }) {
  if (!feature) return null;
  return (
    <span className="pw-feature" data-pw-feature={feature}>
      <PwIcon name="lock" size={12} /><span>Unlock <b>{feature}</b> with Pro</span>
    </span>
  );
}
function PwScene({ phone, onClose, feature }) {
  return (
    <div className="pw-top">
      <div className="pw-scene-abs">
        <button type="button" className="pw-x px-chip-btn" aria-label="Close" data-pw-close onClick={onClose}
          style={phone ? { top: 58, left: 14 } : { top: 14, right: 14 }}><PwIcon name="x" size={15} /></button>
        {phone ? (
          <>
            <div className="pw-collage pw-scene-abs-2" aria-hidden="true">
              <span className="pw-print-in pw-scene-abs-3" style={{ animationDelay: "60ms" }}><PwMoodPrint width={112} height={78} /></span>
              <span className="pw-print-in pw-scene-abs-4" style={{ animationDelay: "120ms" }}><PwDateCard width={88} event={false} /></span>
              <span className="pw-print-in pw-scene-abs-5" style={{ animationDelay: "180ms" }}><PwMiniTask title="Plan my day" chip="AI" style={{ boxShadow: "var(--mock-shadow-a30) 0 10px 22px -8px" }} /></span>
            </div>
            <div data-px-calm className="pw-scene-abs-6">
              <PwFeatureLine feature={feature} />
              <span className="pw-brand">{window.NeedtAppIcon ? <window.NeedtAppIcon size={44} /> : null}<span className="px-kicker">Needt Pro</span></span>
              <h2 className="px-display px-on-sky pw-h pw-scene-text">Get <em>more</em><br />out of Needt</h2>
            </div>
          </>
        ) : (
          <div className="pw-scene-abs-7">
            <div data-px-calm className="pw-scene-col">
              <PwFeatureLine feature={feature} />
              <span className="pw-brand">{window.NeedtAppIcon ? <window.NeedtAppIcon size={44} /> : null}<span className="px-kicker">Needt Pro</span></span>
              <h2 className="px-display px-on-sky pw-h pw-h-desk">Get <em>more</em><br />out of Needt</h2>
              <span className="px-on-sky pw-scene-text-2">
                AI planning, every connection and the themes — free for {NEEDT_PRICING.trialDays} days, no card needed. Then back to Free unless you choose a plan.</span>
            </div>
            <div className="pw-collage pw-scene-box" aria-hidden="true">
              <span className="pw-print-in pw-scene-abs-8" style={{ animationDelay: "80ms" }}><PwMoodPrint width={138} height={96} /></span>
              <span className="pw-print-in pw-scene-abs-9" style={{ animationDelay: "160ms" }}><PwNoteCard width={164} /></span>
              <span className="pw-print-in pw-scene-abs-10" style={{ animationDelay: "240ms" }}><PwDateCard width={96} event={false} /></span>
              <span className="pw-print-in pw-scene-abs-11" style={{ animationDelay: "300ms" }}>
                <PwMiniTask title="Plan my day" chip="AI" style={{ boxShadow: "var(--mock-shadow-a30) 0 12px 24px -8px, var(--mock-shadow-a12) 0 0 0 .5px" }} />
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function PwSky({ phone }) {
  const Sky = window.PxSky;
  return Sky ? <div className="pw-sky"><Sky variant="b" intensity={phone ? 1 : 1.05} /></div> : null;
}

function Paywall({ open, phone, onClose, onCheckout, cycle: cycle0, feature }) {
  pwEnsureCss();
  if (window.pxEnsureCss) window.pxEnsureCss();
  const [pick, setPick] = React.useState(pwCycle(cycle0));
  const [leaving, setLeaving] = React.useState(false);
  const [shown, setShown] = React.useState(!!open);
  React.useEffect(() => { if (open) { setShown(true); setLeaving(false); if (cycle0) setPick(pwCycle(cycle0)); } else if (shown && !phone) {
    setLeaving(true); const id = window.setTimeout(() => { setShown(false); setLeaving(false); }, 170); return () => window.clearTimeout(id); } }, [open]);
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose && onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  const st = typeof useStStates === "function" ? useStStates("paywall") : null;
  const offline = !!(st && st.offline);
  const failing = () => !!(window.needtStates && window.needtStates.get("paywall").load === "error");
  const [err, setErr] = React.useState(false);
  const [retrying, setRetrying] = React.useState(false);
  React.useEffect(() => { if (open) { setErr(false); setRetrying(false); } }, [open]);
  const checkout = (c) => {
    if (offline || retrying) return;
    if (failing()) { setErr(true); return; }
    setErr(false);
    if (onCheckout) onCheckout(c);
  };
  const retry = () => {
    if (retrying) return;
    setRetrying(true);
    if (failing() && window.needtStates) window.needtStates.retry("paywall");
    window.setTimeout(() => {
      setRetrying(false);
      if (failing()) { setErr(true); return; }
      setErr(false);
      if (onCheckout) onCheckout(pick);
    }, 1300);
  };
  const status = offline ? <PwStatus kind="offline" /> : err ? <PwStatus kind="error" onRetry={retry} retrying={retrying} /> : null;
  const foot = <div className="pw-foot" data-pw-foot>{window.needtPrice.footnote}</div>;

  if (phone) {
    const c = pwCtaFor(pick);
    return (
      <div className="pw-phone" data-px-scope data-pw-open={open ? "1" : "0"} role="dialog" aria-modal="true" aria-label="Needt Pro" aria-hidden={!open}
        style={{ transform: open ? "none" : "translateY(102%)", pointerEvents: open ? "auto" : "none" }}>
        {open || shown ? <PwSky phone /> : null}
        <PwScene phone onClose={onClose} feature={feature} />
        <div className="pw-body scroll-inner">
          <PwFreeLine />
          <PwPlans phone pick={pick} onPick={setPick} />
          <div className="pw-paywall-text"><PwFeatures phone /></div>
          {foot}
        </div>
        <div className="pw-bar">
          {status}
          <button type="button" className="pw-btn is-primary" data-pw-cta={pick} disabled={offline} onClick={() => checkout(pick)}>{c.label}</button>
          <span className="pw-go-sub" data-pw-cta-sub>{c.sub}</span>
        </div>
      </div>
    );
  }
  if (!shown) return null;
  return (
    <div className={"pw-scrim" + (leaving ? " is-leaving" : "")} data-pw-open="1" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div className="pw-sheet" data-px-scope role="dialog" aria-modal="true" aria-label="Needt Pro">
        <PwSky />
        <PwScene onClose={onClose} feature={feature} />
        <div className="pw-body scroll-inner">
          <PwFreeLine />
          <PwPlans pick={pick} onPick={setPick} />
          <PwGo pick={pick} onCheckout={checkout} disabled={offline} status={status} />
          <div className="pw-paywall-text-2"><PwFeatures /></div>
        </div>
        {foot}
      </div>
    </div>
  );
}

/* ── Desktop host: one paywall for the whole window ───────────────────── */
function PwHost() {
  const [st, setSt] = React.useState({ open: pwStore.open, cycle: pwStore.cycle, feature: pwStore.feature });
  React.useEffect(() => { pwStore.subs.push(setSt); return () => { pwStore.subs = pwStore.subs.filter((f) => f !== setSt); }; }, []);
  const target = document.querySelector(".app") || document.body;
  return ReactDOM.createPortal(
    <Paywall open={st.open} cycle={st.cycle} feature={st.feature} onClose={() => window.closePaywall()}
      onCheckout={(c) => {
        /* Prototype: the trial starts at once (no card); Lifetime would open checkout. */
        if (c === "lifetime") { if (window.toast) window.toast("Checkout opens here — prototype"); return; }
        needtPlan.set("trial"); window.closePaywall();
        if (window.toast) window.toast("Pro trial started — " + NEEDT_PRICING.trialDays + " days, no card. We’ll remind you 3 days before it ends.");
      }} />, target);
}
Object.assign(window, { Paywall, PwMiniTask, PwMiniEvent, PwMiniHabit, PwNoteCard, PwDateCard, PwMoodPrint });
