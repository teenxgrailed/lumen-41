"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";

import {
  COOKIE_SETTINGS_EVENT,
  type ConsentChoice,
  loadAnalytics,
  readConsent,
  setAnalyticsDisabled,
  writeConsent,
} from "@/lib/cookie-consent";

/**
 * First-visit cookie banner, mounted once in the root layout. Nothing
 * non-essential loads before Accept; Decline keeps only strictly necessary
 * storage. "Cookie settings" (Settings → Data & privacy) reopens it.
 *
 * A region, not a dialog: no focus trap, the page stays usable, and Escape
 * never changes the choice (with a saved choice it only closes the banner).
 */
export function CookieConsent({ umamiWebsiteId }: { umamiWebsiteId?: string }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<ConsentChoice | null>(null);
  const ref = useRef<HTMLElement>(null);
  const focusOnOpen = useRef(false);

  useEffect(() => {
    const current = readConsent();
    setSaved(current);
    // umami.disabled is per-origin localStorage, the choice is the shared cookie: re-sync
    if (current === "accepted") {
      setAnalyticsDisabled(false);
      loadAnalytics(umamiWebsiteId);
    } else if (current === "declined") setAnalyticsDisabled(true);
    else setOpen(true);
  }, [umamiWebsiteId]);

  useEffect(() => {
    const reopen = () => {
      focusOnOpen.current = true;
      setSaved(readConsent());
      setOpen(true);
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, reopen);
  }, []);

  useEffect(() => {
    if (open && focusOnOpen.current) {
      focusOnOpen.current = false;
      ref.current?.focus();
    }
  }, [open]);

  const choose = useCallback(
    (choice: ConsentChoice) => {
      writeConsent(choice);
      setSaved(choice);
      if (choice === "accepted") {
        setAnalyticsDisabled(false);
        loadAnalytics(umamiWebsiteId);
      } else {
        setAnalyticsDisabled(true);
      }
      setOpen(false);
    },
    [umamiWebsiteId]
  );

  if (!open) return null;

  return (
    <section
      ref={ref}
      aria-label="Cookie consent"
      tabIndex={-1}
      data-assistant-avoid
      className="needt-consent"
      onKeyDown={(e) => {
        if (e.key === "Escape" && saved) setOpen(false);
      }}
    >
      <p className="needt-consent__text">
        We use privacy-friendly analytics to see which features get used. It
        stays off until you accept. If you decline, Needt only uses what it
        needs to work.{" "}
        <Link href="/privacy" className="needt-consent__link">
          Privacy
        </Link>
      </p>
      <div className="needt-consent__actions">
        <button
          type="button"
          className="needt-consent__btn"
          onClick={() => choose("declined")}
        >
          Decline
        </button>
        <button
          type="button"
          className="needt-consent__btn"
          onClick={() => choose("accepted")}
        >
          Accept
        </button>
      </div>
    </section>
  );
}
