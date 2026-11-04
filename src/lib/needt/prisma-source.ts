/* THE PRISMA SOURCE — server-only. See the seam at the bottom of
 * `adapter.ts`: nothing in `src/components/**` may import this module, and it
 * must keep the two rules that comment states — a capability with no honest
 * value returns `null` (not `[]`, not `0`), and nothing here is derived on
 * the way out. The chain, the streak, `blocking()` all stay pure functions in
 * `derive.ts` that run on whatever list a caller holds; this file only reads.
 *
 * This module is server-only by convention rather than by an enforced
 * `server-only` import (the package isn't a project dependency): it imports
 * `@/lib/prisma`, which talks to Postgres, so nothing under
 * `src/components/**` may import this file — only a route handler or another
 * server-only module should.
 */
import { listPages } from "@/services/pages/page-service";
import { PageAccessRole } from "@prisma/client";

import { pageRoleAtLeast } from "@/lib/auth/page-auth";
import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { toWorkspaceBusyEvent } from "@/lib/calendar-privacy";
import {
  addCalendarDays,
  newDate,
  startOfDay,
  toLocalDateKey,
} from "@/lib/date-utils";
import {
  habitDateFromKey,
  habitDateKey,
  habitDayWindow,
  normalizeUserTimeZone,
} from "@/lib/habit-completion-date";
import { prisma } from "@/lib/prisma";

import type { NeedtDataSource } from "./adapter";
import {
  type CalendarEventViewRow,
  toCalendarEventEntries,
  toCalendarTaskEntries,
} from "./calendar-view";
import { taskNeedtInclude, toNeedtTask } from "./task-view";
import type {
  NeedtCalendarEntry,
  NeedtCalendarMap,
  NeedtDayMark,
  NeedtDocument,
  NeedtDocumentFilters,
  NeedtHabit,
  NeedtPerson,
  NeedtProject,
  NeedtStage,
  NeedtTask,
} from "./types";

/* Projects and people the fixture ships with a hue and a glyph/initials
   authored by hand; a real row can have `color`/`icon`/`hue`/`initials` still
   unset. The contract requires both, so an unset one falls back to a neutral
   placeholder here. This is NOT the "no fallback" rule from derive.ts's
   `project()` — that rule is about never inventing WHICH project a task
   belongs to. This is about a real, known project simply not having picked a
   colour yet. */
const FALLBACK_HUE = "var(--muted-foreground)";
const FALLBACK_GLYPH = "circle";

function documentMeta(updatedAt: Date, now: Date) {
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - updatedAt.getTime()) / 60_000)
  );
  if (minutes < 2) return "Edited just now";
  if (minutes < 60) return `Edited ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Edited ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Edited ${days} day${days === 1 ? "" : "s"} ago`;
  return `Edited ${updatedAt.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: updatedAt.getFullYear() === now.getFullYear() ? undefined : "numeric",
  })}`;
}

async function getDocuments(
  userId: string,
  workspace: WorkspaceAccess,
  filters: NeedtDocumentFilters | undefined,
  now: Date
): Promise<readonly NeedtDocument[]> {
  const rows = await listPages(
    { userId, workspace },
    {
      search: filters?.search,
      folderId: filters?.collectionId,
      tagIds: filters?.tagIds ? [...filters.tagIds] : undefined,
      favorites: filters?.favorites,
      privateOnly: filters?.privateOnly,
    }
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title || "Untitled",
    icon: row.icon,
    meta: documentMeta(row.updatedAt, now),
    collection: row.folder
      ? {
          id: row.folder.id,
          name: row.folder.name,
          hue: row.folder.color,
        }
      : null,
    tags: row.tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      hue: tag.color,
    })),
    lines: Math.max(4, Math.min(9, Math.ceil(row.title.length / 12) + 3)),
    pinned: row.isFavorite,
    isPrivate: row.isPrivate,
    isDatabase: Boolean(row.database),
    canEdit: pageRoleAtLeast(row.accessRole, PageAccessRole.EDITOR),
    canTrash: pageRoleAtLeast(row.accessRole, PageAccessRole.FULL_ACCESS),
  }));
}

/** The last fourteen days, oldest first, ending on `startOfDay(now)`. */
function fourteenDayWindow(now: Date): readonly Date[] {
  const end = startOfDay(now);
  return Array.from({ length: 14 }, (_, i) => addCalendarDays(end, i - 13));
}

/** A fourteen-day mark array: 1 for each window day present in `onDates`. */
function markWindow(
  window: readonly Date[],
  onDates: Iterable<Date>
): readonly NeedtDayMark[] {
  const marked = new Set<string>();
  for (const date of onDates) marked.add(toLocalDateKey(date));
  return window.map(
    (day): NeedtDayMark => (marked.has(toLocalDateKey(day)) ? 1 : 0)
  );
}

