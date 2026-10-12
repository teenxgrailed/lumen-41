"use client";

/* DOCUMENTS — a pinned grid plus a list, each card a miniature of its own
 * text.
 *
 * PORT.md §3: "Documents (`DocsScreen`) ... a pinned grid plus a list, each
 * card a miniature of its own text." Ported from
 * `Content height and label fixes/needt-app/DocsScreen.jsx`'s `DocCard` —
 * the 208×260 card with a page peeking out of it — but that kit drew every
 * card's page with the same three-line rhythm. `doc-lines.ts` derives the
 * rhythm from the document's own title instead, so a card reads as a
 * miniature of THAT document rather than a coloured swatch with a caption,
 * and the same rule draws the compact page swatch on a list row.
 *
 * PORT.md §0 rule 6: block bodies are `--surface-raised`, colour is a mark.
 * The project hue lives on the tile only — the sheet inside the card stays
 * the same raised white every project's card gets.
 *
 * Takes no route of its own: this drops into `screenSlots.docs` inside
 * `ScreenFrame`, which already draws the "Documents" title and blurb — so
 * this file owns the toolbar and the two sections beneath it, not a second
 * page title.
 * That is a property of this file, not a licence to stop: a surface is
 * not ported until the thing that reaches it lands with it — see
 * `docs/handoff/design-workflow.md`.
 */
import * as React from "react";

import {
  LuDatabase,
  LuEllipsis,
  LuExternalLink,
  LuFileText,
  LuFolder,
  LuFolderPlus,
  LuLockKeyhole,
  LuPlus,
  LuSearch,
  LuStar,
  LuTag,
  LuTrash2,
} from "react-icons/lu";

import type { NeedtDocument } from "@/lib/needt/types";

import {
  Glyph,
  Hung,
  IconButton,
  MenuItem,
  MenuSeparator,
} from "../shell/chrome";
import { docLineWidths } from "./doc-lines";

export interface DocsFilters {
  folderId?: string;
  tagIds?: string[];
  favorites?: boolean;
  privateOnly?: boolean;
}

export interface DocsMetadata {
  folders: Array<{ id: string; name: string; color: string | null }>;
  tags: Array<{ id: string; name: string; color: string | null }>;
  smartFolders: Array<{
    id: string;
    name: string;
    query: DocsFilters;
  }>;
}

export interface DocsScreenProps {
  docs: readonly NeedtDocument[];
  query?: string;
  filters?: DocsFilters;
  metadata?: DocsMetadata;
  onQueryChange?: (query: string) => void;
  onFiltersChange?: (filters: DocsFilters) => void;
  onOpen?: (doc: NeedtDocument) => void;
  onNew?: () => void;
  onNewDatabase?: () => void;
  onToggleStar?: (doc: NeedtDocument, starred: boolean) => void;
  onTrash?: (doc: NeedtDocument) => void;
  onCreateMetadata?: (
    kind: "folder" | "tag" | "smart-folder",
    name: string
  ) => Promise<void>;
}

/** The page peeking out of a card, or the small swatch on a list row — one
 *  component either way, so a document's own miniature never has two
 *  different implementations to drift apart. */
function DocPage({
  title,
  lines,
  width,
  height,
}: {
  title: string;
  lines: number;
  width: number;
  height: number;
}) {
  const widths = docLineWidths(title, lines);
  return (
    <span
      className="raised"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: Math.max(2, Math.round(height / 22)),
        width,
        height,
        padding: Math.round(width * 0.05),
        borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
        overflow: "hidden",
      }}
    >
      {widths.map((w, i) => (
        <span
          key={i}
          style={{
            flex: "none",
            height: Math.max(2, Math.round(height / 34)),
            width: `${w}%`,
            borderRadius: 2,
            background: i === 0 ? "var(--fill-6)" : "var(--fill-4)",
          }}
        />
      ))}
    </span>
  );
}

