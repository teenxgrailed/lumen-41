import { NextRequest } from "next/server";

import { learnAuth, learnRespond } from "@/services/learn/http";
import {
  claimLessonSchedule,
  finishLessonSchedule,
  getLesson,
  isProLearner,
  releaseLessonSchedule,
} from "@/services/learn/store";
import { OpError, runOp } from "@/services/ops";

import { learnLessonHref } from "@/lib/needt3/learn";

const LOG_SOURCE = "learn-lesson-schedule-route";

type Params = { params: Promise<{ id: string }> };

/**
 * POST -> { lesson, taskId, actionId }: "Put in calendar" (Pro). The lesson
 * is claimed first (one conditional write), then an auto-scheduled task is
 * made through `task.create`, so the scheduler places it like any task and
 * undo works as everywhere; then the lesson keeps the task's id. If making
 * the task fails, the claim is given back. A lesson whose task still exists
 * answers that task; one whose task was deleted can be scheduled again.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await learnAuth(request, LOG_SOURCE, { write: true });
  if ("response" in auth) return auth.response;
  return learnRespond(
    LOG_SOURCE,
    async () => {
      if (!(await isProLearner(auth.userId)))
        throw new OpError(
          "UPGRADE_REQUIRED",
          "Lessons in the calendar are part of Pro."
        );
      const claim = await claimLessonSchedule(auth.userId, id);
      if (claim.state === "scheduled")
        return {
          lesson: await getLesson(auth.userId, id),
          taskId: claim.taskId,
          actionId: null,
        };
      const { lesson } = claim;
      try {
        const run = await runOp<{ task?: { id: string } }>(
          "task.create",
          {
            title: lesson.title,
            notes: `Learn lesson: ${learnLessonHref(lesson.topicId, lesson.id)}`,
            estimateMinutes: lesson.minutes,
            autoSchedule: true,
          },
          { userId: auth.userId, workspace: auth.workspace, actor: auth.actor }
        );
        const taskId = run.result.task?.id;
        if (!taskId) throw new OpError("CONFLICT", "The task was not created");
        const updated = await finishLessonSchedule(auth.userId, id, taskId);
        return { lesson: updated, taskId, actionId: run.actionId ?? null };
      } catch (error) {
        await releaseLessonSchedule(auth.userId, id, claim.previous);
        throw error;
      }
    },
    201
  );
}
