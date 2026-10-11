"use client";

import { useRef, useState } from "react";

import { LuCheck } from "react-icons/lu";

import { openBillingPortal } from "@/lib/needt3/hooks/account";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { lifetimeLeftLine, priceStrings } from "@/lib/needt3/pricing";
import { notify } from "@/lib/notifications";

import { PRO_FEATURES } from "../../settings/PlanSection";
import { isPro, planInfo, trialBarPct } from "../../settings/derive";
import { PkButton } from "../kit";
import { PsGroup, PsProTag, PsRow, usePs } from "./parts";

const P = priceStrings();

/** The plan card's second line (the desktop's, word for word). */
export function planLine(
  kind: string,
  b: { trialDaysLeft?: number | null } | undefined
) {
  switch (kind) {
    case "free":
      return `${P.trialShort}.`;
    case "trial":
      return `${b?.trialDaysLeft ?? 0} days left of your trial`;
    case "lifetime":
      return "Pro for good.";
    case "yearly":
      return `${P.yearly} / year`;
    default:
      return `${P.monthly} / month`;
  }
}

/** The grey line under the card on a paid plan. */
export function planHint(kind: string) {
  switch (kind) {
    case "lifetime":
      return `You're one of the first ${P.lifetimeCap}. Every Pro feature, now and later — no renewals.`;
    case "yearly":
      return `You save ${P.saveAmount} a year against monthly.`;
    case "monthly":
      return `Switch to yearly and pay ${P.yearlyPerMonth}/mo — save ${P.saveAmount} a year.`;
    default:
      return null;
  }
}

/**
 * Plan & billing. Prices, the trial length and the lifetime cap come from
 * `NEEDT_PRICING` through `priceStrings()`; the Lifetime line is the server's
 * count (`lifetimeLeft`) or the cap alone. Every buy button is the paywall
 * sheet, whose call to action is `paywallCta` (it honours the server's
 * `billing_checkout` switch); nothing here starts a checkout.
 *
 * //todo: starting the 14-day trial: it is granted at sign-up, there is no
 * route to start one later, so there is no "Start trial" button. License key,
 * billing help and the plan-state previewer of the prototype are not drawn.
 */
export function PlanPage() {
  const { upgrade } = usePs();
  const plan = usePlan();
  const [busy, setBusy] = useState(false);
  const going = useRef(false);
  const b = plan.data;
  const kind = b?.kind ?? "free";
  const info = planInfo(kind);
  const pro = isPro(kind);
  const closed = b ? !b.configured : false;
  const hint = planHint(kind);

  const portal = async () => {
    if (going.current) return;
    going.current = true;
    setBusy(true);
    try {
      const r = await openBillingPortal();
      if (!r.ok) notify.error(r.error);
    } finally {
      going.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <section className="ps-plan-card" data-ps-plan-card={kind}>
        <span className="ps-plan-name">Your plan · {info.name}</span>
        <span className="ps-plan-line">{planLine(kind, b)}</span>
        {kind === "trial" ? (
          <span className="ps-trial">
            <span>
              <b>{b?.trialDaysLeft ?? 0}</b> of <b>{P.trialDays}</b> trial days
              left
            </span>
            <span className="ps-trial-bar">
              <span
                className="ps-trial-fill"
                style={{
                  width: `${trialBarPct(b?.trialDaysLeft ?? null, P.trialDays)}%`,
                }}
              />
            </span>
          </span>
        ) : null}
        {kind === "free" || kind === "trial" ? (
          <span className="ps-plan-terms" data-ps-trial-terms="">
            {P.trialTerms}
          </span>
        ) : null}
        {closed && !pro ? (
          <span className="ps-plan-terms" role="status">
            Checkout is not open yet. Plans will be available here as soon as
            billing is switched on.
          </span>
        ) : null}
        {kind === "free" || kind === "trial" ? (
          <PkButton
            kind="primary"
            block
            onClick={() => upgrade()}
            data-ps-see-plans=""
          >
            {kind === "trial" ? "Choose a plan" : "See plans"}
          </PkButton>
        ) : null}
      </section>
      {kind === "free" ? (
        <PsGroup title="Plans" hint={P.footnote}>
          <PsRow
            title="Pro Monthly"
            desc="Cancel any time"
            value={`${P.monthly} / month`}
            onOpen={() => upgrade()}
            data={{ "data-ps-price": "monthly" }}
          />
          <PsRow
            title="Pro Yearly"
            desc={`${P.yearlyPerMonth}/mo · Save ${P.saveAmount}`}
            value={`${P.yearly} / year`}
            onOpen={() => upgrade()}
            data={{ "data-ps-price": "annual" }}
          />
          {b && !b.lifetimeAvailable ? null : (
            <PsRow
              title="Lifetime"
              desc={lifetimeLeftLine(b?.lifetimeLeft, P.lifetimeCap)}
              value={`${P.lifetime} one-time`}
              onOpen={() => upgrade()}
              data={{ "data-ps-price": "lifetime" }}
            />
          )}
        </PsGroup>
      ) : (
        <PsGroup hint={hint}>
          {kind === "monthly" ? (
            <PsRow title="Switch to yearly" onOpen={() => upgrade()} />
          ) : null}
          {kind !== "lifetime" && kind !== "monthly" ? (
            <PsRow title="Compare plans" onOpen={() => upgrade()} />
          ) : null}
          {b?.canManageBilling ? (
            <PsRow
              title="Invoices and payment"
              disabled={busy}
              onOpen={() => void portal()}
              data={{ "data-ps-portal": "" }}
            />
          ) : null}
        </PsGroup>
      )}
      <PsGroup
        title={pro ? "Included in your plan" : "What Pro unlocks"}
        hint={
          pro
            ? "Everything marked PRO across Needt."
            : `Each one is marked PRO where it lives. Try them all free for ${P.trialDays} days.`
        }
      >
        {PRO_FEATURES.map(([title, desc]) =>
          pro ? (
            <PsRow
              key={title}
              title={title}
              desc={desc}
              value={
                <span className="ps-included">
                  <LuCheck size={13} aria-hidden />
                  Included
                </span>
              }
            />
          ) : (
            <PsRow
              key={title}
              title={
                <span className="ps-title-pro">
                  {title}
                  <PsProTag locked />
                </span>
              }
              desc={desc}
              onOpen={() => upgrade(title)}
            />
          )
        )}
      </PsGroup>
    </>
  );
}
