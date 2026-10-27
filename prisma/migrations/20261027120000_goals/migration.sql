-- AlterEnum
ALTER TYPE "ProactiveNudgeType" ADD VALUE 'GOAL_CHECKIN';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "goalId" TEXT;

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deadline" TIMESTAMP(3),
    "area" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "achievedAt" TIMESTAMP(3),
    "parentId" TEXT,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "unit" TEXT,
    "manualPercent" INTEGER,
    "checkInEnabled" BOOLEAN NOT NULL DEFAULT true,
    "checkInWeekday" INTEGER NOT NULL DEFAULT 1,
    "checkInHour" INTEGER NOT NULL DEFAULT 9,
    "lastCheckInAt" TIMESTAMP(3),
    "sourceTaskId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalProject" (
    "goalId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalProject_pkey" PRIMARY KEY ("goalId","projectId")
);

-- CreateTable
CREATE TABLE "GoalCheckIn" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "percent" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_workspaceId_archivedAt_status_idx" ON "Goal"("workspaceId", "archivedAt", "status");

-- CreateIndex
CREATE INDEX "Goal_userId_archivedAt_idx" ON "Goal"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "Goal_parentId_idx" ON "Goal"("parentId");

-- CreateIndex
CREATE INDEX "GoalProject_projectId_idx" ON "GoalProject"("projectId");

-- CreateIndex
CREATE INDEX "GoalCheckIn_goalId_createdAt_idx" ON "GoalCheckIn"("goalId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_goalId_idx" ON "Task"("goalId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalProject" ADD CONSTRAINT "GoalProject_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalProject" ADD CONSTRAINT "GoalProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalCheckIn" ADD CONSTRAINT "GoalCheckIn_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalCheckIn" ADD CONSTRAINT "GoalCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

