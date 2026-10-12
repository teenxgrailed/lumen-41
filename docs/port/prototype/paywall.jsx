/* PAYWALL — Needt Pro (07.10.26).
   The whole sheet stands on the painted sky (scenes.jsx): the headline and a
   few glass cards of the product (a daily note, a calendar date, a
   moodboard) on top. Below: Free as a quiet "current plan" line, then three
   selectable Craft-style glass cards — Pro Monthly, Pro Yearly ("Best value"
   pill, "Save 30%"), Lifetime (limited, remaining counter) — one CTA
   ("Start 14-day free trial", or "Get Lifetime") with the line under it that
   says what happens after the trial (back to Free unless you pick a plan,
   a reminder 3 days before — 08.10.26), the Pro
   features, and "Prices in USD. Taxes may apply." Prices come from
   window.NEEDT_PRICING (formatted strings in window.needtPrice). No payment
   happens — the CTA only says where the checkout would open.

   API
     window.openPaywall({ cycle: "annual" | "monthly" | "lifetime" })  (preselects a card)  — desktop: mounts
       itself (a portal into .app, so it wears the current theme).
     window.closePaywall()
     <window.Paywall open phone onClose onCheckout cycle />  — the component;
       Mobile.jsx renders it with `phone` as a full-screen sheet.
   The sheet itself (Paywall, PwHost) and the mini Needt UI used on glass
   cards elsewhere (auth, onboarding) — PwMiniTask, PwMiniEvent, PwMiniHabit,
   PwNoteCard, PwDateCard, PwMoodPrint — live in paywall-sheet.jsx, which the
   built app loads on demand. */

const pwNS = window.NeedtDesignSystem_25d3c8 || {};
const PwIcon = pwNS.Icon || (() => null);

/* Pricing — one source for desktop, Settings and Mobile.jsx. */
const NEEDT_PRICING = window.NEEDT_PRICING = { currency: "USD", monthly: 7, yearly: 59, lifetime: 149, lifetimeCap: 300, lifetimeLeft: 212, trialDays: 14 };
const pwMoney = (n) => "$" + (Number.isInteger(n) ? String(n) : n.toFixed(2));
const PW_DERIVED = (() => {
  const P = NEEDT_PRICING, full = P.monthly * 12, save = full - P.yearly;
  return { yearlyPerMonth: pwMoney(P.yearly / 12), saveAmount: pwMoney(save), savePct: Math.round(save / full * 100) };
})();
/* window.needtPrice — formatted strings for every surface. */
window.needtPrice = Object.assign({ fmt: pwMoney,
  monthly: pwMoney(NEEDT_PRICING.monthly), yearly: pwMoney(NEEDT_PRICING.yearly), lifetime: pwMoney(NEEDT_PRICING.lifetime),
  lifetimeLeftLine: NEEDT_PRICING.lifetimeLeft + " of " + NEEDT_PRICING.lifetimeCap + " left",
  trialCta: "Start " + NEEDT_PRICING.trialDays + "-day free trial", trialSub: "No card needed",
  /* What happens when the trial ends — one sentence for every surface that
     offers the trial (paywall, Settings → Plan, phone). Nothing is charged. */
  trialAfter: "When the trial ends you go back to Free unless you choose a plan — we’ll remind you 3 days before.",
  trialShort: NEEDT_PRICING.trialDays + " days free · no card needed",
  footnote: "Prices in USD. Taxes may apply." }, PW_DERIVED);

/* Plan state (prototype): free | trial | monthly | yearly | lifetime.
   window.needtPlan.get()/set(s)/subscribe(fn); window.useNeedtPlan() hook;
   window.needtPlanInfo(s) → { name, line, badge }. */
