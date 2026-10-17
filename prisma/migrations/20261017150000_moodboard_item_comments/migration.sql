-- Additive: comments on moodboard references.
CREATE TABLE "MoodboardItemComment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "moodboardId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoodboardItemComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MoodboardItemComment_itemId_createdAt_idx" ON "MoodboardItemComment"("itemId", "createdAt");
CREATE INDEX "MoodboardItemComment_moodboardId_createdAt_idx" ON "MoodboardItemComment"("moodboardId", "createdAt");
CREATE INDEX "MoodboardItemComment_authorId_idx" ON "MoodboardItemComment"("authorId");

ALTER TABLE "MoodboardItemComment" ADD CONSTRAINT "MoodboardItemComment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MoodboardItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoodboardItemComment" ADD CONSTRAINT "MoodboardItemComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
