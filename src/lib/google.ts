import { google } from "googleapis";

import { getGoogleCredentials, getGoogleMailCredentials } from "./auth";

export async function createGoogleOAuthClient(options?: {
  redirectUrl?: string;
}) {
  const credentials = await getGoogleCredentials();
  return new google.auth.OAuth2(
    credentials.clientId,
    credentials.clientSecret,
    options?.redirectUrl
  );
}

/**
 * OAuth client for Mail. `client` is which one issued (or will issue) the
 * grant: a refresh token only works with the client that issued it.
 */
export async function createGoogleMailOAuthClient(options?: {
  redirectUrl?: string;
}) {
  const credentials = await getGoogleMailCredentials();
  return {
    client: credentials.client,
    oauth2Client: new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      options?.redirectUrl
    ),
  };
}
