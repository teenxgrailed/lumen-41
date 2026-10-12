"use client";

/* THE PAYWALL (prototype paywall-sheet.jsx `Paywall`, desktop). The sheet
   stands on the printed sky: headline and a few glass prints of the product on
   top; below, Free as a quiet "current plan" line, a Pro card with a
   Monthly / Yearly switch (the price always reads per month), a Lifetime card
   with the server's seats-left count, one call to action, and what Pro
   includes. Prices come from `priceStrings()` (the one NEEDT_PRICING module);
   nothing here is a literal.

   Payments: the button goes to `POST /api/billing/checkout` and follows the
   URL it returns. Nothing pretends to succeed: when checkout is not
   configured, or the server's `billing_checkout` switch is off, the button
   is off and says checkout opens soon; when it fails the sheet says
   "Checkout couldn't start" with a Retry. */
import { useEffect, useRef, useState } from "react";

import {
  LuCheck,
  LuCircleAlert,
  LuCloudOff,
  LuLock,
  LuX,
} from "react-icons/lu";

import { logger } from "@/lib/logger";
import { sendJson } from "@/lib/needt3/hooks/core";
import { type V3Plan, usePlan } from "@/lib/needt3/hooks/plan";
import {
  type PaywallPick,
  checkoutSelection,
  freeIncludes,
  lifetimeLeftPct,
  paywallCta,
  paywallPick,
  proIncludes,
} from "@/lib/needt3/paywall";
import { lifetimeLeftLine, priceStrings } from "@/lib/needt3/pricing";
import { useOnline } from "@/lib/needt3/use-online";

import {
  GlassCard,
  PwDateCard,
  PwMiniTask,
  PwMoodPrint,
  PwNoteCard,
  PxBadge,
  PxSky,
} from "../scenes";
import { NeedtAppIcon } from "../wordmark";

const LOG_SOURCE = "needt3-paywall";

/* Both lists come from PLAN_LIMITS, the numbers the server enforces. */
const FREE = freeIncludes();
const PRO = proIncludes();

function Plans({
  pick,
  onPick,
  plan,
}: {
  pick: PaywallPick;
  onPick: (p: PaywallPick) => void;
  plan: V3Plan | undefined;
}) {
  const D = priceStrings();
  const lastPro = useRef<"monthly" | "annual">(
    pick === "monthly" ? "monthly" : "annual"
  );
  if (pick === "monthly" || pick === "annual") lastPro.current = pick;
  const cyc = lastPro.current;
  const proOn = pick !== "lifetime";
  const pct = lifetimeLeftPct(plan?.lifetimeLeft);
  const radio = (on: boolean) => (
    <span className={"pw-radio" + (on ? " is-on" : "")} aria-hidden="true" />
  );
  const seg = (
    id: "monthly" | "annual",
    label: string,
    extra?: React.ReactNode
  ) => (
    <button
      type="button"
      role="radio"
      aria-checked={cyc === id}
      data-pw-cycle={id}
      className={"pw-seg-b" + (cyc === id ? " is-on" : "")}
      onClick={(e) => {
        e.stopPropagation();
        lastPro.current = id;
        onPick(id);
      }}
    >
      {label}
      {extra}
    </button>
  );
  return (
    <div className="pw-plans" role="group" aria-label="Plans">
      <GlassCard
        best={proOn}
        pad={22}
        radius={24}
        className={"pw-plan pw-plan-pro" + (proOn ? " is-picked" : "")}
        data-pw-plan={cyc}
        onClick={() => onPick(cyc)}
        label={"Pro " + (cyc === "monthly" ? "monthly" : "yearly")}
        aria-pressed={proOn}
      >
        <span className="pw-name">
          {radio(proOn)}Pro
          <span className="pw-seg" role="radiogroup" aria-label="Billing">
            {seg("monthly", "Monthly")}
            {seg(
              "annual",
              "Yearly",
              <span className="pw-seg-save" data-pw-save>
                −{D.savePct}%
              </span>
            )}
          </span>
        </span>
        <span className="pw-price">
          <span className="px-display" data-pw-price={cyc}>
            {cyc === "monthly" ? D.monthly : D.yearlyPerMonth}
          </span>
          <span className="pw-per">/ month</span>
        </span>
        <span className="pw-sub">
          {cyc === "monthly" ? (
            "Billed monthly · cancel any time"
          ) : (
            <>
              Billed {D.yearly} yearly ·{" "}
              <b className="pw-save">save {D.saveAmount}</b>
            </>
          )}
        </span>
      </GlassCard>
      <GlassCard
        best={pick === "lifetime"}
        pad={22}
        radius={24}
        className={"pw-plan" + (pick === "lifetime" ? " is-picked" : "")}
        data-pw-plan="lifetime"
        onClick={() => onPick("lifetime")}
        label="Lifetime"
        aria-pressed={pick === "lifetime"}
      >
        <span className="pw-name">
          {radio(pick === "lifetime")}Lifetime
          <PxBadge style={{ marginLeft: "auto" }}>Limited</PxBadge>
        </span>
        <span className="pw-price">
          <span className="px-display" data-pw-price="lifetime">
            {D.lifetime}
          </span>
          <span className="pw-per">one-time</span>
        </span>
        <span className="pw-sub">For the first {D.lifetimeCap} people</span>
        <span className="pw-meter" data-pw-left>
          {pct !== null ? (
            <span className="pw-meter-bar">
              <span style={{ width: pct + "%" }} />
            </span>
          ) : null}
          <span className="pw-meter-t">
            {lifetimeLeftLine(plan?.lifetimeLeft, D.lifetimeCap)}
          </span>
        </span>
      </GlassCard>
    </div>
  );
}

