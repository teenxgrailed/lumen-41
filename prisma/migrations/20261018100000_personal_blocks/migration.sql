-- Additive: protected personal time (Lunch, Walk, Gym...) the scheduler never fills.
CREATE TABLE "PersonalBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'custom',
    "title" TEXT NOT NULL,
    "emoji" TEXT,
    "color" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "rrule" TEXT,
    "sourceEventId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PersonalBlock_userId_archivedAt_start_idx" ON "PersonalBlock"("userId", "archivedAt", "start");
CREATE INDEX "PersonalBlock_workspaceId_archivedAt_idx" ON "PersonalBlock"("workspaceId", "archivedAt");
CREATE INDEX "PersonalBlock_sourceEventId_idx" ON "PersonalBlock"("sourceEventId");

ALTER TABLE "PersonalBlock" ADD CONSTRAINT "PersonalBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonalBlock" ADD CONSTRAINT "PersonalBlock_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
