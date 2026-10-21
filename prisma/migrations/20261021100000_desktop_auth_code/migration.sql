-- Additive: one-time codes that hand a browser sign-in to the desktop app.
CREATE TABLE "DesktopAuthCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesktopAuthCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DesktopAuthCode_codeHash_key" ON "DesktopAuthCode"("codeHash");

CREATE INDEX "DesktopAuthCode_expiresAt_idx" ON "DesktopAuthCode"("expiresAt");

CREATE INDEX "DesktopAuthCode_userId_idx" ON "DesktopAuthCode"("userId");

ALTER TABLE "DesktopAuthCode" ADD CONSTRAINT "DesktopAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
