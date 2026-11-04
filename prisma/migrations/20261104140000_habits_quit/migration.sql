-- CreateEnum
CREATE TYPE "HabitKind" AS ENUM ('BUILD', 'QUIT');

-- CreateEnum
CREATE TYPE "HabitEventType" AS ENUM ('URGE', 'RESISTED', 'RELAPSE', 'MILESTONE');

-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "kind" "HabitKind" NOT NULL DEFAULT 'BUILD',
ADD COLUMN     "quitStartedAt" TIMESTAMP(3),
ADD COLUMN     "reason" TEXT;

-- CreateTable
CREATE TABLE "HabitEvent" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "HabitEventType" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "tag" TEXT,
    "intensity" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HabitEvent_habitId_at_idx" ON "HabitEvent"("habitId", "at");

-- CreateIndex
CREATE INDEX "HabitEvent_userId_at_idx" ON "HabitEvent"("userId", "at");

-- AddForeignKey
ALTER TABLE "HabitEvent" ADD CONSTRAINT "HabitEvent_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitEvent" ADD CONSTRAINT "HabitEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The flag, off for everybody (the code also treats a missing row as off).
INSERT INTO "FeatureFlag" (
  "key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt"
)
VALUES (
  'habits_quit', false, 0,
  'QUIT habits and habit presence (events, summary, reminders)',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
