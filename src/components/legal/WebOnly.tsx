"use client";

import type { ReactNode } from "react";

import { useStoreDistribution } from "@/lib/use-store-distribution";

/** What a store build says where the web terms state prices and how to buy. */
export const STORE_PLANS_NOTICE =
  "Needt Pro is not sold in this app. If you have Pro, the terms under which you bought it apply.";

/**
 * Terms of Service sections 5.1 and 5.2 (plans, prices, the free trial) in a
 * browser; in the iOS app and the Mac App Store build one neutral sentence in
 * their place (App Store Review Guidelines 3.1.1 and 3.1.3(f)). The rest of
 * the document is shown as is.
 */
export function WebOnly({ children }: { children: ReactNode }) {
  const store = useStoreDistribution();
  if (store)
    return <p className="mt-4 text-base leading-7">{STORE_PLANS_NOTICE}</p>;
  return <>{children}</>;
}
