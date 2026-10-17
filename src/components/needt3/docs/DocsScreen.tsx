"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  LuArrowDown,
  LuArrowUp,
  LuCheck,
  LuEllipsis,
  LuFolder,
  LuLayers,
  LuLayoutTemplate,
  LuList,
  LuPlus,
  LuSlidersHorizontal,
  LuStar,
} from "react-icons/lu";

import { newDate } from "@/lib/date-utils";
import { useDocs } from "@/lib/needt3/hooks/docs";
import { useProjects } from "@/lib/needt3/hooks/projects";
import type { V3Doc } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { type CtxRow, registerCtx } from "../ctx/registry";
import { useExit } from "../ctx/useExit";
import { ShareSheet } from "../document/ShareSheet";
import { Art } from "../menu/Art";
import { RichMenu } from "../menu/RichMenu";
import { StScreen } from "../states/StScreen";
import { DocMiniature } from "./DocMini";
import { DcCover, DocThumb, docsCopy, useDocTokens } from "./DocParts";
import { RenameDocSheet } from "./RenameDocSheet";
import { backdropVars } from "./backdrop";
import { ageLabel } from "./labels";
import { docActions } from "./menu-model";
import {
  DOC_SORTS,
  type DocSort,
  type DocSortKey,
  dirLabel,
  sortDocs,
} from "./sort";
import { type TokenReader, fontOf, pageVars, styleOf } from "./style";
import {
  docHref,
  downloadMarkdown,
  pdfHref,
  useDocActions,
} from "./useDocActions";
import type { DocsController, DocsView } from "./useDocsController";

const copy = docsCopy;

const VIEWS: [DocsView, ReactNode, string][] = [
  ["grid", <LuLayoutTemplate key="g" size={16} />, "Grid"],
  ["masonry", <LuLayers key="m" size={16} />, "Cards by length"],
  ["list", <LuList key="l" size={16} />, "List"],
];

/** The desktop's notice: a toast whose one action is Undo. */
const say = (text: string, undo?: () => void | Promise<unknown>) =>
  void notify.success(
    text,
    undo ? { action: { label: "Undo", onClick: () => void undo() } } : undefined
  );

function DocMeta({
  doc,
  project,
  now,
}: {
  doc: V3Doc;
  project: string | null;
  now: number;
}) {
  return (
    <div className="docs-doc-meta-1">
      {project ? (
        <>
          <LuFolder size={14} aria-hidden />
          <span className="docs-doc-meta-2">{project}</span>
          <span className="docs-doc-meta-3">•</span>
        </>
      ) : null}
      <span className="docs-doc-meta-4">
        {copy.DocMeta.updated} {ageLabel(doc.updatedAt, now).toLowerCase()}
      </span>
    </div>
  );
}

/**
 * Craft's card: the document's backdrop is the frame, its page sits inside
 * in its own colour (cover strip on top) and runs off the bottom edge, so
 * the card reads as the top of the real page.
 */
