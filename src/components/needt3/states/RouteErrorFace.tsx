"use client";

import { useEffect } from "react";

import Link from "next/link";

import * as Sentry from "@sentry/nextjs";
import { FiCloudOff, FiRefreshCw } from "react-icons/fi";

import { logger } from "@/lib/logger";

import { PkEmpty } from "../phone/kit/Material";
import { PkScreen } from "../phone/kit/Screen";
import { usePhoneUi } from "../root/phone-ui-context";

const LOG_SOURCE = "RouteErrorFace";

export const ROUTE_ERROR_COPY = {
  title: "This screen hit a problem",
  line: "The rest of Needt still works.",
  retry: "Retry",
  home: "Go home",
};

export interface RouteErrorFaceProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Route name, for the log line and the `data-route-error` hook. */
  screen: string;
}

/**
 * What a place shows when its page throws while rendering: one quiet card
 * inside the shell (sidebar, dock and phone menu stay), a Retry that re-renders
 * the segment and a way Home — never a full-page takeover. Mounted by each
 * route's `error.tsx`; `app/error.tsx` stays as the last resort.
 *
 * The exception goes to Sentry through the client SDK, whose `beforeSend`
 * (`src/lib/sentry/privacy.ts`) strips the message; the log line carries only
 * the screen, the error's name and Next's digest.
 */
export function RouteErrorFace({ error, reset, screen }: RouteErrorFaceProps) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { route: screen } });
    void logger.error(
      "Route error boundary rendered",
      { screen, name: error.name, digest: error.digest ?? null },
      LOG_SOURCE
    );
  }, [error, screen]);

  const retry = (
    <button
      type="button"
      className="nx-btn nx-btn-secondary nx-btn-sm"
      data-route-error-retry
      onClick={() => reset()}
    >
      <FiRefreshCw size={13} aria-hidden />
      {ROUTE_ERROR_COPY.retry}
    </button>
  );
  const home = (
    <Link
      href="/today"
      className="nx-btn nx-btn-text nx-btn-sm"
      data-route-error-home
    >
      {ROUTE_ERROR_COPY.home}
    </Link>
  );

  if (usePhoneUi() === "phone") {
    return (
      <PkScreen title={ROUTE_ERROR_COPY.title} screen="route-error">
        <div role="alert" data-route-error={screen}>
          <PkEmpty
            title={ROUTE_ERROR_COPY.title}
            line={ROUTE_ERROR_COPY.line}
            action={
              <>
                {retry}
                {home}
              </>
            }
          />
        </div>
      </PkScreen>
    );
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      data-v3-screen="route-error"
      data-route-error={screen}
    >
      <div className="st-center">
        <div className="st-error" role="alert" data-st-error>
          <span className="st-error-icon">
            <FiCloudOff size={16} aria-hidden />
          </span>
          <span className="st-error-text">{ROUTE_ERROR_COPY.title}</span>
          {retry}
          {home}
        </div>
      </div>
    </div>
  );
}
