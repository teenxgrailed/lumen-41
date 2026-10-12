-- Design v3 port. Default-off server flag: disabled at 0 % rollout, so a
-- merge to main changes nothing for anyone. The owner is let in through a
-- FeatureFlagOverride row, never by raising the rollout here.
INSERT INTO "FeatureFlag" (
  "key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt"
)
VALUES (
  'design_v3', false, 0,
  'Design v3 port: renders the .needt-v3 frame instead of AppShell',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
