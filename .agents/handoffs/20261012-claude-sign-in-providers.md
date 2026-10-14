---
id: 20261012-claude-sign-in-providers
owner: claude-sign-in-providers
branch: feat/sign-in-providers
status: active
updated: 2026-10-12T18:00:00Z
objective: Add Apple, GitHub, ChatGPT, Discord, X and LinkedIn sign-in (owner decision 2026-10-12)
---

## Scope

- Governing plan/spec: owner decision 2026-10-12 (sign-in providers).
- In scope: src/lib/auth/{sign-in-providers,account-linking,sign-in-provider-ids}.ts,
  auth-options, signups, SystemSettings columns + admin UI, v3 sign-in screens
  (desktop + phone), brand marks X and LinkedIn, reauth provider list,
  docs/operations/sign-in-providers.md.
- Out of scope: ChatGPT plan-usage scopes (later option), Connections.

## Completed

- Providers built only from configured credentials (System Settings, env fallback).
- Linking only on a provider-verified matching email; X never links.
- Closed registration covers every provider.
- Secrets encrypted (enc:v1) and masked in API responses.
- Sign-in UI: Google/Apple/GitHub + "More ways to sign in".

## Working state

- Branched from origin/feat/v3-auth-default (PR #143 open); PR targets main.

## Verification

- type-check, lint, test:unit, check:branding, check:ui-contracts pass.
- Not run: next build, e2e, a real sign-in against each provider.

## Decisions and constraints

- allowDangerousEmailAccountLinking is set only because accountLinkingGate runs
  first in the signIn callback; X keeps NextAuth's never-link default.
- Profiles carry only a provider-verified email; unverified emails are dropped.
- The NextAuth handler is rebuilt every 10 minutes (settings changes, Apple JWT).

## Blockers

- None in code. Each provider needs the owner to register an app.

## Next action

- Owner registers the provider apps (docs/operations/sign-in-providers.md).
- Review and merge after PR #143.
