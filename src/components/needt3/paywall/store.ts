import { create } from "zustand";

import { type PaywallPick, paywallPick } from "@/lib/needt3/paywall";

/**
 * The one paywall for the whole window. `openPaywall("Plan my day")` opens it
 * from a locked feature (the sheet then says "Unlock Plan my day with Pro");
 * `openPaywall({ cycle, feature })` preselects a card too. Never opened on
 * load: only a click calls this.
 */
interface PaywallState {
  open: boolean;
  cycle: PaywallPick;
  feature: string | null;
  show: (opts?: string | { cycle?: string; feature?: string | null }) => void;
  close: () => void;
}

export const usePaywallStore = create<PaywallState>((set) => ({
  open: false,
  cycle: "annual",
  feature: null,
  show: (opts) => {
    const o = typeof opts === "string" ? { feature: opts } : (opts ?? {});
    set({
      open: true,
      cycle: paywallPick(o.cycle),
      feature: o.feature ?? null,
    });
  },
  close: () => set({ open: false }),
}));

export function openPaywall(
  opts?: string | { cycle?: string; feature?: string | null }
) {
  usePaywallStore.getState().show(opts);
}

export function closePaywall() {
  usePaywallStore.getState().close();
}
