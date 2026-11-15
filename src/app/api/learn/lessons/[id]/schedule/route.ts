import { NextRequest } from "next/server";

import { learnAuth, learnRespond } from "@/services/learn/http";
import {
  isProLearner,
  ownedLesson,
  setLessonTask,
} from "@/services/learn/store";
import { OpError, runOp } from "@/services/ops";

import { learnLessonHref } from "@/lib/needt3/learn";

const LOG_SOURCE = "learn-lesson-schedule-route";

type Params = { params: Promise<{ id: string }> };

/**
 * POST -> { lesson, taskId, actionId }: "Put in calendar" (Pro). Makes an
 * auto-scheduled task for the lesson through `task.create`, so the scheduler
 * places it like any task and undo works as it does everywhere; the lesson
 * keeps the task's id. A lesson already in the calendar answers its task.
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
      const lesson = await ownedLesson(auth.userId, id);
      if (lesson.scheduledTaskId)
        return { taskId: lesson.scheduledTaskId, actionId: null };
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
      const updated = await setLessonTask(auth.userId, id, taskId);
      return { lesson: updated, taskId, actionId: run.actionId ?? null };
    },
    201
  );
}
