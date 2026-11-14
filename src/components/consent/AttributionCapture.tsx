"use client";

import { useEffect } from "react";

import { utmCookie, utmFromSearch } from "@/lib/attribution";
import { CONSENT_CHANGED_EVENT, readConsent } from "@/lib/cookie-consent";

/**
 * Keeps the campaign tags (`utm_*`) the visitor arrived with, so the server
 * can attach them when the account is created. Runs on every page load and
 * again when the visitor accepts the cookie banner on that same page.
 * Renders nothing; does nothing without consent or without tags in the URL.
 */
export function AttributionCapture() {
  useEffect(() => {
    const keep = () => {
      if (readConsent() !== "accepted") return;
      const cookie = utmCookie(
        utmFromSearch(window.location.search),
        window.location.protocol === "https:"
      );
      if (cookie) document.cookie = cookie;
    };
    keep();
    window.addEventListener(CONSENT_CHANGED_EVENT, keep);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, keep);
  }, []);
  return null;
}
