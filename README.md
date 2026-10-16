# Needt

Needt: AI Planner, Tasks, Docs. It combines tasks,
calendars, documents, mail, and focus sessions in one calm workspace. Its deterministic scheduler respects work
hours, deadlines, dependencies, energy, and locked calendar blocks. Optional AI
can help parse tasks or propose changes without becoming a hidden source of
truth.

## What is included

- Day, week, month, and year calendar views
- Today documents with live task references
- Pages powered by Tiptap
- Focus timer, streaks, summaries, and advanced modes
- Google, Outlook, and Apple/iCloud calendar connections
- Deterministic scheduling with optional AI assistance
- Booking pages, reminders, web push, and email fallback
- Personal connector API and MCP server
- Next.js web app and BullMQ worker from the same Docker image

## Local development

Requirements: Node.js 22, npm, PostgreSQL 16, and Redis 7.

```bash
cp .env.example .env.local
npm install --legacy-peer-deps
docker compose up -d db redis
npx prisma migrate deploy
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The project uses npm only. `package-lock.json` is the dependency source of truth;
Docker and CI install with `npm ci`.

### Quick Start with Docker

Copy `.env.example` to `.env`, set `NEXTAUTH_SECRET`, then run:

```bash
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000).

Compose starts web, the private BullMQ worker, collaboration, PostgreSQL, and
Redis. Web applies migrations before the worker and collaboration start; the
worker does not publish a port. The local collaboration URL is
`ws://localhost:1234`; use the TLS WebSocket configuration in
[docs/deploy.md](docs/deploy.md) for a real deployment.

**Note on the port:** the container `PORT` is fixed at 3000. A `PORT` value in
`.env` does not change the container listener. To publish another host port,
change the `ports` mapping in `docker-compose.yml` and update `NEXTAUTH_URL` to
that exact public origin and port.

## Quality gates

```bash
npm run type-check
npm run lint
npm run test:unit
npm run test:e2e
npm run test:visual
npm run test:style
npm run build
npm run build:worker
```

## Calendar providers

Configure provider credentials as runtime environment variables. The in-app
Settings → System screen shows the exact callback URLs for the current
deployment.

- Google requires both `/api/calendar/google` and
  `/api/auth/callback/google` redirect URIs.
- Outlook uses `/api/calendar/outlook`.
- Apple/iCloud uses CalDAV and an app-specific password.

Google domain verification and Microsoft Graph admin consent are deployment
prerequisites for realtime webhooks.

## Google Cloud Setup

Set `NEXTAUTH_URL` to the exact public URL users open. It drives OAuth redirects
and must match the public URL, including scheme and port. Register both redirect
URIs:

- `${NEXTAUTH_URL}/api/calendar/google`
- `${NEXTAUTH_URL}/api/auth/callback/google`

Google rejects private IP and `.local` redirect hosts. Use `localhost` for local
development or a verified HTTPS domain for remote deployments.

Configure the OAuth consent screen with the scopes Needt requests:

- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/userinfo.email`

Google sign-in itself requests only `openid email profile`. Calendar access is
requested later, when the user connects a Google calendar. Google Tasks sync is
temporarily deferred and its scope is not requested.

## AI and connectors

AI is optional. The deterministic scheduler works without a provider. Anthropic,
OpenAI, and a documented custom HTTP provider are supported; stored keys are
encrypted at rest.

Generate a personal connector token in Settings → Connectors. See
[docs/connector-api.md](docs/connector-api.md) and [mcp/README.md](mcp/README.md).

## Deployment

The production image is `ghcr.io/teenxgrails/needt:main`. Web, worker, and
collaboration use the same image and receive secrets only at runtime. Apply
additive Prisma migrations through web before deploying matching worker and
collaboration SHAs.

Operational setup is documented in [docs/STACK.md](docs/STACK.md),
[docs/operations-runbook.md](docs/operations-runbook.md), and
[docs/self-hosting-setup-checklist.md](docs/self-hosting-setup-checklist.md).

## License and attribution

Needt is distributed under the MIT License. It is based on an upstream
open-source calendar project; required attribution is preserved in
[LICENSE](LICENSE) and [NOTICE](NOTICE). The document editor adapts Apache-2.0
licensed ideas and retains its attribution in NOTICE.
