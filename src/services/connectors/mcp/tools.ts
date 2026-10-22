import { NextRequest } from "next/server";

import { GET as blockingActiveGet } from "@/app/api/blocking/active/route";
import {
  DELETE as blockingProfileDelete,
  PATCH as blockingProfilePatch,
} from "@/app/api/blocking/profiles/[id]/route";
import {
  GET as blockingProfilesGet,
  POST as blockingProfilesPost,
} from "@/app/api/blocking/profiles/route";
import { POST as controlPost } from "@/app/api/connect/control/route";
import { POST as opsPost } from "@/app/api/connect/ops/[name]/route";
import { POST as reschedulePost } from "@/app/api/connect/reschedule/route";
import {
  GET as scheduleGet,
  POST as schedulePost,
} from "@/app/api/connect/schedule/route";
import { POST as createTaskPost } from "@/app/api/connect/tasks/route";
import {
  clearAgentMemories,
  forgetForUser,
  isLearningEnabled,
  listAgentMemories,
  publicMemory,
  updateMemoryForUser,
} from "@/services/ai/memory";
import { blockingProfileFields } from "@/services/blocking/profile";
import { authorizeConnectorWorkspace } from "@/services/connectors/auth";
import type { BearerAuth } from "@/services/connectors/bearer";
import { CONNECTOR_CONTROL_ACTIONS } from "@/services/connectors/control-actions";
import { createLocalEvent } from "@/services/connectors/local-events";
import {
  HabitCompletionDateError,
  setHabitCompletionToday,
} from "@/services/habits/habit-service";
import {
  getMoodboard,
  listMoodboards,
} from "@/services/moodboards/moodboard-service";
import {
  appendPageBlocks,
  createPage,
  getPage,
  listPages,
} from "@/services/pages/page-service";
import {
  PAGE_TEXT_MAX_LENGTH,
  pageBlocksFromText,
} from "@/services/pages/page-text-blocks";
import {
  PageCollaborationActiveError,
  PageRevisionConflictError,
  writePageBlocks,
} from "@/services/pages/page-write-path";
import {
  personalBlockSelect,
  personalBlockView,
} from "@/services/personal-time/service";
import {
  SEARCHABLE_TYPES,
  searchWorkspace,
} from "@/services/search/workspace-search";
import {
  SUBTASK_GUIDANCE,
  appendSubtasks,
  entrySchema,
  normalizeSubtasks,
  setSubtaskDone,
  subtaskListSchema,
  subtaskSelect,
} from "@/services/tasks/subtasks";
import {
  type TaskFieldPatch,
  updateTaskFields,
} from "@/services/tasks/task-update";
import { PageAuthor, WorkspaceKind, WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import {
  WORKSPACE_HEADER,
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { listMailMessages } from "@/lib/mail-db";
import type { McpScope } from "@/lib/mcp-config";
import { DOC_ORIGIN, withOriginPageId } from "@/lib/needt3/origin-page";
import { prisma } from "@/lib/prisma";
import type { RealtimeEventType } from "@/lib/realtime/channels";
import { publishRealtimeEventSafe } from "@/lib/realtime/publish";

import { TaskStatus } from "@/types/task";

import { type JsonSchema, zodToJsonSchema } from "./json-schema";

/** Hard ceiling on rows returned by one list or search call. */
export const MCP_LIST_LIMIT_MAX = 50;

export interface McpToolContext {
  /** The incoming MCP request; carries the caller's bearer token and workspace. */
  request: NextRequest;
  userId: string;
  /** Who the bearer token speaks for: its kind, scopes and bound workspace. */
  auth: BearerAuth;
  /**
   * The `workspaceId` tool argument: OAuth clients (claude.ai, ChatGPT)
   * cannot send the X-Workspace-Id header, so every tool takes it.
   */
  workspaceId?: string;
}

export interface McpToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

interface McpToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

export interface McpTool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  input: S;
  /** Every tool says whether it reads or writes, and whether it can destroy. */
  annotations: McpToolAnnotations & {
    readOnlyHint: boolean;
    destructiveHint: boolean;
  };
  /** Scopes the call needs; defaults to read for read-only tools, else write. */
  scopes?(args: z.infer<S>): McpScope[];
  invoke(ctx: McpToolContext, args: z.infer<S>): Promise<McpToolResult>;
}

/**
 * Tells the open app what a successful write changed, so every connected
 * client refreshes without a reload. The UI's own writes update their cache
 * directly; a write that arrives over MCP has no such path.
 */
type Publishes<S extends z.ZodTypeAny> =
  | readonly RealtimeEventType[]
  | ((args: z.infer<S>) => readonly RealtimeEventType[]);

function defineTool<S extends z.ZodTypeAny>(
  tool: McpTool<S>,
  publishes?: Publishes<S>
): McpTool {
  if (!publishes) return tool as unknown as McpTool;
  const invoke = tool.invoke;
  return {
    ...tool,
    async invoke(ctx: McpToolContext, args: z.infer<S>) {
      const result = await invoke(ctx, args);
      if (!result.isError) {
        const types =
          typeof publishes === "function" ? publishes(args) : publishes;
        for (const type of types) {
          await publishRealtimeEventSafe(ctx.userId, type);
        }
      }
      return result;
    },
  } as unknown as McpTool;
}

export function toolResult(payload: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

export function toolError(payload: unknown): McpToolResult {
  return { ...toolResult(payload), isError: true };
}

type RouteHandler<P extends Record<string, string>> = (
  request: NextRequest,
  context: { params: Promise<P> }
) => Promise<Response | undefined>;

/**
 * Runs an existing connector route in-process with the caller's own
 * Authorization and workspace headers, so authentication, workspace scoping
 * and confirmation rules stay defined once, in the route.
 */
async function callRoute<P extends Record<string, string>>(
  ctx: McpToolContext,
  handler: RouteHandler<P>,
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: unknown,
  params: P = {} as P
): Promise<McpToolResult> {
  const headers = new Headers({ "content-type": "application/json" });
  const authorization = ctx.request.headers.get("authorization");
  if (authorization) headers.set("authorization", authorization);
  const workspaceHeader = ctx.request.headers.get(WORKSPACE_HEADER);
  if (workspaceHeader) headers.set(WORKSPACE_HEADER, workspaceHeader);

  const url = new URL(path, ctx.request.url);
  const workspaceQuery =
    ctx.workspaceId ?? ctx.request.nextUrl.searchParams.get("workspaceId");
  if (workspaceQuery) url.searchParams.set("workspaceId", workspaceQuery);

  const response = await handler(
    new NextRequest(url, {
      method,
      headers,
      body:
        method === "GET" || method === "DELETE"
          ? undefined
          : JSON.stringify(body ?? {}),
    }),
    { params: Promise.resolve(params) }
  );
  if (!response) return toolError({ status: 500, error: "No response" });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { text };
  }
  return response.ok
    ? toolResult(payload)
    : toolError({ status: response.status, error: payload });
}

async function workspaceAccess(
  ctx: McpToolContext,
  role: WorkspaceRole
): Promise<{ workspace: WorkspaceAccess } | { error: McpToolResult }> {
  const auth = await authorizeConnectorWorkspace(
    ctx.request,
    ctx.userId,
    role,
    {
      workspaceId: ctx.workspaceId,
      boundWorkspaceId: ctx.auth.workspaceId,
    }
  );
  if ("response" in auth && auth.response) {
    return {
      error: toolError({
        status: auth.response.status,
        error: await auth.response.json().catch(() => null),
      }),
    };
  }
  return { workspace: auth.workspace as WorkspaceAccess };
}

const readAccess = (ctx: McpToolContext) =>
  workspaceAccess(ctx, WorkspaceRole.VIEWER);

/** Writes need an editor seat in the workspace the call resolves to. */
const writeAccess = (ctx: McpToolContext) =>
  workspaceAccess(ctx, WorkspaceRole.EDITOR);

/** A task's subtasks, in the order they are done. */
const taskPartsInclude = {
  parts: { orderBy: { position: "asc" as const }, select: subtaskSelect },
  // Labels, and files without their bytes (read the bytes in the app or at
  // /api/tasks/:id/attachments/:attachmentId).
  tags: { select: { id: true, name: true, color: true } },
  attachments: {
    where: { bytes: { not: null } },
    orderBy: { createdAt: "asc" as const },
    select: { id: true, name: true, mimeType: true, size: true },
  },
};

const LIST_TYPES = [
  "task",
  "project",
  "event",
  "calendar",
  "page",
  "habit",
  "mail",
  "moodboard",
  "personal_time",
] as const;
type ListType = (typeof LIST_TYPES)[number];

const calendarSelect = {
  id: true,
  name: true,
  type: true,
  color: true,
  enabled: true,
  lastSync: true,
  // The last sync failure, empty when the calendar is healthy.
  error: true,
  createdAt: true,
  updatedAt: true,
} as const;

const mailSelect = {
  id: true,
  threadId: true,
  fromName: true,
  fromAddress: true,
  toAddresses: true,
  subject: true,
  snippet: true,
  date: true,
  isRead: true,
  isArchived: true,
  snoozedUntil: true,
  labels: true,
  account: { select: { id: true, provider: true, address: true } },
} as const;

function page<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return {
    items,
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
  };
}

