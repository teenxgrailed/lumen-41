-- Learn: topics and their lessons. Additive only.

-- CreateTable
CREATE TABLE "LearnTopic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'violet',
    "icon" TEXT,
    "goal" TEXT,
    "level" TEXT,
    "sampleKey" TEXT,
    "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnLesson" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AI',
    "minutes" INTEGER NOT NULL DEFAULT 5,
    "body" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scheduledTaskId" TEXT,
    "completedAt" TIMESTAMP(3),
    "firstCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnLesson_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LearnTopic_userId_sampleKey_key" ON "LearnTopic"("userId", "sampleKey");

-- CreateIndex
CREATE INDEX "LearnTopic_userId_order_idx" ON "LearnTopic"("userId", "order");

-- CreateIndex
CREATE INDEX "LearnLesson_topicId_order_idx" ON "LearnLesson"("topicId", "order");

-- CreateIndex
CREATE INDEX "LearnLesson_userId_completedAt_idx" ON "LearnLesson"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "LearnLesson_userId_firstCompletedAt_idx" ON "LearnLesson"("userId", "firstCompletedAt");

-- AddForeignKey
ALTER TABLE "LearnTopic" ADD CONSTRAINT "LearnTopic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnLesson" ADD CONSTRAINT "LearnLesson_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "LearnTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearnLesson" ADD CONSTRAINT "LearnLesson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