function DocMenu({
  onOpen,
  starred,
  onToggleStar,
  onTrash,
}: {
  onOpen?: () => void;
  starred: boolean;
  onToggleStar?: () => void;
  onTrash?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <span
      style={{ display: "flex", marginLeft: "auto" }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Hung
        open={open}
        kind="menu"
        onDismiss={() => setOpen(false)}
        trigger={
          <span className="reveal-on-hover">
            <IconButton
              label="More"
              variant="ghost"
              icon={<Glyph of={LuEllipsis} size={14} />}
              onClick={() => setOpen((v) => !v)}
            />
          </span>
        }
      >
        <MenuItem
          icon={<Glyph of={LuExternalLink} size={14} />}
          onClick={() => {
            setOpen(false);
            onOpen?.();
          }}
        >
          Open
        </MenuItem>
        {onToggleStar ? (
          <MenuItem
            icon={<Glyph of={LuStar} size={14} filled={starred} />}
            onClick={() => {
              setOpen(false);
              onToggleStar();
            }}
          >
            {starred ? "Unstar" : "Star"}
          </MenuItem>
        ) : null}
        {onTrash ? (
          <>
            <MenuSeparator />
            <MenuItem
              destructive
              icon={<Glyph of={LuTrash2} size={14} />}
              onClick={() => {
                setOpen(false);
                onTrash();
              }}
            >
              Move to trash
            </MenuItem>
          </>
        ) : null}
      </Hung>
    </span>
  );
}

/** 208×260, a page peeking out of the top — the pinned grid's card. */
function DocCard({
  doc,
  onOpen,
  onToggleStar,
  onTrash,
}: {
  doc: NeedtDocument;
  onOpen?: () => void;
  onToggleStar?: () => void;
  onTrash?: () => void;
}) {
  return (
    <article
      className="card nt-card"
      data-interactive="true"
      onClick={onOpen}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && onOpen) {
          event.preventDefault();
          onOpen();
        }
      }}
      role={onOpen ? "link" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `Open ${doc.title}` : undefined}
      style={{
        width: 208,
        height: 260,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        cursor: "default",
      }}
    >
      <span style={{ margin: "10px 10px 0", flex: 1, minHeight: 0 }}>
        <DocPage title={doc.title} lines={doc.lines} width={188} height={140} />
      </span>
      <span
        style={{
          padding: 11,
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              font: "var(--type-ui-medium)",
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {doc.title}
          </span>
          <DocMenu
            onOpen={onOpen}
            starred={doc.pinned}
            onToggleStar={onToggleStar}
            onTrash={onTrash}
          />
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span
            style={{
              flex: "1 1 auto",
              minWidth: 0,
              font: "var(--type-meta)",
              color: "var(--text-quaternary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {doc.meta}
          </span>
          {doc.collection ? (
            <span
              className="chip nt-chip"
              style={{
                height: 20,
                flex: "none",
                maxWidth: 96,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: doc.collection.hue ?? "var(--text-disabled)",
                  flex: "none",
                }}
              />
              {doc.collection.name}
            </span>
          ) : null}
        </span>
      </span>
    </article>
  );
}

/** A row in the list: the same miniature page, small, on the left. */
function DocRow({
  doc,
  onOpen,
  onToggleStar,
  onTrash,
}: {
  doc: NeedtDocument;
  onOpen?: () => void;
  onToggleStar?: () => void;
  onTrash?: () => void;
}) {
  return (
    <article
      className="card nt-card"
      data-interactive="true"
      onClick={onOpen}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && onOpen) {
          event.preventDefault();
          onOpen();
        }
      }}
      role={onOpen ? "link" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `Open ${doc.title}` : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        height: 56,
        padding: "0 11px 0 0",
        cursor: "default",
      }}
    >
      <span
        style={{
          flex: "none",
          width: 36,
          height: 44,
          margin: "6px 0 6px 8px",
          borderRadius: "var(--radius-md) var(--radius-md) 0 0",
          overflow: "hidden",
          boxShadow: "var(--shadow-ring)",
        }}
      >
        <DocPage title={doc.title} lines={5} width={36} height={44} />
      </span>
      <span
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ flex: "1 1 auto", minWidth: 0 }}>
          <span
            style={{
              display: "block",
              font: "var(--type-ui-medium)",
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {doc.title}
          </span>
          <span
            style={{
              display: "block",
              font: "var(--type-meta)",
              color: "var(--text-quaternary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {doc.meta}
          </span>
        </span>
        {doc.collection ? (
          <span
            className="chip nt-chip"
            style={{
              flex: "none",
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: doc.collection.hue ?? "var(--text-disabled)",
                flex: "none",
              }}
            />
            {doc.collection.name}
          </span>
        ) : null}
      </span>
      <DocMenu
        onOpen={onOpen}
        starred={doc.pinned}
        onToggleStar={onToggleStar}
        onTrash={onTrash}
      />
    </article>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        margin: "0 0 11px",
        font: "var(--type-meta-medium)",
        color: "var(--text-quaternary)",
      }}
    >
      {children}
    </h2>
  );
}

