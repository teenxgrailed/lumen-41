import {
  forgetForUser,
  listAgentMemories,
  rememberForUser,
} from "@/services/ai/memory";
import { createReschedulePreview } from "@/services/ai/reschedule-preview";
import {
  isDangerousAgentTool,
  validateAgentToolCall,
} from "@/services/ai/tool-catalog";
import { AIChatToolCall, SchedulerAI } from "@/services/ai/types";
import {
  finalizeSession,
  getActiveSession,
  startSession,
} from "@/services/focus/focusSession";
import { getWeeklyFocusReport } from "@/services/focus/focusStats";
import {
  type PageActor,
  createAiProposal,
  listAiReadablePages,
} from "@/services/pages/page-service";
import {
  appendSubtasks,
  checkBlocker,
  normalizeSubtasks,
  partsCreateData,
  setSubtaskDone,
} from "@/services/tasks/subtasks";
import { FocusSessionMode, Prisma } from "@prisma/client";

import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { getMailMessage } from "@/lib/mail-db";
import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime/publish";
import { schedulePushTaskBlock } from "@/lib/task-block-push";

const LOG_SOURCE = "ai-chat";

export type ToolResult = {
  text: string;
  toolName: string | null;
  toolPayload?: Prisma.InputJsonValue;
  requiresConfirm: boolean;
};

function stringArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function booleanArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === "boolean" ? value : null;
}

