# Deploy Needt with Coolify

Needt production runs on the existing VPS through Coolify. Coolify-managed
PostgreSQL stores application data, Coolify-managed Redis backs realtime updates
and BullMQ, and the same repository/Dockerfile is deployed as web, worker, and
Page collaboration services. Coolify is the production source of truth for v0.1;
Vercel is not part of the release path.

## 1. Create the data services

1. Create a PostgreSQL resource in the Coolify production environment.
2. Create a Redis resource in the same environment.
3. Set the PostgreSQL internal URL as `DATABASE_URL` and `DIRECT_URL` for all
   three services.
4. Set the Redis internal URL as `REDIS_URL` for all three services.

`DATABASE_URL` is used by the app at runtime. `DIRECT_URL` is used by Prisma
migrations and may point to the same internal PostgreSQL endpoint.

## 2. Create the Coolify services

Coolify **Auto deploy is intentionally disabled**. Do not re-enable it while
the VPS still performs source builds; three concurrent cold builds exhaust the
host. Keep it disabled until CI publishes and Coolify deploys a verified GHCR
image without rebuilding on the VPS.

1. Connect the GitHub repository and deploy `main` with the root `Dockerfile`.
   Use its `production` stage for the web service.
2. Keep the image default command for web startup.
3. Create a second service from the same image and environment, with this
   command:

```bash
node dist/worker/index.js
```

4. Create a third service from the same image and environment for Page
   collaboration:

```bash
node dist/collaboration/index.mjs
```

Set `COLLABORATION_HOST=0.0.0.0`, expose port `1234` through a TLS-enabled
WebSocket domain, and set that public `wss://` URL on the web service as
`COLLABORATION_PUBLIC_URL`.

5. Do not expose the worker publicly. Deploy web first; wait for `/api/health`
   to report the expected 40-character commit and a healthy database; only then
   deploy worker and collaboration. Never start all three builds together. The
   worker records a private Redis heartbeat; web reports it as `workerBuildSha`,
   and the release gate accepts only matching web, worker, and collaboration
   identities.
6. The web entrypoint applies lockfile-pinned Prisma migrations before starting
   Next.js. A failed migration must fail the deployment instead of starting a
   mismatched application. Worker and collaboration processes skip migrations.

## 3. Environment Variables

Set these runtime values on the three Coolify services unless a row says
otherwise. Use the same value for every service that receives a given secret;
rotating one independently breaks token verification or telemetry correlation.

### Base runtime configuration (all services)

```bash
DATABASE_URL="postgresql://postgres:...@postgres-resource:5432/postgres"
DIRECT_URL="postgresql://postgres:...@postgres-resource:5432/postgres"
REDIS_URL="redis://default:password@redis:6379"
NEXTAUTH_SECRET="random-32-plus-character-secret"
COLLABORATION_SECRET="separate-random-32-plus-character-secret"
RATE_LIMIT_HASH_SECRET="separate-random-32-plus-character-secret"
SENTRY_DSN="https://examplePublicKey@o0.ingest.sentry.io/0"
SENTRY_ENVIRONMENT="production"
```

`RATE_LIMIT_HASH_SECRET` is mandatory in production. It is a separate secret
used only to HMAC rate-limit identifiers before Redis sees them. `SENTRY_DSN`
and `SENTRY_ENVIRONMENT` configure server, edge, worker, and collaboration
telemetry at runtime.

### Web-service runtime configuration

```bash
NEXTAUTH_URL="https://use.needt.app"
NEXT_PUBLIC_APP_URL="https://use.needt.app"
NEXT_PUBLIC_SITE_URL="https://use.needt.app"
CRON_SECRET="random-cron-secret"
COLLABORATION_PUBLIC_URL="wss://collaboration.use.needt.app"
WEBHOOK_BASE_URL="https://use.needt.app"
```

`CRON_SECRET` protects the web cron endpoints. Keep `NEXTAUTH_URL`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, and `WEBHOOK_BASE_URL` on the
same public HTTPS origin.

### Collaboration-service runtime configuration

```bash
COLLABORATION_HOST="0.0.0.0"
COLLABORATION_PORT="1234"
```

### Browser Sentry build-time configuration (public, not a Coolify secret)

```bash
NEXT_PUBLIC_SENTRY_DSN="https://examplePublicKey@o0.ingest.sentry.io/0"
NEXT_PUBLIC_SENTRY_ENVIRONMENT="production"
```

Next.js inlines `NEXT_PUBLIC_*` values when the image is built. The current
`docker-publish` workflow provides only the non-secret `NEEDT_BUILD_SHA`, so
setting these two values only in Coolify after publishing an image does not
enable browser telemetry. Provision a reviewed follow-up CI build path for the
two public values before requiring browser Sentry; do not substitute a secret
or a Sentry auth token as a Docker build argument.

### Build-only values (not Coolify runtime environment)

