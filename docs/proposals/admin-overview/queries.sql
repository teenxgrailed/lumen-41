-- Admin Overview: the same numbers as raw SQL, to cross-check the page against
-- the production database. Read-only. Run each block as is (psql or any client).
--
-- Replace the owner's own addresses in :owner_emails (lower case) before running,
-- e.g. ARRAY['owner@gmail.com']::text[]. Until the migration 20261115130000 is
-- deployed there is no "User"."internal" column: delete the `u."internal" OR` line.
--
-- Every block starts with the same CTEs. They are repeated so a block can be run
-- alone; change one place and change all.

-- ---------------------------------------------------------------------------
-- 0. The internal rule. Which accounts it matches, and why.
-- ---------------------------------------------------------------------------
WITH u AS (
  SELECT u.*,
    CASE
      WHEN u."internal" THEN 'flag'
      WHEN u."role" = 'admin' THEN 'admin'
      WHEN u."sandboxKind" IS NOT NULL THEN 'sandbox'
      WHEN lower(u.email) = ANY (ARRAY['owner@example.com']::text[]) THEN 'owner-email'
      WHEN lower(u.email) LIKE ANY (ARRAY[
        '%@needt.app','%@example.com','%@example.org','%@example.net',
        '%.test','%.invalid','%.localhost','%@mailinator.com',
        '%+test@%','%+qa@%','%+needt@%','%+sandbox@%',
        'test@%','qa@%','reviewer@%','sandbox@%','demo@%','bot@%','agent@%'
      ]) THEN 'email-pattern'
    END AS reason
  FROM "User" u
)
-- How many accounts are internal, and how many were seen in the last 7 days.
SELECT
  count(*)                                                        AS users_all,
  count(*) FILTER (WHERE reason IS NOT NULL)                      AS internal_accounts,
  count(*) FILTER (WHERE reason IS NULL)                          AS external_accounts,
  count(*) FILTER (WHERE reason IS NOT NULL
                   AND "lastActiveAt" > now() - interval '7 days') AS internal_weekly_actives,
  count(*) FILTER (WHERE "lastActiveAt" > now() - interval '7 days') AS weekly_actives_all
FROM u;

-- The candidate list itself (review it; nothing is marked in the database).
WITH u AS (
  SELECT u.id, u.email, u."role", u."sandboxKind", u."lastActiveAt",
    CASE
      WHEN u."internal" THEN 'flag'
      WHEN u."role" = 'admin' THEN 'admin'
      WHEN u."sandboxKind" IS NOT NULL THEN 'sandbox'
      WHEN lower(u.email) = ANY (ARRAY['owner@example.com']::text[]) THEN 'owner-email'
      WHEN lower(u.email) LIKE ANY (ARRAY[
        '%@needt.app','%@example.com','%@example.org','%@example.net',
        '%.test','%.invalid','%.localhost','%@mailinator.com',
        '%+test@%','%+qa@%','%+needt@%','%+sandbox@%',
        'test@%','qa@%','reviewer@%','sandbox@%','demo@%','bot@%','agent@%'
      ]) THEN 'email-pattern'
    END AS reason
  FROM "User" u
)
SELECT reason, email, "role", "sandboxKind", "lastActiveAt"
FROM u WHERE reason IS NOT NULL ORDER BY reason, email;

