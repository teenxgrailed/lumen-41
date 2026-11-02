import type { OAuthClient } from "@prisma/client";

import { isAllowedRedirectUri } from "./redirect-uri";

/**
 * Needt's own apps. They are configured, not registered: the list is code,
 * the redirect URIs are environment. They may ask for `openid` (sign in with a
 * Needt account) and nothing else, and the person is never shown a consent
 * screen for them.
 */
export const FIRST_PARTY_CLIENTS: Record<
  string,
  { name: string; redirectEnv: string }
> = {
  "needt-budget": {
    name: "Needt Budget",
    redirectEnv: "OIDC_BUDGET_REDIRECT_URIS",
  },
};

export const FIRST_PARTY_KIND = "first_party";

export function isFirstPartyClientId(clientId: string): boolean {
  return Object.prototype.hasOwnProperty.call(FIRST_PARTY_CLIENTS, clientId);
}

export function isFirstParty(client: Pick<OAuthClient, "kind">): boolean {
  return client.kind === FIRST_PARTY_KIND;
}

/** The redirect URIs the environment lists for a first-party client. */
export function firstPartyRedirectUris(clientId: string): string[] {
  if (!isFirstPartyClientId(clientId)) return [];
  const raw = process.env[FIRST_PARTY_CLIENTS[clientId].redirectEnv] ?? "";
  return raw
    .split(",")
    .map((uri) => uri.trim())
    .filter((uri) => uri && isAllowedRedirectUri(uri));
}
