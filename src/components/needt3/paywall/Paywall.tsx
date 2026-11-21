"use client";

/* THE PAYWALL, worn as "Keep Pro" (owner 20.11): one frosted card on the sky,
   see KeepProCard. Prices come from `priceStrings()` (the one NEEDT_PRICING
   module); nothing here is a literal.

   The button: for a Free account that can still have a trial it says "Start
   14-day free trial" and starts it (`POST /api/billing/trial`, no card).
   Otherwise it goes to `POST /api/billing/checkout` and follows the URL it
   returns. Nothing pretends to succeed: when checkout is not
   configured, or the server's `billing_checkout` switch is off, the button
   is off and says checkout opens soon; when it fails the card says
   "Checkout couldn't start" with a Retry. */
import { useEffect, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { LuCircleAlert, LuCloudOff } from "react-icons/lu";

import { logger } from "@/lib/logger";
import { startTrial } from "@/lib/needt3/hooks/account";
import { sendJson } from "@/lib/needt3/hooks/core";
import { usePlan } from "@/lib/needt3/hooks/plan";
import {
  type PaywallPick,
  checkoutSelection,
  keepProCopy,
  keepProItems,
  paywallCta,
  paywallNeedsWaiver,
  paywallPick,
} from "@/lib/needt3/paywall";
import { priceStrings } from "@/lib/needt3/pricing";
import { qk } from "@/lib/needt3/query-keys";
import { showsStudentPrices } from "@/lib/needt3/student-prices";
import { useOnline } from "@/lib/needt3/use-online";
import { notify } from "@/lib/notifications";
import { useStoreDistribution } from "@/lib/use-store-distribution";

import { KeepProCard } from "./KeepProCard";
import { StoreProSheet } from "./StoreProSheet";
import { WithdrawalWaiver } from "./WithdrawalWaiver";

const LOG_SOURCE = "needt3-paywall";

/* The list comes from PLAN_LIMITS, the numbers the server enforces. */
const ITEMS = keepProItems();

export interface PaywallProps {
  open: boolean;
  onClose: () => void;
  cycle?: string;
  feature?: string | null;
}

/**
 * In a store build (iOS app, Mac App Store) the sheet is one sentence and
 * Close: the purchase sheet below, with its prices, checkout call and trial
 * step, is not mounted at all.
 */
export function Paywall(props: PaywallProps) {
  const store = useStoreDistribution();
  if (store) return <StoreProSheet open={props.open} onClose={props.onClose} />;
  return <PurchasePaywall {...props} />;
}

function PurchasePaywall({
  open,
  onClose,
  cycle,
  feature = null,
}: PaywallProps) {
  const { data: plan } = usePlan();
  const D = priceStrings(undefined, { student: showsStudentPrices(plan) });
  const qc = useQueryClient();
  const online = useOnline();
  const [pick, setPick] = useState<PaywallPick>(paywallPick(cycle));
  const [leaving, setLeaving] = useState(false);
  const [shown, setShown] = useState(open);
  const [busy, setBusy] = useState(false);
  /* Terms 5.5: unticked on every open; checkout stays off until it is ticked. */
  const [waiver, setWaiver] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /* What failed, so the card names the right thing. */
  const [failedWhat, setFailedWhat] = useState<"trial" | "checkout">(
    "checkout"
  );
  const lastPro = useRef<"monthly" | "annual">(
    pick === "monthly" ? "monthly" : "annual"
  );
  if (pick === "monthly" || pick === "annual") lastPro.current = pick;

  /* Mounted on open, kept for the 170 ms exit, then unmounted. */
  useEffect(() => {
    if (open) {
      setShown(true);
      setLeaving(false);
      setFailed(null);
      setBusy(false);
      setWaiver(false);
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
  const needsWaiver = paywallNeedsWaiver(cta);
  const off =
    !online ||
    !plan ||
    cta.blocked !== null ||
    busy ||
    (needsWaiver && !waiver);

  /* "Start 14-day free trial": no card and no payment, so it works while
     checkout is closed. The server decides who may have one. */
  async function trial() {
    setBusy(true);
    setFailed(null);
    const started = await startTrial();
    if (!started.ok) {
      void logger.warn(
        "Trial did not start",
        { error: started.error },
        LOG_SOURCE
      );
      setFailedWhat("trial");
      setFailed(started.error);
      setBusy(false);
      // The server may have said the trial is already used: read the plan
      // again so the button stops offering it.
      void qc.invalidateQueries({ queryKey: qk.plan() });
      return;
    }
    await qc.invalidateQueries({ queryKey: qk.plan() });
    notify.success(`Your ${D.trialDays}-day Pro trial has started`, {
      description: "No card needed.",
    });
    setBusy(false);
    onClose();
  }

  function go() {
    if (off) return;
    if (cta.action === "trial") void trial();
    else void checkout();
  }

  async function checkout() {
    if (off) return;
    setBusy(true);
    setFailed(null);
    setFailedWhat("checkout");
    try {
      const { url } = await sendJson<{ url?: string }>(
        "/api/billing/checkout",
        "POST",
        { ...checkoutSelection(pick), withdrawalWaiver: true }
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
  const copy = keepProCopy(plan, feature);
  const status = !online ? (
    <div className="pw-state is-offline" role="status" data-pw-offline>
      <LuCloudOff size={14} />
      <span>You’re offline. Your plan hasn’t changed.</span>
    </div>
  ) : failed ? (
    <div className="pw-state is-error" role="alert" data-pw-error>
      <LuCircleAlert size={14} />
      <span className="pw-state-t">
        {failedWhat === "trial" ? (
          <>
            <b>The trial couldn’t start.</b> {failed}
          </>
        ) : (
          <>
            <b>Checkout couldn’t start.</b> You haven’t been charged.
          </>
        )}
      </span>
      <button
        type="button"
        className="pw-btn is-secondary pw-state-btn"
        data-pw-retry
        onClick={go}
      >
        Retry
      </button>
    </div>
  ) : null;
  return (
    <div
      className={"kp-scrim kp-sky" + (leaving ? " is-leaving" : "")}
      data-pw-open="1"
    >
      <div className="kp-col">
        <KeepProCard
          title={copy.title}
          line={copy.line}
          feature={feature}
          pick={pick}
          onPick={setPick}
          cycle={lastPro.current}
          prices={D}
          lifetimeLeft={plan?.lifetimeLeft}
          lifetimeOpen={plan ? plan.lifetimeAvailable !== false : true}
          items={ITEMS}
          status={status}
          waiver={
            needsWaiver ? (
              <WithdrawalWaiver
                checked={waiver}
                onChange={setWaiver}
                product={pick === "lifetime" ? "Lifetime" : "Pro"}
                className="auth-age kp-waiver"
              />
            ) : null
          }
          cta={{
            label: busy
              ? cta.action === "trial"
                ? "Starting your trial…"
                : "Opening checkout…"
              : cta.label,
            disabled: off,
            onClick: go,
            sub: cta.blocked ?? (status ? null : cta.sub),
            terms: cta.terms && cta.blocked === null ? cta.terms : null,
          }}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
