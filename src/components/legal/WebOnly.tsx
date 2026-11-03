"use client";

import type { ReactNode } from "react";

import {
  useAppleSheetAvailable,
  useStoreDistribution,
} from "@/lib/use-store-distribution";

/** What a store build says where the web terms state prices and how to buy. */
export const STORE_PLANS_NOTICE =
  "Needt Pro is not sold in this app. If you have Pro, the terms under which you bought it apply.";

/**
 * Terms of Service sections 5.1 and 5.2 (plans, prices, the free trial) in a
 * browser; in the iOS app and the Mac App Store build one neutral sentence in
 * their place (App Store Review Guidelines 3.1.1 and 3.1.3(f)). When the App
 * Store purchase sheet is available that sentence would be false, so the block
 * gives way to the App Store subsection (`AppStoreOnly`) instead. The rest of
 * the document is shown as is.
 */
export function WebOnly({ children }: { children: ReactNode }) {
  const store = useStoreDistribution();
  const sheet = useAppleSheetAvailable();
  if (store && sheet) return null;
  if (store)
    return <p className="mt-4 text-base leading-7">{STORE_PLANS_NOTICE}</p>;
  return <>{children}</>;
}

/**
 * Text about buying in the App Store (Terms of Service section 5.7): shown in a
 * browser, so people can read it before they install, and in a store build
 * only while the purchase sheet is available. A store build that cannot sell
 * (flag off, Mac App Store, plugin missing) shows nothing here and keeps the
 * neutral sentence from `WebOnly`.
 */
export function AppStoreOnly({ children }: { children: ReactNode }) {
  const store = useStoreDistribution();
  const sheet = useAppleSheetAvailable();
  if (store && !sheet) return null;
  return <>{children}</>;
}

/**
 * Terms of Service sections 5.3 to 5.6 (Creem as the seller, renewal, refunds
 * and price changes for plans bought on the website): shown in a browser and in
 * a store build that cannot sell, where the notice points a Pro owner to the
 * terms they bought under. Where the App Store sells, nobody reading has a
 * website plan to manage (the offer is empty for them), so only section 5.7
 * speaks about buying.
 */
export function WebBillingOnly({ children }: { children: ReactNode }) {
  const store = useStoreDistribution();
  const sheet = useAppleSheetAvailable();
  if (store && sheet) return null;
  return <>{children}</>;
}
