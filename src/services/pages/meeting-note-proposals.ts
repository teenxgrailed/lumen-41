import {
  MeetingProposalStatus,
  Prisma,
  SchedulingEnergyLevel,
  SchedulingRunSource,
  SchedulingTaskPriority,
} from "@prisma/client";
import { z } from "zod";

import { recordActivation } from "@/lib/activation-events";
import type { PageAccessActor } from "@/lib/auth/page-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";
import { PageAccessRole } from "@prisma/client";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { createSchedulingRun, executeSchedulingRun } from "@/services/scheduling/runs";

const createTaskAction = z.object({
  type: z.literal("CREATE_TASK"),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  estimatedMinutes: z.number().int().min(5).max(480).default(30),
  deadline: z.string().datetime().nullable().optional(),
  energyRequired: z.nativeEnum(SchedulingEnergyLevel).default(SchedulingEnergyLevel.MEDIUM),
  priority: z.nativeEnum(SchedulingTaskPriority).default(SchedulingTaskPriority.MEDIUM),
  schedule: z.boolean().default(false),
});
const rescheduleAction = z.object({ type: z.literal("RESCHEDULE_WORKSPACE") });
export const meetingActionsSchema = z
  .array(z.discriminatedUnion("type", [createTaskAction, rescheduleAction]))
  .min(1)
  .max(25);

export async function createMeetingNoteProposal(
  actor: PageAccessActor,
  pageId: string,
  input: { summary: string; actions: unknown }
) {
  const access = await resolvePageAccess(actor, pageId, PageAccessRole.EDITOR);
  if (!access || !actor.workspace) return null;
  const page = await prisma.page.findFirst({
    where: { id: pageId, workspaceId: actor.workspace.workspaceId, trashedAt: null },
    select: { id: true, updatedAt: true },
  });
  if (!page) return null;
  const actions = meetingActionsSchema.parse(input.actions);
  return prisma.meetingNoteProposal.create({
    data: {
      workspaceId: actor.workspace.workspaceId,
      pageId,
      createdById: actor.userId,
      summary: input.summary.trim().slice(0, 500),
      actions: actions as Prisma.InputJsonValue,
      pageUpdatedAt: page.updatedAt,
    },
  });
}

export async function decideMeetingNoteProposal(
  actor: PageAccessActor,
  pageId: string,
  proposalId: string,
  decision: "approve" | "reject"
) {
  if (!actor.workspace) return null;
  const proposal = await prisma.meetingNoteProposal.findFirst({
    where: {
      id: proposalId,
      pageId,
      workspaceId: actor.workspace.workspaceId,
      status: MeetingProposalStatus.PENDING,
    },
    include: { page: { select: { id: true, updatedAt: true, trashedAt: true } } },
  });
  if (!proposal || proposal.page.trashedAt) return null;
  const access = await resolvePageAccess(
    actor,
    proposal.pageId,
    decision === "approve" ? PageAccessRole.EDITOR : PageAccessRole.VIEWER
  );
  if (!access) return null;
  if (decision === "reject") {
    return prisma.meetingNoteProposal.update({
      where: { id: proposal.id },
      data: { status: MeetingProposalStatus.REJECTED, rejectedAt: newDate() },
    });
  }
  if (proposal.page.updatedAt.getTime() !== proposal.pageUpdatedAt.getTime()) {
    return { stale: true as const, pageUpdatedAt: proposal.page.updatedAt };
  }
  const actions = meetingActionsSchema.parse(proposal.actions);
  const taskActions = actions.filter((action) => action.type === "CREATE_TASK");
  const scheduleRequested = actions.some(
    (action) => action.type === "RESCHEDULE_WORKSPACE" || (action.type === "CREATE_TASK" && action.schedule)
  );
  const applied = await prisma.$transaction(async (tx) => {
    const claimed = await tx.meetingNoteProposal.updateMany({
      where: { id: proposal.id, status: MeetingProposalStatus.PENDING },
      data: { status: MeetingProposalStatus.APPLIED, appliedAt: newDate() },
    });
    if (claimed.count !== 1) return null;
    const tasks = await Promise.all(
      taskActions.map((action) =>
        tx.task.create({
          data: {
            title: action.title,
            description: action.description,
            status: "todo",
            estimatedMinutes: action.estimatedMinutes,
            duration: action.estimatedMinutes,
            deadline: action.deadline ? newDate(action.deadline) : null,
            energyRequired: action.energyRequired,
            priorityLevel: action.priority,
            userId: actor.userId,
            workspaceId: actor.workspace!.workspaceId,
            assigneeId: actor.userId,
            isAutoScheduled: action.schedule,
            autoScheduled: action.schedule,
          },
          select: { id: true, title: true },
        })
      )
    );
    return tasks;
  });
  if (!applied) return null;
  if (applied.length > 0) {
    recordActivation("task_created", actor.userId, { source: "meeting_note" });
  }
  let schedulingRunId: string | null = null;
  if (scheduleRequested) {
    const run = await createSchedulingRun({
      userId: actor.userId,
      workspaceId: actor.workspace.workspaceId,
      source: SchedulingRunSource.MEETING_PROPOSAL,
      dedupeKey: `meeting-proposal:${proposal.id}`,
    });
    schedulingRunId = run.id;
    await prisma.meetingNoteProposal.update({ where: { id: proposal.id }, data: { schedulingRunId } });
    await executeSchedulingRun(run.id);
  }
    return {
      stale: false as const,
      proposalId: proposal.id,
      tasks: applied.map((task) => ({
        ...task,
        href: `/tasks?task=${encodeURIComponent(task.id)}`,
      })),
      schedulingRunId,
      schedulingRunHref: schedulingRunId
        ? `/api/tasks/schedule-runs/${encodeURIComponent(schedulingRunId)}`
        : null,
    };
}
