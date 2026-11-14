-- Additive: a table for the six-digit sign-in code mailed to an address.
-- Only an HMAC of the code is stored. Nothing existing is touched.
CREATE TABLE "EmailLoginCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLoginCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailLoginCode_email_createdAt_idx" ON "EmailLoginCode"("email", "createdAt");
CREATE INDEX "EmailLoginCode_expiresAt_idx" ON "EmailLoginCode"("expiresAt");
