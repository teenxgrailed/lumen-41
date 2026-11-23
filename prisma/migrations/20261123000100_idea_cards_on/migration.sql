-- Owner decision 2026-11-22: Idea cards go live for everyone at once.
-- The flag stays as a kill switch: turning it off from the admin feature-flag
-- API stops cards and the idea sweep without a deploy. Recorded in the flag history
-- like an admin save, with no actor. Idempotent.
INSERT INTO "FeatureFlagChange" ("id", "flagKey", "actorUserId", "before", "after", "createdAt")
SELECT
  'mig_idea_cards_everyone',
  'idea_cards',
  NULL,
  COALESCE(
    (SELECT jsonb_build_object('enabled', "enabled", 'rolloutPercentage', "rolloutPercentage")
       FROM "FeatureFlag" WHERE "key" = 'idea_cards'),
    jsonb_build_object('enabled', false, 'rolloutPercentage', 0)
  ),
  jsonb_build_object('enabled', true, 'rolloutPercentage', 100),
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "FeatureFlag"
  WHERE "key" = 'idea_cards' AND "enabled" = true AND "rolloutPercentage" = 100
)
AND NOT EXISTS (
  SELECT 1 FROM "FeatureFlagChange" WHERE "id" = 'mig_idea_cards_everyone'
);

INSERT INTO "FeatureFlag" (
  "key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt"
)
VALUES (
  'idea_cards', true, 100,
  'Idea cards: optional ideas offered between tasks, tasks that are really ideas moved to Ideas (kill switch)',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "enabled" = true, "rolloutPercentage" = 100, "updatedAt" = CURRENT_TIMESTAMP;
