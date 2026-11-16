-- Expand only: two nullable columns, no backfill, no default. Mail sync stops
-- retrying an account whose sign-in is gone and records why, so the account can
-- show "reconnect" instead of failing every five minutes.
ALTER TABLE "MailAccount" ADD COLUMN "syncPausedAt" TIMESTAMP(3);
ALTER TABLE "MailAccount" ADD COLUMN "syncError" TEXT;
