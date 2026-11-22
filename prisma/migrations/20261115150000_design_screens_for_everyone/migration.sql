-- Owner decision 2026-11-15 ("делай обновление сразу для всех, не надо через флаги
-- делать постоянно"): the design screens of 15.11 ship to everyone at once. The flags
-- stay only as a kill switch: each can be turned back off from the admin
-- feature-flag API without a deploy. The change is recorded in the flag history like
-- an admin save, with no actor. Idempotent.
--
-- home_v2 is not here: it goes on in the Home polish PR, together with the e2e
-- updates for the folded overdue row (tests/task-complete-motion.spec.ts).
--
-- habit_evening_push keeps its own guards in code: it only ever reaches accounts that
-- already have a push subscription, only when habits are left for today, and every
-- person can switch it off in Settings > Notifications.

INSERT INTO "FeatureFlagChange" ("id", "flagKey", "actorUserId", "before", "after", "createdAt")
SELECT
  'mig_design_15_11_folders_v1',
  'folders_v1',
  NULL,
  COALESCE(
    (SELECT jsonb_build_object('enabled', "enabled", 'rolloutPercentage', "rolloutPercentage")
       FROM "FeatureFlag" WHERE "key" = 'folders_v1'),
    jsonb_build_object('enabled', false, 'rolloutPercentage', 0)
  ),
  jsonb_build_object('enabled', true, 'rolloutPercentage', 100),
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "FeatureFlag"
  WHERE "key" = 'folders_v1' AND "enabled" = true AND "rolloutPercentage" = 100
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "FeatureFlag" ("key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt")
VALUES ('folders_v1', true, 100, 'Projects as folders (Folder component).', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "enabled" = true, "rolloutPercentage" = 100, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "FeatureFlagChange" ("id", "flagKey", "actorUserId", "before", "after", "createdAt")
SELECT
  'mig_design_15_11_habits_cards_v1',
  'habits_cards_v1',
  NULL,
  COALESCE(
    (SELECT jsonb_build_object('enabled', "enabled", 'rolloutPercentage', "rolloutPercentage")
       FROM "FeatureFlag" WHERE "key" = 'habits_cards_v1'),
    jsonb_build_object('enabled', false, 'rolloutPercentage', 0)
  ),
  jsonb_build_object('enabled', true, 'rolloutPercentage', 100),
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "FeatureFlag"
  WHERE "key" = 'habits_cards_v1' AND "enabled" = true AND "rolloutPercentage" = 100
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "FeatureFlag" ("key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt")
VALUES ('habits_cards_v1', true, 100, 'Habits as a card stack with a month grid; Goals as cards.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "enabled" = true, "rolloutPercentage" = 100, "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "FeatureFlagChange" ("id", "flagKey", "actorUserId", "before", "after", "createdAt")
SELECT
  'mig_design_15_11_habit_evening_push',
  'habit_evening_push',
  NULL,
  COALESCE(
    (SELECT jsonb_build_object('enabled', "enabled", 'rolloutPercentage', "rolloutPercentage")
       FROM "FeatureFlag" WHERE "key" = 'habit_evening_push'),
    jsonb_build_object('enabled', false, 'rolloutPercentage', 0)
  ),
  jsonb_build_object('enabled', true, 'rolloutPercentage', 100),
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "FeatureFlag"
  WHERE "key" = 'habit_evening_push' AND "enabled" = true AND "rolloutPercentage" = 100
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "FeatureFlag" ("key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt")
VALUES ('habit_evening_push', true, 100, '20:00 web push "N habits left today": only accounts with a push subscription, only with unfinished habits, switchable in Settings.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "enabled" = true, "rolloutPercentage" = 100, "updatedAt" = CURRENT_TIMESTAMP;
