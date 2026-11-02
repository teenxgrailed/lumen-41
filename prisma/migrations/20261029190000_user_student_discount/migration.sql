-- Additive: the student price (docs/students.md). New enum and nullable
-- columns only, no backfill. The unique index keeps one student address on one
-- account; NULLs do not collide.
CREATE TYPE "StudentSource" AS ENUM ('auto', 'manual');

ALTER TABLE "User" ADD COLUMN "studentEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "studentVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "studentSource" "StudentSource";
ALTER TABLE "User" ADD COLUMN "studentDiscountCode" TEXT;
ALTER TABLE "User" ADD COLUMN "studentRecheckSentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "studentLapsedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_studentEmail_key" ON "User"("studentEmail");
