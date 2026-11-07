-- Owner decision 2026-11-07: QUIT habits and habit presence are on for every
-- account (the Pro check in canUseQuitHabits still applies). Turn the global
-- flag on at 100%. It can be turned back off from the admin feature-flag API
-- without a deploy. The change is recorded in the flag history like an admin
-- save, with no actor.
INSERT INTO "FeatureFlagChange" ("id", "flagKey", "actorUserId", "before", "after", "createdAt")
SELECT
  'mig_habits_quit_everyone',
  'habits_quit',
  NULL,
  COALESCE(
    (SELECT jsonb_build_object('enabled', "enabled", 'rolloutPercentage', "rolloutPercentage")
       FROM "FeatureFlag" WHERE "key" = 'habits_quit'),
    jsonb_build_object('enabled', false, 'rolloutPercentage', 0)
  ),
  jsonb_build_object('enabled', true, 'rolloutPercentage', 100),
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "FeatureFlag"
  WHERE "key" = 'habits_quit' AND "enabled" = true AND "rolloutPercentage" = 100
);

INSERT INTO "FeatureFlag" (
  "key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt"
)
VALUES (
  'habits_quit', true, 100,
  'QUIT habits and habit presence (events, summary, reminders)',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "enabled" = true, "rolloutPercentage" = 100, "updatedAt" = CURRENT_TIMESTAMP;
