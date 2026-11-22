-- Additive: one new column with a default and one new table; nothing existing is rewritten.
-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "feedbackPrompts" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "FeedbackPrompt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "rating" INTEGER,
    "score" INTEGER,
    "text" TEXT,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,

    CONSTRAINT "FeedbackPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedbackPrompt_userId_shownAt_idx" ON "FeedbackPrompt"("userId", "shownAt");

-- CreateIndex
CREATE INDEX "FeedbackPrompt_kind_shownAt_idx" ON "FeedbackPrompt"("kind", "shownAt");

-- CreateIndex
CREATE INDEX "FeedbackPrompt_shownAt_idx" ON "FeedbackPrompt"("shownAt");

-- AddForeignKey
ALTER TABLE "FeedbackPrompt" ADD CONSTRAINT "FeedbackPrompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
