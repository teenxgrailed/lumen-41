import { listPages } from "@/services/pages/page-service";
import { WorkspaceKind } from "@prisma/client";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

export const SEARCHABLE_TYPES = [
  "task",
  "project",
  "event",
  "page",
  "habit",
  "mail",
] as const;

export type SearchableType = (typeof SEARCHABLE_TYPES)[number];

export interface SearchHit {
  id: string;
  type: SearchableType;
  title: string;
}

/**
 * The one search over a person's data. The in-app command palette and the
 * MCP `needt_search` tool both call it, so a result reachable in one is
 * reachable in the other. Every query carries the caller's workspace scope;
 * calendar events and mail are personal and scoped to the user.
 */
export async function searchWorkspace(input: {
  userId: string;
  workspace: WorkspaceAccess | undefined;
  query: string;
  take: number;
  types?: readonly SearchableType[];
}): Promise<SearchHit[]> {
  const q = input.query.trim();
  if (!q) return [];
  const types = new Set(input.types ?? SEARCHABLE_TYPES);
  const scope = workspaceDataScopeWhere(input.workspace, input.userId);
  const take = input.take;
  const contains = { contains: q, mode: "insensitive" as const };
  const personal = input.workspace?.workspaceKind === WorkspaceKind.PERSONAL;

  const [tasks, projects, events, pages, habits, mail] = await Promise.all([
    types.has("task")
      ? prisma.task.findMany({
          where: {
            ...scope,
            isArchived: false,
            OR: [{ title: contains }, { description: contains }],
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
          take,
          orderBy: { updatedAt: "desc" },
        })
      : [],
    types.has("event") && personal
      ? prisma.calendarEvent.findMany({
          where: {
            archivedAt: null,
            feed: { userId: input.userId, enabled: true },
            OR: [{ title: contains }, { description: contains }],
          },
          take,
          orderBy: { start: "desc" },
        })
      : [],
    types.has("page")
      ? listPages(
          { userId: input.userId, workspace: input.workspace },
          { search: q }
        ).then((rows) => rows.slice(0, take))
      : [],
    types.has("habit")
      ? prisma.habit.findMany({
          where: {
            ...scope,
            userId: input.userId,
            archivedAt: null,
            OR: [{ title: contains }, { description: contains }],
          },
          take,
          orderBy: { updatedAt: "desc" },
        })
      : [],
    types.has("mail")
      ? prisma.mailMessage.findMany({
          where: {
            account: { userId: input.userId },
            OR: [
              { subject: contains },
              { snippet: contains },
              { fromAddress: contains },
              { fromName: contains },
            ],
          },
          select: { id: true, subject: true },
          take,
          orderBy: { date: "desc" },
        })
      : [],
  ]);

  return [
    ...tasks.map((row) => ({
      id: row.id,
      type: "task" as const,
      title: row.title,
    })),
    ...projects.map((row) => ({
      id: row.id,
      type: "project" as const,
      title: row.name,
    })),
    ...events.map((row) => ({
      id: row.id,
      type: "event" as const,
      title: row.title,
    })),
    ...pages.map((row) => ({
      id: row.id,
      type: "page" as const,
      title: row.title,
    })),
    ...habits.map((row) => ({
      id: row.id,
      type: "habit" as const,
      title: row.title,
    })),
    ...mail.map((row) => ({
      id: row.id,
      type: "mail" as const,
      title: row.subject,
    })),
  ];
}
