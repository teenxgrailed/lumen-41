-- Idea cards (owner request 22.11.2026). Additive only.
--   TaskKind enum        TASK (default, covers every existing row) | IDEA.
--   Task.kind            what the row is; an idea has no due date and no schedule.
--   Task.ideaSource      user | converted | agent (null on a plain task).
--   Task.ideaSnoozedUntil / ideaLastShownAt / ideaSkipCount / ideaCheckedAt   card rotation and the detection stamp.
--   UserSettings.ideaCardsEnabled   DEFAULT true covers every existing row.
CREATE TYPE "TaskKind" AS ENUM ('TASK', 'IDEA');

ALTER TABLE "Task" ADD COLUMN "kind" "TaskKind" NOT NULL DEFAULT 'TASK';
ALTER TABLE "Task" ADD COLUMN "ideaSource" TEXT;
ALTER TABLE "Task" ADD COLUMN "ideaSnoozedUntil" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "ideaLastShownAt" TIMESTAMP(3);
ALTER TABLE "Task" ADD COLUMN "ideaSkipCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN "ideaCheckedAt" TIMESTAMP(3);

ALTER TABLE "UserSettings" ADD COLUMN "ideaCardsEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Task_userId_kind_ideaLastShownAt_idx" ON "Task"("userId", "kind", "ideaLastShownAt");
