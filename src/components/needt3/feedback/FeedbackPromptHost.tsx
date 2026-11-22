"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePathname } from "next/navigation";

import { newDate } from "@/lib/date-utils";
import { isDesktopApp, isMacApp } from "@/lib/desktop";
import {
  PROMPT_DELAY_MS,
  markPromptedThisSession,
  markSkippedToday,
  promptedThisSession,
  reviewChannel,
  skippedToday,
} from "@/lib/feedback/prompt";
import { logger } from "@/lib/logger";
import { isIosApp } from "@/lib/native";
import {
  canRequestNativeReview,
  requestNativeReview,
} from "@/lib/native-store";
import { getAppVersion } from "@/lib/version";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { usePaywallStore } from "../paywall";
import {
  FeedbackPopup,
  PRODUCT_HUNT_LABEL,
  type FeedbackAnswer as PopupAnswer,
  type FeedbackKind as PopupKind,
  type ReviewRoute,
} from "../popups";
import { usePhoneUi } from "../root/phone-ui-context";
import { useFeedbackPrompt } from "./use-feedback-prompt";

const LOG_SOURCE = "FeedbackPromptHost";

type Platform = "web" | "ios" | "mac" | "desktop";

function platformNow(): Platform {
  if (isIosApp()) return "ios";
  if (isMacApp()) return "mac";
  if (isDesktopApp()) return "desktop";
  return "web";
}

/**
 * Another modal is open on the page (a desktop sheet or a phone sheet). Our
 * own popup is a dialog too, so a dialog that holds it does not count, and a
 * dialog that is mounted but not drawn does not either.
 */
function otherDialogOpen(): boolean {
  const dialogs = document.querySelectorAll<HTMLElement>(
    '[role="dialog"], [role="alertdialog"], [aria-modal="true"]'
  );
  for (const dialog of Array.from(dialogs)) {
    if (dialog.querySelector('[data-pp^="feedback"]')) continue;
    if (dialog.closest("[aria-hidden='true']")) continue;
    if (dialog.getClientRects().length === 0) continue;
    if (getComputedStyle(dialog).visibility === "hidden") continue;
    return true;
  }
  return false;
}

/** The routes where a person is in the middle of something else. */
function quietRoute(pathname: string | null): boolean {
  return !!pathname && /^\/(setup|login|signin|signup)(\/|$)/.test(pathname);
}

/**
 * The occasional "how is Needt?" popup, mounted once in the permanent hosts
 * for the phone and the desktop alike. The server decides whether this person
 * is asked at all (`GET /api/feedback/prompt`: active, not new, not within 14
 * days of the last one, setting on); this host decides only the moment:
 *
 * - about 20 s after the app loads, at an idle moment;
 * - never during onboarding or Focus, and never over another dialog: it waits
 *   until those are gone, then shows;
 * - once per browser session, and the server is asked once per page load.
 *
 * Answers go to the admin panel only. A 5 of 5 or an NPS of 9 or 10 earns a
 * second step, "Leave a review?", where the platform has somewhere to send it.
 */
export function FeedbackPromptHost() {
  const ui = usePhoneUi();
  const phone = ui === "phone";
  const pathname = usePathname();
  const storeBlocked = useNeedt3Ui(
    (s) =>
      s.settingsOpen ||
      s.paletteOpen ||
      s.composerOpen ||
      s.focusOpen ||
      (phone && s.askOpen)
  );
  const paywall = usePaywallStore((s) => s.open);
  const blocked = storeBlocked || paywall || quietRoute(pathname);

  // Set once an answer is saved: closing after that is "done", not a dismissal.
  const answered = useRef(false);
  const { prompt, setPrompt, fetchPrompt, send, dismiss } = useFeedbackPrompt();
  const asked = useRef(false);
  // A dialog that opens after the prompt was fetched (it is not in the store
  // flags above) hides the popup until it is gone.
  const [domBlocked, setDomBlocked] = useState(false);
  useEffect(() => {
    if (!prompt) return;
    const read = () => setDomBlocked(otherDialogOpen());
    read();
    const id = window.setInterval(read, 1000);
    return () => window.clearInterval(id);
  }, [prompt]);

  useEffect(() => {
    if (asked.current || prompt || blocked) return;
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    let idle: number | null = null;
    const timer = window.setTimeout(() => {
      const run = () => {
        // The dialog check is last and live: the store flags cannot see a
        // Radix sheet some other part of the app opened.
        if (
          document.visibilityState !== "visible" ||
          otherDialogOpen() ||
          promptedThisSession(safeSession()) ||
          skippedToday(safeLocal(), newDate())
        )
          return;
        asked.current = true;
        void fetchPrompt({
          platform: platformNow(),
          appVersion: getAppVersion(),
        }).then((offered) => {
          // Only the server's own "no prompt" is remembered for the day; a
          // network error or a 5xx is retried on the next load.
          if (offered === "failed") return;
          if (!offered) {
            markSkippedToday(safeLocal(), newDate());
            return;
          }
          markPromptedThisSession(safeSession());
          answered.current = false;
        });
      };
      if (typeof window.requestIdleCallback === "function")
        idle = window.requestIdleCallback(run, { timeout: 5000 });
      else run();
    }, PROMPT_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      if (idle !== null && typeof window.cancelIdleCallback === "function")
        window.cancelIdleCallback(idle);
    };
  }, [blocked, prompt, fetchPrompt]);

  const close = useCallback(() => setPrompt(null), [setPrompt]);
  const onClose = useCallback(() => {
    // Closing before an answer is a dismissal; after one it is just done.
    if (prompt && !answered.current) void dismiss(prompt.id);
    close();
  }, [prompt, dismiss, close]);

  // A rejection keeps the answer on screen with a retry line (FeedbackPopup).
  const onSubmit = useCallback(
    async (answer: PopupAnswer) => {
      if (!prompt) return;
      const result = await send(prompt.id, {
        ...(answer.kind === "rating" && answer.score !== undefined
          ? { rating: answer.score }
          : {}),
        ...(answer.kind === "nps" && answer.score !== undefined
          ? { score: answer.score }
          : {}),
        ...(answer.text ? { text: answer.text } : {}),
      });
      if (!result.ok) {
        logger.warn("Feedback answer not saved", {}, LOG_SOURCE);
        throw new Error("feedback not saved");
      }
      answered.current = true;
    },
    [prompt, send]
  );

  const open = !!prompt && !blocked && !domBlocked;
  if (!prompt) return null;

  const channel = channelNow();
  const route: ReviewRoute | null =
    channel?.kind === "native"
      ? { kind: "native" }
      : channel?.kind === "link"
        ? { kind: "link", href: channel.url, label: PRODUCT_HUNT_LABEL }
        : null;

  return (
    <FeedbackPopup
      open={open}
      onClose={onClose}
      kind={popupKind(prompt.kind)}
      onSubmit={onSubmit}
      review={route}
      onNativeReview={() => void requestNativeReview()}
    />
  );
}

/** The server names the open questions idea and annoyance; the popup, wish and friction. */
function popupKind(kind: string): PopupKind {
  if (kind === "idea") return "wish";
  if (kind === "annoyance") return "friction";
  return kind === "nps" ? "nps" : "rating";
}

function channelNow() {
  return reviewChannel({
    platform: platformNow(),
    nativeReviewAvailable: canRequestNativeReview(),
  });
}

function safeLocal(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