function cursorArgs(cursor: string | undefined): {
  cursor?: { id: string };
  skip?: number;
} {
  return cursor ? { cursor: { id: cursor }, skip: 1 } : {};
}

/** Cursor paging over a list a service returns whole. */
function sliceAfter<T extends { id: string }>(
  rows: T[],
  args: { limit: number; cursor?: string }
) {
  const start = args.cursor
    ? rows.findIndex((row) => row.id === args.cursor) + 1
    : 0;
  return page(rows.slice(start, start + args.limit + 1), args.limit);
}

async function listRows(
  type: ListType,
  ctx: McpToolContext,
  workspace: WorkspaceAccess,
  args: {
    limit: number;
    cursor?: string;
    includeArchived?: boolean;
    from?: string;
    to?: string;
    originPageId?: string;
  }
) {
  const { userId } = ctx;
  const scope = workspaceDataScopeWhere(workspace, userId);
  const take = args.limit + 1;
  const personal = workspace.workspaceKind === WorkspaceKind.PERSONAL;
  const order = [{ createdAt: "desc" as const }, { id: "desc" as const }];

  switch (type) {
    case "task":
      return page(
        (
          await prisma.task.findMany({
            where: {
              ...scope,
              ...(args.includeArchived ? {} : { isArchived: false }),
              ...(args.originPageId
                ? { originKind: DOC_ORIGIN, originId: args.originPageId }
                : {}),
            },
            include: taskPartsInclude,
            orderBy: order,
            take,
            ...cursorArgs(args.cursor),
          })
        ).map(withOriginPageId),
        args.limit
      );
    case "project":
      return page(
        await prisma.project.findMany({
          where: {
            ...scope,
            ...(args.includeArchived ? {} : { status: { not: "archived" } }),
          },
          orderBy: order,
          take,
          ...cursorArgs(args.cursor),
        }),
        args.limit
      );
    case "event":
      if (!personal) {
        return {
          items: [],
          nextCursor: null,
          note: "Calendar events are personal; switch to the personal workspace to read them.",
        };
      }
      return page(
        await prisma.calendarEvent.findMany({
          where: {
            feed: { userId, enabled: true },
            ...(args.includeArchived ? {} : { archivedAt: null }),
            ...(args.from ? { end: { gte: newDate(args.from) } } : {}),
            ...(args.to ? { start: { lte: newDate(args.to) } } : {}),
          },
          orderBy: [{ start: "asc" }, { id: "asc" }],
          take,
          ...cursorArgs(args.cursor),
        }),
        args.limit
      );
    case "calendar":
      return page(
        await prisma.calendarFeed.findMany({
          where: {
            userId,
            ...(args.includeArchived ? {} : { enabled: true }),
          },
          select: calendarSelect,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          take,
          ...cursorArgs(args.cursor),
        }),
        args.limit
      );
    case "page":
      return sliceAfter(await listPages({ userId, workspace }), args);
    case "moodboard":
      // Slim rows: the app's list also carries member emails and previews.
      return sliceAfter(
        (await listMoodboards({ userId, workspace })).map((board) => ({
          id: board.id,
          title: board.title,
          accessRole: board.accessRole,
          itemCount: board.itemCount,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt,
        })),
        args
      );
    case "personal_time":
      return page(
        (
          await prisma.personalBlock.findMany({
            where: {
              userId,
              ...(args.includeArchived ? {} : { archivedAt: null }),
            },
            select: personalBlockSelect,
            orderBy: [{ start: "asc" }, { id: "asc" }],
            take,
            ...cursorArgs(args.cursor),
          })
        ).map(personalBlockView),
        args.limit
      );
    case "habit":
      return page(
        await prisma.habit.findMany({
          where: {
            ...scope,
            userId,
            ...(args.includeArchived ? {} : { archivedAt: null }),
          },
          orderBy: order,
          take,
          ...cursorArgs(args.cursor),
        }),
        args.limit
      );
    case "mail": {
      const rows = await listMailMessages({
        userId,
        take: args.limit,
        cursor: args.cursor ?? null,
      });
      return page(
        rows.map((row) => ({
          id: row.id,
          threadId: row.threadId,
          fromName: row.fromName,
          fromAddress: row.fromAddress,
          subject: row.subject,
          snippet: row.snippet,
          date: row.date,
          isRead: row.isRead,
          labels: row.labels,
          account: row.account,
        })),
        args.limit
      );
    }
  }
}

