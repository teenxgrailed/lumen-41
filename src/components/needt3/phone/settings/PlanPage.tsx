"use client";

import { useRef, useState } from "react";

import { LuCheck } from "react-icons/lu";

import { newDate } from "@/lib/date-utils";
import { isAppleStoreAvailable } from "@/lib/native-store";
import { openBillingPortal, startTrial } from "@/lib/needt3/hooks/account";
import { useApplePlanRows } from "@/lib/needt3/hooks/apple-iap";
import { type V3Plan, usePlan } from "@/lib/needt3/hooks/plan";
import { offersTrial } from "@/lib/needt3/paywall";
import {
  type PriceStrings,
  lifetimeLeftLine,
  priceStrings,
} from "@/lib/needt3/pricing";
import { notify } from "@/lib/notifications";
import { useStoreDistribution } from "@/lib/use-store-distribution";

import { PRO_FEATURES, failedPaymentLine } from "../../settings/PlanSection";
import {
  isPro,
  planInfo,
  storePlanLine,
  trialBarPct,
} from "../../settings/derive";
import {
  showsStudentPrices,
  studentPanel,
} from "../../settings/student-derive";
import { useStudentEmail } from "../../settings/useStudentEmail";
import { PkButton } from "../kit";
import { PsGroup, PsProTag, PsRow, usePs } from "./parts";

const P = priceStrings();

