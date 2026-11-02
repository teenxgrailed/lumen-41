-- Additive. A Pro subscription superseded by a Lifetime grant that Creem has not
-- yet confirmed canceled, so the cancel is retried until it lands.
ALTER TABLE "Subscription" ADD COLUMN "pendingCreemCancelId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "pendingCreemCancelAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN "pendingCreemCancelNextAt" TIMESTAMP(3);

CREATE INDEX "Subscription_pendingCreemCancelId_idx" ON "Subscription"("pendingCreemCancelId");
