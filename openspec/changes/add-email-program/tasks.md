# Tasks

Each numbered group is one PR. Gates for every PR: `npm run type-check`, `npm run lint`, `npm run test:unit`, CHANGELOG under `[unreleased]`. Schema changes are additive.

## 0. Compliance fixes (unflagged, own small PR)

- [ ] 0.1 `GET /api/email/unsubscribe` shows a confirm page and changes nothing; `POST` (and RFC 8058 `List-Unsubscribe-Post`) unsubscribes.
- [ ] 0.2 `List-Unsubscribe` headers on optional mail; placeholder guard (`FOOTER_ADDRESS_PLACEHOLDER` deleted, footer from System Settings).
- [ ] 0.3 Resend bounce and complaint webhook with auto-suppression.

All optional behaviour below sits behind the flag `email_program`; transactional mail and the fixes above ship unflagged.

## 1. Foundations (no behaviour change)

- [ ] 1.1 Prisma: `EmailPreference`, `EmailSend` (ledger, unique `userId + ruleKey + dedupeKey`), `EmailSuppression` (hashed address), `ResendWebhookEvent` (svix-id dedupe). Migration additive.
- [ ] 1.2 `src/lib/email/preferences.ts`: `getPreferences`, `isCategoryEnabled` with the legacy `commercialEmailsOptOutAt` and `emailNotifications` fallbacks, `setCategory(source)`, `frequency` flag. Backfill script for opted-out accounts.
- [ ] 1.3 `src/lib/email/operator-footer.ts`: `resolveOperatorFooter()` reading System Settings `email.footerName` and `email.footerAddress`; delete `FOOTER_ADDRESS_PLACEHOLDER`; `renderEmail` throws for optional mail without it; catalog test that no output contains `[OWNER`, `{{` or `}}`.
- [ ] 1.4 Add plain-text part checks and the word-count test for lifecycle templates.
- [ ] 1.5 Flag `email_program` (off); System Settings keys `email.footerName`, `email.footerAddress`, `email.trialPromoCode`, `email.trackingEndsAt`.

## 2. Unsubscribe and preference page

- [ ] 2.1 Extend `UnsubscribeCategory` to `tips | offers | updates | recap | digest | all`; keep `product` as alias. Tests for old tokens.
- [ ] 2.2 `GET /api/email/unsubscribe` renders a confirm page (no change on GET); `POST` unsubscribes and returns a blank 200; rate limit kept.
- [ ] 2.3 Preference page (`/email/preferences?t=`) and Settings, Notifications, Email section; "Fewer emails".
- [ ] 2.4 `EmailService`: headers built from category; drop mail by category, not only by `commercial`.

## 3. Webhook and suppression

- [ ] 3.1 `POST /api/webhooks/resend` with Svix verification on the raw body, 5 minute tolerance, dedupe on `svix-id`.
- [ ] 3.2 Handlers for bounced, complained, delivered, failed, suppressed; complaint switches optional categories off.
- [ ] 3.3 Admin list of suppressions and complaints with removal and audit row.
- [ ] 3.4 Runbook: add the endpoint in Resend, set `RESEND_WEBHOOK_SECRET` on web and worker, send a test event, run the seed-mailbox header check (Gmail, Outlook, Yahoo), enable Postmaster Tools, confirm DMARC reporting.

## 4. Engine

- [ ] 4.1 Queue `email-lifecycle` in `QUEUE_NAMES`, worker, repeatable sweep every 10 minutes.
- [ ] 4.2 `decide()` pure function with the check order in design.md; table-driven tests per skip reason, cap, priority, quiet window across time zones (including DST and an invalid zone).
- [ ] 4.3 Claim, send, retry; stale-claim handling; dry-run mode.
- [ ] 4.4 Resolve the activity signal; add `User.lastActiveAt` only if none exists, throttled to one write per hour.
- [ ] 4.5 Rules and templates: welcome (fired on email confirmation), onboarding 2/5/9.
- [ ] 4.6 Move trial mails into the engine as `trial-ending-3d` and `trial-ending-0d`; honour `day11SentAt` and `day14SentAt`; remove `processTrialLifecycle` sending after one release.
- [ ] 4.7 Win-back 14/30 and the quarterly still-want-these check.
- [ ] 4.8 Monthly recap rule and template (opt-in).
- [ ] 4.9 Dry-run for one week in production; review skip reasons in admin; then turn on at 10%, 100%.

## 5. Gifts

- [ ] 5.1 `ProGift` table; `grantGift` service in `src/services/admin/` with the paid-subscriber refusal, stacking, trial interplay and audit rows.
- [ ] 5.2 Admin action on the user page (1 month / 3 months / 1 year, optional line) and `POST /api/admin/users/[id]/gift`.
- [ ] 5.3 Hourly expiry step in the `account-lifecycle` queue; revoke action; sandbox accounts excluded.
- [ ] 5.4 Gift email template and engine rule (transactional, 08:00 to 21:00 window).
- [ ] 5.5 Gift screen in the app shell, shown once, reduced motion respected.

## 6. Broadcasts

- [ ] 6.1 `EmailBroadcast` table, segment resolvers (free, pro, trial, students, all), exclusions, count endpoint.
- [ ] 6.2 Admin composer, preview, test send, schedule, send, cancel; `/api/admin/email/broadcasts/*`.
- [ ] 6.3 Worker sender: batches of 100, 5 requests per second, ledger key `broadcast:<id>`, resume after restart.
- [ ] 6.4 Safeguards in code: test-before-schedule, log row with segment and count, 15 minute minimum lead and cancel, one broadcast per 7 days per recipient. Admin and MCP path so Claude can compose and schedule.

## 7. Admin preview and rules view

- [ ] 7.1 `/admin/email/templates`: iframe preview with light and dark switch, plain-text part, subject, preheader, category, headers, "Send me this".
- [ ] 7.2 `/admin/email/rules` and ledger view with skip reasons and counts.
- [ ] 7.3 Banner when the footer settings are unset; tracking-window banner.

## 8. Visual direction

- [ ] 8.1 After the owner's references: pick A, B or C from the proposal, move colours and type into named layout tokens, regenerate catalog snapshots.

## 9. Before the first optional mail goes out

- [ ] 9.1 Owner sets System Settings: footer name and address, trial promo code (Creem), tracking end date; owner publishes the Terms line for the promo.
- [ ] 9.2 Legal review of the footer and consent wording for EU and UK recipients.
- [ ] 9.3 Pay for Resend Pro ($20/mo) before the first broadcast over 100 recipients.
- [ ] 9.4 `docs/email-programme.md` operations note: how to pause (flag), how to read the ledger, how to handle a complaint spike.
