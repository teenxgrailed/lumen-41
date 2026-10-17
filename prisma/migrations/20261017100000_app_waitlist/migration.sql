-- Additive: download-form sign-ups from the landing page, one row per (email, app).
CREATE TABLE "AppWaitlist" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'download',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppWaitlist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppWaitlist_email_app_key" ON "AppWaitlist"("email", "app");
CREATE INDEX "AppWaitlist_createdAt_idx" ON "AppWaitlist"("createdAt");
