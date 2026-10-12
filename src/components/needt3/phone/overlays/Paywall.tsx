"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  LuCheck,
  LuCircleAlert,
  LuCloudOff,
  LuLock,
  LuX,
} from "react-icons/lu";

import { ApiError, sendJson } from "@/lib/needt3/hooks/core";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { freeIncludes, proIncludes } from "@/lib/needt3/paywall";
import { priceStrings } from "@/lib/needt3/pricing";

import { PxSky } from "../../scenes";
import { PkButton, PkGlass, PkSheet, pkCx } from "../kit";
import {
  type PwPick,
  checkoutBody,
  freeSummary,
  pickOf,
  pwDisabled,
  pwView,
} from "./paywallModel";
import {
  pkPaywall,
  pwFeature,
  pwFeatures,
  pwFree,
  pwPlans,
  pwScene,
  pwStatus,
} from "./strings";

/* Both lists come from PLAN_LIMITS, the numbers the server enforces. */
const FREE = freeIncludes();
const PRO = proIncludes();

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
        checkoutBody(pick)
      );
      if (!res?.url) throw new Error("No checkout address.");
      window.location.assign(res.url);
    } catch (e) {
      setError({ text: e instanceof ApiError ? e.message : null });
    } finally {
      setBusy(false);
    }
  }, []);
  const clear = useCallback(() => setError(null), []);
  return { busy, error, start, clear };
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

export function PkPaywall({ open, onClose, feature, cycle }: PkPaywallProps) {
  const p = useMemo(() => priceStrings(), []);
  const plan = usePlan().data;
  const online = useOnline();
  const checkout = useCheckout();
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
  const off = pwDisabled(view, { online, busy: checkout.busy });

  // A fresh open starts from the cycle asked for, with no stale error.
  const { clear } = checkout;
  useEffect(() => {
    if (!open) return;
    setPicked(pickOf(cycle));
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
    void checkout.start(pick);
  };

  const proOn = pick !== "lifetime";
  const status = (
    <Status
      offline={offline}
      error={checkout.error}
      onRetry={go}
      retrying={checkout.busy}
    />
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
      className={pkCx("pw-seg-b", cyc === id && "is-on")}
      onClick={(e) => {
        e.stopPropagation();
        setPicked(id);
      }}
    >
      {label}
      {extra}
    </button>
  );

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
          className="pw-phone"
          data-px-scope=""
          data-pw-open={open ? "1" : "0"}
        >
          {open || sky ? (
            <div className="pw-sky">
              <PxSky variant="b" intensity={1} />
            </div>
          ) : null}
          <div className="pw-top">
            <div className="pw-scene-abs">
              <PkGlass
                as="button"
                round
                className="pw-x"
                aria-label={pwScene.close}
                data-pw-close=""
                onClick={onClose}
              >
                <LuX size={15} />
              </PkGlass>
              <div className="pw-scene-abs-6" data-px-calm="">
                {feature ? (
                  <span className="pw-feature" data-pw-feature={feature}>
                    <LuLock size={12} />
                    <span>
                      {pwFeature.unlock} <b>{feature}</b> {pwFeature.with_pro}
                    </span>
                  </span>
                ) : null}
                <span className="pw-brand">
                  <span className="pw-kicker">{pwScene.needt_pro}</span>
                </span>
                <h2 className="pw-h pw-scene-text">
                  {pwScene.get} <em>more</em>
                  <br />
                  {pwScene.out_of_needt}
                </h2>
              </div>
            </div>
          </div>
          <div className="pw-body">
            <div className="pw-freeline" data-pw-free="">
              <span className="pw-freeline-tag">{view.freeTag}</span>
              <span>
                <b>{pwFree.free}</b> — {freeSummary(FREE)}
                {pwFree.yours_to_keep}
              </span>
            </div>
            <div className="pw-plans" role="group" aria-label={pwPlans.plans}>
              <PkGlass
                className={pkCx("pw-plan", "pw-plan-pro", proOn && "is-picked")}
                data-pw-plan={cyc}
                onClick={() => setPicked(cyc)}
              >
                <span className="pw-name">
                  <span
                    className={pkCx("pw-radio", proOn && "is-on")}
                    aria-hidden="true"
                  />
                  {pwPlans.pro}
                  <span
                    className="pw-seg"
                    role="radiogroup"
                    aria-label={pwPlans.billing}
                  >
                    {seg("monthly", pwPlans.monthly)}
                    {seg(
                      "annual",
                      pwPlans.yearly,
                      <span className="pw-seg-save" data-pw-save="">
                        −{p.savePct}%
                      </span>
                    )}
                  </span>
                </span>
                <span className="pw-price">
                  <span className="pw-amount" data-pw-price={cyc}>
                    {cyc === "monthly" ? p.monthly : p.yearlyPerMonth}
                  </span>
                  <span className="pw-per">/ month</span>
                </span>
                <span className="pw-sub">
                  {cyc === "monthly" ? (
                    pwPlans.billed_monthly_cancel_any_time
                  ) : (
                    <>
                      {pwPlans.billed} {p.yearly} {pwPlans.yearly_2}{" "}
                      <b className="pw-save">save {p.saveAmount}</b>
                    </>
                  )}
                </span>
              </PkGlass>
              <PkGlass
                as="button"
                className={pkCx("pw-plan", pick === "lifetime" && "is-picked")}
                data-pw-plan="lifetime"
                aria-pressed={pick === "lifetime"}
                onClick={() => setPicked("lifetime")}
              >
                <span className="pw-name">
                  <span
                    className={pkCx("pw-radio", pick === "lifetime" && "is-on")}
                    aria-hidden="true"
                  />
                  {pwPlans.lifetime}
                  <span className="pw-limited">{pwPlans.limited}</span>
                </span>
                <span className="pw-price">
                  <span className="pw-amount" data-pw-price="lifetime">
                    {p.lifetime}
                  </span>
                  <span className="pw-per">one-time</span>
                </span>
                <span className="pw-sub">
                  {pwPlans.for_the_first} {p.lifetimeCap} people
                </span>
                <span className="pw-meter" data-pw-left="">
                  {view.lifetimePct !== null ? (
                    <span className="pw-meter-bar">
                      <span style={{ width: view.lifetimePct + "%" }} />
                    </span>
                  ) : null}
                  <span className="pw-meter-t">{view.lifetimeLine}</span>
                </span>
              </PkGlass>
            </div>
            <div className="pw-paywall-text">
              <PkGlass className="pw-feats-card">
                <span className="pw-kick">
                  {pwFeatures.every_pro_plan_includes}
                </span>
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
              </PkGlass>
            </div>
            <div className="pw-foot" data-pw-foot="">
              {p.footnote}
            </div>
          </div>
          <div className="pw-bar">
            {status}
            <PkButton
              kind="primary"
              block
              data-pw-cta={pick}
              disabled={off}
              onClick={go}
            >
              {checkout.busy ? "Opening checkout…" : cta.label}
            </PkButton>
            <span className="pw-go-sub" data-pw-cta-sub="">
              {cta.blocked ?? cta.sub}
            </span>
          </div>
        </div>
      </div>
    </PkSheet>
  );
}
