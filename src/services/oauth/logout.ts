import { firstPartyRedirectUris, isFirstPartyClientId } from "./first-party";
import { isAllowedRedirectUri } from "./redirect-uri";

/** `state` is echoed back to the client; it is theirs, but not unbounded. */
const MAX_STATE_LENGTH = 512;

/**
 * Where the person goes once they are signed out (OpenID Connect RP-Initiated
 * Logout): the `post_logout_redirect_uri` only when it belongs to the named
 * first-party client, otherwise Needt's home page. "Belongs" means the same
 * origin as one of the client's registered redirect URIs — the client's own
 * site, not one of its callback paths — over https (or loopback http).
 */
export function resolvePostLogoutTarget(
  clientId: string | null | undefined,
  postLogoutRedirectUri: string | null | undefined,
  state?: string | null
): string {
  if (!clientId || !isFirstPartyClientId(clientId) || !postLogoutRedirectUri) {
    return "/";
  }
  if (!isAllowedRedirectUri(postLogoutRedirectUri)) return "/";
  let target: URL;
  try {
    target = new URL(postLogoutRedirectUri);
  } catch {
    return "/";
  }
  const registered = firstPartyRedirectUris(clientId).some(
    (uri) => new URL(uri).origin === target.origin
  );
  if (!registered) return "/";
  if (state && state.length <= MAX_STATE_LENGTH) {
    target.searchParams.set("state", state);
  }
  return target.toString();
}
