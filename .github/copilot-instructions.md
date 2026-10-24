# GitHub Copilot Instructions for Needt

These are repository-wide instructions for GitHub Copilot's coding agent. They are a
condensed mirror of `CLAUDE.md` and `openspec/project.md`; when anything here is
ambiguous or conflicts, **`CLAUDE.md` is the source of truth**. Keep this file in sync
with it.

## Overview

Needt is a multi-user intelligent planner with one source tree, one Next.js
application, and a separate BullMQ worker built from the same production image.

**Tech stack:** Next.js 15 (App Router) - React 19 - TypeScript - Prisma + PostgreSQL -
NextAuth.js (v4) - Zustand - TanStack Query - calendar engine - Tailwind + shadcn/ui
(Radix) - Zod.

## Setup and commands

- **Install with `npm install --legacy-peer-deps`** (React 19 peer-dep conflicts
  otherwise). Node version is pinned in `.nvmrc` (22.x).

```bash
npm run dev          # Dev server (Next.js + Turbopack) on :3000
npm run build        # Production build
npm run type-check   # tsc --noEmit
npm run lint         # next lint (CI requires zero warnings)
npm run test:unit    # Jest unit tests (Node env, src/**/__tests__/**/*.test.ts)
npm run test:e2e     # Playwright e2e (needs a server on TEST_BASE_URL/localhost:3000)
npm run prisma:generate   # Regenerate Prisma client after schema changes
```

Run a single test with `npx jest path/to/file.test.ts` or `npx jest -t "name"`.

**Verification gate for any contribution (must all pass before review):**

1. `npm run type-check` - clean
2. `npm run lint` - **zero warnings** (CI fails on any warning)
3. `npm run test:unit` - green

Do **not** run `npm run format` (it rewrites the whole repo); rely on your editor's
Prettier integration for changed files. Husky's pre-commit hook runs `npm run lint`
and `npm run type-check`; a `lint-staged` config (eslint zero-warnings + prettier +
type-check on staged files) also exists in `package.json`.

## Architecture

- **Local-first calendar sync.** External calendars (Google / Outlook / CalDAV) are
  never read live in the UI; each provider syncs into our DB (`CalendarFeed` +
  `CalendarEvent`) and the app always operates on local data. Provider logic lives in
  `src/lib/{google,outlook,caldav}-*.ts` and `src/lib/token-manager.ts`.
- **Task scheduling engine** (`src/services/scheduling/`): `TaskSchedulingService`
  orchestrates auto-scheduling; `TimeSlotManager` enumerates candidate slots;
  `SlotScorer` ranks them; `CalendarServiceImpl` checks availability.
- **Task sync** (`src/lib/task-sync/`): one-way sync from external task providers using
  selective field sync (external-owned fields overwritten each sync; local-owned fields
  preserved).
- **Scheduled maintenance**: existing handlers live in `src/app/api/cron/`; a separate
  worker is intentionally outside the current build.
- **State**: small focused Zustand stores in `src/store/`; server state via TanStack
  Query; command-palette (cmdk) commands in `src/lib/commands/`.

## Unified build (most important rule)

- Keep one source tree and one production build. Do not introduce edition flags,
  repository-sync gates, or parallel product variants.
- `next.config.js` uses the standard page extensions.
- `src/app/(app)/` is only a structural group for the shared application shell.
- Components, routes, and services use plain `.ts` and `.tsx` filenames.

## Code-style conventions

- **Prisma client**: import the singleton `prisma` from `@/lib/prisma`; never
  `new PrismaClient()`. Import Prisma _types_ from `@prisma/client`.
- **Dates**: use the helpers in `@/lib/date-utils` for all date work (including
  `new Date()`); don't reach for `date-fns` / `date-fns-tz` directly.
- **Calendar DB access**: go through `@/lib/calendar-db.ts`.
- **Logging**: use `logger` from `@/lib/logger`, never `console.log`. Define a
  `LOG_SOURCE` string per file and pass it last:
  `logger.error("msg", { error }, LOG_SOURCE)`.
- **API route handlers** (Next 15): `params` is a Promise -
  `const { id } = await params;`.
- **Admin-only**: API routes use `requireAdmin` from `@/lib/auth/api-auth`; UI uses the
  `useAdmin` hook or the `<AdminOnly>` wrapper with `<AccessDeniedMessage>`.
- **shadcn/ui**: add components with `npx shadcn@latest add`; icons via `react-icons`.
- **JSX text**: escape quotes/apostrophes as `&apos;` / `&quot;`.
- **No em dashes** in copy; use hyphens, commas, or rephrase.
- Keep changes minimal and scoped; don't refactor unrelated code. Don't remove `//todo`
  comments; add them for deferred work.
- **Add a `changelog.d/<short-slug>.md` fragment** for any user-facing change. Never edit `CHANGELOG.md` directly in a PR (CI fails it); it is compiled at release time.

## Where things live

- `src/services/scheduling/` - task auto-scheduling engine
- `src/lib/` - providers, auth, date utils, config, commands, task-sync, db helpers
- `src/store/` - Zustand stores
- `src/components/` - feature-foldered UI (calendar, tasks, settings, auth, ...)
- `src/app/api/` - route handlers
- `prisma/schema.prisma` - Postgres schema
- `src/app/(app)/` - application pages using the shared navigation and provider shell
- `openspec/` - OpenSpec proposals and specs for non-trivial changes
