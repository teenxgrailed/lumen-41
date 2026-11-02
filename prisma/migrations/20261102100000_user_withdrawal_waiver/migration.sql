-- Additive: the withdrawal-right acknowledgement taken at paid checkout
-- (Terms 5.5): when, and the Terms version it was shown against. Both
-- nullable, no backfill.
ALTER TABLE "User" ADD COLUMN "withdrawalWaiverAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "withdrawalWaiverTermsVersion" TEXT;
