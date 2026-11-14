-- Additive: product activation events (account_created, calendar_connected,
-- task_created, replan_shown, keep_applied, undo_applied). Nothing existing is touched.
CREATE TABLE "ActivationEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivationEvent_name_createdAt_idx" ON "ActivationEvent"("name", "createdAt");
CREATE INDEX "ActivationEvent_userId_name_idx" ON "ActivationEvent"("userId", "name");

ALTER TABLE "ActivationEvent" ADD CONSTRAINT "ActivationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
