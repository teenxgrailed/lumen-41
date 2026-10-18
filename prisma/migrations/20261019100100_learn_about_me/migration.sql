-- Additive: the opt-in "Let Needt learn about me" switch (off by default) and the
-- columns learned memories need.
ALTER TABLE "UserSettings" ADD COLUMN "learnAboutMe" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserSettings" ADD COLUMN "learnedAt" TIMESTAMP(3);
ALTER TABLE "UserSettings" ADD COLUMN "learnedContentAt" TIMESTAMP(3);

ALTER TABLE "AgentMemory" ADD COLUMN "sourceKey" TEXT;
ALTER TABLE "AgentMemory" ADD COLUMN "data" JSONB;
ALTER TABLE "AgentMemory" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "AgentMemory_workspaceId_userId_sourceKey_idx" ON "AgentMemory"("workspaceId", "userId", "sourceKey");
