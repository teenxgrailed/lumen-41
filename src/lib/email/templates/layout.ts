import { APP_NAME } from "@/lib/app-config";
import { operatorPostalAddress } from "@/lib/legal/operator";

/**
 * The one layout every Needt email wears (the sign-in code included): the
 * logo top-left, one card at most 560 px wide, one heading, short body lines,
 * at most one button with a plain link under it, a hairline and a small
 * footer. Tables and inline CSS so Outlook and Gmail render it; the only
 * <style> block is progressive (dark mode via prefers-color-scheme and the
 * Outlook.com [data-ogsc]/[data-ogsb] hooks, phone width) and the mail reads
 * correctly without it. The one image is the logo, on a light rounded tile so
 * it holds in both themes; its alt text is the name.
 *
 * Colours follow PORT.md: the button is an ink fill, never the accent. No pure
 * white or black, so forced inversion (Gmail, Apple Mail) has room to move.
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

//todo OWNER: legal entity name and postal address. Not invented here; set
// OPERATOR_POSTAL_ADDRESS (one line, read in src/lib/legal/operator.ts). Until
// then the footer names the site only: a placeholder token must never reach a
// reader. Commercial mail is not sent at all while the address is unset
// (email-service.ts).
export const FOOTER_FALLBACK = "needt.app";

export function footerAddress(): string {
  return operatorPostalAddress() ?? FOOTER_FALLBACK;
}

/** Who sends the mail, for the footer of optional mail. */
export type EmailFooter = { name: string; address: string };

