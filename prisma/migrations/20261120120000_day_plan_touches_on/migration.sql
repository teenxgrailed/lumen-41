-- Owner decision 2026-11-20 (day plan D): the two daily day-plan touches and the
-- morning digest skip go live for everyone together with the phone Today screen,
-- the evening close and Someday (this change ships the screens). Like
-- `day_plan` it stays a kill switch: it can be turned off from the admin
-- feature-flag API without a deploy, and turning it off stops the touches only;
-- no plan row is touched. Recorded in the flag history like an admin save, with
-- no actor. Idempotent.
INSERT INTO "FeatureFlagChange" ("id", "flagKey", "actorUserId", "before", "after", "createdAt")
SELECT
  'mig_day_plan_touches_everyone',
  'day_plan_touches',
  NULL,
  COALESCE(
    (SELECT jsonb_build_object('enabled', "enabled", 'rolloutPercentage', "rolloutPercentage")
       FROM "FeatureFlag" WHERE "key" = 'day_plan_touches'),
    jsonb_build_object('enabled', false, 'rolloutPercentage', 0)
  ),
  jsonb_build_object('enabled', true, 'rolloutPercentage', 100),
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "FeatureFlag"
  WHERE "key" = 'day_plan_touches' AND "enabled" = true AND "rolloutPercentage" = 100
)
AND NOT EXISTS (
  SELECT 1 FROM "FeatureFlagChange" WHERE "id" = 'mig_day_plan_touches_everyone'
);

INSERT INTO "FeatureFlag" (
  "key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt"
)
VALUES (
  'day_plan_touches', true, 100,
  'Day plan: the two daily touches and the digest skip (kill switch)',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "enabled" = true, "rolloutPercentage" = 100, "updatedAt" = CURRENT_TIMESTAMP;
