import { planMyDay } from "@/services/ai/plan-day";
import {
  RETRIEVAL_TYPES,
  type RetrievalType,
  fetchObject,
  hrefFor,
  searchData,
} from "@/services/ai/retrieval";
import { OpError, runOp } from "@/services/ops";
import {
  nextDayKey,
  startOfZonedDay,
  userTimeZone,
} from "@/services/ops/helpers";
import type { PageActor } from "@/services/pages/page-service";
import { WorkspaceKind } from "@prisma/client";
import { z } from "zod";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { canPlanMyDay } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

import { zodToJsonSchema } from "../../ops/json-schema";
import type { AIChatToolDefinition, SchedulerAI } from "../types";

/**
 * The agent's own tools. Every write goes through `runOp`, so each one is an
 * AgentAction with a stored inverse and can be undone, singly or as a run.
 * Reads are plain. Anything that destroys something asks first.
 */

export interface AgentActionRef {
  actionId: string;
  /** Past tense, shown in the list of what Ask did. */
  label: string;
  href?: string;
  undoable: boolean;
}

export interface AgentSource {
  type: string;
  id: string;
  title: string;
  href: string;
}

export interface AgentToolContext {
  ai: SchedulerAI;
  userId: string;
  workspace: WorkspaceAccess;
  pageActor: PageActor;
  /** Opens the run on first use, so a read-only turn leaves no run behind. */
  runId: () => Promise<string>;
}

export interface AgentToolOutcome {
  ok: boolean;
  /** One short line for the person, past tense. */
  summary: string;
  /** What the model reads back; compact. */
  modelText: string;
  action?: AgentActionRef;
  sources?: AgentSource[];
  /** The tool asks before it acts. */
  confirm?: { prompt: string };
  /** Planner data may have changed. */
  changed: boolean;
  taskId?: string;
}

export interface AgentTool {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  /** destructive tools never run without the person's yes. */
  kind: "read" | "write" | "destructive";
  /** Shown while it runs. */
  progress: string;
  run(
    ctx: AgentToolContext,
    args: Record<string, unknown>,
    options: { confirmed: boolean }
  ): Promise<AgentToolOutcome>;
}

const MODEL_TEXT_MAX = 6000;

export function modelJson(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > MODEL_TEXT_MAX
    ? `${text.slice(0, MODEL_TEXT_MAX)}…(truncated; narrow the request)`
    : text;
}

function failure(message: string): AgentToolOutcome {
  return {
    ok: false,
    summary: message,
    modelText: modelJson({ ok: false, error: message }),
    changed: false,
  };
}

export function outcomeFromError(error: unknown): AgentToolOutcome {
  if (error instanceof OpError) return failure(error.message);
  throw error;
}

type TaskLike = {
  id: string;
  title: string;
  status?: string;
  dueDate?: string | null;
  deadline?: string | null;
  priority?: string;
  estimateMinutes?: number | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  projectId?: string | null;
  href?: string;
};

/** The few task fields the model needs; the rest only costs tokens. */
function briefTask(task: TaskLike) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    due: task.dueDate ?? undefined,
    deadline: task.deadline ?? undefined,
    priority: task.priority,
    estimateMinutes: task.estimateMinutes ?? undefined,
    scheduledStart: task.scheduledStart ?? undefined,
    projectId: task.projectId ?? undefined,
  };
}

async function callOp<Result>(
  ctx: AgentToolContext,
  name: string,
  input: Record<string, unknown>
) {
  return runOp<Result>(name, input, {
    userId: ctx.userId,
    workspace: ctx.workspace,
    actor: "agent",
    runId: await ctx.runId(),
  });
}

async function readOp<Result>(
  ctx: AgentToolContext,
  name: string,
  input: Record<string, unknown>
) {
  return runOp<Result>(name, input, {
    userId: ctx.userId,
    workspace: ctx.workspace,
    actor: "agent",
  });
}

type PersonalLike = {
  id: string;
  title: string;
  kind?: string;
  start?: string;
  end?: string;
  rrule?: string | null;
  href?: string;
};

function quote(title: string) {
  return `“${title.length > 60 ? `${title.slice(0, 57)}…` : title}”`;
}

