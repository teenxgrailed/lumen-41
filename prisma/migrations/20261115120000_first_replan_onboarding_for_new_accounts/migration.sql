-- Owner decision 2026-11-15: the first replan demo runs for every new account
-- until 30.11.2026 (the activation criterion needs volume). The demo is only
-- ever created for a new account's sample day, so turning the global flag on
-- at 100% does not touch existing accounts. It can be turned back off from the
-- admin feature-flag API without a deploy. The change is recorded in the flag
-- history like an admin save, with no actor.
--
-- The flag system has no end date. Switching it off after 30.11 is a manual
-- step (see the todo on FIRST_REPLAN_ONBOARDING in src/lib/feature-flags-keys.ts).
INSERT INTO "FeatureFlagChange" ("id", "flagKey", "actorUserId", "before", "after", "createdAt")
SELECT
  'mig_first_replan_new_accounts',
  'first_replan_onboarding',
  NULL,
  COALESCE(
    (SELECT jsonb_build_object('enabled', "enabled", 'rolloutPercentage', "rolloutPercentage")
       FROM "FeatureFlag" WHERE "key" = 'first_replan_onboarding'),
    jsonb_build_object('enabled', false, 'rolloutPercentage', 0)
  ),
  jsonb_build_object('enabled', true, 'rolloutPercentage', 100),
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "FeatureFlag"
  WHERE "key" = 'first_replan_onboarding' AND "enabled" = true AND "rolloutPercentage" = 100
);

INSERT INTO "FeatureFlag" (
  "key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt"
)
VALUES (
  'first_replan_onboarding', true, 100,
  'Demo meeting on a new account''s Today, with a first replan and Keep (until 30.11.2026)',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "enabled" = true, "rolloutPercentage" = 100, "updatedAt" = CURRENT_TIMESTAMP;
