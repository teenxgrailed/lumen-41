"use client";

/* What a locked Pro feature opens in a store build (iOS app, Mac App Store).
   No price, no plan card, no checkout, no trial step and no link: Pro is
   unlocked by the account alone, so the sheet only says what this is and
   closes (App Store Review Guidelines 3.1.1 and 3.1.3(f)). */
import { useEffect } from "react";

export const STORE_PRO_LINE = "This is part of Needt Pro.";

export function StoreProSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
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
