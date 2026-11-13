"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import * as Sentry from "@sentry/nextjs";

import { PublicScope } from "@/components/needt3/states/PublicScope";

import { APP_NAME } from "@/lib/app-config";
import { logger } from "@/lib/logger";
import { getAppVersion, getVersionHref } from "@/lib/version";

import "../app/globals.css";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Use client-side rendering to avoid hydration issues
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Set document title on the client side
    document.title = `Error - ${APP_NAME}`;
    // The logger buffers to the server and prints nothing, which is why the
    // console stayed empty on a crash; the exception itself goes to Sentry
    // (its beforeSend strips the message) and to the console for the person
    // who has DevTools open.
    Sentry.captureException(error, { tags: { route: "root-error" } });
    console.error("[Needt] unhandled render error", error);
    void logger.error(
      "Application error boundary rendered",
      { error: error.message, digest: error.digest ?? null },
      "ApplicationErrorBoundary"
    );
  }, [error]);

  // Only render the full content after mounting on the client
  if (!mounted) {
    return null;
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="description" content="An error occurred" />
      </head>
      <body suppressHydrationWarning>
        <PublicScope>
          <div className="pub-center">
            <div className="pub-card is-small">
              <h1 className="pub-card-title">Something went wrong!</h1>
              <p className="pub-lead">An unexpected error has occurred.</p>
              <div className="pub-actions">
                <button
                  type="button"
                  onClick={reset}
                  className="nx-btn nx-btn-primary"
                >
                  Try again
                </button>
                <Link href="/" className="nx-btn nx-btn-secondary">
                  Return Home
                </Link>
              </div>
              <a
                href={getVersionHref()}
                target="_blank"
                rel="noopener noreferrer"
                title="What changed in this version"
                className="pub-version"
              >
                v{getAppVersion()}
              </a>
            </div>
          </div>
        </PublicScope>
      </body>
    </html>
  );
}
