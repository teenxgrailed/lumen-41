-- Importers, PR 1 (Todoist). Expand only: two new tables, three new enums
-- and a default-off "imports" flag. Nothing existing is altered.

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('todoist', 'notion');

-- CreateEnum
CREATE TYPE "ImportRunStatus" AS ENUM ('queued', 'running', 'done', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ImportEntityType" AS ENUM ('project', 'stage', 'task', 'part', 'tag', 'page', 'database', 'record');

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "status" "ImportRunStatus" NOT NULL DEFAULT 'queued',
    "counts" JSONB NOT NULL DEFAULT '{"total":0,"done":0,"skipped":0,"failed":0}',
    "warnings" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "encryptedToken" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportItemMap" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "entityType" "ImportEntityType" NOT NULL,
    "localId" TEXT NOT NULL,
    "importRunId" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportItemMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportRun_userId_createdAt_idx" ON "ImportRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportRun_status_idx" ON "ImportRun"("status");

-- CreateIndex
CREATE INDEX "ImportItemMap_importRunId_idx" ON "ImportItemMap"("importRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportItemMap_userId_source_externalId_entityType_key" ON "ImportItemMap"("userId", "source", "externalId", "entityType");

-- AddForeignKey
ALTER TABLE "ImportRun" ADD CONSTRAINT "ImportRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRun" ADD CONSTRAINT "ImportRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportItemMap" ADD CONSTRAINT "ImportItemMap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportItemMap" ADD CONSTRAINT "ImportItemMap_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Default-off server flag, same pattern as design_v3: an override row lets a
-- person in; nobody sees the importer until then.
INSERT INTO "FeatureFlag" (
  "key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt"
)
VALUES (
  'imports', false, 0,
  'Importers: bring projects and tasks in from Todoist (and later Notion)',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
