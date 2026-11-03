"use client";

/* What a locked Pro feature opens in a store build (iOS app, Mac App Store).
   Unless the App Store can sell it here there is no price, no plan card, no
   checkout, no trial step and no link: Pro is unlocked by the account alone,
   so the sheet only says what this is and closes (App Store Review Guidelines
   3.1.1 and 3.1.3(f)).

   In the iOS app, when the NeedtStore plugin is there and the server lists
   products (`GET /api/billing/apple/account-token`), it is the App Store
   purchase sheet instead (3.1.2): StoreKit's own prices, what Pro includes,
   renewal terms, Terms and Privacy, Restore Purchases. If either is missing it
   stays the neutral sheet. The Mac App Store build has no StoreKit bridge yet,
   so it is always the neutral sheet. */
import { useEffect, useRef } from "react";

import { LuX } from "react-icons/lu";

import { isAppleStoreAvailable } from "@/lib/native-store";
import { useAppleOffer } from "@/lib/needt3/hooks/apple-iap";

import { AppleOfferLoading, AppleOfferPanel } from "./AppleOffer";

export const STORE_PRO_LINE = "This is part of Needt Pro.";

export function StoreProSheet(props: { open: boolean; onClose: () => void }) {
  return isAppleStoreAvailable() ? (
    <AppleProSheet {...props} />
  ) : (
    <NeutralProSheet {...props} />
  );
}

function AppleProSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const offer = useAppleOffer(open);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const shown = open && offer.status !== "unavailable";
  useEffect(() => {
    if (!shown) return undefined;
    /* The sheet takes focus and gives it back to whatever opened it. */
    const before = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      before?.focus?.({ preventScroll: true });
    };
  }, [shown]);

  if (offer.status === "unavailable") {
    return <NeutralProSheet open={open} onClose={onClose} />;
  }
  if (!open) return null;
  return (
    <div
      className="pw-scrim"
      data-pw-open="1"
      data-pw-store=""
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="pw-store pw-store-apple"
        role="dialog"
        aria-modal="true"
        aria-label="Needt Pro"
      >
        <div className="pw-store-head">
          <span className="pw-store-kicker">Needt Pro</span>
          <button
            type="button"
            className="pw-store-x"
            aria-label="Close"
            data-pw-close=""
            onClick={onClose}
          >
            <LuX size={15} />
          </button>
        </div>
        {offer.status === "loading" ? (
          <AppleOfferLoading />
        ) : (
          <AppleOfferPanel products={offer.products} onDone={onClose} />
        )}
      </div>
    </div>
  );
}

function NeutralProSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    /* The sheet takes focus, keeps it (Close is its only control) and gives it
       back to whatever opened it. Escape closes. */
    const before = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === "Tab") {
        e.preventDefault();
        closeRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="pw-scrim"
      data-pw-open="1"
      data-pw-store=""
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="pw-store"
        role="dialog"
        aria-modal="true"
        aria-label="Needt Pro"
      >
        <span className="pw-store-kicker">Needt Pro</span>
        <p className="pw-store-line">{STORE_PRO_LINE}</p>
        <button
          ref={closeRef}
          type="button"
          className="pw-btn is-secondary pw-store-close"
          data-pw-close=""
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