function DocCard({
  doc,
  read,
  project,
  now,
  masonry,
  onOpen,
  onPin,
}: {
  doc: V3Doc;
  read: TokenReader;
  project: string | null;
  now: number;
  masonry?: boolean;
  onOpen: () => void;
  onPin: () => void;
}) {
  const s = styleOf(doc);
  const bd = s.backdrop !== "none";
  const f = fontOf(s.font);
  const pinLabel = doc.isFavorite ? copy.DocCard.unpin : copy.DocCard.pin;
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      data-ctx="doc-card"
      data-ctx-id={doc.id}
      className={
        "docs-card" +
        (bd ? " dc-bd is-on" : "") +
        (masonry ? " is-masonry" : "")
      }
      style={bd ? backdropVars(s.backdrop, read) : undefined}
    >
      <div
        className={"dt-themed docs-card-page" + (bd ? " is-on" : "")}
        style={pageVars(s, read)}
      >
        {s.cover ? (
          <div className="docs-doc-card-1">
            <DcCover cover={s.cover} />
          </div>
        ) : null}
        <div
          className={"docs-doc-card-2 docs-doc-card-s1" + (bd ? " is-on" : "")}
        >
          <div className="docs-doc-card-3">
            <div className="docs-doc-card-4">
              <span
                className={
                  "docs-doc-card-5 docs-card-title" +
                  (doc.title ? "" : " is-untitled")
                }
                style={{ fontFamily: f.css }}
                title={doc.title || undefined}
              >
                {doc.title || copy.DocCard.untitled_document}
              </span>
              <span
                className={"docs-doc-card-6" + (doc.isFavorite ? " is-on" : "")}
              >
                <button
                  type="button"
                  className="nx-btn nx-btn-text nx-btn-sm"
                  aria-label={pinLabel}
                  aria-pressed={doc.isFavorite}
                  title={pinLabel}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPin();
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <LuStar size={14} aria-hidden />
                </button>
              </span>
            </div>
            <DocMeta doc={doc} project={project} now={now} />
          </div>
          <div
            className={
              "docs-doc-card-7 docs-doc-card-s2" + (masonry ? " is-on" : "")
            }
          >
            <DocMiniature rows={doc.preview ?? []} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DocList({
  docs,
  read,
  now,
  sort,
  onSort,
  onOpen,
}: {
  docs: V3Doc[];
  read: TokenReader;
  now: number;
  sort: DocSort;
  onSort: (key: DocSortKey) => void;
  onOpen: (id: string) => void;
}) {
  const cols = "minmax(0, 1fr) 120px 120px 100px";
  const head = (key: DocSortKey, label: string) => {
    const on = sort.key === key;
    return (
      <button
        type="button"
        className={"docs-list-head is-btn" + (on ? " is-sorted" : "")}
        aria-label={on ? `${label}, ${dirLabel(key, sort.dir)}` : label}
        onClick={() => onSort(key)}
      >
        {label}
        {on ? (
          sort.dir === "asc" ? (
            <LuArrowUp size={12} aria-hidden />
          ) : (
            <LuArrowDown size={12} aria-hidden />
          )
        ) : null}
      </button>
    );
  };
  return (
    <div className="docs-dc-style-panel-1">
      <div className="docs-doc-list-1" style={{ gridTemplateColumns: cols }}>
        {head("name", copy.DocList.name)}
        {head("viewed", copy.DocList.last_viewed)}
        {head("updated", copy.DocList.updated)}
        {head("created", copy.DocList.created)}
      </div>
      {docs.map((d) => (
        <div
          key={d.id}
          role="link"
          tabIndex={0}
          onClick={() => onOpen(d.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onOpen(d.id);
          }}
          className="nav-row docs-doc-list-2"
          data-ctx="doc-card"
          data-ctx-id={d.id}
          style={{ gridTemplateColumns: cols }}
        >
          <span className="docs-doc-list-3">
            <DocThumb doc={d} read={read} w={30} h={38} />
            <span className="docs-doc-list-4">
              <span
                className={
                  "docs-doc-list-5 docs-doc-list-s1" + (d.title ? " is-on" : "")
                }
                title={d.title || undefined}
              >
                {d.title || copy.DocList.untitled}
              </span>
            </span>
          </span>
          {/* //todo: a per-person "Last viewed" needs PageView reads; until
              the API sends viewedAt it shows the last update. */}
          <span className="docs-dc-row-4">{ageLabel(d.updatedAt, now)}</span>
          <span className="docs-dc-row-4">{ageLabel(d.updatedAt, now)}</span>
          <span className="docs-dc-row-4">{ageLabel(d.createdAt, now)}</span>
        </div>
      ))}
    </div>
  );
}

/** A menu hung under its trigger, closed by a click anywhere else. */
function DropMenu({
  trigger,
  width,
  children,
}: {
  trigger: (open: boolean) => ReactNode;
  width: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [shown, leaving] = useExit(open, 130);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span className="docs-drop-menu-1" ref={wrap}>
      <span className="docs-drop-menu-2" onClick={() => setOpen(!open)}>
        {trigger(open)}
      </span>
      {shown ? (
        <div
          role="menu"
          className={
            "nx-pop docs-drop-pop is-right base-menu" +
            (leaving ? " is-leaving" : "")
          }
          style={{ width }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}

function MenuRow({
  icon,
  hint,
  onClick,
  children,
  keepOpen,
}: {
  icon: ReactNode;
  hint?: ReactNode;
  onClick: () => void;
  children: ReactNode;
  keepOpen?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="menu-row"
      style={{ width: "100%", border: 0, background: "transparent" }}
      onClick={(e) => {
        if (keepOpen) e.stopPropagation();
        onClick();
      }}
    >
      <span style={{ display: "flex", width: 14 }}>{icon}</span>
      <span style={{ flex: 1, textAlign: "left" }}>{children}</span>
      {hint}
    </button>
  );
}

/** The page header's own "+" with the page's small create menu. */
function PageAddButton({ onNewDoc }: { onNewDoc: () => void }) {
  const router = useRouter();
  const c = copy.DocsScreen;
  return (
    <RichMenu
      width={312}
      trigger={(open) => (
        <button
          type="button"
          aria-label={c.new_document}
          title={open ? undefined : c.new_document}
          aria-expanded={open}
          data-page-add=""
          className="nx-btn nx-btn-secondary page-add"
        >
          <LuPlus size={18} aria-hidden />
        </button>
      )}
      items={[
        {
          art: "doc",
          title: c.new_doc,
          sub: c.start_something_new,
          onClick: onNewDoc,
        },
        //todo: New Folder needs a v3 folder flow (PageFolder exists, no v3 UI).
        {
          art: "folder",
          title: c.new_folder,
          sub: c.keep_things_tidy,
          disabled: true,
        },
        {
          art: "template",
          title: c.from_template,
          sub: c.save_time_with_templates,
          onClick: () => router.push("/templates"),
        },
      ]}
    />
  );
}

/** The docs grid (prototype DocsScreen.jsx `DocsScreen` 476). */
export function DocsScreen({ ctl }: { ctl: DocsController }) {
  const router = useRouter();
  const query = useDocs();
  const projects = useProjects();
  const read = useDocTokens();
  const act = useDocActions(say);
  const pin = act.pin;
  const [renaming, setRenaming] = useState<V3Doc | null>(null);
  const [sharing, setSharing] = useState<V3Doc | null>(null);
  const lastShared = useRef<V3Doc | null>(null);
  if (sharing) lastShared.current = sharing;
  const shareDoc = sharing ?? lastShared.current;
  const openSettings = useNeedt3Ui((s) => s.openSettings);
  // The sort and the create guard live above the face switch (DocsFace);
  // the stored sort is read after mount (no SSR mismatch).
  const { sort, setSort, refreshSort, view, setView } = ctl;
  useEffect(() => refreshSort(), [refreshSort]);
  const now = newDate().getTime();

  const mine = useMemo(
    () => (query.data ?? []).filter((d) => !d.trashedAt),
    [query.data]
  );
  const shown = useMemo(() => sortDocs(mine, sort), [mine, sort]);
  const projectName = useMemo(() => {
    const names = new Map(
      (projects.data ?? []).map((p) => [p.id, p.name] as const)
    );
    return (d: V3Doc) =>
      d.projectId ? (names.get(d.projectId) ?? null) : null;
  }, [projects.data]);

  const open = (id: string) => router.push(docHref(id));
  const openPdf = (id: string) => router.push(pdfHref(id));
  const newDoc = () => ctl.newDoc("");

  // Right-click on a card or a list row.
  const live = useRef({
    docs: mine,
    act,
    open,
    projects: projects.data ?? [],
    setRenaming,
    setSharing,
    openPdf,
  });
  live.current = {
    docs: mine,
    act,
    open,
    projects: projects.data ?? [],
    setRenaming,
    setSharing,
    openPdf,
  };
  useEffect(
    () =>
      registerCtx("doc-card", ({ id }) => {
        const { docs, act: a, open: o, projects: ps, ...ui } = live.current;
        const d = docs.find((x) => x.id === id);
        if (!d) return null;
        const move: CtxRow[] = [
          {
            label: "No project",
            hint: d.projectId ? undefined : "✓",
            run: () => a.moveTo(d, null),
          },
          ...ps.map((p) => ({
            label: p.name,
            hint: d.projectId === p.id ? "✓" : undefined,
            run: () => a.moveTo(d, p.id, p.name),
          })),
        ];
        const run: Record<string, () => void> = {
          open: () => o(d.id),
          "open-new-tab": () =>
            void window.open(docHref(d.id), "_blank", "noopener"),
          rename: () => ui.setRenaming(d),
          pin: () => a.pin(d),
          duplicate: () => a.duplicate(d),
          share: () => ui.setSharing(d),
          "copy-link": () => a.copyLink(d),
          "export-md": () => downloadMarkdown(d.id),
          "export-pdf": () => ui.openPdf(d.id),
          trash: () => a.trash(d),
        };
        const groups: CtxRow[][] = [];
        for (const spec of docActions(d, { phone: false, canExport: true })) {
          (groups[spec.group] ??= []).push(
            spec.id === "move"
              ? { label: spec.label + "…", hint: "›", sub: move }
              : {
                  label: spec.label,
                  tone: spec.danger ? "danger" : undefined,
                  run: run[spec.id],
                }
          );
        }
        return groups.filter(Boolean);
      }),
    []
  );

  const c = copy.DocsScreen;
  return (
    <div
      className="flex min-h-0 flex-1 flex-col px-8"
      data-v3-screen="docs"
    >
      {/* Craft's header: [+] title … view switcher and a ⋯ menu. Search is
          the top bar's ⌘K, so the grid has no field of its own. */}
      <header className="docs-docs-screen-1">
        <PageAddButton onNewDoc={newDoc} />
        <h1 className="docs-docs-screen-2">{c.documents}</h1>
        <span className="docs-docs-screen-3">
          {VIEWS.map(([id, icon, label]) => (
            <button
              key={id}
              type="button"
              className={
                "docs-docs-screen-4 docs-docs-screen-s1" +
                (view === id ? " is-on" : "")
              }
              aria-label={label}
              title={label}
              aria-pressed={view === id}
              onClick={() => setView(id)}
            >
              {icon}
            </button>
          ))}
        </span>
        <DropMenu
          width={232}
          trigger={(isOpen) => (
            <button
              type="button"
              aria-label={c.more}
              aria-expanded={isOpen}
              data-docs-more=""
              className="nx-btn nx-btn-secondary docs-raised-round"
            >
              <LuEllipsis size={18} aria-hidden />
            </button>
          )}
        >
          <span
            className="base-meta"
            style={{ display: "block", padding: "6px 8px 2px" }}
          >
            {copy.SortMenuItems.sort_by}
          </span>
          {DOC_SORTS.map(([id, label]) => {
            const on = sort.key === id;
            return (
              <MenuRow
                key={id}
                keepOpen
                icon={on ? <LuCheck size={14} aria-hidden /> : null}
                hint={
                  on ? (
                    <span
                      className="docs-sort-arrow"
                      aria-label={dirLabel(id, sort.dir)}
                    >
                      {sort.dir === "asc" ? (
                        <LuArrowUp size={13} aria-hidden />
                      ) : (
                        <LuArrowDown size={13} aria-hidden />
                      )}
                    </span>
                  ) : undefined
                }
                onClick={() => setSort(id)}
              >
                {label}
              </MenuRow>
            );
          })}
          <span className="base-menu-sep" aria-hidden />
          {/* //todo: Select, Show daily notes, Import and Export are mocks in
              the prototype (toasts, client-side Markdown of fixture bodies);
              they come back with multi-select, daily notes and an export
              route. */}
          <MenuRow
            icon={<LuSlidersHorizontal size={14} aria-hidden />}
            onClick={() => openSettings()}
          >
            {c.settings}
          </MenuRow>
        </DropMenu>
      </header>
      <StScreen query={query} kind="grid" screen="docs">
        <div className="scroll-inner docs-docs-screen-6 min-h-0 flex-1">
          {mine.length === 0 ? (
            <div className="docs-docs-screen-7" data-docs-empty="">
              <Art name="doc" size={56} />
              <span className="docs-docs-screen-8">
                {c.no_documents_yet_start_one_and_it_shows_}
              </span>
              <button
                type="button"
                className="nx-btn nx-btn-primary"
                onClick={newDoc}
              >
                <LuPlus size={15} aria-hidden />
                {c.new_doc_2}
              </button>
            </div>
          ) : view === "list" ? (
            <DocList
              docs={shown}
              read={read}
              now={now}
              sort={sort}
              onSort={setSort}
              onOpen={open}
            />
          ) : view === "masonry" ? (
            <div className="dc-masonry docs-docs-screen-9">
              {shown.map((d) => (
                <DocCard
                  key={d.id}
                  doc={d}
                  read={read}
                  project={projectName(d)}
                  now={now}
                  masonry
                  onOpen={() => open(d.id)}
                  onPin={() => pin(d)}
                />
              ))}
            </div>
          ) : (
            <div className="dc-grid docs-docs-screen-10">
              {shown.map((d, i) => (
                <div
                  key={d.id}
                  className="nx-swap"
                  style={
                    {
                      animationDelay: `${Math.min(i * 30, 240)}ms`,
                    } as CSSProperties
                  }
                >
                  <DocCard
                    doc={d}
                    read={read}
                    project={projectName(d)}
                    now={now}
                    onOpen={() => open(d.id)}
                    onPin={() => pin(d)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </StScreen>
      <RenameDocSheet
        doc={renaming}
        onSave={act.rename}
        onClose={() => setRenaming(null)}
      />
      {shareDoc ? (
        <ShareSheet
          doc={shareDoc}
          read={read}
          open={!!sharing}
          onClose={() => setSharing(null)}
        />
      ) : null}
    </div>
  );
}
