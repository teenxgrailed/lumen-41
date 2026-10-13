"use client";

import { useEffect, useRef, useState } from "react";

import { useSession } from "next-auth/react";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import {
  LuCheck,
  LuChevronDown,
  LuGlobe,
  LuLink,
  LuLock,
} from "react-icons/lu";

import {
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

import { useV3PortalContainer } from "../ctx/PortalScope";
import { Sheet } from "../ctx/Sheet";
import { DocThumb, V3Switch, docsCopy } from "../docs/DocParts";
import type { TokenReader } from "../docs/style";
import {
  ROLE_OPTIONS,
  checkInvite,
  displayName,
  initials,
  roleLabel,
  shareSubline,
} from "./share";

const copy = docsCopy.DocShareSheet;

/**
 * The prototype's role / access select, as a Radix menu (the native select element
 * is retired by the UI contract): keyboard and screen readers from Radix,
 * the look from docs.css, the menu portalled into the v3 scope.
 */
function DcSelect<T extends string>({
  value,
  onChange,
  label,
  options,
  plain,
}: {
  value: T;
  onChange: (v: T) => void;
  label: string;
  options: [T, string][];
  plain?: boolean;
}) {
  const container = useV3PortalContainer();
  const current = options.find(([k]) => k === value)?.[1] ?? value;
  return (
    <Dropdown.Root modal={false}>
      <span className={"docs-share-selwrap" + (plain ? " is-plain" : "")}>
        <Dropdown.Trigger asChild>
          <button
            type="button"
            aria-label={`${label}: ${current}`}
            className={"docs-share-select" + (plain ? " is-plain" : "")}
          >
            {current}
          </button>
        </Dropdown.Trigger>
        <span className="docs-share-chev" aria-hidden="true">
          <LuChevronDown size={12} />
        </span>
      </span>
      {container ? (
        <Dropdown.Portal container={container}>
          <Dropdown.Content
            align="end"
            sideOffset={6}
            collisionPadding={8}
            className="base-menu nx-pop is-right"
            style={{ zIndex: 1200, width: 200 }}
          >
            <Dropdown.RadioGroup
              value={value}
              onValueChange={(v) => onChange(v as T)}
            >
              {options.map(([k, l]) => (
                <Dropdown.RadioItem
                  key={k}
                  value={k}
                  className="menu-row"
                  style={{ outline: "none" }}
                >
                  <span style={{ display: "flex", width: 14 }}>
                    {k === value ? <LuCheck size={14} aria-hidden /> : null}
                  </span>
                  {l}
                </Dropdown.RadioItem>
              ))}
            </Dropdown.RadioGroup>
          </Dropdown.Content>
        </Dropdown.Portal>
      ) : null}
    </Dropdown.Root>
  );
}

function Face({ name, image }: { name: string; image: string | null }) {
  return (
    <span
      className="st-avatar"
      style={{ width: 28, height: 28, fontSize: 12, overflow: "hidden" }}
      aria-hidden
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- provider avatar URL
        <img src={image} alt="" width={28} height={28} />
      ) : (
        initials(name)
      )}
    </span>
  );
}

type Tab = "share" | "publish";

/**
 * Share sheet (prototype DocsScreen.jsx `DocShareSheet` 813) over
 * `PageAccessGrant` and `PagePublication`.
 */
