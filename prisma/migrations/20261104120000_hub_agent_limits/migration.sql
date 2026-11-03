-- Per-agent workload limits for the agent hub. Additive only: a nullable Json
-- column on HubAgent (null = no limits) and a flag on HubItem for big jobs.

-- AlterTable
ALTER TABLE "HubAgent" ADD COLUMN "limits" JSONB;

-- AlterTable
ALTER TABLE "HubItem" ADD COLUMN "large" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "largeApprovedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "HubItemEvent_actorAgentId_type_at_idx" ON "HubItemEvent"("actorAgentId", "type", "at");
