# Email programme

Spec: `openspec/changes/add-email-program/`. Code: `src/services/email-lifecycle/`,
`src/services/email-broadcasts/`, `src/services/gifts/`, `src/lib/email/`.

## What the owner sets

System Settings, "Email programme" (columns in brackets):

| Key                    | Column                | Effect                                                                                                 |
| ---------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| `email.footerName`     | `emailFooterName`     | Footer name. Until both footer fields are set, only transactional mail goes out.                       |
| `email.footerAddress`  | `emailFooterAddress`  | Footer postal address.                                                                                 |
| `email.trialPromoCode` | `emailTrialPromoCode` | Creem code for 20% off the first year, shown in the trial-ending-today mail. Empty: the early-$7 line. |
| `email.trackingEndsAt` | `emailTrackingEndsAt` | Opens and clicks are counted until this date, then not. Empty: not counted.                            |

Environment: `RESEND_WEBHOOK_SECRET` (Svix signing secret of the Resend webhook),
`RESEND_FROM_EMAIL=hello@needt.app`, optionally `RESEND_DOMAIN_ID`. Optional
`EMAIL_PROGRAM_DRY_RUN=1` makes the engine write `dry` ledger rows and send nothing.

The flag `email_program` (src/lib/feature-flags.ts) gates everything optional.

## How a decision is made

`decide()` in `src/services/email-lifecycle/decide.ts` is pure. Order: flag,
recipient, operator footer, the person's choices, stale, the rule's own skip,
the cap (3 days, 7 with "Fewer emails"), the send window (09:00 to 19:00 in the
person's zone on weekdays; trial-ending mail also on weekends). The ledger
`EmailSend` is unique on (user, rule, key); a row is claimed before sending.

## Broadcasts

Created and scheduled in Admin, Email. A schedule needs a test sent to the
owner after the last edit, the operator footer, and a time 15 minutes to 30
days ahead; "all" needs the typed recipient count. Cancel works until it
starts. One broadcast per person per 7 days. The sender runs every minute on
the `email-lifecycle` queue.

## Not done in v1

Broadcast write tools in the MCP server (the MCP scope is read-only by design).
