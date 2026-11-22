-- Owner decision 2026-11-22: Always easy start goes live for everyone at once.
-- The flag stays as a kill switch: turning it off from the admin feature-flag
-- API stops all three rules without a deploy. Recorded in the flag history
-- like an admin save, with no actor. Idempotent.
INSERT INTO "FeatureFlagChange" ("id", "flagKey", "actorUserId", "before", "after", "createdAt")
SELECT
  'mig_always_easy_start_everyone',
  'always_easy_start',
  NULL,
  COALESCE(
    (SELECT jsonb_build_object('enabled', "enabled", 'rolloutPercentage', "rolloutPercentage")
       FROM "FeatureFlag" WHERE "key" = 'always_easy_start'),
    jsonb_build_object('enabled', false, 'rolloutPercentage', 0)
  ),
  jsonb_build_object('enabled', true, 'rolloutPercentage', 100),
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "FeatureFlag"
  WHERE "key" = 'always_easy_start' AND "enabled" = true AND "rolloutPercentage" = 100
)
AND NOT EXISTS (
  SELECT 1 FROM "FeatureFlagChange" WHERE "id" = 'mig_always_easy_start_everyone'
);

INSERT INTO "FeatureFlag" (
  "key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt"
)
VALUES (
  'always_easy_start', true, 100,
  'Always easy start: easy first step on new tasks, smaller stuck tasks, eased overloaded days (kill switch)',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "enabled" = true, "rolloutPercentage" = 100, "updatedAt" = CURRENT_TIMESTAMP;