-- ---------------------------------------------------------------------------
-- 1. The tiles. One row; "ext" = internal accounts left out (the default view).
--    For the "include internal" view replace `WHERE is_ext` by `WHERE true`.
-- ---------------------------------------------------------------------------
WITH u AS (
  SELECT u.id, u."createdAt", u."lastActiveAt",
    (CASE
      WHEN u."internal" THEN true
      WHEN u."role" = 'admin' THEN true
      WHEN u."sandboxKind" IS NOT NULL THEN true
      WHEN lower(u.email) = ANY (ARRAY['owner@example.com']::text[]) THEN true
      WHEN lower(u.email) LIKE ANY (ARRAY[
        '%@needt.app','%@example.com','%@example.org','%@example.net',
        '%.test','%.invalid','%.localhost','%@mailinator.com',
        '%+test@%','%+qa@%','%+needt@%','%+sandbox@%',
        'test@%','qa@%','reviewer@%','sandbox@%','demo@%','bot@%','agent@%'
      ]) THEN true
      ELSE false
    END) AS is_internal
  FROM "User" u
),
-- A plan the person still holds (same rule as holdsPlan / effectiveSubscriptionPlan).
holds AS (
  SELECT s."userId"
  FROM "Subscription" s
  WHERE s.plan <> 'FREE' AND (
    (s.plan = 'PRO' AND s.provider = 'APPLE'
       AND s."currentPeriodEnd" > now() - interval '6 hours')
    OR ((s.plan <> 'PRO' OR s.provider IS NULL OR s.provider = 'CREEM')
       AND (s.status = 'ACTIVE'
         OR (s.status IN ('CANCELED','PAST_DUE','PAYMENT_FAILED')
             AND s."currentPeriodEnd" > now())))
  )
),
-- Paying: an applied subscription.paid, or an applied checkout.completed that took money.
creem_payers AS (
  SELECT e."userId"
  FROM "CreemWebhookEvent" e
  LEFT JOIN "Subscription" s ON s."userId" = e."userId"
  WHERE e."eventType" IN ('checkout.completed','subscription.paid')
    AND e.outcome IN ('processed','processed_without_lifetime_reservation')
  GROUP BY e."userId", s.amount
  HAVING bool_or(e."eventType" = 'subscription.paid') OR coalesce(s.amount, 0) > 0
),
apple_payers AS (
  SELECT s."userId" FROM "Subscription" s JOIN holds h USING ("userId")
  WHERE s."appleOriginalTransactionId" IS NOT NULL AND s."appleEnvironment" = 'Production'
    AND s."userId" NOT IN (SELECT "userId" FROM creem_payers)
),
payers AS (
  SELECT "userId", 'creem' AS how FROM creem_payers
  UNION ALL SELECT "userId", 'apple' FROM apple_payers
),
-- Granted: held plan with no payment id at all (a comp), or a running Pro gift. Never a payer.
comps AS (
  SELECT s."userId", s.plan FROM "Subscription" s JOIN holds h USING ("userId")
  WHERE s."creemCustomerId" IS NULL AND s."creemSubscriptionId" IS NULL
    AND s."creemProductId" IS NULL AND s."stripeCustomerId" IS NULL
    AND s."stripePaymentIntentId" IS NULL AND s."appleOriginalTransactionId" IS NULL
    AND s."userId" NOT IN (SELECT "userId" FROM payers)
),
gifts AS (
  SELECT DISTINCT g."userId" FROM "ProGift" g
  WHERE g."revokedAt" IS NULL AND g."startsAt" <= now() AND g."endsAt" > now()
    AND g."userId" NOT IN (SELECT "userId" FROM payers)
    AND g."userId" NOT IN (SELECT "userId" FROM comps)
),
trials AS (
  SELECT t."userId" FROM "TrialGrant" t
  LEFT JOIN "Subscription" s ON s."userId" = t."userId"
  WHERE t."endsAt" > now() AND t."userId" IS NOT NULL
    AND (s."userId" IS NULL OR s.plan = 'FREE')
),
scoped AS (SELECT u.* FROM u WHERE NOT u.is_internal)   -- the default view
SELECT
  count(*)                                                              AS users,
  count(*) FILTER (WHERE "createdAt" >= now() - interval '7 days')      AS new_7d,
  count(*) FILTER (WHERE id IN (SELECT "userId" FROM trials))           AS active_trials,
  count(*) FILTER (WHERE id IN (SELECT "userId" FROM payers))           AS paying_ever,
  count(*) FILTER (WHERE id IN (SELECT "userId" FROM payers)
                   AND id IN (SELECT "userId" FROM holds))              AS paying_active_now,
  count(*) FILTER (WHERE id IN (SELECT "userId" FROM comps)
                   OR id IN (SELECT "userId" FROM gifts))               AS granted,
  count(*) FILTER (WHERE id IN (SELECT "userId" FROM comps WHERE plan = 'PRO'))      AS granted_pro,
  count(*) FILTER (WHERE id IN (SELECT "userId" FROM comps WHERE plan = 'LIFETIME')) AS granted_lifetime,
  count(*) FILTER (WHERE id IN (SELECT "userId" FROM gifts))            AS granted_gifts,
  count(*) FILTER (WHERE id NOT IN (SELECT "userId" FROM holds)
                   AND id NOT IN (SELECT "userId" FROM comps)
                   AND id NOT IN (SELECT "userId" FROM gifts)
                   AND id NOT IN (SELECT "userId" FROM trials))         AS free,
  count(*) FILTER (WHERE "lastActiveAt" > now() - interval '7 days')    AS weekly_actives,
  (SELECT count(*) FROM "Waitlist")                                     AS waitlist
FROM scoped;

