-- Additive. The email programme (openspec add-email-program): preferences, the
-- send ledger, broadcasts, Pro gifts, and four System Settings values.
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "emailFewer" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SystemSettings" ADD COLUMN "emailFooterName" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "emailFooterAddress" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "emailTrialPromoCode" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "emailTrackingEndsAt" TIMESTAMP(3);

CREATE TABLE "EmailPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'settings',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailPreference_userId_category_key" ON "EmailPreference"("userId", "category");

ALTER TABLE "EmailPreference" ADD CONSTRAINT "EmailPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EmailSend" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "ruleKey" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "deferUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "resendId" TEXT,
    "broadcastId" TEXT,
    "keptAt" TIMESTAMP(3),
    "opens" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailSend_userId_ruleKey_dedupeKey_key" ON "EmailSend"("userId", "ruleKey", "dedupeKey");
CREATE INDEX "EmailSend_userId_sentAt_idx" ON "EmailSend"("userId", "sentAt");
CREATE INDEX "EmailSend_ruleKey_status_idx" ON "EmailSend"("ruleKey", "status");
CREATE INDEX "EmailSend_status_deferUntil_idx" ON "EmailSend"("status", "deferUntil");
CREATE INDEX "EmailSend_broadcastId_idx" ON "EmailSend"("broadcastId");
CREATE INDEX "EmailSend_resendId_idx" ON "EmailSend"("resendId");

ALTER TABLE "EmailSend" ADD CONSTRAINT "EmailSend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EmailBroadcast" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT NOT NULL DEFAULT '',
    "paragraphs" JSONB NOT NULL,
    "buttonLabel" TEXT,
    "buttonUrl" TEXT,
    "category" TEXT NOT NULL DEFAULT 'updates',
    "segment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdByKind" TEXT NOT NULL DEFAULT 'admin',
    "testedAt" TIMESTAMP(3),
    "contentUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientCount" INTEGER,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailBroadcast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailBroadcast_status_scheduledAt_idx" ON "EmailBroadcast"("status", "scheduledAt");

CREATE TABLE "ProGift" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedBy" TEXT,
    "months" INTEGER NOT NULL,
    "personalNote" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "seenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProGift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProGift_userId_endsAt_idx" ON "ProGift"("userId", "endsAt");
CREATE INDEX "ProGift_endsAt_idx" ON "ProGift"("endsAt");

ALTER TABLE "ProGift" ADD CONSTRAINT "ProGift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
