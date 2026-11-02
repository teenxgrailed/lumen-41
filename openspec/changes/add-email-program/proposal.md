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
- **v1 automated mail:** welcome and three onboarding mails (about days 0 / 2 / 5 / 9, each skipped when the person already did the step), trial ending (3 days before and on the day), win-back (14 and 30 days inactive), then a sunset.
- **Gifts:** admin grants 1 month / 3 months / 1 year of Pro with an optional personal line. Pro turns on at once with no card. The person gets one email and a gift screen in the app. Reuses the sandbox comp mechanism (an ACTIVE `Subscription` with no payment ids).
- **Broadcasts:** the owner (or Claude, through admin) writes a message, picks a segment (Free / Pro / trial / students), sends a test to himself, then sends or schedules.
- **Webhooks:** Resend `bounced` and `complained` events feed a suppression list in Postgres; a complaint also opts the person out of every optional category.
- **Admin preview** of every template with sample data, light and dark, HTML and plain text.
- **Legal footer** is built from a resolved operator identity. When it cannot be resolved, no optional mail is sent. A placeholder is never rendered.
- **Tooling decision:** stay on Resend. Preferences, suppression and segments live in Postgres; Resend is the sender and the bounce source.

Docs-only. This change alters no product code, schema or flag; `tasks.md` lists the implementation in order. The per-task email switch-off is a separate hotfix (`fix/stop-task-emails`) and is not repeated here; only the daily digest remains of task mail.

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
- `email-lifecycle-engine`: rules, skip conditions, quiet hours, cap, ledger, the v1 sequences, sunset.
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
- Feature flags (`src/lib/feature-flags.ts`, server-controlled, off at merge): `email-lifecycle`, `email-broadcasts`, `email-gifts`.
- Cost: Resend Pro $20/mo from the first broadcast.
- Docs: `docs/email-programme.md` operations note; CHANGELOG under `[unreleased]` in each implementation PR.

## Open questions for the owner

Format: question | recommended | alternative.

1. **Who is the sender in the footer?** (Blocks every optional mail.) | Recommended: the operator identity already in `src/lib/legal/operator.ts` (Maksym Antoniuk, Ukraine) plus a CMRA or virtual mailbox address once the owner picks one; no optional mail is sent until then. | Alternative: incorporate first and use the registered office; slower, cleaner for EU rules. A registered-agent address may not satisfy EU rules; ask a lawyer.
2. **Which promo in the trial-ending mail?** | Recommended: no percentage discount. The 3-day mail states the date and that the early $7 price lock is still open; the on-the-day mail repeats it. | Alternative: a one-time 20% off the first year in the on-the-day mail only (needs a Creem discount code and a Terms line).
3. **Is trial-ending optional?** | Recommended: yes, it sits in `offers` and respects unsubscribe; the in-app banner covers people who opted out. | Alternative: treat the 3-day notice as a service message that cannot be switched off (safer for the person's money, riskier under EU rules because it promotes Pro).
4. **Consent basis for EU and UK people.** | Recommended: soft opt-in with a clear opt-out at signup and in every mail for onboarding and trial mail; double opt-in only for a future public newsletter list. | Alternative: an opt-in checkbox at signup for everyone; lower reach, no legal argument.
5. **Does the monthly recap ship in v1?** | Recommended: yes, off by default, only with real activity; it is the fun part. | Alternative: ship v1 without it and add it after a month of data.
6. **Students segment now?** | Recommended: by address domain (`.edu`, `.ac.*`) at send time, no stored flag. | Alternative: wait for a student verification flow; then a student broadcast cannot go out in v1.
7. **Who may send broadcasts?** | Recommended: the owner or Claude drafts in admin; nothing sends until the owner presses Send after a test to himself. | Alternative: Claude may schedule a capped number alone; this breaks the rule that public messages need the owner.
8. **Sender name and address.** | Recommended: `Needt <hello@needt.app>`, replies go to support. | Alternative: a no-reply address; worse for deliverability and for the personal tone.
9. **Open and click tracking.** | Recommended: off; the ledger records sent, delivered, bounced, complained. | Alternative: on for the first month to tune copy.
10. **Sunset.** | Recommended: after the 30-day win-back, no more optional mail; account mail stays. | Alternative: a quarterly "still want these?" mail.
