import { APP_NAME } from "@/lib/app-config";

import { type RenderedEmail, escapeHtml } from "./layout";

/**
 * The mailed sign-in code. Its own small shell instead of the shared card
 * layout: a text wordmark (no remote image, so nothing breaks when images are
 * blocked and there is no tracking pixel), the code big in a monospace stack,
 * one line of expiry, one line of "not you?". The code is also the subject and
 * the hidden preheader, so a phone's lock screen and the keyboard's
 * one-time-code suggestion both show it.
 *
 * Colours follow PORT.md: greys are one ink at ladder steps, the accent is not
 * used. Tables and inline CSS for Outlook and Gmail; the <style> block is
 * progressive (prefers-color-scheme, Outlook.com [data-ogsc]/[data-ogsb]) and
 * the mail reads correctly without it.
 */

const INK = "#1b1a17";
const PAPER = "#f4f1ec";
const CARD = "#fbf9f5";
const WELL = "#f0ece4";
const MUTED = "#6a665e";
const RULE = "#e3ded5";
const D_PAPER = "#151412";
const D_CARD = "#1f1e1b";
const D_WELL = "#2a2926";
const D_INK = "#ece8e1";
const D_MUTED = "#a8a399";
const D_RULE = "#2e2c28";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO =
  "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

export function getEmailCodeTemplate(input: {
  code: string;
  minutes?: number;
}): RenderedEmail {
  const minutes = input.minutes ?? 10;
  const code = escapeHtml(input.code);
  const subject = `${input.code} is your ${APP_NAME} code`;
  const expiry = `Expires in ${minutes} minutes.`;
  const ignore = "If you didn't ask for this, ignore this email.";
  const name = escapeHtml(APP_NAME);
  // Pads the preheader so the inbox does not pull body text in after it.
  const pad = "&#8199;&#847; ".repeat(40);

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
<title>${escapeHtml(subject)}</title>
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark;}
body,table,td{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
@media (prefers-color-scheme:dark){
.paper{background-color:${D_PAPER} !important;}
.card{background-color:${D_CARD} !important;border-color:${D_RULE} !important;}
.well{background-color:${D_WELL} !important;}
.ink{color:${D_INK} !important;}
.muted{color:${D_MUTED} !important;}
}
[data-ogsb] .paper{background-color:${D_PAPER} !important;}
[data-ogsb] .card{background-color:${D_CARD} !important;border-color:${D_RULE} !important;}
[data-ogsb] .well{background-color:${D_WELL} !important;}
[data-ogsc] .ink{color:${D_INK} !important;}
[data-ogsc] .muted{color:${D_MUTED} !important;}
@media only screen and (max-width:620px){
.wrap{width:100% !important;}
.pad{padding:28px 20px !important;}
.code{font-size:30px !important;letter-spacing:5px !important;}
}
</style>
</head>
<body class="paper" bgcolor="${PAPER}" style="margin:0;padding:0;background-color:${PAPER};width:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${code} is your ${name} code${pad}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="paper" bgcolor="${PAPER}" style="background-color:${PAPER};">
<tr><td align="center" class="paper" bgcolor="${PAPER}" style="padding:32px 12px;background-color:${PAPER};">
<!--[if mso]><table role="presentation" width="480" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="480" cellspacing="0" cellpadding="0" border="0" class="wrap" style="width:480px;max-width:480px;">
<tr><td class="ink" style="padding:0 4px 16px 4px;font-family:${FONT};font-size:20px;line-height:28px;font-weight:700;letter-spacing:-0.3px;color:${INK};">${name}</td></tr>
<tr><td class="card pad" bgcolor="${CARD}" style="background-color:${CARD};border:1px solid ${RULE};border-radius:16px;padding:32px;font-family:${FONT};">
<p class="ink" style="margin:0 0 20px 0;font-family:${FONT};font-size:16px;line-height:24px;color:${INK};">Your sign-in code</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td class="well code ink" align="center" bgcolor="${WELL}" style="background-color:${WELL};border-radius:12px;padding:20px 12px;font-family:${MONO};font-size:36px;line-height:44px;font-weight:600;letter-spacing:8px;color:${INK};">${code}</td></tr></table>
<p class="muted" style="margin:20px 0 0 0;font-family:${FONT};font-size:14px;line-height:22px;color:${MUTED};">${expiry}</p>
<p class="muted" style="margin:4px 0 0 0;font-family:${FONT};font-size:14px;line-height:22px;color:${MUTED};">${escapeHtml(ignore)}</p>
</td></tr>
<tr><td class="muted" style="padding:16px 4px 0 4px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${name} &middot; needt.app</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `${input.code} is your ${APP_NAME} code`,
    "",
    expiry,
    ignore,
    "",
    "--",
    `${APP_NAME} - needt.app`,
  ].join("\n");

  return { subject, html, text };
}
