"use client";

import { useState } from "react";

import { useSession } from "next-auth/react";

import { formatInTimeZone } from "@/lib/date-utils";
import {
  type ItemComment,
  useItemCommentActions,
  useItemComments,
} from "@/lib/needt3/hooks/board-comments";

/**
 * The thread on one reference (desktop Detail sheet and phone item sheet).
 * Open comments first, resolved ones folded below. Anyone who can see the
 * board reads; `canWrite` (editor and above) posts; the author or someone with
 * full access (`canModerate`) resolves and deletes.
 */
export function ItemComments({
  boardId,
  itemId,
  canWrite,
  canModerate,
  tz,
  phone = false,
}: {
  boardId: string;
  itemId: string;
  canWrite: boolean;
  canModerate: boolean;
  tz: string;
  phone?: boolean;
}) {
  const { data: session } = useSession();
  const comments = useItemComments(boardId, itemId);
  const { post, resolve, remove } = useItemCommentActions(boardId, itemId);
  const [draft, setDraft] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const all = comments.data ?? [];
  const open = all.filter((c) => !c.resolvedAt);
  const resolved = all.filter((c) => c.resolvedAt);
  // Nothing to read and nobody who may write: leave the sheet as it was.
  if (!canWrite && !all.length && !comments.isPending) return null;

  const send = () => {
    const body = draft.trim();
    if (!body || post.isPending) return;
    post.mutate(body, { onSuccess: () => setDraft("") });
  };

  const row = (c: ItemComment) => {
    const mine = !!session?.user?.id && session.user.id === c.authorId;
    const may = canWrite && (mine || canModerate);
    return (
      <li key={c.id} className="mb-comment" data-mb-comment={c.id}>
        <span className="mb-comment-head">
          <span className="pl-strong">
            {c.author.name ?? c.author.email ?? "Someone"}
          </span>
          <span className="pl-meta">
            {formatInTimeZone(c.createdAt, tz, "d MMM")}
          </span>
        </span>
        <p className="mb-comment-body">{c.body}</p>
        {may ? (
          <span className="mb-comment-acts">
            <button
              type="button"
              className="nx-btn nx-btn-text nx-btn-sm"
              disabled={resolve.isPending}
              onClick={() =>
                resolve.mutate({ id: c.id, resolved: !c.resolvedAt })
              }
            >
              {c.resolvedAt ? "Reopen" : "Resolve"}
            </button>
            <button
              type="button"
              className="nx-btn nx-btn-text nx-btn-sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate(c.id)}
            >
              Delete
            </button>
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <section
      className={"mb-comments" + (phone ? " is-phone" : "")}
      aria-label="Comments"
      data-mb-comments=""
    >
      <span className="pl-label">
        Comments{open.length ? ` · ${open.length}` : ""}
      </span>
      {comments.isError ? (
        <p className="pl-meta" role="alert">
          Could not load the comments.
        </p>
      ) : open.length ? (
        <ul className="mb-comment-list">{open.map(row)}</ul>
      ) : comments.isPending ? null : (
        <p className="pl-meta">No comments yet</p>
      )}
      {resolved.length ? (
        <>
          <button
            type="button"
            className="nx-btn nx-btn-text nx-btn-sm mb-comment-fold"
            aria-expanded={showResolved}
            onClick={() => setShowResolved((v) => !v)}
          >
            {showResolved ? "Hide" : "Show"} resolved ({resolved.length})
          </button>
          {showResolved ? (
            <ul className="mb-comment-list is-resolved">{resolved.map(row)}</ul>
          ) : null}
        </>
      ) : null}
      {canWrite ? (
        <form
          className="mb-comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            name="mb-comment"
            value={draft}
            rows={2}
            maxLength={4000}
            autoComplete="off"
            placeholder="Add a comment"
            aria-label="Add a comment"
            className="pl-field is-area"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            type="submit"
            className="nx-btn nx-btn-secondary nx-btn-sm"
            disabled={!draft.trim() || post.isPending}
          >
            Comment
          </button>
        </form>
      ) : null}
    </section>
  );
}
