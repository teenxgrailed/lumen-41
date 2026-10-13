import { NextRequest } from "next/server";

import { POST as controlPost } from "@/app/api/connect/control/route";
import { POST as reschedulePost } from "@/app/api/connect/reschedule/route";
import {
  GET as scheduleGet,
  POST as schedulePost,
} from "@/app/api/connect/schedule/route";
import { POST as createTaskPost } from "@/app/api/connect/tasks/route";
import { authorizeConnectorWorkspace } from "@/services/connectors/auth";
import type { BearerAuth } from "@/services/connectors/bearer";
import { CONNECTOR_CONTROL_ACTIONS } from "@/services/connectors/control-actions";
import { getPage, listPages } from "@/services/pages/page-service";
import {
  SEARCHABLE_TYPES,
  searchWorkspace,
} from "@/services/search/workspace-search";
import { WorkspaceKind, WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import {
  WORKSPACE_HEADER,
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { listMailMessages } from "@/lib/mail-db";
import type { McpScope } from "@/lib/mcp-config";
import { prisma } from "@/lib/prisma";

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

function defineTool<S extends z.ZodTypeAny>(tool: McpTool<S>): McpTool {
  return tool as unknown as McpTool;
}

export function toolResult(payload: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

export function toolError(payload: unknown): McpToolResult {
  return { ...toolResult(payload), isError: true };
}

type RouteHandler = (request: NextRequest) => Promise<Response | undefined>;

/**
 * Runs an existing connector route in-process with the caller's own
 * Authorization and workspace headers, so authentication, workspace scoping
 * and confirmation rules stay defined once, in the route.
 */
async function callRoute(
  ctx: McpToolContext,
  handler: RouteHandler,
  path: string,
  method: "GET" | "POST",
  body?: unknown
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
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    })
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

async function readAccess(
  ctx: McpToolContext
): Promise<{ workspace: WorkspaceAccess } | { error: McpToolResult }> {
  const auth = await authorizeConnectorWorkspace(
    ctx.request,
    ctx.userId,
    WorkspaceRole.VIEWER,
    { workspaceId: ctx.workspaceId, boundWorkspaceId: ctx.auth.workspaceId }
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

const LIST_TYPES = [
  "task",
  "project",
  "event",
  "calendar",
  "page",
  "habit",
  "mail",
] as const;
type ListType = (typeof LIST_TYPES)[number];

const calendarSelect = {
  id: true,
  name: true,
  type: true,
  color: true,
  enabled: true,
  lastSync: true,
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
        await prisma.task.findMany({
          where: {
            ...scope,
            ...(args.includeArchived ? {} : { isArchived: false }),
          },
          orderBy: order,
          take,
          ...cursorArgs(args.cursor),
        }),
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
    case "page": {
      const rows = await listPages({ userId, workspace });
      const start = args.cursor
        ? rows.findIndex((row) => row.id === args.cursor) + 1
        : 0;
      return page(rows.slice(start, start + take), args.limit);
    }
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
    case "task":
      return prisma.task.findFirst({
        where: { id, ...scope },
        include: { scheduledBlocks: { orderBy: { chunkIndex: "asc" } } },
      });
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
  }
}

const priority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const energy = z.enum(["LOW", "MEDIUM", "HIGH"]);

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
      "List objects of one type from the active Needt workspace, newest first, with cursor pagination. Types: task, project, event, calendar, page, habit, mail.",
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
      "Read one object in full by type and id: task (with scheduled blocks), project, event, calendar, page (with blocks), habit, or mail (metadata only: sender, subject, snippet, labels — no body).",
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
    description:
      "Create an auto-scheduled task. Needt runs the scheduler immediately and returns the task with its scheduled blocks.",
    annotations: { readOnlyHint: false, destructiveHint: false },
    input: z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      estimatedMinutes: z.number().int().min(1).optional(),
      deadline: z
        .string()
        .optional()
        .describe("ISO 8601 deadline, also used as due date."),
      priorityLevel: priority.optional(),
      energyRequired: energy.optional(),
      contextTag: z.string().optional(),
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
        workspaces: memberships.map((m) => ({ ...m.workspace, role: m.role })),
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
