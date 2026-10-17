"use client";

import {
  type DragEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  LuArrowUpRight,
  LuChevronDown,
  LuChevronLeft,
  LuEllipsis,
  LuEye,
  LuEyeOff,
  LuLock,
  LuPlus,
  LuUpload,
} from "react-icons/lu";

import { ProBadge } from "@/components/needt3/paywall/Pro";

import {
  type V3BoardItem,
  useBoard,
  useBoardItems,
  useBoards,
} from "@/lib/needt3/hooks/boards";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import { notify } from "@/lib/notifications";

import { Art } from "../../menu/Art";
import { RichMenu, type RichMenuItem } from "../../menu/RichMenu";
import { SortableItem, SortableList } from "../../sortable/Sortable";
import { useSortableList } from "../../sortable/useSortableList";
import { StScreen } from "../../states/StScreen";
import { PlaceHeader } from "../PlaceHeader";
import { mergeQueries } from "../query";
import type { BoardsController } from "../useBoardsController";
import { AddDialogs } from "./AddDialogs";
import { Detail } from "./Detail";
import { ShareDialog } from "./ShareDialog";
import { copyText, openUrl } from "./clipboard";
import {
  canWrite,
  classifyPaste,
  isFieldTarget,
  isFigma,
  isPrivateBoard,
  isWebUrl,
  personName,
  referencesLabel,
  sourceLabel,
} from "./logic";
import { Avatars, FavBadge, Visual } from "./parts";

/* ---------- the title, editable in place ---------- */

function BoardTitle({
  title,
  guest,
  onRename,
}: {
  title: string;
  guest: boolean;
  onRename: (title: string) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(title);
  if (!edit || guest)
    return (
      <span
        className={"pl-mb-title" + (guest ? " is-guest" : "")}
        title={guest ? title : `${title} — click to rename`}
        role={guest ? undefined : "button"}
        tabIndex={guest ? undefined : 0}
        onClick={() => {
          if (guest) return;
          setV(title);
          setEdit(true);
        }}
        onKeyDown={(e) => {
          if (!guest && e.key === "Enter") {
            setV(title);
            setEdit(true);
          }
        }}
      >
        {title}
      </span>
    );
  const done = (keep: boolean) => {
    setEdit(false);
    const t = v.trim();
    if (keep && t && t !== title) onRename(t);
  };
  return (
    <input
      className="pl-mb-title-input pl-board-title-input"
      autoFocus
      aria-label="Board name"
      autoComplete="off"
      enterKeyHint="done"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") done(true);
        if (e.key === "Escape") done(false);
      }}
      style={{ width: `${Math.max(8, v.length + 2)}ch` }}
    />
  );
}

/* ---------- one reference in the wall ---------- */

