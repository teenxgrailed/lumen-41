import { APP_NAME } from "@/lib/app-config";

import { escapeHtml, renderEmail } from "./layout";

// Kept as a re-export: reminder delivery and older callers import it from here.
export { escapeHtml };

export function getEmailVerificationTemplate(input: {
  name: string;
  verificationUrl: string;
}) {
  return renderEmail({
    subject: "Confirm your email to start 14 days of Pro",
    preheader: `One tap and ${APP_NAME} is yours. The link works once and expires in 24 hours.`,
    heading: "Confirm your email",
    paragraphs: [
      `Hi ${input.name},`,
      `Confirm your email to open ${APP_NAME} and start 14 days of Pro, no card needed.`,
    ],
    button: { label: "Confirm email", url: input.verificationUrl },
    note: "This one-time link expires in 24 hours. If you did not create a Needt account, you can ignore this email.",
    kind: "security",
  });
}
