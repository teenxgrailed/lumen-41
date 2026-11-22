-- Additive: an index for the feedback prompt's active-days count (actor + day).
-- CreateIndex
CREATE INDEX "TaskActivity_actorId_createdAt_idx" ON "TaskActivity"("actorId", "createdAt");