/** The plan card's second line (the desktop's, word for word). */
export function planLine(
  kind: string,
  b: { trialDaysLeft?: number | null; trialEligible?: boolean } | undefined,
  prices: PriceStrings = P
) {
  const P = prices;
  switch (kind) {
    case "free":
      return `${offersTrial({ kind, trialEligible: b?.trialEligible }) ? P.trialShort : P.plansShort}.`;
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
export function planHint(kind: string, prices: PriceStrings = P) {
  const P = prices;
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
 * A Free account that has not had its trial yet (`trialEligible`) gets "Start
 * 14-day free trial", the same `POST /api/billing/trial` the desktop's Plan
 * section calls (`startTrial`).
 *
 * //todo: license key, billing help and the plan-state previewer of the
 * prototype are not drawn.
 */
export function PlanPage() {
  const store = useStoreDistribution();
  return store ? <StorePlanPage /> : <PurchasePlanPage />;
}

/**
 * The plan in a store build (iOS app): the current plan and its renewal state,
 * read-only. No price, no plan to pick, no trial button, no billing portal, no
 * student price (App Store Review Guidelines 3.1.1 and 3.1.3(f)).
 */
function StorePlanPage() {
  const plan = usePlan();
  const b = plan.data;
  const kind = b?.kind ?? "free";
  const info = planInfo(kind);
  const pro = isPro(kind);
  const days = priceStrings().trialDays;
  return (
    <>
      <section className="ps-plan-card" data-ps-plan-card={kind}>
        <span className="ps-plan-name">Your plan · {info.name}</span>
        <span className="ps-plan-line">
          {storePlanLine(kind, b, newDate())}
        </span>
        {kind === "trial" ? (
          <span className="ps-trial">
            <span>
              <b>{b?.trialDaysLeft ?? 0}</b> of <b>{days}</b> trial days left
            </span>
            <span className="ps-trial-bar">
              <span
                className="ps-trial-fill"
                style={{
                  width: `${trialBarPct(b?.trialDaysLeft ?? null, days)}%`,
                }}
              />
            </span>
          </span>
        ) : null}
      </section>
      <PsGroup
        title={pro ? "Included in your plan" : "What Pro includes"}
        hint={
          pro
            ? "Everything marked PRO across Needt."
            : "Each one is marked PRO where it lives."
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
            />
          )
        )}
      </PsGroup>
      {isAppleStoreAvailable() ? <AppleGroup source={b?.source} /> : null}
    </>
  );
}

/** Restore purchases and Manage in App Store; only where the NeedtStore plugin is. */
function AppleGroup({ source }: { source: V3Plan["source"] }) {
  const apple = useApplePlanRows(source);
  if (!apple.canRestore && !apple.canManage) return null;
  return (
    <PsGroup title="App Store">
      {apple.canRestore ? (
        <PsRow
          title={apple.restoring ? "Restoring…" : "Restore purchases"}
          desc="Apply a purchase made with this Apple ID."
          disabled={apple.restoring}
          chevron={false}
          onOpen={apple.restore}
          data={{ "data-ps-restore": "" }}
        />
      ) : null}
      {apple.canManage ? (
        <PsRow
          title="Manage in App Store"
          desc="Change or cancel your subscription."
          out
          onOpen={apple.manage}
          data={{ "data-ps-manage-apple": "" }}
        />
      ) : null}
    </PsGroup>
  );
}

function PurchasePlanPage() {
  const { upgrade } = usePs();
  const plan = usePlan();
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const going = useRef(false);
  const b = plan.data;
  const kind = b?.kind ?? "free";
  const info = planInfo(kind);
  const pro = isPro(kind);
  const closed = b ? !b.configured : false;
  /* A verified student sees the price checkout will charge. */
  const SP = priceStrings(undefined, { student: showsStudentPrices(b) });
  const hint = planHint(kind, SP);
  const student = useStudentEmail(plan.refetch);
  const panel = studentPanel(b, student.offer);

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

  const trial = async () => {
    if (going.current) return;
    going.current = true;
    setStarting(true);
    try {
      const r = await startTrial();
      if (r.ok) {
        await plan.refetch();
        notify.success(`Your ${P.trialDays}-day Pro trial has started`, {
          description: "No card needed.",
        });
      } else {
        notify.error(r.error);
        void plan.refetch();
      }
    } finally {
      going.current = false;
      setStarting(false);
    }
  };

  return (
    <>
      <section className="ps-plan-card" data-ps-plan-card={kind}>
        <span className="ps-plan-name">Your plan · {info.name}</span>
        <span className="ps-plan-line">{planLine(kind, b, SP)}</span>
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
        {offersTrial(b) || kind === "trial" ? (
          <span className="ps-plan-terms" data-ps-trial-terms="">
            {P.trialTerms}
          </span>
        ) : null}
        {b?.paymentFailed ? (
          <span
            className="ps-plan-terms"
            role="alert"
            data-ps-payment-failed=""
          >
            {failedPaymentLine(b)}
          </span>
        ) : null}
        {closed && !pro ? (
          <span className="ps-plan-terms" role="status">
            Checkout is not open yet. Plans will be available here as soon as
            billing is switched on.
          </span>
        ) : null}
        {kind === "free" && b?.trialEligible ? (
          <PkButton
            kind="primary"
            block
            disabled={starting}
            onClick={() => void trial()}
            data-ps-start-trial=""
          >
            {starting ? "Starting your trial…" : P.trialCta}
          </PkButton>
        ) : null}
        {kind === "free" || kind === "trial" ? (
          <PkButton
            kind={kind === "free" && b?.trialEligible ? "quiet" : "primary"}
            block
            onClick={() => upgrade()}
            data-ps-see-plans=""
          >
            {kind === "trial" ? "Choose a plan" : "See plans"}
          </PkButton>
        ) : null}
      </section>
      {kind === "free" ? (
        <PsGroup
          title="Plans"
          hint={[
            SP.student ? `${SP.studentLine}. Lifetime is not discounted.` : "",
            SP.renewalAll,
            SP.footnote,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <PsRow
            title="Pro Monthly"
            desc="Cancel any time"
            value={`${SP.monthly} / month`}
            onOpen={() => upgrade()}
            data={{ "data-ps-price": "monthly" }}
          />
          <PsRow
            title="Pro Yearly"
            desc={`${SP.yearlyPerMonth}/mo · Save ${SP.saveAmount}`}
            value={`${SP.yearly} / year`}
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
              title={
                b.paymentFailed ? "Manage billing" : "Invoices and payment"
              }
              disabled={busy}
              onOpen={() => void portal()}
              data={{ "data-ps-portal": "" }}
            />
          ) : null}
        </PsGroup>
      )}
      {panel ? (
        <PsGroup
          title="Student price"
          hint={[panel.note, "Lifetime is not discounted."]
            .filter(Boolean)
            .join(" ")}
        >
          <PsRow
            title="University email"
            desc={panel.line}
            value={
              panel.verified ? (
                <span className="ps-included">
                  <LuCheck size={13} aria-hidden />
                  On
                </span>
              ) : undefined
            }
          />
          {panel.canAdd ? (
            <PsRow
              title="Add a university email"
              desc={
                <>
                  <input
                    className="pl-field"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    aria-label="University email"
                    placeholder="name@university.edu"
                    maxLength={254}
                    value={student.draft}
                    disabled={student.busy}
                    onChange={(e) => student.setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void student.send();
                    }}
                    data-ps-student-email=""
                  />
                  {student.error ? (
                    <span role="alert">{student.error}</span>
                  ) : student.sentTo ? (
                    <span role="status" data-ps-student-sent="">
                      Check {student.sentTo} for a link. It works for 24 hours.
                    </span>
                  ) : null}
                </>
              }
              control={
                <PkButton
                  kind="chip"
                  disabled={student.busy || !student.draft.trim()}
                  onClick={() => void student.send()}
                >
                  {student.busy ? "Sending…" : "Send link"}
                </PkButton>
              }
            />
          ) : null}
        </PsGroup>
      ) : null}
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
