"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import {
  LuArrowDown,
  LuArrowUp,
  LuCheck,
  LuEllipsis,
  LuFileText,
  LuLayoutTemplate,
  LuLink,
  LuPlus,
  LuSearch,
  LuStar,
  LuTrash2,
  LuX,
} from "react-icons/lu";

import { newDate } from "@/lib/date-utils";
import { useDocs, useTrashDoc, useUpdateDoc } from "@/lib/needt3/hooks/docs";
import { useProjects } from "@/lib/needt3/hooks/projects";
import type { V3Doc } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { useDocTokens } from "../../docs/DocParts";
import { ageLabel } from "../../docs/labels";
import { DOC_SORTS, dirLabel, sortDocs } from "../../docs/sort";
import { StError, StNoAccess } from "../../states/StScreen";
import { StSkeleton } from "../../states/StSkeleton";
import { screenState } from "../../states/status";
import { PkActions, type PkActs } from "../kit/Hold";
import { PkButton, PkEmpty } from "../kit/Material";
import { PkScreen } from "../kit/Screen";
import { snack } from "../overlays/snack";
import { usePhoneCover } from "../shell/cover";
import { DocCard } from "./DocCard";
import { PdGlass, PdMenu, type PdMenuItem } from "./PhoneMenu";
import { docsSub, matchDocs, pullHits } from "./logic";
import type { DocSortKey, DocsPhoneCtl } from "./useDocsPhone";

const docHref = (id: string) => `/pages/${encodeURIComponent(id)}`;

/**
 * Pin / unpin, Delete (to Trash) and Copy link, each with the desktop's words
 * and an Undo in the snack. (Duplicate and Move to… are not offered: the
 * desktop port has no flow for them yet, see the handoff.)
 */
function useDocActions() {
  const update = useUpdateDoc();
  const trash = useTrashDoc();
  return {
    pin: (d: V3Doc) =>
      void update
        .mutateAsync({ id: d.id, patch: { isFavorite: !d.isFavorite } })
        .then(({ undo }) => snack(d.isFavorite ? "Unpinned" : "Pinned", undo))
        .catch(() => undefined),
    trash: (d: V3Doc) =>
      void trash
        .mutateAsync({ id: d.id, trashed: true })
        .then(({ undo }) =>
          snack(`“${d.title || "Untitled"}” moved to Trash`, undo)
        )
        .catch(() => undefined),
    copyLink: (d: V3Doc) =>
      void navigator.clipboard
        ?.writeText(window.location.origin + docHref(d.id))
        .then(() => snack("Link copied"))
        .catch(() => notify.error("Could not copy the link.")),
  };
}

/**
 * Docs on the phone (phone-docs.jsx `PdDocs` 1588): the large "Docs" title,
 * Quick Open, New doc and From template, a two-column grid of cards, ⋯ for the
 * sort, a long press for the card's actions, pull down to search or start one.
 * The data and the rules are the desktop grid's: `useDocs`, the stored sort
 * (`needt.docsSort`), `useCreateDoc`, pin and Trash with Undo.
 */
