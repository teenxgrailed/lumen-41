/**
 * The shapes in the desktop sign-in handoff, kept apart from
 * desktop-handoff.ts (which reaches the database) so pages that run in the
 * browser can check them too.
 */

/** Sent by the page and the app, never by a cross-site form: forces a CORS preflight. */
export const DESKTOP_HANDOFF_HEADER = "x-needt-desktop";
/** base64url(sha256(verifier)): always 43 characters. */
export const DESKTOP_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** 32 random bytes, base64url. */
export const DESKTOP_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const DESKTOP_VERIFIER_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;
