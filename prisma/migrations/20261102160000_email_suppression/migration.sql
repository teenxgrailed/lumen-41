-- Additive. Addresses that bounced or complained (Resend webhook), stored as an
-- HMAC of the lower-cased address, and the Svix event ids already applied.
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'resend-webhook',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailSuppression_emailHash_key" ON "EmailSuppression"("emailHash");
CREATE INDEX "EmailSuppression_createdAt_idx" ON "EmailSuppression"("createdAt");

CREATE TABLE "ResendWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResendWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResendWebhookEvent_createdAt_idx" ON "ResendWebhookEvent"("createdAt");
