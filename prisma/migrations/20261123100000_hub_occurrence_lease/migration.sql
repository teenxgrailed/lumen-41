-- Hub occurrence lease and completion idempotency (22.11.2026). Additive only.
--   HubItem.occurrenceExpiresAt   when an occurrence's lease ends (24 h, or the next fire if sooner); null on non-recurring items.
--   HubItem.completionKey         idempotency key of the call that finished the item; null until then.
-- Unfinished occurrences that already exist get the plain 24 h lease from the moment they opened, so
-- an occurrence that has been open for days (the one that blocked every later run) expires on the next sweep.
ALTER TABLE "HubItem" ADD COLUMN "occurrenceExpiresAt" TIMESTAMP(3);
ALTER TABLE "HubItem" ADD COLUMN "completionKey" TEXT;

UPDATE "HubItem"
SET "occurrenceExpiresAt" = COALESCE("occurrenceAt", "createdAt") + INTERVAL '24 hours'
WHERE "recurrenceId" IS NOT NULL
  AND "status" NOT IN ('done', 'failed', 'cancelled');

CREATE INDEX "HubItem_occurrenceExpiresAt_idx" ON "HubItem"("occurrenceExpiresAt");
