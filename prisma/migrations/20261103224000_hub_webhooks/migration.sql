-- Agent hub webhooks (additive): endpoints for hub events and their deliveries.
CREATE TABLE "HubWebhook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "disabledReason" TEXT,
    "lastDeliveryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubWebhook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HubWebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastStatus" INTEGER,
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HubWebhook_userId_workspaceId_active_idx" ON "HubWebhook"("userId", "workspaceId", "active");
CREATE INDEX "HubWebhookDelivery_webhookId_createdAt_idx" ON "HubWebhookDelivery"("webhookId", "createdAt");
CREATE INDEX "HubWebhookDelivery_status_nextAttemptAt_idx" ON "HubWebhookDelivery"("status", "nextAttemptAt");

ALTER TABLE "HubWebhook" ADD CONSTRAINT "HubWebhook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HubWebhookDelivery" ADD CONSTRAINT "HubWebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "HubWebhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