const PW_PLAN_KEY = "needt.plan.state";
const PW_TRIAL_LEFT = 9;
const pwPlanSubs = new Set();
const pwRaw = (k) => { if (window.needtSync) return window.needtSync.getRaw(k); try { return localStorage.getItem(k); } catch (e) { return null; } };
/* A flag (dismissed card) as live state: another window's dismissal hides it here too. */
function pwUseFlag(key) {
  const [on, setOn] = React.useState(() => pwRaw(key) === "1");
  React.useEffect(() => (window.needtSync ? window.needtSync.subscribe(key, () => setOn(pwRaw(key) === "1")) : undefined), [key]);
  return [on, () => { if (window.needtSync) window.needtSync.set(key, "1"); }];
}
const needtPlan = {
  states: ["free", "trial", "monthly", "yearly", "lifetime"],
  get() { const v = pwRaw(PW_PLAN_KEY); return needtPlan.states.indexOf(v) >= 0 ? v : "free"; },
  /* "pro" is accepted as a shorthand for a paid Pro plan (yearly). Persisted
     through needtSync; subscribers hear this window's and other windows' changes. */
  set(v) { if (v === "pro") v = "yearly"; if (window.needtSync) window.needtSync.set(PW_PLAN_KEY, v); else pwPlanSubs.forEach((f) => f(v)); },
  subscribe(f) { pwPlanSubs.add(f); return () => pwPlanSubs.delete(f); },
  trialDaysLeft: PW_TRIAL_LEFT
};
if (window.needtSync) window.needtSync.subscribe(PW_PLAN_KEY, () => { const v = needtPlan.get(); pwPlanSubs.forEach((f) => f(v)); });
function useNeedtPlan() {
  const [v, setV] = React.useState(needtPlan.get);
  React.useEffect(() => needtPlan.subscribe(setV), []);
  return [v, needtPlan.set];
}
function needtPlanInfo(s) {
  const D = window.needtPrice;
  switch (s) {
    case "trial": return { name: "Pro trial · " + PW_TRIAL_LEFT + " days left", line: "No card on file — you go back to Free when it ends unless you pick a plan.", badge: "Trial", pro: true };
    case "monthly": return { name: "Pro monthly", line: D.monthly + " / month · renews 7 Nov", badge: "Pro", pro: true };
    case "yearly": return { name: "Pro yearly", line: D.yearly + " / year (" + D.yearlyPerMonth + "/mo) · renews 7 Oct 2027", badge: "Pro", pro: true };
    case "lifetime": return { name: "Lifetime · thank you", line: "Paid once, " + D.lifetime + ". Pro for good.", badge: "Lifetime", pro: true };
    default: return { name: "Free", line: "Tasks, calendar, docs and one mail account.", badge: "Free", pro: false };
  }
}
function useNeedtPro() { const [p] = useNeedtPlan(); return !!needtPlanInfo(p).pro; }
Object.assign(window, { needtPlan, useNeedtPlan, needtPlanInfo, useNeedtPro });

const PW_FREE = ["Tasks and projects", "Calendar", "Docs", "1 mail account"];
const PW_PRO = [
  ["AI planning", "Plan my day and Ask Needt"],
  ["Every connection", "Mail, calendars, files — and MCP"],
  ["Unlimited moodboards", "With sharing"],
  ["Document themes", "And the Time theme"],
  ["Priority sync", null]
];

