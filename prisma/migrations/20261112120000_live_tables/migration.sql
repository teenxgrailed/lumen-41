-- AlterEnum
ALTER TYPE "PageBlockType" ADD VALUE 'LIVE_TABLE';

-- CreateTable
CREATE TABLE "LiveTable" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Table',
    "columns" JSONB NOT NULL,
    "createdBy" "PageAuthor" NOT NULL DEFAULT 'HUMAN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveTableRow" (
    "id" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cells" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveTableRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveTable_pageId_idx" ON "LiveTable"("pageId");

-- CreateIndex
CREATE INDEX "LiveTableRow_tableId_position_idx" ON "LiveTableRow"("tableId", "position");

-- AddForeignKey
ALTER TABLE "LiveTable" ADD CONSTRAINT "LiveTable_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveTableRow" ADD CONSTRAINT "LiveTableRow_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "LiveTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