export function ShareSheet({
  doc,
  read,
  open,
  onClose,
}: {
  doc: V3Doc;
  read: TokenReader;
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
  const [tab, setTab] = useState<Tab>("share");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DocRole>("VIEWER");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    setEmail("");
    setRole("VIEWER");
    setTab("share");
    const t = window.setTimeout(() => input.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  const list = grants.data ?? [];
  const published = !!link.data?.published;
  const check = checkInvite(
    email,
    invitees.data ?? [],
    list,
    access.data?.ownerId ?? null
  );
  const title = doc.title || copy.untitled;
  const me = session?.user;
  const iOwn = !!me?.id && me.id === access.data?.ownerId;

  const withUndo = (p: Promise<{ undo: () => Promise<void> }>, msg: string) =>
    void p
      .then(({ undo }) =>
        notify.success(msg, {
          action: { label: "Undo", onClick: () => void undo() },
        })
      )
      .catch(() => undefined);

  /* Off revokes the token and on would mint a new URL, so off is final:
     a plain notice, no Undo. */
  const changeLink = (on: boolean, msg: string) => {
    if (on === published) return;
    const p = setLink.mutateAsync({ pageId: doc.id, on });
    if (on) withUndo(p, msg);
    else void p.then(() => notify.success(msg)).catch(() => undefined);
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
        notify.success(
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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={copy.share_document}
      scrimClassName="nx-scrim docs-dialog-scrim"
      className="nx-sheet docs-dialog"
      style={{ maxWidth: 500 }}
    >
      <div className="docs-share-head">
        <DocThumb doc={doc} read={read} w={30} h={36} />
        <span className="docs-share-head-col">
          <span className="docs-share-title">
            {copy.share}
            {title}”
          </span>
          <span className="docs-share-meta" data-share-sub="">
            {shareSubline(list.length, published)}
          </span>
        </span>
      </div>
      <div className="docs-dc-seg-1" role="radiogroup">
        {(
          [
            ["share", copy.share_2],
            ["publish", copy.publish],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={tab === id}
            className="docs-seg-cell"
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        {/* //todo: the Export tab (Markdown, PDF, HTML) has no export route
            yet; the API already serves GET /api/pages/:id. */}
      </div>

      {!canManage ? (
        <span className="docs-share-meta">
          {access.isLoading
            ? "…"
            : "Only people with full access can change who sees this page."}
        </span>
      ) : tab === "share" ? (
        <>
          <div className="docs-share-invite">
            <input
              ref={input}
              name="doc-invite"
              type="email"
              value={email}
              placeholder={copy.invite_by_email}
              aria-label={copy.email_address}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") invite();
              }}
              className={
                "docs-share-input" +
                (!check.ok && check.reason === "invalid" ? " is-invalid" : "")
              }
            />
            <span
              className="docs-share-roles"
              role="radiogroup"
              aria-label={copy.role}
            >
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
                  className="docs-share-role"
                  onClick={() => setRole(k)}
                >
                  {n}
                </button>
              ))}
            </span>
            <button
              type="button"
              className="nx-btn nx-btn-primary"
              data-share-invite=""
              disabled={!check.ok}
              onClick={invite}
            >
              {copy.invite}
            </button>
          </div>
          {hint ? (
            <span
              className={
                !check.ok && check.reason === "invalid"
                  ? "docs-share-error"
                  : "docs-share-hint"
              }
            >
              {hint}
            </span>
          ) : null}

          <div className="docs-share-section">
            <span className="docs-share-label">{copy.people_with_access}</span>
            {iOwn && me ? (
              <div className="docs-share-person">
                <Face
                  name={me.name || me.email || "You"}
                  image={me.image ?? null}
                />
                <span className="docs-share-col">
                  <span className="docs-share-strong">
                    {me.name || me.email}{" "}
                    <span className="docs-share-you">{copy.you}</span>
                  </span>
                  <span className="docs-share-meta">{me.email}</span>
                </span>
                <span className="docs-share-owner">{copy.owner}</span>
              </div>
            ) : null}
            {list.map((g) => {
              const name = displayName(g);
              return (
                <div
                  key={g.userId}
                  className="nx-swap docs-share-person"
                  data-share-member={g.email ?? g.userId}
                >
                  <Face name={name} image={g.image} />
                  <span className="docs-share-col">
                    <span className="docs-share-strong">{name}</span>
                    <span className="docs-share-meta">{g.email}</span>
                  </span>
                  <DcSelect
                    label={`${copy.role_for} ${name}`}
                    value={g.role}
                    options={ROLE_OPTIONS}
                    onChange={(v) =>
                      withUndo(
                        setGrant.mutateAsync({
                          pageId: doc.id,
                          person: g,
                          role: v,
                        }),
                        `${name} · ${roleLabel(v)}`
                      )
                    }
                  />
                  <button
                    type="button"
                    aria-label={`${copy.remove} ${name}`}
                    className="nx-btn nx-btn-text nx-btn-sm"
                    onClick={() =>
                      withUndo(
                        setGrant.mutateAsync({
                          pageId: doc.id,
                          person: g,
                          role: null,
                        }),
                        `Removed ${name}`
                      )
                    }
                  >
                    {copy.remove}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="docs-share-rule" />
          <div className="docs-share-section">
            <span className="docs-share-label">{copy.general_access}</span>
            <div
              className="docs-share-person"
              data-share-access={published ? "link" : "private"}
            >
              <span className="docs-share-glyph">
                {published ? <LuGlobe size={14} /> : <LuLock size={14} />}
              </span>
              <span className="docs-share-col">
                <DcSelect
                  plain
                  label={copy.general_access}
                  value={published ? "link" : "private"}
                  options={[
                    ["private", copy.private],
                    ["link", copy.anyone_with_the_link],
                  ]}
                  onChange={(v) =>
                    changeLink(
                      v === "link",
                      v === "link" ? "Anyone with the link can view" : "Private"
                    )
                  }
                />
                <span className="docs-share-meta">
                  {published
                    ? copy.no_sign_in_needed_tasks_inside_stay_priv
                    : copy.only_you_and_the_people_above_can_open_i}
                </span>
              </span>
              {/* //todo: "Can edit" on the link needs PagePublication.role
                  (migration M1); the public link is view-only today. */}
            </div>
          </div>

          {/* //todo: AI access per tool needs the PageAiAccess table and a
              route (data map M2); Needt MCP must enforce it. */}

          <div className="docs-share-foot">
            <button
              type="button"
              className="nx-btn nx-btn-secondary"
              data-share-copy=""
              onClick={copyLink}
            >
              <LuLink size={14} aria-hidden />
              {copy.copy_link}
            </button>
            <button
              type="button"
              className="nx-btn nx-btn-secondary"
              onClick={onClose}
            >
              {copy.done}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="docs-share-person">
            <span className="docs-share-col">
              <span className="docs-share-strong">
                {copy.publish_to_the_web}
              </span>
              <span className="docs-share-meta">
                {copy.a_public_page_anyone_can_find_and_read_t}
              </span>
            </span>
            <V3Switch
              checked={published}
              label={copy.publish_to_the_web}
              onChange={(on) =>
                changeLink(on, on ? "Published" : "Unpublished")
              }
            />
          </div>
          {published && link.data?.url ? (
            <span className="docs-share-field is-url">{link.data.url}</span>
          ) : null}
          <div className="docs-share-foot">
            <button
              type="button"
              className="nx-btn nx-btn-secondary"
              onClick={onClose}
            >
              {copy.done}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
