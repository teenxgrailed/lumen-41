-- Hub webhooks (additive): a visible count of events dropped on a full backlog,
-- and an index for the retention sweep (delete by age).
ALTER TABLE "HubWebhook" ADD COLUMN "droppedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "HubWebhook" ADD COLUMN "lastDroppedAt" TIMESTAMP(3);

CREATE INDEX "HubWebhookDelivery_createdAt_idx" ON "HubWebhookDelivery"("createdAt");