-- ---------------------------------------------------------------------------
-- 2. Activation funnel, distinct external users per step, 7 and 30 days.
--    Names are the ActivationEvent names. First-replan card events are listed
--    beside the funnel, not in it.
-- ---------------------------------------------------------------------------
WITH ext AS (
  SELECT u.id FROM "User" u
  WHERE NOT (
    u."internal" OR u."role" = 'admin' OR u."sandboxKind" IS NOT NULL
    OR lower(u.email) = ANY (ARRAY['owner@example.com']::text[])
    OR lower(u.email) LIKE ANY (ARRAY[
      '%@needt.app','%@example.com','%@example.org','%@example.net',
      '%.test','%.invalid','%.localhost','%@mailinator.com',
      '%+test@%','%+qa@%','%+needt@%','%+sandbox@%',
      'test@%','qa@%','reviewer@%','sandbox@%','demo@%','bot@%','agent@%'
    ])
  )
)
SELECT n.step, n.ord,
  count(DISTINCT e."userId") FILTER (WHERE e."createdAt" >= now() - interval '7 days')  AS users_7d,
  count(DISTINCT e."userId") FILTER (WHERE e."createdAt" >= now() - interval '30 days') AS users_30d
FROM (VALUES
  ('account_created',1),('calendar_connected',2),('task_created',3),
  ('replan_shown',4),('keep_applied',5),
  ('first_replan_card_shown',6),('first_replan_skipped',7),
  ('undo_applied',8),('fill_applied',9)
) AS n(step, ord)
LEFT JOIN "ActivationEvent" e ON e.name = n.step AND e."userId" IN (SELECT id FROM ext)
GROUP BY n.step, n.ord ORDER BY n.ord;

-- ---------------------------------------------------------------------------
-- 3. Weekly activity from ActivationEvent: users with any event other than
--    account_created in each rolling 7-day window, newest first. Internal left out.
-- ---------------------------------------------------------------------------
WITH ext AS (
  SELECT u.id FROM "User" u
  WHERE NOT (
    u."internal" OR u."role" = 'admin' OR u."sandboxKind" IS NOT NULL
    OR lower(u.email) = ANY (ARRAY['owner@example.com']::text[])
    OR lower(u.email) LIKE ANY (ARRAY[
      '%@needt.app','%@example.com','%@example.org','%@example.net',
      '%.test','%.invalid','%.localhost','%@mailinator.com',
      '%+test@%','%+qa@%','%+needt@%','%+sandbox@%',
      'test@%','qa@%','reviewer@%','sandbox@%','demo@%','bot@%','agent@%'
    ])
  )
)
SELECT w AS weeks_ago,
  now() - (w + 1) * interval '7 days' AS window_from,
  now() - w * interval '7 days'       AS window_to,
  (SELECT count(DISTINCT e."userId") FROM "ActivationEvent" e
    WHERE e.name <> 'account_created' AND e."userId" IN (SELECT id FROM ext)
      AND e."createdAt" >  now() - (w + 1) * interval '7 days'
      AND e."createdAt" <= now() - w * interval '7 days') AS active_users
FROM generate_series(0, 7) AS w ORDER BY w;

-- ---------------------------------------------------------------------------
-- 4. Goals (external accounts only, whatever the toggle says).
-- ---------------------------------------------------------------------------
WITH ext AS (
  SELECT u.id, u."lastActiveAt" FROM "User" u
  WHERE NOT (
    u."internal" OR u."role" = 'admin' OR u."sandboxKind" IS NOT NULL
    OR lower(u.email) = ANY (ARRAY['owner@example.com']::text[])
    OR lower(u.email) LIKE ANY (ARRAY[
      '%@needt.app','%@example.com','%@example.org','%@example.net',
      '%.test','%.invalid','%.localhost','%@mailinator.com',
      '%+test@%','%+qa@%','%+needt@%','%+sandbox@%',
      'test@%','qa@%','reviewer@%','sandbox@%','demo@%','bot@%','agent@%'
    ])
  )
),
creem_payers AS (
  SELECT e."userId"
  FROM "CreemWebhookEvent" e
  LEFT JOIN "Subscription" s ON s."userId" = e."userId"
  WHERE e."eventType" IN ('checkout.completed','subscription.paid')
    AND e.outcome IN ('processed','processed_without_lifetime_reservation')
  GROUP BY e."userId", s.amount
  HAVING bool_or(e."eventType" = 'subscription.paid') OR coalesce(s.amount, 0) > 0
)
SELECT
  -- by 30.11.2026: at least 5 external users pressed Keep
  (SELECT count(DISTINCT "userId") FROM "ActivationEvent"
    WHERE name = 'keep_applied' AND "userId" IN (SELECT id FROM ext))          AS keep_users,
  -- by 31.12.2026: at least 10 paying (Creem; add App Store production if it is on)
  (SELECT count(*) FROM creem_payers WHERE "userId" IN (SELECT id FROM ext))   AS paying_creem,
  -- May 2027: 300 weekly actives, 100 paying
  (SELECT count(*) FROM ext WHERE "lastActiveAt" > now() - interval '7 days')  AS weekly_actives;
