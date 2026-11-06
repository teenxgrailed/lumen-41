import { getEmailVerificationTemplate } from "./email-verification";
import type { EmailFooter } from "./layout";
import {
  getAccountExportTemplate,
  getBookingConfirmationTemplate,
  getDigestTemplate,
  getWelcomeTemplate,
} from "./notifications";
import { getPasswordResetTemplate } from "./password-reset";
import {
  getStudentPriceEndingTemplate,
  getStudentRecheckTemplate,
  getStudentVerifyTemplate,
} from "./student";
import { getTrialEmailTemplate } from "./trial";

/**
 * Fixed operator lines for previews and snapshots. Plainly example text, never
 * a bracketed placeholder. Real mail takes the footer from System Settings.
 */
export const CATALOG_FOOTER: EmailFooter = {
  name: "Example Operator",
  address: "1 Example Street, Example City",
};

const UNSUBSCRIBE_SAMPLE =
  "https://use.needt.app/api/email/unsubscribe?t=SAMPLE";

/**
 * Every email with fixed sample data, for previews and snapshots.
 *
 * Transactional (never optional, no unsubscribe): verify-email, password-reset,
 * welcome, booking-confirmed, account-export, the three student-price mails,
 * and reminder (a reminder the person set themselves). Not transactional: trial-ending and trial-ended are
 * commercial (they sell Pro; unsubscribe link and postal address, sent only
 * when the address is configured), and daily-digest is an opt-in summary with
 * its own unsubscribe.
 */
export function sampleEmails() {
  const url = "https://use.needt.app/auth/confirm-email?token=SAMPLE";
  return {
    "verify-email": getEmailVerificationTemplate({
      name: "Alex",
      verificationUrl: url,
    }),
    "password-reset": getPasswordResetTemplate(
      "Alex",
      "https://use.needt.app/auth/reset-password?token=SAMPLE",
      new Date("2026-10-28T12:00:00.000Z")
    ),
    welcome: getWelcomeTemplate({
      name: "Alex",
      appUrl: "https://use.needt.app",
      trialStarted: true,
    }),
    "trial-ending": getTrialEmailTemplate({
      milestone: "day11",
      payUrl: "https://use.needt.app/settings#billing",
      unsubscribeUrl: UNSUBSCRIBE_SAMPLE,
      footer: CATALOG_FOOTER,
    }),
    "trial-ended": getTrialEmailTemplate({
      milestone: "day14",
      payUrl: "https://use.needt.app/settings#billing",
      unsubscribeUrl: UNSUBSCRIBE_SAMPLE,
      footer: CATALOG_FOOTER,
    }),
    "daily-digest": getDigestTemplate({
      title: "3 things need you",
      body: "A mention, a shared page and a sync problem are waiting.",
      openUrl: "https://use.needt.app/today",
      unsubscribeUrl: UNSUBSCRIBE_SAMPLE,
    }),
    "booking-confirmed": getBookingConfirmationTemplate({
      title: "Intro call",
      startIso: "2026-10-30T10:00:00.000Z",
      cancelUrl: "https://use.needt.app/book/cancel/SAMPLE",
    }),
    "account-export": getAccountExportTemplate({
      link: "https://use.needt.app/api/account/export/download?token=SAMPLE",
      ttlHours: 24,
    }),
    "student-verify": getStudentVerifyTemplate({
      confirmUrl: "https://use.needt.app/api/students/confirm?t=SAMPLE",
    }),
    "student-recheck": getStudentRecheckTemplate({
      confirmUrl: "https://use.needt.app/api/students/confirm?t=SAMPLE",
      renewsAt: new Date("2026-11-26T12:00:00.000Z"),
    }),
    "student-price-ending": getStudentPriceEndingTemplate({
      renewsAt: new Date("2026-11-26T12:00:00.000Z"),
      interval: "year",
      settingsUrl: "https://use.needt.app/settings?section=billing",
    }),
  };
}
