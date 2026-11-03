"use client";

/* The phone's sheet for a locked Pro feature in a store build (iOS app): one
   sentence and Close. No price, no plan, no checkout, no link. */
import { STORE_PRO_LINE } from "../../paywall/StoreProSheet";
import { PkButton, PkSheet } from "../kit";

export function PkStoreProSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <PkSheet
      open={open}
      onClose={onClose}
      label="Needt Pro"
      title="Needt Pro"
      className="pov-store-pro"
    >
      <div className="pov-store-pro-in" data-pov-store-pro="">
        <p className="pov-store-pro-line">{STORE_PRO_LINE}</p>
        <PkButton kind="primary" block data-pw-close="" onClick={onClose}>
          Close
        </PkButton>
      </div>
    </PkSheet>
  );
}
