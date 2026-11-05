-- Admin feature-flag history. Expand only: a new table, nothing existing touched.

CREATE TABLE "FeatureFlagChange" (
    "id" TEXT NOT NULL,
    "flagKey" TEXT NOT NULL,
    "actorUserId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureFlagChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeatureFlagChange_flagKey_createdAt_idx" ON "FeatureFlagChange"("flagKey", "createdAt");

-- The growth block counts people by last activity window.
CREATE INDEX "User_lastActiveAt_idx" ON "User"("lastActiveAt");