- `NEEDT_BUILD_SHA` is supplied by CI as the sole production Docker build
  argument and is baked into the image for `/api/health` and Sentry release
  identity. It must be the exact 40-character Git commit SHA; `local` is
  rejected in production. The owner does not set it manually.
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are required only by
  CI while uploading source maps. They are Repository secrets passed to the
  production Docker build as BuildKit secret mounts, never runtime variables,
  Docker build arguments, or image `ENV` values. The publish job rejects an
  empty value before the Docker build; ordinary CI gates build without them and
  therefore do not upload source maps.

### Optional product integrations

Calendar OAuth:

```bash
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
AZURE_AD_CLIENT_ID=""
AZURE_AD_CLIENT_SECRET=""
AZURE_AD_TENANT_ID="common"
# Sign-in providers (docs/operations/sign-in-providers.md). System Settings
# values win over these. A provider shows on sign-in only when fully set.
APPLE_CLIENT_ID=""
APPLE_TEAM_ID=""
APPLE_KEY_ID=""
APPLE_PRIVATE_KEY=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
DISCORD_CLIENT_ID=""
DISCORD_CLIENT_SECRET=""
TWITTER_CLIENT_ID=""
TWITTER_CLIENT_SECRET=""
LINKEDIN_CLIENT_ID=""
LINKEDIN_CLIENT_SECRET=""
OPENAI_SIWC_CLIENT_ID=""
OPENAI_SIWC_CLIENT_SECRET=""
```

Optional AI:

```bash
ANTHROPIC_API_KEY=""
OPENAI_API_KEY=""
AI_CUSTOM_URL=""
AI_ENCRYPTION_KEY=""
```

### Web Push (required for push delivery; web and worker)

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:you@example.com"
```

`VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are required for push delivery. The
already deployed `NEXT_PUBLIC_VAPID_PUBLIC_KEY` must belong to the same key pair
as `VAPID_PRIVATE_KEY`. Supply the same trio to web and worker so subscriptions
and reminder delivery use one VAPID identity. The private key and subject stay
runtime-only.

Apple/iCloud CalDAV credentials are entered in the app at runtime and never stored in env.

## 4. Domain

1. Add `use.needt.app` to the Coolify web service. The separate marketing
   deployment owns `needt.app`.
2. Point DNS to the VPS/Coolify proxy target.
3. Add the collaboration WebSocket domain to the collaboration service and
   confirm Coolify provisions TLS. The worker has no public domain.

Set `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, and
`WEBHOOK_BASE_URL` to the exact public HTTPS origin.

## 5. OAuth Redirect URIs

Register exact production redirect URIs:

Google:

```text
https://use.needt.app/api/auth/callback/google
https://use.needt.app/api/calendar/google
```

Microsoft/Azure:

```text
https://use.needt.app/api/auth/callback/azure-ad
https://use.needt.app/api/calendar/outlook
```

Keep local redirect URIs for development if needed.

## 6. Scheduled recovery jobs

Provider webhooks and the BullMQ worker handle realtime updates. Keep two Coolify
scheduled tasks as recovery paths:

- `/api/cron/sync-calendars` every 15 minutes.
- `/api/cron/reschedule` every 30 minutes.

Manual test:

```bash
curl -H "x-cron-secret: $CRON_SECRET" https://use.needt.app/api/cron/reschedule
curl -H "x-cron-secret: $CRON_SECRET" https://use.needt.app/api/cron/sync-calendars
```

The calendar cron remains a CalDAV safety net. Google and Outlook changes use verified provider webhooks plus the separate BullMQ worker documented in [realtime-sync.md](./realtime-sync.md); manual provider sync routes remain available.

## 7. Health Check

```bash
curl https://use.needt.app/api/health
```

Expected result:

```json
{
  "ok": true,
  "db": "ok",
  "buildSha": "<40-hex-sha>",
  "workerBuildSha": "<40-hex-sha>"
}
```

The production image bakes the non-secret Git commit into
`NEEDT_BUILD_SHA`. The worker is not public: after it starts, it writes a
short-lived Redis heartbeat keyed by its SHA, and web exposes that value as
`workerBuildSha`. The GitHub deploy job needs only the public web and
collaboration health URLs, then accepts a release only when `buildSha`,
`workerBuildSha`, and the collaboration SHA are the same 40-character commit.

## 8. Notes

- The app is multi-user. Every user-owned query, worker job, scheduling run,
  reminder, booking page, and entitlement decision must be scoped by `userId`.
- Prisma is configured with `directUrl`; production uses the standard PostgreSQL
  client path against the Coolify internal database endpoint.
- Neon adapter support remains available for development or a future database
  move, but it is not part of the current production topology.
- A push to `main` must not trigger a Coolify source build. With Auto deploy
  disabled, the owner starts each approved deployment in the sequence above.
  Verify web, worker, and collaboration run the same SHA before a release smoke.
- The GitHub workflow fails when any of the three deployment hooks or either
  public health URL (web and collaboration) is missing. It records the prior
  healthy web SHA, verifies the new SHA through web plus its private worker
  heartbeat and collaboration, and writes manual Coolify rollback instructions
  if deployment fails; it has no rollback hook and never auto-rolls back.
