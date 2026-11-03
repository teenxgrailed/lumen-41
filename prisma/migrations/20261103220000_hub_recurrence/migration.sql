-- Recurring agent hub items (additive: a new table and two nullable columns).
-- AlterTable
ALTER TABLE "HubItem" ADD COLUMN "recurrenceId" TEXT,
ADD COLUMN "occurrenceAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "HubRecurrence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "doneCriteria" TEXT NOT NULL,
    "criteriaItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "context" TEXT NOT NULL,
    "links" JSONB NOT NULL DEFAULT '[]',
    "risks" TEXT[],
    "assigneeAgentId" TEXT,
    "requiredSkills" TEXT[],
    "creatorKind" TEXT NOT NULL,
    "creatorAgentId" TEXT,
    "rrule" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allowOverlap" BOOLEAN NOT NULL DEFAULT false,
    "lastSpawnedItemId" TEXT,
    "lastSpawnedAt" TIMESTAMP(3),
    "spawnCount" INTEGER NOT NULL DEFAULT 0,
    "skipCount" INTEGER NOT NULL DEFAULT 0,
    "lastSkipReason" TEXT,
    "lastSkipAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubRecurrence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HubRecurrence_active_nextRunAt_idx" ON "HubRecurrence"("active", "nextRunAt");

-- CreateIndex
CREATE INDEX "HubRecurrence_userId_workspaceId_idx" ON "HubRecurrence"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "HubItem_recurrenceId_status_idx" ON "HubItem"("recurrenceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HubItem_recurrenceId_occurrenceAt_key" ON "HubItem"("recurrenceId", "occurrenceAt");

-- AddForeignKey
ALTER TABLE "HubRecurrence" ADD CONSTRAINT "HubRecurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