/** A task by id, or by its title when the title is unambiguous. */
async function resolveTaskId(
  ctx: AgentToolContext,
  args: { taskId?: string; titleQuery?: string }
): Promise<{ id: string } | { error: AgentToolOutcome }> {
  if (args.taskId) return { id: args.taskId };
  const query = args.titleQuery?.trim();
  if (!query) {
    return { error: failure("Give a taskId or the task's title.") };
  }
  const { result } = await readOp<{ tasks: TaskLike[] }>(ctx, "task.list", {
    query,
    status: "all",
    limit: 10,
  });
  const exact = result.tasks.filter(
    (task) => task.title.toLowerCase() === query.toLowerCase()
  );
  const matches = exact.length ? exact : result.tasks;
  if (matches.length === 1) return { id: matches[0].id };
  if (!matches.length) {
    return { error: failure(`No task matches “${query}”.`) };
  }
  return {
    error: {
      ...failure(`Several tasks match “${query}”. Ask which one.`),
      modelText: modelJson({
        ok: false,
        error: "ambiguous",
        candidates: matches.map(briefTask),
      }),
    },
  };
}

const taskRef = {
  taskId: z.string().min(1).optional().describe("Task id."),
  titleQuery: z
    .string()
    .min(1)
    .optional()
    .describe("The task's exact title, when you do not have its id."),
};

const priority = z.enum(["NONE", "LOW", "MEDIUM", "HIGH", "URGENT"]);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("A calendar day, YYYY-MM-DD, in the user's time zone.");

function wrote(
  summary: string,
  run: { actionId: string | null; undoable: boolean },
  extra: {
    result: unknown;
    href?: string;
    taskId?: string;
  }
): AgentToolOutcome {
  return {
    ok: true,
    summary,
    modelText: modelJson({
      ok: true,
      summary,
      ...(extra.href ? { href: extra.href } : {}),
      result: extra.result,
    }),
    ...(run.actionId
      ? {
          action: {
            actionId: run.actionId,
            label: summary,
            href: extra.href,
            undoable: run.undoable,
          },
        }
      : {}),
    changed: true,
    taskId: extra.taskId,
  };
}

