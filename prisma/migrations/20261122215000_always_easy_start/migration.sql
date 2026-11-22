-- Always easy start (owner request 22.11.2026). Additive only.
--   UserSettings.easyStartMode                 auto (default) | suggest | off; DEFAULT auto covers every existing row.
--   UserSettings.easyStartExcludedProjectIds   projects the rules never touch.
--   Task.rescheduleCount                       how often a task was given a later day.
--   Task.simplifiedAt                          when the feature last looked at or rewrote a task (7-day cooldown).
--   EasyStartProposal                          what "suggest" mode proposes until it is applied or dismissed.
ALTER TABLE "UserSettings" ADD COLUMN "easyStartMode" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "UserSettings" ADD COLUMN "easyStartExcludedProjectIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Task" ADD COLUMN "rescheduleCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN "simplifiedAt" TIMESTAMP(3);

CREATE TABLE "EasyStartProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "taskId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "entry" TEXT NOT NULL,
    "title" TEXT,
    "subtasks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL DEFAULT 'fallback',
    "baseTitle" TEXT,
    "baseEntry" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "actionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "EasyStartProposal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EasyStartProposal_userId_status_idx" ON "EasyStartProposal"("userId", "status");
CREATE INDEX "EasyStartProposal_taskId_status_idx" ON "EasyStartProposal"("taskId", "status");

ALTER TABLE "EasyStartProposal" ADD CONSTRAINT "EasyStartProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EasyStartProposal" ADD CONSTRAINT "EasyStartProposal_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
