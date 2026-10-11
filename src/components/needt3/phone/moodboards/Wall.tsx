"use client";

import type { CSSProperties } from "react";

import { LuLink, LuText } from "react-icons/lu";

import { pkCx } from "../kit";
import { type PhoneBoardItem, itemName, wallColumns } from "./model";

/* The prototype's MbmMedia, read-only: the picture, the swatch, the link
   card, the note. The classes are the vendored mobile.css / phone-habits.css. */
function TileFace({ it }: { it: PhoneBoardItem }) {
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
        className="mbm-media-2"
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
      <span className="mbm-media-5" style={{ borderRadius: 18 }}>
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
    <span className="mbm-media-12" style={{ borderRadius: 18 }}>
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
 * each into the shorter one. Read-only: the hold-to-lift reorder and every
 * write need the references route, which does not exist yet (data map §7).
 * A tap calls `onOpen` when the screen gives one.
 */
export function Wall({
  items,
  onOpen,
}: {
  items: readonly PhoneBoardItem[];
  onOpen?: (it: PhoneBoardItem) => void;
}) {
  const cols = wallColumns(items);
  return (
    <div className="phb-wall" data-phb-wall="">
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
                className={pkCx("phb-tile")}
                data-phb-item={it.id}
                aria-label={`Open ${itemName(it)}`}
                onClick={() => onOpen(it)}
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

/** A board card's cover: four cells of its first references (MbmCover). */
export function BoardCover({ items }: { items: readonly PhoneBoardItem[] }) {
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
            <span key={k} className="mb-cell-3">
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
