-- "Do for the full time": a focus session on this task is not ended early when
-- the task is ticked. Nullable and additive; null = auto (habit-linked or
-- recurring tasks count as full time, everything else does not).
ALTER TABLE "Task" ADD COLUMN "fullTime" BOOLEAN;
