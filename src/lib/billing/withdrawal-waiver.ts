/**
 * Terms 5.5: a buyer asks for Needt to start at once and acknowledges that the
 * 14-day withdrawal right (EU/UK consumers) ends once it has started. Every
 * paid checkout asks for that acknowledgement first: the screens show an
 * unchecked box and send `withdrawalWaiver: true`, and
 * `POST /api/billing/checkout` refuses a request without it. The time and the
 * Terms version are stored on `User.withdrawalWaiverAt` and
 * `User.withdrawalWaiverTermsVersion`, and go into the Creem checkout metadata.
 *
 * Browser-safe: no server imports.
 */

/** Anchor of "5.5 Refunds and the right of withdrawal" on /terms. */
export const WITHDRAWAL_WAIVER_TERMS_HREF =
  "/terms#5-5-refunds-and-the-right-of-withdrawal";

export const WITHDRAWAL_WAIVER_REQUIRED_MESSAGE =
  "Tick the box to confirm that Needt starts now and you lose the 14-day withdrawal right.";
