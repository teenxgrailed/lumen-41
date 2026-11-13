"use client";

import { Suspense, useEffect, useMemo, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { SSelect } from "@/components/needt3/settings/kit";
import { Segmented } from "@/components/needt3/shell/Segmented";

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
        className="w-full max-w-[460px] p-4 text-[var(--text-primary)]"
        style={{
          borderRadius: 16,
          background: "var(--surface-raised)",
          boxShadow: "var(--shadow-ring)",
        }}
        data-share-sheet=""
      >
        <h1 style={{ font: "var(--type-ui-medium)" }}>Save to Needt</h1>
        <div className="mt-3">
          <Segmented
            value={kind}
            options={kinds.map((k) => ({ id: k, label: KIND_LABEL[k] }))}
            onChange={setPicked}
            label="Save as"
          />
        </div>

        <label
          className="mt-3 block text-[12px]"
          style={{ color: "var(--text-tertiary)" }}
        >
          Title
          <input
            value={name}
            onChange={(e) => setTitle(e.target.value)}
            className="nt-input mt-1"
          />
        </label>

        {share.text || share.url || files.length ? (
          <p
            className="mt-2 line-clamp-3 break-words text-[12px] leading-5"
            style={{ color: "var(--text-secondary)" }}
          >
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
          <p
            className="mt-1 text-[12px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            A task keeps text and a link, not files. Pick Doc or Moodboard item
            to keep them.
          </p>
        ) : null}

        {kind === "board" ? (
          <div
            className="mt-3 text-[12px]"
            style={{ color: "var(--text-tertiary)" }}
          >
            Moodboard
            <div className="mt-1">
              <SSelect
                value={boardId || NEW_BOARD}
                options={[
                  [NEW_BOARD, "New moodboard"],
                  ...boards.map((b) => [b.id, b.title || "Untitled"] as const),
                ]}
                onChange={(v) => setBoardId(v)}
                label="Moodboard"
                width="100%"
                align="start"
              />
            </div>
          </div>
        ) : null}

        <div
          className="mt-3 text-[12px]"
          style={{ color: "var(--text-tertiary)" }}
        >
          Project
          <div className="mt-1">
            <SSelect
              value={projectId || NO_PROJECT}
              options={[
                [NO_PROJECT, "No project"],
                ...projects.map((p) => [p.id, p.name] as const),
              ]}
              onChange={(v) => setProjectId(v === NO_PROJECT ? "" : v)}
              label="Project"
              width="100%"
              align="start"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="nx-btn nx-btn-text"
            disabled={busy}
            onClick={() => void done("/today")}
          >
            Cancel
          </button>
          <button
            type="button"
            className="nx-btn nx-btn-primary"
            disabled={busy || !name.trim()}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </main>
    </div>
  );
}
