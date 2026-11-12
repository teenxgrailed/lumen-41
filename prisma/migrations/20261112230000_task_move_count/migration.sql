-- Plan 11 T-2: how many times the person moved a task to a later day.
-- Additive (expand only): a defaulted column, no backfill, no lock-heavy rewrite.
ALTER TABLE "Task" ADD COLUMN "moveCount" INTEGER NOT NULL DEFAULT 0;
