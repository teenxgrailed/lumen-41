import { APP_NAME } from "@/lib/app-config";
import { operatorPostalAddress } from "@/lib/legal/operator";

/**
 * The one layout every Needt email wears: wordmark, one card, 16 px body, at
 * most one button. Tables and inline CSS so Outlook renders it; the only
 * <style> block is progressive (dark mode, phone width) and the mail reads
 * correctly without it. No image is needed to read any of it.
 *
 * Look follows the landing (sky, Exposure display, Figtree), and the button
 * is an ink fill, never the accent (PORT.md).
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
};

export type RenderedEmail = { subject: string; html: string; text: string };

// The landing's palette (needt.app, measured 2026-11-03): warm ground,
// lavender sky, one deep ink. Muted text is that ink at 68 % on the card.
const INK = "#0e1520";
const PAPER = "#f7f5f3";
const CARD = "#ffffff";
const MUTED = "#5b6068";
const RULE = "#e8e5ef";
const SKY = "#e9e6f3";
const SKY_TOP = "#d9d5f0";
const FONT =
  "Figtree,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const DISPLAY = "Exposure,Georgia,'Times New Roman',serif";

/**
 * Fonts come from the landing, the one origin every inbox can reach whatever
 * the app's own host is. Gmail and most webmail ignore web fonts; there both
 * fall back and the mail reads the same. The mark is drawn, not an image: no
 * mail carries an <img> (templates.test.ts).
 */
const BRAND_ORIGIN = "https://needt.app";

/**
 * The heading as the landing sets its H1: the last word in italics
 * ("Confirm your *email*"). One word stays upright.
 */
export function headingHtml(heading: string): string {
  const cut = heading.trimEnd().lastIndexOf(" ");
  if (cut <= 0) return escapeHtml(heading);
  return `${escapeHtml(heading.slice(0, cut))} <em style="font-style:italic;">${escapeHtml(heading.slice(cut + 1).trim())}</em>`;
}

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
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 24px 0;"><tr><td class="btn" bgcolor="${INK}" style="background-color:${INK};border-radius:999px;"><a href="${escapeHtml(content.button.url)}" class="btn-a" style="display:inline-block;padding:13px 24px;font-size:16px;line-height:20px;font-weight:600;color:${CARD};text-decoration:none;font-family:${FONT};">${escapeHtml(content.button.label)}</a></td></tr></table>` +
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
@font-face{font-family:Exposure;font-weight:500;font-style:normal;src:url(${BRAND_ORIGIN}/assets/exposure.woff2) format("woff2");}
@font-face{font-family:Figtree;font-weight:400 700;font-style:normal;src:url(${BRAND_ORIGIN}/assets/figtree-latin.woff2) format("woff2");}
:root{color-scheme:light dark;supported-color-schemes:light dark;}
@media (prefers-color-scheme:dark){
.paper{background-color:#0f1116 !important;}
.card{background-color:#171a21 !important;border-color:#272b35 !important;}
.sky{background-color:#1c1b2b !important;background-image:none !important;}
.ink,.mark{color:#eef0f4 !important;}
.muted{color:#9aa0aa !important;}
.btn{background-color:#eef0f4 !important;}
.btn-a{color:#0e1520 !important;}
}
@media only screen and (max-width:620px){
.wrap{width:100% !important;}
.pad{padding:24px 20px !important;}
.pad-x{padding-left:20px !important;padding-right:20px !important;}
}
</style>
</head>
<body class="paper" style="margin:0;padding:0;background-color:${PAPER};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="paper" style="background-color:${PAPER};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" class="wrap" style="width:600px;max-width:600px;">
<tr><td class="card" bgcolor="${CARD}" style="background-color:${CARD};border:1px solid ${RULE};border-radius:20px;overflow:hidden;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td class="sky pad-x" bgcolor="${SKY}" style="background-color:${SKY};background-image:linear-gradient(180deg,${SKY_TOP} 0%,${SKY} 100%);border-radius:20px 20px 0 0;padding:28px 32px 26px 32px;font-family:${FONT};">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="padding:0 10px 0 0;vertical-align:middle;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="32" height="32" align="center" valign="middle" bgcolor="${SKY_TOP}" style="width:32px;height:32px;background-color:${SKY_TOP};background-image:linear-gradient(180deg,#c9c3ee 0%,#f1effa 100%);border-radius:9px;font-family:${FONT};font-size:22px;line-height:32px;font-weight:800;color:${INK};" aria-hidden="true">n</td></tr></table></td>
<td style="vertical-align:middle;"><span class="mark" style="font-family:${DISPLAY};font-size:24px;line-height:28px;font-weight:500;letter-spacing:-0.5px;color:${INK};">${escapeHtml(APP_NAME)}</span></td>
</tr></table>
</td></tr>
<tr><td class="pad" style="padding:32px;font-family:${FONT};">
<h1 class="ink" style="margin:0 0 16px 0;font-family:${DISPLAY};font-size:30px;line-height:34px;font-weight:500;letter-spacing:-1.2px;color:${INK};">${headingHtml(content.heading)}</h1>
${paragraphs}${button}${note}
</td></tr>
</table>
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
