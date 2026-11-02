-- Additive: OpenID Connect sign-in for Needt's own apps keeps the client's
-- nonce and the moment of authentication with the authorization code until the
-- code is exchanged for an id_token. Both nullable, no backfill.
ALTER TABLE "OAuthAuthorizationCode" ADD COLUMN "nonce" TEXT;
ALTER TABLE "OAuthAuthorizationCode" ADD COLUMN "authTime" TIMESTAMP(3);
