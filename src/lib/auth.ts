import { prisma } from "@/lib/prisma";
import { openSystemSettingsSecrets } from "@/lib/system-settings-secrets";

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
