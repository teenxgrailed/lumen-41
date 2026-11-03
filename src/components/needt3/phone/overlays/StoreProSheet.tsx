"use client";

/* The phone's sheet for a locked Pro feature in a store build (iOS app).
   Unless the App Store can sell it here: one sentence and Close, no price, no
   plan, no checkout, no link. In the iOS app, with the NeedtStore plugin and
   products from the server, it is the App Store purchase sheet (3.1.2) with
   StoreKit's own prices (see paywall/StoreProSheet). */
import { useRef, useState } from "react";

import { isAppleStoreAvailable } from "@/lib/native-store";
import {
  type AppleOfferState,
  useAppleOffer,
} from "@/lib/needt3/hooks/apple-iap";

import { AppleOfferLoading, AppleOfferPanel } from "../../paywall/AppleOffer";
import { STORE_PRO_LINE } from "../../paywall/StoreProSheet";
import { PkButton, PkSheet } from "../kit";

type Props = { open: boolean; onClose: () => void };

export function PkStoreProSheet(props: Props) {
  return isAppleStoreAvailable() ? (
    <PkAppleProSheet {...props} />
  ) : (
    <PkNeutralProSheet {...props} />
  );
}

function PkAppleProSheet({ open, onClose }: Props) {
  const live = useAppleOffer(open);
  /* The sheet slides away over a few frames: keep what it showed. */
  const last = useRef<AppleOfferState>(live);
  if (open) last.current = live;
  const offer = open ? live : last.current;
  /* Drag, scrim and Close do nothing while a purchase or restore runs. */
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  busyRef.current = busy;
  const close = () => {
    if (!busyRef.current) onClose();
  };
  if (offer.status === "unavailable") {
    return <PkNeutralProSheet open={open} onClose={onClose} />;
  }
  return (
    <PkSheet
      open={open}
      onClose={close}
      label="Needt Pro"
      title="Needt Pro"
      className="pov-store-pro"
    >
      <div className="pov-store-pro-in" data-pov-store-pro="">
        {offer.status === "loading" ? (
          <AppleOfferLoading />
        ) : (
          <AppleOfferPanel
            products={offer.products}
            onDone={onClose}
            onBusyChange={setBusy}
          />
        )}
        <PkButton
          kind="quiet"
          block
          data-pw-close=""
          disabled={busy}
          onClick={close}
        >
          Close
        </PkButton>
      </div>
    </PkSheet>
  );
}

function PkNeutralProSheet({ open, onClose }: Props) {
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
