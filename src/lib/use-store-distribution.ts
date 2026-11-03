"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { isStoreDistribution } from "@/lib/native";
import { isAppleStoreAvailable, loadAppleOffer } from "@/lib/native-store";

const noSubscribe = () => () => undefined;

/**
 * True in a store build (iOS shell, Mac App Store build): the page must show no
 * purchase UI at all. False on the server and on the first client render, so
 * hydration matches, then the real answer on the next paint.
 */
export function useStoreDistribution(): boolean {
  return useSyncExternalStore(noSubscribe, isStoreDistribution, () => false);
}

/**
 * False on the server and during hydration, true once the client's own answer
 * is in. An effect that would start a purchase request waits for it, because
 * `useStoreDistribution()` still reads false until then.
 */
export function useStoreResolved(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
}

/**
 * Marks `<html data-store-distribution>` once on the client, for CSS that
 * only has to tidy a gap. Never the way purchase UI is hidden: a hidden link
 * is still a link, so the components do not render it.
 */
export function useMarkStoreDistribution(): void {
  useEffect(() => {
    if (isStoreDistribution()) {
      document.documentElement.setAttribute("data-store-distribution", "");
    }
  }, []);
}

/**
 * True when the App Store purchase sheet can sell Pro in this window: the iOS
 * app, the `NeedtStore` plugin present, and the server (`apple_iap` on for this
 * account) listing products that StoreKit knows. This is the test the Pro
 * sheet uses, so the terms describe App Store purchases exactly when the app
 * offers them. False on the server, in a browser, in the Mac App Store build
 * (no StoreKit bridge), and until the answer is in.
 */
export function useAppleSheetAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!isStoreDistribution() || !isAppleStoreAvailable()) return undefined;
    let live = true;
    loadAppleOffer()
      .then((products) => {
        if (live) setAvailable(products.length > 0);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return available;
}
