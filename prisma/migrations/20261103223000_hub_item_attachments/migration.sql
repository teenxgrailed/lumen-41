-- Attachments on agent hub items. Additive only (expand): two new tables.
-- Nothing reads them until the code that ships with this migration runs.

-- CreateTable
CREATE TABLE "HubItemAttachment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "uploaderKind" TEXT NOT NULL,
    "uploaderAgentId" TEXT,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubItemAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubItemAttachmentBlob" (
    "id" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "HubItemAttachmentBlob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HubItemAttachment_storageKey_key" ON "HubItemAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "HubItemAttachment_itemId_createdAt_idx" ON "HubItemAttachment"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "HubItemAttachment_userId_idx" ON "HubItemAttachment"("userId");

-- AddForeignKey
ALTER TABLE "HubItemAttachment" ADD CONSTRAINT "HubItemAttachment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "HubItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubItemAttachmentBlob" ADD CONSTRAINT "HubItemAttachmentBlob_id_fkey" FOREIGN KEY ("id") REFERENCES "HubItemAttachment"("storageKey") ON DELETE CASCADE ON UPDATE CASCADE;
