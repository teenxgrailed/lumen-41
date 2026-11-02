import { newDate } from "@/lib/date-utils";
import {
  type RecurringAlreadyDoneBody,
  noticeRecurringAlreadyDone,
} from "@/lib/recurring-already-done";

import { NewTask, Task, UpdateTask } from "@/types/task";

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export class TaskApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "TaskApiError";
  }
}

async function readError(response: Response, fallback: string) {
  const detail = (await response.text()).trim();
  try {
    const payload = JSON.parse(detail) as { error?: string; message?: string };
    return new TaskApiError(
      payload.message || fallback,
      response.status,
      payload.error
    );
  } catch {
    return new TaskApiError(detail || fallback, response.status);
  }
}

export async function createTaskRequest(task: NewTask): Promise<Task> {
  const response = await fetch("/api/tasks", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(task),
  });

  if (!response.ok) {
    throw await readError(response, "Failed to create task");
  }

  return response.json() as Promise<Task>;
}

export async function updateTaskRequest(
  id: string,
  updates: UpdateTask,
  baseRevision?: Date | string
): Promise<Task | null> {
  const response = await fetch(`/api/tasks/${id}`, {
    method: "PUT",
    headers: {
      ...JSON_HEADERS,
      ...(baseRevision
        ? { "If-Match": newDate(baseRevision).toISOString() }
        : {}),
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw await readError(response, "Failed to update task");
  }
  if (response.status === 202) return null;

  const task = (await response.json()) as Task & RecurringAlreadyDoneBody;
  // A repeat tick on a recurring task changed nothing; the row that came back
  // is the task as it is, so it also puts the optimistic tick back.
  noticeRecurringAlreadyDone(task);
  return task;
}

export async function deleteTaskRequest(
  id: string,
  baseRevision?: Date | string
): Promise<boolean> {
  const response = await fetch(`/api/tasks/${id}`, {
    method: "DELETE",
    headers: baseRevision
      ? { "If-Match": newDate(baseRevision).toISOString() }
      : undefined,
  });

  if (!response.ok) {
    throw await readError(response, "Failed to archive task");
  }
  return response.status === 202;
}
