-- Additive: the focuses picked in the Sunday review, one row per user, workspace and week.
CREATE TABLE "WeekFocus" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "focuses" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeekFocus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeekFocus_userId_workspaceId_weekStart_key" ON "WeekFocus"("userId", "workspaceId", "weekStart");

ALTER TABLE "WeekFocus" ADD CONSTRAINT "WeekFocus_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WeekFocus" ADD CONSTRAINT "WeekFocus_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