/** Text that must never reach an inbox: a bracketed or templated placeholder. */
export function containsPlaceholder(value: string): boolean {
  return /\[OWNER|\{\{|\}\}/.test(value);
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
  /**
   * Operator name and postal address for the footer, resolved by the caller
   * from admin System Settings (src/lib/email/program-settings.ts). Optional
   * mail ("commercial") refuses to render without a real one, from here or
   * from the environment.
   */
  footer?: EmailFooter | null;
  /**
   * Replaces the "You get this because..." line for mail that does not go to
   * an end user (the owner's operations alerts).
   */
  footerNote?: string;
  /**
   * A one-time sign-in code, shown large and monospace in a grey box between
   * the paragraphs and the button. Printed as one unbroken string so a tap or
   * double-click selects all of it; the spacing is CSS letter-spacing.
   */
  code?: string;
  /** Plain-text part, when a mail needs wording of its own (sign-in code). */
  text?: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const INK = "#1b1a17";
const BODY = "#47453f";
const PAPER = "#f7f7f8";
const CARD = "#fefefe";
const WELL = "#f0f0f2";
const MUTED = "#6e6b64";
const RULE = "#e6e6e9";
// Dark counterparts, used by the progressive dark-mode rules below. Not pure
// black or white: Gmail and Outlook invert on their own and handle these.
const D_PAPER = "#151412";
const D_CARD = "#1f1e1b";
const D_WELL = "#2a2926";
const D_INK = "#ece8e1";
const D_BODY = "#cdc9c0";
const D_MUTED = "#a8a399";
const D_RULE = "#33312d";
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO =
  "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

/** Widest the card gets, in px. Fluid below it. */
export const EMAIL_MAX_WIDTH = 560;

/**
 * The logo is the app icon: a PNG with its own ground and transparent corners.
 * SVG is not used because Gmail does not render it. Absolute https URL on the
 * marketing host.
 */
export const EMAIL_LOGO_URL = "https://needt.app/icon-192.png";

export function renderEmail(content: EmailContent): RenderedEmail {
  if (content.kind === "commercial" && !content.unsubscribeUrl) {
    throw new Error("A commercial email needs an unsubscribe link");
  }
  const footer = content.footer ?? null;
  if (
    content.kind === "commercial" &&
    (footer
      ? containsPlaceholder(`${footer.name} ${footer.address}`)
      : !operatorPostalAddress())
  ) {
    throw new Error("A commercial email needs the operator name and address");
  }
  const address = footer
    ? `${footer.name}, ${footer.address}`
    : footerAddress();
  // An empty footerNote means "no reason line" (the sign-in code).
  const baseLine =
    content.footerNote !== undefined
      ? content.footerNote
      : content.kind === "commercial"
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
  const reasonHtml = footerHtml
    ? `<p class="muted" style="margin:0 0 6px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${footerHtml}</p>`
    : "";

  const paragraphs = content.paragraphs
    .map(
      (p) =>
        `<p class="body" style="margin:0 0 12px 0;font-family:${FONT};font-size:15px;line-height:22px;color:${BODY};">${escapeHtml(p)}</p>`
    )
    .join("");

  // One unbroken string in one cell: no spaces, no per-digit markup, so it
  // selects and copies as a unit. The gaps are letter-spacing.
  const code = content.code
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 16px 0;"><tr><td class="well code ink" align="center" bgcolor="${WELL}" style="background-color:${WELL};border-radius:10px;padding:18px 12px;font-family:${MONO};font-size:32px;line-height:40px;font-weight:600;letter-spacing:6px;color:${INK};-webkit-user-select:all;user-select:all;">${escapeHtml(content.code)}</td></tr></table>`
    : "";

  // Bulletproof button: VML round-rect for Outlook desktop, otherwise a table
  // cell that carries the fill (bgcolor attribute and inline style, same
  // colour border) around a padded link. Under it, the plain link.
  const button = content.button
    ? `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeHtml(content.button.url)}" style="height:44px;v-text-anchor:middle;width:${Math.min(380, 56 + content.button.label.length * 9)}px;" arcsize="18%" stroke="f" fillcolor="${INK}"><w:anchorlock/><center style="color:${CARD};font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${escapeHtml(content.button.label)}</center></v:roundrect><![endif]-->` +
      `<!--[if !mso]><!--><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 12px 0;"><tr><td class="btn" align="center" bgcolor="${INK}" style="background-color:${INK};border:1px solid ${INK};border-radius:8px;"><a href="${escapeHtml(content.button.url)}" class="btn-a" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:${CARD};text-decoration:none;">${escapeHtml(content.button.label)}</a></td></tr></table><!--<![endif]-->` +
      `<p class="muted" style="margin:0 0 16px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">Button not working? Paste this link into your browser:<br><a href="${escapeHtml(content.button.url)}" class="muted" target="_blank" style="color:${MUTED};word-break:break-all;">${escapeHtml(content.button.url)}</a></p>`
    : "";

  const note = content.note
    ? `<p class="muted" style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;color:${MUTED};">${escapeHtml(content.note)}</p>`
    : "";

  // Pads the preheader so the inbox does not pull body text in after it.
  const preheaderPad = "&#8199;&#847; ".repeat(40);

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(content.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark;}
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}
@media (prefers-color-scheme:dark){
.paper{background-color:${D_PAPER} !important;}
.card{background-color:${D_CARD} !important;border-color:${D_RULE} !important;}
.well{background-color:${D_WELL} !important;}
.hair{border-color:${D_RULE} !important;}
.ink{color:${D_INK} !important;}
.body{color:${D_BODY} !important;}
.muted,.muted a{color:${D_MUTED} !important;}
.btn{background-color:${D_INK} !important;border-color:${D_INK} !important;}
.btn-a{color:${INK} !important;}
}
[data-ogsb] .paper{background-color:${D_PAPER} !important;}
[data-ogsb] .card{background-color:${D_CARD} !important;border-color:${D_RULE} !important;}
[data-ogsb] .well{background-color:${D_WELL} !important;}
[data-ogsb] .hair{border-color:${D_RULE} !important;}
[data-ogsc] .ink{color:${D_INK} !important;}
[data-ogsc] .body{color:${D_BODY} !important;}
[data-ogsc] .muted,[data-ogsc] .muted a{color:${D_MUTED} !important;}
[data-ogsb] .btn{background-color:${D_INK} !important;border-color:${D_INK} !important;}
[data-ogsc] .btn-a{color:${INK} !important;}
@media only screen and (max-width:${EMAIL_MAX_WIDTH + 40}px){
.wrap{width:100% !important;}
.gutter{padding:20px 16px !important;}
.pad{padding:24px 20px !important;}
.code{font-size:28px !important;letter-spacing:4px !important;}
}
</style>
</head>
<body class="paper" bgcolor="${PAPER}" style="margin:0;padding:0;background-color:${PAPER};width:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(content.preheader)}${preheaderPad}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="paper" bgcolor="${PAPER}" style="background-color:${PAPER};">
<tr><td align="center" class="paper gutter" bgcolor="${PAPER}" style="padding:32px 24px;background-color:${PAPER};">
<!--[if mso]><table role="presentation" width="${EMAIL_MAX_WIDTH}" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="${EMAIL_MAX_WIDTH}" cellspacing="0" cellpadding="0" border="0" class="wrap" style="width:100%;max-width:${EMAIL_MAX_WIDTH}px;">
<tr><td class="card pad" bgcolor="${CARD}" style="background-color:${CARD};border:1px solid ${RULE};border-radius:12px;padding:32px;font-family:${FONT};">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px 0;"><tr><td bgcolor="${CARD}" style="padding:0;background-color:${CARD};border:1px solid ${RULE};border-radius:8px;line-height:0;font-size:0;"><img src="${EMAIL_LOGO_URL}" width="30" height="30" alt="${escapeHtml(APP_NAME)}" style="display:block;width:30px;height:30px;border:0;border-radius:7px;color:${INK};font-family:${FONT};font-size:12px;line-height:30px;"></td></tr></table>
<h1 class="ink" style="margin:0 0 12px 0;font-family:${FONT};font-size:21px;line-height:28px;font-weight:600;letter-spacing:-0.2px;color:${INK};">${escapeHtml(content.heading)}</h1>
${paragraphs}${code}${button}${note}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 0 0;"><tr><td class="hair" style="padding:16px 0 0 0;border-top:1px solid ${RULE};font-family:${FONT};">${reasonHtml}<p class="muted" style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${escapeHtml(APP_NAME)} &middot; ${escapeHtml(address)}</p></td></tr></table>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  const text =
    content.text ??
    [
      content.heading,
      "",
      ...content.paragraphs.flatMap((p) => [p, ""]),
      ...(content.button
        ? [`${content.button.label}: ${content.button.url}`, ""]
        : []),
      ...(content.note ? [content.note, ""] : []),
      "--",
      ...(footerLine ? [footerLine] : []),
      `${APP_NAME} - ${address}`,
    ].join("\n");

  return { subject: content.subject, html, text };
}
