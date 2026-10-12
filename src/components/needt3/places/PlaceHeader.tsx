"use client";

import type { ReactNode } from "react";

import { Art, type ArtName } from "../menu/Art";

/**
 * The place's picture (or a "+" button), the title and one quiet line
 * (places.jsx `PlaceHeader`).
 * Templates and Shared open on the painted-sky banner instead (`PlSceneHeader`).
 */
export function PlaceHeader({
  art,
  title,
  meta,
  actions,
  add,
}: {
  art: ArtName;
  /** A string, or a node (a board's title is editable in place). */
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  add?: ReactNode;
}) {
  return (
    <header className="pl-place-header-row">
      {add ?? <Art name={art} size={30} />}
      <h1
        className="pl-place-header-text"
        title={typeof title === "string" ? title : undefined}
      >
        {title}
      </h1>
      {meta ? <span className="pl-place-header-text-2">{meta}</span> : null}
      <span className="pl-place-header-row-2">{actions}</span>
    </header>
  );
}
