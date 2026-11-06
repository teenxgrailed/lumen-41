export const APNS_VARIABLE_NAMES = [
  "APNS_KEY_ID",
  "APNS_TEAM_ID",
  "APNS_PRIVATE_KEY",
] as const;

export type ApnsVariableName = (typeof APNS_VARIABLE_NAMES)[number];

/** The iOS app's bundle id: the APNs topic of every token it registers. */
export const IOS_BUNDLE_ID = "app.needt.ios";
/** The Mac app's bundle id: the APNs topic for its tokens (one team key). */
export const MAC_BUNDLE_ID = "app.needt.mac";

export type ApnsConfiguration =
  | {
      configured: true;
      missingVariables: [];
      keyId: string;
      teamId: string;
      /** The .p8 key as PEM. */
      privateKey: string;
    }
  | {
      configured: false;
      missingVariables: ApnsVariableName[];
    };

/**
 * The APNs token-auth key (App Store Connect, Users and Access, Keys, Apple
 * Push Notifications service). One key serves both the production and the
 * sandbox host. Coolify stores newlines in `APNS_PRIVATE_KEY` as `\n`, so they
 * are restored here.
 */
export function getApnsConfiguration(
  environment: NodeJS.ProcessEnv = process.env
): ApnsConfiguration {
  const values: Record<ApnsVariableName, string | undefined> = {
    APNS_KEY_ID: environment.APNS_KEY_ID?.trim() || undefined,
    APNS_TEAM_ID: environment.APNS_TEAM_ID?.trim() || undefined,
    APNS_PRIVATE_KEY:
      environment.APNS_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() || undefined,
  };
  const missingVariables = APNS_VARIABLE_NAMES.filter((name) => !values[name]);
  if (missingVariables.length > 0) {
    return { configured: false, missingVariables };
  }
  return {
    configured: true,
    missingVariables: [],
    keyId: values.APNS_KEY_ID as string,
    teamId: values.APNS_TEAM_ID as string,
    privateKey: values.APNS_PRIVATE_KEY as string,
  };
}
