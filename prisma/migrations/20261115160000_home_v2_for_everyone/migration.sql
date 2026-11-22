-- Owner decision 2026-11-15: ship to everyone, no new flags. Home v2 (Today in
-- three blocks, the Now card, one chronological list) is on at 100% for every
-- account before Product Hunt (17.11.2026). It can be turned back off from the
-- admin feature-flag API without a deploy. The change is recorded in the flag
-- history like an admin save, with no actor. Idempotent.
INSERT INTO "FeatureFlagChange" ("id", "flagKey", "actorUserId", "before", "after", "createdAt")
SELECT
  'mig_home_v2_everyone',
  'home_v2',
  NULL,
  COALESCE(
    (SELECT jsonb_build_object('enabled', "enabled", 'rolloutPercentage', "rolloutPercentage")
       FROM "FeatureFlag" WHERE "key" = 'home_v2'),
    jsonb_build_object('enabled', false, 'rolloutPercentage', 0)
  ),
  jsonb_build_object('enabled', true, 'rolloutPercentage', 100),
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "FeatureFlag"
  WHERE "key" = 'home_v2' AND "enabled" = true AND "rolloutPercentage" = 100
)
AND NOT EXISTS (
  SELECT 1 FROM "FeatureFlagChange" WHERE "id" = 'mig_home_v2_everyone'
);

INSERT INTO "FeatureFlag" (
  "key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt"
)
VALUES (
  'home_v2', true, 100,
  'Home v2: the Now card, one chronological day, one overdue row',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "enabled" = true, "rolloutPercentage" = 100, "updatedAt" = CURRENT_TIMESTAMP;
