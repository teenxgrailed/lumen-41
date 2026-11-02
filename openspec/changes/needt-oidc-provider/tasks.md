# Tasks

## Wave 1 - Authorization

- [x] **N1 - First-party client and the `openid` authorization request**
  - `first_party` client kind resolved from code and env (`OIDC_BUDGET_REDIRECT_URIS`), row upserted on use.
  - `openid`, `email`, `profile` scopes for first-party clients only; no `resource`; `nonce` kept with the code; no consent screen.
  - Migration `20261102120000_oauth_oidc_nonce`.
  - Completion: MCP requests still require `resource` and show consent (`mcp requests without openid still require resource and consent`).

## Wave 2 - Tokens

- [x] **N2 - id_token, token exchange, JWKS, userinfo, discovery**
  - RS256 id_token (`exp` = `iat` + 300 s, `kid` = RFC 7638 thumbprint) signed with `OIDC_SIGNING_KEY`.
  - `openid` code exchange: id_token and a one-hour userinfo access token, no refresh token.
  - `/oauth/jwks`, `/oauth/userinfo`, `/.well-known/openid-configuration`.
  - Completion: id_token verifies against the published JWKS; an MCP token is refused by userinfo and an OIDC token by the MCP server.

## Wave 3 - Sign-out and docs

- [x] **N3 - Logout, environment documentation, gates**
  - `GET /oauth/logout` signs out and returns only to a post-logout address on a registered origin.
  - `ENV_TEMPLATE.md` and `docs/deploy.md` describe `OIDC_SIGNING_KEY` and `OIDC_BUDGET_REDIRECT_URIS`.
  - Completion: type-check, lint, the full unit suite, and the production build pass.

## Deploy order (not part of this change)

1. Set `OIDC_SIGNING_KEY` and `OIDC_BUDGET_REDIRECT_URIS` on the web service.
2. Deploy; the migration is additive.
3. Check `/.well-known/openid-configuration` and `/oauth/jwks`, then enable the Budget client.
