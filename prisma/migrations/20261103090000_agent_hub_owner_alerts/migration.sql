-- Agent hub: owner alerts replace the escalation / no-agent tasks (expand step).
-- escalationTaskId and noAgentTaskId stay for now and are no longer written.
ALTER TABLE "HubItem" ADD COLUMN "ownerUnread" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HubItem" ADD COLUMN "ownerAlertedAt" TIMESTAMP(3);
ALTER TABLE "HubItem" ADD COLUMN "noAgentAlertedAt" TIMESTAMP(3);

CREATE INDEX "HubItem_userId_workspaceId_ownerUnread_idx" ON "HubItem"("userId", "workspaceId", "ownerUnread");
