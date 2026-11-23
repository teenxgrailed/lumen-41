-- Hub occurrence lease, completion idempotency and owner create dedupe (22.11.2026). Additive only.
--   HubItem.occurrenceExpiresAt   when an occurrence's lease ends (24 h, or the next fire if sooner); null on non-recurring items.
--   HubItem.completionKey         idempotency key of the call that finished the item; null until then.
--   HubItem.completionHash        sha256 of that call's outcome + summary, so a reused key with another result is refused.
--   HubItem_owner_userId_clientRef_key   partial unique index: the owner has no creatorAgentId, and NULLs are distinct in
--                                        the (userId, creatorAgentId, clientRef) unique index, so an owner create with a
--                                        key was never protected against a race. Not expressible in schema.prisma.
-- Indexes are built without CONCURRENTLY: Prisma runs a migration file as one script (a transaction), where
-- CREATE INDEX CONCURRENTLY is refused. HubItem is small (the hub is new) and the occurrenceExpiresAt index is partial.
ALTER TABLE "HubItem" ADD COLUMN "occurrenceExpiresAt" TIMESTAMP(3);
ALTER TABLE "HubItem" ADD COLUMN "completionKey" TEXT;
ALTER TABLE "HubItem" ADD COLUMN "completionHash" TEXT;

-- Block concurrent writes (an old server during a rolling deploy) from now to the end of this transaction, so no
-- owner duplicate key can appear between the nulling UPDATE and the unique index build below.
LOCK TABLE "HubItem" IN SHARE ROW EXCLUSIVE MODE;

-- Unfinished recurring items get a lease from when they opened (24 h) so the occurrence that has been open for
-- days, the one that blocked every later run, expires on the next sweep. needs_owner and blocked are waiting, not
-- hung: they get the 7 day waiting cap from their last change instead.
UPDATE "HubItem"
SET "occurrenceExpiresAt" = CASE
  WHEN "status" IN ('needs_owner', 'blocked') THEN "updatedAt" + INTERVAL '7 days'
  ELSE COALESCE("occurrenceAt", "createdAt") + INTERVAL '24 hours'
END
WHERE "recurrenceId" IS NOT NULL
  AND "status" NOT IN ('done', 'failed', 'cancelled');

CREATE INDEX "HubItem_occurrenceExpiresAt_idx" ON "HubItem"("occurrenceExpiresAt") WHERE "occurrenceExpiresAt" IS NOT NULL;

-- Owner creates that already share a key keep the first; the later ones lose the key (it was never a guarantee for
-- them) so the unique index can be built.
UPDATE "HubItem"
SET "clientRef" = NULL
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "userId", "clientRef" ORDER BY "createdAt", "id") AS "rn"
    FROM "HubItem"
    WHERE "creatorAgentId" IS NULL AND "clientRef" IS NOT NULL
  ) "ranked"
  WHERE "rn" > 1
);

CREATE UNIQUE INDEX "HubItem_owner_userId_clientRef_key" ON "HubItem"("userId", "clientRef") WHERE "creatorAgentId" IS NULL AND "clientRef" IS NOT NULL;
