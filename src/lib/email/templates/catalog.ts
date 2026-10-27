import { getEmailVerificationTemplate } from "./email-verification";
import {
  getAccountExportTemplate,
  getBookingConfirmationTemplate,
  getReminderTemplate,
  getWelcomeTemplate,
} from "./notifications";
import { getPasswordResetTemplate } from "./password-reset";
import { getTrialEmailTemplate } from "./trial";

/** Every transactional email with fixed sample data, for previews and snapshots. */
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
      payUrl: "https://use.needt.app/pricing",
    }),
    "trial-ended": getTrialEmailTemplate({
      milestone: "day14",
      payUrl: "https://use.needt.app/pricing",
    }),
    reminder: getReminderTemplate({
      title: "Reminder: Send the report",
      body: "Send the report is due at 15:00.",
      openUrl: "https://use.needt.app/tasks",
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
  };
}
