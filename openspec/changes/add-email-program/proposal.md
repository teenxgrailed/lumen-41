## Why

Needt sends a handful of mails today (verify, reset, reminders, the daily digest, two trial mails) and has no plan for the rest of a person's first month. Four things are missing or unsafe:

- **No preference model.** One column (`User.commercialEmailsOptOutAt`) and one toggle (`NotificationSettings.digest`) are all a person can switch. There is no page where they see what they get.
- **No onboarding, no win-back, no way to write to a group.** The owner needs welcome and onboarding mail, trial-ending mail with a promo, a win-back, and broadcasts he writes himself.
- **No way to give Pro away.** The owner wants to grant Pro time to a person with a personal line, and have them told.
- **The footer cannot ship.** `src/lib/email/templates/layout.ts` still carries `FOOTER_ADDRESS_PLACEHOLDER`, and every commercial mail is dropped until `OPERATOR_POSTAL_ADDRESS` is set. The owner has not decided the operator yet.

The programme must be quiet. The owner said "not pushy", and the research below agrees: the emails people like are few, short, behavioural, and come from a product that stops when asked.

## What Changes

- **Preferences.** `transactional` is always on. Four optional categories: `tips` (onboarding and product tips), `offers` (trial ending, promo, win-back), `updates` (broadcasts the owner writes), `recap` (monthly "your month in Needt", off by default). The daily digest keeps its own toggle. Every optional mail carries RFC 8058 one-click unsubscribe for its category and a link to a preference page.
- **Lifecycle engine** in the BullMQ worker: a rule table (trigger, skip condition, category, priority), a send ledger, quiet hours in the person's time zone, and a global cap of one marketing email per 3 days.
- **v1 automated mail:** welcome and three onboarding mails (about days 0 / 2 / 5 / 9, each skipped when the person already did the step), trial ending (3 days before and on the day), win-back (14 and 30 days inactive), then a quarterly "still want these?" check.
- **Gifts:** admin grants 1 month / 3 months / 1 year of Pro with an optional personal line. Pro turns on at once with no card. The person gets one email and a gift screen in the app. Reuses the sandbox comp mechanism (an ACTIVE `Subscription` with no payment ids).
- **Broadcasts:** Claude (or the owner) writes a message in admin, picks a segment (Free / Pro / trial / students), a test goes to the owner first, then Claude schedules it with a cancel window of at least 15 minutes; one broadcast per 7 days per recipient at most.
- **Webhooks:** Resend `bounced` and `complained` events feed a suppression list in Postgres; a complaint also opts the person out of every optional category.
- **Admin preview** of every template with sample data, light and dark, HTML and plain text.
- **Legal footer** is built from the owner's name and a virtual mailbox address in System Settings. When either is unset, only transactional mail is sent. A placeholder is never rendered.
- **Tooling decision:** stay on Resend. Preferences, suppression and segments live in Postgres; Resend is the sender and the bounce source.

This PR is docs-only; `tasks.md` lists the implementation in order. The implementation sits behind the flag `email_program`; transactional and compliance fixes ship unflagged. The per-task email switch-off is a separate hotfix (`fix/stop-task-emails`) and is not repeated here; only the daily digest remains of task mail.

## Research that shaped this

Fetched 2026-11-02. Vendor-published numbers are marked weak. Links are given where the source page was read or returned by search; other sources are named with their date.

