## Why

Needt Budget has its own accounts and passwords. One Needt account should open every Needt app, so people sign in to Budget with the account they already have. Needt already runs an OAuth 2.1 authorization server for MCP clients (`src/services/oauth/*`, `/oauth/*`); adding OpenID Connect to it reuses the codes, PKCE, redirect matching, rate limits and tests instead of introducing a second server.

## What Changes

- Add a first-party client kind (`first_party`) for Needt's own apps. `needt-budget` is the first: a public PKCE client, configured in code with redirect URIs from `OIDC_BUDGET_REDIRECT_URIS`, never registered dynamically.
- Accept the `openid` scope (with `email`, `profile`) at `/oauth/authorize` from first-party clients only. An `openid` request needs no `resource`, carries a `nonce`, and shows no consent screen: a signed-in person is sent back with a code at once; a signed-out person goes through the existing sign-in redirect.
- Answer an `openid` code exchange with an RS256 `id_token` and a one-hour access token for `/oauth/userinfo`, and no refresh token.
- Publish `GET /oauth/jwks`, `GET /oauth/userinfo`, `GET /.well-known/openid-configuration`, and `GET /oauth/logout`; add `jwks_uri` to the existing `oauth-authorization-server` document (`openid` is advertised only in `openid-configuration`, so MCP clients never see a scope they cannot use).
- Add `OAuthAuthorizationCode.nonce` and `OAuthAuthorizationCode.authTime` (additive, nullable).
- MCP OAuth is unchanged: same endpoints, same consent, `resource` still required, existing tokens keep working.

## Capabilities

### New Capabilities

- `oauth`: Needt as an OpenID Connect provider for its own apps (first-party clients, id_token, JWKS, userinfo, discovery, logout).

### Modified Capabilities

<!-- None. MCP OAuth behaviour is not changed. -->

## Impact

- `src/services/oauth/{first-party,oidc,logout}.ts` new; `authorize.ts`, `clients.ts`, `constants.ts`, `grants.ts`, `consent.ts`, `http.ts` extended.
- `src/app/oauth/{jwks,userinfo,logout}`, `src/app/.well-known/openid-configuration` new; `src/app/oauth/{authorize,token}` extended.
- `prisma/migrations/20261102120000_oauth_oidc_nonce` (two nullable columns).
- New environment: `OIDC_SIGNING_KEY` (PKCS#8 PEM, RSA 2048 or larger) and `OIDC_BUDGET_REDIRECT_URIS` (comma-separated). Without the key, `openid` requests fail with `server_error` and nothing else is affected.
- The consumer is Needt Budget (separate repository); its client is not part of this change.

## Known limits

- `post_logout_redirect_uri` is checked by registered origin, not by exact URI.
- `auth_time` is the moment the code is issued, so `max_age` and `prompt=login` are not supported.