function Card({
  it,
  i,
  n,
  guest,
  canDrag,
  onOpen,
  onRemove,
  onEditNote,
  onTop,
}: {
  it: V3BoardItem;
  /** Index among the board's own references (-1 for a tile from the old canvas). */
  i: number;
  /** Index in the wall, for the entry stagger. */
  n: number;
  guest: boolean;
  canDrag: boolean;
  onOpen: (id: string) => void;
  onRemove: (it: V3BoardItem) => void;
  onEditNote: (id: string) => void;
  onTop: (id: string) => void;
}) {
  const writable = !guest && !it.fromCanvas;
  const name = it.title || it.colorName || it.kind;
  const items: RichMenuItem[] = [
    {
      art: "doc",
      title: it.kind === "note" || it.text ? "Edit note" : "Add a note",
      onClick: () => onEditNote(it.id),
    },
    isWebUrl(it.url)
      ? {
          art: "page",
          title: "Copy link",
          onClick: () => void copyText(it.url as string),
        }
      : it.kind === "color" && it.color
        ? {
            art: "tune",
            title: "Copy hex",
            onClick: () =>
              void copyText(
                (it.color as string).toUpperCase(),
                `Copied ${(it.color as string).toUpperCase()}`
              ),
          }
        : null,
    i > 0
      ? { art: "stack", title: "Move to top", onClick: () => onTop(it.id) }
      : null,
    { sep: true },
    { art: "trash", title: "Remove", onClick: () => onRemove(it) },
  ].filter(Boolean) as RichMenuItem[];
  const sortable = canDrag && writable;
  const figureProps = {
    "data-id": it.id,
    tabIndex: 0,
    role: "button",
    "aria-label": `${name} — open`,
    onClick: () => onOpen(it.id),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target === e.currentTarget && e.key === "Enter") onOpen(it.id);
    },
    style: { animationDelay: `${Math.min(n, 12) * 30}ms` },
  } as const;
  const body = (
    <>
      <span className="pl-card-el">
        <Visual it={it} />
        <span className="mb-bar" onClick={(e) => e.stopPropagation()}>
          {it.kind === "link" ? <FavBadge it={it} size={14} /> : null}
          <span className="pl-pinterest-section-el-3">{sourceLabel(it)}</span>
          {isWebUrl(it.url) ? (
            <button
              type="button"
              aria-label={`Open ${sourceLabel(it)}`}
              title={isFigma(it) ? "Opens in Figma" : "Open source"}
              className="mb-bar-btn"
              onClick={() => openUrl(it.url as string)}
            >
              <LuArrowUpRight size={13} aria-hidden />
            </button>
          ) : null}
          {writable ? (
            <RichMenu
              small
              align="right"
              width={200}
              items={items}
              trigger={
                <button
                  type="button"
                  aria-label="More"
                  className="mb-bar-btn mb-card-more"
                >
                  <LuEllipsis size={14} aria-hidden />
                </button>
              }
            />
          ) : null}
        </span>
      </span>
      {it.kind === "link" ? (
        <figcaption className="pl-card-col-2">
          <span className="pl-card-el-2">{it.title}</span>
          <span className="pl-meta">
            {isFigma(it) ? "Opens in Figma" : (it.source?.domain ?? "")}
          </span>
        </figcaption>
      ) : null}
      {it.text && it.kind !== "note" ? (
        <figcaption className="mb-card-note pl-card-figcaption">
          {it.text}
        </figcaption>
      ) : null}
    </>
  );
  // A reference you can move wears the shared sortable row: the whole card is
  // the grip, a drag starts after a few pixels, Space and the arrows move it.
  return sortable ? (
    <SortableItem
      id={it.id}
      as="figure"
      self
      className={`nx-swap mb-card mb-item mb-kind-${it.kind} pl-card-col`}
      {...figureProps}
    >
      {() => body}
    </SortableItem>
  ) : (
    <figure
      className={`nx-swap mb-card mb-item mb-kind-${it.kind} pl-card-col`}
      {...figureProps}
    >
      {body}
    </figure>
  );
}

/* ---------- the page ---------- */

/**
 * A board (places.jsx `MoodboardsScreen`, the open-board half): its references
 * as a grid, Add (Upload images, drop, paste, link, colour, note), a reference
 * opened on the side, drag to reorder, Share, "View as guest". Read from and
 * written through the items routes; the controller is the route's and is
 * shared with the phone page.
 */
