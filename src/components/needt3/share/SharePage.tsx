"use client";

import { Suspense, useEffect, useMemo, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { NeedtPicker } from "@/components/ui/needt-picker";

import {
  useAddBoardItem,
  useBoards,
  useCreateBoard,
} from "@/lib/needt3/hooks/boards";
import { useCreateDoc } from "@/lib/needt3/hooks/docs";
import { useProjects } from "@/lib/needt3/hooks/projects";
import { useCreateTask } from "@/lib/needt3/hooks/tasks";
import { clearStash, readStash } from "@/lib/needt3/share-stash";
import {
  type ShareKind,
  defaultKind,
  hasShare,
  kindsFor,
  readShare,
  sharedBody,
  sharedTitle,
} from "@/lib/needt3/share-target";
import { notify } from "@/lib/notifications";

const KIND_LABEL: Record<ShareKind, string> = {
  task: "Task",
  doc: "Doc",
  board: "Moodboard item",
};
const NEW_BOARD = "__new";
const NO_PROJECT = "__none";

/**
 * The Share to Needt sheet: what another app shared, saved as a Task, a Doc or
 * a Moodboard item, in a project when one is picked. The link arrives here as a
 * GET (the service worker or `/api/share-target` redirected), so a signed-out
 * person is sent to sign in and comes back to this same URL.
 *
 * Works on Android (Chrome) only: iOS cannot make a home-screen app a share
 * target, so there the page is reached by hand and says so.
 */
export function SharePage() {
  return (
    <Suspense fallback={null}>
      <Sheet />
    </Suspense>
  );
}

function Sheet() {
  const router = useRouter();
  const params = useSearchParams();
  const share = useMemo(() => readShare((k) => params.get(k)), [params]);
  const [files, setFiles] = useState<File[]>([]);
  const [filesReady, setFilesReady] = useState(!share.files);

  useEffect(() => {
    let live = true;
    if (!share.stash || !share.files) return undefined;
    void readStash(share.stash, share.files).then((f) => {
      if (!live) return;
      setFiles(f);
      setFilesReady(true);
    });
    return () => {
      live = false;
    };
  }, [share.stash, share.files]);

  const fileTypes = files.map((f) => f.type);
  const kinds = kindsFor(share, fileTypes);
  const [picked, setPicked] = useState<ShareKind | null>(null);
  const kind =
    picked && kinds.includes(picked) ? picked : defaultKind(share, kinds);
  const [title, setTitle] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [busy, setBusy] = useState(false);

  const projects = useProjects().data ?? [];
  const boards = (useBoards().data ?? []).filter((b) => !b.trashedAt);
  const createTask = useCreateTask();
  const createDoc = useCreateDoc();
  const createBoard = useCreateBoard();
  const addItem = useAddBoardItem();

  const name = title ?? sharedTitle(share);

  const done = async (to: string) => {
    if (share.stash) await clearStash(share.stash, share.files);
    router.replace(to);
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const project = projectId || null;
      if (kind === "task") {
        await createTask.mutateAsync({
          draft: {
            title: name,
            notes: sharedBody(share) || null,
            projectId: project,
          },
        });
        notify.success("Saved as a task");
        await done("/tasks");
        return;
      }
      if (kind === "doc") {
        const doc = (
          await createDoc.mutateAsync({
            draft: { title: name, projectId: project },
          })
        ).result;
        if (!doc) throw new Error("no document");
        const body = sharedBody(share);
        if (body) {
          await fetch(`/api/pages/${doc.id}/blocks`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              blocks: body.split(/\n{2,}/).map((text, i) => ({
                type: "PARAGRAPH",
                content: { text },
                position: (i + 1) * 1024,
              })),
            }),
          }).catch(() => undefined);
        }
        for (const file of files) {
          const form = new FormData();
          form.append("file", file);
          await fetch(`/api/pages/${doc.id}/assets`, {
            method: "POST",
            body: form,
          }).catch(() => undefined);
        }
        notify.success("Saved as a doc");
        await done(`/pages/${doc.id}`);
        return;
      }
      let target = boardId;
      if (!target || target === NEW_BOARD) {
        const board = (
          await createBoard.mutateAsync({
            draft: { title: name, projectId: project },
          })
        ).result;
        if (!board) throw new Error("no board");
        target = board.id;
      }
      const pictures = files.filter((f) => f.type.startsWith("image/"));
      for (const file of pictures) {
        await addItem.mutateAsync({
          boardId: target,
          upload: { file, name: file.name, title: share.title || null },
        });
      }
      if (share.url) {
        await addItem.mutateAsync({
          boardId: target,
          draft: {
            kind: "link",
            url: share.url,
            title: share.title || share.text || null,
          },
        });
      } else if (share.text && !pictures.length) {
        await addItem.mutateAsync({
          boardId: target,
          draft: { kind: "note", text: share.text, title: share.title || null },
        });
      }
      notify.success("Saved to the moodboard");
      await done(`/moodboards/${target}`);
    } catch {
      // the write hooks have already said what failed
      setBusy(false);
    }
  };

  if (!hasShare(share) || (share.files > 0 && !filesReady)) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center px-5 py-10">
        <main className="w-full max-w-[420px] text-[var(--text-primary)]">
          <h1 className="text-[20px] font-semibold tracking-[-0.02em]">
            Share to Needt
          </h1>
          {share.files > 0 && !filesReady ? (
            <p className="mt-2 text-[13px] text-[var(--text-secondary)]">
              Reading what you shared…
            </p>
          ) : (
            <>
              <p className="mt-2 text-[13px] leading-5 text-[var(--text-secondary)]">
                Nothing was shared. In another app, tap Share and pick Needt:
                the text, link or picture lands here, and you choose a Task, a
                Doc or a Moodboard item.
              </p>
              <p className="mt-3 text-[12px] leading-5 text-[var(--text-muted)]">
                Sharing into Needt works on Android only, with Needt installed
                from Chrome. iPhone and iPad do not let a home-screen app
                receive shares; there, copy the text and use Quick add.
              </p>
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60dvh] items-end justify-center px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-10 sm:items-center">
      <main
        className="w-full max-w-[460px] rounded-2xl border border-[var(--border-subtle)] p-4 text-[var(--text-primary)]"
        data-share-sheet=""
      >
        <h1 className="text-[15px] font-semibold">Save to Needt</h1>
        <div className="mt-3 flex gap-1.5" role="tablist" aria-label="Save as">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === kind}
              onClick={() => setPicked(k)}
              className={
                "h-9 flex-1 rounded-[var(--control-radius)] border text-[13px] " +
                (k === kind
                  ? "border-[var(--text-primary)] font-medium"
                  : "border-[var(--border-subtle)] text-[var(--text-secondary)]")
              }
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        <label className="mt-3 block text-[12px] text-[var(--text-muted)]">
          Title
          <input
            value={name}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 h-10 w-full rounded-[var(--control-radius)] border border-[var(--border-subtle)] bg-transparent px-3 text-[13px] text-[var(--text-primary)]"
          />
        </label>

        {share.text || share.url || files.length ? (
          <p className="mt-2 line-clamp-3 break-words text-[12px] leading-5 text-[var(--text-secondary)]">
            {[
              share.text,
              share.url,
              files.length
                ? `${files.length} file${files.length === 1 ? "" : "s"}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        {kind === "task" && files.length ? (
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">
            A task keeps text and a link, not files. Pick Doc or Moodboard item
            to keep them.
          </p>
        ) : null}

        {kind === "board" ? (
          <label className="mt-3 block text-[12px] text-[var(--text-muted)]">
            Moodboard
            <NeedtPicker
              value={boardId || NEW_BOARD}
              options={[
                { value: NEW_BOARD, label: "New moodboard" },
                ...boards.map((b) => ({
                  value: b.id,
                  label: b.title || "Untitled",
                })),
              ]}
              onValueChange={(v) => setBoardId(v)}
              ariaLabel="Moodboard"
              triggerVariant="field"
              className="mt-1 w-full"
            />
          </label>
        ) : null}

        <label className="mt-3 block text-[12px] text-[var(--text-muted)]">
          Project
          <NeedtPicker
            value={projectId || NO_PROJECT}
            options={[
              { value: NO_PROJECT, label: "No project" },
              ...projects.map((p) => ({ value: p.id, label: p.name })),
            ]}
            onValueChange={(v) => setProjectId(v === NO_PROJECT ? "" : v)}
            ariaLabel="Project"
            triggerVariant="field"
            className="mt-1 w-full"
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => void done("/today")}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </main>
    </div>
  );
}