const PW_CSS = `
.pw-scrim { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center; background: var(--paywall-scrim); }
.pw-sheet { position: relative; isolation: isolate; width: min(880px, calc(100vw - 64px)); max-height: calc(100vh - 48px); display: flex; flex-direction: column;
  border-radius: 24px; overflow: hidden; background: var(--px-ground, var(--sky-brand-mid)); box-shadow: var(--black-a45) 0 40px 90px -20px, var(--black-a20) 0 0 0 .5px; }
.pw-sky { position: absolute; inset: 0; z-index: 0; }
.pw-top, .pw-body, .pw-foot, .pw-bar { position: relative; z-index: 1; }
.pw-top { flex: none; height: 290px; }
@media (max-height: 820px) { .pw-top { height: 250px; } }
.pw-x { position: absolute; z-index: 8; width: 30px; height: 30px; padding: 0; border-radius: 999px; }
.pw-h { margin: 0; }
.pw-h-desk { font-size: 60px; }
@media (max-height: 820px) { .pw-h-desk { font-size: 50px; } .pw-top .px-kicker { margin-top: 6px; } }
.pw-plans { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; padding: 22px 26px 8px; align-items: stretch; max-width: 820px; width: 100%; margin: 0 auto; box-sizing: border-box; }
.pw-seg { margin-left: auto; display: inline-flex; padding: 3px; gap: 2px; border-radius: 999px; background: var(--fill-2); box-shadow: var(--shadow-inset-ring); }
.pw-seg-b { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 11px; border: 0; border-radius: 999px; background: transparent; cursor: default;
  font: 500 12.5px/1 var(--font-sans); color: var(--text-secondary); transition: background-color 140ms ease, color 140ms ease, box-shadow 140ms ease; }
.pw-seg-b:hover { color: var(--text-primary); }
.pw-seg-b.is-on { background: var(--surface-raised); color: var(--text-primary); box-shadow: var(--shadow-raised); }
.pw-seg-b:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.pw-seg-save { font: 600 11px/1 var(--font-sans); color: var(--success); font-variant-numeric: tabular-nums; }
.pw-plan { position: relative; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; cursor: default; }
.pw-plan.is-yearly { padding-top: 26px !important; }
.pw-radio { flex: none; width: 16px; height: 16px; border-radius: 9px; box-shadow: var(--text-tertiary) 0 0 0 1.5px inset; transition: box-shadow 140ms ease; }
.pw-radio.is-on { box-shadow: var(--text-primary) 0 0 0 5px inset; }
.pw-save { font-weight: 600; color: var(--success); }
.pw-meter { display: flex; flex-direction: column; gap: 6px; margin-top: auto; }
.pw-meter-bar { display: block; height: 4px; border-radius: 2px; background: var(--fill-4); overflow: hidden; }
.pw-meter-bar > span { display: block; height: 100%; border-radius: 2px; background: var(--text-primary); }
.pw-meter-t { font: 600 11.5px/14px var(--font-sans); color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.pw-freeline { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 16px 26px 4px; font: 500 12.5px/16px var(--font-sans); color: var(--px-ink); text-shadow: 0 1px 2px var(--px-shadow), 0 0 12px var(--px-halo); text-align: center; }
.pw-freeline b { font-weight: 650; }
.pw-freeline-tag { flex: none; padding: 3px 8px; border-radius: 999px; background: var(--white-a22); box-shadow: var(--white-a45) 0 0 0 1px inset; font: 600 10px/12px var(--font-sans); letter-spacing: .08em; text-transform: uppercase; text-shadow: none; }
.pw-go { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 14px 26px 18px; }
.pw-btn-lg { height: 44px; min-width: 280px; padding: 0 22px; border-radius: 13px; font-size: 15px; font-weight: 600; box-shadow: var(--black-a18) 0 8px 20px -8px; }
.pw-go-sub { font: 500 12px/15px var(--font-sans); color: var(--px-ink); text-shadow: 0 1px 2px var(--px-shadow), 0 0 12px var(--px-halo); text-align: center; }
.pw-phone .pw-bar .pw-go-sub { color: var(--text-secondary); text-shadow: none; }
.pw-feats-card { display: flex; flex-direction: column; gap: 12px; }
.pw-feats { display: grid !important; grid-template-columns: 1fr 1fr; gap: 9px 18px !important; }
.pw-phone .pw-feats { grid-template-columns: 1fr; }
.pw-phone .pw-freeline { padding: 16px 16px 0; text-align: left; justify-content: flex-start; }
.pw-best { position: absolute; top: 0; left: 50%; transform: translate(-50%, -50%); padding: 6px 14px; border-radius: 9999px; background: var(--badge-strong-bg); color: var(--badge-strong-fg);
  font: 600 11px/13px var(--font-sans); letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
.pw-was { font: 500 14px/16px var(--font-sans); color: var(--text-tertiary); text-decoration: line-through; font-variant-numeric: tabular-nums; }
.pw-name { display: flex; align-items: center; gap: 8px; font: 600 15px/20px var(--font-sans); color: var(--text-primary); }
.pw-price { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.pw-price .px-display { font-size: 40px; line-height: 1; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.pw-price .pw-cur { font: 600 13px/1 var(--font-sans); color: var(--text-secondary); letter-spacing: .02em; }
.pw-price .pw-per { font: 400 13px/1 var(--font-sans); color: var(--text-tertiary); }
.pw-sub { font: var(--type-meta); color: var(--text-tertiary); min-height: 16px; }
.pw-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.pw-list li { display: flex; align-items: flex-start; gap: 9px; font: 400 13px/18px var(--font-sans); color: var(--text-primary); }
.pw-list li .pw-ck { flex: none; width: 16px; height: 16px; margin-top: 1px; display: grid; place-items: center; border-radius: 5px; background: var(--text-primary); color: var(--background); }
.pw-list li .pw-note { color: var(--text-tertiary); }
.pw-kick { font: 600 11px/14px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--text-tertiary); }
.pw-ctas { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.pw-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 14px; border: 0; border-radius: 11px; cursor: default;
  font: 500 13.5px/1 var(--font-sans); white-space: nowrap; transition: background-color 120ms ease, transform 90ms ease, box-shadow 120ms ease; }
.pw-btn:active { transform: scale(.97); }
.pw-btn.is-primary { background: var(--button-inverse-bg); color: var(--button-inverse-fg); }
.pw-btn.is-primary:hover { background: var(--button-inverse-bg-hover); }
.pw-btn.is-secondary { background: var(--surface-raised); color: var(--text-primary); box-shadow: var(--shadow-raised); }
.pw-btn.is-secondary:hover { background-image: linear-gradient(var(--fill-2), var(--fill-2)); }
.pw-current { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; border-radius: 11px; box-shadow: var(--border) 0 0 0 1px inset;
  font: 500 13px/1 var(--font-sans); color: var(--text-secondary); }
.pw-foot { flex: none; padding: 10px 24px 16px; font: 500 11.5px/15px var(--font-sans); color: var(--px-ink-2); text-align: center; text-shadow: 0 1px 2px var(--px-shadow), 0 0 12px var(--px-halo); }
.pw-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
/* The glass cards in the collage: real Needt UI at small scale. */
.pw-mini { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 10px; background: var(--color-white); color: var(--ink-fixed);
  box-shadow: var(--mock-shadow-a12) 0 0 0 .5px, var(--mock-shadow-a10) 0 2px 6px -2px; font: 500 12px/15px var(--font-sans); white-space: nowrap; }
.pw-mini .pw-chip { margin-left: auto; padding: 2px 6px; border-radius: 5px; background: var(--mock-chip-bg); color: var(--mock-chip-fg); font: 500 10.5px/13px var(--font-sans); }
.pw-check { flex: none; width: 13px; height: 13px; border-radius: 7px; box-shadow: var(--ink-fixed) 0 0 0 1.5px inset; }
.pw-check.is-done { background: var(--ink-fixed); box-shadow: none; display: grid; place-items: center; color: var(--color-white); }
/* Phone: a full-screen sheet inside the device. */
.pw-phone { position: absolute; inset: 0; z-index: 70; display: flex; flex-direction: column; isolation: isolate; overflow: hidden; background: var(--px-ground, var(--sky-brand-mid));
  transition: transform .32s cubic-bezier(0.2, 0.7, 0.2, 1); }
.pw-phone .pw-top { height: 340px; }
.pw-phone .pw-plans { grid-template-columns: 1fr; padding: 22px 16px 6px; gap: 14px; }
.pw-phone .pw-bar .pw-go-sub { display: block; }
.pw-phone .pw-bar { flex: none; display: flex; flex-direction: column; align-items: stretch; gap: 6px; padding: 12px 16px 26px;
  background-color: var(--white-a60); background-image: linear-gradient(var(--white-a0), var(--white-a80));
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); box-shadow: var(--color-white) 0 1px 0 0 inset, var(--black-a12) 0 -1px 0 0; }
.dark .pw-phone .pw-bar { background-color: var(--smoke-a55); background-image: linear-gradient(var(--smoke-a0), var(--smoke-a85)); box-shadow: var(--white-a8) 0 1px 0 0 inset; }
.pw-phone .pw-btn { height: 48px; border-radius: 14px; font-size: 15px; }
/* Promo cards (sidebar, mobile More, Settings): the sky fills the whole
   card; the words sit on it in white with a soft shadow. */
.pw-promo { position: relative; display: block; height: 100px; border-radius: 14px; overflow: hidden; cursor: default; isolation: isolate;
  box-shadow: var(--black-a8) 0 0 0 1px, var(--black-a6) 0 4px 12px -4px;
  transition: box-shadow 260ms cubic-bezier(0.2, 0.8, 0.2, 1), transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1); }
/* Hover / keyboard focus: the card lifts 2px on a softer, larger shadow; the
   sky inside parts its clouds and brightens (scenes.jsx), and the corner sun
   glow opens up. */
.pw-promo:hover, .pw-promo:focus-visible { transform: translateY(-2px); box-shadow: var(--black-a8) 0 0 0 1px, var(--black-a6) 0 4px 10px -4px, var(--black-a12) 0 14px 28px -10px; }
.pw-promo:active { transform: translateY(-1px) scale(.985); transition-duration: 90ms; }
.pw-promo-glow { position: absolute; inset: 0; pointer-events: none; z-index: 0; opacity: .55;
  background: radial-gradient(70% 90% at 100% 0%, var(--promo-glow) 0%, var(--promo-glow-0) 70%);
  transition: opacity 280ms cubic-bezier(0.2, 0.8, 0.2, 1); }
.pw-promo:hover .pw-promo-glow, .pw-promo:focus-visible .pw-promo-glow { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .pw-promo, .pw-promo-glow { transition: none; } .pw-promo:hover, .pw-promo:focus-visible { transform: none; } }
.pw-promo-in { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; padding: 12px 12px 11px; }
.pw-promo-head { display: flex; align-items: center; gap: 8px; }
.pw-promo-line { font: 500 12px/16px var(--font-sans); color: var(--px-ink); text-shadow: 0 1px 2px var(--px-shadow), 0 0 12px var(--px-halo); }
.pw-promo .pw-x { width: 22px; height: 22px; top: 8px; right: 8px; }
.pw-glass-in { -webkit-backdrop-filter: blur(24px) saturate(140%); backdrop-filter: blur(24px) saturate(140%); }
@keyframes pw-promo-out { to { opacity: 0; transform: translateY(6px) scale(.97); } }
.pw-promo.is-leaving { animation: pw-promo-out 180ms ease-in both; }
@keyframes pw-in { from { opacity: 0; transform: translateY(18px) scale(.97); } to { opacity: 1; transform: none; } }
@keyframes pw-out { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(10px) scale(.98); } }
@keyframes pw-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes pw-fade-out { from { opacity: 1; } to { opacity: 0; } }
.pw-scrim { animation: pw-fade 220ms ease both; } .pw-scrim.is-leaving { animation: pw-fade-out 170ms ease-in both; }
.pw-sheet { animation: pw-in 320ms cubic-bezier(0.2, 0.9, 0.24, 1) both; } .pw-scrim.is-leaving .pw-sheet { animation: pw-out 170ms ease-in both; }
.pw-print-in { animation: pw-in 520ms cubic-bezier(0.2, 0.9, 0.24, 1) both; }
@media (max-width: 760px) { .pw-plans { grid-template-columns: 1fr; } .pw-collage { display: none; } }
@media (prefers-reduced-motion: reduce) { .pw-scrim, .pw-sheet, .pw-print-in, .pw-scrim.is-leaving .pw-sheet { animation-duration: 1ms !important; } .pw-phone { transition: none; } }
`;
let pwCssDone = false;
function pwEnsureCss() {
  if (pwCssDone || typeof document === "undefined") return;
  pwCssDone = true;
  const s = document.createElement("style");
  s.setAttribute("data-pw", "");
  s.textContent = PW_CSS;
  document.head.appendChild(s);
}

