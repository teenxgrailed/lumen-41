---
id: 20261008-claude-image-deploys
owner: claude
branch: ops/image-deploys
status: active
updated: 2026-10-08T12:00:00Z
objective: Production runs images built in CI; Coolify only pulls and restarts them
---

## Scope

- Governing plan: `~/.claude/plans/modular-coalescing-pascal.md`, stage 1.
- In scope: root `Dockerfile` build args, `.github/workflows/docker-publish.yml`
  (changes / gates / images / deploy jobs, rollback dispatch),
  `scripts/coolify-deploy-image.sh`, worker health server start order,
  switching the three Coolify apps to the Docker Image build pack.
- Out of scope: readiness page (stage 2), remote MCP (stage 3).

## Completed

- `Dockerfile`: release SHA declared per final stage (keeps `npm ci` cached),
  `NEXT_PUBLIC_*` declared in `builder`, Sentry secrets mounted optionally.
  Coolify's `SOURCE_COMMIT` source build still works as a fallback.
- Workflow rewritten; `actionlint` passes (one SC2129 style note).
- Worker listens on its health port before startup work; test added.
- Coolify app JSON backed up to the session scratchpad (`coolify-backup/`).

## Working state

- Dirty: the files above. Nothing in Coolify or GitHub settings changed yet.

## Verification

- Passed: worker and collaboration images build; SHA reaches the image both
  from `NEEDT_BUILD_SHA` and from `SOURCE_COMMIT`; worker unit tests.
- Still required: web image build with public vars inlined; full gates.

## Decisions and constraints

- Owner 2026-10-08: images built in GitHub Actions; Claude changes Coolify
  through its REST API, showing before/after and keeping backups.
- Merge to `main` deploys production; merge only on an explicit owner yes.
- Cutover order: collaboration, worker, web.

## Blockers

- The server needs `docker login ghcr.io` with a `read:packages` token
  (owner, over SSH) unless the GHCR packages are made public.
- GitHub needs `vars.NEXT_PUBLIC_*` and secrets `COOLIFY_API_URL`,
  `COOLIFY_{WEB,WORKER,COLLABORATION}_UUID` before the first image release.

## Next action

- Finish the web image check, run the gates, open the PR.
