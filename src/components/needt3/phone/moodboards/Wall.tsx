"use client";

import type { CSSProperties } from "react";

import { LuLink, LuText } from "react-icons/lu";

import { hostOf } from "../../places/board/logic";
import { pkCx } from "../kit";
import { type PhoneBoardItem, itemName, wallColumns } from "./model";
import { useWallReorder } from "./useWallReorder";

/* The prototype's MbmMedia, read-only: the picture, the swatch, the link
   card, the note. The classes are the vendored mobile.css / phone-habits.css. */
/** The picture, the swatch, the link card or the note (MbmMedia). */
export function TileFace({ it, big }: { it: PhoneBoardItem; big?: boolean }) {
  const ratio = it.ratio || 1;
  if (it.kind === "image")
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a stored data/URL reference, sized by its own ratio
      <img
        src={it.url ?? ""}
        alt={it.title || ""}
        draggable={false}
        className="mbm-media-1"
        style={{ aspectRatio: String(1 / ratio), borderRadius: 18 }}
      />
    );
  if (it.kind === "color")
    return (
      <span
        className={pkCx("mbm-media-2", big && "is-big")}
        style={
          {
            aspectRatio: String(1 / ratio),
            borderRadius: 18,
            "--swatch": it.color,
          } as CSSProperties
        }
      >
        <span className="mbm-media-3">
          <span className="mbm-media-name">{it.colorName || "Colour"}</span>
          <span className="mbm-media-4">
            {String(it.color || "").toUpperCase()}
          </span>
        </span>
      </span>
    );
  if (it.kind === "link") {
    const domain = it.source?.domain || "";
    return (
      <span
        className={pkCx("mbm-media-5", big && "is-big")}
        style={{ borderRadius: 18 }}
      >
        {it.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote preview image of unknown size
          <img
            src={it.thumbnailUrl}
            alt=""
            className="mbm-media-6"
            style={{ aspectRatio: String(1 / ratio) }}
          />
        ) : null}
        <span className="mbm-media-9">
          <span className="mbm-media-10">{it.title || domain}</span>
          <span className="mbm-media-11">
            <LuLink size={11} aria-hidden />
            {domain}
          </span>
        </span>
      </span>
    );
  }
  return (
    <span
      className={pkCx("mbm-media-12", big && "is-big")}
      style={{ borderRadius: 18 }}
    >
      <span className="mbm-media-13">{it.text}</span>
      <span className="mbm-media-11">
        <LuText size={11} aria-hidden />
        Note
      </span>
    </span>
  );
}

/**
 * The wall (phone-habits.jsx PhbWall): a board's references in two columns,
 * each into the shorter one. With `canEdit`, hold a tile to lift it and drag
 * it among the others (`useWallReorder`: transform-only, cancel never
 * commits); a hold that does not move opens the tile's actions. Tiles from
 * the old canvas never lift. A tap calls `onOpen` when the screen gives one.
 */
export function Wall({
  items,
  onOpen,
  canEdit = false,
  onOrder,
  onHold,
}: {
  items: readonly PhoneBoardItem[];
  onOpen?: (it: PhoneBoardItem) => void;
  canEdit?: boolean;
  /** The new order of the board's own references (every id). */
  onOrder?: (order: string[]) => Promise<unknown> | void;
  onHold?: (it: PhoneBoardItem) => void;
}) {
  const own = items.filter((i) => !i.fromCanvas);
  const byId = new Map(items.map((i) => [i.id, i]));
  const wall = useWallReorder({
    ids: own.map((i) => i.id),
    canLift: (id) => canEdit && !byId.get(id)?.fromCanvas,
    onOrder: (order) => onOrder?.(order),
    onHold: (id) => {
      const it = byId.get(id);
      if (it) onHold?.(it);
    },
  });
  const shown = wall.order
    ? [
        ...wall.order.map((id) => byId.get(id)).filter(Boolean),
        ...items.filter((i) => i.fromCanvas),
      ]
    : items;
  const cols = wallColumns(shown as PhoneBoardItem[]);
  return (
    <div
      ref={wall.boxRef}
      className={pkCx("phb-wall", wall.lift != null && "is-lifting")}
      data-phb-wall=""
    >
      {cols.map((col, ci) => (
        <div key={ci} className="phb-col">
          {col.map((it) => {
            const caption =
              it.kind === "image" && it.title ? (
                <span className="phb-tile-cap">
                  <span>{it.title}</span>
                </span>
              ) : null;
            return onOpen ? (
              <button
                key={it.id}
                type="button"
                className={pkCx("phb-tile", wall.lift === it.id && "is-lifted")}
                data-phb-item={it.id}
                aria-label={`Open ${itemName(it)}`}
                onClick={() => onOpen(it)}
                onClickCapture={wall.onClickCapture}
                onPointerDown={(e) => wall.onPointerDown(e, it.id)}
                onContextMenu={(e) => wall.onContextMenu(e, it.id)}
              >
                <TileFace it={it} />
                {caption}
              </button>
            ) : (
              <div key={it.id} className="phb-tile" data-phb-item={it.id}>
                <TileFace it={it} />
                {caption}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const CELL_HUES = [
  "var(--hue-orange)",
  "var(--hue-blue)",
  "var(--hue-green)",
  "var(--hue-violet)",
  "var(--hue-yellow)",
  "var(--hue-pink)",
];

/** mbmHue: the same site always gets the same hue. */
function cellHue(domain: string | null) {
  let h = 0;
  const s = domain ?? "";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return CELL_HUES[Math.abs(h) % CELL_HUES.length];
}

/** A board card's cover: four cells of its first references (MbmCover). */
export function BoardCover({
  items,
}: {
  items: readonly Pick<
    PhoneBoardItem,
    "kind" | "url" | "thumbnailUrl" | "color" | "text"
  >[];
}) {
  const four = items.slice(0, 4);
  return (
    <span className="mbm-cover-1" aria-hidden="true">
      {[0, 1, 2, 3].map((k) => {
        const it = four[k];
        if (!it) return <span key={k} className="mb-cell-1" />;
        if (it.kind === "image" || (it.kind === "link" && it.thumbnailUrl))
          return (
            // eslint-disable-next-line @next/next/no-img-element -- a stored reference, cropped by its cell
            <img
              key={k}
              src={(it.kind === "image" ? it.url : it.thumbnailUrl) ?? ""}
              alt=""
              className="mb-cell-2"
            />
          );
        if (it.kind === "color")
          return (
            <span
              key={k}
              className="mb-cell-5"
              style={{ "--swatch": it.color } as CSSProperties}
            />
          );
        if (it.kind === "link")
          return (
            <span
              key={k}
              className="mb-cell-3"
              style={{ "--hue": cellHue(hostOf(it.url)) } as CSSProperties}
            >
              <LuLink size={16} aria-hidden />
            </span>
          );
        return (
          <span key={k} className="mb-cell-4">
            {it.text}
          </span>
        );
      })}
    </span>
  );
}