function initialsOf(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const second = words.length > 1 ? (words[1][0] ?? "") : "";
  return (first + second).toUpperCase();
}

/** Four global stages, the same for every project — see `TaskStage` in
 * `schema.prisma` and the header of `types.ts`. Not a query: this list is
 * fixed by the enum, not by any table. */
const GLOBAL_STAGES: readonly NeedtStage[] = Object.freeze([
  { id: "todo", name: "To do" },
  { id: "doing", name: "In progress" },
  { id: "review", name: "In review" },
  { id: "done", name: "Done" },
]);

async function getTasks(
  userId: string,
  workspace: WorkspaceAccess,
  now: Date
): Promise<readonly NeedtTask[]> {
  const scope = workspaceDataScopeWhere(workspace, userId);
  const [rows, settings] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...scope,
        isArchived: false,
      },
      include: taskNeedtInclude,
      orderBy: { createdAt: "desc" },
    }),
    prisma.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    }),
  ]);
  const timeZone = normalizeUserTimeZone(settings?.timeZone);
  const visibleIds = new Set(rows.map((row) => row.id));
  return rows.map((row) => {
    const task = toNeedtTask(row, now, timeZone);
    return task.blockedBy && !visibleIds.has(task.blockedBy)
      ? { ...task, blockedBy: undefined }
      : task;
  });
}

