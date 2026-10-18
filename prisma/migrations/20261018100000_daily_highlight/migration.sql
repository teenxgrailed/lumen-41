-- Additive: the one task a person picked as the main thing of a day.
CREATE TABLE "DailyHighlight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyHighlight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyHighlight_userId_workspaceId_date_key" ON "DailyHighlight"("userId", "workspaceId", "date");
CREATE INDEX "DailyHighlight_taskId_idx" ON "DailyHighlight"("taskId");

ALTER TABLE "DailyHighlight" ADD CONSTRAINT "DailyHighlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyHighlight" ADD CONSTRAINT "DailyHighlight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyHighlight" ADD CONSTRAINT "DailyHighlight_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