1. **Skip the generic day-2 nudge, send on behaviour.** A study of 16,827 emails found the day-2 nudge had a 13.5% open rate and the highest unsubscribe rate (1.88%) of the sequence (Meisa, 2026-10-22, https://meisa.io/research/onboarding-email-benchmarks; vendor study, indicative). Linear sends about one email per milestone with one button (HappySupport, 2026-06-02; Sequenzy teardown, captured Sep to Oct 2026, https://sequenzy.com/email-examples/brands/linear; both second-hand). So the day 2/5/9 mails fire only when the step is not done, and the sequence stops when the person is active.
2. **Plain beats designed for personal moments.** Parcel's 5-month A/B (over 1,000 per variant, 2023-08-04, https://studio.parcel.io/blog/text-based-vs-designed-emails): designed mail got more clicks (8.85% v 6.55%), plain text converted slightly better (3.24% v 2.89%) and drew replies. So welcome, trial-ending and win-back are short and quiet inside the one layout; the recap is the designed mail.
3. **Win-back: ask, do not discount, do not guilt.** A first win-back from a named sender with one question and no offer beats a blind discount (saas-marketing.net, 2026-09-11; anecdotal sample of 12). Non-discounted resubscribers stay about 2.6x longer (Airbridge, 2025-01-11, citing a source not checked). Duolingo's guilt copy won A/B tests by 5 to 8% (Fast Company, 2022-04-26) and was later called emotional blackmail (Business Insider, 2024-07-23); Duolingo's stated rule is "protect the channel" (Lenny's Newsletter, 2023-02-28). So no guilt copy, no streak-loss mail, and a discount only in the last trial mail, if at all.
4. **Recaps work when they hold the person's own data, and never when empty.** A personalised retail recap lifted click-through 43% (Asda, Axios 2023-12-08, relative lift). Grammarly's weekly stats mail works because it restates value (Failory, 2024-04-09). So the recap is opt-in, sent only with real activity, and never invents a number.
5. **Offer an opt-down, not only an off switch.** A frequency choice cut unsubscribes about 20% (Lands' End, MarketingSherpa 2015, old); cutting volume 43.8% still grew email revenue 14.5% (Jenni Kayne, Klaviyo case study 2023). Hence categories, a "fewer emails" setting and the global cap.
6. **The rules are current.** RFC 8058 needs one `https` URI in `List-Unsubscribe`, `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, both covered by a valid DKIM signature, and a POST that unsubscribes with no confirmation page and no redirect (https://www.rfc-editor.org/rfc/rfc8058.html, 2017). Gmail and Yahoo require one-click on marketing and subscribed mail, a spam rate under 0.1% (never 0.3%), unsubscribes honoured within 2 days, in force since 2024-02-01 (https://support.google.com/a/answer/81126, https://senders.yahooinc.com/best-practices/); Outlook.com followed 2025-05-05 (secondary source). CAN-SPAM requires a valid postal address (street, USPS PO box or CMRA mailbox), opt-out honoured within 10 business days, up to $53,088 per email (https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business, edited Jan 2024; a newer inflation figure was not checked).
7. **Two traps in current code.** `GET /api/email/unsubscribe` unsubscribes on a plain GET, which link-prefetching mail scanners will trigger; one-click must be POST and GET must show a confirm page. And the layout renders a bracketed placeholder as the address; that must become a hard stop.

Not verified, so not relied on: the ICO primary pages (403 during research), whether the UK Data (Use and Access) Act 2025 PECR fine increase is in force, whether Resend Broadcasts add `List-Unsubscribe-Post` on their own, whether a registered-agent address satisfies German Impressum rules. This is not legal advice.

## Tool recommendation

Stay on Resend. Send everything through the Emails and Batch API from the worker with our own unsubscribe headers; keep contacts, preferences, segments and suppression in Postgres. Prices as of 2026-11-02 (https://resend.com/pricing, https://loops.so/pricing, https://customer.io/pricing; read through page summaries, so confirm before paying):

| Tool | One line | Price |
| --- | --- | --- |
| Resend (chosen) | Already integrated; rules live in our worker; webhooks signed with Svix | Free: 3,000 mails/mo, 100/day, 1 webhook endpoint. Pro $20/mo (50K) or $35/mo (100K), 5 endpoints. Its marketing contacts (not used): $40/mo at 5K, $180 at 25K |
| Loops | Best lifecycle editor, but a second copy of user state | Free to 1,000 contacts; $49/mo to 5,000; 20K price unpublished |
| Customer.io | Most powerful, overkill solo | From $100/mo (5,000 profiles), about $235 at 20K |

Resend Free caps at 100 mails a day, so the first broadcast to over 100 people needs Pro ($20/mo). Resend Broadcasts, Topics and Audiences are not used in v1: they bill per contact and would duplicate preference state we must own anyway for the in-app page and for GDPR.

## Visual direction (pending owner references)

The owner will send screenshots (candidates: Linear, Arc, Raycast, Things, Superhuman, Amie / Notion Calendar, Readwise, Teenage Engineering). Until then, three concrete directions, all inside the PORT.md rules (one text colour at ladder alphas, accent only on a mark, never a solid fill on a button):

- **A. Paper and ink** (Things, Linear). Today's layout, polished: warm paper, one card, ink button, 16 px body, small wordmark. Quietest, closest to the app.
- **B. Letter** (Superhuman, Raycast personal mails). Almost no chrome: wordmark, text, one link styled as a button, signed "Needt". The plain-text part is nearly identical. Fits welcome, win-back, gift.
- **C. Instrument** (Teenage Engineering, Arc). A mono label row (`WELCOME / DAY 0`), a grid of three or four numbers, one accent mark. Fits recap and the gift; too loud for trial-ending.

Recommendation: A as the shell for every mail, B's tone for welcome, win-back and gift, C only for the monthly recap. Final choice after the owner's screenshots.

## Capabilities

### New Capabilities

- `email-preferences`: categories, storage, preference page, one-click unsubscribe per category, migration from today's two switches.
- `email-lifecycle-engine`: rules, skip conditions, quiet hours, cap, ledger, the v1 sequences, the quarterly check.
- `email-templates`: one layout, plain-text parts, voice, accessibility, recap, admin preview.
- `email-gifts`: admin grant, entitlement, email, in-app gift screen, expiry.
- `email-broadcasts`: composer, segments, test send, schedule, send, exclusions.
- `email-deliverability`: List-Unsubscribe headers, Resend webhooks, suppression, domain authentication check, complaint handling.
- `email-legal-footer`: operator identity resolution and the no-placeholder rule.

### Modified Capabilities

None. There is no existing email spec; verify, reset and reminder mail behave as before.

## Impact

- New tables (additive): `EmailPreference`, `EmailSend` (ledger), `EmailSuppression`, `EmailBroadcast`, `ProGift`; one column `User.lastActiveAt` if no usable activity signal exists (to confirm in implementation).
- Code: `src/lib/email/` (preferences, rules, suppression, headers), `src/lib/email/templates/` (new templates), `src/services/email-lifecycle/` (engine), `src/worker/index.ts` and `src/lib/queue/types.ts` (new queue `email-lifecycle`), `src/app/api/webhooks/resend/`, `src/app/api/email/unsubscribe/` (GET becomes a confirm page), Settings (preferences), `src/app/(app)/admin/email/` (preview, broadcasts, gifts), `src/services/admin/user-actions.ts` (grant gift), `src/services/trials/trial-lifecycle.ts` (moves into the engine).
- Feature flag (`src/lib/feature-flags.ts`, server-controlled, off at merge): `email_program` gates everything optional. Transactional mail and compliance fixes are unflagged.
- Cost: Resend Pro $20/mo from the first broadcast.
- Docs: `docs/email-programme.md` operations note; CHANGELOG under `[unreleased]` in each implementation PR.

## Owner decisions (2026-11-02)

The owner answered every open question. These replace the earlier recommendations; the design and specs follow them.

1. **Footer.** The footer shows the owner's name and a virtual mailbox address, both set in admin System Settings (`email.footerName`, `email.footerAddress`), not hard-coded. Until both are set, only transactional email is sent; optional categories are blocked and Admin shows why. A placeholder is never rendered.
2. **Trial-ending promo.** The on-the-day email carries 20% off the first year. It uses a Creem discount code stored in System Settings (`email.trialPromoCode`, created by the owner in Creem) and needs a line in the Terms (drafted in the implementation PR, not published). With no code set, the email falls back to the early-$7-lock copy.
3. **Trial-ending is in `offers`.** People can unsubscribe from it. The in-app banner stays.
4. **EU and UK.** Soft opt-in with a one-click unsubscribe in every optional email. Double opt-in only for a future newsletter, which is out of scope.
5. **Monthly recap** ships in v1, off by default, sent only with real activity.
6. **Students segment** by `.edu` / `.ac.*` domain at send time.
7. **Broadcasts.** Claude composes and schedules them with no owner click. Mandatory safeguards: a test send to the owner's address first; a log with segment and count; a cancel window of at least 15 minutes before the send; a hard cap of one broadcast per 7 days per recipient.
8. **Sender.** `Needt <hello@needt.app>`, reply-to the support address.
9. **Tracking.** Open and click tracking are on for the first month after launch only, then off automatically, driven by a date in System Settings (`email.trackingEndsAt`).
10. **Sunset.** Instead of stopping optional mail after the 30-day win-back, a quarterly "still want these?" email goes out. No reply (no click) means optional mail stops for that person.