async function getRow(
  type: ListType,
  id: string,
  ctx: McpToolContext,
  workspace: WorkspaceAccess
): Promise<unknown> {
  const { userId } = ctx;
  const scope = workspaceDataScopeWhere(workspace, userId);
  switch (type) {
    case "task": {
      const task = await prisma.task.findFirst({
        where: { id, ...scope },
        include: {
          scheduledBlocks: { orderBy: { chunkIndex: "asc" } },
          ...taskPartsInclude,
        },
      });
      return task && withOriginPageId(task);
    }
    case "project":
      return prisma.project.findFirst({ where: { id, ...scope } });
    case "event":
      if (workspace.workspaceKind !== WorkspaceKind.PERSONAL) return null;
      return prisma.calendarEvent.findFirst({
        where: { id, feed: { userId } },
      });
    case "calendar":
      return prisma.calendarFeed.findFirst({
        where: { id, userId },
        select: calendarSelect,
      });
    case "page":
      return getPage({ userId, workspace }, id);
    case "habit":
      return prisma.habit.findFirst({ where: { id, ...scope, userId } });
    case "mail":
      return prisma.mailMessage.findFirst({
        where: { id, account: { userId } },
        // Metadata only: mail.read never includes message bodies.
        select: mailSelect,
      });
    case "moodboard":
      return getMoodboard({ userId, workspace }, id);
    case "personal_time": {
      const block = await prisma.personalBlock.findFirst({
        where: { id, userId },
        select: personalBlockSelect,
      });
      return block && personalBlockView(block);
    }
  }
}

/** NONE is "No priority". */
const priorityOrNone = z.enum(["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"]);
const energy = z.enum(["LOW", "MEDIUM", "HIGH"]);
const repeatRule = z
  .string()
  .min(1)
  .max(500)
  .describe(
    "RRULE text, e.g. FREQ=DAILY, FREQ=WEEKLY;BYDAY=MO,WE or FREQ=MONTHLY."
  );
const labelIds = z
  .array(z.string().min(1))
  .max(50)
  .describe("Label ids (your own tags); the task ends up with exactly these.");

