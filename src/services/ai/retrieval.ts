import {
  getMoodboard,
  listMoodboards,
} from "@/services/moodboards/moodboard-service";
import { withoutPrivateTrees } from "@/services/pages/ai-page-access";
import { pageActorScope } from "@/services/pages/page-model";
import { getPage, listPages } from "@/services/pages/page-service";
import { Prisma, WorkspaceKind } from "@prisma/client";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

/**
 * What the agent can know, kept small on purpose. `searchData` returns
 * titles, a short snippet and a link per hit; `fetchObject` then reads the
 * one object that matters. The agent searches first and fetches second, so a
 * question never pulls the whole planner into the prompt.
 *
 * Every query carries the caller's scope: tasks, projects and habits by
 * workspace, pages by page access, moodboards by board access, events and
 * mail by the person. Mail is metadata only (sender, subject, date, the
 * provider's snippet): bodies are read by the existing `get_message` tool, and
 * mail is never written.
 *
 * The caller here is always the AI agent, so pages are read as an AI actor:
 * a page in a private tree is never searched, listed or fetched, whoever owns
 * it (the same rule the Pages screen applies before sending a page to a
 * provider).
 */

export const RETRIEVAL_TYPES = [
  "task",
  "project",
  "event",
  "page",
  "habit",
  "moodboard",
  "mail",
] as const;
export type RetrievalType = (typeof RETRIEVAL_TYPES)[number];

export interface RetrievalHit {
  type: RetrievalType;
  id: string;
  title: string;
  snippet?: string;
  /** A date worth showing: due, start or received. */
  when?: string;
  href: string;
}

export function hrefFor(type: RetrievalType, id: string) {
  const key = encodeURIComponent(id);
  switch (type) {
    case "task":
      return `/tasks?taskId=${key}`;
    case "project":
      return `/projects/${key}`;
    case "event":
      return `/calendar?event=${key}`;
    case "page":
      return `/pages/${key}`;
    case "habit":
      return "/habits";
    case "moodboard":
      return `/moodboards/${key}`;
    case "mail":
      return `/mail?message=${key}`;
  }
}

const SNIPPET = 160;

/** The words around the first match, or the start of the text. */
export function snippetAround(text: string, query: string, width = SNIPPET) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= width) return flat;
  const at = flat.toLowerCase().indexOf(query.toLowerCase());
  const start = Math.max(0, at < 0 ? 0 : at - Math.floor(width / 3));
  const cut = flat.slice(start, start + width).trim();
  return `${start > 0 ? "…" : ""}${cut}${start + width < flat.length ? "…" : ""}`;
}

function blockText(content: unknown): string {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    const text = (content as { text?: unknown }).text;
    if (typeof text === "string") return text;
  }
  return "";
}

const PAGE_SCAN_LIMIT = 2000;

async function searchPageBodies(
  actor: { userId: string; workspace: WorkspaceAccess },
  query: string,
  take: number
): Promise<Array<{ pageId: string; text: string }>> {
  const scanned = await prisma.page.findMany({
    where: { ...pageActorScope(actor), trashedAt: null },
    select: { id: true },
    take: PAGE_SCAN_LIMIT,
  });
  // Private trees are dropped before their text is ever queried.
  const pages = await withoutPrivateTrees(scanned);
  if (!pages.length) return [];
  const like = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return prisma.$queryRaw<Array<{ pageId: string; text: string }>>(Prisma.sql`
    SELECT "pageId", "content"->>'text' AS "text"
    FROM "PageBlock"
    WHERE "pageId" = ANY(${pages.map((page) => page.id)})
      AND "content"->>'text' ILIKE ${like}
    ORDER BY "updatedAt" DESC
    LIMIT ${take * 3}
  `);
}

