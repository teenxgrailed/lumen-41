"use client";

/* The App Store purchase sheet's body, shared by the desktop sheet and the
   phone's (App Review Guideline 3.1.2). Every price, name and period on it is
   StoreKit's own (`products`); nothing here is a literal amount. It shows what
   Pro includes, that a subscription renews until it is cancelled in Settings,
   Terms of Use and Privacy links, and Restore Purchases. The purchase itself
   and its notices are `useAppleActions`. */
import { useEffect, useRef, useState } from "react";

import { LuCheck } from "react-icons/lu";

import { APPLE_PRODUCT_IDS, type StoreProduct } from "@/lib/native-store";
import {
  introLine,
  perPeriod,
  useAppleActions,
} from "@/lib/needt3/hooks/apple-iap";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { isPro, proIncludes } from "@/lib/needt3/paywall";
import { notify } from "@/lib/notifications";

/* The list comes from PLAN_LIMITS, the numbers the server enforces. */
const PRO = proIncludes();

/** Apple's standard licensed-application EULA: the Terms of Use of a purchase made through the App Store. */
export const APPLE_STANDARD_EULA =
  "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

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

/* Terms and Privacy open the way Settings → About opens /terms: a new window,
   which the installed app hands to the in-app browser (its Done button is the
   way back). The sheet stays where it is. */
function openLegal(url: string) {
  window.open(url, "_blank");
}

export function AppleOfferPanel({
  products,
  onDone,
  onBusyChange,
}: {
  products: StoreProduct[];
  /** The purchase or restore went through. */
  onDone: () => void;
  /** A purchase or restore is running: the sheet around must not close. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const [pick, setPick] = useState(() => defaultPick(products));
  const { busy, pending, buy, restore } = useAppleActions(onDone);
  const optRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const picked = products.find((p) => p.id === pick) ?? products[0];
  const renews = products.some((p) => p.type === "autoRenewable");
  const intro = picked ? introLine(picked) : null;
  const buying = busy !== null && busy !== "restore";

  const busyRef = useRef(onBusyChange);
  busyRef.current = onBusyChange;
  const isBusy = busy !== null;
  useEffect(() => {
    busyRef.current?.(isBusy);
  }, [isBusy]);
  useEffect(() => () => busyRef.current?.(false), []);

  /* Ask to Buy: the approval reaches the plan through the shell's transaction
     updates; once the plan reads Pro the sheet has done its job. */
  const plan = usePlan().data;
  const proNow = plan ? isPro(plan.kind) : false;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (!pending || !proNow) return;
    notify.success("Needt Pro is active.");
    doneRef.current();
  }, [pending, proNow]);

  const label = buying
    ? "Purchasing…"
    : picked?.type === "autoRenewable"
      ? "Subscribe"
      : "Buy";

  /* Radio group: one tab stop (the picked option), arrows move and pick. */
  const move = (from: number, step: number) => {
    const n = products.length;
    const next = (from + step + n) % n;
    const p = products[next];
    if (!p) return;
    setPick(p.id);
    optRefs.current[next]?.focus();
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (busy !== null) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      move(i, 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      move(i, -1);
    }
  };

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
        {products.map((p, i) => {
          const on = p.id === picked?.id;
          const per = perPeriod(p);
          return (
            <button
              key={p.id}
              ref={(el) => {
                optRefs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              className={"pw-apple-opt" + (on ? " is-on" : "")}
              data-pw-apple-product={p.id}
              disabled={busy !== null}
              onClick={() => setPick(p.id)}
              onKeyDown={(e) => onKey(e, i)}
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
        disabled={busy !== null || pending || !picked}
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
        <button
          type="button"
          className="pw-apple-link"
          data-pw-apple-terms=""
          onClick={() => openLegal(APPLE_STANDARD_EULA)}
        >
          Terms of Use
        </button>
        <button
          type="button"
          className="pw-apple-link"
          data-pw-apple-privacy=""
          onClick={() => openLegal("/privacy")}
        >
          Privacy Policy
        </button>
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