/** The single MCP tool catalogue. The stdio bridge has no list of its own. */
export const MCP_TOOLS: McpTool[] = [
  defineTool({
    name: "needt_search",
    description:
      "Search everything in the active Needt workspace — tasks, projects, calendar events, pages, habits and mail — by text. Returns ids and titles; read full objects with needt_get. Mail is searched only with the mail.read scope.",
    annotations: { readOnlyHint: true, destructiveHint: false },
    input: z.object({
      query: z.string().min(1).describe("Text to look for."),
      types: z
        .array(z.enum(SEARCHABLE_TYPES))
        .optional()
        .describe("Limit the search to these object types."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(MCP_LIST_LIMIT_MAX)
        .default(10)
        .describe("Maximum results per type."),
    }),
    async invoke(ctx, args) {
      const access = await readAccess(ctx);
      if ("error" in access) return access.error;
      // Without mail.read, mail is simply not searched (not an error).
      const types = ctx.auth.scopes.includes("mail.read")
        ? args.types
        : (args.types ?? [...SEARCHABLE_TYPES]).filter((t) => t !== "mail");
      return toolResult({
        results: await searchWorkspace({
          userId: ctx.userId,
          workspace: access.workspace,
          query: args.query,
          take: args.limit,
          types,
        }),
      });
    },
  }),
  defineTool({
    name: "needt_list",
    description:
      "List objects of one type from the active Needt workspace, newest first, with cursor pagination. Types: task, project, event, calendar, page, habit, mail, moodboard, personal_time (lunch, walks, gym and other time kept for the person; tasks are never scheduled in it).",
    annotations: { readOnlyHint: true, destructiveHint: false },
    scopes: (args) =>
      args.type === "mail" ? ["needt.read", "mail.read"] : ["needt.read"],
    input: z.object({
      type: z.enum(LIST_TYPES),
      limit: z.number().int().min(1).max(MCP_LIST_LIMIT_MAX).default(25),
      cursor: z
        .string()
        .optional()
        .describe("nextCursor from the previous page."),
      includeArchived: z
        .boolean()
        .optional()
        .describe(
          "Include archived tasks, projects, events, calendars and habits."
        ),
      from: z
        .string()
        .optional()
        .describe("Events only: ISO 8601 lower bound on event end."),
      to: z
        .string()
        .optional()
        .describe("Events only: ISO 8601 upper bound on event start."),
      originPageId: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Tasks only: the ones that came from this page (a to-do ticked in a document)."
        ),
    }),
    async invoke(ctx, args) {
      const access = await readAccess(ctx);
      if ("error" in access) return access.error;
      return toolResult(await listRows(args.type, ctx, access.workspace, args));
    },
  }),
  defineTool({
    name: "needt_get",
    description:
      "Read one object in full by type and id: task (with scheduled blocks and its subtasks in order, plus entry and dependsOnId), project, event, calendar, page (with blocks), habit, or mail (metadata only: sender, subject, snippet, labels — no body), or moodboard (title and your access role).",
    annotations: { readOnlyHint: true, destructiveHint: false },
    scopes: (args) =>
      args.type === "mail" ? ["needt.read", "mail.read"] : ["needt.read"],
    input: z.object({ type: z.enum(LIST_TYPES), id: z.string().min(1) }),
    async invoke(ctx, args) {
      const access = await readAccess(ctx);
      if ("error" in access) return access.error;
      const row = await getRow(args.type, args.id, ctx, access.workspace);
      if (!row) {
        return toolError({ status: 404, error: `${args.type} not found` });
      }
      return toolResult(row);
    },
  }),
  defineTool({
    name: "needt_create_task",
    description: `Create an auto-scheduled task, with its subtasks in the same call. Needt runs the scheduler immediately and returns the task with its scheduled blocks and subtasks. ${SUBTASK_GUIDANCE} Subtasks are plain titles (or { title, done }) and keep the order you give. Put the task in a project with projectId (from needt_list type project).`,
    annotations: { readOnlyHint: false, destructiveHint: false },
    input: z.object({
      title: z
        .string()
        .min(1)
        .describe("The closing step: what is true once everything is done."),
      description: z.string().optional(),
      estimatedMinutes: z.number().int().min(1).optional(),
      deadline: z
        .string()
        .optional()
        .describe("ISO 8601 deadline, also used as due date."),
      priorityLevel: priorityOrNone
        .optional()
        .describe("NONE leaves the task without a priority."),
      recurrenceRule: repeatRule.optional(),
      labelIds: labelIds.optional(),
      scheduleId: z
        .string()
        .min(1)
        .optional()
        .describe("Hours: the id of one of your work schedules."),
      energyRequired: energy.optional(),
      contextTag: z.string().optional(),
      projectId: z
        .string()
        .min(1)
        .optional()
        .describe("An active project in this workspace."),
      entry: entrySchema
        .optional()
        .describe("The very first small step, about two minutes."),
      fullTime: z
        .boolean()
        .optional()
        .describe(
          "Do for the full time: a focus session on it runs its whole length instead of ending when the task is ticked. Leave unset for auto (on for habit and repeating tasks)."
        ),
      subtasks: subtaskListSchema
        .optional()
        .describe(
          "Steps in the order they are done, after the entry step and before this task. Up to 30."
        ),
      dependsOnId: z
        .string()
        .min(1)
        .optional()
        .describe("Id of an existing open task this one cannot start before."),
      originPageId: z
        .string()
        .min(1)
        .optional()
        .describe(
          "A page in this workspace the task came from; the page's to-do and the task then tick together."
        ),
    }),
    invoke: (ctx, args) =>
      callRoute(ctx, createTaskPost, "/api/connect/tasks", "POST", args),
  }),
  defineTool({
    name: "needt_schedule",
    description:
      "Return the upcoming schedule. With run: true (default) Needt re-runs the scheduler first, which can move auto-scheduled tasks.",
    annotations: { readOnlyHint: false, destructiveHint: false },
    scopes: (args) => (args.run ? ["needt.write"] : ["needt.read"]),
    input: z.object({ run: z.boolean().default(true) }),
    invoke: (ctx, args) =>
      args.run
        ? callRoute(ctx, schedulePost, "/api/connect/schedule", "POST")
        : callRoute(ctx, scheduleGet, "/api/connect/schedule", "GET"),
  }),
  defineTool({
    name: "needt_reschedule",
    description:
      "Re-run the scheduler and send the schedule.changed webhook if one is configured.",
    annotations: { readOnlyHint: false, destructiveHint: false },
    input: z.object({}),
    invoke: (ctx) =>
      callRoute(ctx, reschedulePost, "/api/connect/reschedule", "POST"),
  }),
  defineTool({
    name: "needt_control",
    description:
      "Change Needt projects, tasks, local calendars and events. Use action: overview to inspect the workspace. delete_* actions archive the object and require confirm: true; restore_* brings it back.",
    annotations: { readOnlyHint: false, destructiveHint: true },
    // The overview only reads; every other action writes.
    scopes: (args) =>
      args.action === "overview" ? ["needt.read"] : ["needt.write"],
    input: z.object({
      action: z.enum(CONNECTOR_CONTROL_ACTIONS),
      id: z.string().optional(),
      title: z.string().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      status: z.string().optional(),
      color: z.string().optional(),
      icon: z.string().optional(),
      location: z.string().optional(),
      allDay: z.boolean().optional(),
      start: z.string().optional().describe("ISO 8601"),
      end: z.string().optional().describe("ISO 8601"),
      feedId: z.string().optional(),
      projectId: z.string().nullable().optional(),
      confirm: z.boolean().optional(),
    }),
    invoke: (ctx, args) =>
      callRoute(ctx, controlPost, "/api/connect/control", "POST", args),
  }),
];

const taskStatus = z.enum([
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.COMPLETED,
]);
const isoDate = z.string().min(1);
const pageText = z
  .string()
  .min(1)
  .max(PAGE_TEXT_MAX_LENGTH)
  .describe(
    "Body text. Markdown headings (#, ##, ###), -, 1. and - [ ] lists, > quotes, ``` code and --- rules become blocks; inline formatting stays as text."
  );
const pageFormat = z
  .enum(["markdown", "plain"])
  .default("markdown")
  .describe("plain: one paragraph per line.");

async function updateTask(
  ctx: McpToolContext,
  taskId: string,
  patch: TaskFieldPatch
): Promise<McpToolResult> {
  const access = await writeAccess(ctx);
  if ("error" in access) return access.error;
  const result = await updateTaskFields({
    userId: ctx.userId,
    workspace: access.workspace,
    taskId,
    patch,
  });
  return result.ok
    ? toolResult({ changed: result.changed, task: result.task })
    : toolError({ status: result.status, error: result.error });
}

/** Page write-path refusals the caller can act on, as tool errors. */
function pageWriteError(error: unknown): McpToolResult {
  if (error instanceof PageCollaborationActiveError) {
    return toolError({
      status: 409,
      error:
        "This page is open for live editing in Needt. Try again once it is closed.",
    });
  }
  if (error instanceof PageRevisionConflictError) {
    return toolError({
      status: 409,
      error: "The page changed while writing. Try again.",
    });
  }
  if (error instanceof Error && error.message === "Parent page not found") {
    return toolError({ status: 404, error: error.message });
  }
  if (error instanceof Error && error.message === "Page has too many blocks") {
    return toolError({ status: 413, error: error.message });
  }
  throw error;
}

function pageSummary(
  written: {
    id: string;
    title: string;
    parentId: string | null;
    contentRevision: number;
    blocks: unknown[];
  },
  appendedBlocks: number
) {
  return {
    id: written.id,
    title: written.title,
    parentId: written.parentId,
    contentRevision: written.contentRevision,
    blockCount: written.blocks.length,
    appendedBlocks,
  };
}

