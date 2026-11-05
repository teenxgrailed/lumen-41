-- Needt AI on the person's own ChatGPT plan, PR 1. Expand only: the verified
-- account email shown next to a connection. Nullable, no backfill.

ALTER TABLE "AIOAuthConnection" ADD COLUMN "accountLabel" TEXT;
