"use client";

import type { CSSProperties } from "react";

import { LuStar } from "react-icons/lu";

import type { V3Doc } from "@/lib/needt3/map";

import { DcCover } from "../../docs/DocParts";
import { backdropVars } from "../../docs/backdrop";
import { type TokenReader, fontOf, pageVars, styleOf } from "../../docs/style";
import { PkHold } from "../kit/Hold";
import { pkCx } from "../kit/util";
import { cardMeta } from "./logic";

const MINI_W = 148;
const MINI_SCALE = 0.5;

/**
 * The card's picture (phone-docs.jsx `PdCardPage` 238): the document's
 * backdrop as the frame, its page inside in its own colour with the cover on
 * top, and the title set in the page's own ink and font at half size.
 * //todo: the page's first blocks in miniature (`PdMini`): the list API
 * sends no block content, so only the title is real here.
 */
function CardPicture({ doc, read }: { doc: V3Doc; read: TokenReader }) {
  const s = styleOf(doc);
  const bd = s.backdrop !== "none";
  const font = fontOf(s.font);
  const width = bd ? 128 : MINI_W;
  return (
    <span
      className={pkCx("pd-card-pic", bd && "has-bd")}
      aria-hidden="true"
      style={bd ? backdropVars(s.backdrop, read) : undefined}
    >
      <span className="dt-themed pd-card-page" style={pageVars(s, read)}>
        {s.cover ? (
          <span className="pd-card-cover">
            <DcCover cover={s.cover} />
          </span>
        ) : null}
        <span className="pd-card-mini">
          <span
            className="docs-mini-doc-1"
            style={
              {
                width: width / MINI_SCALE,
                transform: `scale(${MINI_SCALE})`,
                fontFamily: font.css,
              } as CSSProperties
            }
          >
            <span
              className={
                "docs-mini-doc-2 docs-mini-doc-s1" + (doc.title ? " is-on" : "")
              }
            >
              {doc.title || "Untitled"}
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}

/**
 * A doc on the phone's Docs home (phone-docs.jsx `PdCard` 1498): the picture
 * and its title and meta. Tap opens; a long press (PkHold, or a right click)
 * hands the doc to `onHold`.
 */
export function DocCard({
  doc,
  read,
  project,
  now,
  onOpen,
  onHold,
}: {
  doc: V3Doc;
  read: TokenReader;
  project: { name: string; color: string | null } | null;
  now: number;
  onOpen: (doc: V3Doc) => void;
  onHold: (doc: V3Doc) => void;
}) {
  const meta = cardMeta(doc, project, now);
  return (
    <PkHold onHold={() => onHold(doc)} data={{ role: "listitem" }}>
      <button
        type="button"
        className="pd-card"
        data-pd-card={doc.id}
        onClick={() => onOpen(doc)}
      >
        <CardPicture doc={doc} read={read} />
        <span className="pd-card-text">
          <span className={pkCx("pd-card-title", !doc.title && "is-untitled")}>
            {doc.isFavorite ? (
              <span className="pd-pin" role="img" aria-label="Pinned">
                <LuStar size={12} aria-hidden />
              </span>
            ) : null}
            {doc.title || "Untitled"}
          </span>
          <span className="pd-card-meta">
            {meta.project ? (
              <span className="pd-card-proj">
                <span
                  className="pk-hue"
                  style={
                    {
                      "--hue": meta.project.color ?? "var(--v2p-ink-3)",
                    } as CSSProperties
                  }
                />
                {meta.project.name}
              </span>
            ) : null}
            {meta.age ? <span>{meta.age}</span> : null}
          </span>
        </span>
      </button>
    </PkHold>
  );
}
