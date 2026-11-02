---
id: 20261102-claude-needt-sso
owner: claude
branch: codex/needt-sso
status: active
updated: 2026-11-02T16:00:00Z
objective: Needt becomes an OpenID Connect provider so Needt Budget can sign people in with a Needt account
---

## Scope

- Governing plan/spec: Budget repo `docs/superpowers/specs/2026-11-02-needt-sso-design.md` (decisions 1-5); openspec change `openspec/changes/needt-oidc-provider/`.
- In scope: first-party `needt-budget` client, `openid` authorize branch, id_token, JWKS, userinfo, discovery, logout, additive nonce/authTime migration.
- Out of scope: MCP OAuth behaviour (unchanged), the Budget client, deploys and production env.

## Completed

- N1 c34f5ad, N2 02757d7, N3 (logout, openspec change, docs) in the next commit.

## Working state

- Files currently dirty or expected to change: none after the N3 commit.
- Foreign changes that must remain untouched: everything in `/Users/lol/Needt` (another session writes there).

## Verification

- Passed: type-check, lint, check:branding, check:ui-contracts, check:worker-bundle, full unit suite (809 suites, with the oauth integration tests on a throwaway local Postgres).
- Not run / still required: `npm run build` finished compiling and page generation but ran out of disk at the trace step (machine disk full); CI must confirm.

## Decisions and constraints

- Signing key: env `OIDC_SIGNING_KEY` if set, else a key Needt makes once and keeps encrypted in `SystemSettings.oidcSigningKey`; if neither can be had, openid requests fail with `server_error`, MCP unaffected.
- No consent screen and no refresh token for first-party openid codes.
- Never run integration code or migrations against the remote Neon database.

## Blockers

- `None`

## Next action

- Review the PR to `main`; set `OIDC_BUDGET_REDIRECT_URIS` (the signing key is optional and made automatically) before enabling the Budget client (do not merge or deploy from this workstream).
