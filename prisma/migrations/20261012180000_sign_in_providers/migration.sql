-- Sign-in providers (Apple, GitHub, Discord, X, LinkedIn, Sign in with ChatGPT).
-- Additive: nullable columns, no backfill. Secret columns hold enc:v1 ciphertext.
ALTER TABLE "SystemSettings" ADD COLUMN "appleClientId" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "appleTeamId" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "appleKeyId" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "applePrivateKey" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "githubClientId" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "githubClientSecret" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "discordClientId" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "discordClientSecret" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "twitterClientId" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "twitterClientSecret" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "linkedinClientId" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "linkedinClientSecret" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "openaiSiwcClientId" TEXT;
ALTER TABLE "SystemSettings" ADD COLUMN "openaiSiwcClientSecret" TEXT;
