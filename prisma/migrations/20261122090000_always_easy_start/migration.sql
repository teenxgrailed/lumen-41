-- Always easy start (owner request 22.11.2026). Additive only.
--   UserSettings.alwaysEasyStart  the person's switch; DEFAULT true covers every existing row.
--   Task.rescheduleCount          how often the scheduler gave a task another day.
--   Task.simplifiedAt             when the feature last rewrote a task (7-day cooldown).
ALTER TABLE "UserSettings" ADD COLUMN "alwaysEasyStart" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Task" ADD COLUMN "rescheduleCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Task" ADD COLUMN "simplifiedAt" TIMESTAMP(3);
