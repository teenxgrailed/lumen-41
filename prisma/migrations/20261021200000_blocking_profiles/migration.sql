-- Focus blocking profiles: additive, nothing else reads them.
CREATE TYPE "BlockingMode" AS ENUM ('BLOCKLIST', 'ALLOWLIST');

CREATE TABLE "BlockingProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sites" TEXT[],
    "apps" TEXT[],
    "mode" "BlockingMode" NOT NULL DEFAULT 'BLOCKLIST',
    "onFocusSession" BOOLEAN NOT NULL DEFAULT false,
    "eventKeywords" TEXT[],
    "calendarFeedIds" TEXT[],
    "projectIds" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlockingProfile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BlockingProfile_userId_idx" ON "BlockingProfile"("userId");

ALTER TABLE "BlockingProfile" ADD CONSTRAINT "BlockingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