export async function searchData(input: {
  userId: string;
  workspace: WorkspaceAccess;
  query: string;
  types?: readonly RetrievalType[];
  limit?: number;
}): Promise<RetrievalHit[]> {
  const q = input.query.trim();
  if (!q) return [];
  const take = Math.min(Math.max(input.limit ?? 8, 1), 15);
  const types = new Set(input.types?.length ? input.types : RETRIEVAL_TYPES);
  const { userId, workspace } = input;
  const scope = workspaceDataScopeWhere(workspace, userId);
  const contains = { contains: q, mode: "insensitive" as const };
  const personal = workspace.workspaceKind === WorkspaceKind.PERSONAL;
  const actor = { userId, workspace, ai: true };

  const [
    tasks,
    projects,
    events,
    pageTitles,
    pageBodies,
    habits,
    boards,
    mail,
  ] = await Promise.all([
    types.has("task")
      ? prisma.task.findMany({
          where: {
            ...scope,
            isArchived: false,
            OR: [{ title: contains }, { description: contains }],
          },
          select: {
            id: true,
            title: true,
            status: true,
            dueDate: true,
            description: true,
          },
          take,
          orderBy: { updatedAt: "desc" },
        })
      : [],
    types.has("project")
      ? prisma.project.findMany({
          where: {
            ...scope,
            OR: [{ name: contains }, { description: contains }],
          },
          select: { id: true, name: true, status: true, description: true },
          take,
          orderBy: { updatedAt: "desc" },
        })
      : [],
    types.has("event") && personal
      ? prisma.calendarEvent.findMany({
          where: {
            archivedAt: null,
            feed: { userId, enabled: true },
            OR: [
              { title: contains },
              { description: contains },
              { location: contains },
            ],
          },
          select: {
            id: true,
            title: true,
            start: true,
            location: true,
            description: true,
          },
          take,
          orderBy: { start: "desc" },
        })
      : [],
    types.has("page")
      ? listPages(actor, { search: q }).then((rows) => rows.slice(0, take))
      : [],
    types.has("page") ? searchPageBodies(actor, q, take) : [],
    types.has("habit")
      ? prisma.habit.findMany({
          where: {
            ...scope,
            userId,
            archivedAt: null,
            OR: [{ title: contains }, { description: contains }],
          },
          select: { id: true, title: true, description: true },
          take,
          orderBy: { updatedAt: "desc" },
        })
      : [],
    types.has("moodboard") ? searchMoodboards(actor, q, take) : [],
    types.has("mail")
      ? prisma.mailMessage.findMany({
          where: {
            account: { userId },
            OR: [
              { subject: contains },
              { snippet: contains },
              { fromAddress: contains },
              { fromName: contains },
            ],
          },
          select: {
            id: true,
            subject: true,
            fromName: true,
            fromAddress: true,
            date: true,
            snippet: true,
          },
          take,
          orderBy: { date: "desc" },
        })
      : [],
  ]);

  const hits: RetrievalHit[] = [];
  for (const row of tasks) {
    hits.push({
      type: "task",
      id: row.id,
      title: row.title,
      snippet: row.description ? snippetAround(row.description, q) : row.status,
      when: row.dueDate?.toISOString(),
      href: hrefFor("task", row.id),
    });
  }
  for (const row of projects) {
    hits.push({
      type: "project",
      id: row.id,
      title: row.name,
      snippet: row.description ? snippetAround(row.description, q) : row.status,
      href: hrefFor("project", row.id),
    });
  }
  for (const row of events) {
    hits.push({
      type: "event",
      id: row.id,
      title: row.title,
      snippet: row.location ?? undefined,
      when: row.start.toISOString(),
      href: hrefFor("event", row.id),
    });
  }
  const seenPages = new Set<string>();
  const pageTitleById = new Map(
    [...pageTitles].map((page) => [page.id, page.title])
  );
  for (const page of pageTitles) {
    seenPages.add(page.id);
    hits.push({
      type: "page",
      id: page.id,
      title: page.title,
      href: hrefFor("page", page.id),
    });
  }
  for (const block of pageBodies) {
    if (seenPages.has(block.pageId) || seenPages.size >= take * 2) continue;
    seenPages.add(block.pageId);
    const title =
      pageTitleById.get(block.pageId) ??
      (
        await prisma.page.findFirst({
          where: { id: block.pageId },
          select: { title: true },
        })
      )?.title ??
      "Untitled";
    hits.push({
      type: "page",
      id: block.pageId,
      title,
      snippet: snippetAround(block.text ?? "", q),
      href: hrefFor("page", block.pageId),
    });
  }
  for (const row of habits) {
    hits.push({
      type: "habit",
      id: row.id,
      title: row.title,
      snippet: row.description ? snippetAround(row.description, q) : undefined,
      href: hrefFor("habit", row.id),
    });
  }
  for (const board of boards) {
    hits.push({
      type: "moodboard",
      id: board.id,
      title: board.title,
      snippet: board.snippet,
      href: hrefFor("moodboard", board.id),
    });
  }
  for (const row of mail) {
    hits.push({
      type: "mail",
      id: row.id,
      title: row.subject,
      snippet: `${row.fromName || row.fromAddress || "unknown sender"}: ${snippetAround(row.snippet ?? "", q, 100)}`,
      when: row.date.toISOString(),
      href: hrefFor("mail", row.id),
    });
  }
  return hits;
}