const WRITE_TOOLS: McpTool[] = [
  defineTool(
    {
      name: "needt_update_task",
      description:
        "Change a task: title, description, dueDate, deadline, estimatedMinutes, priority (NONE clears it), energy, status, projectId, entry (its first step), fullTime (do for the full time), dependsOnId (the one open task it waits on), originPageId (the page it came from), recurrenceRule (an RRULE; null stops the repeat), labelIds (the full set of labels) or scheduleId (its work hours). Only these fields are accepted. Files are added with needt_attach_file. Subtasks are changed with needt_add_subtasks and needt_complete_subtask. Needt re-runs the scheduler afterwards.",
      annotations: { readOnlyHint: false, destructiveHint: false },
      input: z
        .object({
          id: z.string().min(1).describe("Task id."),
          title: z.string().min(1).max(500).optional(),
          description: z.string().max(20_000).nullable().optional(),
          dueDate: isoDate
            .nullable()
            .optional()
            .describe(
              "ISO 8601; null clears it. Moves the deadline too when the two were equal."
            ),
          deadline: isoDate
            .nullable()
            .optional()
            .describe(
              "ISO 8601 hard deadline the scheduler must beat; null clears it. Set it only to make it differ from dueDate."
            ),
          estimatedMinutes: z
            .number()
            .int()
            .min(1)
            .max(24 * 60)
            .nullable()
            .optional(),
          priority: priorityOrNone.optional(),
          recurrenceRule: repeatRule.nullable().optional(),
          labelIds: labelIds.optional(),
          scheduleId: z
            .string()
            .min(1)
            .nullable()
            .optional()
            .describe(
              "Hours: one of your work schedule ids; null = the default."
            ),
          energy: energy.optional(),
          status: taskStatus.optional(),
          projectId: z
            .string()
            .min(1)
            .nullable()
            .optional()
            .describe("Project in the same workspace; null removes it."),
          entry: entrySchema
            .nullable()
            .optional()
            .describe("The very first small step; null clears it."),
          fullTime: z
            .boolean()
            .nullable()
            .optional()
            .describe(
              "Do for the full time: true keeps a focus session running its whole length when the task is ticked, false ends it at once; null = auto (on for habit and repeating tasks)."
            ),
          dependsOnId: z
            .string()
            .min(1)
            .nullable()
            .optional()
            .describe(
              "Id of an open task this one waits on; null clears it. Loops are refused."
            ),
          originPageId: z
            .string()
            .min(1)
            .nullable()
            .optional()
            .describe("The page the task came from; null detaches it."),
        })
        .strict(),
      async invoke(ctx, args) {
        const dueDate =
          args.dueDate == null ? args.dueDate : newDate(args.dueDate);
        if (dueDate && Number.isNaN(dueDate.getTime())) {
          return toolError({ status: 400, error: "dueDate must be ISO 8601" });
        }
        const deadline =
          args.deadline == null ? args.deadline : newDate(args.deadline);
        if (deadline && Number.isNaN(deadline.getTime())) {
          return toolError({ status: 400, error: "deadline must be ISO 8601" });
        }
        return updateTask(ctx, args.id, {
          title: args.title,
          description: args.description,
          dueDate,
          deadline,
          estimatedMinutes: args.estimatedMinutes,
          ...(args.priority === "NONE"
            ? { noPriority: true }
            : { priorityLevel: args.priority }),
          recurrenceRule: args.recurrenceRule,
          tagIds: args.labelIds,
          scheduleId: args.scheduleId,
          energyRequired: args.energy,
          status: args.status,
          projectId: args.projectId,
          entry: args.entry,
          fullTime: args.fullTime,
          dependsOnId: args.dependsOnId,
          originPageId: args.originPageId,
        });
      },
    },
    ["tasks-updated"]
  ),
  defineTool({
    name: "needt_attach_file",
    description:
      "Attach a file to a task: an image (JPEG, PNG, WebP, GIF) or a PDF, up to 4 MB, ten per task. contentBase64 holds the file's bytes; the type is read from them, not from the name. The undo id comes back in the answer.",
    annotations: { readOnlyHint: false, destructiveHint: false },
    input: z
      .object({
        taskId: z.string().min(1),
        name: z.string().min(1).max(240).describe("File name to show."),
        contentBase64: z.string().min(1),
      })
      .strict(),
    invoke: (ctx, args) =>
      callRoute(
        ctx,
        (req) =>
          opsPost(req, { params: Promise.resolve({ name: "task.attach" }) }),
        "/api/connect/ops/task.attach",
        "POST",
        args
      ),
  }),
  defineTool({
    name: "needt_remove_attachment",
    description:
      "Remove a file from a task. The file is deleted and cannot be brought back, so it needs confirm: true. Attachment ids are in needt_get type task.",
    annotations: { readOnlyHint: false, destructiveHint: true },
    input: z
      .object({
        taskId: z.string().min(1),
        attachmentId: z.string().min(1),
        confirm: z.boolean().optional(),
      })
      .strict(),
    invoke: (ctx, args) => {
      if (args.confirm !== true) {
        return Promise.resolve(
          toolError({
            status: 400,
            error: "Removing a file cannot be undone. Pass confirm: true.",
          })
        );
      }
      return callRoute(
        ctx,
        (req) =>
          opsPost(req, { params: Promise.resolve({ name: "task.detach" }) }),
        "/api/connect/ops/task.detach",
        "POST",
        { taskId: args.taskId, attachmentId: args.attachmentId }
      );
    },
  }),
  defineTool(
    {
      name: "needt_add_subtasks",
      description: `Add subtasks to an existing task, after the ones it already has. ${SUBTASK_GUIDANCE} Returns the new subtasks in order. Ticking them is needt_complete_subtask; the task itself is closed last with needt_complete_task.`,
      annotations: { readOnlyHint: false, destructiveHint: false },
      input: z
        .object({
          taskId: z.string().min(1).describe("Task id (the closing step)."),
          subtasks: subtaskListSchema
            .min(1)
            .describe("Steps in the order they are done."),
        })
        .strict(),
      async invoke(ctx, args) {
        const access = await writeAccess(ctx);
        if ("error" in access) return access.error;
        const result = await appendSubtasks({
          userId: ctx.userId,
          workspace: access.workspace,
          taskId: args.taskId,
          subtasks: normalizeSubtasks(args.subtasks),
        });
        return result.ok
          ? toolResult({ subtasks: result.subtasks })
          : toolError({ status: result.status, error: result.error });
      },
    },
    ["tasks-updated"]
  ),
  defineTool(
    {
      name: "needt_complete_subtask",
      description:
        "Tick a subtask done, or not done with done: false. Safe to repeat. The answer says allDone: true when no subtask is left open; then the task itself is the last step, so close it with needt_complete_task.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      input: z
        .object({
          taskId: z.string().min(1).describe("Task id the subtask belongs to."),
          subtaskId: z
            .string()
            .min(1)
            .describe("Subtask id, from needt_get type task."),
          done: z.boolean().default(true),
        })
        .strict(),
      async invoke(ctx, args) {
        const access = await writeAccess(ctx);
        if ("error" in access) return access.error;
        const result = await setSubtaskDone({
          userId: ctx.userId,
          workspace: access.workspace,
          taskId: args.taskId,
          subtaskId: args.subtaskId,
          done: args.done,
        });
        return result.ok
          ? toolResult({
              subtask: result.subtask,
              open: result.open,
              allDone: result.allDone,
            })
          : toolError({ status: result.status, error: result.error });
      },
    },
    ["tasks-updated"]
  ),
  defineTool(
    {
      name: "needt_complete_task",
      description:
        "Mark a task done, or not done with done: false. Safe to repeat: a task already in that state is returned unchanged. Completing a recurring task moves it to its next occurrence.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      input: z.object({
        id: z.string().min(1).describe("Task id."),
        done: z.boolean().default(true),
      }),
      invoke: (ctx, args) =>
        updateTask(ctx, args.id, {
          status: args.done ? TaskStatus.COMPLETED : TaskStatus.TODO,
        }),
    },
    ["tasks-updated"]
  ),
  defineTool(
    {
      name: "needt_create_event",
      description:
        "Create an event in a Needt calendar (the first one when feedId is omitted; synced Google, Outlook and CalDAV calendars are refused). Events are personal, so this works in the personal workspace only.",
      annotations: { readOnlyHint: false, destructiveHint: false },
      input: z.object({
        title: z.string().min(1).max(500),
        start: isoDate.describe("ISO 8601 start."),
        end: isoDate.describe("ISO 8601 end, after start."),
        allDay: z.boolean().optional(),
        location: z.string().max(1000).optional(),
        description: z.string().max(20_000).optional(),
        feedId: z
          .string()
          .min(1)
          .optional()
          .describe("A Needt calendar id from needt_list type calendar."),
      }),
      async invoke(ctx, args) {
        const access = await writeAccess(ctx);
        if ("error" in access) return access.error;
        if (access.workspace.workspaceKind !== WorkspaceKind.PERSONAL) {
          return toolError({
            status: 403,
            error:
              "Personal calendar actions are unavailable in shared workspaces.",
          });
        }
        const created = await createLocalEvent(ctx.userId, args);
        return created.ok
          ? toolResult(created.event)
          : toolError({ status: created.status, error: created.error });
      },
    },
    ["calendar-updated"]
  ),
  defineTool({
    name: "needt_create_personal_time",
    description:
      "Keep time for the person: lunch, break, walk, dinner, gym, party, rest or a custom block. No task is ever scheduled inside it. Give start (ISO 8601) and end or minutes (a preset kind has a usual length); rrule repeats it (e.g. FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR). Needt keeps it; nothing is written to Google or iCloud. Personal workspace only. The answer carries actionId for undo.",
    annotations: { readOnlyHint: false, destructiveHint: false },
    input: z.object({
      kind: z
        .enum([
          "lunch",
          "break",
          "walk",
          "dinner",
          "gym",
          "party",
          "rest",
          "custom",
        ])
        .optional(),
      title: z.string().min(1).max(120).optional(),
      emoji: z.string().min(1).max(16).optional(),
      color: z.enum(["info", "success", "neutral"]).optional(),
      start: isoDate.describe("ISO 8601 start."),
      end: isoDate.optional().describe("ISO 8601 end, after start."),
      minutes: z.number().int().min(5).max(1440).optional(),
      rrule: repeatRule.optional(),
    }),
    invoke: (ctx, args) =>
      callRoute(
        ctx,
        (req) =>
          opsPost(req, {
            params: Promise.resolve({ name: "personal.create" }),
          }),
        "/api/connect/ops/personal.create",
        "POST",
        args
      ),
  }),
  defineTool({
    name: "needt_mark_event_personal",
    description:
      "Mark a calendar event (synced or your own) as personal time. Needt keeps a block linked to it, so no task is scheduled over it and it follows the event if it moves. The event itself is not changed. Find the id with needt_list type event.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
    input: z.object({
      eventId: z.string().min(1),
      kind: z
        .enum(["lunch", "break", "walk", "dinner", "gym", "party", "rest"])
        .optional(),
      title: z.string().min(1).max(120).optional(),
    }),
    invoke: (ctx, args) =>
      callRoute(
        ctx,
        (req) =>
          opsPost(req, {
            params: Promise.resolve({ name: "personal.mark_event" }),
          }),
        "/api/connect/ops/personal.mark_event",
        "POST",
        args
      ),
  }),
  defineTool({
    name: "needt_update_personal_time",
    description:
      "Change a personal time block: title, emoji, tint (info, success, neutral), start, end or rrule (null stops the repeat). The answer carries actionId for undo.",
    annotations: { readOnlyHint: false, destructiveHint: false },
    input: z.object({
      id: z.string().min(1).describe("Personal time block id."),
      title: z.string().min(1).max(120).optional(),
      emoji: z.string().min(1).max(16).nullable().optional(),
      color: z.enum(["info", "success", "neutral"]).nullable().optional(),
      start: isoDate.optional(),
      end: isoDate.optional(),
      rrule: repeatRule.nullable().optional(),
    }),
    invoke: (ctx, { id, ...rest }) =>
      callRoute(
        ctx,
        (req) =>
          opsPost(req, {
            params: Promise.resolve({ name: "personal.update" }),
          }),
        "/api/connect/ops/personal.update",
        "POST",
        { blockId: id, ...rest }
      ),
  }),
  defineTool({
    name: "needt_delete_personal_time",
    description:
      "Remove a personal time block (a repeat goes entirely). It is kept, so the actionId in the answer undoes it. The linked calendar event, if any, is untouched.",
    annotations: { readOnlyHint: false, destructiveHint: true },
    input: z.object({ id: z.string().min(1).describe("Block id.") }),
    invoke: (ctx, args) =>
      callRoute(
        ctx,
        (req) =>
          opsPost(req, {
            params: Promise.resolve({ name: "personal.delete" }),
          }),
        "/api/connect/ops/personal.delete",
        "POST",
        { blockId: args.id }
      ),
  }),
  defineTool(
    {
      name: "needt_create_page",
      description:
        "Create a page in the active workspace, optionally under a parent page you can edit, with an optional Markdown or plain-text body.",
      annotations: { readOnlyHint: false, destructiveHint: false },
      input: z.object({
        title: z.string().min(1).max(240),
        body: pageText.optional(),
        format: pageFormat,
        parentId: z.string().min(1).optional().describe("Parent page id."),
      }),
      async invoke(ctx, args) {
        const access = await writeAccess(ctx);
        if ("error" in access) return access.error;
        const actor = { userId: ctx.userId, workspace: access.workspace };
        const blocks = args.body
          ? pageBlocksFromText(args.body, args.format)
          : [];
        try {
          const created = await createPage(actor, {
            title: args.title,
            parentId: args.parentId ?? null,
            createdBy: PageAuthor.AI,
          });
          const written = blocks.length
            ? await writePageBlocks(
                actor,
                created.id,
                blocks.map((block, index) => ({
                  ...block,
                  position: (index + 1) * 1024,
                })),
                PageAuthor.AI,
                1,
                created.contentRevision
              )
            : created;
          return toolResult(pageSummary(written ?? created, blocks.length));
        } catch (error) {
          return pageWriteError(error);
        }
      },
    },
    ["docs-updated"]
  ),
  defineTool(
    {
      name: "needt_append_page",
      description:
        "Append Markdown or plain text to the end of a page you can edit. Earlier content is kept, and the previous version stays in the page history.",
      annotations: { readOnlyHint: false, destructiveHint: false },
      input: z.object({
        id: z.string().min(1).describe("Page id."),
        text: pageText,
        format: pageFormat,
      }),
      async invoke(ctx, args) {
        const access = await writeAccess(ctx);
        if ("error" in access) return access.error;
        const blocks = pageBlocksFromText(args.text, args.format);
        if (blocks.length === 0) {
          return toolError({ status: 400, error: "text has no content" });
        }
        try {
          const written = await appendPageBlocks(
            { userId: ctx.userId, workspace: access.workspace },
            args.id,
            blocks,
            PageAuthor.AI
          );
          if (!written) {
            return toolError({
              status: 404,
              error: "Page not found, or you cannot edit it.",
            });
          }
          return toolResult(pageSummary(written, blocks.length));
        } catch (error) {
          return pageWriteError(error);
        }
      },
    },
    ["docs-updated"]
  ),
  defineTool(
    {
      name: "needt_log_habit",
      description:
        "Mark a habit kept for a day (today in your time zone by default), or not kept with kept: false. Safe to repeat. Future days are refused.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      input: z.object({
        id: z.string().min(1).describe("Habit id."),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("yyyy-MM-dd in your time zone; today when omitted."),
        kept: z.boolean().default(true),
      }),
      async invoke(ctx, args) {
        const access = await writeAccess(ctx);
        if ("error" in access) return access.error;
        try {
          const result = await setHabitCompletionToday({
            userId: ctx.userId,
            workspace: access.workspace,
            habitId: args.id,
            completed: args.kept,
            dateKey: args.date,
          });
          if (!result) {
            return toolError({ status: 404, error: "Habit not found" });
          }
          return toolResult({
            habitId: result.habitId,
            date: result.date,
            kept: result.completed,
          });
        } catch (error) {
          if (error instanceof HabitCompletionDateError) {
            return toolError({ status: 400, error: error.message });
          }
          throw error;
        }
      },
    },
    ["tasks-updated"]
  ),
  defineTool({
    name: "needt_list_memories",
    description:
      'What Needt has learned about the person ("Let Needt learn about me"): each line with its kind, source (chat, habit, document, mail) and dates, and whether the switch is on. Readable with the switch off; while it is off nothing here is used. The switch itself is turned on or off only in the app.',
    annotations: { readOnlyHint: true, destructiveHint: false },
    input: z.object({}),
    async invoke(ctx) {
      const access = await readAccess(ctx);
      if ("error" in access) return access.error;
      const [enabled, memories] = await Promise.all([
        isLearningEnabled(ctx.userId),
        listAgentMemories(ctx.userId, access.workspace.workspaceId),
      ]);
      return toolResult({ enabled, memories: memories.map(publicMemory) });
    },
  }),
  defineTool({
    name: "needt_update_memory",
    description:
      "Edit one memory line (its text or kind). An edited line is the person's own and is no longer replaced by later learning.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
    input: z.object({
      id: z.string().min(1).describe("Memory id from needt_list_memories."),
      content: z.string().trim().min(3).max(500).optional(),
      kind: z.enum(["preference", "pattern", "goal", "fact"]).optional(),
    }),
    async invoke(ctx, args) {
      if (args.content === undefined && !args.kind) {
        return toolError({ status: 400, error: "Pass content or kind." });
      }
      const access = await writeAccess(ctx);
      if ("error" in access) return access.error;
      try {
        const memory = await updateMemoryForUser(
          ctx.userId,
          access.workspace.workspaceId,
          args.id,
          { content: args.content, kind: args.kind }
        );
        if (!memory)
          return toolError({ status: 404, error: "Memory not found" });
        return toolResult({ memory: publicMemory(memory) });
      } catch {
        return toolError({
          status: 400,
          error: "That cannot be saved as a memory.",
        });
      }
    },
  }),
  defineTool({
    name: "needt_forget_memory",
    description:
      "Delete one memory by id, or every memory in the workspace with all: true and confirm: true. Cannot be undone.",
    annotations: { readOnlyHint: false, destructiveHint: true },
    input: z.object({
      id: z.string().min(1).optional(),
      all: z.boolean().optional(),
      confirm: z
        .boolean()
        .optional()
        .describe("Must be true to delete everything with all: true."),
    }),
    async invoke(ctx, args) {
      const access = await writeAccess(ctx);
      if ("error" in access) return access.error;
      const workspaceId = access.workspace.workspaceId;
      if (args.all) {
        if (args.confirm !== true) {
          return toolError({
            status: 400,
            error: "Deleting every memory needs confirm: true.",
          });
        }
        const result = await clearAgentMemories(ctx.userId, workspaceId);
        return toolResult({ deleted: result.count });
      }
      if (!args.id) {
        return toolError({
          status: 400,
          error: "Pass id, or all with confirm.",
        });
      }
      const deleted = await forgetForUser(ctx.userId, workspaceId, args.id);
      if (!deleted)
        return toolError({ status: 404, error: "Memory not found" });
      return toolResult({ deleted: 1 });
    },
  }),
];