const WRITE_TOOLS: AgentTool[] = [
  {
    name: "create_task",
    kind: "write",
    progress: "Creating a task",
    description:
      "Create one task. The title is the closing step; put the first small step in entry and the steps in order in subtasks. Use list_tasks first if it may already exist.",
    schema: z
      .object({
        title: z.string().min(1).max(160),
        notes: z.string().max(20000).optional(),
        dueDate: z
          .string()
          .optional()
          .describe("ISO date or date-time the task is due."),
        priority: priority.optional(),
        estimateMinutes: z.number().int().min(5).max(1440).optional(),
        projectId: z.string().min(1).optional(),
        entry: z.string().min(1).max(160).optional(),
        subtasks: z.array(z.string().min(1).max(160)).max(30).optional(),
        dependsOnId: z.string().min(1).optional(),
        autoSchedule: z.boolean().optional(),
      })
      .strict(),
    async run(ctx, args) {
      const { result, ...run } = await callOp<{
        task: TaskLike;
      }>(ctx, "task.create", args);
      const task = result.task;
      return wrote(`Created task ${quote(task.title)}`, run, {
        result: briefTask(task),
        href: task.href,
        taskId: task.id,
      });
    },
  },
  {
    name: "update_task",
    kind: "write",
    progress: "Updating a task",
    description:
      "Change a task's title, notes, due date, deadline, priority, estimate or project. Moving dueDate also moves an equal deadline. To change the day it is scheduled use move_task.",
    schema: z
      .object({
        ...taskRef,
        title: z.string().min(1).max(160).optional(),
        notes: z.string().max(20000).nullable().optional(),
        dueDate: z.string().nullable().optional(),
        deadline: z.string().nullable().optional(),
        priority: priority.optional(),
        estimateMinutes: z
          .number()
          .int()
          .min(5)
          .max(1440)
          .nullable()
          .optional(),
        projectId: z.string().min(1).nullable().optional(),
      })
      .strict(),
    async run(ctx, args) {
      const { taskId, titleQuery, ...fields } = args as {
        taskId?: string;
        titleQuery?: string;
      } & Record<string, unknown>;
      const resolved = await resolveTaskId(ctx, { taskId, titleQuery });
      if ("error" in resolved) return resolved.error;
      const { result, ...run } = await callOp<{ task: TaskLike }>(
        ctx,
        "task.update",
        { taskId: resolved.id, ...fields }
      );
      return wrote(`Updated task ${quote(result.task.title)}`, run, {
        result: briefTask(result.task),
        href: result.task.href,
        taskId: result.task.id,
      });
    },
  },
  {
    name: "move_task",
    kind: "write",
    progress: "Moving a task",
    description:
      "Move a task to another day, keeping its time of day (a task with no time gets that due date).",
    schema: z.object({ ...taskRef, date: day }).strict(),
    async run(ctx, args) {
      const resolved = await resolveTaskId(ctx, args);
      if ("error" in resolved) return resolved.error;
      const { result, ...run } = await callOp<{ task: TaskLike }>(
        ctx,
        "task.move_to_day",
        { taskId: resolved.id, date: args.date }
      );
      return wrote(
        `Moved ${quote(result.task.title)} to ${String(args.date)}`,
        run,
        {
          result: briefTask(result.task),
          href: result.task.href,
          taskId: result.task.id,
        }
      );
    },
  },
  {
    name: "complete_task",
    kind: "write",
    progress: "Completing a task",
    description: "Mark a task done, or reopen it with reopen: true.",
    schema: z.object({ ...taskRef, reopen: z.boolean().optional() }).strict(),
    async run(ctx, args) {
      const resolved = await resolveTaskId(ctx, args);
      if ("error" in resolved) return resolved.error;
      const reopen = args.reopen === true;
      const { result, ...run } = await callOp<{ task: TaskLike }>(
        ctx,
        reopen ? "task.uncomplete" : "task.complete",
        { taskId: resolved.id }
      );
      return wrote(
        `${reopen ? "Reopened" : "Completed"} ${quote(result.task.title)}`,
        run,
        {
          result: briefTask(result.task),
          href: result.task.href,
          taskId: result.task.id,
        }
      );
    },
  },
  {
    name: "delete_task",
    kind: "destructive",
    progress: "Archiving a task",
    description:
      "Archive (delete) a task. The person is asked to confirm first; Undo restores it.",
    schema: z.object({ ...taskRef }).strict(),
    async run(ctx, args, { confirmed }) {
      const resolved = await resolveTaskId(ctx, args);
      if ("error" in resolved) return resolved.error;
      const { result: found } = await readOp<{ task: TaskLike }>(
        ctx,
        "task.get",
        { taskId: resolved.id }
      );
      if (!confirmed) {
        return {
          ok: true,
          summary: `Archive task ${quote(found.task.title)}?`,
          modelText: modelJson({ ok: false, needsConfirmation: true }),
          confirm: {
            prompt: `Archive task ${quote(found.task.title)}? You can undo it.`,
          },
          changed: false,
        };
      }
      const { result, ...run } = await callOp<{ task: TaskLike }>(
        ctx,
        "task.archive",
        { taskId: resolved.id }
      );
      return wrote(`Archived ${quote(result.task.title)}`, run, {
        result: briefTask(result.task),
        href: result.task.href,
        taskId: result.task.id,
      });
    },
  },
  {
    name: "create_event",
    kind: "write",
    progress: "Adding an event",
    description:
      "Add an event to the user's Needt calendar. start and end are ISO date-times.",
    schema: z
      .object({
        title: z.string().min(1).max(500),
        start: z.string().min(1),
        end: z.string().min(1),
        allDay: z.boolean().optional(),
        location: z.string().max(1000).optional(),
        description: z.string().max(20000).optional(),
      })
      .strict(),
    async run(ctx, args) {
      const { result, ...run } = await callOp<{ event: EventLike }>(
        ctx,
        "event.create",
        args
      );
      return wrote(`Added event ${quote(result.event.title)}`, run, {
        result: result.event,
        href: result.event.href,
      });
    },
  },
  {
    name: "update_event",
    kind: "write",
    progress: "Changing an event",
    description:
      "Change an event's title, time, place or notes. Get its id from search first.",
    schema: z
      .object({
        eventId: z.string().min(1),
        title: z.string().min(1).max(500).optional(),
        start: z.string().min(1).optional(),
        end: z.string().min(1).optional(),
        allDay: z.boolean().optional(),
        location: z.string().max(1000).nullable().optional(),
        description: z.string().max(20000).nullable().optional(),
      })
      .strict(),
    async run(ctx, args) {
      const { result, ...run } = await callOp<{ event: EventLike }>(
        ctx,
        "event.update",
        args
      );
      return wrote(`Changed event ${quote(result.event.title)}`, run, {
        result: result.event,
        href: result.event.href,
      });
    },
  },
  {
    name: "delete_event",
    kind: "destructive",
    progress: "Removing an event",
    description:
      "Delete an event from the Needt calendar. The person is asked to confirm first; Undo brings it back.",
    schema: z.object({ eventId: z.string().min(1) }).strict(),
    async run(ctx, args, { confirmed }) {
      const eventId = String(args.eventId);
      const event = await prisma.calendarEvent.findFirst({
        where: { id: eventId, archivedAt: null, feed: { userId: ctx.userId } },
        select: { title: true },
      });
      if (!event) return failure("Event not found.");
      if (!confirmed) {
        return {
          ok: true,
          summary: `Delete event ${quote(event.title)}?`,
          modelText: modelJson({ ok: false, needsConfirmation: true }),
          confirm: {
            prompt: `Delete event ${quote(event.title)}? You can undo it.`,
          },
          changed: false,
        };
      }
      const { result, ...run } = await callOp<{ event: EventLike }>(
        ctx,
        "event.delete",
        { eventId }
      );
      return wrote(`Deleted event ${quote(result.event.title)}`, run, {
        result: { id: result.event.id },
      });
    },
  },
  {
    name: "create_personal_time",
    kind: "write",
    progress: "Keeping time for you",
    description:
      "Block time the person keeps for themselves (lunch, break, walk, dinner, gym, party, rest, or a custom block with a title). Tasks are never scheduled inside it. start and end are ISO date-times in the user's time zone; give end or minutes, or leave both out for the kind's usual length. rrule repeats it (for example FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR). It stays in Needt and is not written to Google or iCloud.",
    schema: z
      .object({
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
        start: z.string().min(1),
        end: z.string().min(1).optional(),
        minutes: z.number().int().min(5).max(1440).optional(),
        rrule: z.string().min(1).max(500).optional(),
      })
      .strict(),
    async run(ctx, args) {
      const { result, ...run } = await callOp<{ block: PersonalLike }>(
        ctx,
        "personal.create",
        args
      );
      return wrote(`Kept time for ${quote(result.block.title)}`, run, {
        result: result.block,
        href: result.block.href,
      });
    },
  },
  {
    name: "mark_event_personal",
    kind: "write",
    progress: "Marking an event as personal time",
    description:
      "Mark a calendar event (synced or the user's own) as personal time, so no task is scheduled over it. The event itself is not changed. Get its id from search or list_events first.",
    schema: z
      .object({
        eventId: z.string().min(1),
        kind: z
          .enum(["lunch", "break", "walk", "dinner", "gym", "party", "rest"])
          .optional(),
      })
      .strict(),
    async run(ctx, args) {
      const { result, ...run } = await callOp<{
        block: PersonalLike;
        already: boolean;
      }>(ctx, "personal.mark_event", args);
      return wrote(
        result.already
          ? `${quote(result.block.title)} was already personal time`
          : `Marked ${quote(result.block.title)} as personal time`,
        run,
        { result: result.block, href: result.block.href }
      );
    },
  },
  {
    name: "delete_personal_time",
    kind: "destructive",
    progress: "Removing personal time",
    description:
      "Remove a personal time block (a repeating one goes entirely). The person is asked to confirm first; Undo brings it back. Get its id from list_personal_time.",
    schema: z.object({ blockId: z.string().min(1) }).strict(),
    async run(ctx, args, { confirmed }) {
      const blockId = String(args.blockId);
      const { result: listed } = await readOp<{ blocks: PersonalLike[] }>(
        ctx,
        "personal.list",
        {}
      );
      const block = listed.blocks.find((item) => item.id === blockId);
      if (!block) return failure("Personal time block not found.");
      if (!confirmed) {
        return {
          ok: true,
          summary: `Remove ${quote(block.title)}?`,
          modelText: modelJson({ ok: false, needsConfirmation: true }),
          confirm: {
            prompt: `Remove ${quote(block.title)} from your personal time? You can undo it.`,
          },
          changed: false,
        };
      }
      const { result, ...run } = await callOp<{ block: PersonalLike }>(
        ctx,
        "personal.delete",
        { blockId }
      );
      return wrote(`Removed ${quote(result.block.title)}`, run, {
        result: { id: result.block.id },
      });
    },
  },
  {
    name: "create_page",
    kind: "write",
    progress: "Creating a page",
    description:
      "Create a page with an optional Markdown body (headings, lists, - [ ] to-dos).",
    schema: z
      .object({
        title: z.string().min(1).max(240),
        body: z.string().min(1).max(60000).optional(),
        parentId: z.string().min(1).optional(),
      })
      .strict(),
    async run(ctx, args) {
      const { result, ...run } = await callOp<{ page: PageLike }>(
        ctx,
        "page.create",
        { ...args, format: "markdown" }
      );
      return wrote(`Created page ${quote(result.page.title)}`, run, {
        result: result.page,
        href: result.page.href,
      });
    },
  },
  {
    name: "append_to_page",
    kind: "write",
    progress: "Adding to a page",
    description:
      "Append Markdown to the end of an existing page. Earlier content is kept.",
    schema: z
      .object({
        pageId: z.string().min(1),
        text: z.string().min(1).max(60000),
      })
      .strict(),
    async run(ctx, args) {
      const { result, ...run } = await callOp<{ page: PageLike }>(
        ctx,
        "page.append",
        { ...args, format: "markdown" }
      );
      return wrote(`Added to page ${quote(result.page.title)}`, run, {
        result: result.page,
        href: result.page.href,
      });
    },
  },
  {
    name: "plan_day",
    kind: "write",
    progress: "Planning your day",
    description:
      "Plan my day: place the open tasks that have no time yet into free slots, using the calendar's events, the working hours with their breaks, due dates, priority, estimates and dependencies. One undoable action. Returns where each task went and what did not fit. Pro plan.",
    schema: z.object({}).strict(),
    async run(ctx) {
      const entitlement = await canPlanMyDay(ctx.userId);
      if (!entitlement.allowed) {
        return failure("Plan my day is available on Needt Pro and Lifetime.");
      }
      const result = await planMyDay({
        userId: ctx.userId,
        workspace: ctx.workspace,
        actor: "agent",
        runId: await ctx.runId(),
      });
      const changed = result.items.length > 0;
      return {
        ok: true,
        summary: result.headline,
        modelText: modelJson({
          ok: true,
          summary: result.headline,
          placed: result.items.slice(0, 30).map((item) => ({
            id: item.taskId,
            title: item.title,
            day: item.day,
            time: item.time,
            moved: item.moved,
            href: `/tasks?taskId=${item.taskId}`,
          })),
          didNotFit: result.unplaced.map((task) => ({
            id: task.taskId,
            title: task.title,
          })),
        }),
        ...(result.actionId
          ? {
              action: {
                actionId: result.actionId,
                label: result.headline,
                href: "/calendar",
                undoable: result.undoable,
              },
            }
          : {}),
        changed,
      };
    },
  },
  {
    name: "log_habit",
    kind: "write",
    progress: "Logging a habit",
    description:
      "Mark a habit done for a day (today by default), or not done with done: false. Find the id with list_habits, or pass the habit's exact title.",
    schema: z
      .object({
        habitId: z.string().min(1).optional(),
        titleQuery: z.string().min(1).optional(),
        date: day.optional(),
        done: z.boolean().optional(),
      })
      .strict(),
    async run(ctx, args) {
      let habitId = args.habitId as string | undefined;
      let title: string | undefined;
      if (!habitId) {
        const query = String(args.titleQuery ?? "").trim();
        if (!query) return failure("Give a habitId or the habit's title.");
        const habits = await listHabits(ctx);
        const found = habits.filter(
          (habit) => habit.title.toLowerCase() === query.toLowerCase()
        );
        if (found.length !== 1) {
          return failure(
            found.length
              ? `Several habits match “${query}”.`
              : `No habit is called “${query}”.`
          );
        }
        habitId = found[0].id;
        title = found[0].title;
      }
      const done = args.done !== false;
      const { result, ...run } = await callOp<Record<string, unknown>>(
        ctx,
        done ? "habit.log" : "habit.unlog",
        { habitId, ...(args.date ? { date: args.date } : {}) }
      );
      return wrote(
        `${done ? "Logged" : "Cleared"} ${title ? quote(title) : "habit"}${
          args.date ? ` for ${String(args.date)}` : " today"
        }`,
        run,
        { result, href: "/habits" }
      );
    },
  },
];

