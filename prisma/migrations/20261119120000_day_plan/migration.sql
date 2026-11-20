-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "somedayAt" TIMESTAMP(3),
ADD COLUMN     "somedayReason" TEXT;

-- CreateTable
CREATE TABLE "DayPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "source" TEXT NOT NULL DEFAULT 'no_note',
    "builtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "editedByUserAt" TIMESTAMP(3),

    CONSTRAINT "DayPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayPlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "addedBy" TEXT NOT NULL DEFAULT 'draft',
    "resolution" TEXT,

    CONSTRAINT "DayPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskLimit" INTEGER NOT NULL DEFAULT 5,
    "mainLimit" INTEGER NOT NULL DEFAULT 3,
    "focusMinutes" INTEGER NOT NULL DEFAULT 300,
    "morningTime" TEXT NOT NULL DEFAULT '08:00',
    "eveningTime" TEXT NOT NULL DEFAULT '21:00',
    "morningOn" BOOLEAN NOT NULL DEFAULT true,
    "eveningOn" BOOLEAN NOT NULL DEFAULT true,
    "lastMorningAt" TIMESTAMP(3),
    "lastEveningAt" TIMESTAMP(3),
    "limitSuggestion" INTEGER,
    "limitSuggestionDismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SomedayMigrationMove" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),
    "batch" TEXT NOT NULL,

    CONSTRAINT "SomedayMigrationMove_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DayPlan_userId_status_idx" ON "DayPlan"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DayPlan_userId_date_key" ON "DayPlan"("userId", "date");

-- CreateIndex
CREATE INDEX "DayPlanItem_taskId_idx" ON "DayPlanItem"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "DayPlanItem_planId_taskId_key" ON "DayPlanItem"("planId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanSettings_userId_key" ON "PlanSettings"("userId");

-- CreateIndex
CREATE INDEX "SomedayMigrationMove_userId_batch_idx" ON "SomedayMigrationMove"("userId", "batch");

-- CreateIndex
CREATE UNIQUE INDEX "SomedayMigrationMove_taskId_batch_key" ON "SomedayMigrationMove"("taskId", "batch");

-- CreateIndex
CREATE INDEX "Task_userId_somedayAt_idx" ON "Task"("userId", "somedayAt");

-- AddForeignKey
ALTER TABLE "DayPlan" ADD CONSTRAINT "DayPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayPlanItem" ADD CONSTRAINT "DayPlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "DayPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayPlanItem" ADD CONSTRAINT "DayPlanItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSettings" ADD CONSTRAINT "PlanSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SomedayMigrationMove" ADD CONSTRAINT "SomedayMigrationMove_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SomedayMigrationMove" ADD CONSTRAINT "SomedayMigrationMove_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

