"use client";

/**
 * What the task editor reads and writes beside the task row: the person's
 * labels (`/api/tags`), their work schedules for Hours (`/api/work-schedules`)
 * and the files on a task (`/api/tasks/:id/attachments`).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type ApiTag,
  type V3Label,
  attachmentFromApi,
  labelFromApi,
} from "@/lib/needt3/map";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { ApiError, fetchJson, sendJson } from "./core";

/** Every label the person has (a `Tag`), by name. */
export function useLabels() {
  return useQuery({
    queryKey: qk.labels(),
    queryFn: async (): Promise<V3Label[]> =>
      (await fetchJson<ApiTag[]>("/api/tags")).map(labelFromApi),
    staleTime: 60_000,
  });
}

/** Make a label; the server refuses a second one with the same name. */
export function useCreateLabel() {
  const qc = useQueryClient();
  return async (name: string): Promise<V3Label | null> => {
    try {
      const made = labelFromApi(
        await sendJson<ApiTag>("/api/tags", "POST", { name })
      );
      void qc.invalidateQueries({ queryKey: qk.labels() });
      return made;
    } catch (error) {
      notify.error(
        error instanceof ApiError
          ? error.message
          : "Could not make that label. Try again."
      );
      return null;
    }
  };
}

export interface V3Hours {
  id: string;
  name: string;
  isDefault: boolean;
}

/** The person's work schedules: what "Hours" chooses between. */
export function useWorkSchedules() {
  return useQuery({
    queryKey: qk.workSchedules(),
    queryFn: async (): Promise<V3Hours[]> => {
      const body = await fetchJson<{
        schedules?: { id: string; name: string; isDefault?: boolean }[];
      }>("/api/work-schedules");
      return (body.schedules ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        isDefault: s.isDefault === true,
      }));
    },
    staleTime: 5 * 60_000,
  });
}

async function refusal(res: Response, fallback: string): Promise<ApiError> {
  let message = fallback;
  try {
    const j = (await res.json()) as { error?: unknown };
    if (typeof j.error === "string") message = j.error;
  } catch {
    /* keep the generic line */
  }
  return new ApiError(res.status, message);
}

/** Attach files to a task and remove them. A refusal is shown as the server worded it. */
export function useTaskAttachments(taskId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.task(taskId) });
    void qc.invalidateQueries({ queryKey: qk.tasks() });
  };
  const add = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        body,
      });
      if (!res.ok) throw await refusal(res, "Could not attach the file.");
      const { attachment } = (await res.json()) as {
        attachment: Parameters<typeof attachmentFromApi>[1];
      };
      return attachmentFromApi(taskId, attachment);
    },
    onSuccess: refresh,
    onError: (error) =>
      notify.error(
        error instanceof ApiError ? error.message : "Could not attach the file."
      ),
  });
  const remove = useMutation({
    mutationFn: async (attachmentId: string) => {
      const res = await fetch(
        `/api/tasks/${taskId}/attachments/${attachmentId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw await refusal(res, "Could not remove the file.");
    },
    onSuccess: refresh,
    onError: (error) =>
      notify.error(
        error instanceof ApiError ? error.message : "Could not remove the file."
      ),
  });
  return { add, remove };
}
