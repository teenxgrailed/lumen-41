"use client";

import { Paywall } from "./Paywall";
import { closePaywall, usePaywallStore } from "./store";

/** Mounted once inside the v3 frame (V3Root); `openPaywall()` opens it. */
export function PaywallHost() {
  const { open, cycle, feature } = usePaywallStore();
  return (
    <Paywall
      open={open}
      cycle={cycle}
      feature={feature}
      onClose={closePaywall}
    />
  );
}
