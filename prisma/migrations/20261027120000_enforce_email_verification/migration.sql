-- Email confirmation is mandatory at sign-up (owner decision 2026-10-27).
--
-- Additive and idempotent. Grandfathering: every account that exists when this
-- migration runs and has not confirmed is stamped as confirmed at its creation
-- time (or now, for rows that predate createdAt), so nobody who already used
-- the app is locked out. This grants no trial: trials start from a confirmation
-- event (or the explicit /api/billing/trial claim), not from this column.
-- Accounts created after the deploy start unconfirmed and are gated.
UPDATE "User"
SET "emailVerified" = COALESCE("createdAt", NOW())
WHERE "emailVerified" IS NULL;

-- The switch now defaults to on, and an existing settings row that still has
-- it off is turned on. Admins keep the switch as an emergency kill.
ALTER TABLE "SystemSettings"
  ALTER COLUMN "requireEmailVerificationBeforeAccess" SET DEFAULT true;
UPDATE "SystemSettings" SET "requireEmailVerificationBeforeAccess" = true;
