import { APP_NAME } from "@/lib/app-config";

import { renderEmail } from "./layout";

/** Sent once, right after the email is confirmed and the trial has started. */
export function getWelcomeTemplate(input: {
  name: string;
  appUrl: string;
  trialStarted: boolean;
}) {
  return renderEmail({
    subject: `Welcome to ${APP_NAME}`,
    preheader: input.trialStarted
      ? "Your email is confirmed and your 14 days of Pro have started."
      : "Your email is confirmed.",
    heading: "You are in",
    paragraphs: [
      `Hi ${input.name},`,
      input.trialStarted
        ? `Your email is confirmed and your 14 days of ${APP_NAME} Pro have started. No card was needed.`
        : `Your email is confirmed. ${APP_NAME} is ready.`,
      "Put your calendars, tasks and notes in one place and let Needt find the time.",
    ],
    button: { label: `Open ${APP_NAME}`, url: input.appUrl },
    kind: "notification",
  });
}

export function getReminderTemplate(input: {
  title: string;
  body: string;
  openUrl: string;
}) {
  return renderEmail({
    subject: input.title,
    preheader: input.body,
    heading: input.title,
    paragraphs: [input.body],
    button: { label: `Open in ${APP_NAME}`, url: input.openUrl },
    kind: "notification",
  });
}

export function getBookingConfirmationTemplate(input: {
  title: string;
  startIso: string;
  cancelUrl: string;
}) {
  return renderEmail({
    subject: `Confirmed: ${input.title}`,
    preheader: `Your booking is confirmed for ${input.startIso}.`,
    heading: "Your booking is confirmed",
    paragraphs: [`${input.title}: ${input.startIso}`],
    button: { label: "Cancel booking", url: input.cancelUrl },
    note: "Plans changed? Use the button to cancel.",
    kind: "security",
  });
}

export function getAccountExportTemplate(input: {
  link: string;
  ttlHours: number;
}) {
  return renderEmail({
    subject: `Your ${APP_NAME} data export is ready`,
    preheader: `The download link works once and expires in ${input.ttlHours} hours.`,
    heading: "Your data export is ready",
    paragraphs: ["Your account archive is ready to download."],
    button: { label: "Download your archive", url: input.link },
    note: `This one-use link expires in ${input.ttlHours} hours.`,
    kind: "security",
  });
}
