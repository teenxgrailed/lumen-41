import { APP_NAME } from "@/lib/app-config";

import { renderEmail } from "./layout";

/**
 * The mailed sign-in code. The code is the subject and the heading, so a
 * phone's lock screen and the keyboard's one-time-code suggestion both show
 * it. No button: nothing here is a link to click.
 */
export function getEmailCodeTemplate(input: {
  code: string;
  minutes?: number;
}) {
  const minutes = input.minutes ?? 10;
  return renderEmail({
    subject: `${input.code} is your ${APP_NAME} code`,
    preheader: `Your ${APP_NAME} sign-in code. It works once and expires in ${minutes} minutes.`,
    heading: input.code,
    paragraphs: [
      `Enter this code to sign in to ${APP_NAME}.`,
      `It works once and expires in ${minutes} minutes.`,
    ],
    note: `If you did not ask for this code, you can ignore this email. Nobody can sign in without it, and ${APP_NAME} never asks you for it anywhere else.`,
    kind: "security",
  });
}
