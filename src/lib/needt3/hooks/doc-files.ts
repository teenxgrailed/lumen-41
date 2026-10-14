"use client";

/**
 * The files attached to a page (the document rail's Files tab): the list
 * (`GET /api/pages/:id/assets`) and the one write the rail offers, adding a
 * file (`POST /api/pages/:id/assets`, 10 MB at most).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notify } from "@/lib/notifications";

import { qk } from "../query-keys";
import { ApiError, fetchJson } from "./core";

export interface V3PageFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string | null;
  /** Where the bytes are read from. */
  url: string;
}

interface ApiAsset {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt?: string;
}

const fileFromApi = (pageId: string, a: ApiAsset): V3PageFile => ({
  id: a.id,
  name: a.originalName,
  mimeType: a.mimeType,
  size: a.size,
  createdAt: a.createdAt ?? null,
  url: `/api/pages/${pageId}/assets/${a.id}`,
});

export function usePageFiles(id: string | null | undefined) {
  return useQuery({
    queryKey: qk.pageAssets(id ?? ""),
    enabled: !!id,
    queryFn: async (): Promise<V3PageFile[]> =>
      (
        await fetchJson<{ assets: ApiAsset[] }>(`/api/pages/${id}/assets`)
      ).assets.map((a) => fileFromApi(id!, a)),
  });
}

/** Add a file to the page. A refusal (too big, no edit access) is shown as the server worded it. */
export function useAddPageFile(id: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/pages/${id}/assets`, {
        method: "POST",
        body,
      });
      if (!res.ok) {
        let message = "Could not add the file.";
        try {
          const j = (await res.json()) as { error?: unknown };
          if (typeof j.error === "string") message = j.error;
        } catch {
          /* keep the generic line */
        }
        throw new ApiError(res.status, message);
      }
      return file.name;
    },
    onSuccess: (name) => {
      notify.success(`Added “${name}”`);
      void qc.invalidateQueries({ queryKey: qk.pageAssets(id ?? "") });
    },
    onError: (error) => {
      notify.error(
        error instanceof ApiError ? error.message : "Could not add the file."
      );
    },
  });
}
