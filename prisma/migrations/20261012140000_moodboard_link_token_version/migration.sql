-- Moodboards: a revocable public link. Additive (expand) only: one column with a default.

-- AlterTable
ALTER TABLE "Moodboard" ADD COLUMN     "linkTokenVersion" INTEGER NOT NULL DEFAULT 0;

