## ADDED Requirements

### Requirement: First-party clients are configured, not registered

Needt SHALL recognise a fixed set of first-party clients (`needt-budget`) whose redirect URIs come from the environment (`OIDC_BUDGET_REDIRECT_URIS`, comma-separated). Resolving a first-party `client_id` SHALL create or refresh its `OAuthClient` row (`kind` `first_party`) so codes and tokens keep a foreign key to it. A first-party client SHALL be a public client using PKCE S256 with an exact redirect URI match. Dynamic registration and client metadata documents SHALL NOT produce first-party clients.

#### Scenario: Budget's redirect URI is read from the environment

- **WHEN** `OIDC_BUDGET_REDIRECT_URIS` lists `https://budget.needt.app/auth/needt/callback`
- **AND** a request names `client_id=needt-budget`
- **THEN** that URI is the client's registered redirect URI
- **AND** a request with any other `redirect_uri` is refused without redirecting to it

#### Scenario: A first-party client can only sign people in

- **WHEN** `needt-budget` requests a scope that does not include `openid`
- **THEN** the request is answered with `invalid_scope`

### Requirement: The `openid` scope is for first-party clients

`/oauth/authorize` SHALL accept `openid`, optionally with `email` and `profile`, from first-party clients only. Any other client, and any mix with MCP scopes or unknown scopes, SHALL be answered with `invalid_scope`. An `openid` request SHALL NOT require `resource`; the `nonce` SHALL be stored with the authorization code. A signed-in person SHALL be sent back to the client with a code and no consent screen; a signed-out person SHALL be sent to sign-in and returned to the same request.

#### Scenario: A signed-in person is sent straight back

- **WHEN** a signed-in person opens an `openid email profile` request from `needt-budget` with a valid PKCE challenge
- **THEN** they are redirected to the registered redirect URI with `code`, `state` and `iss`
- **AND** no consent screen is shown

#### Scenario: A dynamically registered client cannot ask for openid

- **WHEN** a dynamically registered client requests the `openid` scope
- **THEN** the request is answered with `invalid_scope`

#### Scenario: MCP requests are unchanged

- **WHEN** an MCP client sends a request without `openid`
- **THEN** `resource` is still required and the consent screen is still shown

### Requirement: An openid code is answered with an id_token

The token endpoint SHALL answer a valid `openid` authorization code with an RS256-signed `id_token` and a one-hour access token bound to `<issuer>/oauth/userinfo`, and SHALL NOT issue a refresh token. The id_token SHALL carry `iss`, `sub` (the Needt user id), `aud` (the `client_id`), `iat`, `exp` (`iat` plus 300 seconds), `auth_time`, the stored `nonce`, and, for the granted scopes, `email`, `email_verified` and `name`. `email_verified` SHALL be true only when the account's email is confirmed. The `kid` SHALL be the RFC 7638 thumbprint of the signing key.

#### Scenario: An unconfirmed email is not reported as verified

- **WHEN** the account's email has not been confirmed
- **THEN** the id_token carries `email_verified: false`

#### Scenario: A code is single use

- **WHEN** an authorization code is exchanged twice
- **THEN** the second exchange is refused with `invalid_grant`
- **AND** the access token the first exchange produced stops working

### Requirement: Keys, userinfo and discovery are published

Needt SHALL publish the public signing key at `/oauth/jwks`, the identity claims at `/oauth/userinfo` for the bearer of an `openid` access token, and an OpenID Connect discovery document at `/.well-known/openid-configuration` listing the issuer, endpoints, `response_types_supported` `["code"]`, `code_challenge_methods_supported` `["S256"]`, `id_token_signing_alg_values_supported` `["RS256"]`, `subject_types_supported` `["public"]` and `token_endpoint_auth_methods_supported` `["none"]`. The userinfo endpoint SHALL refuse access tokens issued for the MCP resource, and the MCP server SHALL refuse userinfo tokens.

#### Scenario: Userinfo refuses an MCP token

- **WHEN** `/oauth/userinfo` receives an access token issued for the MCP resource
- **THEN** it answers 401 with `invalid_token`

### Requirement: Needt keeps its own signing key; failing to have one disables only OpenID Connect

The signing key SHALL be the `OIDC_SIGNING_KEY` environment variable (PKCS#8 PEM, RSA, at least 2048 bits) when it is set. Otherwise it SHALL be the RSA 2048 key stored encrypted (`enc:v1`) in `SystemSettings.oidcSigningKey`; when none is stored, Needt SHALL generate one and write it only where the column is still null, then read it back, so that concurrent first uses converge on one key. The key SHALL NOT be logged or returned by any API. When no usable key can be read or made (for example no encryption key is configured in production), `openid` authorization and token requests SHALL fail with `server_error` without spending the authorization code, `/oauth/jwks` SHALL answer 503, and MCP authorization SHALL be unaffected.

#### Scenario: No key configured

- **WHEN** `OIDC_SIGNING_KEY` is not set and no key is stored
- **THEN** a key is generated, stored encrypted and used

#### Scenario: No key can be made

- **WHEN** `OIDC_SIGNING_KEY` is not set and the key cannot be encrypted
- **THEN** an `openid` authorization request is answered with `server_error` to the client
- **AND** an MCP code exchange still succeeds

### Requirement: Logout returns only to a registered address

`GET /oauth/logout` SHALL sign the person out of Needt and then send them to `post_logout_redirect_uri` only when it is on the same origin as one of the named first-party client's registered redirect URIs (over https, or loopback http); otherwise to Needt's home page. A `state` parameter SHALL be passed through to a registered address.

#### Scenario: Unregistered post-logout address

- **WHEN** `post_logout_redirect_uri` is `https://evil.example/`
- **THEN** the person is signed out and lands on Needt's home page