export function BoardPage({ id, ctl }: { id: string; ctl: BoardsController }) {
  const boards = useBoards();
  const board = useBoard(id);
  const itemsQuery = useBoardItems(id);
  const tz = useTimeZone();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dropOn, setDropOn] = useState(false);
  const depth = useRef(0);

  const listed = (boards.data ?? []).find((b) => b.id === id);
  const b = board.data
    ? {
        ...listed,
        ...board.data,
        ...(listed
          ? { memberCount: listed.memberCount, members: listed.members }
          : {}),
      }
    : undefined;
  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const role = b?.accessRole;
  const canEdit = canWrite(role);
  const guest = ctl.guest;
  const writing = canEdit && !guest;
  const own = items.filter((i) => !i.fromCanvas);
  const detail = items.find((x) => x.id === ctl.detailId) ?? null;
  const priv = b
    ? isPrivateBoard({
        memberCount: listed?.memberCount,
        linkShare: b.linkShare,
      })
    : true;
  const dialogOpen = ctl.sheet !== null || !!detail;

  // A reference removed elsewhere closes its detail.
  useEffect(() => {
    if (ctl.detailId && itemsQuery.data && !detail) ctl.closeDetail();
    // ctl.closeDetail only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctl.detailId, itemsQuery.data, detail]);

  // ⌘V on the board: a picture, a colour, or a link.
  const onPaste = (e: ClipboardEvent) => {
    if (!writing || dialogOpen || isFieldTarget(e.target)) return;
    const cd = e.clipboardData;
    if (!cd) return;
    const action = classifyPaste({
      files: Array.from(cd.files ?? []),
      text: cd.getData("text/uri-list") || cd.getData("text/plain") || "",
    });
    if (action.kind === "images") {
      e.preventDefault();
      void ctl.addFiles(id, action.files);
    } else if (action.kind === "colour") {
      e.preventDefault();
      void ctl.addColour(id, action.hex);
    } else if (action.kind === "link") {
      e.preventDefault();
      void ctl.addLink(id, action.link.url);
    } else if ((cd.getData("text/plain") || "").trim()) {
      notify.info("Paste an image or a link to add it");
    }
  };
  const pasteRef = useRef(onPaste);
  pasteRef.current = onPaste;
  useEffect(() => {
    const h = (e: ClipboardEvent) => pasteRef.current(e);
    document.addEventListener("paste", h);
    return () => document.removeEventListener("paste", h);
  }, []);

  // Files dropped anywhere on the board.
  const hasFiles = (e: DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const dropProps = writing
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current++;
          setDropOn(true);
        },
        onDragOver: (e: DragEvent) => {
          if (hasFiles(e)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        },
        onDragLeave: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          depth.current = Math.max(0, depth.current - 1);
          if (!depth.current) setDropOn(false);
        },
        onDrop: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current = 0;
          setDropOn(false);
          void ctl.addFiles(id, Array.from(e.dataTransfer.files));
        },
      }
    : {};

  // Dragging a reference inside the wall (the shared sortable list): only a
  // drop onto another reference changes the order; Esc leaves it as it was.
  const sort = useSortableList({
    items: own,
    axis: "grid",
    grab: "item",
    label: (x) => x.title || x.colorName || x.kind,
    onReorder: async (order) => {
      if (!(await ctl.reorder(id, order))) throw new Error("not saved");
    },
  });
  const pickImages = () => fileInput.current?.click();
  const addItems: RichMenuItem[] = [
    { art: "import", title: "Upload images", onClick: pickImages },
    {
      art: "page",
      title: "Paste a link",
      kbd: "⌘V",
      onClick: () => ctl.openSheet("link"),
    },
    { art: "tune", title: "Colour", onClick: () => ctl.openSheet("colour") },
    { art: "doc", title: "Note", onClick: () => ctl.openSheet("note") },
    { sep: true },
    // Pinterest has no connection behind it: the row says so and does nothing.
    {
      art: "stack",
      title: "Connect Pinterest board",
      badge: (
        <>
          <ProBadge size="sm" />
          <span className="pl-meta">Coming soon</span>
        </>
      ),
      disabled: true,
    },
  ];

  const query = mergeQueries([board, itemsQuery]);
  const title = b?.title || "Untitled moodboard";
  const faces = (listed?.members ?? []).map((m) => ({
    key: m.email ?? m.userId,
    name: personName(m),
  }));

  return (
    <div
      className="scroll-inner mb-board pl-mb-box"
      data-v3-screen="moodboard"
      {...dropProps}
    >
      <PlaceHeader
        art="stack"
        title={
          b ? (
            <BoardTitle
              key={id}
              guest={guest || !canEdit}
              title={title}
              onRename={(t) => void ctl.rename(id, t)}
            />
          ) : (
            "Moodboard"
          )
        }
        add={
          <button
            type="button"
            className="nx-btn nx-btn-text nx-btn-sm pl-mb-back"
            data-mb-back=""
            onClick={ctl.back}
          >
            <LuChevronLeft size={15} aria-hidden />
            Moodboards
          </button>
        }
        meta={
          b ? (
            <span className="pl-mb-row-2">
              {referencesLabel(items.length)}
              {priv ? (
                <span title="Private — only you" className="pl-mb-row-3">
                  <LuLock size={13} aria-label="Private" />
                </span>
              ) : null}
            </span>
          ) : null
        }
        actions={
          b ? (
            <>
              {canEdit ? (
                <button
                  type="button"
                  className={
                    "nx-btn nx-btn-text nx-btn-sm mb-guest" +
                    (guest ? " nx-selected" : "")
                  }
                  aria-pressed={guest}
                  onClick={() => ctl.setGuest(!guest)}
                  title="Preview what people you invite see"
                >
                  {guest ? (
                    <LuEyeOff size={13} aria-hidden />
                  ) : (
                    <LuEye size={13} aria-hidden />
                  )}
                  {guest ? "Exit guest view" : "View as guest"}
                </button>
              ) : null}
              {!guest ? (
                <button
                  type="button"
                  className="nx-btn nx-btn-secondary mb-share"
                  onClick={() => ctl.openSheet("share")}
                >
                  {!priv && faces.length ? (
                    <Avatars
                      people={faces}
                      size={18}
                      max={3}
                      total={listed?.memberCount ?? faces.length}
                    />
                  ) : (
                    <LuLock size={13} aria-hidden />
                  )}
                  Share
                </button>
              ) : null}
              {writing ? (
                <RichMenu
                  small
                  align="right"
                  width={320}
                  prompt="Add to this board"
                  items={addItems}
                  trigger={(o) => (
                    <button
                      type="button"
                      aria-expanded={o}
                      className="nx-btn nx-btn-primary mb-add"
                    >
                      <LuPlus size={14} aria-hidden />
                      Add
                    </button>
                  )}
                />
              ) : null}
            </>
          ) : null
        }
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Upload images"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void ctl.addFiles(id, files);
        }}
      />
      {guest ? (
        <div className="mb-guest-bar nx-swap pl-mb-row-4">
          <LuEye size={14} aria-hidden />
          <span className="pl-mb-el">
            Viewing as a guest with <b className="pl-mb-text">Can view</b> —
            this is what people you invite see.
          </span>
          <button
            type="button"
            className="nx-btn nx-btn-text nx-btn-sm"
            onClick={() => ctl.setGuest(false)}
          >
            Exit
          </button>
        </div>
      ) : null}
      <StScreen query={query} kind="grid" screen="moodboards" title={title}>
        {items.length ? (
          <div key={id} className="mb-grid pl-mb-box-2" data-mb-wall="">
            <SortableList ctl={sort}>
              {[...sort.ordered, ...items.filter((x) => x.fromCanvas)].map(
                (it, n) => (
                  <Card
                    key={it.id}
                    it={it}
                    n={n}
                    i={own.findIndex((x) => x.id === it.id)}
                    guest={!writing}
                    canDrag={writing && own.length > 1}
                    onOpen={ctl.openDetail}
                    onEditNote={ctl.openDetail}
                    onTop={(cardId) => void ctl.moveToTop(id, cardId)}
                    onRemove={(x) => {
                      ctl.closeDetail();
                      void ctl.removeReference(id, x);
                    }}
                  />
                )
              )}
            </SortableList>
          </div>
        ) : !writing ? (
          <p className="pl-line">Nothing on this board yet.</p>
        ) : (
          <div className="mb-empty nx-swap pl-mb-col">
            <span className="pl-pinterest-sheet-col-3">
              <span className="pl-sheet-title">Start this board</span>
              <span className="pl-line">
                Collect what this should feel like — pictures, links, colours.
              </span>
            </span>
            <div className="pl-mb-grid">
              <div className="pl-mb-col-2">
                <span className="pl-mb-grid-2">
                  <LuUpload size={16} aria-hidden />
                </span>
                <span className="pl-strong">Drop images</span>
                <span className="pl-mb-el-2">
                  Drag files anywhere on the board
                </span>
                <button
                  type="button"
                  className="nx-btn nx-btn-secondary nx-btn-sm"
                  onClick={pickImages}
                >
                  Choose files
                </button>
              </div>
              <div className="pl-mb-col-2">
                <span className="pl-mb-grid-2">
                  <Art name="page" size={16} />
                </span>
                <span className="pl-strong">Paste with ⌘V</span>
                <span className="pl-mb-el-2">
                  An image or any link — Figma, a shop, an article
                </span>
                <button
                  type="button"
                  className="nx-btn nx-btn-secondary nx-btn-sm"
                  onClick={() => ctl.openSheet("link")}
                >
                  Paste a link
                </button>
              </div>
              <div className="pl-mb-col-2">
                <span className="pl-mb-grid-2">
                  <LuPlus size={16} aria-hidden />
                </span>
                <span className="pl-strong">Add</span>
                <span className="pl-mb-el-2">A colour or a note</span>
                <RichMenu
                  small
                  width={260}
                  items={addItems.slice(2, 4)}
                  trigger={(o) => (
                    <button
                      type="button"
                      aria-expanded={o}
                      className="nx-btn nx-btn-secondary nx-btn-sm"
                    >
                      More ways
                      <LuChevronDown size={12} aria-hidden />
                    </button>
                  )}
                />
              </div>
            </div>
          </div>
        )}
      </StScreen>
      {dropOn ? (
        <div className="mb-drop nx-scrim" aria-hidden="true">
          <span>
            <LuUpload size={22} />
            Drop to add
          </span>
        </div>
      ) : null}
      <Detail
        item={detail}
        readOnly={!writing || !!detail?.fromCanvas}
        tz={tz}
        onClose={ctl.closeDetail}
        onSave={(itemId, text) => ctl.saveItem(id, itemId, { text })}
        onRemove={(x) => {
          ctl.closeDetail();
          void ctl.removeReference(id, x);
        }}
      />
      <AddDialogs
        sheet={ctl.sheet}
        saving={ctl.saving}
        onClose={ctl.closeSheet}
        onLink={(url) => ctl.addLink(id, url)}
        onColour={(hex, name) => ctl.addColour(id, hex, name)}
        onNote={(text) => ctl.addNote(id, text)}
      />
      <ShareDialog
        boardId={id}
        title={title}
        open={ctl.sheet === "share"}
        onClose={ctl.closeSheet}
        onLinkShare={(on) => ctl.setLinkShare(id, on)}
      />
    </div>
  );
}
