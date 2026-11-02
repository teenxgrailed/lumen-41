---
id: 20261102-claude-needt-sso
owner: claude
branch: codex/needt-sso
status: active
updated: 2026-11-02T12:00:00Z
objective: Needt becomes an OpenID Connect provider so Needt Budget can sign people in with a Needt account
---

## Scope

- Governing plan/spec: Budget repo `docs/superpowers/specs/2026-11-02-needt-sso-design.md` (decisions 1-5); openspec change `openspec/changes/needt-oidc-provider/`.
- In scope: first-party `needt-budget` client, `openid` authorize branch, id_token, JWKS, userinfo, discovery, logout, additive nonce/authTime migration.
- Out of scope: MCP OAuth behaviour (unchanged), the Budget client, deploys and production env.

## Completed

- None yet (N1 in progress).

## Working state

- Files currently dirty or expected to change: `src/services/oauth/*`, `src/app/oauth/*`, `src/app/.well-known/*`, `prisma/schema.prisma`, `prisma/migrations/20261102120000_oauth_oidc_nonce/`.
- Foreign changes that must remain untouched: everything in `/Users/lol/Needt` (another session writes there).

## Verification

- Passed: none yet.
- Not run / still required: full gates (type-check, lint, unit suite, build) before the PR.

## Decisions and constraints

- Signing key only from env `OIDC_SIGNING_KEY`; missing key fails openid requests with `server_error`, MCP unaffected.
- No consent screen and no refresh token for first-party openid codes.
- Never run integration code or migrations against the remote Neon database.

## Blockers

- `None`

## Next action

- Finish N1-N3 per the plan, then open the PR to `main` (do not merge or deploy).
