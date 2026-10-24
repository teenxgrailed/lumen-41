import type { ImapFlowOptions } from "imapflow";

import type { ImapCredentials } from "./types";

/** Implicit TLS: the connection is encrypted from the first byte. */
export const IMAP_TLS_PORT = 993;
/** Plain greeting, then STARTTLS upgrades the session before login. */
export const IMAP_STARTTLS_PORT = 143;

export const IMAP_PLAINTEXT_REFUSED =
  "This IMAP server did not offer an encrypted connection. Needt connects only over SSL/TLS (usually port 993) or STARTTLS (usually port 143).";

/**
 * A port and TLS mode that cannot work together, answered before any
 * connection so the person learns which switch to flip instead of seeing a
 * generic failure. Other ports are left to the server.
 */
export function imapTlsProblem(
  credentials: Pick<ImapCredentials, "port" | "secure">
): string | null {
  if (credentials.port === IMAP_TLS_PORT && !credentials.secure) {
    return "Port 993 uses SSL/TLS. Turn SSL/TLS on, or use port 143 for STARTTLS.";
  }
  if (credentials.port === IMAP_STARTTLS_PORT && credentials.secure) {
    return "Port 143 uses STARTTLS. Turn SSL/TLS off, or use port 993.";
  }
  return null;
}

/**
 * Connection options for every IMAP client Needt opens. A mailbox password
 * never travels in plaintext: with `secure` off, STARTTLS is required, and
 * imapflow fails the connection when the server does not offer it instead of
 * its default of carrying on unencrypted.
 */
export function imapConnectionOptions(
  credentials: ImapCredentials
): ImapFlowOptions {
  return {
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    // `secure` together with `doSTARTTLS` is invalid in imapflow.
    ...(credentials.secure ? {} : { doSTARTTLS: true }),
    auth: { user: credentials.username, pass: credentials.password },
    logger: false,
  };
}

/** imapflow marks a missing or failed STARTTLS upgrade with `tlsFailed`. */
export function isImapTlsFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { tlsFailed?: unknown }).tlsFailed === true
  );
}
