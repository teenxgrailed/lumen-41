-- Agent hub graph (expand step, additive): item links, a done-criteria
-- checklist and reported usage.
ALTER TABLE "HubItem" ADD COLUMN "criteriaItems" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "HubItem" ADD COLUMN "usageTokens" INTEGER;
ALTER TABLE "HubItem" ADD COLUMN "usageCostUsd" DOUBLE PRECISION;
ALTER TABLE "HubItem" ADD COLUMN "usageMinutes" INTEGER;

CREATE TABLE "HubItemLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubItemLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HubItemLink_fromId_toId_kind_key" ON "HubItemLink"("fromId", "toId", "kind");
CREATE INDEX "HubItemLink_toId_kind_idx" ON "HubItemLink"("toId", "kind");
CREATE INDEX "HubItemLink_userId_workspaceId_idx" ON "HubItemLink"("userId", "workspaceId");

ALTER TABLE "HubItemLink" ADD CONSTRAINT "HubItemLink_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "HubItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HubItemLink" ADD CONSTRAINT "HubItemLink_toId_fkey" FOREIGN KEY ("toId") REFERENCES "HubItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