MCP_TOOLS.push(...WRITE_TOOLS);

/**
 * Focus blocking: profiles of sites and apps that the browser extension and
 * the Mac app block while a focus session, a matching calendar event or a
 * task block of a chosen project is under way. Pro, behind `focus_blocking`.
 */
MCP_TOOLS.push(
  defineTool({
    name: "needt_blocking",
    description:
      "Focus blocking. view 'active' (default): what is blocked right now — mode (BLOCKLIST blocks the sites and apps listed, ALLOWLIST blocks everything else), sites, apps, until, and which profiles hold and why. view 'profiles': every blocking profile with its triggers. Pro.",
    annotations: { readOnlyHint: true, destructiveHint: false },
    input: z.object({
      view: z.enum(["active", "profiles"]).default("active"),
    }),
    invoke: (ctx, args) =>
      args.view === "profiles"
        ? callRoute(ctx, blockingProfilesGet, "/api/blocking/profiles", "GET")
        : callRoute(ctx, blockingActiveGet, "/api/blocking/active", "GET"),
  }),
  defineTool({
    name: "needt_blocking_profile",
    description:
      "Create, change or delete a focus blocking profile. A profile blocks its sites (host names, '*.example.com' for subdomains) and macOS apps (bundle ids) while any trigger holds: onFocusSession (a focus session runs), eventKeywords (a calendar event whose title contains one), calendarFeedIds (any event on those calendars), projectIds (a scheduled block of a task in those projects). mode ALLOWLIST blocks everything except the lists. update changes only the fields given. Pro.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
    input: z.object({
      action: z.enum(["create", "update", "delete"]),
      id: z
        .string()
        .min(1)
        .optional()
        .describe("Profile id, for update and delete."),
      name: blockingProfileFields.name.optional(),
      sites: z.array(z.string()).optional(),
      apps: z.array(z.string()).optional(),
      mode: z.enum(["BLOCKLIST", "ALLOWLIST"]).optional(),
      onFocusSession: z.boolean().optional(),
      eventKeywords: z.array(z.string()).optional(),
      calendarFeedIds: z.array(z.string()).optional(),
      projectIds: z.array(z.string()).optional(),
      enabled: z.boolean().optional(),
    }),
    async invoke(ctx, args) {
      const { action, id, ...fields } = args;
      if (action === "create") {
        return callRoute(
          ctx,
          blockingProfilesPost,
          "/api/blocking/profiles",
          "POST",
          fields
        );
      }
      if (!id) return toolError({ status: 400, error: "id is required" });
      const path = `/api/blocking/profiles/${encodeURIComponent(id)}`;
      return action === "delete"
        ? callRoute(ctx, blockingProfileDelete, path, "DELETE", undefined, {
            id,
          })
        : callRoute(ctx, blockingProfilePatch, path, "PATCH", fields, { id });
    },
  })
);

