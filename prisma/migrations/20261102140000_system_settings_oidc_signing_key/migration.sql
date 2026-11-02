-- Additive: the OpenID Connect signing key Needt makes for itself on first use,
-- stored encrypted (enc:v1). Nullable, no backfill; env OIDC_SIGNING_KEY still wins.
ALTER TABLE "SystemSettings" ADD COLUMN "oidcSigningKey" TEXT;
