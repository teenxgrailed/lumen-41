import { APP_NAME } from "@/lib/app-config";

import { renderEmail } from "./layout";

/**
 * The password reset email.
 * @param name User's name
 * @param resetLink The password reset link
 * @param _expirationDate Unused: the token window is a fixed 1 hour (reset-password/request route)
 */
export function getPasswordResetTemplate(
  name: string,
  resetLink: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so callers are unchanged
  _expirationDate: Date
) {
  return renderEmail({
    subject: `Reset Your ${APP_NAME} Password`,
    preheader: "Choose a new password. The link works once.",
    heading: "Reset your password",
    paragraphs: [
      `Hi ${name},`,
      `We received a request to reset the password for your ${APP_NAME} account. If you did not make it, you can ignore this email and nothing changes.`,
    ],
    button: { label: "Choose a new password", url: resetLink },
    note: `This link works once and expires in 1 hour.`,
    kind: "security",
  });
}