MCP_TOOLS.unshift(
  defineTool({
    name: "needt_whoami",
    description:
      "Who this connection acts for: the person, the token kind (personal or OAuth), its scopes, and the workspace calls act in by default. Lists the person's workspaces so later calls can pass workspaceId.",
    annotations: { readOnlyHint: true, destructiveHint: false },
    scopes: () => [],
    input: z.object({}),
    async invoke(ctx) {
      const [user, memberships] = await Promise.all([
        prisma.user.findUnique({
          where: { id: ctx.userId },
          select: { id: true, name: true, email: true },
        }),
        prisma.workspaceMember.findMany({
          where: { userId: ctx.userId },
          select: {
            role: true,
            workspace: { select: { id: true, name: true, kind: true } },
          },
        }),
      ]);
      const access = await readAccess(ctx);
      return toolResult({
        user,
        token: {
          kind: ctx.auth.kind,
          scopes: ctx.auth.scopes,
          clientId: ctx.auth.clientId ?? null,
          boundWorkspaceId: ctx.auth.workspaceId ?? null,
        },
        workspace:
          "workspace" in access
            ? {
                id: access.workspace.workspaceId,
                kind: access.workspace.workspaceKind,
                role: access.workspace.role,
              }
            : null,
        // An OAuth grant sees only the workspace it was given.
        workspaces: memberships
          .filter(
            (m) =>
              !ctx.auth.workspaceId || m.workspace.id === ctx.auth.workspaceId
          )
          .map((m) => ({ ...m.workspace, role: m.role })),
      });
    },
  })
);

