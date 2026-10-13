# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Needt is a multi-user intelligent planner product built from the FluidCalendar
fork. It has one unified Next.js application plus a BullMQ worker built from
the same image and SHA.

What is left, and in what order: `docs/plans/00-roadmap.md` (2026-09-15).

## What Needt is for

Needt is not an AI calendar. The calendar and the scheduling engine are the
first surface, not the product. Needt is the place a person keeps everything
they are working on and thinking about, and connects everything else to: their
calendars, tasks, documents, mail, boards, habits, focus time, and whatever
tool they already use. The scheduling engine is one thing that reads that
store; it is not what the store exists for.

Two consequences shape every decision:

- **Breadth of use is the goal, not a side effect.** People should be able to
  run genuinely different parts of their life and work in Needt, not just one
  workflow we designed for. Prefer a general mechanism a person can aim at
  their own problem over a narrow feature that solves exactly one.
- **The data must be reachable from outside.** Anything a person puts into
  Needt should be readable and writable through our own API, so they can wire
  Needt to other tools and build on top of it. A feature that only works
  inside our UI is unfinished.

When a change would make the product narrower — tied to one workflow, one
provider, or reachable only through our own screens — say so and offer the
general form instead. When scope is genuinely ambiguous, the planner reading
is the safe default, but do not assume the planner is the whole product.

## Commands

```bash
npm run agent:context     # Recover branch, worktree, and active handoff state
npm run dev               # Dev server (Next.js + Turbopack) on :3000
npm run build             # Production build
npm run type-check        # tsc --noEmit
npm run lint              # eslint . --max-warnings=0
npm run format            # prettier --write

npm run test:unit         # Jest unit tests (Node env, src/**/__tests__/**/*.test.ts)
npm run test:e2e          # Playwright e2e (tests/, needs server on TEST_BASE_URL/localhost:3000)
npx jest path/to/file.test.ts          # Run a single Jest test file
npx jest -t "test name substring"      # Run tests matching a name

npm run prisma:generate   # Regenerate Prisma client after schema changes
npm run prisma:studio     # Browse the DB
npm run db:up             # Start the Postgres container (docker compose)

```

## Shared sessions

At the start of every session, run `npm run agent:context`, then read the active
handoff for the current branch. For work that continues beyond a short
read-only investigation, follow `docs/AI-COLLABORATION.md` and maintain a
per-workstream file under `.agents/handoffs/`. Never let two writers share one
worktree, and never stage or alter unfamiliar dirty files.

- **npm is the only package manager.** Install with
  `npm install --legacy-peer-deps`; Docker/CI use `npm ci` and `.npmrc`.
- Node version is pinned in `.nvmrc` (22.x).
- Husky pre-commit runs `lint-staged`: eslint (zero warnings) + prettier + `type-check` on staged files.

## Tech Stack

Next.js 15 (App Router) · React 19 · TypeScript · Prisma + PostgreSQL · NextAuth.js (v4) · Zustand · TanStack Query · Tailwind + shadcn/ui (Radix) · Zod.

## Architecture

**Local-first calendar sync.** External calendars (Google / Outlook / CalDAV) are never read live in the UI. Each provider syncs into our own DB (`CalendarFeed` + `CalendarEvent`), and the app always operates on local data. OAuth token refresh is handled centrally so expired tokens are renewed transparently and syncing continues. Provider logic lives in `src/lib/{google,outlook,caldav}-*.ts` and `src/lib/token-manager.ts`.

**Task scheduling engine** (`src/services/scheduling/`): `TaskSchedulingService` orchestrates auto-scheduling; `TimeSlotManager` enumerates candidate slots from work hours / buffers; `SlotScorer` ranks them; `CalendarServiceImpl` checks calendar availability. Tasks marked `isAutoScheduled` get `scheduledStart/End` and a `scheduleScore`.

**Task sync** (`src/lib/task-sync/`): one-way sync from external task providers (Outlook, Google Tasks) into FluidCalendar using **selective field sync** - external-owned fields (title, status, due date, recurrence) are overwritten on each sync; local-owned fields (start date, duration, priority, energy level) are preserved. See `src/lib/task-sync/README.md`.

**Background work** uses the BullMQ worker in `src/worker/` for provider
calendar sync, deterministic rescheduling, reminders, proactive nudges,
diagnostics, and webhook renewal. The existing `src/app/api/cron/` handlers
remain periodic safety nets.

**Release safety:** `next build` deliberately does not type-check or lint.
Every scoped change must run the independent gates listed in `docs/STACK.md`.
Schema changes use additive expand/contract migrations. Feature flags are
server-controlled through `src/lib/feature-flags.ts`.

**State**: Zustand stores in `src/store/` (small, focused, one concern each - `calendar.ts`, `task.ts`, `settings.ts`, etc.). Server state via TanStack Query. Command palette (cmdk) commands live in `src/lib/commands/`.

## Unified build (critical)

- Needt ships as one product from one source tree. Do not add edition flags, parallel component variants, or repository-sync gates.
- `next.config.js` uses the standard `ts`, `tsx`, `js`, and `jsx` page extensions.
- `src/app/(app)/` is a structural route group for the authenticated application shell; route groups must not select product editions.
- Keep shared components and routes in plain `.ts` and `.tsx` files. New functionality belongs in the unified build unless an explicit product requirement says otherwise.

## Conventions

