"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useQueryClient } from "@tanstack/react-query";
import { LuCircleAlert, LuCloudOff } from "react-icons/lu";

import { startTrial } from "@/lib/needt3/hooks/account";
import { ApiError, sendJson } from "@/lib/needt3/hooks/core";
import { usePlan } from "@/lib/needt3/hooks/plan";
import {
  keepProCopy,
  keepProItems,
  paywallNeedsWaiver,
} from "@/lib/needt3/paywall";
import { priceStrings } from "@/lib/needt3/pricing";
import { qk } from "@/lib/needt3/query-keys";
import { showsStudentPrices } from "@/lib/needt3/student-prices";
import { notify } from "@/lib/notifications";
import { useStoreDistribution } from "@/lib/use-store-distribution";

import { KeepProCard } from "../../paywall/KeepProCard";
import { WithdrawalWaiver } from "../../paywall/WithdrawalWaiver";
import { PkButton, PkSheet } from "../kit";
import { PkStoreProSheet } from "./StoreProSheet";
import {
  type PwPick,
  checkoutBody,
  pickOf,
  pwDisabled,
  pwView,
} from "./paywallModel";
import { pkPaywall, pwScene, pwStatus } from "./strings";

/* The list comes from PLAN_LIMITS, the numbers the server enforces. */
const ITEMS = keepProItems();

/* The sheet is the prototype's `Paywall phone` as a full PkSheet (phone-
   overlays.jsx `PkPaywall`). The painted sky is PxSky (variant b), mounted
   while the sheet is open or settling, as the desktop paywall does; the sheet
   keeps `data-px-scope` so the engine can write the sky's ink on it. */

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true
  );

interface CheckoutError {
  /** The server's own words, or the transport failure's. */
  text: string | null;
}

/**
 * `POST /api/billing/checkout` → `{ url }`, then the browser goes there. While
 * billing is not configured the server answers 503 "Billing is not
 * configured."; that sentence is shown as it is.
 */
function useCheckout() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CheckoutError | null>(null);
  const start = useCallback(async (pick: PwPick) => {
    setBusy(true);
    setError(null);
    try {
      const res = await sendJson<{ url?: string }>(
        "/api/billing/checkout",
        "POST",
        { ...checkoutBody(pick), withdrawalWaiver: true }
      );
      if (!res?.url) throw new Error("No checkout address.");
      window.location.assign(res.url);
    } catch (e) {
      setError({ text: e instanceof ApiError ? e.message : null });
    } finally {
      setBusy(false);
    }
  }, []);
  /* "Start 14-day free trial": no card, no payment. The server's own sentence
     is shown when it refuses. */
  const trial = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const started = await startTrial();
    if (!started.ok) setError({ text: started.error });
    setBusy(false);
    return started.ok;
  }, []);
  const clear = useCallback(() => setError(null), []);
  return { busy, error, start, trial, clear };
}