/** Every tool also takes an optional workspaceId (see McpToolContext). */
const WORKSPACE_ARG = z
  .string()
  .min(1)
  .optional()
  .describe(
    "Workspace to act in (from needt_whoami). Defaults to the connection's workspace, else the personal one."
  );

function inputWithWorkspace(tool: McpTool): z.ZodTypeAny {
  return tool.input instanceof z.ZodObject
    ? tool.input.extend({ workspaceId: WORKSPACE_ARG })
    : tool.input;
}

export function findMcpTool(name: unknown): McpTool | undefined {
  const tool = MCP_TOOLS.find((candidate) => candidate.name === name);
  return tool ? { ...tool, input: inputWithWorkspace(tool) } : undefined;
}

/** The scopes a call needs, from the tool's own rule or its read/write kind. */
export function requiredScopes(tool: McpTool, args: unknown): McpScope[] {
  if (tool.scopes) return tool.scopes(args as never);
  return tool.annotations.readOnlyHint ? ["needt.read"] : ["needt.write"];
}

/**
 * Whether this call changes something: decided per call, not per tool, so
 * needt_control's overview or needt_schedule with run: false are reads and
 * stay outside the write limit.
 */
export function isWriteCall(tool: McpTool, args: unknown): boolean {
  return requiredScopes(tool, args).includes("needt.write");
}

export function listMcpTools(): {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: McpToolAnnotations;
}[] {
  return MCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(inputWithWorkspace(tool)),
    annotations: tool.annotations,
  }));
}
