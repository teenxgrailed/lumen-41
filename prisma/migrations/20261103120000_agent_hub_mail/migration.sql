-- Agent hub mail and reservations (expand step, additive).
CREATE TABLE "HubThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "itemId" TEXT,
    "ownerUnread" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HubThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HubMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromKind" TEXT NOT NULL,
    "fromAgentId" TEXT,
    "toAgentIds" TEXT[],
    "toOwner" BOOLEAN NOT NULL DEFAULT false,
    "toAny" BOOLEAN NOT NULL DEFAULT false,
    "anySkills" TEXT[],
    "body" TEXT NOT NULL,
    "importance" TEXT NOT NULL DEFAULT 'normal',
    "ackRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HubMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HubMessageReceipt" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "ackAt" TIMESTAMP(3),
    CONSTRAINT "HubMessageReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HubReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "exclusive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HubReservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HubThread_userId_workspaceId_lastMessageAt_idx" ON "HubThread"("userId", "workspaceId", "lastMessageAt");
CREATE INDEX "HubThread_userId_workspaceId_ownerUnread_idx" ON "HubThread"("userId", "workspaceId", "ownerUnread");
CREATE INDEX "HubMessage_threadId_createdAt_idx" ON "HubMessage"("threadId", "createdAt");
CREATE INDEX "HubMessage_userId_workspaceId_createdAt_idx" ON "HubMessage"("userId", "workspaceId", "createdAt");
CREATE UNIQUE INDEX "HubMessageReceipt_messageId_agentId_key" ON "HubMessageReceipt"("messageId", "agentId");
CREATE INDEX "HubReservation_userId_workspaceId_expiresAt_idx" ON "HubReservation"("userId", "workspaceId", "expiresAt");
CREATE INDEX "HubReservation_agentId_releasedAt_idx" ON "HubReservation"("agentId", "releasedAt");

ALTER TABLE "HubThread" ADD CONSTRAINT "HubThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HubMessage" ADD CONSTRAINT "HubMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "HubThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HubMessageReceipt" ADD CONSTRAINT "HubMessageReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "HubMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HubReservation" ADD CONSTRAINT "HubReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
