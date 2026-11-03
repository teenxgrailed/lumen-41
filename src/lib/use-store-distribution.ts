"use client";

import { useEffect, useSyncExternalStore } from "react";

import { isStoreDistribution } from "@/lib/native";

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
