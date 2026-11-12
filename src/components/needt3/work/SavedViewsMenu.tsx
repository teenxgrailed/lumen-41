"use client";

import { useState } from "react";

import * as Popover from "@radix-ui/react-popover";
import { LuBookmark, LuCheck, LuPencil, LuTrash2 } from "react-icons/lu";

import { useWorkspace } from "@/components/providers/WorkspaceProvider";

import {
  useCreateSavedView,
  useDeleteSavedView,
  useSavedViews,
  useUpdateSavedView,
} from "@/lib/needt3/hooks/saved-views";
import {
  type ApiSavedView,
  type TaskViewState,
  activeSavedView,
  fromSavedView,
  toSavedViewQuery,
} from "@/lib/needt3/saved-task-views";
import { notify } from "@/lib/notifications";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { useExit } from "../ctx/useExit";
import { V3Switch } from "../settings/kit";

const MAX_NAME = 80;

/**
 * Saved views on Tasks: the current list (tab, project, sort, grouping,
 * completed tasks) under a name, the person's own or shared with the
 * workspace. Picking one puts the list back; the trigger carries the name of
 * the view the list currently matches. Stored through `/api/saved-views`.
 */
export function SavedViewsMenu({
  current,
  projectIds,
  onApply,
}: {
  current: TaskViewState;
  projectIds: readonly string[];
  onApply: (state: TaskViewState) => void;
}) {
  const container = useV3PortalContainer();
  const [open, setOpen] = useState(false);
  const [shown, leaving] = useExit(open, 130);
  const viewsQ = useSavedViews();
  const views = viewsQ.data ?? [];
  const active = activeSavedView(views, current, projectIds);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="nx-btn nx-btn-text nx-btn-sm sv-trigger"
          aria-label={active ? `Saved view: ${active.name}` : "Saved views"}
          title="Saved views"
          data-saved-views-trigger=""
          aria-expanded={open}
        >
          <LuBookmark size={14} aria-hidden />
          <span className="nx-ellipsis sv-trigger-label">
            {active ? active.name : "Views"}
          </span>
        </button>
      </Popover.Trigger>
      {shown && container ? (
        <Popover.Portal container={container} forceMount>
          <Popover.Content
            forceMount
            align="end"
            sideOffset={6}
            collisionPadding={8}
            className={`nx-pop is-right sv-pop${leaving ? " is-leaving" : ""}`}
            data-saved-views=""
          >
            <SavedViewsPanel
              views={views}
              loading={viewsQ.isPending}
              active={active}
              current={current}
              onPick={(v) => {
                onApply(fromSavedView(v));
                setOpen(false);
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      ) : null}
    </Popover.Root>
  );
}

function SavedViewsPanel({
  views,
  loading,
  active,
  current,
  onPick,
}: {
  views: ApiSavedView[];
  loading: boolean;
  active: ApiSavedView | null;
  current: TaskViewState;
  onPick: (v: ApiSavedView) => void;
}) {
  const { activeWorkspace } = useWorkspace();
  const shared = activeWorkspace?.workspace.kind === "SHARED";
  const editor =
    activeWorkspace?.role === "OWNER" || activeWorkspace?.role === "EDITOR";
  const create = useCreateSavedView();
  const update = useUpdateSavedView();
  const remove = useDeleteSavedView();
  const [name, setName] = useState("");
  const [share, setShare] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [rename, setRename] = useState("");

  const canManage = (v: ApiSavedView) => v.visibility === "PERSONAL" || editor;

  const save = () => {
    const n = name.trim().slice(0, MAX_NAME);
    if (!n) return;
    setName("");
    void create
      .mutateAsync({
        draft: {
          name: n,
          visibility: shared && editor && share ? "WORKSPACE" : "PERSONAL",
          position: (views.at(-1)?.position ?? 0) + 1,
          query: toSavedViewQuery(current),
        },
      })
      .then(({ undo }) =>
        notify.success(`Saved “${n}”`, {
          action: { label: "Undo", onClick: () => void undo() },
        })
      )
      .catch(() => undefined);
  };

  const commitRename = (v: ApiSavedView) => {
    const n = rename.trim().slice(0, MAX_NAME);
    setRenaming(null);
    if (!n || n === v.name) return;
    void update
      .mutateAsync({ id: v.id, patch: { name: n } })
      .then(({ undo }) =>
        notify.success(`Renamed to “${n}”`, {
          action: { label: "Undo", onClick: () => void undo() },
        })
      )
      .catch(() => undefined);
  };

  const del = (v: ApiSavedView) => {
    void remove
      .mutateAsync({ view: v })
      .then(({ undo }) =>
        notify.success(`Deleted “${v.name}”`, {
          action: { label: "Undo", onClick: () => void undo() },
        })
      )
      .catch(() => undefined);
  };

  return (
    <div className="sv-panel">
      <div className="sv-title">Saved views</div>
      {views.length ? (
        <ul className="sv-list" role="list">
          {views.map((v) =>
            renaming === v.id ? (
              <li key={v.id} className="sv-row" data-sv-row={v.id}>
                <input
                  autoFocus
                  className="nt-input sv-input"
                  value={rename}
                  maxLength={MAX_NAME}
                  aria-label="View name"
                  onChange={(e) => setRename(e.target.value)}
                  onBlur={() => commitRename(v)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(v);
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setRenaming(null);
                    }
                  }}
                />
              </li>
            ) : (
              <li key={v.id} className="sv-row" data-sv-row={v.id}>
                <button
                  type="button"
                  className="sv-pick"
                  aria-current={active?.id === v.id ? "true" : undefined}
                  onClick={() => onPick(v)}
                >
                  <span className="sv-mark" aria-hidden>
                    {active?.id === v.id ? <LuCheck size={14} /> : null}
                  </span>
                  <span className="nx-ellipsis sv-name">{v.name}</span>
                  {v.visibility === "WORKSPACE" ? (
                    <span className="sv-meta">Shared</span>
                  ) : null}
                </button>
                {canManage(v) ? (
                  <span className="sv-actions">
                    <button
                      type="button"
                      className="nx-btn nx-btn-text sv-act"
                      aria-label={`Rename ${v.name}`}
                      title="Rename"
                      onClick={() => {
                        setRename(v.name);
                        setRenaming(v.id);
                      }}
                    >
                      <LuPencil size={13} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="nx-btn nx-btn-text sv-act"
                      aria-label={`Delete ${v.name}`}
                      title="Delete"
                      onClick={() => del(v)}
                    >
                      <LuTrash2 size={13} aria-hidden />
                    </button>
                  </span>
                ) : null}
              </li>
            )
          )}
        </ul>
      ) : (
        <p className="sv-empty">
          {loading
            ? "Loading…"
            : "Save this list to come back to it in one click."}
        </p>
      )}
      <form
        className="sv-save"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="sv-save-line">
          <input
            className="nt-input sv-input"
            value={name}
            maxLength={MAX_NAME}
            placeholder="Name this view"
            aria-label="New view name"
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="submit"
            className="nx-btn nx-btn-secondary nx-btn-sm"
            disabled={!name.trim()}
          >
            Save
          </button>
        </div>
        {shared && editor ? (
          <div className="nt-row sv-share">
            <span className="nt-row-label">Share</span>
            <div className="nt-row-control">
              <V3Switch
                checked={share}
                onChange={setShare}
                label="Share with workspace"
              />
            </div>
            <span className="nt-row-hint">
              Everyone in the workspace sees it in their list.
            </span>
          </div>
        ) : null}
      </form>
    </div>
  );
}
