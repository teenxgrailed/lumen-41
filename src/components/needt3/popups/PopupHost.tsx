"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { logger } from "@/lib/logger";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { priceStrings } from "@/lib/needt3/pricing";
import { showsStudentPrices } from "@/lib/needt3/student-prices";
import {
  LIMIT_HIT_EVENT,
  type LimitHitDetail,
} from "@/lib/popups/client";
import type {
  PopupLimit,
  PopupPlanCard,
  PopupView,
} from "@/lib/popups/types";
import { useStoreDistribution } from "@/lib/use-store-distribution";
import { getAppVersion } from "@/lib/version";

import { openPaywall } from "../paywall/store";
import { usePhoneUi } from "../root/phone-ui-context";
import { PopupCard } from "./PopupCard";
import {
  canShowPopup,
  markPopupShown,
  popupContext,
  popupPlatform,
} from "./gate";

const LOG_SOURCE = "PopupHost";

/** The first look waits for the app to settle after load. */
const FIRST_CHECK_MS = 5_000;
/** A check that found the app busy tries again, a few times. */
const RETRY_MS = 30_000;
const MAX_TRIES = 6;
/** The exit animation of the sheet. */
const EXIT_MS = 220;

async function sendEvent(id: string, event: "shown" | "dismiss" | "click") {
  try {
    await fetch(`/api/popups/${encodeURIComponent(id)}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
      keepalive: true,
    });
  } catch (error) {
    logger.warn(
      "Could not report a popup event",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
  }
}

async function fetchNext(limit: PopupLimit | null): Promise<PopupView | null> {
  const ctx = popupContext();
  const q = new URLSearchParams({
    platform: popupPlatform(),
    appVersion: getAppVersion(),
    onboarding: ctx.inOnboarding ? "1" : "0",
    focus: ctx.inFocus ? "1" : "0",
    dialog: ctx.dialogOpen ? "1" : "0",
    session: ctx.shownThisSession ? "1" : "0",
  });
  if (limit) q.set("limit", limit);
  try {
    const res = await fetch(`/api/popups/next?${q}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { popup: PopupView | null };
    return body.popup ?? null;
  } catch {
    return null;
  }
}

/**
 * Mounted once in the permanent hosts. Two ways in, one shell and one set of
 * rules (the server's `pickPopup`):
 * - a quiet check a few seconds after load (announcements, a trial ending);
 * - a limit hit, reported by `reportLimitHit(limit)`, shown at once.
 */
export function PopupHost() {
  const router = useRouter();
  const phone = usePhoneUi() === "phone";
  const store = useStoreDistribution();
  const { data: plan } = usePlan();
  const prices = priceStrings(undefined, {
    student: showsStudentPrices(plan),
  });
  const lifetimeOpen = plan?.lifetimeAvailable !== false;

  const [popup, setPopup] = useState<PopupView | null>(null);
  const [open, setOpen] = useState(false);
  const busy = useRef(false);
  const leaving = useRef<number | null>(null);

  const show = useCallback((next: PopupView) => {
    markPopupShown();
    setPopup(next);
    setOpen(true);
    void sendEvent(next.id, "shown");
  }, []);

  const close = useCallback((event: "dismiss" | "click") => {
    setOpen(false);
    setPopup((current) => {
      if (current) void sendEvent(current.id, event);
      return current;
    });
    if (leaving.current) window.clearTimeout(leaving.current);
    leaving.current = window.setTimeout(() => setPopup(null), EXIT_MS);
  }, []);

  const check = useCallback(
    async (limit: PopupLimit | null) => {
      if (busy.current || !canShowPopup()) return false;
      busy.current = true;
      try {
        const next = await fetchNext(limit);
        // The page may have opened a dialog while the answer was in flight.
        if (next && canShowPopup()) {
          show(next);
          return true;
        }
        return false;
      } finally {
        busy.current = false;
      }
    },
    [show]
  );

  // The quiet check: once after load, retried while the app is busy.
  useEffect(() => {
    let tries = 0;
    let timer: number | undefined;
    let stopped = false;
    const run = async () => {
      if (stopped) return;
      tries += 1;
      if (canShowPopup()) {
        await check(null);
        return;
      }
      if (tries < MAX_TRIES) timer = window.setTimeout(run, RETRY_MS);
    };
    timer = window.setTimeout(run, FIRST_CHECK_MS);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [check]);

  // A limit hit: shown immediately, no waiting.
  useEffect(() => {
    const onHit = (event: Event) => {
      const limit = (event as CustomEvent<LimitHitDetail>).detail?.limit;
      if (limit) void check(limit);
    };
    window.addEventListener(LIMIT_HIT_EVENT, onHit);
    return () => window.removeEventListener(LIMIT_HIT_EVENT, onHit);
  }, [check]);

  useEffect(
    () => () => {
      if (leaving.current) window.clearTimeout(leaving.current);
    },
    []
  );

  if (!popup) return null;

  const onPrimary = () => {
    const cta = popup.primary;
    close("click");
    if (!cta) return;
    if (cta.action === "paywall") openPaywall({ feature: popup.feature });
    else if (cta.href) router.push(cta.href);
  };

  const onCard = (card: PopupPlanCard) => {
    close("click");
    openPaywall({ cycle: card.pick, feature: popup.feature });
  };

  return (
    <PopupCard
      popup={popup}
      open={open}
      phone={phone}
      store={store}
      prices={prices}
      lifetimeOpen={lifetimeOpen}
      onDismiss={() => close("dismiss")}
      onPrimary={onPrimary}
      onCard={onCard}
    />
  );
}