export function DocsScreen({
  docs,
  query = "",
  filters = {},
  metadata = { folders: [], tags: [], smartFolders: [] },
  onQueryChange,
  onFiltersChange,
  onOpen,
  onNew,
  onNewDatabase,
  onToggleStar,
  onTrash,
  onCreateMetadata,
}: DocsScreenProps) {
  const [metadataName, setMetadataName] = React.useState("");
  const [creatingMetadata, setCreatingMetadata] = React.useState<
    "folder" | "tag" | "smart-folder" | null
  >(null);

  const createMetadata = React.useCallback(
    async (kind: "folder" | "tag" | "smart-folder") => {
      const name = metadataName.trim();
      if (!name || !onCreateMetadata) return;
      setCreatingMetadata(kind);
      try {
        await onCreateMetadata(kind, name);
        setMetadataName("");
      } finally {
        setCreatingMetadata(null);
      }
    },
    [metadataName, onCreateMetadata]
  );
  const pinned = React.useMemo(() => docs.filter((d) => d.pinned), [docs]);
  const rest = React.useMemo(() => docs.filter((d) => !d.pinned), [docs]);
  const noFilters =
    !filters.folderId &&
    !filters.tagIds?.length &&
    !filters.favorites &&
    !filters.privateOnly;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          flex: "none",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {onQueryChange ? (
            <label
              style={{ position: "relative", flex: "1 1 220px", maxWidth: 420 }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 10,
                  top: 9,
                  color: "var(--text-quaternary)",
                }}
              >
                <Glyph of={LuSearch} size={15} />
              </span>
              <input
                className="nt-input"
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search documents"
                aria-label="Search documents"
                style={{ paddingLeft: 32 }}
              />
            </label>
          ) : (
            <span
              style={{ font: "var(--type-meta)", color: "var(--text-muted)" }}
            >
              {docs.length} document{docs.length === 1 ? "" : "s"}
            </span>
          )}
          <span
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {onNewDatabase ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onNewDatabase}
              >
                <Glyph of={LuDatabase} size={16} />
                New database
              </button>
            ) : null}
            {onNew ? (
              <button type="button" className="btn" onClick={onNew}>
                <Glyph of={LuPlus} size={16} />
                New document
              </button>
            ) : null}
          </span>
        </div>

        {onCreateMetadata ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input
              className="nt-input nt-input-sm"
              value={metadataName}
              onChange={(event) => setMetadataName(event.target.value)}
              maxLength={80}
              placeholder="New folder, tag or saved filter"
              aria-label="New document organization"
              style={{ flex: "1 1 220px", maxWidth: 320 }}
            />
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!metadataName.trim() || creatingMetadata !== null}
              onClick={() => void createMetadata("folder")}
            >
              <Glyph of={LuFolderPlus} size={15} /> Folder
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!metadataName.trim() || creatingMetadata !== null}
              onClick={() => void createMetadata("tag")}
            >
              <Glyph of={LuTag} size={15} /> Tag
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!metadataName.trim() || creatingMetadata !== null}
              onClick={() => void createMetadata("smart-folder")}
            >
              <Glyph of={LuFolder} size={15} /> Save filter
            </button>
          </div>
        ) : null}

        {onFiltersChange ? (
          <div
            aria-label="Document filters"
            style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
          >
            <button
              type="button"
              className={noFilters ? "btn" : "btn btn-ghost"}
              onClick={() => onFiltersChange({})}
            >
              All
            </button>
            <button
              type="button"
              className={filters.favorites ? "btn" : "btn btn-ghost"}
              onClick={() => onFiltersChange({ favorites: true })}
            >
              <Glyph of={LuStar} size={14} /> Starred
            </button>
            <button
              type="button"
              className={filters.privateOnly ? "btn" : "btn btn-ghost"}
              onClick={() => onFiltersChange({ privateOnly: true })}
            >
              <Glyph of={LuLockKeyhole} size={14} /> Private
            </button>
            {metadata.folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={
                  filters.folderId === folder.id ? "btn" : "btn btn-ghost"
                }
                onClick={() => onFiltersChange({ folderId: folder.id })}
              >
                <Glyph of={LuFolder} size={14} /> {folder.name}
              </button>
            ))}
            {metadata.tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={
                  filters.tagIds?.[0] === tag.id ? "btn" : "btn btn-ghost"
                }
                onClick={() => onFiltersChange({ tagIds: [tag.id] })}
              >
                <Glyph of={LuTag} size={14} /> {tag.name}
              </button>
            ))}
            {metadata.smartFolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className="btn btn-ghost"
                onClick={() => onFiltersChange(folder.query)}
              >
                <Glyph of={LuFolder} size={14} /> {folder.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        className="scroll-inner"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        {docs.length === 0 ? (
          <div className="nt-empty">
            <span className="nt-empty-icon">
              <Glyph of={LuFileText} size={24} />
            </span>
            <span className="nt-empty-text">
              Nothing here yet. A new document starts blank; nothing writes
              itself.
            </span>
          </div>
        ) : (
          <>
            {pinned.length ? (
              <section>
                <SectionTitle>Pinned</SectionTitle>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, 208px)",
                    gap: 16,
                  }}
                >
                  {pinned.map((doc) => (
                    <DocCard
                      key={doc.id}
                      doc={doc}
                      onOpen={onOpen ? () => onOpen(doc) : undefined}
                      onToggleStar={
                        doc.canEdit && onToggleStar
                          ? () => onToggleStar(doc, !doc.pinned)
                          : undefined
                      }
                      onTrash={
                        doc.canTrash && onTrash ? () => onTrash(doc) : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {rest.length ? (
              <section>
                <SectionTitle>All documents</SectionTitle>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  {rest.map((doc) => (
                    <DocRow
                      key={doc.id}
                      doc={doc}
                      onOpen={onOpen ? () => onOpen(doc) : undefined}
                      onToggleStar={
                        doc.canEdit && onToggleStar
                          ? () => onToggleStar(doc, !doc.pinned)
                          : undefined
                      }
                      onTrash={
                        doc.canTrash && onTrash ? () => onTrash(doc) : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