const pwStore = { open: false, cycle: "annual", feature: null, subs: [] };
function pwEmit() { pwStore.subs.forEach((f) => f({ open: pwStore.open, cycle: pwStore.cycle, feature: pwStore.feature })); }
let pwRoot = null;
/* openPaywall()                       — plain
   openPaywall("Plan my day")         — from a locked feature: the sheet opens
                                        with "Unlock Plan my day with Pro"
   openPaywall({ cycle, feature })    — both */
function openPaywall(opts) {
  if (typeof opts === "string") opts = { feature: opts };
  pwStore.open = true;
  pwStore.cycle = (opts && opts.cycle) || "annual";
  pwStore.feature = (opts && opts.feature) || null;
  if (!pwRoot) {
    const d = document.createElement("div");
    d.id = "pw-host";
    document.body.appendChild(d);
    pwRoot = ReactDOM.createRoot(d);
    pwRoot.render(<PwHost />);
  }
  pwEmit();
}
function closePaywall() { pwStore.open = false; pwEmit(); }

/* ── Pro gating (08.10.26) ─────────────────────────────────────────────────
   One set of pieces for every place a Pro feature shows up:
     <ProBadge size="sm|md" locked />   the black "PRO" pill (promo-pill black);
                                        locked adds the lock glyph.
     <ProUpsell id title line cta feature />
                                        the one soft card a screen may carry —
                                        Free only, dismissible for good
                                        (needtSync needt.upsellDismissed.<id>).
     <ProLimit used max noun feature /> "1 of 1 mail accounts · Upgrade for more".
   Never modal on load: only a click opens the paywall. */
