-- Owner decision 2026-11-19 (D5): the day plan is on for everyone, no rollout
-- percentage. `day_plan` is the kill switch; it ships ON at 100% and can be
-- turned off from the admin feature-flag API without a deploy. Off means the
-- plan touches and the Someday sweep stop; no plan row is ever deleted.
-- Recorded in the flag history like an admin save, with no actor. Idempotent.
--
-- `someday_sweep` is deliberately NOT turned on here. The nightly Someday
-- sweep run against existing data would be the launch migration (PR E) without
-- the owner's yes, so that flag ships off (no row) and only PR E turns it on.
INSERT INTO "FeatureFlagChange" ("id", "flagKey", "actorUserId", "before", "after", "createdAt")
SELECT
  'mig_day_plan_everyone',
  'day_plan',
  NULL,
  COALESCE(
    (SELECT jsonb_build_object('enabled', "enabled", 'rolloutPercentage', "rolloutPercentage")
       FROM "FeatureFlag" WHERE "key" = 'day_plan'),
    jsonb_build_object('enabled', false, 'rolloutPercentage', 0)
  ),
  jsonb_build_object('enabled', true, 'rolloutPercentage', 100),
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "FeatureFlag"
  WHERE "key" = 'day_plan' AND "enabled" = true AND "rolloutPercentage" = 100
)
AND NOT EXISTS (
  SELECT 1 FROM "FeatureFlagChange" WHERE "id" = 'mig_day_plan_everyone'
);

INSERT INTO "FeatureFlag" (
  "key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt"
)
VALUES (
  'day_plan', true, 100,
  'Day plan: limited plan of the day, evening review, Someday (kill switch)',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "enabled" = true, "rolloutPercentage" = 100, "updatedAt" = CURRENT_TIMESTAMP;
