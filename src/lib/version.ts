/**
 * Application version helpers.
 *
 * The version is sourced from `package.json` and injected into the client
 * bundle as `NEXT_PUBLIC_APP_VERSION` via `next.config.js`, so the displayed
 * version always tracks the package version with no manual sync. These helpers
 * are pure so they can be unit-tested in the repo's Node-only Jest env (which
 * cannot render `.tsx`), while the UI component stays a thin consumer.
 */

/** Public changelog: where the displayed version links. The source repository is not linked from the app. */
export const PUBLIC_CHANGELOG_URL = "https://needt.app/changelog/";

/** Shown when the version is unavailable at runtime, so the UI is never empty. */
export const FALLBACK_APP_VERSION = "0.0.0";

/**
 * Resolve the application version for display.
 *
 * Returns the (trimmed) `NEXT_PUBLIC_APP_VERSION` value when it is set and
 * non-empty, otherwise {@link FALLBACK_APP_VERSION}.
 */
export function getAppVersion(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_VERSION?.trim();
  return fromEnv ? fromEnv : FALLBACK_APP_VERSION;
}

/**
 * The link target for the displayed version: the public changelog, which
 * lists every release, so it never 404s for the current build.
 */
export function getVersionHref(): string {
  return PUBLIC_CHANGELOG_URL;
}
