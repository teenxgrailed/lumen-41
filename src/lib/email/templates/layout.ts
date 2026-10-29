import { APP_NAME } from "@/lib/app-config";
import { operatorPostalAddress } from "@/lib/legal/operator";

/**
 * The one layout every Needt email wears: wordmark, one card, 16 px body, at
 * most one button. Tables and inline CSS so Outlook renders it; the only
 * <style> block is progressive (dark mode, phone width) and the mail reads
 * correctly without it. No image is needed to read any of it.
 *
 * Colours follow PORT.md: the button is an ink fill, never the accent.
 */

export function escapeHtml(value: string): string {
  // The five HTML metacharacters are escaped in full and every interpolation
  // is escaped, so the audit rule's "partial escape list" concern does not
  // apply. src/lib/mail/mapping.ts carries the identical helper.
  // nosemgrep: javascript.audit.detect-replaceall-sanitization.detect-replaceall-sanitization
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

//todo OWNER: postal address for the email footer. Not invented here; set
// OPERATOR_POSTAL_ADDRESS (one line, read in src/lib/legal/operator.ts). The
// placeholder is deliberately loud so it cannot ship unnoticed, and commercial
// mail is not sent at all while the address is unset (email-service.ts).
export const FOOTER_ADDRESS_PLACEHOLDER =
  "[OWNER: legal entity name and postal address]";

export function footerAddress(): string {
  return operatorPostalAddress() ?? FOOTER_ADDRESS_PLACEHOLDER;
}

export type EmailContent = {
  /** Subject line; also the document title. */
  subject: string;
  /** Hidden preview text shown by the inbox next to the subject. */
  preheader: string;
  heading: string;
  /** Plain paragraphs. Plain text in; escaped here. */
  paragraphs: string[];
  /** The single action. */
  button?: { label: string; url: string };
  /** Small print under the button (expiry, "not you?"). */
  note?: string;
  /**
   * "security" mails (verify, reset, receipts, the data export) are
   * transactional and never optional. "notification" mails are the ones the
   * person chose (reminders, the daily digest) and say where to switch them
   * off. "commercial" mails (trial reminders, anything that sells Pro) always
   * carry `unsubscribeUrl` and the postal address, and are sent only through
   * EmailService with `commercial: true`.
   */
  kind?: "security" | "notification" | "commercial";
  /** Where notification settings live, for kind "notification". */
  settingsUrl?: string;
  /**
   * One-click unsubscribe link (src/lib/email/unsubscribe.ts). Required for
   * "commercial"; also shown on a "notification" mail that has a category of
   * its own, such as the daily digest.
   */
  unsubscribeUrl?: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const INK = "#1b1a17";
const PAPER = "#f6f3ee";
const CARD = "#fffdf9";
const MUTED = "#6a665e";
const RULE = "#e7e2d9";
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function renderEmail(content: EmailContent): RenderedEmail {
  const address = footerAddress();
  if (content.kind === "commercial" && !content.unsubscribeUrl) {
    throw new Error("A commercial email needs an unsubscribe link");
  }
  const baseLine =
    content.kind === "commercial"
      ? `You get this because you have a ${APP_NAME} account.`
      : content.kind === "notification"
        ? content.settingsUrl
          ? `You get this because of your ${APP_NAME} notification settings. Change them here: ${content.settingsUrl}`
          : `You get this because of your ${APP_NAME} notification settings. You can change them in Settings.`
        : `You get this because of activity on your ${APP_NAME} account.`;
  const footerLine = content.unsubscribeUrl
    ? `${baseLine} Unsubscribe: ${content.unsubscribeUrl}`
    : baseLine;
  const footerHtml = content.unsubscribeUrl
    ? `${escapeHtml(baseLine)} <a href="${escapeHtml(content.unsubscribeUrl)}" class="muted" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>`
    : escapeHtml(footerLine);

  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p class="ink" style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:${INK};">${escapeHtml(p)}</p>`
    )
    .join("");

  const button = content.button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 24px 0;"><tr><td class="btn" bgcolor="${INK}" style="background-color:${INK};border-radius:10px;"><a href="${escapeHtml(content.button.url)}" class="btn-a" style="display:inline-block;padding:13px 22px;font-size:16px;line-height:20px;font-weight:600;color:${CARD};text-decoration:none;font-family:${FONT};">${escapeHtml(content.button.label)}</a></td></tr></table>` +
      `<p class="muted" style="margin:0 0 16px 0;font-size:13px;line-height:20px;color:${MUTED};">Button not working? Paste this link into your browser:<br><a href="${escapeHtml(content.button.url)}" class="muted" style="color:${MUTED};word-break:break-all;">${escapeHtml(content.button.url)}</a></p>`
    : "";

  const note = content.note
    ? `<p class="muted" style="margin:0;font-size:13px;line-height:20px;color:${MUTED};">${escapeHtml(content.note)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(content.subject)}</title>
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark;}
@media (prefers-color-scheme:dark){
.paper{background-color:#12110f !important;}
.card{background-color:#1c1b18 !important;border-color:#2c2a26 !important;}
.ink,.mark{color:#f1ede6 !important;}
.muted{color:#a29d93 !important;}
.btn{background-color:#f1ede6 !important;}
.btn-a{color:#1b1a17 !important;}
}
@media only screen and (max-width:620px){
.wrap{width:100% !important;}
.pad{padding:24px 20px !important;}
}
</style>
</head>
<body class="paper" style="margin:0;padding:0;background-color:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="paper" style="background-color:${PAPER};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="wrap" style="width:600px;max-width:600px;">
<tr><td style="padding:0 4px 16px 4px;font-family:${FONT};"><span class="mark" style="font-size:20px;line-height:24px;font-weight:700;letter-spacing:-0.3px;color:${INK};">${escapeHtml(APP_NAME)}</span></td></tr>
<tr><td class="card pad" bgcolor="${CARD}" style="background-color:${CARD};border:1px solid ${RULE};border-radius:16px;padding:32px;font-family:${FONT};">
<h1 class="ink" style="margin:0 0 16px 0;font-size:22px;line-height:28px;font-weight:700;color:${INK};">${escapeHtml(content.heading)}</h1>
${paragraphs}${button}${note}
</td></tr>
<tr><td class="muted" style="padding:16px 4px 0 4px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${footerHtml}<br>${escapeHtml(APP_NAME)} &middot; ${escapeHtml(address)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    content.heading,
    "",
    ...content.paragraphs.flatMap((p) => [p, ""]),
    ...(content.button
      ? [`${content.button.label}: ${content.button.url}`, ""]
      : []),
    ...(content.note ? [content.note, ""] : []),
    "--",
    footerLine,
    `${APP_NAME} - ${address}`,
  ].join("\n");

  return { subject: content.subject, html, text };
}