function ProBadge({ size, locked, className, title }) {
  const sm = size === "sm";
  return (
    <span className={"pro-badge" + (sm ? " is-sm" : "") + (locked ? " is-locked" : "") + (className ? " " + className : "")}
      data-pro-badge={locked ? "locked" : "on"} title={title} aria-label={locked ? "Pro feature — locked" : "Pro feature"}>
      {locked ? <PwIcon name="lock" size={sm ? 8 : 9} /> : null}PRO
    </span>
  );
}
const PW_UPSELL_KEY = "needt.upsellDismissed.";
function ProUpsell({ id, title, line, cta, feature, className }) {
  pwEnsureCss();
  const pro = useNeedtPro();
  const [stored, keep] = pwUseFlag(PW_UPSELL_KEY + id);
  const [hidden, setGone] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const gone = stored || hidden;
  if (pro || gone) return null;
  const dismiss = (e) => {
    e.stopPropagation();
    setLeaving(true);
    window.setTimeout(() => { setGone(true); keep(); }, 180);
  };
  return (
    <div className={"pro-upsell nx-swap" + (leaving ? " is-leaving" : "") + (className ? " " + className : "")} data-pro-upsell={id} role="note">
      <span className="pro-upsell-mark" aria-hidden="true"><PwIcon name="sparkles" size={15} /></span>
      <span className="pro-upsell-text">
        <span className="pro-upsell-title">{title}<ProBadge size="sm" /></span>
        {line ? <span className="pro-upsell-line">{line}</span> : null}
      </span>
      <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm pro-upsell-cta" data-pro-upsell-cta={id} onClick={() => openPaywall(feature)}>{cta || "Try Pro free"}</button>
      <button type="button" className="pro-upsell-x" aria-label="Dismiss" data-pro-upsell-x={id} onClick={dismiss}><PwIcon name="x" size={13} /></button>
    </div>
  );
}
function ProLimit({ used, max, noun, feature, className }) {
  const pro = useNeedtPro();
  if (pro) return null;
  const over = used > max;
  return (
    <span className={"pro-limit" + (used >= max ? " is-full" : "") + (className ? " " + className : "")} data-pro-limit={noun}>
      <span>{over ? used + " " + noun + " · Free includes " + max : used + " of " + max + " " + noun}</span>
      {used >= max ? <button type="button" className="pro-limit-up" onClick={(e) => { e.stopPropagation(); openPaywall(feature); }}>Upgrade for more</button> : null}
    </span>
  );
}