function dateArg(args: Record<string, unknown>, key: string) {
  const value = stringArg(args, key);
  if (!value) return null;
  const date = newDate(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function taskHref(taskId: string) {
  return `/tasks?taskId=${taskId}`;
}

function projectHref(projectId: string) {
  return `/projects/${projectId}`;
}

function pageHref(pageId: string) {
  return `/pages/${pageId}`;
}

async function publishAgentMutation(userId: string) {
  try {
    await publishRealtimeEvent(userId, "tasks-updated");
  } catch (error) {
    logger.warn(
      "Could not publish AI mutation realtime event",
      { userId, error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  }
}

async function findTask(
  userId: string,
  workspace: WorkspaceAccess,
  args: Record<string, unknown>
) {
  const scope = workspaceDataScopeWhere(workspace, userId);
  const taskId = stringArg(args, "taskId");
  if (taskId) {
    return prisma.task.findFirst({
      where: { id: taskId, ...scope, isArchived: false },
    });
  }

  const titleQuery = stringArg(args, "titleQuery");
  if (!titleQuery) return null;
  return prisma.task.findFirst({
    where: {
      ...scope,
      isArchived: false,
      title: { equals: titleQuery, mode: "insensitive" },
    },
  });
}

//todo: the write tools that matter (tasks, events, pages, habits, plan) now go
// through runOp() in agent/tools.ts. This switch serves the remaining tools
// (focus, mail, settings, memory, projects) and the providers without
// streamTurn.
export async function executeTool(
  ai: SchedulerAI,
  call: AIChatToolCall,
  userId: string,
  workspace: WorkspaceAccess,
  confirmed: boolean,
  pageActor: PageActor = userId
): Promise<ToolResult> {
  const workspaceId = workspace.workspaceId;
  const scope = workspaceDataScopeWhere(workspace, userId);
  const validatedArguments = validateAgentToolCall(call.name, call.arguments);
  if (!validatedArguments) {
    return {
      text: "The tool request was invalid, so no planner data was changed.",
      toolName: call.name,
      requiresConfirm: false,
    };
  }
  call = { ...call, arguments: validatedArguments };

  logger.info(
    "Executing AI agent tool",
    { userId, toolName: call.name, confirmed },
    LOG_SOURCE
  );

  if (call.name === "delete_task" && !confirmed) {
    const task = await findTask(userId, workspace, call.arguments);
    if (!task) {
      return {
        text: "I could not find that task to archive.",
        toolName: "delete_task",
        requiresConfirm: false,
      };
    }
    return {
      text: `Archive task "${task.title}"? You can restore it from the archive.`,
      toolName: "confirmation_required",
      toolPayload: jsonValue({
        requestedTool: call.name,
        arguments: { taskId: task.id },
        target: { type: "task", id: task.id, title: task.title },
      }),
      requiresConfirm: true,
    };
  }

  if (isDangerousAgentTool(call.name, call.arguments) && !confirmed) {
    return {
      text: "This action can change or delete planner data. Confirm it to continue.",
      toolName: "confirmation_required",
      toolPayload: jsonValue({
        requestedTool: call.name,
        arguments: call.arguments,
      }),
      requiresConfirm: true,
    };
  }

  switch (call.name) {
    case "create_task": {
      const title = stringArg(call.arguments, "title");
      if (!title) {
        return {
          text: "I need a task title before I can create it.",
          toolName: "create_task",
          requiresConfirm: false,
        };
      }

      const estimatedMinutes = numberArg(call.arguments, "estimatedMinutes");
      const dueDate = dateArg(call.arguments, "dueDate");
      const autoSchedule = booleanArg(call.arguments, "autoSchedule") ?? true;
      const projectId = stringArg(call.arguments, "projectId");
      if (
        projectId &&
        !(await prisma.project.findFirst({
          where: { id: projectId, workspaceId, status: "active" },
          select: { id: true },
        }))
      ) {
        return {
          text: "I could not find that project, so no task was created.",
          toolName: "create_task",
          requiresConfirm: false,
        };
      }
      const dependsOnId = stringArg(call.arguments, "dependsOnId");
      if (dependsOnId) {
        const blocker = await checkBlocker({ userId, workspace }, dependsOnId);
        if (!blocker.ok) {
          return {
            text: `${blocker.error}, so no task was created.`,
            toolName: "create_task",
            requiresConfirm: false,
          };
        }
      }
      const subtasks = normalizeSubtasks(
        call.arguments.subtasks as Parameters<typeof normalizeSubtasks>[0]
      );
      const task = await prisma.task.create({
        data: {
          userId,
          workspaceId,
          assigneeId: userId,
          title: title.slice(0, 160),
          status: "todo",
          ...(projectId ? { projectId } : {}),
          ...(dependsOnId ? { dependsOnId } : {}),
          entry: stringArg(call.arguments, "entry"),
          parts: partsCreateData(subtasks),
          isAutoScheduled: autoSchedule,
          autoScheduled: false,
          scheduleLocked: false,
          estimatedMinutes: estimatedMinutes
            ? Math.max(5, Math.round(estimatedMinutes))
            : undefined,
          duration: estimatedMinutes
            ? Math.max(5, Math.round(estimatedMinutes))
            : undefined,
          deadline: dueDate || undefined,
          dueDate: dueDate || undefined,
          priorityLevel:
            stringArg(call.arguments, "priority") === "URGENT"
              ? "URGENT"
              : stringArg(call.arguments, "priority") === "HIGH"
                ? "HIGH"
                : stringArg(call.arguments, "priority") === "LOW"
                  ? "LOW"
                  : "MEDIUM",
          activities: {
            create: { workspaceId, actorId: userId, action: "CREATED" },
          },
        },
      });
      await publishAgentMutation(userId);

      return {
        text: subtasks.length
          ? `Created task "${task.title}" with ${subtasks.length} ${subtasks.length === 1 ? "subtask" : "subtasks"}.`
          : `Created task "${task.title}".`,
        toolName: "create_task",
        toolPayload: jsonValue({
          taskId: task.id,
          title: task.title,
          subtasks: subtasks.length,
          href: taskHref(task.id),
        }),
        requiresConfirm: false,
      };
    }

    case "add_subtasks": {
      const task = await findTask(userId, workspace, call.arguments);
      if (!task) {
        return {
          text: "I could not find that task to add subtasks to.",
          toolName: "add_subtasks",
          requiresConfirm: false,
        };
      }
      const added = await appendSubtasks({
        userId,
        workspace,
        taskId: task.id,
        subtasks: normalizeSubtasks(
          call.arguments.subtasks as Parameters<typeof normalizeSubtasks>[0]
        ),
      });
      if (!added.ok) {
        return {
          text: added.error,
          toolName: "add_subtasks",
          requiresConfirm: false,
        };
      }
      await publishAgentMutation(userId);
      return {
        text: `Added ${added.subtasks.length} ${added.subtasks.length === 1 ? "subtask" : "subtasks"} to "${task.title}".`,
        toolName: "add_subtasks",
        toolPayload: jsonValue({
          taskId: task.id,
          title: task.title,
          subtasks: added.subtasks,
          href: taskHref(task.id),
        }),
        requiresConfirm: false,
      };
    }

    case "complete_subtask": {
      const task = await findTask(userId, workspace, call.arguments);
      if (!task) {
        return {
          text: "I could not find that task.",
          toolName: "complete_subtask",
          requiresConfirm: false,
        };
      }
      const subtaskId = stringArg(call.arguments, "subtaskId");
      const subtaskTitle = stringArg(call.arguments, "subtaskTitle");
      const part = subtaskId
        ? { id: subtaskId }
        : subtaskTitle
          ? await prisma.taskPart.findFirst({
              where: {
                taskId: task.id,
                title: { equals: subtaskTitle, mode: "insensitive" },
              },
              orderBy: { position: "asc" },
              select: { id: true },
            })
          : null;
      if (!part) {
        return {
          text: `I could not find that subtask on "${task.title}".`,
          toolName: "complete_subtask",
          requiresConfirm: false,
        };
      }
      const done = booleanArg(call.arguments, "done") ?? true;
      const ticked = await setSubtaskDone({
        userId,
        workspace,
        taskId: task.id,
        subtaskId: part.id,
        done,
      });
      if (!ticked.ok) {
        return {
          text: ticked.error,
          toolName: "complete_subtask",
          requiresConfirm: false,
        };
      }
      await publishAgentMutation(userId);
      return {
        text:
          done && ticked.allDone
            ? `Ticked "${ticked.subtask.title}". Every subtask of "${task.title}" is done, so the task itself is the last step.`
            : `${done ? "Ticked" : "Reopened"} "${ticked.subtask.title}" (${ticked.open} left).`,
        toolName: "complete_subtask",
        toolPayload: jsonValue({
          taskId: task.id,
          title: task.title,
          subtask: ticked.subtask,
          open: ticked.open,
          allDone: ticked.allDone,
          href: taskHref(task.id),
        }),
        requiresConfirm: false,
      };
    }

    case "edit_task": {
      const task = await findTask(userId, workspace, call.arguments);
      if (!task) {
        return {
          text: "I could not find that task to edit.",
          toolName: "edit_task",
          requiresConfirm: false,
        };
      }

      const title = stringArg(call.arguments, "title");
      const status = stringArg(call.arguments, "status");
      const estimatedMinutes = numberArg(call.arguments, "estimatedMinutes");
      const dueDate = dateArg(call.arguments, "dueDate");
      const updated = await prisma.task.update({
        where: { id: task.id },
        data: {
          ...(title ? { title: title.slice(0, 160) } : {}),
          ...(status === "todo" ||
          status === "in_progress" ||
          status === "completed"
            ? { status }
            : {}),
          ...(estimatedMinutes
            ? {
                estimatedMinutes: Math.max(5, Math.round(estimatedMinutes)),
                duration: Math.max(5, Math.round(estimatedMinutes)),
              }
            : {}),
          ...(dueDate ? { dueDate, deadline: dueDate } : {}),
        },
      });
      await publishAgentMutation(userId);

      return {
        text: `Updated task "${updated.title}".`,
        toolName: "edit_task",
        toolPayload: jsonValue({
          taskId: updated.id,
          title: updated.title,
          href: taskHref(updated.id),
        }),
        requiresConfirm: false,
      };
    }

    case "delete_task": {
      const task = await findTask(userId, workspace, call.arguments);
      if (!task) {
        return {
          text: "I could not find that task to archive.",
          toolName: "delete_task",
          requiresConfirm: false,
        };
      }
      const schedulingUserId = task.assigneeId ?? userId;
      await prisma.task.update({
        where: { id: task.id },
        data: {
          isArchived: true,
          archivedAt: newDate(),
          scheduledStart: null,
          scheduledEnd: null,
          scheduleLocked: false,
          ...(task.workspaceId && {
            activities: {
              create: {
                workspaceId: task.workspaceId,
                actorId: userId,
                action: "ARCHIVED",
              },
            },
          }),
        },
      });
      await prisma.scheduledBlock.deleteMany({
        where: { taskId: task.id, userId: schedulingUserId },
      });
      schedulePushTaskBlock(schedulingUserId, task.id);
      await publishAgentMutation(userId);
      return {
        text: `Archived task "${task.title}".`,
        toolName: "delete_task",
        toolPayload: jsonValue({
          taskId: task.id,
          title: task.title,
          archived: true,
          href: taskHref(task.id),
        }),
        requiresConfirm: false,
      };
    }

    case "auto_schedule": {
      const preview = await createReschedulePreview(userId, workspace);
      return {
        text: preview.changes.length
          ? `Prepared a dry-run with ${preview.changes.length} schedule changes. Review the diff, then choose Apply or Cancel.`
          : "The dry-run found no schedule changes to apply.",
        toolName: "auto_schedule",
        toolPayload: jsonValue(preview),
        requiresConfirm: false,
      };
    }

    case "list_pages": {
      const pages = await listAiReadablePages(pageActor);
      return {
        text: pages.length
          ? `Pages: ${pages.map((page) => page.title).join(", ")}.`
          : "No AI-readable pages yet.",
        toolName: call.name,
        toolPayload: jsonValue({
          pages: pages.map((page) => ({
            id: page.id,
            title: page.title,
            updatedAt: page.updatedAt,
          })),
        }),
        requiresConfirm: false,
      };
    }

    case "search_pages": {
      const query = stringArg(call.arguments, "query");
      const pages = query ? await listAiReadablePages(pageActor, query) : [];
      return {
        text: pages.length
          ? `Found ${pages.length} matching page${pages.length === 1 ? "" : "s"}.`
          : "No matching AI-readable page was found.",
        toolName: call.name,
        toolPayload: jsonValue({
          pages: pages.map((page) => ({
            id: page.id,
            title: page.title,
            blocks: page.blocks.map((block) => ({
              type: block.type,
              content: block.content,
            })),
          })),
        }),
        requiresConfirm: false,
      };
    }

    case "propose_page_changes": {
      const pageId = stringArg(call.arguments, "pageId");
      const summary = stringArg(call.arguments, "summary");
      const proposedText = stringArg(call.arguments, "text");
      if (!pageId || !summary || !proposedText) {
        return {
          text: "I need a page, summary and proposed text.",
          toolName: call.name,
          requiresConfirm: false,
        };
      }
      const proposal = await createAiProposal(pageActor, pageId, {
        summary,
        operations: [
          {
            type: "append_block",
            blockType: "PARAGRAPH",
            content: { text: proposedText },
          },
        ],
      });
      return {
        text: `Prepared a page change preview: ${proposal.summary}. Review it before applying.`,
        toolName: call.name,
        toolPayload: jsonValue({
          proposalId: proposal.id,
          pageId: proposal.pageId,
          summary: proposal.summary,
          status: proposal.status,
          href: pageHref(proposal.pageId),
        }),
        requiresConfirm: false,
      };
    }

    case "start_focus_session": {
      const taskId = stringArg(call.arguments, "taskId");
      if (
        taskId &&
        !(await prisma.task.findFirst({
          where: { id: taskId, ...scope, isArchived: false },
        }))
      ) {
        return {
          text: "I could not find that task for this focus session.",
          toolName: call.name,
          requiresConfirm: false,
        };
      }
      const session = await startSession({
        userId,
        taskId,
        mode: (stringArg(call.arguments, "mode") ||
          "POMODORO") as FocusSessionMode,
        plannedMinutes: numberArg(call.arguments, "plannedMinutes"),
        source: "ai-agent",
      });
      return {
        text: `Started a ${session.mode.toLowerCase().replace(/_/g, " ")} focus session.`,
        toolName: call.name,
        toolPayload: jsonValue({ sessionId: session.id }),
        requiresConfirm: false,
      };
    }

    case "stop_focus_session": {
      const active = await getActiveSession(userId);
      const sessionId = stringArg(call.arguments, "sessionId") || active?.id;
      const session = sessionId
        ? await finalizeSession({
            userId,
            sessionId,
            completed: booleanArg(call.arguments, "completed") ?? true,
            markTaskDone: booleanArg(call.arguments, "markTaskDone") ?? false,
          })
        : null;
      return {
        text: session
          ? `Stopped the focus session after ${session.elapsedMinutes} minutes.`
          : "There is no active focus session to stop.",
        toolName: call.name,
        toolPayload: jsonValue({ sessionId: session?.id || null }),
        requiresConfirm: false,
      };
    }

    case "get_focus_stats": {
      const report = await getWeeklyFocusReport(userId);
      return {
        text: `This week: ${report.focusMinutes} focused minutes across ${report.sessionsCompleted} completed sessions.`,
        toolName: call.name,
        toolPayload: jsonValue(report),
        requiresConfirm: false,
      };
    }

    case "search_mail": {
      const query = stringArg(call.arguments, "query") || "";
      const limit = Math.min(numberArg(call.arguments, "limit") || 8, 20);
      const messages = await prisma.mailMessage.findMany({
        where: {
          account: { userId },
          isArchived: false,
          OR: [
            { subject: { contains: query, mode: "insensitive" } },
            { snippet: { contains: query, mode: "insensitive" } },
            { fromName: { contains: query, mode: "insensitive" } },
            { fromAddress: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: { date: "desc" },
        take: limit,
        select: {
          id: true,
          subject: true,
          fromName: true,
          fromAddress: true,
          snippet: true,
          date: true,
          isRead: true,
        },
      });
      return {
        text: messages.length
          ? messages
              .map(
                (message) =>
                  `${message.subject} — ${message.fromName || message.fromAddress || "unknown sender"}`
              )
              .join("; ")
          : "No synced mail matched that search.",
        toolName: call.name,
        toolPayload: jsonValue({ messages }),
        requiresConfirm: false,
      };
    }

    case "get_message": {
      const messageId = stringArg(call.arguments, "messageId");
      const message = messageId
        ? await getMailMessage(userId, messageId)
        : null;
      const body = (message?.bodyHtml || message?.snippet || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 4_000);
      return {
        text: message
          ? `From ${message.fromName || message.fromAddress || "unknown sender"}: ${message.subject}. ${body}`
          : "I could not find that synced message.",
        toolName: call.name,
        toolPayload: jsonValue(
          message
            ? {
                id: message.id,
                subject: message.subject,
                fromName: message.fromName,
                fromAddress: message.fromAddress,
                date: message.date,
              }
            : null
        ),
        requiresConfirm: false,
      };
    }

    case "create_task_from_email": {
      const messageId = stringArg(call.arguments, "messageId");
      const message = messageId
        ? await getMailMessage(userId, messageId)
        : null;
      if (!message) {
        return {
          text: "I could not find that synced message.",
          toolName: call.name,
          requiresConfirm: false,
        };
      }
      const minutes = numberArg(call.arguments, "estimatedMinutes");
      const task = await prisma.task.create({
        data: {
          userId,
          workspaceId,
          assigneeId: userId,
          title:
            stringArg(call.arguments, "title")?.slice(0, 160) ||
            `Follow up: ${message.subject}`.slice(0, 160),
          description: `From ${message.fromName || message.fromAddress || "unknown sender"}\n\n${message.snippet}`,
          status: "todo",
          source: "mail",
          estimatedMinutes: minutes ? Math.round(minutes) : undefined,
          duration: minutes ? Math.round(minutes) : undefined,
          isAutoScheduled: true,
          activities: {
            create: { workspaceId, actorId: userId, action: "CREATED" },
          },
        },
      });
      await publishAgentMutation(userId);
      return {
        text: `Created task "${task.title}" from the email.`,
        toolName: call.name,
        toolPayload: jsonValue({
          taskId: task.id,
          messageId: message.id,
          href: taskHref(task.id),
        }),
        requiresConfirm: false,
      };
    }

    case "get_user_settings": {
      const preferences = await prisma.schedulingPreferences.findUnique({
        where: { userId },
      });
      return {
        text: preferences
          ? `Work hours and scheduling preferences are available in the tool result.`
          : "Scheduling preferences have not been configured yet.",
        toolName: call.name,
        toolPayload: jsonValue({ preferences }),
        requiresConfirm: false,
      };
    }

    case "update_work_hours": {
      const workHours = call.arguments.workHours as Prisma.InputJsonValue;
      const preferences = await prisma.schedulingPreferences.upsert({
        where: { userId },
        create: { userId, workHours },
        update: { workHours },
      });
      return {
        text: "Updated work hours.",
        toolName: call.name,
        toolPayload: jsonValue({ workHours: preferences.workHours }),
        requiresConfirm: false,
      };
    }

    case "update_scheduling_preferences": {
      const allowed = [
        "bufferMinutes",
        "maxDeepWorkPerDay",
        "minBreakMinutes",
        "autoRescheduleOnMiss",
        "enableBodyDoubling",
        "enableTaskBatching",
        "hardStopTime",
        "bufferMultiplier",
      ] as const;
      const data = Object.fromEntries(
        allowed
          .filter((key) => call.arguments[key] !== undefined)
          .map((key) => [key, call.arguments[key]])
      ) as Prisma.SchedulingPreferencesUncheckedUpdateInput;
      await prisma.schedulingPreferences.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
      const preferences = await prisma.schedulingPreferences.update({
        where: { userId },
        data,
      });
      return {
        text: "Updated scheduling preferences.",
        toolName: call.name,
        toolPayload: jsonValue({ preferences }),
        requiresConfirm: false,
      };
    }

    case "remember": {
      const content = stringArg(call.arguments, "content") || "";
      if (
        /(password|api[- ]?key|secret|token|credit card|bank|diagnos|medication|health)/i.test(
          content
        )
      ) {
        return {
          text: "I did not save that because assistant memory excludes sensitive information.",
          toolName: call.name,
          requiresConfirm: false,
        };
      }
      const memory = await rememberForUser(userId, workspaceId, {
        kind: stringArg(call.arguments, "kind") as
          | "preference"
          | "pattern"
          | "goal"
          | "fact",
        content,
        weight: numberArg(call.arguments, "weight") || 1,
        source: "chat",
      });
      return {
        text: "Remembered.",
        toolName: call.name,
        toolPayload: jsonValue({ memoryId: memory.id }),
        requiresConfirm: false,
      };
    }

    case "forget": {
      const memoryId = stringArg(call.arguments, "memoryId") || "";
      const forgotten = await forgetForUser(userId, workspaceId, memoryId);
      return {
        text: forgotten
          ? "Forgot that memory."
          : "I could not find that memory.",
        toolName: call.name,
        requiresConfirm: false,
      };
    }

    case "list_memories": {
      const memories = await listAgentMemories(userId, workspaceId);
      return {
        text: memories.length
          ? memories
              .map((memory) => `${memory.kind}: ${memory.content}`)
              .join("; ")
          : "No assistant memories are saved.",
        toolName: call.name,
        toolPayload: jsonValue({ memories }),
        requiresConfirm: false,
      };
    }

    case "query_schedule": {
      const limit = Math.min(
        Math.max(numberArg(call.arguments, "limit") || 5, 1),
        12
      );
      const tasks = await prisma.task.findMany({
        where: {
          ...scope,
          isArchived: false,
          status: { not: "completed" },
        },
        orderBy: [
          { scheduledStart: "asc" },
          { dueDate: "asc" },
          { createdAt: "desc" },
        ],
        take: limit,
        select: {
          id: true,
          title: true,
          scheduledStart: true,
          scheduledEnd: true,
          dueDate: true,
          priorityLevel: true,
        },
      });

      return {
        text: tasks.length
          ? `Upcoming work: ${tasks.map((task) => task.title).join(", ")}.`
          : "There are no open scheduled or due-date-prioritized tasks.",
        toolName: "query_schedule",
        toolPayload: jsonValue({ tasks }),
        requiresConfirm: false,
      };
    }

    case "manage_projects": {
      const action = stringArg(call.arguments, "action") || "list";
      if (action === "list") {
        const projects = await prisma.project.findMany({
          where: { ...scope, status: { not: "archived" } },
          orderBy: { updatedAt: "desc" },
          take: 12,
          select: {
            id: true,
            name: true,
            progress: true,
            color: true,
            icon: true,
          },
        });
        return {
          text: projects.length
            ? `Projects: ${projects.map((project) => project.name).join(", ")}.`
            : "No active projects yet.",
          toolName: "manage_projects",
          toolPayload: jsonValue({ action, projects }),
          requiresConfirm: false,
        };
      }

      if (action === "create") {
        const name = stringArg(call.arguments, "name");
        if (!name) {
          return {
            text: "I need a project name before I can create it.",
            toolName: "manage_projects",
            requiresConfirm: false,
          };
        }
        const project = await prisma.project.create({
          data: {
            userId,
            workspaceId,
            name: name.slice(0, 120),
            color: stringArg(call.arguments, "color"),
            icon: stringArg(call.arguments, "icon"),
          },
        });
        return {
          text: `Created project "${project.name}".`,
          toolName: "manage_projects",
          toolPayload: jsonValue({
            action,
            projectId: project.id,
            name: project.name,
            href: projectHref(project.id),
          }),
          requiresConfirm: false,
        };
      }

      const projectId = stringArg(call.arguments, "projectId");
      if (!projectId) {
        return {
          text: "I need the project id for that project action.",
          toolName: "manage_projects",
          requiresConfirm: false,
        };
      }

      if (action === "archive") {
        const project = await prisma.project.findFirst({
          where: { id: projectId, ...scope },
        });
        if (!project) {
          return {
            text: "I could not find that project to archive.",
            toolName: "manage_projects",
            requiresConfirm: false,
          };
        }
        const archived = await prisma.project.update({
          where: { id: project.id },
          data: { status: "archived" },
        });
        return {
          text: `Archived project "${archived.name}".`,
          toolName: "manage_projects",
          toolPayload: jsonValue({
            action,
            projectId: archived.id,
            href: projectHref(archived.id),
          }),
          requiresConfirm: false,
        };
      }

      const existingProject = await prisma.project.findFirst({
        where: { id: projectId, ...scope },
      });
      if (!existingProject) {
        return {
          text: "I could not find that project to update.",
          toolName: "manage_projects",
          requiresConfirm: false,
        };
      }
      const project = await prisma.project.update({
        where: { id: existingProject.id },
        data: {
          ...(stringArg(call.arguments, "name")
            ? { name: stringArg(call.arguments, "name")?.slice(0, 120) }
            : {}),
          ...(stringArg(call.arguments, "color")
            ? { color: stringArg(call.arguments, "color") }
            : {}),
          ...(stringArg(call.arguments, "icon")
            ? { icon: stringArg(call.arguments, "icon") }
            : {}),
        },
      });
      return {
        text: `Updated project "${project.name}".`,
        toolName: "manage_projects",
        toolPayload: jsonValue({
          action,
          projectId: project.id,
          href: projectHref(project.id),
        }),
        requiresConfirm: false,
      };
    }

    case "parse_brain_dump": {
      const text = stringArg(call.arguments, "text");
      if (!text) {
        return {
          text: "Paste the brain-dump text and I can structure it.",
          toolName: "parse_brain_dump",
          requiresConfirm: false,
        };
      }
      const parsed = await ai.parseTasks(text);
      return {
        text: parsed.length
          ? `Parsed ${parsed.length} tasks: ${parsed
              .map((task) => task.title)
              .join(", ")}.`
          : "I could not find any tasks in that brain dump.",
        toolName: "parse_brain_dump",
        toolPayload: jsonValue({ parsed }),
        requiresConfirm: false,
      };
    }

    default:
      return {
        text: "I can help with tasks, projects, calendar questions, and deterministic auto-scheduling.",
        toolName: null,
        requiresConfirm: false,
      };
  }
}