/** Boards the person can open whose title, or a note or caption on them, matches. */
async function searchMoodboards(
  actor: { userId: string; workspace: WorkspaceAccess },
  q: string,
  take: number
): Promise<Array<{ id: string; title: string; snippet?: string }>> {
  const boards = await listMoodboards(actor);
  if (!boards.length) return [];
  const needle = q.toLowerCase();
  const byTitle = boards.filter((board) =>
    board.title.toLowerCase().includes(needle)
  );
  const items = await prisma.moodboardItem.findMany({
    where: {
      moodboardId: { in: boards.map((board) => board.id) },
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { text: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { moodboardId: true, title: true, text: true },
    take: take * 3,
  });
  const out = new Map<
    string,
    { id: string; title: string; snippet?: string }
  >();
  for (const board of byTitle) {
    out.set(board.id, { id: board.id, title: board.title });
  }
  for (const item of items) {
    if (out.has(item.moodboardId)) continue;
    const board = boards.find((candidate) => candidate.id === item.moodboardId);
    if (!board) continue;
    out.set(board.id, {
      id: board.id,
      title: board.title,
      snippet: snippetAround(item.title ?? item.text ?? "", q),
    });
  }
  return [...out.values()].slice(0, take);
}

export interface FetchedObject {
  type: RetrievalType;
  id: string;
  title: string;
  href: string;
  /** Compact fields for the model. */
  data: Record<string, unknown>;
}

const BODY_LIMIT = 3500;

function cut(text: string | null | undefined, limit = BODY_LIMIT) {
  if (!text) return undefined;
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export async function fetchObject(input: {
  userId: string;
  workspace: WorkspaceAccess;
  type: RetrievalType;
  id: string;
}): Promise<FetchedObject | null> {
  const { userId, workspace, type, id } = input;
  const scope = workspaceDataScopeWhere(workspace, userId);
  const wrap = (
    title: string,
    data: Record<string, unknown>
  ): FetchedObject => ({
    type,
    id,
    title,
    href: hrefFor(type, id),
    data: { id, type, title, ...data },
  });
  switch (type) {
    case "task": {
      const task = await prisma.task.findFirst({
        where: { id, ...scope },
        include: {
          parts: { orderBy: { position: "asc" } },
          project: { select: { id: true, name: true } },
        },
      });
      if (!task) return null;
      return wrap(task.title, {
        status: task.status,
        notes: cut(task.description),
        due: task.dueDate?.toISOString(),
        deadline: task.deadline?.toISOString(),
        priority: task.priorityLevel,
        estimateMinutes: task.estimatedMinutes ?? undefined,
        scheduledStart: task.scheduledStart?.toISOString(),
        scheduledEnd: task.scheduledEnd?.toISOString(),
        project: task.project ?? undefined,
        entry: task.entry ?? undefined,
        dependsOnId: task.dependsOnId ?? undefined,
        subtasks: task.parts.map((part) => ({
          title: part.title,
          done: part.done,
        })),
        archived: task.isArchived || undefined,
      });
    }
    case "project": {
      const project = await prisma.project.findFirst({
        where: { id, ...scope },
      });
      if (!project) return null;
      const [open, done] = await Promise.all([
        prisma.task.count({
          where: {
            ...scope,
            projectId: id,
            isArchived: false,
            status: { in: ["todo", "in_progress"] },
          },
        }),
        prisma.task.count({
          where: { ...scope, projectId: id, status: "completed" },
        }),
      ]);
      return wrap(project.name, {
        status: project.status,
        description: cut(project.description),
        openTasks: open,
        completedTasks: done,
      });
    }
    case "event": {
      if (workspace.workspaceKind !== WorkspaceKind.PERSONAL) return null;
      const event = await prisma.calendarEvent.findFirst({
        where: { id, archivedAt: null, feed: { userId } },
      });
      if (!event) return null;
      return wrap(event.title, {
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        allDay: event.allDay,
        location: event.location ?? undefined,
        description: cut(event.description),
      });
    }
    case "page": {
      // null for a missing page, one the person cannot open, and one in a
      // private tree: the agent cannot tell these apart.
      const page = await getPage({ userId, workspace, ai: true }, id);
      if (!page) return null;
      const text = page.blocks
        .map((block) => blockText(block.content))
        .filter(Boolean)
        .join("\n");
      return wrap(page.title, {
        text: cut(text),
        blocks: page.blocks.length,
        updatedAt: page.updatedAt.toISOString(),
      });
    }
    case "habit": {
      const habit = await prisma.habit.findFirst({
        where: { id, ...scope, userId },
      });
      if (!habit) return null;
      return wrap(habit.title, {
        description: cut(habit.description),
        archived: habit.archivedAt ? true : undefined,
      });
    }
    case "moodboard": {
      const board = await getMoodboard({ userId, workspace }, id);
      if (!board) return null;
      const items = await prisma.moodboardItem.findMany({
        where: { moodboardId: id },
        orderBy: { position: "asc" },
        take: 20,
        select: { kind: true, title: true, text: true },
      });
      return wrap(board.title, {
        role: board.accessRole,
        items: items.map((item) => ({
          kind: item.kind,
          caption: cut(item.title ?? item.text, 120),
        })),
      });
    }
    case "mail": {
      // Metadata only. The body is read by get_message, which the person's
      // own mail account already allows; mail is never written.
      const message = await prisma.mailMessage.findFirst({
        where: { id, account: { userId } },
        select: {
          subject: true,
          fromName: true,
          fromAddress: true,
          date: true,
          snippet: true,
          isRead: true,
          labels: true,
        },
      });
      if (!message) return null;
      return wrap(message.subject, {
        from: message.fromName || message.fromAddress,
        date: message.date.toISOString(),
        snippet: cut(message.snippet, 300),
        unread: message.isRead ? undefined : true,
        labels: message.labels,
      });
    }
  }
}
