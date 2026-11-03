"use client";

/* The App Store purchase flow as the Pro sheet and the Plan screens use it.
   Everything native lives in `@/lib/native-store`; this file is the React side:
   what to offer (`useAppleOffer`), what a tap does (`useAppleActions`), what a
   refusal says (`appleFailureText`) and the one background subscription that
   posts renewals and Ask to Buy approvals (`useAppleTransactionUpdates`). */
import { useCallback, useEffect, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import {
  type AppleFailure,
  type StorePeriod,
  type StoreProduct,
  buyWithApple,
  isAppleStoreAvailable,
  loadAppleOffer,
  manageAppleSubscriptions,
  restoreApplePurchases,
  subscribeAppleTransactionUpdates,
} from "@/lib/native-store";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

export type AppleOfferState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; products: StoreProduct[] };

/**
 * The products StoreKit can sell this account. `active` false (a sheet that is
 * shut, no plugin) reads "unavailable" and asks nobody; true loads on every
 * change so the sheet always shows today's prices. "unavailable" also means
 * Apple purchases are off on the server or StoreKit returned nothing: the
 * caller keeps its neutral sheet.
 */
export function useAppleOffer(active: boolean): AppleOfferState {
  const [state, setState] = useState<AppleOfferState>({ status: "loading" });
  /* A new open starts from "loading" in the same render, so the last answer
     never shows for a frame. */
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setState({ status: "loading" });
  }
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    setState({ status: "loading" });
    void loadAppleOffer()
      .then((products) => {
        if (!live) return;
        setState(
          products.length > 0
            ? { status: "ready", products }
            : { status: "unavailable" }
        );
      })
      .catch(() => {
        if (live) setState({ status: "unavailable" });
      });
    return () => {
      live = false;
    };
  }, [active]);
  return active ? state : { status: "unavailable" };
}

/** What a refused purchase or restore tells the person. `null`: say nothing. */
export function appleFailureText(f: AppleFailure): string | null {
  if (f.reason === "cancelled") return null;
  if (f.code === "CREEM_ACTIVE") return "Your Pro plan is already active.";
  if (f.code === "APPLE_TRANSACTION_IN_USE") {
    return "This App Store purchase belongs to another Needt account.";
  }
  return f.message;
}

const UNIT: Record<StorePeriod["unit"], string> = {
  day: "day",
  week: "week",
  month: "month",
  year: "year",
  unknown: "",
};

/** "month", "3 months": StoreKit's own period, in words. */
export function periodWords(p: StorePeriod | undefined, count = 1): string {
  if (!p || p.unit === "unknown") return "";
  const n = Math.max(1, p.value) * Math.max(1, count);
  const unit = UNIT[p.unit];
  return n === 1 ? unit : `${n} ${unit}s`;
}

/** "per month" for a subscription, "" for anything else. */
export function perPeriod(p: StoreProduct): string {
  if (p.type !== "autoRenewable") return "";
  const words = periodWords(p.period);
  if (!words) return "";
  return /^\d/.test(words) ? `every ${words}` : `per ${words}`;
}

/** The introductory offer in words, from StoreKit's fields; `null` for none. */
export function introLine(p: StoreProduct): string | null {
  const o = p.introOffer;
  if (!o) return null;
  const span = periodWords(o.period, o.periodCount);
  if (!span) return null;
  const then = `${p.displayPrice} ${perPeriod(p)}`.trim();
  return o.paymentMode === "freeTrial"
    ? `${span} free, then ${then}`
    : `${o.displayPrice} for ${span}, then ${then}`;
}

/**
 * Buy and Restore for the Pro sheet and the Plan screens. Both read the plan
 * again when they succeed. A cancelled purchase says nothing; Ask to Buy sets
 * `pending`; every other refusal is a notice with the server's own words.
 */
export function useAppleActions(onDone?: () => void) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(
    () => qc.invalidateQueries({ queryKey: qk.plan() }),
    [qc]
  );

  const buy = useCallback(
    async (productId: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(productId);
      setPending(false);
      try {
        const r = await buyWithApple(productId);
        if (r.ok) {
          await refresh();
          notify.success("Needt Pro is active.");
          doneRef.current?.();
        } else if (r.reason === "pending") {
          if (alive.current) setPending(true);
        } else {
          const text = appleFailureText(r);
          if (text) notify.error(text);
        }
      } finally {
        busyRef.current = false;
        if (alive.current) setBusy(null);
      }
    },
    [refresh]
  );

  const restore = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("restore");
    setPending(false);
    try {
      const r = await restoreApplePurchases();
      if (r.ok) {
        await refresh();
        notify.success("Purchases restored.");
        doneRef.current?.();
      } else if (r.reason === "empty") {
        notify.info("No purchases to restore.");
      } else {
        const text = appleFailureText(r);
        if (text) notify.error(text);
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(null);
    }
  }, [refresh]);

  return { busy, pending, buy, restore };
}

/** "Manage in App Store": the system subscription sheet. */
export async function openAppleSubscriptions(): Promise<void> {
  const ok = await manageAppleSubscriptions();
  if (!ok) notify.error("Subscriptions could not be opened.");
}

/**
 * The App Store rows of the Plan screens in a store build. Restore needs the
 * plugin and an offer the server has switched on; Manage needs the plugin and
 * an App Store plan (`source` from `GET /api/billing`), and stays after the
 * server stops selling so a subscriber can still cancel.
 */
export function useApplePlanRows(source: "creem" | "apple" | null | undefined) {
  const available = isAppleStoreAvailable();
  const offer = useAppleOffer(available);
  const { busy, restore } = useAppleActions();
  return {
    canRestore: available && offer.status === "ready",
    canManage: available && source === "apple",
    restoring: busy === "restore",
    restore: () => void restore(),
    manage: () => void openAppleSubscriptions(),
  };
}

/**
 * Mounted once in the signed-in shell: in the iOS app it posts every renewal,
 * Ask to Buy approval and unfinished purchase, and reads the plan again after
 * each accepted one. Stops on unmount.
 */
export function useAppleTransactionUpdates(): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!isAppleStoreAvailable()) return undefined;
    return subscribeAppleTransactionUpdates(() => {
      void qc.invalidateQueries({ queryKey: qk.plan() });
    });
  }, [qc]);
}