- **Prisma client**: import the singleton `prisma` from `@/lib/prisma`. Never `new PrismaClient()`. Import Prisma _types_ from `@prisma/client`.
- **Dates**: use helpers in `@/lib/date-utils.ts` for all date work, including `new Date()` - don't reach for `date-fns`/`date-fns-tz` directly.
- **Calendar DB access**: go through `@/lib/calendar-db.ts`.
- **Logging**: use the `logger` from `@/lib/logger`, never `console.log`. Define a `LOG_SOURCE` string per file and pass it as the last arg: `logger.error("msg", { error }, LOG_SOURCE)`.
- **API route handlers** (Next 15): `params` is a Promise - `async function GET(req, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; }`.
- **Admin-only**: API routes use `requireAdmin` middleware from `@/lib/auth/api-auth` (do not call `getServerSession` and check role by hand); UI uses the `useAdmin` hook or `<AdminOnly>` wrapper with `<AccessDeniedMessage>`.
- **shadcn/ui**: add components with `npx shadcn@latest add`. Icons via `react-icons`.
- **Design authority (2026-09-11), in this order**: `docs/handoff/PORT.md` first — it is the newest brief and the only one that records _why_ each decision beat the obvious alternative, so read it before touching any design work; then `Content height and label fixes/needt-app/HANDOFF.md` in the downloaded bundle for per-subsystem detail; then the bound design system under `Content height and label fixes/_ds/`. Where the two briefs disagree, `docs/handoff/design-reconciliation-2026-09-11.md` holds the rulings, and where either disagrees with the vendored CSS the CSS wins, because it is the shipped artefact. `/DESIGN.md` and everything in `design-refs/` are superseded and carry a banner saying so; read them for history, never for a value.
- **Design work flows one way per artefact**: screens move from Claude Design into `src/`, tokens move back up to the design-system project. A shipped screen is edited in code, never re-exported. See `docs/handoff/design-workflow.md`.
- **Do not re-derive a design decision from its result.** PORT.md §0 and §6 may not be changed without asking the owner. Five alternatives that look like improvements and are not: a damped spring for the agent cursor (it oscillates, people do not sway), a toast instead of the growing island (a second object arriving is what makes toasts ignorable; the owner's 2026-10-14 override moves only the transient action/Undo/status notices to a compact inverted pill at the bottom centre, `ActionToasts`, while the AI-nudge island in the Ask Needt corner stays as it is), a sheet under a whole screen (then every object on it is a card on a card), a count above rows that are already visible (a tally of what you can see is noise), and a `ResizeObserver` per card (it fires through entry staggers and re-measures everything).
- **Four rules outrank everything**: every grey is one text colour at a ladder alpha; the chrome type scale is 13px and 12px with no 14px; the accent is never a solid fill on a button or surface, only on a mark; one form-row geometry, and a label that does not fit gets shortened rather than the column widened.
- **Brand marks**: the owner has cleared using third-party brand logos/marks in the product (Connections, calendars, sign-in providers); use the real marks, not letter tiles. (2026-10-12)
- **Notifications**: product code calls the typed `notify` facade in `src/lib/notifications.ts`; only the facade and shared Toaster import Sonner. Default `surface` is `toast` (bottom-centre pill); pass `surface: "island"` only for Needt speaking on its own initiative.
- **AI companion**: position math belongs in `src/lib/assistant-position.ts`; persist normalized coordinates and mark fixed controls that it must avoid with `data-assistant-avoid`.
- **JSX text**: escape quotes/apostrophes as `&apos;` / `&quot;`.
- Keep changes minimal and scoped; don't refactor unrelated code. Don't remove `//todo` comments; add them for deferred work.
- Update `CHANGELOG.md` under `[unreleased]` as you make user-facing changes.

## Layout reference

- `src/services/scheduling/` - task auto-scheduling engine
- `src/lib/` - providers, auth, date utils, config, commands, task-sync, db helpers
- `src/store/` - Zustand stores
- `src/components/` - feature-foldered UI (calendar, tasks, settings, auth, ...)
- `src/app/api/` - route handlers
- `prisma/schema.prisma` - Postgres schema for auth, workspaces, calendar,
  tasks, Pages, collaboration, AI, settings, jobs, waitlist and subscriptions
- `src/app/(app)/` - application pages using the shared navigation and provider shell

<!-- mulch:start -->

## Project Expertise (Mulch)

<!-- mulch-onboard-v:1 -->

This project uses [Mulch](https://github.com/jayminwest/mulch) for structured expertise management.

**When the `mulch` CLI is installed and the repository has configured
domains**, run:

```bash
mulch prime
```

This injects project-specific conventions, patterns, decisions, and other learnings into your context.
Use `mulch prime --files src/foo.ts` to load only records relevant to specific files.

Before completing your task, review your work for insights worth preserving — conventions discovered,
patterns applied, failures encountered, or decisions made — and record them:

```bash
mulch record <domain> --type <convention|pattern|failure|decision|reference|guide> --description "..."
```

Link evidence when available: `--evidence-commit <sha>`, `--evidence-bead <id>`

Run `mulch status` to check domain health and entry counts.
Run `mulch --help` for full usage.
Mulch write commands use file locking and atomic writes — multiple agents can safely record to the same domain concurrently.

### Before You Finish

1. Discover what to record:
   ```bash
   mulch learn
   ```
2. Store insights from this work session:
   ```bash
   mulch record <domain> --type <convention|pattern|failure|decision|reference|guide> --description "..."
   ```
3. Validate and commit:
   ```bash
   mulch sync
   ```
   <!-- mulch:end -->
