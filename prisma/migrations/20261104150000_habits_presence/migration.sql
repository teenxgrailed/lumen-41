-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "remindersEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "NotificationSettings" ADD COLUMN     "habitCheckin" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "habitCheckinTime" TEXT NOT NULL DEFAULT '21:00',
ADD COLUMN     "habitMilestones" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "habitReengage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "habitReminders" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "HabitPush" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "habitId" TEXT,
    "scope" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitPush_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HabitPush_userId_kind_createdAt_idx" ON "HabitPush"("userId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "HabitPush_habitId_idx" ON "HabitPush"("habitId");

-- CreateIndex
CREATE UNIQUE INDEX "HabitPush_userId_scope_kind_dayKey_key" ON "HabitPush"("userId", "scope", "kind", "dayKey");

-- AddForeignKey
ALTER TABLE "HabitPush" ADD CONSTRAINT "HabitPush_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitPush" ADD CONSTRAINT "HabitPush_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

