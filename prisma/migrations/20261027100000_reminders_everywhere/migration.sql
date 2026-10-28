-- Reminders on events, at a time, or on their own; snooze; Settings ->
-- Notifications. Additive only: a new enum value, nullable columns, columns
-- with defaults, and TaskReminder.taskId relaxed to nullable (old code only
-- ever writes it). The new enum value is not used in this transaction.

-- AlterEnum
ALTER TYPE "TaskReminderKind" ADD VALUE 'AT_TIME';

-- AlterTable
ALTER TABLE "TaskReminder" ADD COLUMN     "atTime" TEXT,
ADD COLUMN     "eventId" TEXT,
ADD COLUMN     "fireAt" TIMESTAMP(3),
ADD COLUMN     "snoozedUntil" TIMESTAMP(3),
ADD COLUMN     "title" TEXT,
ALTER COLUMN "taskId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "NotificationSettings" ADD COLUMN     "activityPushedAt" TIMESTAMP(3),
ADD COLUMN     "channelInApp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "channelMac" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "channelPush" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "digest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "digestTime" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "lastDigestAt" TIMESTAMP(3),
ADD COLUMN     "mentions" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "quietEnd" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "quietHours" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "quietStart" TEXT NOT NULL DEFAULT '22:00',
ADD COLUMN     "reminders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "system" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "NotificationRead" ADD COLUMN     "snoozedUntil" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TaskReminder_eventId_idx" ON "TaskReminder"("eventId");

-- AddForeignKey
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
