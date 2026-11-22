import { APP_NAME } from "@/lib/app-config";

import { type RenderedEmail, footerAddress, renderEmail } from "./layout";

/**
 * The mailed sign-in code. It wears the shared layout (logo, card, footer,
 * dark mode) and fills its `code` slot: the code very large and monospace in
 * a grey box, then the expiry line and one line of "not you?". The code is
 * also the subject and the hidden preheader, so a phone's lock screen and the
 * keyboard's one-time-code suggestion both show it.
 */
export function getEmailCodeTemplate(input: {
  code: string;
  minutes?: number;
}): RenderedEmail {
  const minutes = input.minutes ?? 10;
  const subject = `${input.code} is your ${APP_NAME} code`;
  const expiry = `Expires in ${minutes} minutes.`;
  const ignore = "If you didn't ask for this, ignore this email.";

  return renderEmail({
    subject,
    preheader: subject,
    heading: "Your sign-in code",
    paragraphs: [],
    code: input.code,
    note: `${expiry} ${ignore}`,
    kind: "security",
    // No "you get this because" line: the code mail only carries the name.
    footerNote: "",
    text: [
      subject,
      "",
      expiry,
      ignore,
      "",
      "--",
      `${APP_NAME} - ${footerAddress()}`,
    ].join("\n"),
  });
}
