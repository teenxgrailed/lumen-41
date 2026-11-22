-- Additive: new enums, new tables, one defaulted column. Nothing existing is
-- rewritten, so the previous release keeps working against this schema.

-- CreateEnum
CREATE TYPE "AnnouncementKind" AS ENUM ('update', 'tip', 'event', 'offer');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('draft', 'published');

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "productUpdates" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "AnnouncementKind" NOT NULL DEFAULT 'update',
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'draft',
    "badge" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "bullets" JSONB NOT NULL DEFAULT '[]',
    "imageUrl" TEXT,
    "primaryCta" JSONB,
    "secondaryLabel" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "plans" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minAppVersion" TEXT,
    "signedUpBefore" TIMESTAMP(3),
    "signedUpAfter" TIMESTAMP(3),
    "minActiveDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),

    CONSTRAINT "AnnouncementView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopupMomentView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "shownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),

    CONSTRAINT "PopupMomentView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Announcement_slug_key" ON "Announcement"("slug");

-- CreateIndex
CREATE INDEX "Announcement_status_startsAt_endsAt_idx" ON "Announcement"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementView_userId_announcementId_key" ON "AnnouncementView"("userId", "announcementId");

-- CreateIndex
CREATE INDEX "AnnouncementView_userId_shownAt_idx" ON "AnnouncementView"("userId", "shownAt");

-- CreateIndex
CREATE INDEX "AnnouncementView_announcementId_idx" ON "AnnouncementView"("announcementId");

-- CreateIndex
CREATE INDEX "PopupMomentView_userId_shownAt_idx" ON "PopupMomentView"("userId", "shownAt");

-- CreateIndex
CREATE INDEX "PopupMomentView_userId_source_key_shownAt_idx" ON "PopupMomentView"("userId", "source", "key", "shownAt");

-- AddForeignKey
ALTER TABLE "AnnouncementView" ADD CONSTRAINT "AnnouncementView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementView" ADD CONSTRAINT "AnnouncementView_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopupMomentView" ADD CONSTRAINT "PopupMomentView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One example draft so the admin page is not empty. Drafts never reach people;
-- publishing is an admin action.
INSERT INTO "Announcement" ("id", "slug", "kind", "status", "badge", "title", "body", "bullets", "secondaryLabel", "priority", "updatedAt")
SELECT 'ann_example_whats_new', 'whats-new-example', 'update', 'draft', 'New',
       'What''s new in Needt',
       'An example draft. Edit it in Admin → Popups, then publish when it is ready.',
       '[{"icon":"sparkles","text":"Describe one change here"},{"icon":"check","text":"And another"}]'::jsonb,
       'Later', 0, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Announcement" WHERE "slug" = 'whats-new-example');
