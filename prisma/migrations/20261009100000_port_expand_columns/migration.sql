-- Design v3 port, M1 (docs/port/01-data-map.md): columns on existing tables.
-- Expand only: every column is nullable or defaulted; nothing renamed or dropped.

-- AlterTable
ALTER TABLE "AiMessage" ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "refs" JSONB;

-- AlterTable
ALTER TABLE "ConnectedAccount" ADD COLUMN     "syncOptions" JSONB;

-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "color" TEXT,
ADD COLUMN     "icon" TEXT;

-- AlterTable
ALTER TABLE "MailMessage" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "bccAddresses" JSONB,
ADD COLUMN     "ccAddresses" JSONB,
ADD COLUMN     "needsReply" BOOLEAN,
ADD COLUMN     "suggestedTask" TEXT,
ADD COLUMN     "trashedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Moodboard" ADD COLUMN     "linkShare" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pinterestBoardId" TEXT,
ADD COLUMN     "pinterestStatus" TEXT,
ADD COLUMN     "pinterestSyncedAt" TIMESTAMP(3),
ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "trashedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "NotificationSettings" ADD COLUMN     "dailyPlan" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "dailyPlanTime" TEXT NOT NULL DEFAULT '08:30',
ADD COLUMN     "mailPlan" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nudges" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weeklyReview" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "projectId" TEXT,
ADD COLUMN     "style" JSONB;

-- AlterTable
ALTER TABLE "PageComment" ADD COLUMN     "quote" TEXT;

-- AlterTable
ALTER TABLE "PagePublication" ADD COLUMN     "role" "PageAccessRole" NOT NULL DEFAULT 'VIEWER';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "ground" TEXT,
ADD COLUMN     "position" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "originId" TEXT,
ADD COLUMN     "originKind" TEXT,
ADD COLUMN     "originQuote" TEXT,
ADD COLUMN     "splitAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "trashedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN     "onboardingUses" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "prefs" JSONB NOT NULL DEFAULT '{}';

-- CreateIndex
CREATE INDEX "MailMessage_accountId_trashedAt_idx" ON "MailMessage"("accountId", "trashedAt");

-- CreateIndex
CREATE INDEX "Moodboard_projectId_idx" ON "Moodboard"("projectId");

-- CreateIndex
CREATE INDEX "Page_projectId_idx" ON "Page"("projectId");

-- CreateIndex
CREATE INDEX "Task_userId_trashedAt_idx" ON "Task"("userId", "trashedAt");

-- CreateIndex
CREATE INDEX "Task_originKind_originId_idx" ON "Task"("originKind", "originId");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moodboard" ADD CONSTRAINT "Moodboard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
