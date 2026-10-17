/* THE NOTIFICATION FEED — read-only, assembled on request from tables that
 * already exist; nothing is copied. Two groups:
 *
 *  - activity: proactive nudges, `Notification` cards, what an agent or MCP
 *    client did (AgentAction), comments and shares on pages the user can open,
 *    calendars that need reconnecting, imports that finished.
 *  - reminders: pending task reminders and tasks that are due soon or overdue.
 *
 * Each source is one indexed query limited to a 30-day window, so a request is
 * a fixed handful of queries however many items there are. Read state lives in
 * `NotificationRead` (one row per item key, plus `*` for "all up to here").
 */
import { TaskReminderKind } from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { addCalendarDays, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "notification-feed";

export const FEED_WINDOW_DAYS = 30;
export const FEED_SOURCE_CAP = 100;
export const FEED_DEFAULT_LIMIT = 30;
export const FEED_MAX_LIMIT = 100;
export const ALL_READ_KEY = "*";
const MAX_KEYS = 200;
const MAX_KEY_LENGTH = 200;

export type FeedGroup = "activity" | "reminders";

export type FeedKind =
  | "nudge"
  | "notification"
  | "agent"
  | "comment"
  | "share"
  | "sync"
  | "import"
  | "reminder"
  | "due";

export interface FeedItem {
  /** Stable id of the item; pass it to the read endpoint. */
  key: string;
  group: FeedGroup;
  kind: FeedKind;
  /** The person behind it, or null when Needt itself did it. */
  actor: string | null;
  title: string;
  body: string | null;
  /** ISO time: when it happened, or for reminders when it fires or is due. */
  at: string;
  /** A same-origin path. */
  link: string;
  unread: boolean;
}

export interface FeedPage {
  items: FeedItem[];
  /** Pass as `before` to get the next page, or null at the end. */
  nextBefore: string | null;
  /** Unread activity in the window (reminders are never unread). */
  unreadCount: number;
}

type Candidate = Omit<FeedItem, "unread"> & { readByOwner?: boolean };

/** A same-origin path, or the fallback: a link from data is never trusted. */
export function safeLink(link: string | null | undefined, fallback = "/today") {
  return link && /^\/(?!\/)/.test(link) ? link : fallback;
}

function clip(text: string | null | undefined, max: number): string | null {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

const OP_PHRASE: Record<string, string> = {
  "task.create": "added a task",
  "task.update": "edited a task",
  "task.complete": "completed a task",
  "task.uncomplete": "reopened a task",
  "task.archive": "archived a task",
  "task.unarchive": "restored a task",
  "task.restore": "restored a task",
  "task.move_to_day": "moved a task to another day",
  "schedule.auto": "rescheduled your tasks",
  "schedule.restore": "put your schedule back",
  "project.create": "created a project",
  "project.archive": "archived a project",
  "project.restore": "restored a project",
  "mail.to_task": "turned a message into a task",
  "habit.log": "logged a habit",
  "habit.unlog": "cleared a habit day",
};

const OP_LINK: Record<string, string> = {
  task: "/tasks",
  schedule: "/calendar",
  project: "/projects",
  mail: "/tasks",
  habit: "/habits",
};

export function opPhrase(op: string): string {
  return OP_PHRASE[op] ?? `ran ${op.replace(/[._]/g, " ")}`;
}

function inputTitle(input: unknown): string | null {
  if (input && typeof input === "object" && "title" in input) {
    const title = (input as { title?: unknown }).title;
    if (typeof title === "string") return clip(title, 120);
  }
  return null;
}

/** Same arithmetic as the reminder worker: anchor time minus the offset. */
export function reminderFiresAt(reminder: {
  kind: TaskReminderKind;
  offsetMinutes: number;
  task: {
    scheduledStart: Date | null;
    deadline: Date | null;
    dueDate: Date | null;
  };
}): Date | null {
  const anchor =
    reminder.kind === TaskReminderKind.BEFORE_START
      ? reminder.task.scheduledStart
      : (reminder.task.deadline ?? reminder.task.dueDate);
  return anchor
    ? newDate(anchor.getTime() - reminder.offsetMinutes * 60_000)
    : null;
}

interface Scope {
  userId: string;
  workspace?: WorkspaceAccess;
}

function workspaceOnly(scope: Scope) {
  return scope.workspace?.dataScope.mode === "workspace"
    ? { workspaceId: scope.workspace.dataScope.workspaceId }
    : {};
}

async function activityCandidates(
  scope: Scope,
  since: Date
): Promise<Candidate[]> {
  const { userId } = scope;
  const pageAccess = {
    trashedAt: null,
    OR: [{ userId }, { accessGrants: { some: { userId } } }],
  };
  const [
    nudges,
    cards,
    actions,
    comments,
    shares,
    boardComments,
    boardShares,
    feeds,
    imports,
  ] = await Promise.all([
    prisma.proactiveNudge.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: FEED_SOURCE_CAP,
    }),
    prisma.notification.findMany({
      where: { userId, dismissedAt: null, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: FEED_SOURCE_CAP,
    }),
    prisma.agentAction.findMany({
      where: {
        userId,
        ...workspaceOnly(scope),
        actor: { in: ["agent", "mcp"] },
        status: "applied",
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: FEED_SOURCE_CAP,
      select: {
        id: true,
        op: true,
        input: true,
        actor: true,
        createdAt: true,
      },
    }),
    prisma.pageComment.findMany({
      where: {
        userId: { not: userId },
        createdAt: { gte: since },
        page: pageAccess,
      },
      orderBy: { createdAt: "desc" },
      take: FEED_SOURCE_CAP,
      select: {
        id: true,
        body: true,
        createdAt: true,
        pageId: true,
        user: { select: { name: true } },
        page: { select: { title: true } },
      },
    }),
    prisma.pageAccessGrant.findMany({
      where: {
        userId,
        grantedById: { not: null },
        createdAt: { gte: since },
        page: { trashedAt: null },
        NOT: { grantedById: userId },
      },
      orderBy: { createdAt: "desc" },
      take: FEED_SOURCE_CAP,
      select: {
        id: true,
        pageId: true,
        createdAt: true,
        grantedBy: { select: { name: true } },
        page: { select: { title: true } },
      },
    }),
    // Comments on a board reference, for the board's owner and for people who
    // commented on the same board before (never your own).
    prisma.moodboardItemComment.findMany({
      where: {
        authorId: { not: userId },
        createdAt: { gte: since },
        item: {
          moodboard: {
            trashedAt: null,
            archivedAt: null,
            AND: [
              {
                OR: [
                  { createdById: userId },
                  { accessGrants: { some: { userId } } },
                ],
              },
              {
                OR: [
                  { createdById: userId },
                  {
                    items: {
                      some: { comments: { some: { authorId: userId } } },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: FEED_SOURCE_CAP,
      select: {
        id: true,
        moodboardId: true,
        body: true,
        createdAt: true,
        author: { select: { name: true } },
        item: { select: { moodboard: { select: { title: true } } } },
      },
    }),
    prisma.moodboardAccessGrant.findMany({
      where: {
        userId,
        grantedById: { not: null },
        createdAt: { gte: since },
        moodboard: { trashedAt: null, archivedAt: null },
        NOT: { grantedById: userId },
      },
      orderBy: { createdAt: "desc" },
      take: FEED_SOURCE_CAP,
      select: {
        id: true,
        moodboardId: true,
        createdAt: true,
        grantedBy: { select: { name: true } },
        moodboard: { select: { title: true } },
      },
    }),
    prisma.calendarFeed.findMany({
      where: { userId, enabled: true, error: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: FEED_SOURCE_CAP,
      select: { id: true, name: true, error: true, updatedAt: true },
    }),
    prisma.importRun.findMany({
      where: {
        userId,
        ...workspaceOnly(scope),
        status: { in: ["done", "failed"] },
        finishedAt: { gte: since },
      },
      orderBy: { finishedAt: "desc" },
      take: FEED_SOURCE_CAP,
      select: {
        id: true,
        source: true,
        status: true,
        counts: true,
        finishedAt: true,
      },
    }),
  ]);

  const out: Candidate[] = [];
  for (const n of nudges) {
    out.push({
      key: `nudge:${n.id}`,
      group: "activity",
      kind: "nudge",
      actor: null,
      title: n.title,
      body: clip(n.body, 200),
      at: n.createdAt.toISOString(),
      link: safeLink(n.deepLink),
      readByOwner: n.readAt !== null,
    });
  }
  for (const n of cards) {
    out.push({
      key: `card:${n.id}`,
      group: "activity",
      kind: "notification",
      actor: null,
      title: n.title,
      body: clip(n.body, 200),
      at: n.createdAt.toISOString(),
      link: "/today",
      readByOwner: n.readAt !== null,
    });
  }
  for (const a of actions) {
    const area = a.op.split(".")[0] ?? "";
    out.push({
      key: `action:${a.id}`,
      group: "activity",
      kind: "agent",
      actor: null,
      title: `Needt ${opPhrase(a.op)}`,
      body: inputTitle(a.input),
      at: a.createdAt.toISOString(),
      link: OP_LINK[area] ?? "/today",
    });
  }
  for (const c of comments) {
    out.push({
      key: `comment:${c.id}`,
      group: "activity",
      kind: "comment",
      actor: c.user.name ?? "Someone",
      title: `${c.user.name ?? "Someone"} commented on ${c.page.title}`,
      body: clip(c.body, 200),
      at: c.createdAt.toISOString(),
      link: `/pages/${encodeURIComponent(c.pageId)}`,
    });
  }
  for (const s of shares) {
    const who = s.grantedBy?.name ?? "Someone";
    out.push({
      key: `share:${s.id}`,
      group: "activity",
      kind: "share",
      actor: who,
      title: `${who} shared ${s.page.title} with you`,
      body: null,
      at: s.createdAt.toISOString(),
      link: `/pages/${encodeURIComponent(s.pageId)}`,
    });
  }
  for (const c of boardComments) {
    const who = c.author.name ?? "Someone";
    out.push({
      key: `boardcomment:${c.id}`,
      group: "activity",
      kind: "comment",
      actor: who,
      title: `${who} commented on ${c.item.moodboard.title}`,
      body: clip(c.body, 200),
      at: c.createdAt.toISOString(),
      link: `/moodboards/${encodeURIComponent(c.moodboardId)}`,
    });
  }
  for (const s of boardShares) {
    const who = s.grantedBy?.name ?? "Someone";
    out.push({
      key: `boardshare:${s.id}`,
      group: "activity",
      kind: "share",
      actor: who,
      title: `${who} shared ${s.moodboard.title} with you`,
      body: null,
      at: s.createdAt.toISOString(),
      link: `/moodboards/${encodeURIComponent(s.moodboardId)}`,
    });
  }
  for (const f of feeds) {
    out.push({
      key: `sync:${f.id}`,
      group: "activity",
      kind: "sync",
      actor: null,
      title: `${f.name} needs reconnecting`,
      body: clip(f.error, 160),
      at: f.updatedAt.toISOString(),
      link: "/connections",
    });
  }
  for (const r of imports) {
    if (!r.finishedAt) continue;
    const counts = (r.counts ?? {}) as {
      done?: number;
      skipped?: number;
      failed?: number;
    };
    const name = r.source === "notion" ? "Notion" : "Todoist";
    const parts = [
      typeof counts.done === "number" ? `${counts.done} imported` : null,
      counts.skipped ? `${counts.skipped} skipped` : null,
      counts.failed ? `${counts.failed} failed` : null,
    ].filter(Boolean);
    out.push({
      key: `import:${r.id}`,
      group: "activity",
      kind: "import",
      actor: null,
      title:
        r.status === "failed"
          ? `${name} import failed`
          : `${name} import finished`,
      body: parts.length ? parts.join(", ") : null,
      at: r.finishedAt.toISOString(),
      link: "/connections",
    });
  }
  return out;
}

async function reminderCandidates(
  scope: Scope,
  now: Date
): Promise<Candidate[]> {
  const { userId } = scope;
  const horizon = addCalendarDays(now, 7);
  const earliest = newDate(now.getTime() - 24 * 3_600_000);
  const taskScope = {
    isArchived: false,
    status: { not: "completed" },
    ...workspaceOnly(scope),
  };
  const mine = { OR: [{ userId }, { assigneeId: userId }] };
  const [reminders, due] = await Promise.all([
    prisma.taskReminder.findMany({
      where: {
        userId,
        canceledAt: null,
        deliveredAt: null,
        deliveryStatus: "PENDING",
        task: { ...taskScope, ...mine },
      },
      take: FEED_SOURCE_CAP * 2,
      select: {
        id: true,
        kind: true,
        offsetMinutes: true,
        taskId: true,
        task: {
          select: {
            title: true,
            scheduledStart: true,
            deadline: true,
            dueDate: true,
          },
        },
      },
    }),
    prisma.task.findMany({
      where: {
        ...taskScope,
        ...mine,
        dueDate: {
          gte: addCalendarDays(now, -14),
          lte: addCalendarDays(now, 2),
        },
      },
      orderBy: { dueDate: "asc" },
      take: FEED_SOURCE_CAP,
      select: { id: true, title: true, dueDate: true },
    }),
  ]);

  const out: Candidate[] = [];
  const withReminder = new Set<string>();
  for (const r of reminders) {
    const fires = reminderFiresAt(r);
    if (!fires || fires < earliest || fires > horizon) continue;
    withReminder.add(r.taskId);
    out.push({
      key: `reminder:${r.id}`,
      group: "reminders",
      kind: "reminder",
      actor: null,
      title: r.task.title,
      body:
        r.kind === TaskReminderKind.BEFORE_START ? "Starts soon" : "Due soon",
      at: fires.toISOString(),
      link: `/today?task=${encodeURIComponent(r.taskId)}`,
    });
  }
  for (const t of due) {
    if (!t.dueDate || withReminder.has(t.id)) continue;
    out.push({
      key: `due:${t.id}`,
      group: "reminders",
      kind: "due",
      actor: null,
      title: t.title,
      body: t.dueDate < now ? "Overdue" : "Due soon",
      at: t.dueDate.toISOString(),
      link: `/today?task=${encodeURIComponent(t.id)}`,
    });
  }
  return out;
}

/**
 * One page of the feed. Activity is newest first and pages by `before` (an ISO
 * time); reminders are soonest first and come in one page.
 */
export async function getNotificationFeed(input: {
  userId: string;
  workspace?: WorkspaceAccess;
  group: FeedGroup;
  limit?: number;
  before?: string | null;
  now?: Date;
}): Promise<FeedPage> {
  const now = input.now ?? newDate();
  const limit = Math.min(
    Math.max(input.limit ?? FEED_DEFAULT_LIMIT, 1),
    FEED_MAX_LIMIT
  );
  const scope: Scope = { userId: input.userId, workspace: input.workspace };
  const since = addCalendarDays(now, -FEED_WINDOW_DAYS);

  const [activity, reminders] = await Promise.all([
    activityCandidates(scope, since),
    input.group === "reminders"
      ? reminderCandidates(scope, now)
      : Promise.resolve([]),
  ]);

  const keys = activity.map((c) => c.key);
  const reads = keys.length
    ? await prisma.notificationRead.findMany({
        where: { userId: input.userId, key: { in: [...keys, ALL_READ_KEY] } },
        select: { key: true, readAt: true },
      })
    : [];
  const readKeys = new Set(reads.map((r) => r.key));
  const allReadAt = reads.find((r) => r.key === ALL_READ_KEY)?.readAt ?? null;

  const withState = activity
    .map<FeedItem>(({ readByOwner, ...item }) => ({
      ...item,
      unread:
        !readByOwner &&
        !readKeys.has(item.key) &&
        !(allReadAt && newDate(item.at) <= allReadAt),
    }))
    .sort((a, b) =>
      a.at < b.at ? 1 : a.at > b.at ? -1 : a.key < b.key ? -1 : 1
    );
  const unreadCount = withState.filter((i) => i.unread).length;

  if (input.group === "reminders") {
    const items = reminders
      .map<FeedItem>((r) => ({ ...r, unread: false }))
      .sort((a, b) => (a.at < b.at ? -1 : 1))
      .slice(0, limit);
    return { items, nextBefore: null, unreadCount };
  }

  const before = input.before ? newDate(input.before) : null;
  const usable =
    before && !Number.isNaN(before.getTime())
      ? withState.filter((i) => newDate(i.at) < before)
      : withState;
  const items = usable.slice(0, limit);
  const nextBefore =
    usable.length > limit ? (items[items.length - 1]?.at ?? null) : null;
  return { items, nextBefore, unreadCount };
}

export class NotificationReadError extends Error {}

/** Marks the given item keys read, or everything up to now with `all`. */
export async function markNotificationsRead(input: {
  userId: string;
  all?: boolean;
  keys?: unknown;
  now?: Date;
}): Promise<{ marked: number }> {
  const now = input.now ?? newDate();
  if (input.all === true) {
    await prisma.notificationRead.upsert({
      where: { userId_key: { userId: input.userId, key: ALL_READ_KEY } },
      create: { userId: input.userId, key: ALL_READ_KEY, readAt: now },
      update: { readAt: now },
    });
    return { marked: -1 };
  }
  if (
    !Array.isArray(input.keys) ||
    input.keys.length === 0 ||
    input.keys.length > MAX_KEYS ||
    !input.keys.every(
      (k) =>
        typeof k === "string" &&
        k.length > 0 &&
        k.length <= MAX_KEY_LENGTH &&
        k !== ALL_READ_KEY
    )
  ) {
    throw new NotificationReadError(
      `Send { "all": true } or { "keys": [1 to ${MAX_KEYS} item keys] }.`
    );
  }
  const keys = [...new Set(input.keys as string[])];
  const result = await prisma.notificationRead.createMany({
    data: keys.map((key) => ({ userId: input.userId, key, readAt: now })),
    skipDuplicates: true,
  });
  logger.debug(
    "Notifications marked read",
    { count: result.count },
    LOG_SOURCE
  );
  return { marked: result.count };
}
