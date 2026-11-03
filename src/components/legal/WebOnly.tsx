"use client";

import type { ReactNode } from "react";

import {
  useAppStoreSells,
  useStoreDistribution,
} from "@/lib/use-store-distribution";

/** What a store build says where the web terms state prices and how to buy. */
export const STORE_PLANS_NOTICE =
  "Needt Pro is not sold in this app. If you have Pro, the terms under which you bought it apply.";

/**
 * `appleIap` on every block is the server's `apple_iap` flag, read when the
 * page is served (`LegalDocument`). It is one value for the whole page, so the
 * blocks agree with each other.
 */
type Props = { children: ReactNode; appleIap: boolean };

/**
 * Terms of Service sections 5.1 and 5.2 (plans, prices, the free trial) in a
 * browser; in the iOS app and the Mac App Store build one neutral sentence in
 * their place (App Store Review Guidelines 3.1.1 and 3.1.3(f)). Where the App
 * Store sells that sentence would be false, so the block gives way to the App
 * Store subsection (`AppStoreOnly`) instead. The rest of the document is shown
 * as is.
 */
export function WebOnly({ children, appleIap }: Props) {
  const store = useStoreDistribution();
  const sells = useAppStoreSells(appleIap);
  if (sells) return null;
  if (store)
    return <p className="mt-4 text-base leading-7">{STORE_PLANS_NOTICE}</p>;
  return <>{children}</>;
}

/**
 * Text about buying in the App Store (Terms of Service section 5.7): shown
 * only while App Store purchases are on (`apple_iap`). A browser then shows it
 * next to the website text, so people can read it before they install; a
 * store build shows it only where it can sell (the iOS app), and the Mac App
 * Store build keeps the neutral sentence from `WebOnly`.
 */
export function AppStoreOnly({ children, appleIap }: Props) {
  const store = useStoreDistribution();
  const sells = useAppStoreSells(appleIap);
  if (store ? !sells : !appleIap) return null;
  return <>{children}</>;
}

/**
 * Terms of Service sections 5.3 to 5.6 (Creem as the seller, renewal, refunds
 * and price changes for plans bought on the website): shown everywhere except
 * where the App Store sells, where section 5.7 is the text about buying.
 */
export function WebBillingOnly({ children, appleIap }: Props) {
  if (useAppStoreSells(appleIap)) return null;
  return <>{children}</>;
}
