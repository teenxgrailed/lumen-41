-- Additive: product activation events (account_created, calendar_connected,
-- task_created, replan_shown, keep_applied, undo_applied, fill_applied).
-- Nothing existing is touched.
CREATE TABLE "ActivationEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onceKey" TEXT,

    CONSTRAINT "ActivationEvent_pkey" PRIMARY KEY ("id")
);

-- A once-per-account event sets onceKey to its name; NULLs stay distinct, so
-- repeatable events (task_created, ...) are not affected.
CREATE UNIQUE INDEX "ActivationEvent_userId_onceKey_key" ON "ActivationEvent"("userId", "onceKey");
CREATE INDEX "ActivationEvent_name_createdAt_idx" ON "ActivationEvent"("name", "createdAt");
CREATE INDEX "ActivationEvent_userId_name_idx" ON "ActivationEvent"("userId", "name");
CREATE INDEX "ActivationEvent_createdAt_idx" ON "ActivationEvent"("createdAt");

ALTER TABLE "ActivationEvent" ADD CONSTRAINT "ActivationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One-off, idempotent backfill of account_created from User.createdAt
-- (admins and sandbox accounts excluded). Database rows only: nothing is sent
-- to Umami. Re-running does nothing because of the unique (userId, onceKey).
INSERT INTO "ActivationEvent" ("id", "userId", "name", "createdAt", "onceKey")
SELECT 'bf_' || u."id", u."id", 'account_created', u."createdAt", 'account_created'
FROM "User" u
WHERE u."createdAt" IS NOT NULL
  AND u."role" <> 'admin'
  AND u."sandboxKind" IS NULL
ON CONFLICT DO NOTHING;