async function getProjects(
  userId: string,
  workspace: WorkspaceAccess
): Promise<readonly NeedtProject[]> {
  const rows = await prisma.project.findMany({
    where: {
      ...workspaceDataScopeWhere(workspace, userId),
      status: "active",
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(
    (row): NeedtProject => ({
      id: row.id,
      name: row.name,
      hue: row.color ?? FALLBACK_HUE,
      glyph: row.icon ?? FALLBACK_GLYPH,
    })
  );
}

async function getPeople(
  userId: string,
  workspace: WorkspaceAccess
): Promise<readonly NeedtPerson[]> {
  //todo Owner decision: if task holders/waits may include outside contacts,
  // extend this registry without weakening workspace membership authorization.
  if (workspace.dataScope.mode === "workspace") {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: workspace.dataScope.workspaceId },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            initials: true,
            hue: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    return members.map(
      ({ user }): NeedtPerson => ({
        id: user.id,
        name: user.name ?? user.email ?? "Unknown",
        initials: user.initials ?? initialsOf(user.name),
        hue: user.hue ?? FALLBACK_HUE,
      })
    );
  }

  const scope = workspaceDataScopeWhere(workspace, userId);
  const [assignees, waitedOn] = await Promise.all([
    prisma.task.findMany({
      where: { ...scope, assigneeId: { not: null } },
      select: { assigneeId: true },
      distinct: ["assigneeId"],
    }),
    prisma.taskWait.findMany({
      where: { resolvedAt: null, task: scope },
      select: { waitingOnUserId: true },
      distinct: ["waitingOnUserId"],
    }),
  ]);

  const ids = new Set<string>([userId]);
  for (const { assigneeId } of assignees) if (assigneeId) ids.add(assigneeId);
  for (const { waitingOnUserId } of waitedOn) ids.add(waitingOnUserId);

  const users = await prisma.user.findMany({ where: { id: { in: [...ids] } } });
  return users.map(
    (user): NeedtPerson => ({
      id: user.id,
      name: user.name ?? user.email ?? "Unknown",
      initials: user.initials ?? initialsOf(user.name),
      hue: user.hue ?? FALLBACK_HUE,
    })
  );
}

async function getHabits(
  userId: string,
  workspace: WorkspaceAccess,
  now: Date
): Promise<readonly NeedtHabit[]> {
  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { timeZone: true },
  });
  const window = habitDayWindow(now, settings?.timeZone);
  const rows = await prisma.habit.findMany({
    where: {
      ...workspaceDataScopeWhere(workspace, userId),
      userId,
      kind: "BUILD",
      archivedAt: null,
      isActive: true,
    },
    include: {
      project: { select: { name: true } },
      completions: { where: { date: { gte: habitDateFromKey(window[0]) } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(
    (row): NeedtHabit => ({
      id: row.id,
      title: row.title,
      at: row.at,
      project: row.project?.name ?? null,
      quota: row.quota,
      done: window.map(
        (day): NeedtDayMark =>
          row.completions.some(
            (completion) => habitDateKey(completion.date) === day
          )
            ? 1
            : 0
      ),
    })
  );
}

async function getClosedDays(
  userId: string,
  now: Date
): Promise<readonly NeedtDayMark[]> {
  const window = fourteenDayWindow(now);
  const rows = await prisma.closedDay.findMany({
    where: { userId, date: { gte: window[0] } },
  });
  return markWindow(
    window,
    rows.map((row) => row.date)
  );
}

async function getCalendars(userId: string): Promise<NeedtCalendarMap> {
  const feeds = await prisma.calendarFeed.findMany({
    where: { userId, enabled: true },
  });
  const map: Record<string, { name: string; color: string }> = {};
  for (const feed of feeds) {
    map[feed.id] = { name: feed.name, color: feed.color ?? FALLBACK_HUE };
  }
  return map;
}

async function getCalendarEntries(
  userId: string,
  workspace: WorkspaceAccess,
  rangeStart: Date,
  rangeEnd: Date,
  now: Date
): Promise<readonly NeedtCalendarEntry[]> {
  const scope = workspaceDataScopeWhere(workspace, userId);
  const otherMemberIds =
    workspace.enabled && workspace.workspaceKind === "SHARED"
      ? (
          await prisma.workspaceMember.findMany({
            where: {
              workspaceId: workspace.workspaceId,
              userId: { not: userId },
            },
            select: { userId: true },
          })
        ).map((member) => member.userId)
      : [];

  const [tasks, ownEvents, busyEvents, settings] = await Promise.all([
    prisma.task.findMany({
      where: { ...scope, isArchived: false },
      include: taskNeedtInclude,
      orderBy: { createdAt: "desc" },
    }),
    prisma.calendarEvent.findMany({
      where: {
        archivedAt: null,
        feed: { userId, enabled: true },
        OR: [
          { description: null },
          { NOT: { description: { startsWith: "[NEEDT_DAY_BLOCK]" } } },
        ],
        AND: [
          {
            OR: [
              { start: { lte: rangeEnd }, end: { gte: rangeStart } },
              { isMaster: true, recurrenceRule: { not: null } },
            ],
          },
        ],
      },
      include: { feed: { select: { name: true, color: true } } },
    }),
    otherMemberIds.length
      ? prisma.calendarEvent.findMany({
          where: {
            archivedAt: null,
            feed: { userId: { in: otherMemberIds }, enabled: true },
            start: { lte: rangeEnd },
            end: { gte: rangeStart },
            OR: [
              { description: null },
              { NOT: { description: { startsWith: "[NEEDT_DAY_BLOCK]" } } },
            ],
          },
          select: { id: true, start: true, end: true, allDay: true },
        })
      : Promise.resolve([]),
    prisma.userSettings.findUnique({
      where: { userId },
      select: { timeZone: true },
    }),
  ]);

  const timeZone = normalizeUserTimeZone(settings?.timeZone);
  const taskEntries = tasks.flatMap((row) =>
    toCalendarTaskEntries(row, now, timeZone)
  );
  const visibleIds = new Set(tasks.map((row) => row.id));
  for (const entry of taskEntries) {
    if (entry.blockedBy && !visibleIds.has(entry.blockedBy)) {
      entry.blockedBy = undefined;
    }
  }

  const eventRows: CalendarEventViewRow[] = [
    ...ownEvents,
    ...busyEvents.map(toWorkspaceBusyEvent),
  ];
  return [
    ...taskEntries,
    ...toCalendarEventEntries(eventRows, rangeStart, rangeEnd, timeZone),
  ];
}

/**
 * The database-backed `NeedtDataSource`, scoped by a server-authorized
 * workspace access object. A request-supplied workspace id is never enough:
 * callers must resolve membership before constructing the source.
 *
 * `now` defaults to the real clock; a caller can pin it (tests, and any
 * screen that wants every read in one render judged against the same
 * instant).
 */
export function prismaDataSource(
  userId: string,
  workspace: WorkspaceAccess,
  now: () => Date = newDate
): NeedtDataSource {
  return {
    getTasks: () => getTasks(userId, workspace, now()),
    getProjects: () => getProjects(userId, workspace),
    getPeople: () => getPeople(userId, workspace),
    getHabits: () => getHabits(userId, workspace, now()),
    getStages: async () => GLOBAL_STAGES,
    getCalendars: () => getCalendars(userId),
    getCalendarEntries: (start, end) =>
      getCalendarEntries(userId, workspace, start, end, now()),
    getClosedDays: () => getClosedDays(userId, now()),
    getDocuments: (filters) => getDocuments(userId, workspace, filters, now()),
  };
}

/** Exported for tests that want to check the window math without a database. */
export const __internal = { fourteenDayWindow, markWindow, initialsOf };
