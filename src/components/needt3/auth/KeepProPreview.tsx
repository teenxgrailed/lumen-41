"use client";

import * as React from "react";

import { KeepProCard } from "@/components/needt3/paywall/KeepProCard";

import { addCalendarDays, newDate } from "@/lib/date-utils";
import {
  type PaywallPick,
  keepProCopy,
  keepProItems,
} from "@/lib/needt3/paywall";
import { priceStrings } from "@/lib/needt3/pricing";

import { AuthScope } from "./AuthScope";

/**
 * TEMPORARY review page (`/start?preview=keep&state=trial|ended|free`): the
 * Keep Pro card with fixed facts and no account, for the design shots. It
 * does nothing: the button and the box are inert.
 */
export function KeepProPreview({ state }: { state?: string }) {
  const [pick, setPick] = React.useState<PaywallPick>("annual");
  const [waiver, setWaiver] = React.useState(false);
  const D = priceStrings();
  const cycle = pick === "monthly" ? "monthly" : "annual";
  const copy = keepProCopy(
    state === "ended"
      ? { kind: "free", trialEligible: false }
      : state === "free"
        ? { kind: "free", trialEligible: true }
        : {
            kind: "trial",
            trialEndsAt: addCalendarDays(newDate(), 3).toISOString(),
          }
  );
  return (
    <AuthScope>
      <div className="kp-scrim kp-sky" data-keep-pro-preview={state ?? "trial"}>
        <div className="kp-col">
          <KeepProCard
            title={copy.title}
            line={copy.line}
            pick={pick}
            onPick={setPick}
            cycle={cycle}
            prices={D}
            lifetimeLeft={212}
            lifetimeOpen
            items={keepProItems()}
            waiver={
              <label className="auth-age kp-waiver">
                <input
                  type="checkbox"
                  checked={waiver}
                  onChange={(e) => setWaiver(e.target.checked)}
                />
                <span>
                  Start {pick === "lifetime" ? "Lifetime" : "Pro"} now. I
                  understand the statutory withdrawal right ends once it starts.
                  Our 14-day refund still applies. Terms
                </span>
              </label>
            }
            cta={{
              label:
                pick === "lifetime"
                  ? `Get Lifetime · ${D.lifetime}`
                  : cycle === "monthly"
                    ? `Choose Pro · ${D.monthly} / month`
                    : `Choose Pro · ${D.yearly} / year`,
              disabled: !waiver,
              onClick: () => undefined,
              sub: null,
              terms:
                pick === "lifetime"
                  ? D.renewalLifetime
                  : cycle === "monthly"
                    ? D.renewalMonthly
                    : D.renewalYearly,
            }}
            onClose={() => undefined}
          />
        </div>
      </div>
    </AuthScope>
  );
}