function Scene({
  onClose,
  feature,
}: {
  onClose: () => void;
  feature: string | null;
}) {
  const D = priceStrings();
  return (
    <div className="pw-top">
      <div className="pw-scene-abs">
        <button
          type="button"
          className="pw-x px-chip-btn"
          aria-label="Close"
          data-pw-close
          onClick={onClose}
          style={{ top: 14, right: 14 }}
        >
          <LuX size={15} />
        </button>
        <div className="pw-scene-abs-7">
          <div data-px-calm className="pw-scene-col">
            {feature ? (
              <span className="pw-feature" data-pw-feature={feature}>
                <LuLock size={12} />
                <span>
                  Unlock <b>{feature}</b> with Pro
                </span>
              </span>
            ) : null}
            <span className="pw-brand">
              <NeedtAppIcon size={44} />
              <span className="px-kicker">Needt Pro</span>
            </span>
            <h2 className="px-display px-on-sky pw-h pw-h-desk">
              Get <em>more</em>
              <br />
              out of Needt
            </h2>
            <span className="px-on-sky pw-scene-text-2">
              AI planning and Pro limits — free for {D.trialDays} days, no card
              needed. Then back to Free unless you choose a plan.
            </span>
          </div>
          <div className="pw-collage pw-scene-box" aria-hidden="true">
            <span
              className="pw-print-in pw-scene-abs-8"
              style={{ animationDelay: "80ms" }}
            >
              <PwMoodPrint width={138} height={96} />
            </span>
            <span
              className="pw-print-in pw-scene-abs-9"
              style={{ animationDelay: "160ms" }}
            >
              <PwNoteCard width={164} />
            </span>
            <span
              className="pw-print-in pw-scene-abs-10"
              style={{ animationDelay: "240ms" }}
            >
              <PwDateCard width={96} event={false} />
            </span>
            <span
              className="pw-print-in pw-scene-abs-11"
              style={{ animationDelay: "300ms" }}
            >
              <PwMiniTask
                title="Plan my day"
                chip="AI"
                style={{
                  boxShadow:
                    "var(--mock-shadow-a30) 0 12px 24px -8px, var(--mock-shadow-a12) 0 0 0 .5px",
                }}
              />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface PaywallProps {
  open: boolean;
  onClose: () => void;
  cycle?: string;
  feature?: string | null;
}

export function Paywall({
  open,
  onClose,
  cycle,
  feature = null,
}: PaywallProps) {
  const D = priceStrings();
  const { data: plan } = usePlan();
  const online = useOnline();
  const [pick, setPick] = useState<PaywallPick>(paywallPick(cycle));
  const [leaving, setLeaving] = useState(false);
  const [shown, setShown] = useState(open);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /* Mounted on open, kept for the 170 ms exit, then unmounted. */
  useEffect(() => {
    if (open) {
      setShown(true);
      setLeaving(false);
      setFailed(null);
      setBusy(false);
      if (cycle) setPick(paywallPick(cycle));
      return undefined;
    }
    if (!shown) return undefined;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(false);
      return undefined;
    }
    setLeaving(true);
    const id = window.setTimeout(() => {
      setShown(false);
      setLeaving(false);
    }, 170);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  const cta = paywallCta(pick, plan ?? null);
  /* Off until the plan (and with it the checkout switch) has loaded. */
  const off = !online || !plan || cta.blocked !== null || busy;

  async function checkout() {
    if (off) return;
    setBusy(true);
    setFailed(null);
    try {
      const { url } = await sendJson<{ url?: string }>(
        "/api/billing/checkout",
        "POST",
        checkoutSelection(pick)
      );
      if (!url) throw new Error("No checkout URL");
      window.location.assign(url);
    } catch (error) {
      void logger.warn(
        "Checkout did not start",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      setFailed(
        error instanceof Error ? error.message : "Checkout did not start"
      );
      setBusy(false);
    }
  }

  if (!shown) return null;
  return (
    <div
      className={"pw-scrim" + (leaving ? " is-leaving" : "")}
      data-pw-open="1"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="pw-sheet"
        data-px-scope
        role="dialog"
        aria-modal="true"
        aria-label="Needt Pro"
      >
        <div className="pw-sky">
          <PxSky variant="b" intensity={1.05} />
        </div>
        <Scene onClose={onClose} feature={feature} />
        <div className="pw-body scroll-inner">
          <div className="pw-freeline" data-pw-free>
            <span className="pw-freeline-tag">
              {plan?.kind === "free" || !plan ? "Current plan" : "Included"}
            </span>
            <span>
              <b>Free</b> —{" "}
              {FREE.join(", ")
                .toLowerCase()
                .replace(/^./, (c) => c.toUpperCase())}
              . Yours to keep.
            </span>
          </div>
          <Plans pick={pick} onPick={setPick} plan={plan} />
          <div className="pw-go">
            <button
              type="button"
              className="pw-btn is-primary pw-btn-lg"
              data-pw-cta={pick}
              disabled={off}
              onClick={() => void checkout()}
            >
              {busy ? "Opening checkout…" : cta.label}
            </button>
            {!online ? (
              <div
                className="pw-state is-offline"
                role="status"
                data-pw-offline
              >
                <LuCloudOff size={14} />
                <span>
                  You’re offline — checkout needs a connection. Your plan hasn’t
                  changed.
                </span>
              </div>
            ) : failed ? (
              <div className="pw-state is-error" role="alert" data-pw-error>
                <LuCircleAlert size={14} />
                <span className="pw-state-t">
                  <b>Checkout couldn’t start.</b> Check your connection and try
                  again — you haven’t been charged.
                </span>
                <button
                  type="button"
                  className="pw-btn is-secondary pw-state-btn"
                  data-pw-retry
                  onClick={() => void checkout()}
                >
                  Retry
                </button>
              </div>
            ) : (
              <span className="pw-go-sub" data-pw-cta-sub>
                {cta.blocked ?? cta.sub}
              </span>
            )}
          </div>
          <div className="pw-paywall-text-2">
            <GlassCard pad={20} radius={24} className="pw-feats-card">
              <span className="pw-kick">Every Pro plan includes</span>
              <ul className="pw-list pw-feats">
                {PRO.map(([t, n]) => (
                  <li key={t}>
                    <span className="pw-ck">
                      <LuCheck size={11} />
                    </span>
                    <span>
                      {t}
                      {n ? <span className="pw-note"> — {n}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          </div>
        </div>
        <div className="pw-foot" data-pw-foot>
          {D.footnote}
        </div>
      </div>
    </div>
  );
}
