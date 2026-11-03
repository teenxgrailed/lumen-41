-- Apple In-App Purchase (StoreKit 2). Additive only: new nullable columns,
-- a new enum and a new table. Nothing reads them until the apple_iap flag is on.

-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('CREEM', 'APPLE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "appleAppAccountToken" TEXT;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "appleBundleId" TEXT,
ADD COLUMN     "appleEnvironment" TEXT,
ADD COLUMN     "appleLastSignedAt" TIMESTAMP(3),
ADD COLUMN     "appleOriginalTransactionId" TEXT,
ADD COLUMN     "appleProductId" TEXT,
ADD COLUMN     "appleTransactionId" TEXT,
ADD COLUMN     "provider" "BillingProvider";

-- CreateTable
CREATE TABLE "AppleNotificationReceipt" (
    "notificationUUID" TEXT NOT NULL,
    "userId" TEXT,
    "notificationType" TEXT NOT NULL,
    "subtype" TEXT,
    "originalTransactionId" TEXT,
    "environment" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "outcome" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppleNotificationReceipt_pkey" PRIMARY KEY ("notificationUUID")
);

-- CreateIndex
CREATE INDEX "AppleNotificationReceipt_userId_signedAt_idx" ON "AppleNotificationReceipt"("userId", "signedAt");

-- CreateIndex
CREATE INDEX "AppleNotificationReceipt_originalTransactionId_idx" ON "AppleNotificationReceipt"("originalTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_appleAppAccountToken_key" ON "User"("appleAppAccountToken");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_appleOriginalTransactionId_key" ON "Subscription"("appleOriginalTransactionId");

-- AddForeignKey
ALTER TABLE "AppleNotificationReceipt" ADD CONSTRAINT "AppleNotificationReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
