"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

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
        <div className="needt-page-depth flex min-h-dvh flex-col items-center justify-center p-4 text-center text-[var(--text-primary)]">
          <h1 className="mb-4 text-4xl font-bold">Something went wrong!</h1>
          <p className="mb-6">An unexpected error has occurred.</p>
          <div className="flex space-x-4">
            <button
              onClick={reset}
              className="rounded-[var(--control-radius)] border border-[var(--button-primary-border)] bg-[var(--button-primary-bg)] px-4 py-2 text-[var(--button-primary-fg)] transition-colors hover:bg-[var(--button-primary-bg-hover)]"
            >
              Try again
            </button>
            <Link
              href="/"
              className="rounded-[var(--control-radius)] border border-[var(--button-secondary-border)] bg-[var(--button-secondary-bg)] px-4 py-2 text-[var(--text-primary)] transition-colors hover:bg-[var(--button-secondary-bg-hover)]"
            >
              Return Home
            </Link>
          </div>
          <a
            href={getVersionHref()}
            target="_blank"
            rel="noopener noreferrer"
            title="What changed in this version"
            className="mt-8 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] hover:underline"
          >
            v{getAppVersion()}
          </a>
        </div>
      </body>
    </html>
  );
}
