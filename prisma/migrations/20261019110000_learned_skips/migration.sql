-- Additive: habit lines the person deleted stay deleted until Forget all.
ALTER TABLE "UserSettings" ADD COLUMN "learnedSkips" TEXT[] DEFAULT ARRAY[]::TEXT[];
