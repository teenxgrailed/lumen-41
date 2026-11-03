"use client";

import { useRef } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/needt3/hooks/core";
import { notify } from "@/lib/notifications";

import { ProGate, useIsPro } from "../paywall/Pro";
import { AgBtn } from "./AgParts";

interface HubFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  uploadedBy: string;
  createdAt: string;
}

const MAX_BYTES = 25 * 1024 * 1024;

function sizeText(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The files on one hub item: a download link per file and an upload button. */
export function ItemFiles({ id }: { id: string }) {
  const pro = useIsPro();
  const client = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const key = ["agent-hub", "item", id, "files"];
  const files = useQuery({
    queryKey: key,
    queryFn: () =>
      fetchJson<{ attachments: HubFile[] }>(
        `/api/agent-hub/items/${id}/attachments`
      ),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > MAX_BYTES)
        throw new Error("Files must be 25 MB or smaller.");
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/agent-hub/items/${id}/attachments`, {
        method: "POST",
        body,
      });
      if (!res.ok) {
        const problem = (await res.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(problem?.message ?? "Could not attach the file.");
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: (error) =>
      notify.error(
        error instanceof Error ? error.message : "Could not attach the file."
      ),
  });
  const remove = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await fetch(`/api/agent-hub/attachments/${fileId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not remove the file.");
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: (error) =>
      notify.error(
        error instanceof Error ? error.message : "Could not remove the file."
      ),
  });
  const list = files.data?.attachments ?? [];
  return (
    <>
      <span className="ag-detail-k">Files:</span>
      {list.map((file) => (
        <span key={file.id} className="ag-file">
          <a
            href={`/api/agent-hub/attachments/${file.id}`}
            download={file.name}
          >
            {file.name}
          </a>
          <span className="ag-detail-k">
            {`${sizeText(file.size)}, from ${file.uploadedBy}`}
          </span>
          <AgBtn
            tone="text"
            disabled={remove.isPending}
            onClick={() => remove.mutate(file.id)}
          >
            Remove
          </AgBtn>
        </span>
      ))}
      {!list.length && !files.isLoading ? (
        <span className="ag-detail-k">None yet.</span>
      ) : null}
      <span>
        <input
          ref={input}
          type="file"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) upload.mutate(file);
          }}
        />
        {pro ? (
          <AgBtn
            tone="secondary"
            disabled={upload.isPending}
            onClick={() => input.current?.click()}
          >
            {upload.isPending ? "Uploading" : "Attach a file"}
          </AgBtn>
        ) : (
          <ProGate feature="attachments">
            <AgBtn tone="secondary">Attach a file</AgBtn>
          </ProGate>
        )}
      </span>
    </>
  );
}
