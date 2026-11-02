-- Additive. Lets the sweeps back off feeds that keep failing instead of
-- retrying the same broken ones first every run.
ALTER TABLE "CalendarFeed" ADD COLUMN "lastSyncAttemptAt" TIMESTAMP(3),
ADD COLUMN "syncFailureCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nextSyncAttemptAt" TIMESTAMP(3);
