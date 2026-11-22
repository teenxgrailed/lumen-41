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
import { canRequestNativeReview } from "@/lib/native-store";
import { notify } from "@/lib/notifications";
import { getAppVersion } from "@/lib/version";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { Sheet } from "../ctx/Sheet";
import { usePaywallStore } from "../paywall";
import { PkSheet } from "../phone/kit";
import { usePhoneUi } from "../root/phone-ui-context";
import { FeedbackBody, type FeedbackStep } from "./FeedbackBody";
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
    if (dialog.querySelector("[data-feedback-prompt]")) continue;
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

  const [step, setStep] = useState<FeedbackStep>("ask");
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
          if (!offered) {
            markSkippedToday(safeLocal(), newDate());
            return;
          }
          markPromptedThisSession(safeSession());
          setStep("ask");
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
    if (prompt && step === "ask") void dismiss(prompt.id);
    close();
  }, [prompt, step, dismiss, close]);

  const onSend = useCallback(
    async (answer: { rating?: number; score?: number; text?: string }) => {
      if (!prompt) return;
      const result = await send(prompt.id, answer);
      if (!result.ok) {
        notify.error("Could not send that. Try again in a moment.");
        logger.warn("Feedback answer not saved", {}, LOG_SOURCE);
        return;
      }
      // No place to send a review from here: skip the step, never promise one.
      setStep(result.review && channelNow() ? "review" : "thanks");
    },
    [prompt, send]
  );

  const open = !!prompt && !blocked && !domBlocked;
  if (!prompt) return null;

  const body = (
    <FeedbackBody
      kind={prompt.kind}
      step={step}
      phone={phone}
      channel={channelNow()}
      onSend={onSend}
      onSkip={onClose}
      onDone={close}
    />
  );

  if (phone)
    return (
      <PkSheet
        open={open}
        onClose={onClose}
        title="Feedback"
        label="Feedback"
        keyboard
        className="fbk-phone-sheet"
      >
        {body}
      </PkSheet>
    );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Feedback"
      scrimClassName="base-scrim nx-scrim"
      className="base-sheet nx-sheet fbk-sheet"
    >
      {body}
    </Sheet>
  );
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
