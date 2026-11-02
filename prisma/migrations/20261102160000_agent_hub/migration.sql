-- CreateTable
CREATE TABLE "HubAgent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectionKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "capabilities" TEXT NOT NULL DEFAULT '',
    "skills" TEXT[],
    "lastSeenAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubAgentToken" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPreview" TEXT NOT NULL,
    "scopes" TEXT[],
    "workspaceId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubAgentToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "doneCriteria" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "links" JSONB NOT NULL DEFAULT '[]',
    "risks" TEXT[],
    "approvals" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'open',
    "assigneeAgentId" TEXT,
    "requiredSkills" TEXT[],
    "creatorKind" TEXT NOT NULL,
    "creatorAgentId" TEXT,
    "claimedByAgentId" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "leaseExpiredNotedAt" TIMESTAMP(3),
    "due" TIMESTAMP(3),
    "result" JSONB,
    "blockedOn" TEXT,
    "question" TEXT,
    "taskId" TEXT,
    "projectId" TEXT,
    "escalationTaskId" TEXT,
    "noAgentTaskId" TEXT,
    "clientRef" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "HubItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubItemEvent" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorKind" TEXT NOT NULL,
    "actorAgentId" TEXT,
    "type" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "message" TEXT NOT NULL DEFAULT '',
    "data" JSONB,

    CONSTRAINT "HubItemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tags" TEXT[],
    "authorKind" TEXT NOT NULL,
    "authorAgentId" TEXT,
    "itemId" TEXT,
    "taskId" TEXT,
    "projectId" TEXT,
    "ownerEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HubAgent_workspaceId_userId_idx" ON "HubAgent"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HubAgent_userId_workspaceId_connectionKey_key" ON "HubAgent"("userId", "workspaceId", "connectionKey");

-- CreateIndex
CREATE UNIQUE INDEX "HubAgentToken_agentId_key" ON "HubAgentToken"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "HubAgentToken_tokenHash_key" ON "HubAgentToken"("tokenHash");

-- CreateIndex
CREATE INDEX "HubItem_workspaceId_status_assigneeAgentId_idx" ON "HubItem"("workspaceId", "status", "assigneeAgentId");

-- CreateIndex
CREATE INDEX "HubItem_status_leaseExpiresAt_idx" ON "HubItem"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "HubItem_workspaceId_closedAt_idx" ON "HubItem"("workspaceId", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HubItem_userId_creatorAgentId_clientRef_key" ON "HubItem"("userId", "creatorAgentId", "clientRef");

-- CreateIndex
CREATE INDEX "HubItemEvent_itemId_at_idx" ON "HubItemEvent"("itemId", "at");

-- CreateIndex
CREATE INDEX "HubNote_workspaceId_createdAt_idx" ON "HubNote"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "HubNote_tags_idx" ON "HubNote" USING GIN ("tags");

-- AddForeignKey
ALTER TABLE "HubAgent" ADD CONSTRAINT "HubAgent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAgentToken" ADD CONSTRAINT "HubAgentToken_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "HubAgent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubItem" ADD CONSTRAINT "HubItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubItemEvent" ADD CONSTRAINT "HubItemEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "HubItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubNote" ADD CONSTRAINT "HubNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubNote" ADD CONSTRAINT "HubNote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "HubItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Agent hub flag: default off at 0 % rollout, so a merge changes nothing for
-- anyone. The owner is let in through a FeatureFlagOverride row, never by
-- raising the rollout here.
INSERT INTO "FeatureFlag" (
  "key", "enabled", "rolloutPercentage", "description", "createdAt", "updatedAt"
)
VALUES (
  'agent_hub', false, 0,
  'Agent hub: handoffs and notes between agents (MCP tools, Agents screen)',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