/* ── Sidebar promo card ─────────────────────────────────────────────────── */
const PW_PROMO_KEY = "needt.promo.dismissed";
function PwPromoCard() {
  pwEnsureCss();
  const [stored, keep] = pwUseFlag(PW_PROMO_KEY);
  const [hidden, setGone] = React.useState(false);
  const gone = stored || hidden;
  const [leaving, setLeaving] = React.useState(false);
  const [plan] = useNeedtPlan();
  const Sky = window.PxSky, Badge = window.PxBadge;
  if (gone || !Sky || needtPlanInfo(plan).pro) return null;
  const dismiss = (e) => {
    e.stopPropagation();
    setLeaving(true);
    window.setTimeout(() => { setGone(true); keep(); }, 180);
  };
  return (
    <div className={"pw-promo nx-focus" + (leaving ? " is-leaving" : "")} role="button" tabIndex={0} data-pw-promo aria-label="Needt Pro — see plans"
      onClick={() => window.openPaywall()} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); window.openPaywall(); } }}>
      <Sky variant="d" intensity={0.9} meadow={false} scene="promo">
        <span className="pw-promo-glow" aria-hidden="true" />
        <span className="pw-promo-in">
          <span className="pw-promo-head">
            <span className="px-display px-on-sky pw-promo-card-text" data-px-calm>Needt</span>
            {Badge ? <Badge>Pro</Badge> : null}
          </span>
          <span className="pw-promo-line" data-px-calm>Try Pro free for {NEEDT_PRICING.trialDays} days — no card.</span>
        </span>
        <button type="button" className="pw-x px-chip-btn" aria-label="Dismiss Needt Pro" data-pw-promo-close onClick={dismiss}><PwIcon name="x" size={12} /></button>
      </Sky>
    </div>
  );
}

Object.assign(window, { ProBadge, ProUpsell, ProLimit, PwPromoCard, openPaywall, closePaywall, pwEnsureCss });
