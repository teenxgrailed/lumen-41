-- Personal needt_ token expiry: additive and nullable. Existing tokens keep
-- null, which means no expiry, until the person rotates them.
ALTER TABLE "ConnectorSettings" ADD COLUMN "tokenExpiresAt" TIMESTAMP(3);