type EventLike = {
  id: string;
  title: string;
  start: string;
  end: string;
  href: string;
};
type PageLike = { id: string; title: string; href: string };

async function listHabits(ctx: AgentToolContext) {
  return prisma.habit.findMany({
    where: {
      ...workspaceDataScopeWhere(ctx.workspace, ctx.userId),
      userId: ctx.userId,
      archivedAt: null,
    },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
    take: 50,
  });
}

const READ_TOOLS: AgentTool[] = [
  {
    name: "search",
    kind: "read",
    progress: "Searching your data",
    description:
      "Search everything the user keeps by text: tasks, projects, calendar events, pages (titles and text), habits, moodboards and mail (sender, subject, date only). Returns type, id, title, a snippet and a link per hit. Search first, then call get for the one or two you need. Use list_tasks or list_events to browse by status or date instead.",
    schema: z
      .object({
        query: z.string().min(1).max(200),
        types: z.array(z.enum(RETRIEVAL_TYPES)).max(7).optional(),
        limit: z.number().int().min(1).max(15).optional(),
      })
      .strict(),
    async run(ctx, args) {
      const hits = await searchData({
        userId: ctx.userId,
        workspace: ctx.workspace,
        query: String(args.query),
        types: args.types as RetrievalType[] | undefined,
        limit: args.limit as number | undefined,
      });
      return {
        ok: true,
        summary: `Found ${hits.length} ${hits.length === 1 ? "match" : "matches"}`,
        modelText: modelJson({ hits }),
        changed: false,
      };
    },
  },
  {
    name: "get",
    kind: "read",
    progress: "Reading",
    description:
      "Read one object by type and id (from search or a list): a task with its subtasks, a project, an event, a page with its text, a habit, a moodboard, or a mail message's metadata. Mail bodies are read with get_message.",
    schema: z
      .object({ type: z.enum(RETRIEVAL_TYPES), id: z.string().min(1) })
      .strict(),
    async run(ctx, args) {
      const found = await fetchObject({
        userId: ctx.userId,
        workspace: ctx.workspace,
        type: args.type as RetrievalType,
        id: String(args.id),
      });
      if (!found) return failure(`${String(args.type)} not found.`);
      return {
        ok: true,
        summary: `Read ${quote(found.title)}`,
        modelText: modelJson({ ...found.data, href: found.href }),
        sources: [
          {
            type: found.type,
            id: found.id,
            title: found.title,
            href: found.href,
          },
        ],
        changed: false,
      };
    },
  },
  {
    name: "list_events",
    kind: "read",
    progress: "Looking at your calendar",
    description:
      "Calendar events between two dates (inclusive, YYYY-MM-DD, the user's time zone), oldest first. Personal workspace only.",
    schema: z.object({ from: day, to: day }).strict(),
    async run(ctx, args) {
      if (ctx.workspace.workspaceKind !== WorkspaceKind.PERSONAL) {
        return failure("Calendar events are personal.");
      }
      const timeZone = await userTimeZone(prisma, ctx.userId);
      const start = startOfZonedDay(String(args.from), timeZone);
      const end = startOfZonedDay(nextDayKey(String(args.to)), timeZone);
      if (end <= start) return failure("`to` must not be before `from`.");
      const events = await prisma.calendarEvent.findMany({
        where: {
          archivedAt: null,
          feed: { userId: ctx.userId, enabled: true },
          start: { lt: end },
          end: { gt: start },
        },
        orderBy: { start: "asc" },
        take: 50,
        select: {
          id: true,
          title: true,
          start: true,
          end: true,
          allDay: true,
          location: true,
        },
      });
      return {
        ok: true,
        summary: `Read ${events.length} ${events.length === 1 ? "event" : "events"}`,
        modelText: modelJson({
          timeZone,
          events: events.map((event) => ({
            id: event.id,
            title: event.title,
            start: event.start.toISOString(),
            end: event.end.toISOString(),
            allDay: event.allDay || undefined,
            location: event.location ?? undefined,
            href: hrefFor("event", event.id),
          })),
        }),
        changed: false,
      };
    },
  },
  {
    name: "list_tasks",
    kind: "read",
    progress: "Looking at your tasks",
    description:
      "List tasks. Filter by status (open by default), project or a title word. Returns id, title, due, deadline, priority, estimate and schedule.",
    schema: z
      .object({
        status: z.enum(["open", "completed", "all"]).optional(),
        projectId: z.string().min(1).optional(),
        query: z.string().min(1).max(200).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      })
      .strict(),
    async run(ctx, args) {
      const { result } = await readOp<{ tasks: TaskLike[] }>(ctx, "task.list", {
        limit: 25,
        ...args,
      });
      const tasks = result.tasks.map((task) => ({
        ...briefTask(task),
        href: task.href,
      }));
      return {
        ok: true,
        summary: `Read ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`,
        modelText: modelJson({ tasks }),
        changed: false,
      };
    },
  },
  {
    name: "get_day",
    kind: "read",
    progress: "Looking at the day",
    description:
      "What is on one day: tasks placed on it and open tasks due on it.",
    schema: z.object({ date: day }).strict(),
    async run(ctx, args) {
      const { result } = await readOp<Record<string, unknown>>(
        ctx,
        "schedule.get_day",
        args
      );
      return {
        ok: true,
        summary: `Read ${String(args.date)}`,
        modelText: modelJson(result),
        changed: false,
      };
    },
  },
  {
    name: "list_personal_time",
    kind: "read",
    progress: "Looking at your personal time",
    description:
      "List the user's personal time blocks (lunch, walks, gym...). With from and to (ISO), also the occurrences in that range.",
    schema: z
      .object({
        from: z.string().min(1).optional(),
        to: z.string().min(1).optional(),
      })
      .strict(),
    async run(ctx, args) {
      const { result } = await readOp<{
        blocks: PersonalLike[];
        occurrences: unknown[];
      }>(ctx, "personal.list", args);
      return {
        ok: true,
        summary: `Read ${result.blocks.length} personal time ${result.blocks.length === 1 ? "block" : "blocks"}`,
        modelText: modelJson(result),
        changed: false,
      };
    },
  },
  {
    name: "list_habits",
    kind: "read",
    progress: "Looking at your habits",
    description: "List the user's active habits (id and title).",
    schema: z.object({}).strict(),
    async run(ctx) {
      const habits = await listHabits(ctx);
      return {
        ok: true,
        summary: `Read ${habits.length} habits`,
        modelText: modelJson({ habits }),
        changed: false,
      };
    },
  },
];

/** Tools replaced by the op-backed ones above; the legacy catalog entry is hidden. */
export const SUPERSEDED_LEGACY_TOOLS = new Set([
  "create_task",
  "edit_task",
  "delete_task",
  "auto_schedule",
]);

export const AGENT_TOOLS: AgentTool[] = [...READ_TOOLS, ...WRITE_TOOLS];

const byName = new Map(AGENT_TOOLS.map((tool) => [tool.name, tool]));

export function getAgentTool(name: string) {
  return byName.get(name);
}

export function agentToolDefinitions(): AIChatToolDefinition[] {
  return AGENT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.schema),
  }));
}
