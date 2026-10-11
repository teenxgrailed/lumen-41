"use client";

import { useEffect, useState } from "react";

import { useSession } from "next-auth/react";

import { LuCheck, LuGlobe, LuLink, LuLock, LuTrash2 } from "react-icons/lu";

import {
  type DocGrant,
  type DocRole,
  useDocAccess,
  useDocGrants,
  useDocInvitees,
  useDocLink,
  useSetDocGrant,
  useSetDocLink,
} from "@/lib/needt3/hooks/doc-share";
import type { V3Doc } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { docsCopy } from "../../docs/DocParts";
import {
  ROLE_OPTIONS,
  checkInvite,
  displayName,
  initials,
  roleLabel,
  shareSubline,
} from "../../document/share";
import { PkActions, type PkActs } from "../kit/Hold";
import { PkButton } from "../kit/Material";
import { PkSheet } from "../kit/Sheet";
import { pkCx } from "../kit/util";
import { snack } from "../overlays/snack";

const copy = docsCopy.DocShareSheet;

function Face({ name, image }: { name: string; image: string | null }) {
  return (
    <span
      className="st-avatar"
      style={{ width: 40, height: 40, fontSize: 13, overflow: "hidden" }}
      aria-hidden
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- provider avatar URL
        <img src={image} alt="" width={40} height={40} />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/**
 * Share on the phone: the desktop Share sheet's rules (`document/share`,
 * `useDocAccess` / `useDocGrants` / `useDocInvitees` / `useDocLink`) in a
 * PkSheet. Invite a workspace member by email as View or Edit, change a role
 * or remove a person from their row, set General access (Private, or Anyone
 * with the link: the public read-only link), copy the link. Only a reader with
 * full access can change who sees the page.
 * Not here, as on the desktop: AI access per tool, a link that can edit, and
 * inviting someone outside the workspace (no routes yet).
 */
export function ShareSheetPhone({
  doc,
  open,
  onClose,
}: {
  doc: V3Doc;
  open: boolean;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const access = useDocAccess(doc.id);
  const canManage = access.data?.myRole === "FULL_ACCESS";
  const grants = useDocGrants(doc.id, open && canManage);
  const invitees = useDocInvitees(
    doc.id,
    access.data?.workspaceId ?? null,
    open && canManage
  );
  const link = useDocLink(doc.id, open && canManage);
  const setGrant = useSetDocGrant();
  const setLink = useSetDocLink();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DocRole>("VIEWER");
  const [person, setPerson] = useState<DocGrant | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setRole("VIEWER");
    setPerson(null);
  }, [open]);

  const list = grants.data ?? [];
  const published = !!link.data?.published;
  const check = checkInvite(
    email,
    invitees.data ?? [],
    list,
    access.data?.ownerId ?? null
  );
  const me = session?.user;
  const iOwn = !!me?.id && me.id === access.data?.ownerId;

  const withUndo = (p: Promise<{ undo: () => Promise<void> }>, msg: string) =>
    void p.then(({ undo }) => snack(msg, undo)).catch(() => undefined);

  /* Off revokes the token and on would mint a new URL, so off is final:
     a plain notice, no Undo. */
  const changeLink = (on: boolean, msg: string) => {
    if (on === published) return;
    const p = setLink.mutateAsync({ pageId: doc.id, on });
    if (on) withUndo(p, msg);
    else void p.then(() => snack(msg)).catch(() => undefined);
  };

  const invite = () => {
    if (!check.ok) return;
    withUndo(
      setGrant.mutateAsync({ pageId: doc.id, person: check.person, role }),
      `Invited ${check.person.email} · ${roleLabel(role)}`
    );
    setEmail("");
  };

  const copyLink = () => {
    const url =
      published && link.data?.url
        ? link.data.url
        : `${window.location.origin}/pages/${encodeURIComponent(doc.id)}`;
    void navigator.clipboard
      ?.writeText(url)
      .then(() =>
        snack(
          published
            ? "Link copied — anyone with it can view"
            : copy.link_copied_only_people_you_invite_can_o
        )
      )
      .catch(() => notify.error("Could not copy the link."));
  };

  const hint =
    !email.trim() || check.ok
      ? null
      : check.reason === "invalid"
        ? copy.enter_a_full_email_address
        : check.reason === "dupe" || check.reason === "owner"
          ? copy.already_on_this_page
          : // //todo: inviting someone outside the workspace needs the
            // ShareInvite table and an invite route (data map M2).
            "Only people in this workspace can be invited for now.";

  const acts: PkActs | null = person
    ? {
        title: displayName(person),
        meta: person.email,
        actions: [
          ...ROLE_OPTIONS.map(([r, label]) => ({
            label,
            icon: <LuCheck size={18} aria-hidden />,
            hue: "var(--accent)",
            check: person.role === r,
            onClick: () => {
              if (person.role === r) return;
              withUndo(
                setGrant.mutateAsync({ pageId: doc.id, person, role: r }),
                `${displayName(person)} · ${roleLabel(r)}`
              );
            },
          })),
          {
            label: copy.remove,
            icon: <LuTrash2 size={18} aria-hidden />,
            danger: true,
            onClick: () =>
              withUndo(
                setGrant.mutateAsync({ pageId: doc.id, person, role: null }),
                `Removed ${displayName(person)}`
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
        title={copy.share_document}
        meta={
          <span data-share-sub="">
            {doc.title || copy.untitled} ·{" "}
            {shareSubline(list.length, published)}
          </span>
        }
        detents={[0.62, 0.94]}
        label={copy.share_document}
      >
        {!canManage ? (
          <p className="pd-sp-note" data-share-locked="">
            {access.isLoading
              ? "…"
              : "Only people with full access can change who sees this page."}
          </p>
        ) : (
          <div className="pd-share" data-pd-share="">
            <div className="pd-share-invite">
              <input
                className="pd-url-input"
                name="doc-invite"
                type="email"
                inputMode="email"
                autoCapitalize="off"
                autoCorrect="off"
                value={email}
                placeholder={copy.invite_by_email}
                aria-label={copy.email_address}
                aria-invalid={!check.ok && check.reason === "invalid"}
                data-pd-invite=""
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") invite();
                }}
              />
              <div className="pd-seg" role="radiogroup" aria-label={copy.role}>
                {(
                  [
                    ["VIEWER", copy.view],
                    ["EDITOR", copy.edit],
                  ] as [DocRole, string][]
                ).map(([k, n]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={role === k}
                    className={pkCx("pd-seg-btn", role === k && "is-on")}
                    onClick={() => setRole(k)}
                  >
                    <span>{n}</span>
                  </button>
                ))}
              </div>
              <PkButton
                kind="primary"
                disabled={!check.ok || setGrant.isPending}
                onClick={invite}
                data-share-invite=""
              >
                {copy.invite}
              </PkButton>
            </div>
            {hint ? <p className="pd-sp-note">{hint}</p> : null}

            <span className="pd-ps-label">{copy.people_with_access}</span>
            <div className="pd-rows-sheet" role="list">
              {iOwn && me ? (
                <div className="pd-srow is-static" role="listitem">
                  <span className="pd-srow-tile is-plain">
                    <Face
                      name={me.name || me.email || "You"}
                      image={me.image ?? null}
                    />
                  </span>
                  <span className="pd-srow-text">
                    <span className="pd-srow-title">
                      {me.name || me.email} {copy.you}
                    </span>
                    <span className="pd-srow-meta">{me.email}</span>
                  </span>
                  <span className="pd-srow-meta">{copy.owner}</span>
                </div>
              ) : null}
              {list.map((g) => {
                const name = displayName(g);
                return (
                  <button
                    key={g.userId}
                    type="button"
                    role="listitem"
                    className="pd-srow"
                    data-share-member={g.email ?? g.userId}
                    aria-label={`${copy.role_for} ${name}: ${roleLabel(g.role)}`}
                    onClick={() => setPerson(g)}
                  >
                    <span className="pd-srow-tile is-plain">
                      <Face name={name} image={g.image} />
                    </span>
                    <span className="pd-srow-text">
                      <span className="pd-srow-title">{name}</span>
                      <span className="pd-srow-meta">{g.email}</span>
                    </span>
                    <span className="pd-mini-chip">{roleLabel(g.role)}</span>
                  </button>
                );
              })}
            </div>

            <span className="pd-ps-label">{copy.general_access}</span>
            <div
              className="pd-seg"
              role="radiogroup"
              aria-label={copy.general_access}
              data-share-access={published ? "link" : "private"}
            >
              {(
                [
                  ["private", copy.private, <LuLock key="p" size={16} />],
                  [
                    "link",
                    copy.anyone_with_the_link,
                    <LuGlobe key="g" size={16} />,
                  ],
                ] as const
              ).map(([k, label, icon]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={(k === "link") === published}
                  className={pkCx(
                    "pd-seg-btn",
                    (k === "link") === published && "is-on"
                  )}
                  onClick={() =>
                    changeLink(
                      k === "link",
                      k === "link" ? "Anyone with the link can view" : "Private"
                    )
                  }
                >
                  <span className="pd-seg-icon">{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <p className="pd-sp-note">
              {published
                ? copy.no_sign_in_needed_tasks_inside_stay_priv
                : copy.only_you_and_the_people_above_can_open_i}
            </p>
            {/* //todo: "Can edit" on the link needs PagePublication.role
                (migration M1); the public link is view-only today. AI access
                per tool needs PageAiAccess (data map M2). */}
          </div>
        )}
        <div className="pd-share-foot">
          <PkButton
            kind="quiet"
            icon={<LuLink size={16} aria-hidden />}
            onClick={copyLink}
            data-share-copy=""
          >
            {copy.copy_link}
          </PkButton>
          <PkButton kind="primary" onClick={onClose}>
            {copy.done}
          </PkButton>
        </div>
      </PkSheet>
      <PkActions acts={acts} onClose={() => setPerson(null)} />
    </>
  );
}
