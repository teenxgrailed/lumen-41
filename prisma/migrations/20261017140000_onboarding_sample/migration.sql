-- Additive: first-run example data.
-- isSample marks every object the onboarding "sample day" creates, so a single
-- "Clear examples" removes exactly those and the plan limits can ignore them.
ALTER TABLE "Task" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Habit" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Page" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;

-- sampleSeededAt makes the seeding run once per account. Accounts that exist
-- when this migration runs are stamped now, so existing users can never be
-- given examples; new rows stay NULL until their onboarding creates them.
ALTER TABLE "User" ADD COLUMN "sampleSeededAt" TIMESTAMP(3);
UPDATE "User" SET "sampleSeededAt" = CURRENT_TIMESTAMP;
