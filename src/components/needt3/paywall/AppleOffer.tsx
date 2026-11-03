"use client";

/* The App Store purchase sheet's body, shared by the desktop sheet and the
   phone's (App Review Guideline 3.1.2). Every price, name and period on it is
   StoreKit's own (`products`); nothing here is a literal amount. It shows what
   Pro includes, that a subscription renews until it is cancelled in Settings,
   Terms of Use and Privacy links, and Restore Purchases. The purchase itself
   and its notices are `useAppleActions`. */
import { useState } from "react";

import { LuCheck } from "react-icons/lu";

import { APPLE_PRODUCT_IDS, type StoreProduct } from "@/lib/native-store";
import {
  introLine,
  perPeriod,
  useAppleActions,
} from "@/lib/needt3/hooks/apple-iap";
import { proIncludes } from "@/lib/needt3/paywall";

/* The list comes from PLAN_LIMITS, the numbers the server enforces. */
const PRO = proIncludes();

/** Yearly if the App Store offers it, else the first product. */
function defaultPick(products: StoreProduct[]): string {
  return (
    products.find((p) => p.id === APPLE_PRODUCT_IDS.proYearly)?.id ??
    products[0]?.id ??
    ""
  );
}

export const APPLE_RENEWAL_TEXT =
  "Subscriptions renew automatically until cancelled. Payment is charged to your Apple ID when you confirm the purchase, and again each period unless you cancel at least 24 hours before it ends. Manage or cancel in Settings → Apple ID → Subscriptions.";

export function AppleOfferLoading() {
  return (
    <p className="pw-apple-note" role="status" data-pw-apple-loading="">
      Loading prices from the App Store…
    </p>
  );
}

export function AppleOfferPanel({
  products,
  onDone,
}: {
  products: StoreProduct[];
  /** The purchase or restore went through. */
  onDone: () => void;
}) {
  const [pick, setPick] = useState(() => defaultPick(products));
  const { busy, pending, buy, restore } = useAppleActions(onDone);
  const picked = products.find((p) => p.id === pick) ?? products[0];
  const renews = products.some((p) => p.type === "autoRenewable");
  const intro = picked ? introLine(picked) : null;
  const buying = busy !== null && busy !== "restore";
  const label = buying
    ? "Purchasing…"
    : picked?.type === "autoRenewable"
      ? "Subscribe"
      : "Buy";
  return (
    <div className="pw-apple" data-pw-apple="">
      <ul className="pw-list pw-apple-feats">
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
      <div
        className="pw-apple-opts"
        role="radiogroup"
        aria-label="Needt Pro plans"
      >
        {products.map((p) => {
          const on = p.id === picked?.id;
          const per = perPeriod(p);
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={"pw-apple-opt" + (on ? " is-on" : "")}
              data-pw-apple-product={p.id}
              disabled={busy !== null}
              onClick={() => setPick(p.id)}
            >
              <span className={"pw-radio" + (on ? " is-on" : "")} aria-hidden />
              <span className="pw-apple-name">
                <span>{p.displayName}</span>
                {p.type !== "autoRenewable" ? (
                  <span className="pw-apple-sub">One-time purchase</span>
                ) : null}
              </span>
              <span className="pw-apple-price">
                <span data-pw-apple-price={p.id}>{p.displayPrice}</span>
                {per ? <span className="pw-apple-sub">{per}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {intro ? (
        <p className="pw-apple-note" data-pw-apple-intro="">
          {intro}
        </p>
      ) : null}
      {pending ? (
        <p className="pw-apple-note" role="status" data-pw-apple-pending="">
          Waiting for approval from the App Store. Pro turns on once it is
          approved.
        </p>
      ) : null}
      <button
        type="button"
        className="pw-btn is-primary pw-btn-lg"
        data-pw-apple-buy=""
        disabled={busy !== null || !picked}
        onClick={() => picked && void buy(picked.id)}
      >
        {label}
      </button>
      {renews ? (
        <p className="pw-apple-fine" data-pw-apple-renewal="">
          {APPLE_RENEWAL_TEXT}
        </p>
      ) : null}
      <div className="pw-apple-links">
        <a href="/terms" target="_blank" rel="noopener">
          Terms of Use
        </a>
        <a href="/privacy" target="_blank" rel="noopener">
          Privacy Policy
        </a>
        <button
          type="button"
          className="pw-apple-link"
          data-pw-apple-restore=""
          disabled={busy !== null}
          onClick={() => void restore()}
        >
          {busy === "restore" ? "Restoring…" : "Restore Purchases"}
        </button>
      </div>
    </div>
  );
}
