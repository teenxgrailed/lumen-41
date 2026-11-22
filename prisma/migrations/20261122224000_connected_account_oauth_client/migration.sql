-- Which Google OAuth client issued the grant: "main" | "mail". NULL = "main".
ALTER TABLE "ConnectedAccount" ADD COLUMN "oauthClient" TEXT;
