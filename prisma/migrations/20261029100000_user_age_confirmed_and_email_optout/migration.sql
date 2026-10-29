-- Additive: audit time of the 16+ / Terms confirmation at sign-up, and the
-- one-click unsubscribe from commercial email. Both nullable, no backfill.
ALTER TABLE "User" ADD COLUMN "ageConfirmedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "commercialEmailsOptOutAt" TIMESTAMP(3);
