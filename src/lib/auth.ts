import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { openSystemSettingsSecrets } from "@/lib/system-settings-secrets";

const LOG_SOURCE = "AuthCredentials";

export async function getGoogleCredentials() {
  if (!process.env.DATABASE_URL) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    };
  }

  try {
    const stored = await prisma.systemSettings.findFirst();
    if (stored) {
      const settings = openSystemSettingsSecrets(stored);
      return {
        clientId: settings.googleClientId || process.env.GOOGLE_CLIENT_ID!,
        clientSecret:
          settings.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET!,
      };
    }
  } catch (error) {
    console.error("Failed to get system settings:", error);
  }

  // Fallback to environment variables
  return {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  };
}

export type GoogleOAuthClientId = "main" | "mail";

let warnedMailFallback = false;

/**
 * Credentials for Mail's own Google OAuth client. Gmail's restricted scope
 * lives in a separate Google Cloud project so it cannot block verification of
 * the main app. `client` says which one is returned: until the owner sets
 * GOOGLE_MAIL_CLIENT_ID/SECRET this falls back to the main client, so nothing
 * breaks, and warns once.
 */
export async function getGoogleMailCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
  client: GoogleOAuthClientId;
}> {
  const clientId = process.env.GOOGLE_MAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_MAIL_CLIENT_SECRET;
  if (clientId && clientSecret) {
    return { clientId, clientSecret, client: "mail" };
  }
  if (!warnedMailFallback) {
    warnedMailFallback = true;
    await logger.warn(
      "GOOGLE_MAIL_CLIENT_ID/SECRET are unset; Mail uses the main Google client",
      undefined,
      LOG_SOURCE
    );
  }
  return { ...(await getGoogleCredentials()), client: "main" };
}

export async function getOutlookCredentials() {
  if (!process.env.DATABASE_URL) {
    return {
      clientId: process.env.AZURE_AD_CLIENT_ID || "",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET || "",
      tenantId: process.env.AZURE_AD_TENANT_ID || "common",
    };
  }

  try {
    const stored = await prisma.systemSettings.findFirst();
    if (stored) {
      const settings = openSystemSettingsSecrets(stored);
      return {
        clientId: settings.outlookClientId || process.env.AZURE_AD_CLIENT_ID!,
        clientSecret:
          settings.outlookClientSecret || process.env.AZURE_AD_CLIENT_SECRET!,
        tenantId:
          settings.outlookTenantId ||
          process.env.AZURE_AD_TENANT_ID ||
          "common",
      };
    }
  } catch (error) {
    console.error("Failed to get system settings:", error);
  }

  // Fallback to environment variables
  const clientId = process.env.AZURE_AD_CLIENT_ID || "";
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET || "";
  const tenantId = process.env.AZURE_AD_TENANT_ID || "";

  return {
    clientId,
    clientSecret,
    tenantId: tenantId,
  };
}
