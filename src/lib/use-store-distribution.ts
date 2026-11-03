"use client";

import { useEffect, useSyncExternalStore } from "react";

import { isStoreDistribution } from "@/lib/native";
import { isAppleStoreAvailable } from "@/lib/native-store";

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
 * True when this window can sell Pro through the App Store: a store build
 * with the `NeedtStore` StoreKit bridge (the iOS app), and `appleIap`, the
 * server's `apple_iap` flag, which the page reads when it is served. The
 * answer is the same for every reader and every block on the page: it does
 * not depend on the account or on a request, so the terms never show both
 * the website and the App Store wording, or neither. False on the server and
 * during hydration, like `useStoreDistribution`.
 */
export function useAppStoreSells(appleIap: boolean): boolean {
  const store = useStoreDistribution();
  const bridge = useSyncExternalStore(
    noSubscribe,
    isAppleStoreAvailable,
    () => false
  );
  return appleIap && store && bridge;
}
