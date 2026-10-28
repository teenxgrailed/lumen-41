-- Additive: the scheduler flags a task it had to place after its due date.
-- AlterTable
ALTER TABLE "Task" ADD COLUMN "scheduleAtRisk" BOOLEAN NOT NULL DEFAULT false;
