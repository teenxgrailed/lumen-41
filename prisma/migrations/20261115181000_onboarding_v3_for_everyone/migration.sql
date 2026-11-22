-- Owner decision 2026-11-15: the 18-screen /start onboarding (onboarding_v3)
-- for everyone, at 100%. It only decides where a NEW account starts; people
-- who already finished onboarding are never moved. The flag stays as an
-- emergency off switch: turned back off from the admin feature-flag API
-- (no deploy), new accounts go back to /setup. The change is recorded in the
-- flag history like an admin save, with no actor. Idempotent: re-running does
-- nothing once the flag is already on at 100%.
INSERT INTO "FeatureFlagChange" ("id", "flagKey", "actorUserId", "before", "after", "createdAt")
SELECT
  'mig_onboarding_v3_for_everyone',
  'onboarding_v3',
  NULL,
  COALESCE(
    (SELECT jsonb_build_object('enabled', "enabled", 'rolloutPercentage', "rolloutPercentage")
       FROM "FeatureFlag" WHERE "key" = 'onboarding_v3'),
    jsonb_build_object('enabled', false, 'rolloutPercentage', 0)
  ),
  jsonb_build_object('enabled', true, 'rolloutPercentage', 100),
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "FeatureFlag"
  WHERE "key" = 'onboarding_v3' AND "enabled" = true AND "rolloutPercentage" = 100
);

INSERT INTO "FeatureFlag" (
  "key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt"
)
VALUES (
  'onboarding_v3', true, 100,
  'New accounts start in the /start onboarding instead of /setup',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "enabled" = true, "rolloutPercentage" = 100, "updatedAt" = CURRENT_TIMESTAMP;