function Status({
  offline,
  error,
  onRetry,
  retrying,
}: {
  offline: boolean;
  error: CheckoutError | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (offline)
    return (
      <div className="pw-state is-offline" role="status" data-pw-offline="">
        <LuCloudOff size={14} />
        <span>{pwStatus.youre_offline_checkout_needs_a_connectio}</span>
      </div>
    );
  if (!error) return null;
  return (
    <div className="pw-state is-error" role="alert" data-pw-error="">
      <LuCircleAlert size={14} />
      <span className="pw-state-t">
        {error.text ? (
          <b>{error.text}</b>
        ) : (
          <>
            <b>{pwStatus.checkout_couldnt_start}</b>{" "}
            {pwStatus.check_your_connection_and_try_again_you_}
          </>
        )}
      </span>
      {error.text ? null : (
        <PkButton
          kind="chip"
          className="pw-state-btn"
          data-pw-retry=""
          disabled={retrying}
          onClick={onRetry}
          icon={
            retrying ? (
              <span className="pw-spin" aria-hidden="true" />
            ) : undefined
          }
        >
          {retrying ? pwStatus.retrying : pwStatus.retry}
        </PkButton>
      )}
    </div>
  );
}

export interface PkPaywallProps {
  open: boolean;
  onClose: () => void;
  /** The locked feature that asked ("Accent colours"): one line names it. */
  feature?: string | null;
  /** Which card starts picked. */
  cycle?: string | null;
}

/**
 * In a store build (iOS app) the sheet is one sentence and Close: the
 * purchase sheet below, with its prices, checkout call and trial step, is not
 * mounted at all.
 */
export function PkPaywall(props: PkPaywallProps) {
  const store = useStoreDistribution();
  if (store)
    return <PkStoreProSheet open={props.open} onClose={props.onClose} />;
  return <PkPurchasePaywall {...props} />;
}

function PkPurchasePaywall({ open, onClose, feature, cycle }: PkPaywallProps) {
  const plan = usePlan().data;
  const student = showsStudentPrices(plan);
  const p = useMemo(() => priceStrings(undefined, { student }), [student]);
  const online = useOnline();
  const checkout = useCheckout();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<PwPick>(pickOf(cycle));
  // the sky runs while the sheet is open or sliding away, not while it is put away
  const [sky, setSky] = useState(open);
  if (open && !sky) setSky(true);
  const lastPro = useRef<"monthly" | "annual">(
    picked === "monthly" ? "monthly" : "annual"
  );
  if (picked !== "lifetime") lastPro.current = picked;
  const pick: PwPick = picked;
  const cyc = lastPro.current;
  const offline = !online;
  /* The label, the sub line, "blocked" and the lifetime counter are the
     desktop paywall's: `paywallCta(pick, plan)` and the server's count. */
  const view = pwView(pick, plan, p.lifetimeCap);
  const cta = view.cta;
  /* Terms 5.5: unticked on every open; checkout stays off until it is ticked. */
  const [waiver, setWaiver] = useState(false);
  const needsWaiver = paywallNeedsWaiver(cta);
  const off =
    pwDisabled(view, { online, busy: checkout.busy }) ||
    (needsWaiver && !waiver);

  // A fresh open starts from the cycle asked for, with no stale error.
  const { clear } = checkout;
  useEffect(() => {
    if (!open) return;
    setPicked(pickOf(cycle));
    setWaiver(false);
    clear();
  }, [open, cycle, clear]);

  // A drag that starts in a scrolled body stays a scroll, not a sheet drag.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const guard = (e: TouchEvent) => {
      const b = (e.target as HTMLElement | null)?.closest?.(".pw-body");
      if (b && b.scrollTop > 0) e.stopPropagation();
    };
    el.addEventListener("touchstart", guard, { passive: true });
    return () => el.removeEventListener("touchstart", guard);
  }, []);
  const guardPointer = (e: React.PointerEvent) => {
    const b = (e.target as HTMLElement).closest?.(".pw-body");
    if (b && b.scrollTop > 0) e.stopPropagation();
  };

  const go = () => {
    if (off) return;
    if (cta.action === "trial") {
      void checkout.trial().then(async (started) => {
        // Read the plan again either way: a refusal means it is not offered.
        await qc.invalidateQueries({ queryKey: qk.plan() });
        if (!started) return;
        notify.success(`Your ${p.trialDays}-day Pro trial has started`, {
          description: "No card needed.",
        });
        onClose();
      });
      return;
    }
    void checkout.start(pick);
  };

  const status = (
    <Status
      offline={offline}
      error={checkout.error}
      onRetry={go}
      retrying={checkout.busy}
    />
  );
  const copy = keepProCopy(plan, feature ?? null);

  return (
    <PkSheet
      open={open}
      onClose={onClose}
      onShut={() => setSky(false)}
      detents={[0.95]}
      label={pkPaywall.needt_pro}
      className="pov-paywall"
      bodyClass="pov-paywall-body"
    >
      <div
        ref={root}
        className="pov-paywall-in"
        onPointerDown={guardPointer}
        data-pov-paywall=""
      >
        <div
          className="pw-phone kp-sky kp-phone"
          data-pw-open={open ? "1" : "0"}
        >
          <div className="pw-body kp-phone-body">
            <KeepProCard
              title={copy.title}
              line={copy.line}
              feature={feature ?? null}
              pick={pick}
              onPick={setPicked}
              cycle={cyc}
              prices={p}
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
                label: checkout.busy
                  ? cta.action === "trial"
                    ? "Starting your trial…"
                    : "Opening checkout…"
                  : cta.label,
                disabled: off,
                onClick: go,
                sub: cta.blocked ?? cta.sub,
                terms: cta.terms && cta.blocked === null ? cta.terms : null,
              }}
              onClose={onClose}
              closeLabel={pwScene.close}
            />
          </div>
        </div>
      </div>
    </PkSheet>
  );
}
