import { APP_NAME } from "@/lib/app-config";
import { NEEDT_PRICING } from "@/lib/creem/config";
import { formatShortDate } from "@/lib/date-utils";
import { money } from "@/lib/needt3/pricing";

import { renderEmail } from "./layout";

/**
 * The student price's three emails (docs/students.md). All three are about
 * the account's own price, so they are transactional ("security"), never
 * commercial: they go out whatever the marketing opt-out says.
 */

/** Sent to the university address someone typed in Settings, Plan. */
export function getStudentVerifyTemplate(input: { confirmUrl: string }) {
  return renderEmail({
    subject: `Confirm your university email for ${APP_NAME}`,
    preheader: `One tap and ${APP_NAME} Pro is ${NEEDT_PRICING.student.percentOff}% off for you.`,
    heading: "Confirm your university email",
    paragraphs: [
      `Someone added this address to a ${APP_NAME} account to get the student price on Pro: ${NEEDT_PRICING.student.percentOff}% off monthly and yearly.`,
      "If that was you, confirm it below.",
    ],
    button: { label: "Confirm", url: input.confirmUrl },
    note: "The link works for 24 hours. If you did not ask for this, ignore this email and nothing changes.",
    kind: "security",
  });
}

/** The yearly re-check, sent to the address the price rests on. */
export function getStudentRecheckTemplate(input: {
  confirmUrl: string;
  renewsAt: Date | null;
}) {
  return renderEmail({
    subject: "Are you still a student?",
    preheader: `Keep your ${APP_NAME} student price with one tap.`,
    heading: "Are you still a student?",
    paragraphs: [
      `Once a year we check that the student price on your ${APP_NAME} Pro plan still applies.`,
      input.renewsAt
        ? `Confirm with the button below before ${formatShortDate(input.renewsAt, true)} to keep ${NEEDT_PRICING.student.percentOff}% off.`
        : `Confirm with the button below to keep ${NEEDT_PRICING.student.percentOff}% off.`,
    ],
    button: { label: "I'm still a student", url: input.confirmUrl },
    note: "If you have finished, there is nothing to do. We will email you before anything changes.",
    kind: "security",
  });
}

/** Fourteen days before the renewal that comes at the regular price. */
export function getStudentPriceEndingTemplate(input: {
  renewsAt: Date;
  interval: "month" | "year";
  settingsUrl: string;
}) {
  const regular =
    input.interval === "year"
      ? `${money(NEEDT_PRICING.pro.year.amountCents)} / year`
      : `${money(NEEDT_PRICING.pro.month.amountCents)} / month`;
  const date = formatShortDate(input.renewsAt, true);
  return renderEmail({
    subject: "Your student price ends at your next renewal",
    preheader: `From ${date}, ${APP_NAME} Pro is ${regular}.`,
    heading: "Your student price ends at your next renewal",
    paragraphs: [
      "We could not confirm your university email this year.",
      `From your renewal on ${date}, ${APP_NAME} Pro is the regular price, ${regular}.`,
      "Still a student? Add your university email again in Settings, Plan, before that date. No university email? Write to students@needt.app with proof of enrolment.",
    ],
    button: { label: "Open Settings", url: input.settingsUrl },
    note: "You can cancel any time in Settings, Plan & billing, Invoices and payment.",
    kind: "security",
  });
}
