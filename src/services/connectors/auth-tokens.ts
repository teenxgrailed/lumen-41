import crypto from "crypto";

import { addCalendarDays, newDate } from "@/lib/date-utils";

/** How long a newly made personal token works before it must be rotated. */
export const CONNECTOR_TOKEN_LIFETIME_DAYS = 365;

/** A personal connector token: shown once, stored only as its sha256. */
export function generateConnectorToken() {
  return `needt_${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashConnectorToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** When a token made at `now` stops working. */
export function connectorTokenExpiresAt(now: Date = newDate()) {
  return addCalendarDays(now, CONNECTOR_TOKEN_LIFETIME_DAYS);
}

/**
 * Whether a stored token is past its expiry. A null expiry belongs to a token
 * made before expiry existed; it keeps working until it is rotated.
 */
export function isConnectorTokenExpired(
  expiresAt: Date | null | undefined,
  now: Date = newDate()
) {
  return Boolean(expiresAt && expiresAt.getTime() <= now.getTime());
}
