"use client";

import { useEffect, useRef, useState } from "react";

import { useSession } from "next-auth/react";

import { LuGlobe, LuLink, LuLock } from "react-icons/lu";

import {
  useBoardAccess,
  useSetBoardGrant,
} from "@/lib/needt3/hooks/board-share";
import { useBoard } from "@/lib/needt3/hooks/boards";
import type { BoardRole } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { RoleSelect } from "./RoleSelect";
import {
  INVITE_ROLES,
  ROLE_LABEL,
  canManage,
  checkInvite,
  personName,
  publicBoardUrl,
  shareSubline,
} from "./logic";
import { Avatars, BoardDialog, DialogFoot, DialogHead } from "./parts";

/**
 * Share (places.jsx `ShareSheet`) over `MoodboardAccessGrant` and
 * `Moodboard.linkShare`. Roles are the server's: only full access may change
 * anything here, and an invite reaches people already in the workspace
 * (nobody is emailed). Everyone else sees who is on the board.
 */
export function ShareDialog({
  boardId,
  title,
  open,
  onClose,
  onLinkShare,
}: {
  boardId: string;
  title: string;
  open: boolean;
  onClose: () => void;
  onLinkShare: (on: boolean) => Promise<boolean>;
}) {
  const { data: session } = useSession();
  const access = useBoardAccess(boardId, open);
  const board = useBoard(open ? boardId : null);
  const setGrant = useSetBoardGrant();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<BoardRole>("VIEWER");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    setEmail("");
    setRole("VIEWER");
    const t = window.setTimeout(() => input.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  const data = access.data;
  const manage = canManage(data?.myRole);
  const grants = data?.grants ?? [];
  const linkOn = data?.linkShare ?? board.data?.linkShare ?? false;
  const check = checkInvite(
    email,
    data?.candidates ?? [],
    grants,
    data?.creatorId ?? null
  );
  const me = session?.user;
  const ownerIsMe = !!me?.id && me.id === data?.creatorId;

  const withUndo = (
    p: Promise<{ undo: () => Promise<void> }>,
    message: string
  ) =>
    void p
      .then(({ undo }) =>
        notify.success(message, {
          action: { label: "Undo", onClick: () => void undo() },
        })
      )
      .catch(() => undefined);

  const invite = () => {
    if (!check.ok) return;
    withUndo(
      setGrant.mutateAsync({ boardId, person: check.person, role }),
      `Invited ${check.person.email} · ${ROLE_LABEL[role]}`
    );
    setEmail("");
  };

  const url = publicBoardUrl(
    typeof window === "undefined" ? "" : window.location.origin,
    boardId,
    board.data?.shareToken
  );
  const copyLink = () => {
    if (!url) return;
    void navigator.clipboard
      ?.writeText(url)
      .then(() => notify.success("Link copied"))
      .catch(() => notify.error("Could not copy the link."));
  };

  const invalid = !!email.trim() && !check.ok && check.reason === "invalid";
  const hint =
    !email.trim() || check.ok
      ? null
      : check.reason === "invalid"
        ? "Enter a full email address."
        : check.reason === "dupe" || check.reason === "owner"
          ? "Already on this board."
          : "Only people in this workspace can be invited for now.";

  const owner = data?.creator;
  const people = grants;

  return (
    <BoardDialog open={open} onClose={onClose} label="Share board" width={480}>
      <DialogHead
        art="stack"
        title={`Share “${title}”`}
        sub={shareSubline(grants.length, linkOn)}
      />
      {!manage ? (
        <span className="pl-meta">
          {access.isLoading
            ? "…"
            : "Only people with full access can change who sees this board."}
        </span>
      ) : (
        <>
          <div className="pl-share-sheet-row">
            <input
              ref={input}
              name="mb-invite"
              type="email"
              value={email}
              placeholder="Email address"
              aria-label="Email address"
              autoComplete="off"
              enterKeyHint="send"
              aria-invalid={invalid}
              aria-describedby={hint ? "mb-invite-hint" : undefined}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") invite();
              }}
              className={"pl-field is-grow" + (invalid ? " is-invalid" : "")}
            />
            <span
              className="pl-share-sheet-row-2"
              role="radiogroup"
              aria-label="Role"
            >
              {INVITE_ROLES.map(([k, n]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={role === k}
                  className="pl-seg-btn"
                  data-mb-role={k}
                  onClick={() => setRole(k)}
                >
                  {n}
                </button>
              ))}
            </span>
            <button
              type="button"
              className="nx-btn nx-btn-primary mb-invite-btn"
              disabled={!check.ok}
              onClick={invite}
            >
              Invite
            </button>
          </div>
          {hint ? (
            <span
              id="mb-invite-hint"
              role={invalid ? "alert" : undefined}
              className={
                invalid ? "pl-color-sheet-text" : "pl-share-sheet-text"
              }
            >
              {hint}
            </span>
          ) : null}
        </>
      )}
      <div className="mb-members pl-habit-sheet-col-2">
        {owner ? (
          <div className="nx-swap pl-share-sheet-row-3">
            <Avatars
              people={[
                { key: owner.email ?? "owner", name: personName(owner) },
              ]}
              size={28}
            />
            <span className="pl-share-sheet-col">
              <span className="pl-strong">
                {personName(owner)}
                {ownerIsMe ? <span className="pl-line"> (you)</span> : null}
              </span>
              <span className="pl-share-sheet-text-2">{owner.email}</span>
            </span>
            <span className="pl-share-sheet-text-3">Owner</span>
          </div>
        ) : null}
        {people.map((g) => {
          const name = personName(g);
          return (
            <div
              key={g.userId}
              className="nx-swap pl-share-sheet-row-3"
              data-mb-member={g.email ?? g.userId}
            >
              <Avatars
                people={[{ key: g.email ?? g.userId, name }]}
                size={28}
              />
              <span className="pl-share-sheet-col">
                <span className="pl-strong">{name}</span>
                <span className="pl-share-sheet-text-2">{g.email}</span>
              </span>
              {manage ? (
                <>
                  <RoleSelect
                    label={`Role for ${name}`}
                    value={g.role}
                    onChange={(v) =>
                      withUndo(
                        setGrant.mutateAsync({
                          boardId,
                          person: g,
                          role: v,
                        }),
                        `${name} can ${v === "EDITOR" ? "edit" : "view"} now`
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    className="nx-btn nx-btn-text nx-btn-sm"
                    onClick={() =>
                      withUndo(
                        setGrant.mutateAsync({
                          boardId,
                          person: g,
                          role: null,
                        }),
                        `Removed ${name}`
                      )
                    }
                  >
                    Remove
                  </button>
                </>
              ) : (
                <span className="pl-share-sheet-text-3">
                  {ROLE_LABEL[g.role]}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="pl-share-sheet-box" />
      <div className="pl-row-12" data-mb-linkshare={linkOn ? "on" : "off"}>
        <span className="pl-share-sheet-grid">
          {linkOn ? (
            <LuGlobe size={14} aria-hidden />
          ) : (
            <LuLock size={14} aria-hidden />
          )}
        </span>
        <span className="pl-share-sheet-col-2">
          <span className="pl-strong">Anyone with the link</span>
          <span className="pl-meta">
            {linkOn
              ? "Can view · no sign-in needed"
              : "Off — only people you invite"}
          </span>
        </span>
        {linkOn && url ? (
          <button
            type="button"
            className="nx-btn nx-btn-secondary nx-btn-sm mb-copy-link"
            onClick={copyLink}
          >
            <LuLink size={13} aria-hidden />
            Copy link
          </button>
        ) : null}
        <button
          type="button"
          role="switch"
          aria-checked={linkOn}
          aria-label="Anyone with the link"
          disabled={!manage}
          className={"mb-switch" + (linkOn ? " is-on" : "")}
          onClick={() => void onLinkShare(!linkOn)}
        >
          <i />
        </button>
      </div>
      <DialogFoot>
        <button
          type="button"
          className="nx-btn nx-btn-secondary"
          onClick={onClose}
        >
          Done
        </button>
      </DialogFoot>
    </BoardDialog>
  );
}
