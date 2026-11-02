## Context

What exists today (read 2026-11-02, `origin/main` at 5a715a3):

- **Sending.** `src/lib/email/resend.ts` builds the Resend client; `EmailService.sendEmail` (`email-service.ts`) sends directly, not through a queue. It drops mail to sandbox accounts (`User.sandboxKind`), and drops `commercial: true` mail when `OPERATOR_POSTAL_ADDRESS` is unset or `User.commercialEmailsOptOutAt` is set. With `unsubscribeUrl` it adds `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058). From address comes from `RESEND_FROM_EMAIL`.
- **Layout.** `templates/layout.ts` renders every mail: tables, inline CSS, 16 px body, one ink button, a `kind` of `security | notification | commercial`. A commercial mail must carry `unsubscribeUrl`. The footer address is `operatorPostalAddress() ?? FOOTER_ADDRESS_PLACEHOLDER`.
- **Catalog.** `templates/catalog.ts` `sampleEmails()` returns every template with fixed sample data, for previews and snapshots.
- **Unsubscribe (PR #468).** `unsubscribe.ts` signs `{u, c}` with HMAC-SHA256 over the auth secret; categories `product` and `digest`; tokens do not expire; `applyUnsubscribe` sets `User.commercialEmailsOptOutAt` or `NotificationSettings.digest = false`. `GET /api/email/unsubscribe` applies it, as does `POST`.
- **Preferences.** `NotificationSettings` has `emailNotifications` (global email switch), `dailyEmailEnabled`, `digest`, `digestTime`, `quietHours/Start/End`, `weeklyReview`, `nudges`. Time zone is `UserSettings.timeZone` (a required string).
- **Trial.** `startTrialForVerifiedUser` (`src/lib/trials/trial-service.ts`) creates a `TrialGrant` (one per email key, `NEEDT_PRICING.trialDays` = 14) when the email is confirmed. `processTrialLifecycle` (`src/services/trials/trial-lifecycle.ts`) runs on the `trials` queue and sends `day11` (3 days before the end) and `day14` (after the end) once each, claiming the row first with a 15-minute stale-claim TTL. Admin `extendTrial` (`src/services/admin/user-actions.ts`) extends or creates a grant and writes an admin audit row.
- **Comp Pro.** `src/services/sandbox/sandbox-service.ts` gives the reviewer Pro through an ACTIVE `Subscription` row with no payment ids ("a comp that never expires and no webhook touches"). `effectiveSubscriptionPlan` (`src/lib/entitlements.ts`) returns the plan for any ACTIVE non-FREE subscription and ignores `currentPeriodEnd` while ACTIVE, so a timed comp needs an expiry step of its own.
- **Worker.** `src/worker/index.ts` creates one BullMQ `Worker` per queue in `QUEUE_NAMES` (`src/lib/queue/types.ts`: calendar-sync, reschedule, webhook-renew, mail-sync, reminders, nudges, trials, account-lifecycle, imports, oauth-cleanup, focus, ...) and registers repeatable jobs with `upsertJobScheduler`.
- **Admin.** `/admin` has overview, users, operations, system; `/api/admin/*` routes use `requireAdmin`; `src/services/admin/` records audit rows; flags are admin-editable (`src/lib/feature-flags.ts`, `rolloutBucket`).

## Goals / Non-Goals

Goals:

- Quiet by construction: a person can never get more than one marketing mail in 3 days, never at night, never after opting out, never twice.
- The send decision is one pure function of (person, rule, now) that can be tested without Resend.
- Everything the owner can do by hand in admin can also be done by Claude through the same admin API (product rule: data reachable from outside).
- No placeholder ever reaches an inbox.

Non-goals:

- Per-task emails (hotfix `fix/stop-task-emails`), push or in-app notifications, SMS.
- A visual editor. Broadcast bodies are plain paragraphs plus one optional button, rendered by the one layout.
- Open and click analytics, A/B testing, cohorts.
- Replacing verify, reset, reminder or digest delivery. They keep their code path and gain only the shared footer and header rules.

## Decisions

### 1. Resend stays the sender; Postgres owns the state

Contacts, categories, suppression and segments are our tables. Resend gets one Emails or Batch API call per send, with our own `List-Unsubscribe` headers. Reasons: the in-app preference page and GDPR export/delete need the state in our database anyway; Resend's marketing contacts bill per contact ($40/mo at 5K, $180 at 25K as of 2026-11-02) for state we would still have to mirror; and lifecycle rules ("skip if the person already connected a calendar") need product data that Loops or Customer.io would need us to sync out. Cost is the Resend Pro plan ($20/mo) once broadcasts pass 100 a day. Rejected: Loops (second copy of user state, 20K price unpublished), Customer.io (from $100/mo, overkill).

Batch API sends up to 100 per call; the team limit is 10 requests per second by default, so a 20K broadcast is 200 calls and takes well under a minute, paced by the worker at 5 calls per second.

### 2. Categories, not a free-form topic list

| Category | Key | Default | Contains | Optional |
| --- | --- | --- | --- | --- |
| Account | `transactional` | on | verify, reset, receipts, data export, security, welcome, gift notice, reminders the person set | no |
| Tips | `tips` | on (soft opt-in) | onboarding mails day 2/5/9, product tips | yes |
| Offers | `offers` | on (soft opt-in) | trial ending, promo, win-back | yes |
| Updates | `updates` | on (soft opt-in) | broadcasts the owner writes | yes |
| Recap | `recap` | off | monthly "your month in Needt" | yes |
| Digest | `digest` | off | daily digest (existing toggle) | yes |

The welcome mail and the gift mail are `transactional` because they tell the person something about their own account and carry no promotion; the welcome mail contains no upsell. The test for any new mail is the FTC's "read categories narrowly": if it names a price, a plan or a feature the person has not used, it is optional.

Storage: one row per (user, category) in `EmailPreference { userId, category, enabled, source, updatedAt }`, absent row means the category default. A single "fewer emails" toggle on the page sets a user-level `frequency` of `normal | fewer` which doubles the cap from 3 to 7 days. Rejected: a column per category on `NotificationSettings` (migration per new category), and a Resend Topic per category (state outside our database).

Migration (expand, then contract): reads treat `commercialEmailsOptOutAt IS NOT NULL` as "tips, offers, updates all off"; a one-time backfill writes the rows; `applyUnsubscribe("product")` writes all three rows and the legacy column for one release; the column is dropped in a later change. `NotificationSettings.digest` stays the source of truth for the digest.

### 3. Unsubscribe tokens grow a category

`signUnsubscribeToken` already carries `{u, c}`. `UnsubscribeCategory` grows to `tips | offers | updates | recap | digest | all`, and `product` stays accepted as an alias for `tips + offers + updates` so links already in inboxes keep working (tokens do not expire). `all` is the footer's "unsubscribe from everything optional". `POST` unsubscribes immediately with a blank 200 (what mailbox providers send for one-click); `GET` renders a page that shows the category, a button "Unsubscribe" that POSTs, and a link to the full preference page. This closes the prefetch trap (research item 7). The preference page at `/email/preferences?t=...` works without a session through the same token and with a session from Settings.

### 4. Engine: rules in code, decisions pure, sends claimed

A new BullMQ queue `email-lifecycle` with one repeatable sweep every 10 minutes (`upsertJobScheduler`), plus on-demand jobs for gifts and broadcasts. The sweep selects candidates per rule with a bounded query (index on the trigger column, `take: 100`, same pattern as `processMilestone`), then for each person calls `decide(rule, person, now)`:

```
decide -> { send } | { skip: reason } | { defer: until }
```

Order of checks (first match wins, each skip reason is written to the ledger so "why did she not get it" is answerable):

1. flag `email-lifecycle` on for this person (`rolloutBucket`);
2. recipient is a real account: email verified, not sandbox, not suppressed (`EmailSuppression`), not deleted or deactivating;
3. category enabled (`EmailPreference` with the legacy fallback), `NotificationSettings.emailNotifications` not false;
4. rule skip condition (for example "already created a task");
5. not already sent: ledger unique on `(userId, ruleKey, dedupeKey)`;
6. cap: no marketing mail in the last 3 days (7 on `fewer`), except rules marked `exempt`;
7. quiet window: local time in `UserSettings.timeZone` between 09:00 and 19:00 and, for non-urgent rules, not Saturday or Sunday; also respects `NotificationSettings.quietHours`. Outside it, `defer` to the next window start.
8. operator identity resolvable (design 7); otherwise skip with reason `no-operator`, nothing is claimed.

When two rules are due the same sweep, the higher priority wins and the other defers: trial-ending > win-back > onboarding > recap > update. A deferred rule that is still valid next window is sent then; one whose trigger has passed (for example onboarding step 3 after the person has finished it) is dropped by its own skip condition.

Send path: insert the ledger row `status = claimed` (unique key makes it exactly-once), render, send, set `status = sent` and store the Resend id; on a Resend error set `failed` and let the next sweep retry up to 3 times with 1 hour back-off. A claim older than 15 minutes with no result is treated as stale (same as the trial claim).

`processTrialLifecycle` moves into this engine as rules `trial-ending-3d` and `trial-ending-0d`, reading the existing `TrialGrant.endsAt`. The `day11SentAt`/`day14SentAt` columns stay as read-only history for one release so nothing is sent twice at the switch-over: the rule treats a set `day11SentAt` as already sent.

### 5. The v1 sequences

| Rule key | Category | Trigger | Skip when | Priority |
| --- | --- | --- | --- | --- |
| `welcome` | transactional | email confirmed (same transaction as the trial grant) | never; sent once | n/a |
| `onboard-day2` | tips | 2 days after confirm | no calendar to connect or already connected, or any task created | 3 |
| `onboard-day5` | tips | 5 days after confirm | a task is already scheduled on the calendar | 3 |
| `onboard-day9` | tips | 9 days after confirm | person active in the last 2 days with 5 or more tasks, or on a paid plan | 3 |
| `trial-ending-3d` | offers | `endsAt - 3 days` | already on a paid plan; gift active; no trial | 1 |
| `trial-ending-0d` | offers | `endsAt` day, morning local time | already paid; the 3d mail has not been sent and the person signed up within the last day | 1 |
| `winback-14d` | offers | 14 days since `lastActiveAt` | any paid plan; a trial or gift ends in less than 3 days; previous winback sent | 2 |
| `winback-30d` | offers | 30 days since `lastActiveAt` | returned since the 14d mail (active again) | 2 |
| `sunset` | offers | after `winback-30d` with no return for 60 days | returned | 2 |
| `recap-monthly` | recap | first weekday of the month, local 10:00 | fewer than 3 completed tasks or habit logs in the month; category off | 4 |

Which step each onboarding mail teaches is a product decision for the template copy, not for this spec; each mail names exactly one step: connect a calendar, plan a day, turn on a habit (Free keeps up to 3 habits). The skip predicates read tables that already exist (calendar feeds, tasks, habits); `lastActiveAt` is the only possible new column, set at most once an hour from the session refresh path.

Why "about days 0/2/5/9" and why each mail can vanish: the Meisa data (research item 1) shows the generic day-2 mail has the worst unsubscribe rate, so the rule is a coach for one undone step, not a drip. If a person has done all three steps by day 2, they get no onboarding mail at all, and that is the best outcome.

Trial promo: the 3-day mail states the end date, the price, what Free keeps, and that the early $7 lock is open. The 0-day mail (sent the morning the trial ends, before the downgrade is applied by `effectiveSubscriptionPlan`) repeats it once. If the owner approves a discount (open question 2) it appears in the 0-day mail only and comes from a Creem discount code; the `Subscription.discountApplied` column already exists for that bookkeeping.

Win-back: from Needt, signed "Needt", one question ("What got in the way?") with reply-to set to support so a reply reaches a human; the 30-day mail shows what shipped since, taken from the changelog by hand, not generated. The fun element is not here (see recap and gift).

Sunset: after the 30-day mail and 60 more days with no return, one mail "Should we stop?" with a single button to keep; no click means `tips`, `offers`, `updates`, `recap` are switched off with `source = sunset`. Account mail stays.

### 6. Fun, kept small

- **Monthly recap** (opt-in). Three or four real numbers (tasks done, focus hours, best day, habit kept longest), a one-line observation written from fixed templates by comparing with the previous month, and nothing when the data is thin. No streak-loss language ever; a streak appears only as "kept it N days".
- **The gift** (below) is the surprise.
- **Welcome easter egg.** The welcome mail's plain-text part ends with a one-line reply invitation; a reply is read by a human. Cheap, personal, and consistent with brand-only voice (the sender is Needt, not a person).

### 7. Operator identity and the footer

`resolveOperatorFooter()` returns `{ name, address, country } | null`. Name comes from `operatorName()`; address from `operatorPostalAddress()` (`OPERATOR_POSTAL_ADDRESS`, one line). It returns null when the address is unset or still matches the `{{...}}` placeholder pattern (`isUnfilled`). `renderEmail` for any non-transactional mail throws when it returns null, and `EmailService` already refuses commercial mail in that case; the engine checks it before claiming so nothing is marked sent. `FOOTER_ADDRESS_PLACEHOLDER` is deleted. Transactional mail keeps rendering without an address: CAN-SPAM exempts it and the existing behaviour is retained.

The address must be one the FTC accepts (street, USPS PO box, or CMRA mailbox). Whether it also satisfies EU provider-identification rules for an individual operator is a legal question for the owner (proposal question 1); the code only needs a non-placeholder string.

### 8. Gifts reuse the comp row, with an expiry

`ProGift { id, userId, grantedBy, months, personalNote, startsAt, endsAt, seenAt, revokedAt, createdAt }`. Granting, in one transaction with an admin audit row (`user.gift_pro`):

- if the person has a paid, payment-linked subscription (any of the Creem/Stripe ids set): refuse, "already pays";
- otherwise upsert their `Subscription` to `plan = PRO, status = ACTIVE, currentPeriodEnd = endsAt`, with no payment ids, exactly the sandbox shape;
- if they are in a trial, the gift runs from now and the trial rows are left alone (no second trial; the trial mails skip while a gift is active);
- if they already hold an earlier gift, the new one starts at that gift's end (stacking), so a second gift never shortens the first.

Because `effectiveSubscriptionPlan` ignores `currentPeriodEnd` for an ACTIVE row, a new step in the `account-lifecycle` queue (hourly) downgrades gift rows whose `endsAt` has passed and which still have no payment ids, back to FREE, and writes the audit row `gift.expired`. A person who bought a plan in the meantime has payment ids and is never touched. Extending `effectiveSubscriptionPlan` itself to honour `currentPeriodEnd` for payment-less rows was considered and rejected: it is called from many places and the hourly step is enough since the gift email promises a date, not an hour.

The email "You've got a gift from Needt" is sent by the engine as a transactional rule fired from the grant (no cap, no quiet-window deferral beyond 08:00 to 21:00 local, because it is good news the owner chose to send now). The in-app gift screen is a full-screen sheet shown once on next load while `seenAt` is null: the months, the end date, the personal line, one button "Start using Pro", and the line "No card. Nothing to cancel." `seenAt` is set when dismissed. A gift to a person with no account yet is out of scope for v1.

### 9. Broadcasts

`EmailBroadcast { id, subject, preheader, paragraphs, buttonLabel, buttonUrl, category (updates or offers), segment, status draft | testing | scheduled | sending | sent | cancelled, scheduledAt, createdBy, counts }`. A segment is a typed filter, not free SQL:

| Segment | Definition |
| --- | --- |
| `free` | effective plan FREE, no active trial or gift |
| `pro` | effective plan PRO or LIFETIME through payment |
| `trial` | active `TrialGrant` and no paid plan |
| `students` | verified address on a `.edu` or `.ac.*` domain (list kept in code) |
| `all` | everyone eligible; owner-confirmed with a typed count |

Recipients are resolved at send time, minus: category off, `all` unsubscribed, suppressed, sandbox, unverified, deleted, and anyone who received a marketing mail inside the cap window (their send is deferred to the next window, not dropped, for up to 7 days). Flow: draft, **Send test to me** (sends to the signed-in admin's own address with a `[TEST]` subject prefix and a real unsubscribe link that does nothing to a real account), then **Schedule** or **Send now**, with the recipient count shown and re-confirmed. Broadcast sends use the same ledger rule key `broadcast:<id>` so a retry cannot double-send. Claude may create and test-send drafts through the admin API; `scheduled` and `sending` require a human admin action (proposal question 7).

### 10. Webhooks and suppression

`POST /api/webhooks/resend` verifies the Svix signature (`svix-id`, `svix-timestamp`, `svix-signature`) on the raw body with the SDK's verify, rejects stale timestamps, and dedupes on `svix-id` (retries reuse it) with a unique table. Handled events:

- `email.bounced` hard bounce: insert `EmailSuppression { emailHash (HMAC of the lower-cased address, as trial keys are hashed), reason: bounce, source, createdAt }`; a soft bounce is only counted;
- `email.complained`: insert suppression with reason `complaint` and set all optional categories off with `source = complaint`;
- `email.delivered` and `email.failed`: update the ledger status;
- `email.suppressed`: mirror into `EmailSuppression` (Resend already refuses the send);
- opened and clicked: ignored (tracking off, proposal question 9).

Resend suppresses a bounced or complained address provider-wide, including transactional mail; our table mirrors that so the engine skips instead of repeatedly asking. There is no suppression-list API in the docs read on 2026-11-02, so removal is a manual step in the Resend dashboard plus deleting our row from admin, and the spec says so. The endpoint needs a second webhook secret in env (`RESEND_WEBHOOK_SECRET`); the Free plan allows 1 endpoint, enough.

### 11. Domain authentication and monitoring

Before the first optional mail: SPF and DKIM aligned for the sending domain, DMARC at least `p=none` with reporting to a mailbox the owner reads, and a check that Resend's DKIM signature covers `List-Unsubscribe` and `List-Unsubscribe-Post`. The first broadcast after launch is a test to three seed mailboxes (Gmail, Outlook, Yahoo) whose raw headers are inspected. Google Postmaster Tools is added for the sending domain; a complaint rate above 0.1% over 7 days sets `email-lifecycle` to off automatically and pages the owner (the existing nudge/diagnostics path). Sandbox accounts are never mailed (existing behaviour kept).

### 12. Admin

New `/admin/email` area, admin only (`requireAdmin`): **Templates** (every entry of `sampleEmails()` plus the new ones, HTML in an iframe with a light/dark switch, the plain-text part beside it, the subject and preheader, the category and `List-Unsubscribe` headers it would carry, and a button "Send me this" to the admin's own address); **Rules** (read-only table of the v1 rules with counts of sent, skipped by reason, last run); **Ledger** (per person, with filter by address); **Broadcasts**; **Gifts**. Every write records an admin audit row. The same operations are exposed under `/api/admin/email/*` so Claude can draft.

## Risks / Trade-offs

- **Soft opt-in is an argument, not a guarantee.** UK soft opt-in treats a free-trial signup as a sale negotiation; that was read in a secondary source only. Germany expects double opt-in for newsletters. Mitigation: onboarding and trial mails only, every mail has a visible opt-out, no public newsletter list in v1, and the engine can be switched to opt-in per region later by changing category defaults.
- **Individual operator.** The footer address comes from a private person. Owner decision, flagged, no code workaround.
- **Resend as single sender.** One provider outage delays all mail. Accepted at this size; the ledger retries.
- **`lastActiveAt` precision.** Win-back depends on it; an hourly write throttle keeps cost down and is accurate enough for 14 and 30 days.
- **Cap vs importance.** The cap could delay an onboarding mail behind a broadcast. Priority order handles it; trial-ending is never delayed beyond its day.
- **Gift expiry lag of up to an hour.** Acceptable; stated to the person as a date.

## Migration Plan

1. Land tables and preference helpers behind no flag (additive, unread).
2. Land the unsubscribe changes (POST immediate, GET confirm page, new categories, `product` alias) and the preference page.
3. Land the webhook and suppression; configure the endpoint in Resend; verify with a test event.
4. Land the engine with the rules but `email-lifecycle` off; run in dry-run (ledger rows with `status = dry`) for a week and review skip reasons in admin.
5. Resolve the operator identity; switch `email-lifecycle` on at 10%, then 100%; retire the `trials` sender after one release.
6. Land gifts and broadcasts behind their flags.

Rollback: switch the flags off; nothing is destructive. The legacy opt-out column is kept until a later contract change.

## Open Questions

See the end of `proposal.md`. Implementation also has to confirm: which existing field best means "person was active" (session refresh or a UI event), and whether Resend adds RFC 8058 headers on its own for Broadcasts (not relevant while we send through the Emails API).
