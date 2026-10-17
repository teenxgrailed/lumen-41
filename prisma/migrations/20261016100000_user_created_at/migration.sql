-- Additive: when an account was created, for the admin panel's counts.
-- The column is added WITHOUT a default first, so every existing row stays
-- NULL (unknown) instead of all being stamped with the time of this
-- migration; the default is set afterwards and applies to new rows only.
ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3);
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Best-effort backfill: the trial starts when the address is confirmed, which
-- is the closest dated event to sign-up. Accounts without a grant stay NULL.
UPDATE "User" AS u
SET "createdAt" = t."startedAt"
FROM "TrialGrant" AS t
WHERE t."userId" = u."id" AND u."createdAt" IS NULL;
