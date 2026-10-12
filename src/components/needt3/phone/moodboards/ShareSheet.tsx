"use client";

import { useEffect, useState } from "react";

import { useSession } from "next-auth/react";

import {
  LuCheck,
  LuChevronDown,
  LuCopy,
  LuLink,
  LuLock,
  LuTrash2,
} from "react-icons/lu";

import {
  type BoardGrant,
  useBoardAccess,
  useSetBoardGrant,
} from "@/lib/needt3/hooks/board-share";
import { useBoard } from "@/lib/needt3/hooks/boards";
import type { BoardRole } from "@/lib/needt3/map";

import { copyText } from "../../places/board/clipboard";
import {
  INVITE_ROLES,
  ROLE_LABEL,
  canManage,
  checkInvite,
  hueOf,
  initials,
  personName,
  publicBoardUrl,
  shareSubline,
} from "../../places/board/logic";
import {
  PkActions,
  type PkActs,
  PkButton,
  PkField,
  PkGlass,
  PkHueTile,
  PkSheet,
  pkCx,
} from "../kit";
import { snack } from "../overlays/snack";

function Avatar({ name, seed }: { name: string; seed: string }) {
  return (
    <span
      className="pl-avatars-grid"
      style={
        {
          "--pl-hue": hueOf(seed),
          width: 36,
          height: 36,
          borderRadius: 36,
          font: "600 14px/1 var(--font-sans)",
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

/**
 * Share on the phone (phone-habits.jsx PhbShareSheet) over
 * `MoodboardAccessGrant` and `Moodboard.linkShare`: invite a workspace member
 * by email as Can view / Can edit (nobody is emailed), change a role or remove
 * a person from their row, "Anyone with the link" with Copy link. Only full
 * access changes anything; everyone else sees who is on the board.
 */
export function ShareSheet({
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
  const [person, setPerson] = useState<BoardGrant | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setRole("VIEWER");
    setPerson(null);
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
  const invalid = !!email.trim() && !check.ok && check.reason === "invalid";
  const hint =
    !email.trim() || check.ok
      ? null
      : check.reason === "invalid"
        ? "Enter an email address."
        : check.reason === "dupe" || check.reason === "owner"
          ? "Already on this board."
          : "Only people in this workspace can be invited for now.";
  const me = session?.user;
  const owner = data?.creator;
  const url = publicBoardUrl(
    typeof window === "undefined" ? "" : window.location.origin,
    boardId,
    board.data?.shareToken
  );

  const withUndo = (
    p: Promise<{ undo: () => Promise<void> }>,
    message: string
  ) => void p.then(({ undo }) => snack(message, undo)).catch(() => undefined);

  const invite = () => {
    if (!check.ok) return;
    withUndo(
      setGrant.mutateAsync({ boardId, person: check.person, role }),
      `${personName(check.person)} can ${role === "EDITOR" ? "edit" : "view"} “${title}”`
    );
    setEmail("");
  };

  const acts: PkActs | null = person
    ? {
        title: personName(person),
        meta: person.email,
        actions: [
          {
            label: ROLE_LABEL.VIEWER,
            hint: "Sees the board, adds nothing",
            icon: <LuCheck size={18} aria-hidden />,
            hue: "var(--info)",
            check: person.role === "VIEWER",
            onClick: () =>
              person.role !== "VIEWER" &&
              withUndo(
                setGrant.mutateAsync({ boardId, person, role: "VIEWER" }),
                `${personName(person)} can view now`
              ),
          },
          {
            label: ROLE_LABEL.EDITOR,
            hint: "Adds and removes references",
            icon: <LuCheck size={18} aria-hidden />,
            hue: "var(--success)",
            check: person.role === "EDITOR",
            onClick: () =>
              person.role !== "EDITOR" &&
              withUndo(
                setGrant.mutateAsync({ boardId, person, role: "EDITOR" }),
                `${personName(person)} can edit now`
              ),
          },
          {
            label: "Remove from board",
            icon: <LuTrash2 size={18} aria-hidden />,
            danger: true,
            onClick: () =>
              withUndo(
                setGrant.mutateAsync({ boardId, person, role: null }),
                `${personName(person)} removed`
              ),
          },
        ],
      }
    : null;

  return (
    <>
      <PkSheet
        open={open}
        onClose={onClose}
        title={manage ? "Share" : "People"}
        meta={title}
        label="Share"
        detents={[0.92]}
        className="phb-share-sheet"
        footer={
          <PkButton kind="primary" onClick={onClose} data-phb-share-done>
            Done
          </PkButton>
        }
      >
        {manage ? (
          <div className="phb-form" data-mbm="invite">
            <PkField
              label="Invite"
              id="phb-invite"
              value={email}
              onChange={setEmail}
              placeholder="Email"
              className={invalid ? "is-invalid" : undefined}
              inputProps={{
                type: "email",
                inputMode: "email",
                autoComplete: "off",
                autoCapitalize: "off",
                enterKeyHint: "send",
                "aria-invalid": invalid,
                "aria-describedby": hint ? "phb-invite-hint" : undefined,
                onKeyDown: (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    invite();
                  }
                },
              }}
            />
            {hint ? (
              <p
                id="phb-invite-hint"
                role={invalid ? "alert" : undefined}
                className="phb-err"
              >
                {hint}
              </p>
            ) : null}
            <div className="phb-invite-row">
              <div className="phb-seg" role="radiogroup" aria-label="Access">
                {INVITE_ROLES.map(([k]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={role === k}
                    className={pkCx("phb-seg-btn", role === k && "is-on")}
                    onClick={() => setRole(k)}
                  >
                    {ROLE_LABEL[k]}
                  </button>
                ))}
              </div>
              <PkButton
                kind="primary"
                small
                disabled={!check.ok || setGrant.isPending}
                onClick={invite}
                data-phb-invite-go
              >
                Invite
              </PkButton>
            </div>
          </div>
        ) : (
          <p className="phb-note-line">
            <LuLock size={13} aria-hidden />
            {access.isLoading
              ? "…"
              : `Only ${owner ? personName(owner) : "the owner"} can change who has access.`}
          </p>
        )}
        <span className="pk-label phb-label">People</span>
        <div className="phb-glist" data-mbm="members">
          {owner ? (
            <div className="phb-person">
              <Avatar name={personName(owner)} seed={owner.email ?? "owner"} />
              <span className="phb-kind-text">
                <span className="phb-kind-label">
                  {personName(owner)}
                  {me?.id && me.id === data?.creatorId ? " (you)" : ""}
                </span>
                <span className="phb-kind-hint">{owner.email}</span>
              </span>
              <span className="phb-role is-static">Owner</span>
            </div>
          ) : null}
          {grants.map((g) => (
            <div key={g.userId} className="phb-person">
              <Avatar name={personName(g)} seed={g.email ?? g.userId} />
              <span className="phb-kind-text">
                <span className="phb-kind-label">{personName(g)}</span>
                <span className="phb-kind-hint">{g.email}</span>
              </span>
              {manage ? (
                <PkGlass
                  as="button"
                  round
                  className="phb-role"
                  data-phb-role={g.email ?? g.userId}
                  aria-label={`Role for ${personName(g)}: ${ROLE_LABEL[g.role]}`}
                  onClick={() => setPerson(g)}
                >
                  {ROLE_LABEL[g.role]}
                  <LuChevronDown size={13} aria-hidden />
                </PkGlass>
              ) : (
                <span className="phb-role is-static">{ROLE_LABEL[g.role]}</span>
              )}
            </div>
          ))}
        </div>
        <p className="phb-note-line" data-phb-sub="">
          {shareSubline(grants.length, linkOn)}
        </p>
        <div
          className={pkCx("phb-glist phb-linkshare", !manage && "is-locked")}
          data-mbm="linkshare"
        >
          <div className="phb-person">
            <PkHueTile
              icon={<LuLink size={18} aria-hidden />}
              hue="var(--v2p-lav)"
              size={36}
            />
            <span className="phb-kind-text">
              <span className="phb-kind-label">Anyone with the link</span>
              <span className="phb-kind-hint">
                {linkOn ? "Can view — not edit" : "Off — only the people above"}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={linkOn}
              aria-label="Anyone with the link"
              disabled={!manage}
              className={pkCx("phb-switch", linkOn && "is-on")}
              onClick={() => void onLinkShare(!linkOn)}
              data-phb-linkshare
            >
              <span className="phb-switch-knob" />
            </button>
          </div>
          {linkOn && url ? (
            <PkButton
              kind="chip"
              icon={<LuCopy size={16} aria-hidden />}
              className="phb-copy"
              onClick={() => void copyText(url)}
              data-phb-copy
            >
              Copy link
            </PkButton>
          ) : null}
        </div>
      </PkSheet>
      <PkActions acts={acts} onClose={() => setPerson(null)} />
    </>
  );
}
