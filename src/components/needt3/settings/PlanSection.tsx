"use client";

import { useState } from "react";

import { FiCheck, FiChevronRight } from "react-icons/fi";

import { failedPaymentMessage } from "@/lib/creem/failed-payment";
import { newDate } from "@/lib/date-utils";
import {
  type CheckoutChoice,
  openBillingPortal,
  startCheckout,
} from "@/lib/needt3/hooks/account";
import { type V3Plan, usePlan } from "@/lib/needt3/hooks/plan";
import { lifetimeLeftLine, priceStrings } from "@/lib/needt3/pricing";
import { notify } from "@/lib/notifications";

import { isPro, planInfo, renewsText, trialBarPct } from "./derive";
import { ProPill, SBtn, SGroup, SRow } from "./kit";

const P = priceStrings();

/** What Pro unlocks (paywall.jsx `PRO_FEATURES`); each is marked PRO where it lives. */
export const PRO_FEATURES: readonly (readonly [string, string])[] = [
  ["Plan my day", "Needt places what has no time yet into your free hours"],
  ["Week load", "Each day's plan against your working hours"],
  ["Document themes", "All Styles and backdrops for your pages"],
  [
    "Time theme and accents",
    "The theme that follows the sun, every accent colour",
  ],
  ["Unlimited moodboards", "As many boards as you like, and Pinterest"],
];

/**
 * What to say while Creem could not collect a payment (the old billing
 * screen's alert, word for word). Shared with the phone's Plan page.
 */
export function failedPaymentLine(
  b: Pick<V3Plan, "plan" | "currentPeriodEnd">
) {
  return failedPaymentMessage({
    effectivePlan: b.plan === "PRO" || b.plan === "LIFETIME" ? b.plan : "FREE",
    currentPeriodEnd: b.currentPeriodEnd,
  });
}

/**
 * Plan & billing. Prices, the trial length and the lifetime cap come from
 * `NEEDT_PRICING` through `priceStrings()`; "N of 300 left" would come from
 * the server, which sends only whether Lifetime is still open
 * (`lifetimeAvailable`), so the line shows the cap, never a count.
 * //todo: the seats-left count (`LifetimeHold`) on `GET /api/billing`.
 *
 * Checkout is `POST /api/billing/checkout`. While the Creem review blocks
 * it the server answers "Billing is not configured." and the buttons say so.
 * //todo: Starting the 14-day trial: the grant is made at sign-up
 * (trial-service.ts); there is no route to start one later, so no "Start
 * trial" button. Invoices open the Creem portal.
 */
