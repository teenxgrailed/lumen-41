import { PRIVACY_EMAIL, formatLegalDate } from "../operator";
import { CREEM_LINKS } from "./terms";

/** The subprocessor list, as Markdown. Rendered by `src/app/subprocessors/page.tsx`. */
export function subprocessorsMarkdown(): string {
  const date = formatLegalDate();
  return `# Needt Subprocessors

Last updated: ${date}

These are the third parties that process personal data on Needt's behalf. We update this page before a new subprocessor starts handling your data. The [Privacy Notice](/privacy) explains what each one receives and why.

---

## Subprocessors

| Provider | Purpose | Personal data involved | Location | Terms |
| --- | --- | --- | --- | --- |
| **Hetzner Online GmbH** | Servers running the app, background worker, real-time collaboration server, the PostgreSQL database and Redis | Everything stored in Needt | Helsinki, Finland (EU) | [Privacy](https://www.hetzner.com/legal/privacy-policy) |
| **Cloudflare, Inc.** | DNS for needt.app (traffic is not proxied); R2 storage for database backups | Database backups, encrypted at rest | Backups stored in Eastern Europe; company in the United States | [Privacy](https://www.cloudflare.com/privacypolicy/) · [DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) |
| **Plus Five Five, Inc. (Resend)** | Sending service email: confirmation, password reset, export ready, trial ending, reminders, booking confirmations | Recipient email and name, email content (may include task titles and booking details) | Sent from the EU (Ireland); company in the United States | [Privacy](https://resend.com/legal/privacy-policy) · [DPA](https://resend.com/legal/dpa) |
| **Functional Software, Inc. (Sentry)** | Error monitoring for the web app, worker and collaboration server | Reduced error reports: error type, place in our code, app version. Request data, messages, local variables, breadcrumbs and user details are removed before sending | United States | [Privacy](https://sentry.io/privacy/) · [DPA](https://sentry.io/legal/dpa/) |
| **OpenRouter, Inc.** | Gateway for Needt's included AI features | Prompts and context for each AI request: messages, task and schedule summaries, Memories, and page or email content the assistant looks up | United States | [Privacy](https://openrouter.ai/privacy) |
| **AI model hosts behind OpenRouter** | Running the AI model | The same, processed transiently and not retained or used for training | Only named hosts in the United States or the EU | Chosen per request by OpenRouter from our allow-list |
| **Zoho Corporation (Zoho Mail)** | Mailboxes for ${PRIVACY_EMAIL} and support@needt.app | Whatever you write to us | EU data centre | [Privacy](https://www.zoho.com/privacy.html) |

## Seller of paid plans

**Creem** (Armitage Labs OÜ, Estonia) sells paid plans as merchant of record. It is the seller in your purchase and processes your payment and billing data as a controller, not as our subprocessor: [Buyer Terms](${CREEM_LINKS.buyerTerms}) · [Privacy](${CREEM_LINKS.privacy}).

## Services you connect yourself

These are not our subprocessors. When you connect them, Needt exchanges your data with them on your instruction, and you have your own agreement with each provider.

| Provider | What is exchanged | Their privacy policy |
| --- | --- | --- |
| Google (Sign-in, Calendar, Gmail) | Sign-in identity, calendar events, email messages; Needt can write events and change the read and archive state of messages | [Google Privacy Policy](https://policies.google.com/privacy) |
| Microsoft (Sign-in, Outlook calendar, To Do, Outlook mail) | The same as Google, plus task lists | [Microsoft Privacy Statement](https://privacy.microsoft.com/privacystatement) |
| Apple iCloud and other CalDAV servers | Calendar events | [Apple Privacy Policy](https://www.apple.com/legal/privacy/) for iCloud |
| IMAP mail servers | Email messages and flags | Your mail provider's policy |
| Apps you import from, such as Todoist | The projects and tasks you import | That app's policy |
| Your own AI provider, if you add your own key | AI prompts and context, as for the included AI | That provider's policy |
| Browser push services (Google, Mozilla, Apple), if you turn on notifications | Encrypted notification payloads and your push endpoint | Your browser vendor's policy |
| Webhook URLs and API clients you configure | Whatever data you choose to send them | — |

## Not used

- No advertising networks and no analytics or tracking scripts in the app or on needt.app.
- Fonts are served from our own server, not from Google Fonts.

Questions about this list: **${PRIVACY_EMAIL}**.
`;
}
