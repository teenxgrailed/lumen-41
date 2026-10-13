-- Design v3 ships to everyone (owner decision 2026-10-12). The flag goes on at
-- a 100 % rollout, so every signed-in person gets the v3 frame and a signed-out
-- visitor gets the v3 sign-in (`everyoneSeesV3` in src/lib/needt3/auth-design.ts).
-- Data only and idempotent: the row is created if a database predates
-- 20261009090000_design_v3_flag, and re-running leaves it as it is. A
-- FeatureFlagOverride with enabled = false still keeps one person on the old
-- design; rolling back is the reverse UPDATE, no code change.
INSERT INTO "FeatureFlag" (
  "key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt"
)
VALUES (
  'design_v3', true, 100,
  'Design v3 port: renders the .needt-v3 frame instead of AppShell',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET "enabled" = true, "rolloutPercentage" = 100, "updatedAt" = CURRENT_TIMESTAMP;