export function DocsPhone({ ctl }: { ctl: DocsPhoneCtl }) {
  const router = useRouter();
  const query = useDocs();
  const projects = useProjects();
  const read = useDocTokens();
  const act = useDocActions();
  // The sort, Quick Open words and the create guard live above the face
  // switch (useDocsPhone); the stored sort is read after mount and again
  // whenever this face comes back.
  const { sort, q, setQ, newDoc, creating, refreshSort } = ctl;
  useEffect(() => refreshSort(), [refreshSort]);
  const [menu, setMenu] = useState(false);
  const [held, setHeld] = useState<V3Doc | null>(null);
  const now = newDate().getTime();

  // The menu and the sheet cover the screen: menu A steps down while they are up.
  usePhoneCover(menu || !!held);

  const mine = useMemo(
    () => (query.data ?? []).filter((d) => !d.trashedAt),
    [query.data]
  );
  const sorted = useMemo(() => sortDocs(mine, sort), [mine, sort]);
  const shown = useMemo(() => matchDocs(sorted, q), [sorted, q]);
  const projectOf = useMemo(() => {
    const byId = new Map((projects.data ?? []).map((p) => [p.id, p] as const));
    return (d: V3Doc) => {
      const p = d.projectId ? byId.get(d.projectId) : null;
      return p ? { name: p.name, color: p.color } : null;
    };
  }, [projects.data]);

  const open = (id: string) => router.push(docHref(id));
  const setSort = (key: DocSortKey) => {
    ctl.setSort(key);
    setMenu(false);
  };
  const sortItems: PdMenuItem[] = [
    { head: "Sort by" },
    ...DOC_SORTS.map(([id, label]): PdMenuItem => {
      const on = sort.key === id;
      return {
        id: `sort-${id}`,
        label,
        on,
        icon: on ? <LuCheck size={16} aria-hidden /> : undefined,
        arrow: on ? (
          sort.dir === "asc" ? (
            <LuArrowUp size={14} aria-hidden />
          ) : (
            <LuArrowDown size={14} aria-hidden />
          )
        ) : undefined,
        arrowLabel: on ? dirLabel(id, sort.dir) : undefined,
        onClick: () => setSort(id),
      };
    }),
  ];

  const acts: PkActs | null = held
    ? {
        title: held.title || "Untitled",
        meta: ageLabel(held.updatedAt, now) || null,
        actions: [
          {
            label: "Open",
            icon: <LuFileText size={18} aria-hidden />,
            hue: "var(--success)",
            onClick: () => open(held.id),
          },
          {
            label: held.isFavorite ? "Unpin" : "Pin",
            icon: <LuStar size={18} aria-hidden />,
            hue: "var(--pk-violet)",
            onClick: () => act.pin(held),
          },
          {
            label: "Copy link",
            icon: <LuLink size={18} aria-hidden />,
            hue: "var(--info)",
            onClick: () => act.copyLink(held),
          },
          {
            label: "Delete",
            icon: <LuTrash2 size={18} aria-hidden />,
            danger: true,
            onClick: () => act.trash(held),
          },
        ],
      }
    : null;

  const state = screenState(query);
  const needle = q.trim();

  return (
    <div className="pd-place" data-pd-place="docs">
      <div className="pd-under">
        <PkScreen
          screen="docs"
          title="Docs"
          glyph="docs"
          sub={state === "content" ? docsSub(mine.length, sort) : null}
          onPull={{
            search: (x) => pullHits(mine, x, now),
            onPick: (h) => open(h.id),
            onAdd: (x) => newDoc(x.trim()),
            placeholder: "Search docs or start one…",
            hint: "Docs, by any word in their title. Enter starts a new one.",
            addLabel: (x) => (x ? `New doc “${x}”` : "New doc"),
          }}
        >
          <div className="pd-home">
            {state === "loading" ? (
              <div data-st-state="loading">
                <StSkeleton kind="grid" />
              </div>
            ) : state === "no-access" ? (
              <div className="pd-state" data-st-state="no-access">
                <StNoAccess kind="document" />
              </div>
            ) : state === "error" || state === "offline" ? (
              <div className="pd-state" data-st-state={state}>
                <StError
                  text={
                    state === "offline"
                      ? "You’re offline — reconnect to load this."
                      : undefined
                  }
                  onRetry={query.refetch}
                />
              </div>
            ) : (
              <>
                <label className="pd-qo" data-pd-quickopen="">
                  <LuSearch size={18} aria-hidden />
                  <input
                    type="search"
                    name="docs-quick-open"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Quick Open"
                    aria-label="Quick Open"
                    enterKeyHint="go"
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && shown.length) {
                        e.preventDefault();
                        open(shown[0].id);
                      } else if (e.key === "Escape") setQ("");
                    }}
                  />
                  {q ? (
                    <button
                      type="button"
                      className="pd-qo-clear"
                      aria-label="Clear"
                      onClick={() => setQ("")}
                    >
                      <LuX size={14} aria-hidden />
                    </button>
                  ) : null}
                </label>
                <div className="pd-new">
                  <PkButton
                    kind="primary"
                    small
                    icon={<LuPlus size={16} aria-hidden />}
                    disabled={creating}
                    onClick={() => newDoc()}
                    data-pd-new=""
                  >
                    New doc
                  </PkButton>
                  <PkButton
                    kind="quiet"
                    small
                    icon={<LuLayoutTemplate size={16} aria-hidden />}
                    onClick={() => router.push("/templates")}
                    data-pd-new-tpl=""
                  >
                    From template
                  </PkButton>
                </div>
                {shown.length ? (
                  <div className="pd-grid" role="list">
                    {shown.map((d) => (
                      <DocCard
                        key={d.id}
                        doc={d}
                        read={read}
                        project={projectOf(d)}
                        now={now}
                        onOpen={(x) => open(x.id)}
                        onHold={setHeld}
                      />
                    ))}
                  </div>
                ) : (
                  <div data-pd-empty="">
                    <PkEmpty
                      title={needle ? "Nothing matches" : "No documents yet"}
                      line={
                        needle
                          ? "Try another word."
                          : "Start one — pages you write on the desktop show up here too."
                      }
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </PkScreen>
        <div className="pd-bar is-list">
          <span />
          <PdGlass
            icon={<LuEllipsis size={20} aria-hidden />}
            label="Sort and more"
            onClick={() => setMenu(true)}
            data={{ "data-pd-more": "list" }}
          />
        </div>
      </div>
      <PdMenu
        open={menu}
        onClose={() => setMenu(false)}
        items={sortItems}
        label="Sort documents"
      />
      <PkActions acts={acts} onClose={() => setHeld(null)} />
    </div>
  );
}