export function PlanSection() {
  const plan = usePlan();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const b = plan.data;
  const kind = b?.kind ?? "free";
  const info = planInfo(kind);
  const pro = isPro(kind);
  const closed = b ? !b.configured : false;
  const paymentFailed = b?.paymentFailed ?? false;

  const buy = async (id: string, choice: CheckoutChoice) => {
    setBusy(id);
    setError(null);
    const r = await startCheckout(choice);
    if (!r.ok) setError(r.error);
    setBusy(null);
  };
  const portal = async () => {
    setBusy("portal");
    const r = await openBillingPortal();
    if (!r.ok) notify.error(r.error);
    setBusy(null);
  };

  const chips: readonly {
    id: string;
    name: string;
    price: string;
    sub: string;
    save?: boolean;
    choice: CheckoutChoice;
    hidden?: boolean;
  }[] = [
    {
      id: "monthly",
      name: "Pro Monthly",
      price: `${P.monthly} / month`,
      sub: "Cancel any time",
      choice: { plan: "pro", interval: "month" },
    },
    {
      id: "annual",
      name: "Pro Yearly",
      price: `${P.yearly} / year`,
      sub: `${P.yearlyPerMonth}/mo · Save ${P.saveAmount}`,
      save: true,
      choice: { plan: "pro", interval: "year" },
    },
    {
      id: "lifetime",
      name: "Lifetime",
      price: `${P.lifetime} one-time`,
      sub: lifetimeLeftLine(null, P.lifetimeCap),
      choice: { plan: "lifetime" },
      hidden: b ? !b.lifetimeAvailable : false,
    },
  ];

  return (
    <>
      <SGroup>
        <div className="settings-plan-card" data-settings-plan-card={kind}>
          <span className="settings-row-12">
            <span className="settings-stack-6">
              <span className="settings-text-7">Your plan · {info.name}</span>
              <span className="settings-text-8">
                {kind === "free"
                  ? `${P.trialShort}.`
                  : kind === "trial"
                    ? `${b?.trialDaysLeft ?? 0} days left of your trial`
                    : kind === "lifetime"
                      ? "Pro for good."
                      : [
                          kind === "yearly"
                            ? `${P.yearly} / year (${P.yearlyPerMonth}/mo)`
                            : `${P.monthly} / month`,
                          renewsText(
                            b?.currentPeriodEnd,
                            newDate(),
                            b?.cancelAtPeriodEnd === true
                          ),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
              </span>
            </span>
            {kind === "lifetime" ? (
              <span className="settings-text-9">{P.lifetime} · paid once</span>
            ) : null}
          </span>
          {!pro || kind === "trial" ? (
            <span className="settings-grid-2">
              {chips
                .filter((c) => !c.hidden)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="base-stack settings-price"
                    data-settings-price={c.id}
                    disabled={busy !== null}
                    onClick={() => void buy(c.id, c.choice)}
                  >
                    <span className="settings-text-10">{c.name}</span>
                    <span className="settings-text-11">{c.price}</span>
                    <span
                      className={
                        "settings-text-12" + (c.save ? " is-save" : "")
                      }
                    >
                      {c.sub}
                    </span>
                  </button>
                ))}
            </span>
          ) : null}
          {kind === "trial" ? (
            <span className="settings-row-13">
              <span>
                <b className="settings-b">{b?.trialDaysLeft ?? 0}</b> of{" "}
                <b className="settings-b">{P.trialDays}</b> trial days left
              </span>
              <span className="settings-span-7">
                <span
                  className="settings-bar"
                  style={{
                    width: `${trialBarPct(b?.trialDaysLeft ?? null, P.trialDays)}%`,
                  }}
                />
              </span>
            </span>
          ) : kind === "lifetime" ? (
            <span className="settings-span-8">
              You&apos;re one of the first {P.lifetimeCap}. Every Pro feature,
              now and later — no renewals.
            </span>
          ) : kind === "yearly" ? (
            <span className="settings-span-8">
              You save {P.saveAmount} a year against monthly.
            </span>
          ) : kind === "monthly" ? (
            <span className="settings-span-8">
              Switch to yearly and pay {P.yearlyPerMonth}/mo — save{" "}
              {P.saveAmount} a year.
            </span>
          ) : null}
          {kind === "free" || kind === "trial" ? (
            <span className="settings-trial-terms" data-settings-trial-terms>
              {P.trialTerms}
            </span>
          ) : null}
          {closed && !pro ? (
            <span className="base-meta" role="status">
              Checkout is not open yet. Plans will be available here as soon as
              billing is switched on.
            </span>
          ) : null}
          {paymentFailed && b ? (
            <span
              className="base-meta"
              role="alert"
              data-settings-payment-failed
              style={{ color: "var(--destructive)" }}
            >
              {failedPaymentLine(b)}
            </span>
          ) : null}
          {error ? (
            <span
              className="base-meta"
              role="alert"
              style={{ color: "var(--destructive)" }}
            >
              {error}
            </span>
          ) : null}
          {b?.canManageBilling ? (
            <span className="settings-grid-3 is-one">
              <SBtn disabled={busy === "portal"} onClick={() => void portal()}>
                {paymentFailed ? "Manage billing" : "Invoices and payment"}
              </SBtn>
            </span>
          ) : null}
          <span className="base-meta">{P.footnote}</span>
        </div>
      </SGroup>
      <SGroup
        title={pro ? "Included in your plan" : "What Pro unlocks"}
        hint={
          pro
            ? "Everything marked PRO across Needt."
            : `Each one is marked PRO where it lives. Try them all free for ${P.trialDays} days.`
        }
      >
        {PRO_FEATURES.map(([title, desc]) => (
          <SRow
            key={title}
            title={
              <span className="settings-pro-title">
                {title}
                <ProPill locked={!pro} />
              </span>
            }
            desc={desc}
          >
            {pro ? (
              <span className="settings-pro-on">
                <FiCheck size={13} aria-hidden />
                Included
              </span>
            ) : (
              <FiChevronRight size={14} aria-hidden />
            )}
          </SRow>
        ))}
      </SGroup>
    </>
  );
}
