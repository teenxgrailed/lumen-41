import { APP_NAME } from "@/lib/app-config";

import { renderEmail } from "./layout";

/**
 * The password reset email.
 * @param name User's name
 * @param resetLink The password reset link
 * @param expirationDate The expiration date of the reset token
 */
export function getPasswordResetTemplate(
  name: string,
  resetLink: string,
  expirationDate: Date
) {
  const formattedExpirationDate = expirationDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });

  return renderEmail({
    subject: `Reset Your ${APP_NAME} Password`,
    preheader: "Choose a new password. The link works once.",
    heading: "Reset your password",
    paragraphs: [
      `Hi ${name},`,
      `We received a request to reset the password for your ${APP_NAME} account. If you did not make it, you can ignore this email and nothing changes.`,
    ],
    button: { label: "Choose a new password", url: resetLink },
    note: `This link works once and expires on ${formattedExpirationDate}.`,
    kind: "security",
  });
}
