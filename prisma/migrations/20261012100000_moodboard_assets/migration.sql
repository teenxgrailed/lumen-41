-- Moodboards logic (design v3): pictures uploaded to a board's grid.
-- Additive (expand) only: one new table, nothing existing is touched, and the
-- canvas tables (MoodboardCollaborationState, MoodboardSnapshot) are left as they are.

-- CreateTable
CREATE TABLE "MoodboardAsset" (
    "id" TEXT NOT NULL,
    "moodboardId" TEXT NOT NULL,
    "userId" TEXT,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoodboardAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MoodboardAsset_moodboardId_createdAt_idx" ON "MoodboardAsset"("moodboardId", "createdAt");

-- CreateIndex
CREATE INDEX "MoodboardAsset_userId_idx" ON "MoodboardAsset"("userId");

-- AddForeignKey
ALTER TABLE "MoodboardAsset" ADD CONSTRAINT "MoodboardAsset_moodboardId_fkey" FOREIGN KEY ("moodboardId") REFERENCES "Moodboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoodboardAsset" ADD CONSTRAINT "MoodboardAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

