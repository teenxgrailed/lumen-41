-- Additive. Named personal access tokens, so a person can hold one per tool
-- (MCP client, browser extension, script) instead of a single shared token.
-- The legacy ConnectorSettings token keeps working as "Default".
ALTER TABLE "ConnectorSettings" ADD COLUMN "tokenLastUsedAt" TIMESTAMP(3);

CREATE TABLE "PersonalApiToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenPreview" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalApiToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonalApiToken_tokenHash_key" ON "PersonalApiToken"("tokenHash");
CREATE INDEX "PersonalApiToken_userId_revokedAt_idx" ON "PersonalApiToken"("userId", "revokedAt");

ALTER TABLE "PersonalApiToken" ADD CONSTRAINT "PersonalApiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
